"""Unit tests for OSM↔NETL refinery proximity dedup."""
from __future__ import annotations

import pandas as pd

from scripts.transform._refinery_dedup import (
    DEDUP_THRESHOLD_KM,
    haversine_km,
    osm_records_not_in_netl,
)


def test_dedup_threshold_is_2km():
    assert DEDUP_THRESHOLD_KM == 2.0


def test_haversine_zero_distance():
    assert haversine_km(40.0, -74.0, 40.0, -74.0) == 0.0


def test_haversine_known_distance():
    # NYC (40.7128, -74.0060) ↔ LA (34.0522, -118.2437) ≈ 3935 km
    d = haversine_km(40.7128, -74.0060, 34.0522, -118.2437)
    assert 3920 < d < 3950


def test_osm_dropped_when_netl_within_2km_same_country():
    osm = pd.DataFrame([
        {"country_iso3": "USA", "lat": 41.4154, "lon": -88.1822, "name": "Joliet Refinery"},
    ])
    netl = pd.DataFrame([
        # NETL Joliet at virtually identical coords (~0.12 km away)
        {"country_iso3": "USA", "lat": 41.4163, "lon": -88.1815, "facility_n": "Joliet"},
    ])
    kept = osm_records_not_in_netl(osm, netl)
    assert len(kept) == 0


def test_osm_kept_when_netl_far_away():
    osm = pd.DataFrame([
        {"country_iso3": "DEU", "lat": 49.0558, "lon": 8.3447, "name": "MiRO"},
    ])
    # Hamburg is ~500 km away from MiRO
    netl = pd.DataFrame([
        {"country_iso3": "DEU", "lat": 53.5511, "lon": 9.9937, "facility_n": "Hamburg"},
    ])
    kept = osm_records_not_in_netl(osm, netl)
    assert len(kept) == 1
    assert kept.iloc[0]["name"] == "MiRO"


def test_osm_kept_when_netl_close_but_different_country():
    # Two refineries 1 km apart but in different countries — keep OSM
    osm = pd.DataFrame([
        {"country_iso3": "FRA", "lat": 49.0558, "lon": 8.3447, "name": "FR refinery"},
    ])
    netl = pd.DataFrame([
        {"country_iso3": "DEU", "lat": 49.0558, "lon": 8.3500, "facility_n": "DE refinery"},
    ])
    kept = osm_records_not_in_netl(osm, netl)
    assert len(kept) == 1


def test_empty_netl_keeps_all_osm():
    osm = pd.DataFrame([
        {"country_iso3": "USA", "lat": 41.0, "lon": -88.0, "name": "A"},
        {"country_iso3": "GBR", "lat": 51.0, "lon": -1.0, "name": "B"},
    ])
    netl = pd.DataFrame(columns=["country_iso3", "lat", "lon", "facility_n"])
    kept = osm_records_not_in_netl(osm, netl)
    assert len(kept) == 2


def test_empty_osm_returns_empty():
    osm = pd.DataFrame(columns=["country_iso3", "lat", "lon", "name"])
    netl = pd.DataFrame([
        {"country_iso3": "USA", "lat": 41.0, "lon": -88.0, "facility_n": "A"},
    ])
    kept = osm_records_not_in_netl(osm, netl)
    assert len(kept) == 0
