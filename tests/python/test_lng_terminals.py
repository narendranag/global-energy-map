"""Unit tests for LNG terminal transform helpers."""
from __future__ import annotations

import pandas as pd
import pytest

from scripts.transform._lng_terminal_helpers import (
    assert_unique_asset_ids,
    collapse_duplicate_names,
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
