"""Small value coercions shared by the transforms."""

from __future__ import annotations

import math

_BLANKS = frozenset({"", "NA", "N/A"})


def to_float(v: object) -> float | None:
    """Coerce a source value (often a string) to float; None when blank or unparseable.

    Accepts thousands separators (``"1,234.5"``); treats ``""``, ``"NA"``,
    ``"N/A"``, None and NaN as missing.
    """
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return None
    s = str(v).strip()
    if s in _BLANKS:
        return None
    try:
        return float(s.replace(",", ""))
    except (TypeError, ValueError):
        return None
