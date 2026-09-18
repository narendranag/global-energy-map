"""Build the US shale-region layer from EIA STEO + DPR counties + Census shapes.

Outputs
    public/data/shale_regions.geojson      five region polygons (dissolved counties)
    public/data/shale_region_year.parquet  annual production per region, history only

The regions are EIA's, defined by county lines rather than geology: a region
is every county in the DPR ``RegionCounties`` list, so its outline follows
county borders and includes production from any formation in those counties.
That is what STEO's numbers measure, so it is what we draw — not a geological
play outline, which would imply a precision the numbers do not have.

STEO series mix history and forecast. Everything after the pin's
``history_through_year`` is dropped; if the pin says a year is history but the
data does not reach it, the build fails rather than shipping a short series.

Units: crude in kb/d (STEO reports million b/d; ×1000 matches
country_year_series' ``production_crude_kbpd``), marketed gas in bcf/d as EIA
publishes it.

Usage:
    uv run python -m scripts.transform.build_shale_regions
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import geopandas as gpd
import pandas as pd
import shapely

from scripts.common.sources import CENSUS_COUNTIES, EIA_DPR_COUNTIES, EIA_STEO
from scripts.ingest.eia_steo import REGIONS, STEO_FILE

RAW_DIR = EIA_STEO.raw_dir
OUT_GEOJSON = Path("public/data/shale_regions.geojson")
OUT_PARQUET = Path("public/data/shale_region_year.parquet")
SOURCE = EIA_STEO.name
SOURCE_VERSION = f"STEO {EIA_STEO.release}"

# region_id → (display name, DPR sheet label).
REGION_NAMES: dict[str, tuple[str, str]] = {
    "permian": ("Permian", "Permian Region"),
    "bakken": ("Bakken", "Bakken Region"),
    "eagle_ford": ("Eagle Ford", "Eagle Ford Region"),
    "haynesville": ("Haynesville", "Haynesville Region"),
    "appalachia": ("Appalachia", "Appalachia Region"),
}

# STEO series prefix → (metric, unit, multiplier to that unit).
METRICS: dict[str, tuple[str, str, float]] = {
    "COPR": ("crude_production_kbpd", "kb/d", 1000.0),
    "NGMP": ("gas_marketed_bcfd", "bcf/d", 1.0),
}

# ~1 km: county lines at 1:20m are already coarse; this only trims vertices.
SIMPLIFY_TOLERANCE = 0.01
COORD_GRID = 1e-4


def _county_key(state: str, name: str) -> str:
    """ "TX|DEWITT" for "DeWitt" / "DE WITT"; "Saint" and "St." both → ST."""
    norm = re.sub(r"[^A-Z]", "", str(name).upper().replace("SAINT", "ST"))
    return f"{state.strip().upper()}|{norm}"


def region_counties(dpr: pd.DataFrame) -> pd.DataFrame:
    """DPR county rows for the regions STEO still reports, keyed for the Census join."""
    label_to_id = {label: rid for rid, (_, label) in REGION_NAMES.items()}
    out = dpr[dpr["Region"].isin(label_to_id)].copy()
    out["region_id"] = out["Region"].map(label_to_id)
    out["key"] = [_county_key(s, c) for s, c in zip(out["State"], out["County"], strict=True)]
    return out[["region_id", "key"]]


def region_shapes(counties: gpd.GeoDataFrame, members: pd.DataFrame) -> gpd.GeoDataFrame:
    """Dissolve member counties into one (Multi)Polygon per region."""
    counties = counties.assign(
        key=[_county_key(s, n) for s, n in zip(counties["STUSPS"], counties["NAME"], strict=True)]
    )
    joined = members.merge(counties[["key", "geometry"]], on="key", how="left")
    missing = joined[joined["geometry"].isna()]
    if not missing.empty:
        raise SystemExit(f"DPR counties with no Census polygon: {missing['key'].tolist()}")
    gdf = gpd.GeoDataFrame(joined, geometry="geometry", crs=counties.crs).to_crs("EPSG:4326")
    rows = []
    for rid, group in gdf.groupby("region_id", sort=False):
        geom = shapely.union_all(group.geometry.values)
        geom = geom.simplify(SIMPLIFY_TOLERANCE, preserve_topology=True)
        geom = shapely.set_precision(geom, COORD_GRID)
        rows.append(
            {
                "region_id": rid,
                "name": REGION_NAMES[str(rid)][0],
                "counties": len(group),
                "geometry": geom,
            }
        )
    order = list(REGION_NAMES)
    rows.sort(key=lambda r: order.index(r["region_id"]))
    return gpd.GeoDataFrame(rows, geometry="geometry", crs="EPSG:4326")


def production(steo: dict, history_through: int) -> pd.DataFrame:
    """Long table of historical annual production; forecasts dropped."""
    code_to_region = {code: rid for rid, code in REGIONS.items()}
    out = []
    for row in steo["data"]:
        sid = str(row["seriesId"])
        prefix, code = sid[:4], sid[4:]
        if prefix not in METRICS or code not in code_to_region:
            continue
        year = int(row["period"])
        if year > history_through or row["value"] in (None, ""):
            continue
        metric, unit, mult = METRICS[prefix]
        out.append(
            {
                "region_id": code_to_region[code],
                "year": year,
                "metric": metric,
                "value": round(float(row["value"]) * mult, 4),
                "unit": unit,
                "source": SOURCE,
                "source_version": SOURCE_VERSION,
            }
        )
    df = pd.DataFrame(out)
    if df.empty:
        raise SystemExit("no STEO rows parsed")
    for (rid, metric), g in df.groupby(["region_id", "metric"]):
        if g["year"].max() < history_through:
            raise SystemExit(
                f"{rid}/{metric} ends {g['year'].max()}, but the pin says history runs "
                f"through {history_through} — stale raw file or wrong pin"
            )
    return df.sort_values(["region_id", "metric", "year"]).reset_index(drop=True)


def _write_geojson(gdf: gpd.GeoDataFrame, path: Path) -> None:
    """Stable bytes: fixed key order and coordinate grid, no CRS member."""
    features = [
        {
            "type": "Feature",
            "properties": {
                "region_id": r.region_id,
                "name": r.name,
                "counties": int(r.counties),
            },
            "geometry": shapely.geometry.mapping(r.geometry),
        }
        for r in gdf.itertuples()
    ]
    fc = {"type": "FeatureCollection", "features": features}
    path.write_text(json.dumps(fc, separators=(",", ":")) + "\n")


def main() -> None:
    steo_path = RAW_DIR / STEO_FILE
    dpr_path = RAW_DIR / EIA_DPR_COUNTIES.dest_filename
    census_path = RAW_DIR / CENSUS_COUNTIES.dest_filename
    for p in (steo_path, dpr_path, census_path):
        if not p.exists():
            sys.exit(f"missing {p} — run `uv run python -m scripts.ingest.eia_steo` first")

    history_through = int(EIA_STEO.extra["history_through_year"])
    df = production(json.loads(steo_path.read_text()), history_through)
    members = region_counties(pd.read_excel(dpr_path, sheet_name="RegionCounties"))
    shapes = region_shapes(gpd.read_file(f"zip://{census_path}"), members)

    OUT_PARQUET.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(OUT_PARQUET, index=False, compression="zstd")
    _write_geojson(shapes, OUT_GEOJSON)
    print(
        f"wrote {OUT_PARQUET}  rows={len(df)}  years={df['year'].min()}…{df['year'].max()}\n"
        f"wrote {OUT_GEOJSON}  regions={len(shapes)}  counties={int(shapes['counties'].sum())}  "
        f"bytes={OUT_GEOJSON.stat().st_size:,}"
    )


if __name__ == "__main__":
    main()
