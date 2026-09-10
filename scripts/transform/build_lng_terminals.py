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

Idempotent — append_kind drops prior lng_export + lng_import rows (plus any
orphan rows with a null kind left by earlier buggy runs), then appends.

Usage:
    uv run python -m scripts.transform.build_lng_terminals
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

from scripts.common.iso3 import gem_first_iso3, lookup_iso3
from scripts.common.parquet import ASSETS_PATH, append_kind
from scripts.common.paths import latest
from scripts.common.sources import GEM_GGIT, LNG_T3
from scripts.common.values import to_float
from scripts.transform._lng_terminal_helpers import (
    assert_unique_asset_ids,
    collapse_duplicate_names,
    name_matches_in_country,
    normalize_status,
)
from scripts.transform._refinery_dedup import haversine_km  # reuse Phase 5 helper

LNG_T3_RAW = LNG_T3.raw_dir / "LNG_terminal.csv"
GEM_RAW_DIR = GEM_GGIT.raw_dir
ASSETS = ASSETS_PATH
KINDS = ("lng_export", "lng_import")

LNG_T3_SOURCE = "Zhou et al. 2026, LNG-T3 (Zenodo 10.5281/zenodo.19571058)"
LNG_T3_SOURCE_VERSION = LNG_T3.release  # pinned in scripts/common/sources.py
GEM_SOURCE = "Global Energy Monitor — Global Gas Infrastructure Tracker"

DEDUP_THRESHOLD_KM = 25.0

# Schema columns (Phase 6 adds unit_count, total_processed_bcm, un_locode at the end)
SCHEMA_COLS = [
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
    "commissioned_year",
    "decommissioned_year",
    "unit_count",
    "total_processed_bcm",
    "un_locode",
    "source",
    "source_version",
]


# ---------------------------------------------------------------------------
# LNG-T3 loader
# ---------------------------------------------------------------------------


def _load_lng_t3(path: Path = LNG_T3_RAW) -> pd.DataFrame:
    if not path.exists():
        sys.exit(f"no LNG-T3 raw at {path} — run scripts.ingest.lng_t3 first")
    df = pd.read_csv(path)
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

    out = pd.DataFrame(
        {
            "asset_id": "lngt3/"
            + df["name"].astype(str).str.replace(r"[^A-Za-z0-9]", "_", regex=True),
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
        }
    )
    # Ensure asset_id is a regular column
    out["asset_id"] = out["asset_id"].astype(pd.StringDtype())
    assert_unique_asset_ids(out)
    return out


# ---------------------------------------------------------------------------
# GEM loader (Phase 3 logic preserved + adapted)
# ---------------------------------------------------------------------------


def _load_gem(raw_dir: Path = GEM_RAW_DIR) -> pd.DataFrame:
    src = latest(raw_dir, "*.geojson")

    with src.open() as f:
        gj = json.load(f)
    feats = [
        f
        for f in gj.get("features", [])
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

        iso3 = gem_first_iso3(p.get("areas"))
        if not iso3:
            continue

        is_export = p.get("tracker-custom") == "GGIT-export"
        cap_key = (
            "totexportlngterminalcapacityinmtpa"
            if is_export
            else "totimportlngterminalcapacityinmtpa"
        )
        cap_f = to_float(p.get(cap_key))

        rows.append(
            {
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
            }
        )

    df = pd.DataFrame(rows)
    print(f"GEM: {len(df)} after geometry + status + iso3 attribution", file=sys.stderr)

    # GGIT emits one feature per liquefaction/regasification *unit*, so a
    # terminal appears 2-12 times under a single terminal-level pid (and
    # hence a single asset_id). Those features are NOT verbatim duplicates:
    # they differ in unitid/unit-name, and 48 of the 84 duplicated pids also
    # differ in the fields we retain (status 24, start-year 34, owner 17,
    # tracker-custom 4, geometry 5). The capacity on each feature is already
    # the terminal total (tot{import,export}lngterminalcapacityinmtpa), so
    # the units must be collapsed to one row, not summed. Collapse
    # deterministically (operating > in-construction, then capacity desc)
    # rather than taking whichever unit happens to come first in the file.
    n_before = len(df)
    df = collapse_duplicate_names(df, key="asset_id")
    n_dropped = n_before - len(df)
    if n_dropped:
        print(
            f"GEM: collapsed {n_dropped} extra per-unit feature(s) into their terminal rows",
            file=sys.stderr,
        )

    return df.reset_index(drop=True)


# ---------------------------------------------------------------------------
# Dedup
# ---------------------------------------------------------------------------


def _gem_records_not_in_lngt3(gem: pd.DataFrame, lng_t3: pd.DataFrame) -> pd.DataFrame:
    """Return GEM rows with NO LNG-T3 counterpart, by name or by proximity.

    Two passes, in order:
    1. Name-equality pre-pass: drop any GEM row whose (country, name) —
       case-insensitive, stripped — matches an LNG-T3 row in the same
       country. Catches same-terminal pairs whose coordinates diverge too
       far for the proximity pass below (e.g. "Ichthys FLNG Terminal": GEM
       and LNG-T3 records ~440 km apart, same country, same name).
    2. Haversine proximity pass on what's left: drop GEM rows within
       DEDUP_THRESHOLD_KM of an LNG-T3 row in the same country.
    """
    if gem.empty or lng_t3.empty:
        return gem.copy()

    name_dupe = name_matches_in_country(gem, lng_t3)
    n_name_dupe = int(name_dupe.sum())
    if n_name_dupe:
        print(
            f"GEM: {n_name_dupe} row(s) dropped by name-equality pre-pass "
            f"(same country, same name as an LNG-T3 terminal)",
            file=sys.stderr,
        )
    gem = gem.loc[~name_dupe].copy()

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
# Build
# ---------------------------------------------------------------------------


def build(lng_t3: pd.DataFrame, gem: pd.DataFrame) -> pd.DataFrame:
    """LNG-T3 rows plus the GEM rows with no LNG-T3 counterpart."""
    gem_kept = _gem_records_not_in_lngt3(gem, lng_t3)
    print(f"GEM: {len(gem_kept)} kept after 25 km dedup vs LNG-T3", file=sys.stderr)

    combined = pd.concat(
        [lng_t3.reindex(columns=SCHEMA_COLS), gem_kept.reindex(columns=SCHEMA_COLS)],
        ignore_index=True,
    )
    assert_unique_asset_ids(combined)
    name_keys = list(
        zip(
            combined["country_iso3"],
            combined["name"].str.strip().str.casefold(),
            strict=True,
        )
    )
    assert len(name_keys) == len(set(name_keys)), (
        "duplicate (country_iso3, name) pairs survived dedup: "
        f"{[k for k in name_keys if name_keys.count(k) > 1]}"
    )
    return combined


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    combined = build(_load_lng_t3(), _load_gem())
    # append_kind also drops orphan rows with a null kind left by earlier buggy
    # runs (an index-misaligned construction once produced 131 such rows).
    out = append_kind(combined, KINDS, ASSETS)

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
