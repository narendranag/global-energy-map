"""ODP energy-context spike: the pure normalisers over the synthetic fixture.

Needs neither ODP (an opt-in dependency group) nor the network.
"""

from __future__ import annotations

import re

import pandas as pd
import pytest

from scripts.ingest import odp_energy_context as m

FIXTURE = m.FIXTURE_DIR
REGISTRY = m.REPO_ROOT / "src" / "lib" / "scenarios" / "registry.ts"


def _raw(name: str) -> pd.DataFrame:
    return pd.read_csv(FIXTURE / f"{name}.csv").set_index("date")


@pytest.fixture(scope="module")
def raw() -> dict[str, pd.DataFrame]:
    return {p.stem: _raw(p.stem) for p in sorted(FIXTURE.glob("*.csv"))}


@pytest.fixture(scope="module")
def tidy(raw) -> pd.DataFrame:
    return m.tidy_all(raw)


def test_tidy_table_has_the_one_schema(tidy):
    assert list(tidy.columns) == m.ENERGY_CONTEXT_COLUMNS
    assert tidy["value"].dtype == "float64"
    assert tidy["value"].notna().all()
    assert tidy["date"].str.fullmatch(r"\d{4}-\d{2}-\d{2}").all()
    assert set(tidy["source"]) == {"imf_pcps", "eia_spot", "jodi", "portwatch"}


def test_imf_keeps_usd_rows_only_and_dates_months_by_their_first_day(raw):
    out = m.tidy_imf_pcps(raw["imf_pcps"])
    usd = raw["imf_pcps"]["data_transformation_code"].eq("USD").sum()
    assert len(out) == usd
    assert out["date"].str.endswith("-01").all()
    assert set(out["series_id"]) == {sid for sid, _ in m.IMF_PCPS.values()}


def test_eia_keeps_only_the_three_benchmarks(raw):
    frame = raw["eia_spot"].copy()
    frame.loc["2026-01-01"] = {"series": "EER_EPD2DXL0_PF4_RGC_DPG", "value": 4.7, "units": "$"}
    out = m.tidy_eia_spot(frame)
    assert set(out["series_id"]) == {"brent_usd_bbl", "wti_usd_bbl", "henry_hub_usd_mmbtu"}
    assert (out["frequency"] == "daily").all()


def test_jodi_maps_every_column_to_iso3(raw):
    out = m.tidy_jodi(raw["jodi_crude_production"], "crude_production", "kb/d")
    assert out["iso3"].str.fullmatch(r"[A-Z]{3}").all()
    assert {"SAU", "USA", "KOR"} <= set(out["iso3"])


def test_jodi_fails_loudly_on_a_country_it_does_not_know():
    frame = pd.DataFrame({"atlantis": [1.0]}, index=pd.Index(["2026-01-01"], name="date"))
    with pytest.raises(ValueError, match="atlantis"):
        m.tidy_jodi(frame, "crude_production", "kb/d")


def test_portwatch_display_names_reach_every_mapped_scenario(raw):
    out = m.tidy_portwatch(raw["portwatch"])
    # "Bab el-Mandeb Strait" must fold onto ODP's "bab_el-mandeb_strait" key.
    assert set(out["scenario_id"]) == set(m.PORTWATCH_CHOKEPOINTS.values())
    assert out["iso3"].isna().all()


def test_every_chokepoint_maps_to_a_real_scenario_id():
    ids = set(re.findall(r'id: "([a-z_]+)"', REGISTRY.read_text()))
    assert set(m.PORTWATCH_CHOKEPOINTS.values()) <= ids


def test_latest_vs_trailing(tidy):
    got = m.latest_vs_trailing(tidy, series_id="transits_tanker", key="hormuz", window=4)
    # Synthetic ramp 10.0, 10.5, …: the last of 14 is 16.5; the four before average 15.25.
    assert got["value"] == pytest.approx(16.5)
    assert got["trailing_mean"] == pytest.approx(15.25)
    assert got["change_pct"] == pytest.approx((16.5 - 15.25) / 15.25 * 100)


def test_latest_vs_trailing_refuses_a_short_series(tidy):
    with pytest.raises(ValueError, match="need"):
        m.latest_vs_trailing(tidy, series_id="transits_tanker", key="hormuz", window=400)
