"""Transform LNG terminals → kind={lng_export, lng_import} rows in assets.parquet.

PHASE 6: LNG-T3 (Zhou 2026) is the primary source; GEM GGIT terminals
that don't proximity-match an LNG-T3 active terminal within 25 km in the
same country are kept as supplements.

Inputs:
  data/raw/lng_t3/v1-2026-04-01/LNG_terminal.csv  (545 terminals total)
  data/raw/gem_gas_infra/ggit_map_*.geojson       (GEM, filtered to GGIT-import/export)

Filter on LNG-T3: status ∈ {operating, construction} → ~330 active terminals.
Filter on GEM: status ∈ {operating, construction} (same as Phase 3).

Country attribution:
  LNG-T3: areas column → ISO3 via shared lookup
  GEM:    first country from areas semicolon list → ISO3 via GEM dict (existing logic)

Dedup: GEM record dropped if any LNG-T3 active terminal in same country
falls within 25 km haversine. Probe showed 95% match within 10 km;
25 km accommodates LNG-T3's slightly different coord precision.

Schema (assets.parquet for LNG rows — Phase 6 adds three columns):
  asset_id, kind, name, country_iso3, lon, lat,
  capacity (mtpa), capacity_unit, operator, status,
  commissioned_year, decommissioned_year,
  unit_count, total_processed_bcm, un_locode,
  source, source_version

Idempotent — drops prior lng_export + lng_import rows, then appends.

Usage:
    uv run python -m scripts.transform.build_lng_terminals
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

from scripts.common.iso3 import GEM_NAME_TO_ISO3
from scripts.transform._lng_iso3 import lookup_iso3
from scripts.transform._lng_terminal_helpers import (
    assert_unique_asset_ids,
    collapse_duplicate_names,
    normalize_status,
)
from scripts.transform._refinery_dedup import haversine_km  # reuse Phase 5 helper

LNG_T3_RAW = Path("data/raw/lng_t3/v1-2026-04-01/LNG_terminal.csv")
GEM_RAW_DIR = Path("data/raw/gem_gas_infra")
ASSETS = Path("public/data/assets.parquet")

LNG_T3_SOURCE = "Zhou et al. 2026, LNG-T3 (Zenodo 10.5281/zenodo.19571058)"
LNG_T3_SOURCE_VERSION = "v1-2026-04-01"
GEM_SOURCE = "Global Energy Monitor — Global Gas Infrastructure Tracker"

DEDUP_THRESHOLD_KM = 25.0

# Schema columns (Phase 6 adds unit_count, total_processed_bcm, un_locode at the end)
SCHEMA_COLS = [
    "asset_id", "kind", "name", "country_iso3", "lon", "lat",
    "capacity", "capacity_unit", "operator", "status",
    "commissioned_year", "decommissioned_year",
    "unit_count", "total_processed_bcm", "un_locode",
    "source", "source_version",
]


# ---------------------------------------------------------------------------
# LNG-T3 loader
# ---------------------------------------------------------------------------

def _load_lng_t3() -> pd.DataFrame:
    if not LNG_T3_RAW.exists():
        sys.exit(f"no LNG-T3 raw at {LNG_T3_RAW} — run scripts.ingest.lng_t3 first")
    df = pd.read_csv(LNG_T3_RAW)
    print(f"LNG-T3: loaded {len(df)} terminals", file=sys.stderr)

    # Filter to active terminals
    df = df[df["status"].isin(["operating", "construction"])].copy()
    print(f"LNG-T3: {len(df)} after operating+construction filter", file=sys.stderr)

    df["country_iso3"] = df["areas"].map(lookup_iso3)
    unmapped = df["country_iso3"].isna().sum()
    if unmapped:
        bad = df[df["country_iso3"].isna()]["areas"].value_counts()
        sys.exit(f"unmapped LNG-T3 country names: {dict(bad)}")

    df["kind"] = df["terminal_type"].map({"export": "lng_export", "import": "lng_import"})
    assert df["kind"].notna().all(), "unknown terminal_type values"

    df = collapse_duplicate_names(df)
    print(f"LNG-T3: {len(df)} after collapsing duplicate terminal names", file=sys.stderr)

    out = pd.DataFrame({
        "asset_id": "lngt3/" + df["name"].astype(str).str.replace(r"[^A-Za-z0-9]", "_", regex=True),
        "kind": df["kind"],
        "name": df["name"].astype(str),
        "country_iso3": df["country_iso3"],
        "lon": df["lon"].astype(float),
        "lat": df["lat"].astype(float),
        "capacity": df["capacity"].astype("Float64"),  # mtpa
        "capacity_unit": "mtpa",
        "operator": pd.NA,
        "status": df["status"].map(normalize_status).astype(pd.StringDtype()),
        "commissioned_year": pd.to_numeric(df["start_year"], errors="coerce").astype("Int64"),
        "decommissioned_year": pd.Series([pd.NA] * len(df), dtype="Int64", index=df.index),
        "unit_count": df["unit_count"].astype("Int64"),
        "total_processed_bcm": df["total_processed_bcm"].astype("Int64"),
        "un_locode": df["UN_LOCODE"].astype(pd.StringDtype()),
        "source": LNG_T3_SOURCE,
        "source_version": LNG_T3_SOURCE_VERSION,
    })
    # Ensure asset_id is a regular column
    out["asset_id"] = out["asset_id"].astype(pd.StringDtype())
    assert_unique_asset_ids(out)
    return out


# ---------------------------------------------------------------------------
# GEM loader (Phase 3 logic preserved + adapted)
# ---------------------------------------------------------------------------

def _gem_areas_iso3(areas: str | None) -> str | None:
    if not isinstance(areas, str):
        return None
    for part in areas.split(";"):
        iso3 = GEM_NAME_TO_ISO3.get(part.strip())
        if iso3:
            return iso3
    return None


def _load_gem() -> pd.DataFrame:
    src = next(GEM_RAW_DIR.glob("*.geojson"), None)
    if src is None:
        sys.exit(f"no GEM gas infra geojson in {GEM_RAW_DIR}")

    with src.open() as f:
        gj = json.load(f)
    feats = [
        f for f in gj.get("features", [])
        if (f.get("properties") or {}).get("tracker-custom") in ("GGIT-import", "GGIT-export")
    ]
    print(f"GEM: {len(feats)} LNG terminal features pre-filter", file=sys.stderr)

    rows = []
    for f in feats:
        p = f.get("properties") or {}
        geom = f.get("geometry") or {}
        if geom.get("type") != "Point":
            continue
        coords = geom.get("coordinates") or []
        if len(coords) < 2:
            continue
        if p.get("status") not in ("operating", "construction"):
            continue

        iso3 = _gem_areas_iso3(p.get("areas"))
        if not iso3:
            continue

        is_export = p.get("tracker-custom") == "GGIT-export"
        cap_key = (
            "totexportlngterminalcapacityinmtpa"
            if is_export
            else "totimportlngterminalcapacityinmtpa"
        )
        cap = p.get(cap_key)
        try:
            cap_f = float(cap) if cap not in (None, "") else None
        except (TypeError, ValueError):
            cap_f = None

        rows.append({
            "asset_id": f"gem/{p.get('id') or p.get('pid')}",
            "kind": "lng_export" if is_export else "lng_import",
            "name": str(p.get("name") or "LNG terminal"),
            "country_iso3": iso3,
            "lon": float(coords[0]),
            "lat": float(coords[1]),
            "capacity": cap_f,
            "capacity_unit": "mtpa",
            "operator": (p.get("owner") or p.get("operator")),
            "status": "operating" if p.get("status") == "operating" else "in-construction",
            "commissioned_year": pd.to_numeric(p.get("start-year"), errors="coerce"),
            "decommissioned_year": pd.NA,
            "unit_count": pd.NA,
            "total_processed_bcm": pd.NA,
            "un_locode": None,
            "source": GEM_SOURCE,
            "source_version": src.name,
        })

    df = pd.DataFrame(rows)
    print(f"GEM: {len(df)} after geometry + status + iso3 attribution", file=sys.stderr)

    # The raw GGIT geojson contains a handful of byte-identical duplicate
    # features (same pid/status/geometry/capacity repeated verbatim) — drop
    # them rather than let them surface as duplicate asset_ids downstream.
    n_before = len(df)
    df = df.drop_duplicates(subset="asset_id", keep="first")
    n_dropped = n_before - len(df)
    if n_dropped:
        print(f"GEM: dropped {n_dropped} exact-duplicate feature(s) from raw geojson",
              file=sys.stderr)

    return df


# ---------------------------------------------------------------------------
# Dedup
# ---------------------------------------------------------------------------

def _gem_records_not_in_lngt3(gem: pd.DataFrame, lng_t3: pd.DataFrame) -> pd.DataFrame:
    """Return GEM rows with NO LNG-T3 counterpart within DEDUP_THRESHOLD_KM same country."""
    if gem.empty or lng_t3.empty:
        return gem.copy()

    t3_by_country: dict[str, pd.DataFrame] = {
        iso3: grp for iso3, grp in lng_t3.groupby("country_iso3")
    }
    keep: list[bool] = []
    for _, g in gem.iterrows():
        t3 = t3_by_country.get(g["country_iso3"])
        if t3 is None or t3.empty:
            keep.append(True)
            continue
        d = haversine_km(g["lat"], g["lon"], t3["lat"].values, t3["lon"].values)
        keep.append(bool(np.all(d > DEDUP_THRESHOLD_KM)))
    return gem.loc[keep].copy()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    lng_t3 = _load_lng_t3()
    gem = _load_gem()

    gem_kept = _gem_records_not_in_lngt3(gem, lng_t3)
    print(f"GEM: {len(gem_kept)} kept after 25 km dedup vs LNG-T3", file=sys.stderr)

    # Enforce schema cols on both
    for df in (lng_t3, gem_kept):
        for col in SCHEMA_COLS:
            if col not in df.columns:
                df[col] = pd.NA

    combined = pd.concat([lng_t3[SCHEMA_COLS], gem_kept[SCHEMA_COLS]], ignore_index=True)
    # Type discipline (matches Phase 5 conventions)
    combined["capacity"] = combined["capacity"].astype("Float64")
    combined["capacity_unit"] = combined["capacity_unit"].astype(pd.StringDtype())
    combined["operator"] = combined["operator"].astype(pd.StringDtype())
    combined["status"] = combined["status"].astype(pd.StringDtype())
    combined["commissioned_year"] = combined["commissioned_year"].astype("Int64")
    combined["decommissioned_year"] = combined["decommissioned_year"].astype("Int64")
    combined["unit_count"] = combined["unit_count"].astype("Int64")
    combined["total_processed_bcm"] = combined["total_processed_bcm"].astype("Int64")
    combined["un_locode"] = combined["un_locode"].astype(pd.StringDtype())
    combined["source"] = combined["source"].astype(pd.StringDtype())
    combined["source_version"] = combined["source_version"].astype(pd.StringDtype())
    assert_unique_asset_ids(combined)

    # Idempotent: drop prior LNG rows, append new
    existing = pd.read_parquet(ASSETS)
    n_before = len(existing)
    existing = existing[~existing["kind"].isin(["lng_export", "lng_import"])]
    n_kept = len(existing)
    if n_before != n_kept:
        print(f"dropped {n_before - n_kept} stale LNG rows from assets.parquet",
              file=sys.stderr)

    # Phase 6 schema additions: bring existing rows up to the new column set
    for col in ("unit_count", "total_processed_bcm", "un_locode"):
        if col not in existing.columns:
            existing[col] = pd.NA
    existing["unit_count"] = existing["unit_count"].astype("Int64")
    existing["total_processed_bcm"] = existing["total_processed_bcm"].astype("Int64")
    existing["un_locode"] = existing["un_locode"].astype(pd.StringDtype())

    out = pd.concat([existing, combined], ignore_index=True)
    pq.write_table(
        pa.Table.from_pandas(out, preserve_index=False),
        ASSETS,
        compression="zstd",
    )

    counts = out.groupby("kind").size().to_dict()
    by_source = combined.groupby("source").size().to_dict()
    cap_cov = combined["capacity"].notna().sum()
    cy_cov = combined["commissioned_year"].notna().sum()
    print(f"wrote {ASSETS}  rows={len(out)}  by_kind={counts}")
    print(f"  LNG sources: {by_source}")
    print(f"  capacity coverage: {cap_cov}/{len(combined)}")
    print(f"  commissioned_year coverage: {cy_cov}/{len(combined)}")


if __name__ == "__main__":
    main()
