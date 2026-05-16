"""Transform GEM Oil + Gas pipeline GeoJSON → pipelines.parquet (GeoParquet).

Oil source:  data/raw/gem_oil_infra/*.geojson  (GEM Global Oil Infrastructure Tracker)
Gas source:  data/raw/gem_gas_infra/ggit_map_*.geojson  (GEM Global Gas Infrastructure Tracker)
             Features where tracker-custom == "GGIT" are gas pipelines.

Filters: operating + construction statuses; valid LineString/MultiLineString geometries.

Output schema (both commodity rows):
  pipeline_id (str)          GEM id field
  name (str)
  status (str)               "operating" | "in-construction"   (normalized)
  commodity (str)            "crude" | "ngl" | "crude+ngl" | "gas"
  capacity_kbpd (float|null) kbpd for oil rows; bcm/y for gas rows — see capacity_unit
  capacity_unit (str)        "kbpd" for oil; "bcm/y" for gas
  units_of_m (str|null)      raw units string from source
  country_iso3_areas (str|null)  ISO3 of first country parsed from `areas`
  start_country_iso3 (str|null)  same as country_iso3_areas (alias for clarity)
  end_country_iso3 (str|null)    ISO3 of last country in `areas`
  operator (str|null)
  start_year (int|null)
  geometry                   LineString or MultiLineString
  source (str)
  source_version (str)       filename

Note on capacity: `capacity_kbpd` is preserved as the column name for back-compat
with Phase 2 frontend code. For gas rows the value is raw bcm/y — no unit conversion.
The `capacity_unit` column tells the frontend which label to display.

Note on GEM status field:
  The `status` column uses simple values: "operating", "construction", "proposed", etc.
  We filter on `status` (canonical machine value) per plan instructions.

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

OUT = Path("public/data/pipelines.parquet")
OUT_GEOJSON = Path("public/data/pipelines.geojson")

OIL_RAW_DIR = Path("data/raw/gem_oil_infra")
GAS_RAW_DIR = Path("data/raw/gem_gas_infra")

OIL_SOURCE = "Global Energy Monitor — Global Oil Infrastructure Tracker"
GAS_SOURCE = "Global Energy Monitor — Global Gas Infrastructure Tracker"

# GEM status values we keep (from `status` column), mapped to normalized labels.
STATUS_MAP: dict[str, str] = {
    "operating": "operating",
    "construction": "in-construction",
}


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _filter_geometry(g: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Drop GeometryCollections, null, and empty geometries."""
    g = g[~g.geometry.apply(lambda x: isinstance(x, GeometryCollection))].copy()
    g = g[g.geometry.notna() & ~g.geometry.is_empty].copy()
    return g


def _parse_areas_iso3(areas: str | None) -> tuple[str | None, str | None]:
    """Return (start_iso3, end_iso3) from a semicolon-separated areas string.

    Gas GeoJSON uses semicolons; oil uses semicolons too.  Takes first country
    as start and last (if different) as end.  Returns None for unresolved names.
    """
    if not isinstance(areas, str) or not areas.strip():
        return None, None
    parts = [p.strip() for p in areas.split(";") if p.strip()]
    start = GEM_NAME_TO_ISO3.get(parts[0]) if parts else None
    end = GEM_NAME_TO_ISO3.get(parts[-1]) if len(parts) > 1 else None
    return start, end


# ---------------------------------------------------------------------------
# Oil pipeline loader (existing logic, refactored into helper)
# ---------------------------------------------------------------------------

def _normalize_oil_capacity(row: pd.Series) -> float | None:
    """Convert oil capacity to kbpd. Units in GEM are typically 'boe/d' or 'kbpd'."""
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
    return v / 1000.0


def _fuel_to_commodity(v: object) -> str:
    s = str(v or "").strip().lower()
    if "oil" in s and "ngl" in s:
        return "crude+ngl"
    if "ngl" in s:
        return "ngl"
    if "oil" in s:
        return "crude"
    return "other"


def _load_oil_pipelines() -> gpd.GeoDataFrame:
    """Load and process GEM oil infrastructure GeoJSON → GeoDataFrame."""
    src = next(OIL_RAW_DIR.glob("*.geojson"), None)
    if src is None:
        sys.exit("no GEM oil infra geojson — run scripts.ingest.gem_oil_infra first")

    g = gpd.read_file(src)
    print(f"[oil] loaded {len(g)} features", file=sys.stderr)

    g = _filter_geometry(g)
    print(f"[oil] after geometry filter: {len(g)}", file=sys.stderr)

    g = g[g["status"].isin(STATUS_MAP.keys())].copy()
    g["status_norm"] = g["status"].map(STATUS_MAP)
    print(f"[oil] after status filter: {len(g)}", file=sys.stderr)

    g["commodity"] = g["Fuel"].map(_fuel_to_commodity)
    g = g[g["commodity"].isin(["crude", "ngl", "crude+ngl"])].copy()
    print(f"[oil] after commodity filter: {len(g)}", file=sys.stderr)

    g["capacity_kbpd"] = g.apply(_normalize_oil_capacity, axis=1)

    def _areas_iso3(a: object) -> tuple[str | None, str | None]:
        return _parse_areas_iso3(a) if isinstance(a, str) else (None, None)

    iso3_pairs = g["areas"].apply(_areas_iso3)
    g["start_iso3"] = iso3_pairs.apply(lambda x: x[0])
    g["end_iso3"] = iso3_pairs.apply(lambda x: x[1])

    g["start_year_int"] = pd.to_numeric(g.get("start-year"), errors="coerce")

    out = gpd.GeoDataFrame(
        {
            "pipeline_id": g["id"].astype(str),
            "name": g["name"].astype(str),
            "status": g["status_norm"],
            "commodity": g["commodity"],
            "capacity_kbpd": g["capacity_kbpd"].astype("Float64"),
            "capacity_unit": "kbpd",
            "units_of_m": g["units-of-m"].astype(pd.StringDtype()),
            "country_iso3_areas": g["start_iso3"].astype(pd.StringDtype()),
            "start_country_iso3": g["start_iso3"].astype(pd.StringDtype()),
            "end_country_iso3": g["end_iso3"].astype(pd.StringDtype()),
            "operator": g["owner"].astype(pd.StringDtype()),
            "start_year": g["start_year_int"].astype("Int64"),
            "geometry": g.geometry,
            "source": OIL_SOURCE,
            "source_version": src.name,
        },
        geometry="geometry",
        crs=g.crs or "EPSG:4326",
    )
    return out


# ---------------------------------------------------------------------------
# Gas pipeline loader (new)
# ---------------------------------------------------------------------------

def _extract_gas_capacity(row: pd.Series) -> float | None:
    """Extract gas pipeline capacity in bcm/y from GEM gas GeoJSON properties.

    Priority:
      1. capacityinbcm/y  (always empty in Feb-2026 release, but check first)
      2. cleaned-cap      (pre-processed bcm/y value — present for 100 % of features)
      3. capacity         (raw field — also empty in this release)

    Returns None if no numeric value found.  DO NOT convert units — caller
    stores raw bcm/y in capacity_kbpd for back-compat; capacity_unit="bcm/y"
    disambiguates for the frontend.
    """
    for field in ("capacityinbcm/y", "cleaned-cap", "capacity"):
        v = row.get(field)
        if v is not None and v != "" and not (isinstance(v, float) and pd.isna(v)):
            try:
                return float(v)
            except (TypeError, ValueError):
                continue
    return None


def _load_gas_pipelines() -> gpd.GeoDataFrame:
    """Load GGIT gas pipeline features from GEM gas infrastructure GeoJSON."""
    src = next(GAS_RAW_DIR.glob("*.geojson"), None)
    if src is None:
        sys.exit("no GEM gas infra geojson — run scripts.ingest.gem_gas_infra first")

    import json

    print(f"[gas] reading {src} …", file=sys.stderr)
    with open(src) as fh:
        raw = json.load(fh)

    # Filter to GGIT (gas pipeline) features only — exclude LNG terminal variants
    pipeline_features = [
        f for f in raw["features"]
        if (f.get("properties") or {}).get("tracker-custom") == "GGIT"
    ]
    print(f"[gas] GGIT features: {len(pipeline_features)}", file=sys.stderr)

    g = gpd.GeoDataFrame.from_features(pipeline_features, crs="EPSG:4326")
    print(f"[gas] after from_features: {len(g)}", file=sys.stderr)

    g = _filter_geometry(g)
    print(f"[gas] after geometry filter: {len(g)}", file=sys.stderr)

    g = g[g["status"].isin(STATUS_MAP.keys())].copy()
    g["status_norm"] = g["status"].map(STATUS_MAP)
    print(f"[gas] after status filter: {len(g)}", file=sys.stderr)

    # Gas capacity — raw bcm/y value, no unit conversion
    g["capacity_bcm_y"] = g.apply(_extract_gas_capacity, axis=1)

    # Country ISO3 from semicolon-separated areas
    def _areas_iso3_gas(a: object) -> tuple[str | None, str | None]:
        return _parse_areas_iso3(a) if isinstance(a, str) else (None, None)

    iso3_pairs = g["areas"].apply(_areas_iso3_gas)
    g["start_iso3"] = iso3_pairs.apply(lambda x: x[0])
    g["end_iso3"] = iso3_pairs.apply(lambda x: x[1])

    g["start_year_int"] = pd.to_numeric(g.get("start-year"), errors="coerce")

    # Use pid as pipeline_id; operator field from gas data is 'operator'
    # (GEM gas uses 'operator' column, not 'owner')
    operator_col = "operator" if "operator" in g.columns else "owner"
    pid_col = "pid" if "pid" in g.columns else "id"

    out = gpd.GeoDataFrame(
        {
            "pipeline_id": g[pid_col].astype(str),
            "name": g["name"].astype(str),
            "status": g["status_norm"],
            "commodity": "gas",
            "capacity_kbpd": g["capacity_bcm_y"].astype("Float64"),
            "capacity_unit": "bcm/y",
            "units_of_m": pd.array(["bcm/y of gas"] * len(g), dtype=pd.StringDtype()),
            "country_iso3_areas": g["start_iso3"].astype(pd.StringDtype()),
            "start_country_iso3": g["start_iso3"].astype(pd.StringDtype()),
            "end_country_iso3": g["end_iso3"].astype(pd.StringDtype()),
            "operator": g[operator_col].astype(pd.StringDtype()),
            "start_year": g["start_year_int"].astype("Int64"),
            "geometry": g.geometry,
            "source": GAS_SOURCE,
            "source_version": src.name,
        },
        geometry="geometry",
        crs=g.crs or "EPSG:4326",
    )
    return out


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    oil = _load_oil_pipelines()
    print(f"oil rows: {len(oil)}", file=sys.stderr)

    gas = _load_gas_pipelines()
    print(f"gas rows: {len(gas)}", file=sys.stderr)

    combined = gpd.GeoDataFrame(
        pd.concat([oil, gas], ignore_index=True),
        geometry="geometry",
        crs="EPSG:4326",
    )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    combined.to_parquet(OUT, compression="zstd")
    print(
        f"wrote {OUT} "
        f"rows={len(combined)} "
        f"statuses={combined['status'].value_counts().to_dict()} "
        f"commodities={combined['commodity'].value_counts().to_dict()} "
        f"capacity_units={combined['capacity_unit'].value_counts().to_dict()}"
    )

    # GeoJSON sidecar — columns needed for map layer + tooltip
    geojson_cols = [
        "pipeline_id", "name", "status", "commodity",
        "capacity_kbpd", "capacity_unit", "start_country_iso3", "end_country_iso3",
        "operator", "start_year", "geometry",
    ]
    combined[geojson_cols].to_file(OUT_GEOJSON, driver="GeoJSON")
    print(f"wrote {OUT_GEOJSON} ({OUT_GEOJSON.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
