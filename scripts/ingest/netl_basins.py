"""Ingest NETL GOGI Basins layer.

Source: https://prod.arcgis.netl.doe.gov/server/rest/services/Hosted/Basins/FeatureServer/0
License: US Government work, public domain (17 USC §105)
Expected feature count: ~1,046 polygons

Usage:
    uv run python -m scripts.ingest.netl_basins
"""
from __future__ import annotations

import sys
from pathlib import Path

from scripts.common.netl import fetch_netl_layer

OUT = Path("data/raw/netl/basins.geojson")
LAYER = "Basins"


def main() -> None:
    print(f"Fetching NETL {LAYER}...", file=sys.stderr)
    count = fetch_netl_layer(LAYER, OUT)
    print(f"Wrote {OUT}  features={count}")


if __name__ == "__main__":
    main()
