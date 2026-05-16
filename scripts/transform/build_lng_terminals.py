"""Transform GEM Gas Infrastructure Tracker LNG terminal features → assets.parquet.

Source: data/raw/gem_gas_infra/ggit_map_2026-02-20.geojson
        Features where tracker-custom in {"GGIT-import", "GGIT-export"}

Filters: status in {operating, construction}; valid Point geometries.
         "construction" normalized to "in-construction".

Appends kind=lng_import and kind=lng_export rows to public/data/assets.parquet.
Script is idempotent: prior LNG rows are dropped before re-appending.

Also backfills capacity_unit on existing rows if all are null:
  extraction_site → "kboe/d"  (matches page.tsx tooltip label)
  refinery        → "kbpd"

Capacity for LNG terminals is in mtpa (million tonnes per annum).
  import terminal: totimportlngterminalcapacityinmtpa
  export terminal: totexportlngterminalcapacityinmtpa

Areas field uses semicolons as delimiter (e.g. "Indonesia;").
First country name is used for country_iso3 attribution.

Usage:
    uv run python -m scripts.transform.build_lng_terminals
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd

from scripts.common.iso3 import GEM_NAME_TO_ISO3

SRC = Path("data/raw/gem_gas_infra/ggit_map_2026-02-20.geojson")
ASSETS_PATH = Path("public/data/assets.parquet")
SOURCE = "Global Energy Monitor — Global Gas Infrastructure Tracker"

KEEP_STATUSES = {"operating", "construction"}

KIND_MAP = {
    "GGIT-import": "lng_import",
    "GGIT-export": "lng_export",
}

# Backfill capacity_unit for existing kinds if all null
EXISTING_KIND_UNITS = {
    "extraction_site": "kboe/d",
    "refinery": "kbpd",
}


def _country_iso3(areas: object) -> str | None:
    """Parse first country from semicolon-separated areas string → ISO3."""
    if not isinstance(areas, str) or not areas.strip():
        return None
    # Areas like "Indonesia;" — strip semicolons, take first entry
    parts = [p.strip() for p in areas.split(";") if p.strip()]
    if not parts:
        return None
    return GEM_NAME_TO_ISO3.get(parts[0])


def _capacity(props: dict, kind: str) -> float | None:
    """Extract MTPA capacity from properties dict depending on terminal kind."""
    if kind == "lng_import":
        raw = props.get("totimportlngterminalcapacityinmtpa")
    else:
        raw = props.get("totexportlngterminalcapacityinmtpa")
    if raw is None or raw == "":
        return None
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None


def main() -> None:
    if not SRC.exists():
        sys.exit(f"missing {SRC} — run scripts.ingest.gem_gas_infra first")

    print(f"reading {SRC} …", file=sys.stderr)
    with open(SRC) as fh:
        raw = json.load(fh)

    # Filter to LNG terminal features only
    lng_features = [
        f for f in raw["features"]
        if (f.get("properties") or {}).get("tracker-custom") in KIND_MAP
    ]
    print(f"LNG features (before status filter): {len(lng_features)}", file=sys.stderr)

    rows = []
    for feat in lng_features:
        props = feat["properties"] or {}
        status_raw = str(props.get("status") or "").strip().lower()
        if status_raw not in KEEP_STATUSES:
            continue
        status_norm = "in-construction" if status_raw == "construction" else status_raw

        tracker = props["tracker-custom"]
        kind = KIND_MAP[tracker]

        geom = feat.get("geometry") or {}
        if geom.get("type") != "Point":
            continue
        coords = geom.get("coordinates") or []
        if len(coords) < 2:
            continue
        lon_val, lat_val = float(coords[0]), float(coords[1])

        iso3 = _country_iso3(props.get("areas"))
        cap = _capacity(props, kind)

        rows.append({
            "asset_id": str(props.get("pid") or ""),
            "kind": kind,
            "name": str(props.get("name") or ""),
            "country_iso3": iso3,
            "lon": lon_val,
            "lat": lat_val,
            "capacity": cap,
            "capacity_unit": "mtpa",
            "operator": props.get("operator") or None,
            "status": status_norm,
            "commissioned_year": None,
            "decommissioned_year": None,
            "source": SOURCE,
            "source_version": SRC.name,
        })

    out = pd.DataFrame(rows)
    print(f"LNG rows after status filter: {len(out)}", file=sys.stderr)

    # Drop rows missing geo or country attribution
    before = len(out)
    out = out[out["country_iso3"].notna() & out["lon"].notna() & out["lat"].notna()].copy()
    dropped = before - len(out)
    if dropped:
        print(
            f"dropped {dropped} LNG rows with no country attribution",
            file=sys.stderr,
        )

    # Enforce column types
    out["capacity"] = pd.to_numeric(out["capacity"], errors="coerce").astype("Float64")
    out["capacity_unit"] = out["capacity_unit"].astype(pd.StringDtype())
    out["operator"] = out["operator"].astype(pd.StringDtype())
    out["commissioned_year"] = pd.array([pd.NA] * len(out), dtype=pd.Int64Dtype())
    out["decommissioned_year"] = pd.array([pd.NA] * len(out), dtype=pd.Int64Dtype())

    # Load existing assets, backfill capacity_unit if all null, drop prior LNG rows
    existing = pd.read_parquet(ASSETS_PATH)
    n_before = existing["kind"].value_counts().to_dict()

    # Backfill capacity_unit for existing kinds if the column is entirely null
    if existing["capacity_unit"].isna().all():
        existing["capacity_unit"] = existing["kind"].map(EXISTING_KIND_UNITS).astype(
            pd.StringDtype()
        )
        print("backfilled capacity_unit for existing rows", file=sys.stderr)

    # Idempotency: drop prior LNG rows before appending
    existing = existing[~existing["kind"].isin(["lng_export", "lng_import"])].copy()

    # Reconcile columns — ensure both DataFrames have the same column set
    all_cols = list(dict.fromkeys(list(existing.columns) + list(out.columns)))
    for c in all_cols:
        if c not in existing.columns:
            existing[c] = pd.NA
        if c not in out.columns:
            out[c] = pd.NA
    existing = existing[all_cols]
    out = out[all_cols]

    combined = pd.concat([existing, out], ignore_index=True)
    combined.to_parquet(ASSETS_PATH, compression="zstd")

    counts = combined["kind"].value_counts().to_dict()
    n_after_existing = {k: counts.get(k, 0) for k in n_before}
    print(f"wrote {ASSETS_PATH}")
    print(f"  kinds={counts}")
    print(f"  new_lng_rows={len(out)}")
    print(f"  existing kind counts before/after: {n_before} → {n_after_existing}")


if __name__ == "__main__":
    main()
