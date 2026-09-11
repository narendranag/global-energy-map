"""scripts.common.sources: one pin per upstream source, used by every consumer."""

from __future__ import annotations

import re

import pytest

from scripts.common import sources
from scripts.common.sources import ALL

_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


@pytest.mark.parametrize("pin", ALL, ids=[p.key for p in ALL])
def test_pin_is_well_formed(pin):
    assert _DATE.match(pin.as_of), pin.as_of
    assert pin.release and pin.licence and pin.cadence
    for url in (pin.landing_url, pin.terms_url, *([pin.download_url] if pin.download_url else [])):
        assert url.startswith("https://"), url
    if pin.ingest:
        import importlib

        importlib.import_module(f"scripts.ingest.{pin.ingest}")


def test_pin_keys_unique():
    keys = [p.key for p in ALL]
    assert len(keys) == len(set(keys))


def test_ingests_read_their_pins():
    from scripts.common import netl
    from scripts.ingest import (
        baci,
        ei_statistical_review,
        gem_extraction,
        gem_gas_infra,
        gem_oil_infra,
        lng_t3,
        netl_gogi,
        osm_refineries,
    )

    assert sources.BACI.download_url == baci.BACI_URL
    assert sources.BACI.release in baci.BACI_URL
    assert sources.EI.download_url == ei_statistical_review.EI_LIVE_URL
    assert sources.GEM_GOGET.download_url == gem_extraction.WAYBACK_SNAPSHOT_URL
    assert gem_extraction.WAYBACK_SNAPSHOT_URL.endswith(gem_extraction.ORIGINAL_URL)
    assert gem_oil_infra.GEOJSON_URL.endswith(gem_oil_infra.DEST_FILENAME)
    assert gem_gas_infra.GEOJSON_URL.endswith(gem_gas_infra.DEST_FILENAME)
    assert sources.GEM_GOIT.release in gem_oil_infra.DEST_FILENAME
    assert sources.GEM_GGIT.release in gem_gas_infra.DEST_FILENAME
    assert lng_t3.RAW_DIR.name == sources.LNG_T3.release
    assert lng_t3.ZENODO_RECORD_ID in sources.LNG_T3.landing_url
    assert sources.NETL.download_url == netl.NETL_BASE
    assert sources.NETL.raw_dir == netl_gogi.RAW_DIR
    assert osm_refineries.ENDPOINTS[0] == sources.OSM.download_url


def test_transforms_stamp_the_pinned_versions():
    from scripts.transform import (
        _netl_points,
        build_assets,
        build_basins,
        build_country_year,
        build_lng_terminals,
        build_lng_voyages,
    )

    assert sources.GEM_GOGET.release == build_assets.SOURCE_VERSION
    assert sources.NETL.release == _netl_points.SOURCE_VERSION
    assert sources.NETL.release == build_basins.SOURCE_VERSION
    assert sources.LNG_T3.release == build_lng_terminals.LNG_T3_SOURCE_VERSION
    assert sources.LNG_T3.release == build_lng_voyages.SOURCE_VERSION
    assert build_lng_terminals.LNG_T3_RAW.parent == sources.LNG_T3.raw_dir
    assert build_country_year.SOURCE.endswith(sources.EI.release)


def test_catalog_as_of_dates_come_from_the_pins():
    from scripts.transform.build_catalog import REGISTRY

    as_of = {e["id"]: e["as_of"] for e in REGISTRY}
    assert as_of["ei_country_year"] == sources.EI.as_of
    assert as_of["gem_extraction"] == sources.GEM_GOGET.as_of
    assert as_of["gem_oil_pipelines"] == sources.GEM_GOIT.as_of
    assert as_of["gem_gas_pipelines"] == as_of["gem_lng_terminals"] == sources.GEM_GGIT.as_of
    assert as_of["lng_t3_voyages"] == as_of["lng_t3_terminals"] == sources.LNG_T3.as_of
    assert as_of["netl_storage"] == as_of["netl_basins"] == sources.NETL.as_of
    assert as_of["osm_refineries"] == sources.OSM.as_of
    assert as_of["baci_2709"] == sources.BACI.as_of
    assert as_of["natural_earth_countries"] == sources.NATURAL_EARTH.as_of
