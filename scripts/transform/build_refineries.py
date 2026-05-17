"""Transform NETL Refineries + OSM Overpass refineries → kind=refinery rows in assets.parquet.

NETL is the primary source (~2,272 features, government public-domain).
OSM is the supplement: any OSM refinery WITHOUT a NETL counterpart within
2 km in the same country is added.  See spec
docs/superpowers/specs/2026-05-17-global-energy-map-phase-5-design.md
for the empirical dedup threshold justification.

Country attribution:
  - NETL records: md_country → ISO3 via scripts.common.iso3.NETL_NAME_TO_ISO3.
  - OSM records: spatial join against public/data/countries.geojson.

Capacity:
  - NETL: parse string `capacity` field (97% pure numbers, 3% HTML-wrapped).
  - OSM:  parse `capacity` / `capacity:bpd` tags (existing behavior preserved).
  - Records without parseable capacity get NULL; scenario engine falls back
    to uniform-within-country attribution.

Output schema (matches existing assets.parquet shape, adds `source` column):
  asset_id, kind, name, country_iso3, lon, lat,
  capacity, capacity_unit, operator, status,
  commissioned_year, decommissioned_year,
  source, source_version

Usage:
    uv run python -m scripts.transform.build_refineries
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import geopandas as gpd
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
from shapely.geometry import Point

from scripts.common.iso3 import NETL_NAME_TO_ISO3
from scripts.transform._refinery_capacity import parse_netl_capacity_kbpd
from scripts.transform._refinery_dedup import osm_records_not_in_netl

OSM_CACHE = Path("data/raw/osm_refineries/refineries.json")
NETL_RAW = Path("data/raw/netl/refineries.geojson")
COUNTRIES = Path("public/data/countries.geojson")
ASSETS = Path("public/data/assets.parquet")

OSM_SOURCE = "OpenStreetMap (Overpass)"
NETL_SOURCE = "National Energy Technology Laboratory (US DOE) — GOGI Refineries"

# Reused from prior OSM-only implementation
REFINERY_NAME_KEYWORDS = [
    "refin", "raffinerie", "raffineri",
    "нпз", "нефтеперераб", "нафтопереробн",
    "oljraffinaderi", "petrokimia", "petrochemical",
    "refinaria", "rафинерия",
]


# ---------------------------------------------------------------------------
# OSM loader (preserved from prior implementation)
# ---------------------------------------------------------------------------

def _is_refinery_osm(element: dict) -> bool:
    tags = element.get("tags", {})
    ind = tags.get("industrial", "")
    name_haystack = (tags.get("name", "") + " " + tags.get("name:en", "")).lower()
    man_made = tags.get("man_made", "")
    etype = element["type"]

    if ind in ("oil_refinery", "refinery"):
        return True
    if ind == "oil":
        if any(kw in name_haystack for kw in REFINERY_NAME_KEYWORDS):
            return True
        if man_made == "works" and etype in ("way", "relation") and tags.get("name"):
            return True
    return False


def _parse_osm_capacity_kbpd(tags: dict[str, str]) -> float | None:
    """Best-effort parse of OSM capacity tags → kbpd (or None)."""
    candidates = [
        "capacity:bpd", "capacity_bpd", "oil:capacity:bpd",
        "production:bpd", "capacity", "capacity:oil",
        "capacity:production:oil",
    ]
    for k in candidates:
        v = tags.get(k)
        if not v:
            continue
        m = re.search(r"[\d.,]+", v)
        if not m:
            continue
        try:
            num = float(m.group(0).replace(",", ""))
        except ValueError:
            continue
        s = v.lower()
        if "kbpd" in s or "kb/d" in s or "kilo" in s:
            return num
        if "bpd" in s or "b/d" in s or "barrel" in s:
            return num / 1_000.0
        if "tpd" in s or "tonne" in s or "ton/" in s:
            return num * 7.33 / 1_000.0
        if num > 1_000:
            return num / 1_000.0
        return num
    return None


def _load_osm_refineries() -> pd.DataFrame:
    """Extract refinery rows from cached OSM Overpass response.

    Returns a DataFrame with columns: lon, lat, name, operator, capacity (kbpd),
    asset_id, source_version. Country attribution is added later via sjoin.
    """
    if not OSM_CACHE.exists():
        sys.exit(f"no OSM cache at {OSM_CACHE} — run scripts.ingest.osm_refineries first")
    data = json.load(OSM_CACHE.open())
    elements = data.get("elements", [])
    refinery_elements = [e for e in elements if _is_refinery_osm(e)]
    print(f"OSM: filtered {len(refinery_elements)} refineries from {len(elements)} elements",
          file=sys.stderr)

    rows = []
    for e in refinery_elements:
        tags = e.get("tags", {})
        if e["type"] == "node":
            lon, lat = e.get("lon"), e.get("lat")
        else:
            c = e.get("center", {})
            lon, lat = c.get("lon"), c.get("lat")
        if lon is None or lat is None:
            continue
        rows.append({
            "asset_id": f"osm/{e['type']}/{e['id']}",
            "name": tags.get("name") or tags.get("operator") or f"Refinery {e['id']}",
            "lon": float(lon),
            "lat": float(lat),
            "capacity": _parse_osm_capacity_kbpd(tags),
            "operator": tags.get("operator"),
            "source_version": data.get("_fetched_at", "unknown"),
        })
    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# NETL loader
# ---------------------------------------------------------------------------

def _load_netl_refineries() -> pd.DataFrame:
    """Load NETL Refineries from cached GeoJSON, parse capacities, attribute ISO3.

    Returns DataFrame with: asset_id, country_iso3, lon, lat, name, operator,
    capacity (kbpd|null), status (str|null), source_version.
    Records with unresolved country are dropped with a console warning.
    """
    if not NETL_RAW.exists():
        sys.exit(f"no NETL raw at {NETL_RAW} — run scripts.ingest.netl_refineries first")
    with NETL_RAW.open() as f:
        gj = json.load(f)
    feats = gj.get("features", [])
    print(f"NETL: loaded {len(feats)} features", file=sys.stderr)

    rows = []
    unresolved: dict[str, int] = {}
    for f in feats:
        props = f.get("properties", {})
        geom = f.get("geometry") or {}
        coords = geom.get("coordinates") or []
        if not coords or len(coords) < 2:
            continue
        lon, lat = float(coords[0]), float(coords[1])

        raw_country = (props.get("md_country") or "").strip()
        iso3 = NETL_NAME_TO_ISO3.get(raw_country)
        if iso3 is None:
            unresolved[raw_country] = unresolved.get(raw_country, 0) + 1
            continue

        fid = props.get("fid") or props.get("md_fkey") or f"netl_{len(rows)}"
        name = (props.get("facility_n") or "").strip()
        operator = (props.get("operator") or "").strip()
        # Label fallback: facility_n → operator → "Refinery"
        if not name:
            name = operator if operator else "Refinery"

        status = (props.get("status") or "").strip() or None

        rows.append({
            "asset_id": f"netl/{fid}",
            "country_iso3": iso3,
            "lon": lon,
            "lat": lat,
            "name": name,
            "operator": operator if operator else None,
            "capacity": parse_netl_capacity_kbpd(props.get("capacity")),
            "status": status,
            "source_version": gj.get("_fetched_at", "netl-gogi"),
        })

    if unresolved:
        print(f"NETL: skipped {sum(unresolved.values())} features with unresolved country names",
              file=sys.stderr)
        top_unresolved = sorted(unresolved.items(), key=lambda kv: -kv[1])[:10]
        for name, n in top_unresolved:
            print(f"  - {name!r}: {n}", file=sys.stderr)

    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    netl = _load_netl_refineries()
    print(f"NETL: kept {len(netl)} refineries (post-ISO3 attribution)", file=sys.stderr)

    osm = _load_osm_refineries()
    print(f"OSM: {len(osm)} raw rows (pre-country attribution)", file=sys.stderr)

    # OSM country attribution via spatial join (NETL already has country_iso3)
    osm_pts = gpd.GeoDataFrame(
        osm,
        geometry=[Point(xy) for xy in zip(osm.lon, osm.lat, strict=False)],
        crs="EPSG:4326",
    )
    countries = gpd.read_file(COUNTRIES)[["iso3", "geometry"]]
    osm_joined = gpd.sjoin(osm_pts, countries, how="left", predicate="within")
    osm["country_iso3"] = osm_joined["iso3"].values
    osm_before = len(osm)
    osm = osm.dropna(subset=["country_iso3"]).reset_index(drop=True)
    if osm_before != len(osm):
        print(f"OSM: dropped {osm_before - len(osm)} refineries with no country (offshore)",
              file=sys.stderr)

    # Dedup: drop OSM rows that have a NETL refinery within 2 km same country
    osm_kept = osm_records_not_in_netl(osm, netl)
    n_dropped = osm_before - len(osm_kept)
    print(f"OSM: {len(osm_kept)} kept after dedup ({n_dropped} dropped or no-country)",
          file=sys.stderr)

    # Tag source
    netl_out = netl.copy()
    netl_out["source"] = NETL_SOURCE
    netl_out["status"] = netl_out["status"].fillna("operating")  # NETL status is sparse

    osm_out = osm_kept.copy()
    osm_out["source"] = OSM_SOURCE
    osm_out["status"] = "operating"

    # Combine + enforce schema
    refineries = pd.concat([netl_out, osm_out], ignore_index=True)
    refineries["kind"] = "refinery"
    refineries["capacity_unit"] = refineries["capacity"].apply(
        lambda v: "kbpd" if pd.notna(v) else None
    )
    refineries["commissioned_year"] = pd.Series([pd.NA] * len(refineries), dtype=pd.Int64Dtype())
    refineries["decommissioned_year"] = pd.Series([pd.NA] * len(refineries), dtype=pd.Int64Dtype())

    schema_cols = [
        "asset_id", "kind", "name", "country_iso3", "lon", "lat",
        "capacity", "capacity_unit", "operator", "status",
        "commissioned_year", "decommissioned_year",
        "source", "source_version",
    ]
    # Type discipline matching existing assets.parquet schema
    refineries["capacity"] = refineries["capacity"].astype("Float64")
    refineries["capacity_unit"] = refineries["capacity_unit"].astype(pd.StringDtype())
    refineries["operator"] = refineries["operator"].astype(pd.StringDtype())
    refineries["status"] = refineries["status"].astype(pd.StringDtype())
    refineries["source"] = refineries["source"].astype(pd.StringDtype())
    refineries["source_version"] = refineries["source_version"].astype(pd.StringDtype())
    refineries = refineries[schema_cols]

    # Idempotent: drop prior refinery rows, append new
    existing = pd.read_parquet(ASSETS)
    n_before = len(existing)
    existing = existing[existing["kind"] != "refinery"]
    n_kept = len(existing)
    if n_before != n_kept:
        print(f"dropped {n_before - n_kept} stale refinery rows from assets.parquet",
              file=sys.stderr)

    combined = pd.concat([existing, refineries], ignore_index=True)
    pq.write_table(
        pa.Table.from_pandas(combined, preserve_index=False),
        ASSETS,
        compression="zstd",
    )

    counts = combined.groupby("kind").size().to_dict()
    cap_coverage = refineries["capacity"].notna().sum()
    by_source = refineries.groupby("source").size().to_dict()
    print(
        f"wrote {ASSETS}  rows={len(combined)}  by_kind={counts}"
    )
    print(f"  refinery sources: {by_source}")
    print(f"  refinery capacity coverage: {cap_coverage}/{len(refineries)}")


if __name__ == "__main__":
    main()
