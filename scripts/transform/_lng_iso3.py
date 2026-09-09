"""Country-name → ISO3 lookup that merges all source-specific dicts.

LNG-T3 country names appear in `LNG_terminal.csv` (`areas`),
`LNG_tanker_voyage.csv` (`from_country` / `to_country`), and
`LNG_trade_daily.csv` (`from_country` / `to_country`). Names overlap
with GEM/NETL/EI conventions but Phase 6's Task 2 added an
LNG_T3_NAME_TO_ISO3 dict for the deltas.
"""
from __future__ import annotations

from scripts.common.iso3 import (
    EI_NAME_TO_ISO3,
    GEM_NAME_TO_ISO3,
    LNG_T3_NAME_TO_ISO3,
    NETL_NAME_TO_ISO3,
)

# Order matters when a name appears in multiple dicts with the same value;
# putting LNG-T3 last is harmless because no conflicting entries are expected.
_MERGED: dict[str, str] = {
    **GEM_NAME_TO_ISO3,
    **NETL_NAME_TO_ISO3,
    **EI_NAME_TO_ISO3,
    **LNG_T3_NAME_TO_ISO3,
}


def lookup_iso3(name: str | None) -> str | None:
    """Return ISO 3166-1 alpha-3 code for a country name, or None."""
    if not name:
        return None
    return _MERGED.get(name.strip())
