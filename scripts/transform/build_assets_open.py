"""Write public/data/assets_open.parquet — the openly licensed subset of assets.parquet.

assets.parquet mixes CC BY 4.0 (GEM, LNG-T3) and public-domain (NETL) rows
with 88 OpenStreetMap refinery rows under the ODbL, whose share-alike clause
would extend to the whole table if it were redistributed as one database. The
map keeps reading assets.parquet; /data offers this file for download instead:
every row except ``source = OSM_SOURCE``, same schema, same row order.

Run after every assets.parquet writer (build_assets, build_refineries,
build_storage, build_ports, build_lng_terminals) — ``scripts.build_all`` does.
Deterministic: the output depends only on assets.parquet's bytes.

Usage:
    uv run python -m scripts.transform.build_assets_open
"""

from __future__ import annotations

from pathlib import Path

import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.parquet as pq

from scripts.common.parquet import ASSETS_PATH, ASSETS_SCHEMA
from scripts.transform.build_refineries import OSM_SOURCE

OUT_PATH = Path("public/data/assets_open.parquet")

# Row sources excluded from the open extract (licence not CC BY / public domain).
EXCLUDED_SOURCES: tuple[str, ...] = (OSM_SOURCE,)


def open_subset(table: pa.Table) -> pa.Table:
    """*table* without rows whose ``source`` is in :data:`EXCLUDED_SOURCES`."""
    excluded = pc.is_in(table["source"], value_set=pa.array(EXCLUDED_SOURCES, table["source"].type))
    return table.filter(pc.invert(pc.fill_null(excluded, False)))


def build(src: Path = ASSETS_PATH, out: Path = OUT_PATH) -> pa.Table:
    table = pq.read_table(src)
    if not table.schema.remove_metadata().equals(ASSETS_SCHEMA):
        raise ValueError(f"{src} does not match ASSETS_SCHEMA")
    subset = open_subset(table)
    n_excluded = table.num_rows - subset.num_rows
    if n_excluded == 0:
        raise ValueError(f"no {EXCLUDED_SOURCES} rows in {src} — has build_refineries run?")
    out.parent.mkdir(parents=True, exist_ok=True)
    pq.write_table(subset, out, compression="zstd")
    return subset


def main() -> None:
    subset = build()
    print(f"wrote {OUT_PATH}  rows={subset.num_rows} (excluded {', '.join(EXCLUDED_SOURCES)})")


if __name__ == "__main__":
    main()
