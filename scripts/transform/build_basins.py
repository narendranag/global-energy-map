"""Transform NETL basins GeoJSON → basins GeoParquet + sidecar GeoJSON.

Outputs:
  data/derived/basins.parquet   GeoParquet (gitignored; not shipped — the
                                runtime has no consumer for it)
  public/data/basins.geojson    sidecar the BasinPolygonsLayer fetches
Both carry the same ~1 km simplified geometry.

Probe findings (2026-05-17):
  Raw columns: fid, md_source1, onshore_of, available, md_country, basin_id,
               type, md_region, shape_leng, reg_tl_nam, md_tempora, shape_le_1,
               subreg_grp, max_fillkm, md_source, SHAPE__Area, owner,
               sub_regime, area_km2, sour_ranks, numbersour, temp_ranks,
               facility_n, md_source_, installati, subregcode, reg_tl_abv,
               md_spatial, md_fkey, spat_ranks, SHAPE__Length, geometry

  - basin_id: NETL stable ID (870/1046 non-empty; blank rows kept with empty str)
  - reg_tl_nam: region/territory label — used as basin name (774/1046 non-empty)
  - area_km2: present but 272 rows are 0.0 — those become None
  - md_country: semicolon-delimited; NETL uses UN-style names ("Russian Federation")
  - md_region: NETL region field

Output schema:
    basin_id (str)         NETL basin_id
    name (str|null)        reg_tl_nam where non-empty
    country_iso3 (str|null) First country from md_country (semicolon-split)
    area_km2 (float|null)  area_km2 from source; 0.0 coerced to null
    region (str|null)      NETL md_region
    geometry (Polygon | MultiPolygon)  — simplified to ~1 km tolerance
    source                 "NETL Global Oil and Gas Infrastructure (GOGI)"
    source_version         NETL snapshot retrieval date (SOURCE_VERSION constant)

Usage:
    uv run python -m scripts.transform.build_basins
"""
from __future__ import annotations

import sys
from pathlib import Path

import geopandas as gpd
import pandas as pd
from shapely.geometry.collection import GeometryCollection

from scripts.common.iso3 import NETL_NAME_TO_ISO3

SRC = Path("data/raw/netl/basins.geojson")
OUT = Path("data/derived/basins.parquet")
OUT_GEOJSON = Path("public/data/basins.geojson")
SOURCE = "NETL Global Oil and Gas Infrastructure (GOGI)"
# NETL serves GOGI from an unversioned live ArcGIS FeatureServer; the snapshot
# in data/raw/netl/ was retrieved on this date. A constant (not date.today())
# keeps rebuilds byte-stable. Update it when the raw snapshot is re-ingested.
SOURCE_VERSION = "2026-05-17"

# Geometry simplification tolerance in decimal degrees (~1 km at the equator).
# Basins are continent-scale polygons; we don't need pipeline-grade precision
# in the browser-shipped sidecar.
SIMPLIFY_TOLERANCE = 0.01


def _country_iso3(md_country: str | None) -> str | None:
    """First country from semicolon-delimited md_country, mapped to ISO3."""
    if not isinstance(md_country, str) or not md_country.strip():
        return None
    first = md_country.split(";")[0].strip()
    # Handle escaped single-quotes from GeoJSON (e.g. "Cote D''Ivoire")
    first = first.replace("''", "'")
    return NETL_NAME_TO_ISO3.get(first)


def _nullable_area(area_km2: float | None) -> float | None:
    """Return None for zero or missing area values."""
    if area_km2 is None or (isinstance(area_km2, float) and area_km2 == 0.0):
        return None
    return area_km2


def _name_or_none(val: str | None) -> str | None:
    """Return None for blank/whitespace strings."""
    if not isinstance(val, str) or not val.strip():
        return None
    return val.strip()


def main() -> None:
    if not SRC.exists():
        sys.exit(f"missing {SRC} — run scripts.ingest.netl_basins first")

    gdf = gpd.read_file(SRC)
    print(f"loaded {len(gdf)} raw features", file=sys.stderr)

    # Drop empty/null/collection geometries (GeometryCollection can't be
    # rendered as Polygon/MultiPolygon in deck.gl's PolygonLayer)
    gdf = gdf[~gdf.geometry.apply(lambda g: isinstance(g, GeometryCollection))]
    gdf = gdf[gdf.geometry.notna() & ~gdf.geometry.is_empty].copy()
    print(f"after geometry filter: {len(gdf)}", file=sys.stderr)

    # Simplify geometries for browser-friendly sidecar size
    print(
        f"simplifying with tolerance={SIMPLIFY_TOLERANCE} deg (~1 km)",
        file=sys.stderr,
    )
    gdf.geometry = gdf.geometry.simplify(
        tolerance=SIMPLIFY_TOLERANCE,
        preserve_topology=True,
    )

    # Build output dataframe
    basin_ids = gdf["basin_id"].astype(str).str.strip()
    names = gdf["reg_tl_nam"].map(_name_or_none) if "reg_tl_nam" in gdf.columns else None
    country_iso3s = gdf["md_country"].map(_country_iso3)
    areas = (
        gdf["area_km2"].map(lambda v: _nullable_area(float(v)) if pd.notna(v) else None)
        if "area_km2" in gdf.columns
        else None
    )
    regions = gdf["md_region"] if "md_region" in gdf.columns else None

    out = gpd.GeoDataFrame(
        {
            "basin_id": basin_ids,
            "name": names,
            "country_iso3": country_iso3s,
            "area_km2": areas,
            "region": regions,
            "source": SOURCE,
            "source_version": SOURCE_VERSION,
        },
        geometry=gdf.geometry.values,
        crs="EPSG:4326",
    )

    # ISO3 hit-rate diagnostics
    total = len(out)
    hits = out["country_iso3"].notna().sum()
    misses = out[out["country_iso3"].isna() & out["basin_id"].str.strip().ne("")]
    print(
        f"country_iso3 hit rate: {hits}/{total} = {hits/total*100:.1f}%",
        file=sys.stderr,
    )
    if not misses.empty:
        miss_countries = (
            gdf.loc[misses.index, "md_country"]
            .str.split(";")
            .str[0]
            .str.strip()
            .value_counts()
            .head(10)
        )
        print(f"top missed countries:\n{miss_countries}", file=sys.stderr)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT_GEOJSON.parent.mkdir(parents=True, exist_ok=True)
    out.to_parquet(OUT, compression="zstd")
    out.to_file(OUT_GEOJSON, driver="GeoJSON")

    parquet_mb = OUT.stat().st_size / 1_048_576
    geojson_mb = OUT_GEOJSON.stat().st_size / 1_048_576
    print(
        f"wrote {OUT} ({parquet_mb:.1f} MB) + {OUT_GEOJSON} ({geojson_mb:.1f} MB)"
        f"  rows={len(out)}"
    )


if __name__ == "__main__":
    main()
