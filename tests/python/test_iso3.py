from scripts.common.iso3 import EI_NAME_TO_ISO3, GEM_NAME_TO_ISO3, lookup


def test_known_ei_names():
    assert lookup("Saudi Arabia", "ei") == "SAU"
    assert lookup("US", "ei") == "USA"


def test_known_gem_names():
    assert lookup("Saudi Arabia", "gem") == "SAU"
    assert lookup("United States", "gem") == "USA"


def test_unknown_name_returns_none():
    assert lookup("Atlantis", "ei") is None


def test_dicts_are_non_trivial():
    assert len(EI_NAME_TO_ISO3) >= 40
    assert len(GEM_NAME_TO_ISO3) >= 80
