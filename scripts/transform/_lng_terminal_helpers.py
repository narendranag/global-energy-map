"""Pure helpers shared by build_lng_terminals.py.

Kept separate so they're trivially unit-testable without loading the full
transform module (which touches raw CSV/geojson paths at import time via
constants — though not at import, this keeps parity with _refinery_dedup.py).
"""
from __future__ import annotations

import pandas as pd

# Maps raw LNG-T3 status values onto the normalized labels already used by
# GEM rows in this same table (see build_lng_terminals.py _load_gem) and by
# build_pipelines.py's STATUS_MAP. Anything not listed here passes through
# unchanged.
STATUS_NORMALIZATION: dict[str, str] = {
    "construction": "in-construction",
    "operating": "operating",
}


def normalize_status(raw: str) -> str:
    """Normalize a raw status string to the shared vocabulary.

    "construction" -> "in-construction", "operating" -> "operating".
    Any other value is passed through unchanged.
    """
    return STATUS_NORMALIZATION.get(raw, raw)


def assert_unique_asset_ids(df: pd.DataFrame) -> None:
    """Raise ValueError listing any duplicate asset_id values in df."""
    dupes = df["asset_id"][df["asset_id"].duplicated(keep=False)]
    if not dupes.empty:
        ids = sorted(dupes.unique().tolist(), key=str)
        raise ValueError(f"duplicate asset_id values found: {ids}")
