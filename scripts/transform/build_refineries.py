"""Transform NETL Refineries + OSM Overpass refineries → kind=refinery rows in assets.parquet.

NETL is the primary source (~2,272 features, government public-domain).
NETL lists many plants 2-4 times (English name, numbered "333 - …" row,
French "Raffinerie de …" row, all within ~100 m), so same-country NETL rows
within 1 km are first collapsed to one — unless their capacities differ by
more than 5 % (distinct neighbouring plants). See
_refinery_dedup.dedup_within_source for which row and which name are kept.
OSM is the supplement: any OSM refinery WITHOUT a NETL counterpart within
2 km in the same country is added.  See spec
docs/superpowers/specs/2026-05-17-global-energy-map-phase-5-design.md
for the empirical dedup threshold justification.

Country attribution:
  - NETL records: md_country → ISO3 via scripts.common.iso3.netl_country_iso3.
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
from shapely.geometry import Point

from scripts.common.iso3 import netl_country_iso3
from scripts.common.parquet import ASSETS_PATH, append_kind
from scripts.transform._refinery_capacity import parse_netl_capacity_kbpd
from scripts.transform._refinery_dedup import (
    NETL_SELF_DEDUP_KM,
    cluster_same_country,
    dedup_within_source,
    osm_records_not_in_netl,
)

OSM_CACHE = Path("data/raw/osm_refineries/refineries.json")
NETL_RAW = Path("data/raw/netl/refineries.geojson")
COUNTRIES = Path("public/data/countries.geojson")
ASSETS = ASSETS_PATH
KIND = "refinery"

OSM_SOURCE = "OpenStreetMap (Overpass)"
NETL_SOURCE = "National Energy Technology Laboratory (US DOE) — GOGI Refineries"

OUTPUT_COLS = [
    "asset_id",
    "kind",
    "name",
    "country_iso3",
    "lon",
    "lat",
    "capacity",
    "capacity_unit",
    "operator",
    "status",
    "source",
    "source_version",
]

# Reused from prior OSM-only implementation
REFINERY_NAME_KEYWORDS = [
    "refin",
    "raffinerie",
    "raffineri",
    "нпз",
    "нефтеперераб",
    "нафтопереробн",
    "oljraffinaderi",
    "petrokimia",
    "petrochemical",
    "refinaria",
    "rафинерия",
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
        "capacity:bpd",
        "capacity_bpd",
        "oil:capacity:bpd",
        "production:bpd",
        "capacity",
        "capacity:oil",
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


def _load_osm_refineries(path: Path = OSM_CACHE) -> pd.DataFrame:
    """Extract refinery rows from cached OSM Overpass response.

    Returns a DataFrame with columns: lon, lat, name, operator, capacity (kbpd),
    asset_id, source_version. Country attribution is added later via sjoin.
    """
    if not path.exists():
        sys.exit(f"no OSM cache at {path} — run scripts.ingest.osm_refineries first")
    with path.open() as fh:
        data = json.load(fh)
    elements = data.get("elements", [])
    refinery_elements = [e for e in elements if _is_refinery_osm(e)]
    print(
        f"OSM: filtered {len(refinery_elements)} refineries from {len(elements)} elements",
        file=sys.stderr,
    )

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
        rows.append(
            {
                "asset_id": f"osm/{e['type']}/{e['id']}",
                "name": tags.get("name") or tags.get("operator") or f"Refinery {e['id']}",
                "lon": float(lon),
                "lat": float(lat),
                "capacity": _parse_osm_capacity_kbpd(tags),
                "operator": tags.get("operator"),
                "source_version": data.get("_fetched_at", "unknown"),
            }
        )
    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# NETL loader
# ---------------------------------------------------------------------------


def _load_netl_refineries(path: Path = NETL_RAW) -> pd.DataFrame:
    """Load NETL Refineries from cached GeoJSON, parse capacities, attribute ISO3.

    Returns DataFrame with: asset_id, country_iso3, lon, lat, name, operator,
    capacity (kbpd|null), status (str|null), source_version.
    Records with unresolved country are dropped with a console warning.
    """
    if not path.exists():
        sys.exit(f"no NETL raw at {path} — run scripts.ingest.netl_refineries first")
    with path.open() as f:
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
        iso3 = netl_country_iso3(raw_country)
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

        rows.append(
            {
                "asset_id": f"netl/{fid}",
                "country_iso3": iso3,
                "lon": lon,
                "lat": lat,
                "name": name,
                "operator": operator if operator else None,
                "capacity": parse_netl_capacity_kbpd(props.get("capacity")),
                "status": status,
                "source_version": gj.get("_fetched_at", "netl-gogi"),
            }
        )

    if unresolved:
        print(
            f"NETL: skipped {sum(unresolved.values())} features with unresolved country names",
            file=sys.stderr,
        )
        top_unresolved = sorted(unresolved.items(), key=lambda kv: -kv[1])[:10]
        for name, n in top_unresolved:
            print(f"  - {name!r}: {n}", file=sys.stderr)

    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------


def attribute_osm_countries(osm: pd.DataFrame, countries: gpd.GeoDataFrame) -> pd.DataFrame:
    """Add ``country_iso3`` to OSM rows by point-in-polygon; drop offshore rows."""
    osm = osm.copy()
    if osm.empty:
        osm["country_iso3"] = pd.Series(dtype=object)
        return osm
    osm_pts = gpd.GeoDataFrame(
        osm,
        geometry=[Point(xy) for xy in zip(osm.lon, osm.lat, strict=False)],
        crs="EPSG:4326",
    )
    osm_joined = gpd.sjoin(osm_pts, countries[["iso3", "geometry"]], how="left", predicate="within")
    osm["country_iso3"] = osm_joined["iso3"].values
    n_before = len(osm)
    osm = osm.dropna(subset=["country_iso3"]).reset_index(drop=True)
    if n_before != len(osm):
        print(
            f"OSM: dropped {n_before - len(osm)} refineries with no country (offshore)",
            file=sys.stderr,
        )
    return osm


def dedup_netl(netl: pd.DataFrame) -> pd.DataFrame:
    """Collapse NETL's own near-duplicate listings (same country, ≤ 1 km).

    Rows with conflicting capacities (> 5 % apart) are distinct plants and are
    never merged; the clusters that constraint splits are logged.
    """
    kept, clusters = dedup_within_source(netl, NETL_SELF_DEDUP_KM)
    print(
        f"NETL: {len(netl)} → {len(kept)} after within-source dedup "
        f"({len(clusters)} clusters ≤ {NETL_SELF_DEDUP_KM:g} km merged "
        f"{len(netl) - len(kept)} rows)",
        file=sys.stderr,
    )
    frame = netl.reset_index(drop=True)
    loose = cluster_same_country(frame, NETL_SELF_DEDUP_KM, rel=None)
    tight = cluster_same_country(frame, NETL_SELF_DEDUP_KM)
    split = [g for g in pd.unique(loose) if len(set(tight[loose == g])) > 1]
    if split:
        print(
            f"NETL: {len(split)} proximity clusters kept apart by conflicting capacities:",
            file=sys.stderr,
        )
        for g in split:
            rows = frame[(loose == g) & frame["capacity"].notna()]
            caps = [
                f"{n[:40]!r}={v:g}" for n, v in zip(rows["name"], rows["capacity"], strict=True)
            ]
            print(f"  {rows['country_iso3'].iloc[0]}: {', '.join(caps)}", file=sys.stderr)
    return kept


def build(netl: pd.DataFrame, osm: pd.DataFrame) -> pd.DataFrame:
    """Combine NETL (primary) and country-attributed OSM (supplement) refinery rows.

    Collapses NETL's within-source duplicates, drops OSM rows within 2 km of
    a same-country NETL row (tested against every NETL listing, before the
    within-source dedup), tags ``source``, fills ``status`` and
    ``capacity_unit``. Dtypes are applied by ``append_kind``.
    """
    osm_kept = osm_records_not_in_netl(osm, netl)
    netl = dedup_netl(netl)
    print(
        f"OSM: {len(osm_kept)} kept after dedup ({len(osm) - len(osm_kept)} within "
        "2 km of a NETL refinery)",
        file=sys.stderr,
    )

    netl_out = netl.copy()
    netl_out["source"] = NETL_SOURCE
    netl_out["status"] = netl_out["status"].fillna("operating")  # NETL status is sparse

    osm_out = osm_kept.copy()
    osm_out["source"] = OSM_SOURCE
    osm_out["status"] = "operating"

    refineries = pd.concat([netl_out, osm_out], ignore_index=True)
    refineries["kind"] = KIND
    refineries["capacity_unit"] = refineries["capacity"].apply(
        lambda v: "kbpd" if pd.notna(v) else None
    )
    return refineries[[c for c in OUTPUT_COLS if c in refineries.columns]]


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    netl = _load_netl_refineries()
    print(f"NETL: kept {len(netl)} refineries (post-ISO3 attribution)", file=sys.stderr)

    osm = _load_osm_refineries()
    print(f"OSM: {len(osm)} raw rows (pre-country attribution)", file=sys.stderr)
    osm = attribute_osm_countries(osm, gpd.read_file(COUNTRIES))

    refineries = build(netl, osm)
    combined = append_kind(refineries, KIND, ASSETS)

    counts = combined.groupby("kind").size().to_dict()
    cap_coverage = refineries["capacity"].notna().sum()
    by_source = refineries.groupby("source").size().to_dict()
    print(f"wrote {ASSETS}  rows={len(combined)}  by_kind={counts}")
    print(f"  refinery sources: {by_source}")
    print(f"  refinery capacity coverage: {cap_coverage}/{len(refineries)}")


if __name__ == "__main__":
    main()
