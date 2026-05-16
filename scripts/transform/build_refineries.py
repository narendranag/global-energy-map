"""Transform OSM Overpass refineries → kind=refinery rows in assets.parquet.

Country attribution: spatial join against public/data/countries.geojson.
Capacity: parsed from OSM `capacity` or `capacity:bpd` tag where present (converted to kbpd).

Filter logic (OSM tags are inconsistent; we apply a layered filter):
  - industrial=oil_refinery  (OSM preferred tag, sparse but precise)
  - industrial=refinery      (occasional alternative spelling)
  - industrial=oil + name contains refinery keywords in any language
  - industrial=oil + man_made=works + named element  (named processing works;
    excludes the many unnamed Vermilion-REP-style oil-field works in France)

Excludes:
  - industrial=oil nodes without refinery keywords (petroleum wells, platforms)
  - man_made=works + product=oil without industrial=oil (olive oil mills)
  - industrial=oil unnamed ways/relations tagged man_made=works (oil field
    processing facilities without refinery-level function)

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

CACHE = Path("data/raw/osm_refineries/refineries.json")
COUNTRIES = Path("public/data/countries.geojson")
ASSETS = Path("public/data/assets.parquet")
SOURCE = "OpenStreetMap (Overpass)"

# OSM name substrings that identify oil refineries across languages
REFINERY_NAME_KEYWORDS = [
    "refin",          # English: refinery, refining; French: raffinerie; Romanian: rafinare
    "raffinerie",     # German/Dutch: Raffinerie
    "raffineri",      # Scandinavian: raffineri
    "нпз",            # Russian: НПЗ (нефтеперерабатывающий завод)
    "нефтеперераб",   # Russian: нефтеперерабатывающий
    "нафтопереробн",  # Ukrainian
    "oljraffinaderi", # Swedish
    "petrokimia",     # Indonesian/Malay: petrochemical
    "petrochemical",  # English
    "refinaria",      # Portuguese/Brazilian
    "rафинерия",      # Bulgarian
]


def _is_refinery(element: dict) -> bool:
    """Return True if the OSM element should be classified as an oil refinery."""
    tags = element.get("tags", {})
    ind = tags.get("industrial", "")
    name_haystack = (
        tags.get("name", "") + " " + tags.get("name:en", "")
    ).lower()
    man_made = tags.get("man_made", "")
    etype = element["type"]

    # 1. Explicit refinery tag (gold standard, but rare in OSM)
    if ind in ("oil_refinery", "refinery"):
        return True

    # 2. industrial=oil with further evidence
    if ind == "oil":
        # Name contains a refinery keyword in any supported language
        if any(kw in name_haystack for kw in REFINERY_NAME_KEYWORDS):
            return True
        # Named man_made=works on a way/relation (excludes unnamed oil-field works)
        if man_made == "works" and etype in ("way", "relation") and tags.get("name"):
            return True

    return False


def parse_capacity(tags: dict[str, str]) -> tuple[float | None, str | None]:
    """Return (kbpd, raw_tag_key). Best-effort parse of OSM capacity tags."""
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
            return num, k
        if "bpd" in s or "b/d" in s or "barrel" in s:
            return num / 1_000.0, k
        if "tpd" in s or "tonne" in s or "ton/" in s:
            # rough: 1 tonne crude ≈ 7.33 bbl
            return num * 7.33 / 1_000.0, k
        # No unit — heuristic: >1000 → assume bpd, else kbpd
        if num > 1_000:
            return num / 1_000.0, k
        return num, k
    return None, None


def main() -> None:
    if not CACHE.exists():
        sys.exit(
            f"no OSM cache at {CACHE} — run scripts.ingest.osm_refineries first"
        )
    data = json.load(CACHE.open())
    elements = data.get("elements", [])
    if not elements:
        sys.exit("no OSM elements in cache")

    # Apply refinery filter
    refinery_elements = [e for e in elements if _is_refinery(e)]
    print(
        f"filtered {len(refinery_elements)} refineries from {len(elements)} total elements",
        file=sys.stderr,
    )

    # Extract centroid for each element
    rows = []
    for e in refinery_elements:
        tags = e.get("tags", {})
        if e["type"] == "node":
            lon, lat = e.get("lon"), e.get("lat")
        else:
            # way / relation with `out center`
            c = e.get("center", {})
            lon, lat = c.get("lon"), c.get("lat")
        if lon is None or lat is None:
            continue
        cap_kbpd, cap_tag = parse_capacity(tags)
        rows.append(
            {
                "asset_id": f"osm/{e['type']}/{e['id']}",
                "kind": "refinery",
                "name": (
                    tags.get("name")
                    or tags.get("operator")
                    or f"Refinery {e['id']}"
                ),
                "lon": float(lon),
                "lat": float(lat),
                "capacity": cap_kbpd,
                "capacity_unit": "kbpd" if cap_kbpd is not None else None,
                "operator": tags.get("operator"),
                "status": "operating",  # OSM doesn't track lifecycle; assume operating
                "commissioned_year": None,
                "decommissioned_year": None,
                "source": SOURCE,
                "source_version": data.get("_fetched_at", "unknown"),
            }
        )

    df = pd.DataFrame(rows)
    if df.empty:
        sys.exit("no refineries extracted after coordinate filtering")

    # Spatial join against country polygons for ISO3 attribution
    pts = gpd.GeoDataFrame(
        df,
        geometry=[Point(xy) for xy in zip(df.lon, df.lat, strict=False)],
        crs="EPSG:4326",
    )
    countries = gpd.read_file(COUNTRIES)[["iso3", "geometry"]]
    joined = gpd.sjoin(pts, countries, how="left", predicate="within")
    df["country_iso3"] = joined["iso3"].values

    # Drop rows that didn't intersect any country polygon (offshore / near-coast)
    before = len(df)
    df = df.dropna(subset=["country_iso3"]).reset_index(drop=True)
    dropped = before - len(df)
    if dropped:
        print(
            f"dropped {dropped} refineries with no country attribution (offshore/near-coast)",
            file=sys.stderr,
        )

    # Type enforcement (matches the dtype pattern from build_assets.py)
    df["capacity"] = df["capacity"].astype("Float64")
    df["capacity_unit"] = df["capacity_unit"].astype(pd.StringDtype())
    df["operator"] = df["operator"].astype(pd.StringDtype())
    df["commissioned_year"] = pd.Series(
        [pd.NA] * len(df), dtype=pd.Int64Dtype()
    )
    df["decommissioned_year"] = pd.Series(
        [pd.NA] * len(df), dtype=pd.Int64Dtype()
    )

    # Reorder columns to match assets.parquet schema
    schema_cols = [
        "asset_id", "kind", "name", "country_iso3", "lon", "lat",
        "capacity", "capacity_unit", "operator", "status",
        "commissioned_year", "decommissioned_year",
        "source", "source_version",
    ]
    df = df[schema_cols]

    # Read existing assets.parquet, strip any stale refinery rows, append new ones
    existing = pd.read_parquet(ASSETS)
    n_existing = len(existing)
    existing = existing[existing["kind"] != "refinery"]
    n_kept = len(existing)
    if n_existing != n_kept:
        print(
            f"dropped {n_existing - n_kept} stale refinery rows from assets.parquet",
            file=sys.stderr,
        )

    combined = pd.concat([existing, df], ignore_index=True)

    pq.write_table(
        pa.Table.from_pandas(combined, preserve_index=False),
        ASSETS,
        compression="zstd",
    )

    counts = combined.groupby("kind").size().to_dict()
    cap_coverage = df["capacity"].notna().sum()
    print(
        f"wrote {ASSETS}  rows={len(combined)}  by_kind={counts}  "
        f"refinery_capacity_coverage={cap_coverage}/{len(df)}"
    )

    # Top 10 countries for refineries
    top = (
        df.groupby("country_iso3")
        .size()
        .sort_values(ascending=False)
        .head(10)
    )
    print("top 10 refinery countries:")
    print(top.to_string())


if __name__ == "__main__":
    main()
