"""Append NETL Storage to assets.parquet as kind='storage' rows.

Idempotent: drops prior kind='storage' rows before append.

Uses NETL_NAME_TO_ISO3 (not GEM_NAME_TO_ISO3) because NETL uses UN-style
country names.

Probed field names (actual NETL GeoJSON columns):
  facility_n  — facility name
  md_country  — country (may be semicolon-separated; first entry used)
  operator    — operator (often blank/space)
  capacity    — storage capacity (string, often blank)
  status      — status (often 'NA' or blank)
  installati  — installation date (date string or year, often blank)
  fid         — integer feature id
  md_fkey     — string feature key

Usage:
    uv run python -m scripts.transform.build_storage
"""
from __future__ import annotations

import sys
from pathlib import Path

import geopandas as gpd
import pandas as pd

from scripts.common.iso3 import NETL_NAME_TO_ISO3

SRC = Path("data/raw/netl/storage.geojson")
ASSETS_PATH = Path("public/data/assets.parquet")
SOURCE = "NETL Global Oil and Gas Infrastructure (GOGI)"
# NETL serves GOGI from an unversioned live ArcGIS FeatureServer; the snapshot
# in data/raw/netl/ was retrieved on this date. A constant (not date.today())
# keeps rebuilds byte-stable. Update it when the raw snapshot is re-ingested.
SOURCE_VERSION = "2026-05-17"


def _country_iso3(md_country: object) -> str | None:
    """Resolve first country name from NETL md_country field → ISO3.

    md_country may be semicolon- or comma-separated; we take the first entry.
    Because 'Venezuela, Bolivarian Republic of' uses a comma in the name,
    we try semicolon split first; otherwise we look up the full string before
    falling back to a comma-split.
    """
    if not isinstance(md_country, str) or not md_country.strip():
        return None
    val = md_country.strip()
    # Prefer semicolon split (NETL multi-country delimiter)
    if ";" in val:
        first = val.split(";")[0].strip()
    else:
        # Try full string first (handles comma-in-name like Venezuela)
        resolved = NETL_NAME_TO_ISO3.get(val)
        if resolved:
            return resolved
        # Fall back to comma split
        first = val.split(",")[0].strip()
    return NETL_NAME_TO_ISO3.get(first)


def _to_float(v: object) -> float | None:
    """NETL ships capacity as string. Coerce; return None on failure/blank."""
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    s = str(v).strip()
    if not s or s in (" ", "NA", "N/A", ""):
        return None
    try:
        return float(s.replace(",", ""))
    except (TypeError, ValueError):
        return None


def main() -> None:
    if not SRC.exists():
        sys.exit(f"missing {SRC} — run scripts.ingest.netl_storage first")

    gdf = gpd.read_file(SRC)
    print(f"loaded {len(gdf)} raw features", file=sys.stderr)
    print(f"columns: {list(gdf.columns)}", file=sys.stderr)

    # Build output rows
    # fid is the preferred id; fall back to md_fkey, then synthetic
    if "fid" in gdf.columns:
        ids = gdf["fid"].astype(str)
    elif "md_fkey" in gdf.columns:
        ids = gdf["md_fkey"].astype(str)
    else:
        ids = pd.Series([str(i) for i in range(len(gdf))], index=gdf.index)

    out = pd.DataFrame(
        {
            "asset_id": ("netl-storage-" + ids.reset_index(drop=True)).values,
            "kind": "storage",
            "name": gdf["facility_n"].fillna("").astype(str).values,
            "country_iso3": gdf["md_country"].map(_country_iso3).values,
            "lon": gdf.geometry.x.values,
            "lat": gdf.geometry.y.values,
            "capacity": gdf["capacity"].map(_to_float).values,
            "capacity_unit": "bbl",
            "operator": gdf["operator"].where(
                gdf["operator"].str.strip() != "", other=None
            ).values,
            "status": gdf["status"].where(
                gdf["status"].str.strip().isin(["", "NA"]) == False, other=None  # noqa: E712
            ).values,
            "commissioned_year": None,
            "decommissioned_year": None,
            "source": SOURCE,
            "source_version": SOURCE_VERSION,
        }
    )

    # Drop rows with no geometry or no country attribution
    before = len(out)
    out = out[out["country_iso3"].notna() & out["lon"].notna() & out["lat"].notna()].copy()
    dropped = before - len(out)
    if dropped:
        print(
            f"dropped {dropped} rows with null country or geometry",
            file=sys.stderr,
        )
    print(f"after geometry+country filter: {len(out)}", file=sys.stderr)

    # Enforce column types to match existing schema
    out["capacity"] = pd.to_numeric(out["capacity"], errors="coerce").astype("Float64")
    out["capacity_unit"] = out["capacity_unit"].astype(pd.StringDtype())
    out["operator"] = out["operator"].astype(pd.StringDtype())
    out["status"] = out["status"].astype(pd.StringDtype())
    out["commissioned_year"] = pd.array([pd.NA] * len(out), dtype=pd.Int64Dtype())
    out["decommissioned_year"] = pd.array([pd.NA] * len(out), dtype=pd.Int64Dtype())

    # Idempotent merge: drop prior kind='storage' rows, then append
    if ASSETS_PATH.exists():
        existing = pd.read_parquet(ASSETS_PATH)
    else:
        existing = pd.DataFrame(columns=out.columns)
    n_before = existing["kind"].value_counts().to_dict()
    existing = existing[existing["kind"] != "storage"].copy()

    # Schema reconciliation: ensure all-column union (preserve insertion order)
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
    print(f"  new_storage_rows={len(out)}")
    print(f"  existing kind counts before/after: {n_before} → {n_after_existing}")


if __name__ == "__main__":
    main()
