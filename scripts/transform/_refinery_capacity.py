"""Parse NETL Refineries `capacity` string field to numeric kbpd.

NETL stores capacities as strings in bbl/d.  Probe (Phase 5):
  * 97% of populated values are pure numbers like "59000" or "150,000"
  * 3% are HTML-wrapped: "<table>...150,000 bpd crude capacity</td>..."
  * Blank/whitespace/None/"n/a" → None
"""
from __future__ import annotations

import re

_HTML_TAG = re.compile(r"<[^>]+>")
_FIRST_NUMBER = re.compile(r"[\d,]+")


def parse_netl_capacity_kbpd(value: str | None) -> float | None:
    """Return capacity in kbpd, or None if value is blank/unparseable.

    Assumes input is bbl/d (consistent with probed NETL data ranging
    12k–323k, matching typical refinery throughputs in barrels/day).
    """
    if value is None:
        return None
    s = _HTML_TAG.sub("", value).strip()
    if not s:
        return None
    m = _FIRST_NUMBER.search(s)
    if not m:
        return None
    raw = m.group(0).replace(",", "")
    if not raw:
        return None
    try:
        bpd = float(raw)
    except ValueError:
        return None
    return bpd / 1000.0
