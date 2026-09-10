"""Append NETL Storage to assets.parquet as kind='storage' rows.

Idempotent: append_kind drops prior kind='storage' rows before appending.
Field mapping lives in scripts.transform._netl_points (shared with ports).

Usage:
    uv run python -m scripts.transform.build_storage
"""

from __future__ import annotations

import sys
from pathlib import Path

import geopandas as gpd
import pandas as pd

from scripts.common.parquet import ASSETS_PATH, append_kind
from scripts.transform._netl_points import SOURCE, SOURCE_VERSION, build_netl_points

__all__ = ["SOURCE", "SOURCE_VERSION", "build", "main"]

SRC = Path("data/raw/netl/storage.geojson")
KIND = "storage"


def build(gdf: gpd.GeoDataFrame) -> pd.DataFrame:
    return build_netl_points(gdf, kind=KIND, id_prefix="netl-storage-", capacity_unit="bbl")


def main() -> None:
    if not SRC.exists():
        sys.exit(f"missing {SRC} — run scripts.ingest.netl_storage first")
    gdf = gpd.read_file(SRC)
    print(f"loaded {len(gdf)} raw features", file=sys.stderr)
    out = build(gdf)
    combined = append_kind(out, KIND, ASSETS_PATH)
    print(f"wrote {ASSETS_PATH}  new_storage_rows={len(out)}")
    print(f"  kinds={combined['kind'].value_counts().to_dict()}")


if __name__ == "__main__":
    main()
