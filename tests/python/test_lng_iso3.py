"""Unit tests for the LNG country-name → ISO3 lookup."""
from __future__ import annotations

from scripts.transform._lng_iso3 import lookup_iso3


def test_lookup_resolves_lng_t3_specific_name():
    # Whatever Task 2 added to LNG_T3_NAME_TO_ISO3 should be reachable.
    # Test a name that GEM/NETL/EI definitely cover, to assert the merge works:
    assert lookup_iso3("China") == "CHN"


def test_lookup_resolves_united_states_variants():
    # "United States" appears in LNG-T3 voyage data
    assert lookup_iso3("United States") == "USA"


def test_lookup_returns_none_for_unknown():
    assert lookup_iso3("Atlantis") is None


def test_lookup_strips_whitespace():
    assert lookup_iso3("  China  ") == "CHN"


def test_lookup_handles_none_input():
    assert lookup_iso3(None) is None
