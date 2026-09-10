"""Tests for the EI Statistical Review wide-sheet parser (build_country_year)."""

from __future__ import annotations

import pandas as pd
import pytest

from scripts.transform.build_country_year import (
    _leading_year_columns,
    _parse_wide_sheet,
    assert_unique_keys,
)


def _ei_like_sheet() -> pd.DataFrame:
    """Mimic the EI layout: title rows, a year header whose trailing
    "growth rate" / "share" columns repeat the last year, then data rows."""
    rows = [
        ["Oil: Proved reserves", None, None, None, None, None, None],
        [None, None, None, None, "Growth rate per annum", None, "Share"],
        ["Thousand million barrels", 2018.0, 2019.0, 2020.0, 2020, "2009-19", 2020],
        [None, None, None, None, None, None, None],
        ["Saudi Arabia", 297.7, 297.6, 297.5, -0.00017, 0.001, 0.1717],
        ["Total Middle East", 836.0, 835.9, 835.9, 0.0, 0.0, 0.48],
        ["Atlantis", 1.0, 1.0, 1.0, 0.0, 0.0, 0.0],
        ["Iraq", 145.0, None, 145.0, 0.0, 0.0, 0.08],
    ]
    return pd.DataFrame(rows)


def test_leading_year_columns_stops_at_repeated_year():
    header = ["Thousand million barrels", 2018.0, 2019.0, 2020.0, 2020, "2009-19", 2020]
    assert _leading_year_columns(header) == [(1, 2018), (2, 2019), (3, 2020)]


def test_leading_year_columns_stops_at_first_non_year():
    header = ["x", 1990.0, 1991.0, "note", 1992.0]
    assert _leading_year_columns(header) == [(1, 1990), (2, 1991)]


def test_leading_year_columns_skips_blank_prefix_cells():
    # Blank cells before the first year do not start the run.
    header = ["x", None, 2000.0, 2001.0]
    assert _leading_year_columns(header) == [(2, 2000), (3, 2001)]


def test_parse_wide_sheet_one_row_per_year_and_drops_aggregates():
    df = _parse_wide_sheet(
        _ei_like_sheet(),
        header_row=2,
        data_start_row=4,
        metric="proved_reserves_oil_bbn_bbl",
        unit="bn bbl",
        year_min=1990,
    )
    assert set(df["iso3"]) == {"SAU", "IRQ"}
    sau = df[df["iso3"] == "SAU"].set_index("year")["value"].to_dict()
    assert sau == {2018: 297.7, 2019: 297.6, 2020: 297.5}
    # Missing cell produces no row (not a zero).
    irq_years = sorted(df.loc[df["iso3"] == "IRQ", "year"])
    assert irq_years == [2018, 2020]
    # Uniqueness holds.
    assert not df.duplicated(["iso3", "metric", "year"]).any()


def test_parse_wide_sheet_logs_unmapped_names(capsys):
    _parse_wide_sheet(
        _ei_like_sheet(),
        header_row=2,
        data_start_row=4,
        metric="m",
        unit="u",
        year_min=1990,
    )
    err = capsys.readouterr().err
    assert "Atlantis" in err


def test_assert_unique_keys_raises_on_duplicates():
    df = pd.DataFrame(
        {
            "iso3": ["SAU", "SAU"],
            "metric": ["m", "m"],
            "year": [2020, 2020],
            "value": [297.5, 0.17],
        }
    )
    with pytest.raises(ValueError, match="SAU"):
        assert_unique_keys(df)


def test_canada_is_not_mistaken_for_an_aggregate():
    # A "Can" prefix skip (meant for "Canadian Oil Sands" sub-rows) used to
    # drop Canada entirely.
    sheet = pd.DataFrame(
        [
            ["Thousand million barrels", 2019.0, 2020.0, 2020],
            ["Canada", 169.4, 168.1, 0.097],
            ["Canadian Oil Sands: Total", 162.4, 161.4, 0.093],
        ]
    )
    df = _parse_wide_sheet(
        sheet, header_row=0, data_start_row=1, metric="m", unit="u", year_min=1990
    )
    assert df.loc[df["iso3"] == "CAN", "value"].tolist() == [169.4, 168.1]
    assert len(df) == 2


def test_gas_reserve_holders_are_mapped():
    from scripts.common.iso3 import EI_NAME_TO_ISO3

    for name, iso3 in {
        "Bahrain": "BHR",
        "Bangladesh": "BGD",
        "Bolivia": "BOL",
        "Germany": "DEU",
        "Israel": "ISR",
        "Myanmar": "MMR",
        "Netherlands": "NLD",
        "Pakistan": "PAK",
        "Papua New Guinea": "PNG",
        "Poland": "POL",
        "Ukraine": "UKR",
    }.items():
        assert EI_NAME_TO_ISO3.get(name) == iso3
