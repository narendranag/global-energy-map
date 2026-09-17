"""Transform GEM Oil + Gas pipeline GeoJSON → pipelines GeoParquet + GeoJSON sidecar.

Outputs:
  data/derived/pipelines.parquet   full-resolution GeoParquet (gitignored; not
                                   shipped — the runtime has no consumer for it)
  public/data/pipelines.geojson    simplified sidecar the PipelinesLayer fetches

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

import json
import sys
from pathlib import Path

import geopandas as gpd
import pandas as pd
import shapely
from shapely.geometry.collection import GeometryCollection

from scripts.common.iso3 import gem_endpoints_iso3
from scripts.common.paths import latest
from scripts.common.sources import GEM_GGIT, GEM_GOIT, GEM_ROUTES

OUT = Path("data/derived/pipelines.parquet")
OUT_GEOJSON = Path("public/data/pipelines.geojson")

OIL_RAW_DIR = GEM_GOIT.raw_dir
GAS_RAW_DIR = GEM_GGIT.raw_dir
ROUTES_RAW_DIR = GEM_ROUTES.raw_dir

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
    src = latest(OIL_RAW_DIR, "*.geojson")

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

    iso3_pairs = g["areas"].apply(gem_endpoints_iso3)
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
    src = latest(GAS_RAW_DIR, "*.geojson")

    print(f"[gas] reading {src} …", file=sys.stderr)
    with open(src) as fh:
        raw = json.load(fh)

    # Filter to GGIT (gas pipeline) features only — exclude LNG terminal variants
    pipeline_features = [
        f for f in raw["features"] if (f.get("properties") or {}).get("tracker-custom") == "GGIT"
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
    iso3_pairs = g["areas"].apply(gem_endpoints_iso3)
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
# Route geometry overlay
# ---------------------------------------------------------------------------


def load_route_geometries(routes_dir: Path | None = None) -> dict[str, object]:
    """``{pipeline_id: geometry}`` from GEM's pipeline-routes repo.

    GEM's tracker snapshots and its route repo have drifted apart: the CDN
    that served the snapshots is gone (docs/refresh.md), while the route repo
    is still maintained, so its geometry is current and full-resolution where
    the snapshot's is neither.

    The repo gives every project a file even when it has no route — a capacity
    expansion with no new pipe, or one nobody has traced yet — writing
    ``"geometry": null``. Those are skipped here so the caller falls back to
    the snapshot geometry rather than blanking the pipeline.
    """
    routes_dir = routes_dir or ROUTES_RAW_DIR
    out: dict[str, object] = {}
    for path in sorted(routes_dir.rglob("*.geojson")):
        pipeline_id = path.stem
        # Compressor-station sidecars are points, not routes.
        if pipeline_id.endswith("-compressor-stations"):
            continue
        try:
            with open(path) as fh:
                fc = json.load(fh)
        except (OSError, json.JSONDecodeError):
            print(f"[routes] unreadable, skipping: {path}", file=sys.stderr)
            continue
        geoms = [
            shapely.geometry.shape(f["geometry"])
            for f in fc.get("features", [])
            if f.get("geometry")
        ]
        geoms = [g for g in geoms if not g.is_empty]
        if not geoms:
            continue
        out[pipeline_id] = geoms[0] if len(geoms) == 1 else shapely.union_all(geoms)
    return out


def apply_route_geometries(g: gpd.GeoDataFrame, routes: dict[str, object], label: str) -> None:
    """Swap in route-repo geometry where we have it, in place. Logs coverage."""
    ids = g["pipeline_id"]
    matched = ids.isin(routes.keys())
    g.loc[matched, "geometry"] = [routes[i] for i in ids[matched]]
    n, total = int(matched.sum()), len(g)
    print(
        f"[{label}] route geometry applied to {n}/{total} ({n / total:.1%}); "
        f"{total - n} keep their tracker-snapshot geometry",
        file=sys.stderr,
    )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def merge_line_parts(geoms: gpd.GeoSeries) -> gpd.GeoSeries:
    """Join each feature's contiguous line fragments into as few lines as its topology allows.

    `union_all` nodes the parts (dropping exact duplicates); `line_merge` then
    chains every run of degree-2 junctions into one LineString. Branching
    networks stay MultiLineStrings. Snapping near-miss endpoints was tried and
    adds junctions, so it is not done.
    """
    merged = [shapely.line_merge(shapely.union_all(shapely.get_parts(g))) for g in geoms.values]
    return gpd.GeoSeries(merged, index=geoms.index, crs=geoms.crs)


def main() -> None:
    oil = _load_oil_pipelines()
    print(f"oil rows: {len(oil)}", file=sys.stderr)

    gas = _load_gas_pipelines()
    print(f"gas rows: {len(gas)}", file=sys.stderr)

    routes = load_route_geometries()
    print(f"[routes] loaded {len(routes)} route geometries", file=sys.stderr)
    apply_route_geometries(oil, routes, "oil")
    apply_route_geometries(gas, routes, "gas")

    combined = gpd.GeoDataFrame(
        pd.concat([oil, gas], ignore_index=True),
        geometry="geometry",
        crs="EPSG:4326",
    )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT_GEOJSON.parent.mkdir(parents=True, exist_ok=True)
    combined.to_parquet(OUT, compression="zstd")
    print(
        f"wrote {OUT} "
        f"rows={len(combined)} "
        f"statuses={combined['status'].value_counts().to_dict()} "
        f"commodities={combined['commodity'].value_counts().to_dict()} "
        f"capacity_units={combined['capacity_unit'].value_counts().to_dict()}"
    )

    # GeoJSON sidecar — columns needed for map layer + tooltip.
    # Geometry is merged, then simplified at tolerance 0.005 (roughly 500 m,
    # well below typical pixel resolution at country zoom). GGIT ships some
    # networks as tens of thousands of 2-point fragments (Tennessee Gas
    # Pipeline: 62,967 parts); simplification cannot shorten a 2-point part,
    # and deck.gl draws every part as its own path, so merging contiguous
    # fragments first takes the sidecar from ~456k to ~235k vertices
    # (~14 MB → ~8 MB) and roughly halves the gas layer's frame time.
    # Full-resolution geometry is preserved in data/derived/pipelines.parquet.
    SIMPLIFY_TOLERANCE_DEG = 0.005
    geojson_cols = [
        "pipeline_id",
        "name",
        "status",
        "commodity",
        "capacity_kbpd",
        "capacity_unit",
        "start_country_iso3",
        "end_country_iso3",
        "operator",
        "start_year",
        "geometry",
    ]
    sidecar = combined[geojson_cols].copy()
    sidecar["geometry"] = merge_line_parts(sidecar.geometry).simplify(
        tolerance=SIMPLIFY_TOLERANCE_DEG, preserve_topology=True
    )
    # GEM's route repo stores coordinates at far more decimal places than the
    # CDN snapshots did. Writing them verbatim cost 35% more bytes (7.9 → 10.6
    # MB) for ~5% more vertices — precision, not detail. Six places is ~0.11 m,
    # still ~4,500x finer than the 500 m simplification above, so nothing
    # visible is lost and the sidecar stays the size it was. (Five places, ~1.1
    # m, is another 500 KB if the budget ever needs it.)
    COORDINATE_PRECISION = 6
    sidecar.to_file(OUT_GEOJSON, driver="GeoJSON", COORDINATE_PRECISION=COORDINATE_PRECISION)
    print(
        f"wrote {OUT_GEOJSON} ({OUT_GEOJSON.stat().st_size // 1024} KB; "
        f"simplified at tolerance={SIMPLIFY_TOLERANCE_DEG}, "
        f"coordinate precision={COORDINATE_PRECISION})"
    )


if __name__ == "__main__":
    main()
