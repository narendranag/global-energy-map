"""Comtrade transform: the two aggregation traps, and the coverage floor.

Both traps inflate totals silently — the data looks fine, it is just wrong by
a factor. They were caught by cross-checking against BACI, not by the build
failing, so they get tests.
"""

from __future__ import annotations

import json

import pandas as pd
import pytest

from scripts.transform import build_comtrade_monthly as m


def _row(**over):
    """A totals-partition row for Germany importing from Kazakhstan."""
    base = {
        "reporterCode": 276,  # DEU
        "partnerCode": 398,  # KAZ
        "cmdCode": "2709",
        "customsCode": "C00",
        "motCode": 0,
        "partner2Code": 0,
        "primaryValue": 100.0,
        "qty": 10.0,
    }
    base.update(over)
    return base


def _write(tmp_path, period, cmd, rows):
    (tmp_path / f"{period}_{cmd}.json").write_text(json.dumps(rows))


@pytest.fixture
def raw(tmp_path, monkeypatch):
    monkeypatch.setattr(m, "RAW_DIR", tmp_path)
    monkeypatch.setattr(m, "MIN_REPORTERS", 0)  # coverage tested separately
    monkeypatch.setattr(m, "_load_baci_country_map", lambda: {276: "DEU", 398: "KAZ", 842: "USA"})
    return tmp_path


def test_partitioned_subrows_are_excluded(raw):
    """Comtrade repeats a pair partitioned by customs / transport / partner2.

    Summing them inflated Germany's 2025 crude imports to $319bn against BACI's
    $42bn. Only the C00 / mode 0 / partner2 0 row is the pair's total.
    """
    _write(
        raw,
        "202501",
        "2709",
        [
            _row(),  # the totals row
            _row(customsCode="C01", primaryValue=60.0),
            _row(motCode=2100, primaryValue=52.0),
            _row(partner2Code=643, primaryValue=85.0),
        ],
    )
    df = m.build()
    assert len(df) == 1
    assert df.iloc[0]["value_usd"] == 100.0


def test_world_aggregate_partner_is_excluded(raw):
    """partnerCode 0 is the reporter's total trade, not a bilateral flow."""
    _write(raw, "202501", "2709", [_row(), _row(partnerCode=0, primaryValue=9999.0)])
    df = m.build()
    assert len(df) == 1
    assert df.iloc[0]["exporter_iso3"] == "KAZ"


def test_unmapped_and_self_trade_rows_are_dropped(raw):
    _write(
        raw,
        "202501",
        "2709",
        [
            _row(),
            _row(partnerCode=99999),  # not in the country map
            _row(partnerCode=276),  # DEU → DEU
        ],
    )
    df = m.build()
    assert len(df) == 1


def test_thin_months_are_dropped_and_coverage_is_recorded(tmp_path, monkeypatch):
    """A month with almost no reporters would draw a collapse that is reporting lag."""
    monkeypatch.setattr(m, "RAW_DIR", tmp_path)
    monkeypatch.setattr(m, "MIN_REPORTERS", 2)
    monkeypatch.setattr(m, "_load_baci_country_map", lambda: {276: "DEU", 398: "KAZ", 842: "USA"})
    # Fat month: two importers. Thin month: one.
    _write(tmp_path, "202501", "2709", [_row(), _row(reporterCode=842)])
    _write(tmp_path, "202502", "2709", [_row()])

    df = m.build()
    assert {str(d)[:7] for d in df["month"]} == {"2025-01"}
    assert df["reporters_in_month"].unique().tolist() == [2]


def test_month_becomes_the_first_of_the_month(raw):
    _write(raw, "202503", "2709", [_row()])
    df = m.build()
    assert str(df.iloc[0]["month"]) == "2025-03-01"
    assert pd.api.types.is_object_dtype(df["month"]) or df["month"].dtype == object
