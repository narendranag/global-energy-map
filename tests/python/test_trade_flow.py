"""Tests for BACI pseudo-country filtering in build_trade_flow."""

from __future__ import annotations

import pandas as pd

from scripts.common.iso3 import TRADE_ISO3_ALLOWLIST
from scripts.transform.build_trade_flow import (
    drop_non_country_codes,
    load_natural_earth_iso3,
    valid_trade_iso3,
)


def _frame() -> pd.DataFrame:
    return pd.DataFrame(
        {
            "year": [2020, 2020, 2020, 2020, 2020],
            "exporter_iso3": ["SAU", "SAU", "SAU", "ZA1", "SAU"],
            "importer_iso3": ["CHN", "S19", "SGP", "CHN", "PUS"],
            "hs_code": ["2709"] * 5,
            "value_usd": [100.0, 50.0, 30.0, 7.0, 1.0],
            "qty": [10.0, 5.0, 3.0, 0.7, 0.1],
        }
    )


def test_only_real_codes_survive():
    valid = {"SAU", "CHN"} | TRADE_ISO3_ALLOWLIST
    kept, dropped = drop_non_country_codes(_frame(), valid)
    pairs = set(zip(kept["exporter_iso3"], kept["importer_iso3"], strict=True))
    assert pairs == {("SAU", "CHN"), ("SAU", "SGP")}
    # Summary lists each dropped pseudo-code with its summed qty.
    summary = dropped.set_index("code")["qty"].to_dict()
    assert summary == {"S19": 5.0, "ZA1": 0.7, "PUS": 0.1}


def test_allowlist_excludes_aggregates_and_includes_small_states():
    for pseudo in ("S19", "ZA1", "PUS"):
        assert pseudo not in TRADE_ISO3_ALLOWLIST
    for real in ("SGP", "BHR", "HKG", "MLT"):
        assert real in TRADE_ISO3_ALLOWLIST
    assert all(len(c) == 3 and c.isalpha() and c.isupper() for c in TRADE_ISO3_ALLOWLIST)


def test_natural_earth_set_loads_from_shipped_geojson():
    ne = load_natural_earth_iso3()
    assert {"SAU", "CHN", "USA", "TWN"} <= ne
    assert "S19" not in ne
    assert {"S19", "ZA1"}.isdisjoint(valid_trade_iso3())


def test_s19_other_asia_nes_is_remapped_to_taiwan_and_summed():
    from scripts.transform.build_trade_flow import remap_baci_codes

    df = pd.DataFrame(
        {
            "year": [2020, 2020, 2020],
            "exporter_iso3": ["SAU", "SAU", "S19"],
            "importer_iso3": ["S19", "TWN", "JPN"],
            "hs_code": ["2709"] * 3,
            "value_usd": [50.0, 5.0, 2.0],
            "qty": [5.0, 0.5, 0.2],
            "qty_unit": ["tonnes"] * 3,
            "source": ["BACI (CEPII)"] * 3,
        }
    )
    out = remap_baci_codes(df)
    assert "S19" not in set(out["exporter_iso3"]) | set(out["importer_iso3"])
    sau_twn = out[(out["exporter_iso3"] == "SAU") & (out["importer_iso3"] == "TWN")]
    assert len(sau_twn) == 1
    assert sau_twn["qty"].iloc[0] == 5.5
    assert sau_twn["value_usd"].iloc[0] == 55.0
    assert len(out) == 2


def test_repair_quantities_reestimates_implausible_unit_values():
    import pandas as pd

    from scripts.transform.build_trade_flow import repair_quantities

    # Median unit value for (2709, 2023) is 600 USD/t. PHL<-SAU has qty inflated
    # ~20x (30 USD/t); TWN<-SAU has qty deflated ~1000x; the rest are plausible.
    df = pd.DataFrame(
        {
            "year": [2023] * 5,
            "importer_iso3": ["PHL", "TWN", "JPN", "KOR", "CHN"],
            "exporter_iso3": ["SAU"] * 5,
            "hs_code": ["2709"] * 5,
            "value_usd": [2.1e9, 6.0e9, 6.0e9, 5.4e9, 6.6e9],
            "qty": [70e6, 1e4, 10e6, 9e6, 11e6],
            "qty_unit": ["tonnes"] * 5,
            "source": ["BACI (CEPII)"] * 5,
        }
    )
    out, report = repair_quantities(df, band=5.0)
    by = out.set_index("importer_iso3")
    assert by.loc["PHL", "qty_imputed"] and by.loc["TWN", "qty_imputed"]
    assert not by.loc[["JPN", "KOR", "CHN"], "qty_imputed"].any()
    assert by.loc["PHL", "qty"] == 2.1e9 / 600  # value / median unit value
    assert by.loc["PHL", "qty_reported"] == 70e6  # original kept for audit
    assert by.loc["JPN", "qty"] == 10e6 and pd.isna(by.loc["JPN", "qty_reported"])
    assert out["value_usd"].equals(df["value_usd"])  # values untouched
    assert set(report["importer_iso3"]) == {"PHL", "TWN"}
