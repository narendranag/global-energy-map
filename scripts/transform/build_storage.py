"""Append NETL Storage to assets.parquet as kind='storage' rows.

Idempotent: append_kind drops prior kind='storage' rows before appending.
Field mapping lives in scripts.transform._netl_points (shared with ports).

NETL's storage layer merges several inputs. Its 23,500 US rows are mostly EPA
regulatory records, not storage in the energy-system sense, so ``build``
drops (decided 2026-09-11):

- leaking underground storage tank cleanup sites (``status`` "LEAKING
  UNDERGROUND STORAGE TANK - ARRA", 6,025 rows — petrol stations, garages);
- SPCC spill-plan facilities (``type`` SPCC, 11,513 — any site holding over
  1,320 US gallons of oil: schools, farms, depots);
- the EPA "STATE MASTER" list (721 — shops, funeral homes);
- EPA rail / truck / air / port transfer points (110 — grain elevators,
  distribution centres).

Kept: EPA Facility Response Plan sites (``type`` FRP, >= 1 million gallons of
oil storage, incl. the Strategic Petroleum Reserve caverns), the EIA
petroleum-product terminals, and every non-US row.

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

LUST_STATUS = "LEAKING UNDERGROUND STORAGE TANK"
EPA_NON_STORAGE_TYPES = frozenset(
    {"SPCC", "STATE MASTER", "RAIL", "TRUCK", "AIR", "PORT", "INDEPENDENT PORT"}
)


def is_bulk_storage(gdf: pd.DataFrame) -> pd.Series:
    """False for the EPA record types above that are not bulk oil/gas storage."""
    kind = gdf["type"].fillna("").astype(str).str.strip().str.upper()
    status = gdf["status"].fillna("").astype(str).str.upper()
    return ~status.str.contains(LUST_STATUS, regex=False) & ~kind.isin(EPA_NON_STORAGE_TYPES)


def build(gdf: gpd.GeoDataFrame) -> pd.DataFrame:
    keep = is_bulk_storage(gdf)
    print(f"dropped {int((~keep).sum())} EPA non-storage records", file=sys.stderr)
    return build_netl_points(gdf[keep], kind=KIND, id_prefix="netl-storage-", capacity_unit="bbl")


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
