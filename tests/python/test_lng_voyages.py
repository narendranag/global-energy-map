"""Unit tests for LNG voyage transform helpers."""
from __future__ import annotations

import pandas as pd

from scripts.transform._lng_voyage_helpers import make_unique_ids


def test_make_unique_ids_no_collisions_unchanged():
    ids = pd.Series(["a", "b", "c"])
    out = make_unique_ids(ids)
    pd.testing.assert_series_equal(out, ids)


def test_make_unique_ids_disambiguates_collision():
    ids = pd.Series(["a", "a", "b"])
    out = make_unique_ids(ids)
    assert out.is_unique
    assert out.tolist() == ["a_0", "a_1", "b"]


def test_make_unique_ids_does_not_mutate_input():
    ids = pd.Series(["a", "a"])
    original = ids.copy()
    make_unique_ids(ids)
    pd.testing.assert_series_equal(ids, original)


def test_make_unique_ids_handles_multiple_collision_groups():
    ids = pd.Series(["x", "y", "x", "y", "z"])
    out = make_unique_ids(ids)
    assert out.is_unique
    assert out.tolist() == ["x_0", "y_0", "x_1", "y_1", "z"]


def test_make_unique_ids_empty_series():
    ids = pd.Series([], dtype=str)
    out = make_unique_ids(ids)
    assert len(out) == 0
