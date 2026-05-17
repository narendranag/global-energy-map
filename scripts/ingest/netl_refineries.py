"""Ingest NETL GOGI Refineries layer.

Source: https://prod.arcgis.netl.doe.gov/server/rest/services/Hosted/Refineries/FeatureServer/0
License: US Government work, public domain (17 USC §105)
Expected feature count: ~2,272 points

Usage:
    uv run python -m scripts.ingest.netl_refineries
"""
from __future__ import annotations

import sys
from pathlib import Path

from scripts.common.netl import fetch_netl_layer

OUT = Path("data/raw/netl/refineries.geojson")
LAYER = "Refineries"


def main() -> None:
    print(f"Fetching NETL {LAYER}...", file=sys.stderr)
    count = fetch_netl_layer(LAYER, OUT)
    print(f"Wrote {OUT}  features={count}")


if __name__ == "__main__":
    main()
