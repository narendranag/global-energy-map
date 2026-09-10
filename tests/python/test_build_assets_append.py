"""build_assets must append extraction rows, never truncate assets.parquet."""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from scripts.transform.build_assets import EXTRACTION_CAPACITY_UNIT, append_extraction


def _refinery_seed() -> pd.DataFrame:
    return pd.DataFrame(
        {
            "asset_id": ["netl-ref-1"],
            "kind": ["refinery"],
            "name": ["Test Refinery"],
            "country_iso3": ["SAU"],
            "lon": [50.0],
            "lat": [26.0],
            "capacity": [400.0],
            "capacity_unit": ["kbpd"],
            "source": ["NETL"],
        }
    )


def _fake_extraction(n: int = 3) -> pd.DataFrame:
    return pd.DataFrame(
        {
            "asset_id": [f"OG{i:07d}" for i in range(n)],
            "kind": ["extraction_site"] * n,
            "name": [f"Field {i}" for i in range(n)],
            "country_iso3": ["SAU"] * n,
            "lon": [49.0 + i for i in range(n)],
            "lat": [25.0] * n,
            "capacity": pd.array([None] * n, dtype="Float64"),
            "capacity_unit": [EXTRACTION_CAPACITY_UNIT] * n,
            "source": ["GEM"] * n,
        }
    )


def test_append_preserves_other_kinds_and_is_idempotent(tmp_path: Path):
    assets = tmp_path / "assets.parquet"
    _refinery_seed().to_parquet(assets, index=False)

    append_extraction(assets, _fake_extraction())
    first = pd.read_parquet(assets)
    append_extraction(assets, _fake_extraction())
    second = pd.read_parquet(assets)

    for df in (first, second):
        counts = df["kind"].value_counts().to_dict()
        assert counts == {"refinery": 1, "extraction_site": 3}
        assert df.loc[df["kind"] == "refinery", "asset_id"].tolist() == ["netl-ref-1"]
        assert df["asset_id"].is_unique

    pd.testing.assert_frame_equal(first, second)


def test_append_writes_fresh_when_file_missing(tmp_path: Path):
    assets = tmp_path / "nested" / "assets.parquet"
    append_extraction(assets, _fake_extraction(2))
    df = pd.read_parquet(assets)
    assert len(df) == 2
    assert set(df["kind"]) == {"extraction_site"}


def test_extraction_capacity_unit_is_kboe_per_day():
    assert EXTRACTION_CAPACITY_UNIT == "kboe/d"
