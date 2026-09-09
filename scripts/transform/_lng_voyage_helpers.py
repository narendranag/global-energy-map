"""Pure helpers shared by build_lng_voyages.py.

Kept separate so they're trivially unit-testable without loading the full
transform module (which touches raw CSV paths at import time via
constants — parity with _lng_terminal_helpers.py / _refinery_dedup.py).
"""
from __future__ import annotations

import pandas as pd


def make_unique_ids(base_ids: pd.Series) -> pd.Series:
    """Disambiguate a Series of candidate ids that may contain duplicates.

    voyage_id is built from start_date + IMO + voyage_type, which is not
    always unique — 13 collisions were found in the shipped LNG-T3 voyage
    data (e.g. a vessel with two same-day departures of the same type).

    Ids that don't collide with any other row are returned unchanged. Each
    id that does collide gets a `_<n>` suffix (0-indexed, stable row order)
    per its position within its colliding group, so the full set of
    returned ids is always unique. Never mutates `base_ids`.
    """
    dup_mask = base_ids.duplicated(keep=False)
    if not dup_mask.any():
        return base_ids.copy()

    out = base_ids.copy()
    suffix = base_ids.groupby(base_ids).cumcount()
    out.loc[dup_mask] = (
        base_ids.loc[dup_mask] + "_" + suffix.loc[dup_mask].astype(str)
    )
    return out
