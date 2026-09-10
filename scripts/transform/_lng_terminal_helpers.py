"""Pure helpers shared by build_lng_terminals.py.

Kept separate so they're trivially unit-testable without loading the full
transform module (which touches raw CSV/geojson paths at import time via
constants — though not at import, this keeps parity with _refinery_dedup.py).
"""

from __future__ import annotations

import sys

import pandas as pd

# Maps raw LNG-T3 status values onto the normalized labels already used by
# GEM rows in this same table (see build_lng_terminals.py _load_gem) and by
# build_pipelines.py's STATUS_MAP. Anything not listed here passes through
# unchanged.
STATUS_NORMALIZATION: dict[str, str] = {
    "construction": "in-construction",
    "operating": "operating",
}

# Preference order for collapse_duplicate_names: lower rank wins. Covers both
# raw LNG-T3 statuses ("construction") and already-normalized ones
# ("in-construction"), since collapse may run before or after normalization.
_STATUS_RANK: dict[str, int] = {
    "operating": 0,
    "in-construction": 1,
    "construction": 1,
}


def normalize_status(raw: str) -> str:
    """Normalize a raw status string to the shared vocabulary.

    "construction" -> "in-construction", "operating" -> "operating".
    Any other value is passed through unchanged.
    """
    return STATUS_NORMALIZATION.get(raw, raw)


def collapse_duplicate_names(df: pd.DataFrame, key: str = "name") -> pd.DataFrame:
    """Collapse rows sharing the same `key` value down to a single row each.

    Two sources need this, for the same modelling reason — we keep one row
    per *physical terminal*, while the raw data carries one row per
    terminal-phase or per liquefaction/regasification unit:

    * LNG-T3 lists some terminals twice under the same `name` — once as an
      existing "operating" record and once as a separate "construction"
      (expansion-phase) record.
    * GEM GGIT emits one feature per unit, several per terminal, all
      sharing the terminal-level `pid` (and hence asset_id). The capacity
      carried on each feature is the *terminal* total
      (tot{import,export}lngterminalcapacityinmtpa), not the unit's, so
      these must be collapsed rather than summed.

    For each duplicated key we keep exactly one row: prefer "operating"
    status over "construction"/"in-construction" (unrecognized statuses
    rank lowest), then break ties by capacity descending. Deliberately
    deterministic — never positional `keep="first"` — because the
    duplicate rows differ in status, start year and owner.

    Logs "collapsed N duplicate-<key> rows (kept operating record)" to
    stderr when N > 0. No-op (and silent) when there are no duplicates.
    """
    dup_mask = df[key].duplicated(keep=False)
    n_dupes = int(dup_mask.sum())
    if n_dupes == 0:
        return df

    unique_part = df[~dup_mask]
    dup_part = df[dup_mask].copy()
    dup_part["_status_rank"] = dup_part["status"].map(
        lambda s: _STATUS_RANK.get(s, len(_STATUS_RANK))
    )
    dup_part = dup_part.sort_values(
        ["_status_rank", "capacity"], ascending=[True, False], kind="stable"
    )
    kept = dup_part.groupby(key, sort=False, as_index=False).head(1)
    kept = kept.drop(columns="_status_rank")

    n_names = df.loc[dup_mask, key].nunique()
    n_dropped = n_dupes - n_names
    print(
        f"collapsed {n_dropped} duplicate-{key} rows (kept operating record)",
        file=sys.stderr,
    )

    out = pd.concat([unique_part, kept], ignore_index=False).sort_index()
    return out


def assert_unique_asset_ids(df: pd.DataFrame) -> None:
    """Raise ValueError listing any duplicate asset_id values in df."""
    dupes = df["asset_id"][df["asset_id"].duplicated(keep=False)]
    if not dupes.empty:
        ids = sorted(dupes.unique().tolist(), key=str)
        raise ValueError(f"duplicate asset_id values found: {ids}")


def _normalize_name(name: object) -> str:
    """Case-fold and strip a terminal name for equality comparison."""
    return str(name).strip().casefold()


def name_matches_in_country(gem: pd.DataFrame, lng_t3: pd.DataFrame) -> pd.Series:
    """Boolean mask over `gem` rows whose (country_iso3, name) — case-insensitive,
    stripped — matches an LNG-T3 row in the same country.

    This is a pre-pass ahead of the haversine proximity dedup: two sources can
    carry the *same named terminal* at coordinates far enough apart (hundreds
    of km — e.g. differing site precision, or a relocated pin) that the 25 km
    proximity check alone lets both rows through. An exact name match within
    the same country is a stronger, independent signal that these are the
    same physical terminal, so it's checked first, ahead of proximity.
    """
    if gem.empty or lng_t3.empty:
        return pd.Series(False, index=gem.index)

    t3_keys = set(zip(lng_t3["country_iso3"], lng_t3["name"].map(_normalize_name), strict=True))
    gem_keys = list(zip(gem["country_iso3"], gem["name"].map(_normalize_name), strict=True))
    return pd.Series([k in t3_keys for k in gem_keys], index=gem.index)
