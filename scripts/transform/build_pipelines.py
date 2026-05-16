"""Transform GEM Oil Infrastructure Tracker GeoJSON → pipelines.parquet (GeoParquet).

Filters: operating + construction statuses; oil/NGL fuels;
valid LineString or MultiLineString geometries only.

Output schema:
  pipeline_id (str)    GEM id field
  name (str)
  status (str)         "operating" | "in-construction"   (normalized)
  commodity (str)      "crude" | "ngl" | "crude+ngl"
  capacity_kbpd (float|null)
  units_of_m (str|null)
  country_iso3_areas (str|null)   ISO3 of first country parsed from `areas`
  operator (str|null)
  start_year (int|null)
  geometry              LineString or MultiLineString
  source                "Global Energy Monitor — Global Oil Infrastructure Tracker"
  source_version        filename

Note on GEM status field:
  The `status` column uses simple values: "operating", "construction", "proposed", etc.
  The `status-legend` column uses the `-plus` suffixed display values.
  We filter on `status` (the canonical machine value) per plan instructions.

Usage:
    uv run python -m scripts.transform.build_pipelines
"""
from __future__ import annotations

import sys
from pathlib import Path

import geopandas as gpd
import pandas as pd
from shapely.geometry.collection import GeometryCollection

from scripts.common.iso3 import GEM_NAME_TO_ISO3

RAW_DIR = Path("data/raw/gem_oil_infra")
OUT = Path("public/data/pipelines.parquet")
OUT_GEOJSON = Path("public/data/pipelines.geojson")
SOURCE = "Global Energy Monitor — Global Oil Infrastructure Tracker"

# GEM status values we keep (from `status` column), mapped to normalized labels.
# Actual values in the data: 'operating', 'construction' (not the -plus variants).
STATUS_MAP: dict[str, str] = {
    "operating": "operating",
    "construction": "in-construction",
}


def normalize_capacity(row: pd.Series) -> float | None:
    """Convert capacity to kbpd. Units in GEM are typically 'boe/d' or 'kbpd'."""
    cap = row.get("capacity")
    if cap is None or (isinstance(cap, float) and pd.isna(cap)):
        return None
    try:
        v = float(cap)
    except (TypeError, ValueError):
        return None
    units = str(row.get("units-of-m") or "").lower()
    if "kbpd" in units or "kb/d" in units or "thousand barrels" in units:
        return v
    if "bpd" in units or "boe/d" in units or "barrels" in units:
        return v / 1000.0
    # Fallback: assume bpd-equivalent
    return v / 1000.0


def first_iso3_from_areas(areas: str | None) -> str | None:
    """`areas` looks like 'Canada; United States;'. Map first to ISO3."""
    if not isinstance(areas, str) or not areas.strip():
        return None
    first = areas.split(";")[0].strip()
    return GEM_NAME_TO_ISO3.get(first)


def fuel_to_commodity(v: object) -> str:
    s = str(v or "").strip().lower()
    if "oil" in s and "ngl" in s:
        return "crude+ngl"
    if "ngl" in s:
        return "ngl"
    if "oil" in s:
        return "crude"
    return "other"


def main() -> None:
    src = next(RAW_DIR.glob("*.geojson"), None)
    if src is None:
        sys.exit("no GEM oil infra geojson — run scripts.ingest.gem_oil_infra first")

    g = gpd.read_file(src)
    print(f"loaded {len(g)} features", file=sys.stderr)

    # Drop GeometryCollections (invalid/empty in GEM data — 456 rows)
    g = g[~g.geometry.apply(lambda x: isinstance(x, GeometryCollection))].copy()
    # Drop rows with null or empty geometry
    g = g[g.geometry.notna() & ~g.geometry.is_empty].copy()
    print(f"after geometry filter: {len(g)}", file=sys.stderr)

    # Status filter — using `status` (machine value), not `status-legend`
    g = g[g["status"].isin(STATUS_MAP.keys())].copy()
    g["status_norm"] = g["status"].map(STATUS_MAP)
    print(f"after status filter: {len(g)}", file=sys.stderr)

    # Commodity from Fuel column
    g["commodity"] = g["Fuel"].map(fuel_to_commodity)
    g = g[g["commodity"].isin(["crude", "ngl", "crude+ngl"])].copy()
    print(f"after commodity filter: {len(g)}", file=sys.stderr)

    # Capacity normalization to kbpd
    g["capacity_kbpd"] = g.apply(normalize_capacity, axis=1)

    # Country lookup (best-effort; many pipelines cross borders)
    g["country_iso3_areas"] = g["areas"].apply(first_iso3_from_areas)

    # Start year
    g["start_year_int"] = pd.to_numeric(g.get("start-year"), errors="coerce")

    out = gpd.GeoDataFrame(
        {
            "pipeline_id": g["id"].astype(str),
            "name": g["name"].astype(str),
            "status": g["status_norm"],
            "commodity": g["commodity"],
            "capacity_kbpd": g["capacity_kbpd"].astype("Float64"),
            "units_of_m": g["units-of-m"].astype(pd.StringDtype()),
            "country_iso3_areas": g["country_iso3_areas"].astype(pd.StringDtype()),
            "operator": g["owner"].astype(pd.StringDtype()),
            "start_year": g["start_year_int"].astype("Int64"),
            "geometry": g.geometry,
            "source": SOURCE,
            "source_version": src.name,
        },
        geometry="geometry",
        crs=g.crs or "EPSG:4326",
    )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    out.to_parquet(OUT, compression="zstd")
    print(
        f"wrote {OUT} "
        f"rows={len(out)} "
        f"statuses={out['status'].value_counts().to_dict()} "
        f"commodities={out['commodity'].value_counts().to_dict()}"
    )

    # GeoJSON sidecar for browser consumption (avoids DuckDB-WASM spatial extension dependency)
    # Columns kept: only those needed for the map layer + tooltip (drop source metadata).
    geojson_cols = [
        "pipeline_id", "name", "status", "commodity",
        "capacity_kbpd", "operator", "start_year", "geometry",
    ]
    out[geojson_cols].to_file(OUT_GEOJSON, driver="GeoJSON")
    print(f"wrote {OUT_GEOJSON} ({OUT_GEOJSON.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
