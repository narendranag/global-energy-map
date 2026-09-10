"""Every shipped Parquet file matches its declared schema (scripts.common.parquet)."""

from __future__ import annotations

from pathlib import Path

import pyarrow.parquet as pq
import pytest

from scripts.common.parquet import REQUIRED, SCHEMAS

DATA = Path("public/data")


def test_every_shipped_parquet_has_a_declared_schema():
    shipped = {p.name for p in DATA.glob("*.parquet")}
    assert shipped == set(SCHEMAS), f"undeclared: {shipped - set(SCHEMAS)}"


@pytest.mark.parametrize("name", sorted(SCHEMAS))
def test_columns_and_types_match(name: str):
    actual = pq.read_schema(DATA / name).remove_metadata()
    expected = SCHEMAS[name]
    assert actual.names == expected.names, f"{name}: column names/order differ"
    diffs = {
        f.name: (str(f.type), str(actual.field(f.name).type))
        for f in expected
        if not actual.field(f.name).type.equals(f.type)
    }
    assert not diffs, f"{name}: (declared, actual) type mismatches {diffs}"


@pytest.mark.parametrize("name", sorted(REQUIRED))
def test_required_columns_have_no_nulls(name: str):
    table = pq.read_table(DATA / name, columns=list(REQUIRED[name]))
    nulls = {c: table[c].null_count for c in table.column_names if table[c].null_count}
    assert not nulls, f"{name}: nulls in required columns {nulls}"
