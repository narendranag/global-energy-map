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
    osm = pd.DataFrame(
        [
            {"country_iso3": "USA", "lat": 41.4154, "lon": -88.1822, "name": "Joliet Refinery"},
        ]
    )
    netl = pd.DataFrame(
        [
            # NETL Joliet at virtually identical coords (~0.12 km away)
            {"country_iso3": "USA", "lat": 41.4163, "lon": -88.1815, "facility_n": "Joliet"},
        ]
    )
    kept = osm_records_not_in_netl(osm, netl)
    assert len(kept) == 0


def test_osm_kept_when_netl_far_away():
    osm = pd.DataFrame(
        [
            {"country_iso3": "DEU", "lat": 49.0558, "lon": 8.3447, "name": "MiRO"},
        ]
    )
    # Hamburg is ~500 km away from MiRO
    netl = pd.DataFrame(
        [
            {"country_iso3": "DEU", "lat": 53.5511, "lon": 9.9937, "facility_n": "Hamburg"},
        ]
    )
    kept = osm_records_not_in_netl(osm, netl)
    assert len(kept) == 1
    assert kept.iloc[0]["name"] == "MiRO"


def test_osm_kept_when_netl_close_but_different_country():
    # Two refineries 1 km apart but in different countries — keep OSM
    osm = pd.DataFrame(
        [
            {"country_iso3": "FRA", "lat": 49.0558, "lon": 8.3447, "name": "FR refinery"},
        ]
    )
    netl = pd.DataFrame(
        [
            {"country_iso3": "DEU", "lat": 49.0558, "lon": 8.3500, "facility_n": "DE refinery"},
        ]
    )
    kept = osm_records_not_in_netl(osm, netl)
    assert len(kept) == 1


def test_empty_netl_keeps_all_osm():
    osm = pd.DataFrame(
        [
            {"country_iso3": "USA", "lat": 41.0, "lon": -88.0, "name": "A"},
            {"country_iso3": "GBR", "lat": 51.0, "lon": -1.0, "name": "B"},
        ]
    )
    netl = pd.DataFrame(columns=["country_iso3", "lat", "lon", "facility_n"])
    kept = osm_records_not_in_netl(osm, netl)
    assert len(kept) == 2


def test_empty_osm_returns_empty():
    osm = pd.DataFrame(columns=["country_iso3", "lat", "lon", "name"])
    netl = pd.DataFrame(
        [
            {"country_iso3": "USA", "lat": 41.0, "lon": -88.0, "facility_n": "A"},
        ]
    )
    kept = osm_records_not_in_netl(osm, netl)
    assert len(kept) == 0


# ── NETL within-source dedup ────────────────────────────────────────────────

from scripts.transform._refinery_dedup import (  # noqa: E402
    NETL_SELF_DEDUP_KM,
    cluster_same_country,
    dedup_within_source,
    keeper_rank,
)


def _rows(*specs):
    return pd.DataFrame(
        [
            {"country_iso3": c, "lat": lat, "lon": lon, "name": n, "capacity": cap, "operator": op}
            for c, lat, lon, n, cap, op in specs
        ]
    )


def test_self_dedup_threshold_is_1km():
    assert NETL_SELF_DEDUP_KM == 1.0


def test_clusters_are_same_country_and_within_threshold():
    df = _rows(
        ("MMR", 20.9046, 94.8250, "a", None, None),
        ("MMR", 20.9056, 94.8249, "b", None, None),  # ~0.1 km from a
        ("THA", 20.9046, 94.8251, "c", None, None),  # same spot, other country
        ("MMR", 20.9300, 94.8250, "d", None, None),  # ~2.8 km from a
    )
    assert cluster_same_country(df, 1.0).tolist() == [0, 0, 2, 3]


def test_single_linkage_chains_through_intermediate_rows():
    # a–b 0.9 km, b–c 0.9 km, a–c 1.8 km: all one cluster.
    df = _rows(
        ("USA", 30.0, -90.0, "a", None, None),
        ("USA", 30.0081, -90.0, "b", None, None),
        ("USA", 30.0162, -90.0, "c", None, None),
    )
    assert cluster_same_country(df, 1.0).tolist() == [0, 0, 0]


def test_keeper_prefers_capacity_then_clean_name_then_length():
    assert keeper_rank("400 - X", 10.0) > keeper_rank("Clean name", None)
    assert keeper_rank("Clean", None) > keeper_rank("333 - Much longer numbered", None)
    assert keeper_rank("513a - Total SA", None) < keeper_rank("Total", None)
    assert keeper_rank("Clean", None) > keeper_rank("Raffinerie de Chauk (Myanmar)", None)
    assert keeper_rank("Longer clean name", None) > keeper_rank("Short", None)


def test_dedup_keeps_one_row_per_cluster_and_fills_operator():
    df = _rows(
        ("MMR", 20.904636, 94.825059, "Myanma Petro-chemical Enterprise (MPE)", None, None),
        ("MMR", 20.905583, 94.824967, "333 - MPE - Chauk", None, "MPE"),
        ("MMR", 20.904644, 94.824856, "Raffinerie de Chauk (Myanmar)", None, None),
        ("MMR", 16.605267, 96.221366, "334 - MPE - Thanlyin", None, None),
    )
    kept, clusters = dedup_within_source(df)
    assert kept["name"].tolist() == [
        "Myanma Petro-chemical Enterprise (MPE)",  # unique in-country → own name kept
        "334 - MPE - Thanlyin",
    ]
    assert kept.loc[0, "operator"] == "MPE"  # filled from the numbered listing
    assert clusters == [[0, 2, 1]]  # keeper, then French (unnumbered), then numbered


def test_dedup_is_a_noop_without_near_duplicates():
    df = _rows(("USA", 30.0, -90.0, "a", 1.0, None), ("USA", 31.0, -90.0, "b", None, None))
    kept, clusters = dedup_within_source(df)
    assert kept["name"].tolist() == ["a", "b"] and clusters == []


# ── capacity-conflict constraint ────────────────────────────────────────────

from scripts.transform._refinery_dedup import (  # noqa: E402
    CAPACITY_CONFLICT_REL,
    capacities_conflict,
    choose_names,
    name_variants,
)


def test_capacities_conflict_only_when_both_known_and_over_5pct():
    assert CAPACITY_CONFLICT_REL == 0.05
    assert capacities_conflict(135.0, 107.0)  # BPCL vs HPCL Mumbai
    assert not capacities_conflict(100.0, 104.0)  # within 5 %
    assert not capacities_conflict(100.0, None)
    assert not capacities_conflict(float("nan"), 50.0)


def test_conflicting_capacities_are_never_merged():
    # BPCL + HPCL Mumbai ~0.5 km apart, each with a French duplicate next to it;
    # an uncapacitied row halfway between would otherwise chain all of them.
    df = _rows(
        ("IND", 19.0000, 72.8900, "BPCL Mumbai Refinery", 135.0, None),
        ("IND", 19.0003, 72.8900, "Raffinerie de Mumbai BPCL (Inde)", None, None),
        ("IND", 19.0045, 72.8900, "HPCL Mumbai Refinery", 107.0, None),
        ("IND", 19.0042, 72.8900, "Raffinerie de Mumbai HPCL (Inde)", None, None),
        ("IND", 19.0022, 72.8900, "Mahul refinery complex", None, None),
    )
    labels = cluster_same_country(df, 1.0)
    assert labels[0] != labels[2]  # the two capacities stay apart
    assert labels[1] == labels[0] and labels[3] == labels[2]  # each absorbs its duplicate
    assert cluster_same_country(df, 1.0, rel=None).tolist() == [0] * 5  # unconstrained: one

    kept, _ = dedup_within_source(df)
    assert sorted(kept["capacity"].dropna().tolist()) == [107.0, 135.0]


def test_equal_capacities_still_merge():
    # Pemex-style duplicate: two capacitied listings of one plant, 5 % apart at most.
    df = _rows(
        ("MEX", 20.05, -99.27, "Pemex Tula Refinery", 320.0, None),
        ("MEX", 20.051, -99.27, "Tula Refinery", 320.0, None),
        ("MEX", 20.052, -99.27, "Tula (Hidalgo)", 330.0, None),  # 3 % from 320
    )
    kept, clusters = dedup_within_source(df)
    assert len(kept) == 1 and len(clusters[0]) == 3


# ── unique kept names ───────────────────────────────────────────────────────


def test_name_variants_order_and_prefix_stripping():
    names = [
        "Myanma Petro-chemical Enterprise (MPE)",
        "Raffinerie de Chauk (Myanmar)",
        "333 - Myanmar Petrochemical Enterprise - Chauk",
    ]
    assert name_variants(names) == [
        "Myanma Petro-chemical Enterprise (MPE)",
        "Myanmar Petrochemical Enterprise - Chauk",
        "Raffinerie de Chauk (Myanmar)",
    ]


def test_choose_names_only_renames_clashes_within_a_country():
    got = choose_names(
        ["MMR", "MMR", "THA", "THA"],
        [["MPE", "MPE - Chauk"], ["MPE", "Raffinerie de Thanlyin"], ["MPE"], ["Rayong"]],
    )
    assert got == ["MPE - Chauk", "Raffinerie de Thanlyin", "MPE", "Rayong"]


def test_myanmar_like_fixture_gets_unique_located_names():
    mpe = "Myanma Petro-chemical Enterprise (MPE)"
    df = _rows(
        # Chauk: English, numbered and French listings within ~100 m.
        ("MMR", 20.904636, 94.825059, mpe, None, None),
        ("MMR", 20.905583, 94.824967, "333 - Myanmar Petrochemical Enterprise - Chauk", None, None),
        ("MMR", 20.904644, 94.824856, "Raffinerie de Chauk (Myanmar)", None, None),
        # Thanbayakan and Thanlyin: English + French listing each.
        ("MMR", 19.975530, 95.001423, mpe, None, None),
        ("MMR", 19.974609, 95.000452, "Raffinerie de Thanbayakan (Birmanie)", None, None),
        ("MMR", 16.768241, 96.235201, mpe, None, None),
        ("MMR", 16.766248, 96.233028, "Raffinerie de Thanlyin (Birmanie)", None, None),
        # Mis-geocoded numbered listing, 18 km from Thanlyin: stays separate.
        (
            "MMR",
            16.605267,
            96.221366,
            "334 - Myanmar Petrochemical Enterprise - Thanlyin",
            None,
            None,
        ),
    )
    kept, clusters = dedup_within_source(df)
    assert kept["name"].tolist() == [
        "Myanmar Petrochemical Enterprise - Chauk",
        "Raffinerie de Thanbayakan (Birmanie)",
        "Raffinerie de Thanlyin (Birmanie)",
        "334 - Myanmar Petrochemical Enterprise - Thanlyin",
    ]
    assert kept["name"].is_unique
    assert len(clusters) == 3
