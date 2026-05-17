"""Ingest NETL GOGI Storage layer.

Source: https://prod.arcgis.netl.doe.gov/server/rest/services/Hosted/Storage/FeatureServer/0
License: US Government work, public domain (17 USC §105)
Expected feature count: ~26,103 points (14 pages at PAGE_SIZE=2000)

Usage:
    uv run python -m scripts.ingest.netl_storage
"""
from __future__ import annotations

import sys
from pathlib import Path

from scripts.common.netl import fetch_netl_layer

OUT = Path("data/raw/netl/storage.geojson")
LAYER = "Storage"


def main() -> None:
    print(f"Fetching NETL {LAYER}... (~14 pages, takes a few minutes)", file=sys.stderr)
    count = fetch_netl_layer(LAYER, OUT)
    print(f"Wrote {OUT}  features={count}")


if __name__ == "__main__":
    main()
