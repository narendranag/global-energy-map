"""Unit tests for LNG terminal transform helpers."""
from __future__ import annotations

import pandas as pd
import pytest

from scripts.transform._lng_terminal_helpers import (
    assert_unique_asset_ids,
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
