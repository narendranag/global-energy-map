"""Integrity checks over the SHIPPED files in public/data (no network, no data/raw).

Would have caught review findings R1 (duplicate EI years), R2 (BACI
pseudo-countries), R3/R4 (asset truncation / unit drift) and R5 (catalog lies).
If one of these fails after a transform, fix the transform — then re-run
`uv run python -m scripts.transform.build_catalog` (it records sizes/hashes).
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pandas as pd
import pytest

from scripts.common.iso3 import TRADE_ISO3_ALLOWLIST
from scripts.transform.build_disruption_routing import UNSOURCED

DATA = Path("public/data")
CATALOG = json.loads((DATA / "catalog.json").read_text())
ENTRIES = CATALOG["entries"]


def _disk(entry_path: str) -> Path:
    return Path("public") / entry_path.lstrip("/")


def _ne_iso3() -> set[str]:
    gj = json.loads((DATA / "countries.geojson").read_text())
    return {f["properties"]["iso3"] for f in gj["features"]}


# ── catalog ↔ disk ──────────────────────────────────────────────────────────


def test_every_catalog_path_exists():
    missing = [e["path"] for e in ENTRIES if not _disk(e["path"]).exists()]
    assert not missing, f"catalog lists files that do not exist: {missing}"


def test_every_shipped_file_is_catalogued():
    catalogued = {_disk(e["path"]).resolve() for e in ENTRIES}
    on_disk = {
        p.resolve()
        for p in DATA.iterdir()
        if p.is_file() and p.name != "catalog.json" and not p.name.startswith(".")
    }
    uncatalogued = sorted(p.name for p in on_disk - catalogued)
    assert not uncatalogued, f"files in public/data missing from catalog: {uncatalogued}"


@pytest.mark.parametrize("entry", ENTRIES, ids=[e["id"] for e in ENTRIES])
def test_catalog_hash_and_size_match_disk(entry):
    path = _disk(entry["path"])
    assert entry["bytes"] == path.stat().st_size, (
        f"{entry['id']}: size changed — re-run scripts.transform.build_catalog"
    )
    assert entry["sha256"] == hashlib.sha256(path.read_bytes()).hexdigest(), (
        f"{entry['id']}: sha256 changed — re-run scripts.transform.build_catalog"
    )


def test_catalog_ids_unique_and_dates_normalised():
    ids = [e["id"] for e in ENTRIES]
    assert len(ids) == len(set(ids))
    for e in ENTRIES:
        assert len(e["as_of"]) == 10 and e["as_of"][4] == "-" and e["as_of"][7] == "-", e


# ── country_year_series ─────────────────────────────────────────────────────


@pytest.fixture(scope="module")
def cys() -> pd.DataFrame:
    return pd.read_parquet(DATA / "country_year_series.parquet")


def test_country_year_key_unique(cys):
    dups = cys[cys.duplicated(["iso3", "metric", "year"], keep=False)]
    assert dups.empty, f"duplicate (iso3, metric, year):\n{dups.head(10)}"


def test_reserves_end_2020_and_non_negative(cys):
    res = cys[cys["metric"].str.startswith("proved_reserves")]
    assert res["year"].max() == 2020
    assert (res["value"] >= 0).all()


def test_production_reaches_2024(cys):
    assert cys.loc[cys["metric"] == "production_crude_kbpd", "year"].max() == 2024


def test_key_reserve_holders_present_for_2020(cys):
    y2020 = cys[cys["year"] == 2020]
    oil = set(y2020.loc[y2020["metric"] == "proved_reserves_oil_bbn_bbl", "iso3"])
    gas = set(y2020.loc[y2020["metric"] == "proved_reserves_gas_tcm", "iso3"])
    missing_oil = {"SAU", "VEN", "CAN", "IRN", "IRQ", "RUS", "USA", "KWT", "ARE"} - oil
    missing_gas = {"RUS", "IRN", "QAT", "USA", "SAU", "TKM"} - gas
    assert not missing_oil, f"2020 oil reserves missing for {missing_oil}"
    assert not missing_gas, f"2020 gas reserves missing for {missing_gas}"


def test_saudi_2020_oil_reserves_is_the_real_value(cys):
    v = cys.loc[
        (cys["iso3"] == "SAU")
        & (cys["year"] == 2020)
        & (cys["metric"] == "proved_reserves_oil_bbn_bbl"),
        "value",
    ]
    assert len(v) == 1 and 290 < v.iloc[0] < 300


# ── trade_flow ──────────────────────────────────────────────────────────────


def test_trade_flow_codes_are_real_countries():
    tf = pd.read_parquet(DATA / "trade_flow.parquet", columns=["exporter_iso3", "importer_iso3"])
    valid = _ne_iso3() | set(TRADE_ISO3_ALLOWLIST)
    bad = (set(tf["exporter_iso3"]) | set(tf["importer_iso3"])) - valid
    assert not bad, f"trade_flow has non-country codes: {sorted(bad)}"


def test_trade_flow_key_unique():
    tf = pd.read_parquet(DATA / "trade_flow.parquet")
    assert not tf.duplicated(["year", "hs_code", "exporter_iso3", "importer_iso3"]).any()


# ── assets ──────────────────────────────────────────────────────────────────

EXPECTED_KINDS = {"extraction_site", "refinery", "lng_export", "lng_import", "storage", "port"}


@pytest.fixture(scope="module")
def assets() -> pd.DataFrame:
    return pd.read_parquet(DATA / "assets.parquet")


def test_assets_kind_non_null_and_expected(assets):
    assert assets["kind"].notna().all()
    assert set(assets["kind"]) == EXPECTED_KINDS


def test_assets_asset_id_unique(assets):
    assert assets["asset_id"].is_unique


def test_assets_capacity_unit_single_value_per_kind(assets):
    per_kind = assets.groupby("kind")["capacity_unit"].nunique(dropna=True)
    multi = per_kind[per_kind > 1]
    assert multi.empty, f"kinds with more than one capacity_unit: {multi.to_dict()}"


def test_extraction_capacity_unit_is_declared(assets):
    ext = assets[assets["kind"] == "extraction_site"]
    assert (ext["capacity_unit"] == "kboe/d").all()


# ── disruption_route ────────────────────────────────────────────────────────


def test_disruption_route_rows_are_cited():
    dr = pd.read_parquet(DATA / "disruption_route.parquet")
    for col in ("source_title", "source_note"):
        assert dr[col].notna().all() and (dr[col].str.strip() != "").all(), col
    assert dr["source_year"].notna().all()
    sourced = dr[dr["source_title"] != UNSOURCED]
    assert sourced["source_url"].str.startswith("https://").all()
