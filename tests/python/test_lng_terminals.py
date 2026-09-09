"""Unit tests for LNG terminal transform helpers."""
from __future__ import annotations

import pandas as pd
import pytest

from scripts.transform._lng_terminal_helpers import (
    assert_unique_asset_ids,
    collapse_duplicate_names,
    name_matches_in_country,
    normalize_status,
)


def test_normalize_status_construction_maps_to_in_construction():
    assert normalize_status("construction") == "in-construction"


def test_normalize_status_operating_passes_through():
    assert normalize_status("operating") == "operating"


def test_normalize_status_unknown_passes_through_unchanged():
    assert normalize_status("mothballed") == "mothballed"


def test_assert_unique_asset_ids_passes_on_unique():
    df = pd.DataFrame({"asset_id": ["a", "b", "c"]})
    assert_unique_asset_ids(df)  # should not raise


def test_assert_unique_asset_ids_raises_on_duplicate():
    df = pd.DataFrame({"asset_id": ["a", "b", "a"]})
    with pytest.raises(ValueError, match="a"):
        assert_unique_asset_ids(df)


def test_collapse_duplicate_names_operating_wins():
    df = pd.DataFrame([
        {"name": "Dahej LNG Terminal", "status": "construction", "capacity": 5.0},
        {"name": "Dahej LNG Terminal", "status": "operating", "capacity": 17.5},
        {"name": "Unique Terminal", "status": "operating", "capacity": 1.0},
    ])
    out = collapse_duplicate_names(df)
    assert len(out) == 2
    dahej = out[out["name"] == "Dahej LNG Terminal"]
    assert len(dahej) == 1
    assert dahej.iloc[0]["status"] == "operating"


def test_collapse_duplicate_names_same_status_higher_capacity_wins():
    df = pd.DataFrame([
        {"name": "Foo Terminal", "status": "operating", "capacity": 3.0},
        {"name": "Foo Terminal", "status": "operating", "capacity": 9.0},
    ])
    out = collapse_duplicate_names(df)
    assert len(out) == 1
    assert out.iloc[0]["capacity"] == 9.0


def test_collapse_duplicate_names_no_duplicates_is_noop():
    df = pd.DataFrame([
        {"name": "A", "status": "operating", "capacity": 1.0},
        {"name": "B", "status": "construction", "capacity": 2.0},
    ])
    out = collapse_duplicate_names(df)
    assert len(out) == 2
    pd.testing.assert_frame_equal(
        out.sort_values("name").reset_index(drop=True),
        df.sort_values("name").reset_index(drop=True),
    )


def test_collapse_duplicate_names_honours_key_argument():
    """GEM per-unit features collapse on asset_id, not name."""
    df = pd.DataFrame([
        {"asset_id": "gem/T1", "name": "Train 1", "status": "construction", "capacity": 5.0},
        {"asset_id": "gem/T1", "name": "Train 2", "status": "operating", "capacity": 5.0},
        {"asset_id": "gem/T2", "name": "Other", "status": "operating", "capacity": 1.0},
    ])
    out = collapse_duplicate_names(df, key="asset_id")
    assert len(out) == 2
    t1 = out[out["asset_id"] == "gem/T1"]
    assert len(t1) == 1
    # Deterministic preference, not positional keep="first".
    assert t1.iloc[0]["status"] == "operating"


def test_name_matches_in_country_exact_match():
    gem = pd.DataFrame([{"country_iso3": "AUS", "name": "Ichthys FLNG Terminal"}])
    lng_t3 = pd.DataFrame([{"country_iso3": "AUS", "name": "Ichthys FLNG Terminal"}])
    mask = name_matches_in_country(gem, lng_t3)
    assert mask.tolist() == [True]


def test_name_matches_in_country_case_and_whitespace_insensitive():
    gem = pd.DataFrame([{"country_iso3": "AUS", "name": "  ichthys flng terminal "}])
    lng_t3 = pd.DataFrame([{"country_iso3": "AUS", "name": "Ichthys FLNG Terminal"}])
    mask = name_matches_in_country(gem, lng_t3)
    assert mask.tolist() == [True]


def test_name_matches_in_country_different_country_no_match():
    gem = pd.DataFrame([{"country_iso3": "USA", "name": "Ichthys FLNG Terminal"}])
    lng_t3 = pd.DataFrame([{"country_iso3": "AUS", "name": "Ichthys FLNG Terminal"}])
    mask = name_matches_in_country(gem, lng_t3)
    assert mask.tolist() == [False]


def test_name_matches_in_country_different_name_no_match():
    gem = pd.DataFrame([{"country_iso3": "AUS", "name": "Other Terminal"}])
    lng_t3 = pd.DataFrame([{"country_iso3": "AUS", "name": "Ichthys FLNG Terminal"}])
    mask = name_matches_in_country(gem, lng_t3)
    assert mask.tolist() == [False]


def test_name_matches_in_country_empty_lng_t3_no_match():
    gem = pd.DataFrame([{"country_iso3": "AUS", "name": "Ichthys FLNG Terminal"}])
    lng_t3 = pd.DataFrame(columns=["country_iso3", "name"])
    mask = name_matches_in_country(gem, lng_t3)
    assert mask.tolist() == [False]


def test_name_matches_in_country_empty_gem_returns_empty_series():
    gem = pd.DataFrame(columns=["country_iso3", "name"])
    lng_t3 = pd.DataFrame([{"country_iso3": "AUS", "name": "Ichthys FLNG Terminal"}])
    mask = name_matches_in_country(gem, lng_t3)
    assert len(mask) == 0


def test_collapse_duplicate_names_is_order_independent():
    """Same input in either row order collapses to the same kept row."""
    rows = [
        {"asset_id": "a", "name": "T", "status": "operating", "capacity": 2.0},
        {"asset_id": "a", "name": "T", "status": "in-construction", "capacity": 9.0},
    ]
    fwd = collapse_duplicate_names(pd.DataFrame(rows), key="asset_id")
    rev = collapse_duplicate_names(pd.DataFrame(rows[::-1]), key="asset_id")
    assert fwd.iloc[0]["status"] == rev.iloc[0]["status"] == "operating"
    assert fwd.iloc[0]["capacity"] == rev.iloc[0]["capacity"] == 2.0
