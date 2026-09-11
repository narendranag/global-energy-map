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


def test_storage_has_no_epa_cleanup_or_spill_plan_records(assets):
    # build_storage drops EPA records that are not bulk storage (2026-09-11):
    # leaking-tank cleanup sites (their status says so) and SPCC / state-list
    # sites. The US count sits near FRP + EIA terminals (3,669 + 1,460).
    storage = assets[assets["kind"] == "storage"]
    assert not storage["status"].fillna("").str.contains("LEAKING UNDERGROUND").any()
    us = int((storage["country_iso3"] == "USA").sum())
    assert 5_000 <= us <= 5_300, us


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


def test_no_two_netl_refineries_within_1km_same_country(assets):
    from scripts.transform._refinery_dedup import NETL_SELF_DEDUP_KM, cluster_same_country
    from scripts.transform.build_refineries import NETL_SOURCE

    netl = assets[(assets["kind"] == "refinery") & (assets["source"] == NETL_SOURCE)]
    labels = cluster_same_country(netl.reset_index(drop=True), NETL_SELF_DEDUP_KM)
    assert len(set(labels)) == len(netl), (
        f"{len(netl) - len(set(labels))} NETL refineries have a same-country neighbour "
        f"within {NETL_SELF_DEDUP_KM} km without a conflicting capacity — re-run "
        "scripts.transform.build_refineries"
    )


def test_netl_refinery_names_unique_where_the_source_allows(assets):
    from scripts.transform.build_refineries import NETL_SOURCE

    netl = assets[(assets["kind"] == "refinery") & (assets["source"] == NETL_SOURCE)]
    # Plants whose only listings share a name can still repeat, but the
    # generic Myanmar operator name must not (it had located variants).
    mmr = netl.loc[netl["country_iso3"] == "MMR", "name"]
    assert mmr.is_unique, mmr.tolist()


# ── assets_open (downloadable open subset of assets.parquet) ────────────────


def test_assets_open_has_no_osm_rows():
    from scripts.transform.build_refineries import OSM_SOURCE

    open_ = pd.read_parquet(DATA / "assets_open.parquet", columns=["source"])
    assert not (open_["source"] == OSM_SOURCE).any()
    assert not open_["source"].str.contains("OpenStreetMap", case=False).any()


def test_assets_open_is_assets_minus_osm(assets):
    from scripts.transform.build_refineries import OSM_SOURCE

    open_ = pd.read_parquet(DATA / "assets_open.parquet")
    expected = assets[assets["source"] != OSM_SOURCE].reset_index(drop=True)
    n_osm = int((assets["source"] == OSM_SOURCE).sum())
    assert n_osm > 0
    assert len(open_) == len(assets) - n_osm
    pd.testing.assert_frame_equal(open_, expected)


def test_assets_open_sources_are_open_licensed():
    open_ = pd.read_parquet(DATA / "assets_open.parquet", columns=["source"])
    allowed = ("Global Energy Monitor", "Zhou, C. 2026, LNG-T3", "NETL", "National Energy")
    bad = sorted(s for s in set(open_["source"]) if not s.startswith(allowed))
    assert not bad, f"assets_open.parquet has rows from unexpected sources: {bad}"


def test_assets_open_catalog_entry():
    entry = next(e for e in ENTRIES if e["id"] == "assets_open")
    assert entry["downloadable"] is True and entry["redistributable"] is True
    assert entry["runtime"] is False and entry["layers"] == []
    assets_rows = sum(e["rows"] for e in ENTRIES if e["path"] == "/data/assets.parquet")
    osm_rows = next(e["rows"] for e in ENTRIES if e["id"] == "osm_refineries")
    assert entry["rows"] == assets_rows - osm_rows


# ── pipelines.geojson ───────────────────────────────────────────────────────


def _line_parts(geom: dict) -> list:
    return [geom["coordinates"]] if geom["type"] == "LineString" else geom["coordinates"]


def test_pipelines_sidecar_fragments_are_merged():
    """Render budget: deck.gl draws every line part as its own path, and under
    software WebGL the unmerged GGIT sidecar (173,570 parts / 455,780 vertices;
    Tennessee Gas Pipeline alone 62,967 parts) took ~15 s per frame on CI.
    build_pipelines.py merges contiguous fragments before simplifying."""
    fc = json.loads((DATA / "pipelines.geojson").read_text())
    parts = [_line_parts(f["geometry"]) for f in fc["features"]]
    n_parts = sum(len(p) for p in parts)
    n_vertices = sum(len(line) for p in parts for line in p)
    by_name = {f["properties"]["name"]: len(p) for f, p in zip(fc["features"], parts, strict=True)}
    assert n_parts < 70_000, n_parts
    assert n_vertices < 260_000, n_vertices
    assert by_name["Tennessee Gas Pipeline"] < 2_000


def test_trade_flow_unit_values_are_plausible_or_imputed():
    """Every quantity implies a unit value within 5x of its (hs_code, year) median,
    or was re-estimated (qty_imputed) with BACI's original kept in qty_reported."""
    import duckdb

    trade = DATA / "trade_flow.parquet"
    bad = duckdb.sql(
        f"""
        WITH t AS (SELECT *, value_usd / qty AS uv FROM read_parquet('{trade}')
                   WHERE qty > 0 AND value_usd > 0),
             m AS (SELECT hs_code, year, median(value_usd / coalesce(qty_reported, qty)) AS med
                   FROM t GROUP BY 1, 2)
        SELECT count(*) FROM t JOIN m USING (hs_code, year)
        WHERE NOT qty_imputed AND (uv < med / 5 OR uv > med * 5)
        """
    ).fetchone()[0]
    assert bad == 0
    imputed = duckdb.sql(
        f"SELECT count(*) FROM read_parquet('{trade}') WHERE qty_imputed AND qty_reported IS NULL"
    ).fetchone()[0]
    assert imputed == 0
