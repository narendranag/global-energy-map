"""scripts.common.parquet.append_kind — the shared assets.parquet writer."""

from __future__ import annotations

from pathlib import Path

import pandas as pd
import pyarrow.parquet as pq
import pytest

from scripts.common.parquet import ASSETS_SCHEMA, KIND_RANK, append_kind, conform


def _rows(kind: str, n: int, prefix: str | None = None, **extra) -> pd.DataFrame:
    prefix = prefix or kind
    return pd.DataFrame(
        {
            "asset_id": [f"{prefix}-{i}" for i in range(n)],
            "kind": [kind] * n,
            "name": [f"{kind} {i}" for i in range(n)],
            "country_iso3": ["SAU"] * n,
            "lon": [49.0 + i for i in range(n)],
            "lat": [25.0] * n,
            "source": ["test"] * n,
            "source_version": ["v1"] * n,
            **extra,
        }
    )


def test_append_preserves_other_kinds_and_is_idempotent(tmp_path: Path):
    path = tmp_path / "assets.parquet"
    append_kind(_rows("refinery", 1), "refinery", path)
    append_kind(_rows("extraction_site", 3), "extraction_site", path)
    first = path.read_bytes()
    append_kind(_rows("extraction_site", 3), "extraction_site", path)
    assert path.read_bytes() == first  # byte-identical re-run

    df = pd.read_parquet(path)
    assert df["kind"].value_counts().to_dict() == {"extraction_site": 3, "refinery": 1}
    assert df["asset_id"].is_unique


def test_row_order_is_by_kind_rank_whatever_the_write_order(tmp_path: Path):
    a, b = tmp_path / "a.parquet", tmp_path / "b.parquet"
    frames = {k: _rows(k, 2) for k in ("port", "refinery", "extraction_site")}
    for k in ("port", "refinery", "extraction_site"):
        append_kind(frames[k], k, a)
    for k in ("extraction_site", "refinery", "port"):
        append_kind(frames[k], k, b)
    assert a.read_bytes() == b.read_bytes()
    kinds = pd.read_parquet(a)["kind"].tolist()
    assert kinds == sorted(kinds, key=KIND_RANK.__getitem__)


def test_writes_declared_schema_and_widens_int32_years(tmp_path: Path):
    path = tmp_path / "assets.parquet"
    df = _rows("extraction_site", 2, commissioned_year=pd.array([1990, None], dtype="Int32"))
    append_kind(df, "extraction_site", path)
    schema = pq.read_schema(path).remove_metadata()
    assert schema.equals(ASSETS_SCHEMA)
    out = pd.read_parquet(path)
    assert out["commissioned_year"].tolist()[0] == 1990
    assert pd.isna(out["commissioned_year"].tolist()[1])
    assert out["unit_count"].isna().all()  # absent column added as null


def test_multi_kind_owner_and_orphan_rows_dropped(tmp_path: Path):
    path = tmp_path / "assets.parquet"
    seed = pd.concat([_rows("refinery", 1), _rows("lng_import", 2, "old")], ignore_index=True)
    seed.loc[len(seed)] = {c: None for c in seed.columns}  # orphan with null kind
    seed.to_parquet(path, index=False)
    lng = pd.concat([_rows("lng_export", 1), _rows("lng_import", 1)], ignore_index=True)
    out = append_kind(lng, ("lng_export", "lng_import"), path)
    assert out["kind"].tolist() == ["refinery", "lng_export", "lng_import"]
    assert not out["asset_id"].str.startswith("old").any()


def test_writes_fresh_when_file_missing(tmp_path: Path):
    path = tmp_path / "nested" / "assets.parquet"
    append_kind(_rows("port", 2), "port", path)
    assert len(pd.read_parquet(path)) == 2


def test_rejects_rows_of_a_kind_it_does_not_own(tmp_path: Path):
    with pytest.raises(ValueError, match="kinds"):
        append_kind(_rows("port", 1), "storage", tmp_path / "a.parquet")


def test_rejects_undeclared_columns_and_null_required_values(tmp_path: Path):
    with pytest.raises(ValueError, match="not in the declared schema"):
        conform(_rows("port", 1, bogus=[1]), ASSETS_SCHEMA)
    bad = _rows("port", 1)
    bad["country_iso3"] = None
    with pytest.raises(ValueError, match="required"):
        append_kind(bad, "port", tmp_path / "a.parquet")


def test_rejects_duplicate_asset_ids(tmp_path: Path):
    dup = pd.concat([_rows("port", 1), _rows("port", 1)], ignore_index=True)
    with pytest.raises(ValueError, match="duplicate asset_id"):
        append_kind(dup, "port", tmp_path / "a.parquet")
