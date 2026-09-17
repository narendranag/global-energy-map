"""GIE AGSI/ALSI transform: "-" is absent data, not zero."""

from __future__ import annotations

import json

import pytest

from scripts.transform import build_gie_daily as m


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("67.3676", 67.3676),
        ("0", 0.0),
        # GIE's own placeholders for "this does not apply here".
        ("-", None),
        ("", None),
        ("  ", None),
        ("N/A", None),
        (None, None),
        # A dict arrives when we ask for a nested parent by mistake.
        ({"gwh": "1"}, None),
        ([], None),
    ],
)
def test_num_parsing(raw, expected):
    assert m._num(raw) == expected


def test_field_reads_nested_and_survives_a_scalar():
    row = {"inventory": {"gwh": "10892.85"}, "sendOut": "334.7"}
    assert m._field(row, "inventory.gwh") == "10892.85"
    assert m._field(row, "sendOut") == "334.7"
    # ALSI sends "-" instead of the dict for countries with no LNG at all.
    assert m._field({"inventory": "-"}, "inventory.gwh") is None
    assert m._field({}, "inventory.gwh") is None


def _write(tmp_path, dataset, code, rows):
    d = tmp_path / dataset
    d.mkdir(parents=True, exist_ok=True)
    (d / f"{code}.json").write_text(json.dumps(rows))


def test_landlocked_country_yields_no_lng_rows(tmp_path, monkeypatch):
    """Austria has no LNG terminals; ALSI returns "-" for every field.

    A zero row would be a factual claim that Austria sent out no LNG that day.
    It has no terminals — the correct output is no row.
    """
    monkeypatch.setattr(m, "RAW_DIR", tmp_path)
    _write(
        tmp_path,
        "agsi",
        "AT",
        [
            {
                "gasDayStart": "2026-09-17",
                "full": "67.4",
                "gasInStorage": "9.0",
                "workingGasVolume": "13.4",
            },
        ],
    )
    _write(
        tmp_path,
        "alsi",
        "AT",
        [
            {"gasDayStart": "2026-09-17", "inventory": "-", "sendOut": "-"},
        ],
    )

    df = m.build()
    assert set(df["metric"]) == {
        "gas_storage_full_pct",
        "gas_in_storage_twh",
        "gas_working_volume_twh",
    }
    assert df["iso3"].unique().tolist() == ["AUT"]


def test_iso2_is_translated_and_unknown_codes_are_skipped(tmp_path, monkeypatch):
    monkeypatch.setattr(m, "RAW_DIR", tmp_path)
    _write(tmp_path, "agsi", "DE", [{"gasDayStart": "2026-09-17", "full": "80.0"}])
    _write(tmp_path, "agsi", "ZZ", [{"gasDayStart": "2026-09-17", "full": "10.0"}])
    _write(tmp_path, "alsi", "DE", [])

    df = m.build()
    assert df["iso3"].unique().tolist() == ["DEU"]


def test_duplicate_gas_days_keep_the_last_reading(tmp_path, monkeypatch):
    """GIE restates a gas day as late meter readings land; the newer one wins."""
    monkeypatch.setattr(m, "RAW_DIR", tmp_path)
    _write(
        tmp_path,
        "agsi",
        "DE",
        [
            {"gasDayStart": "2026-09-17", "full": "80.0"},
            {"gasDayStart": "2026-09-17", "full": "81.5"},
        ],
    )
    _write(tmp_path, "alsi", "DE", [])

    df = m.build()
    assert len(df) == 1
    assert df.iloc[0]["value"] == 81.5


def test_every_ingested_country_code_is_mapped():
    """A new GIE country must not be silently dropped by the transform."""
    from scripts.ingest.gie_daily import COUNTRIES

    assert set(COUNTRIES) <= set(m.ISO2_TO_ISO3), set(COUNTRIES) - set(m.ISO2_TO_ISO3)
