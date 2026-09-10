"""Ingest NETL GOGI (Global Oil and Gas Infrastructure) feature layers.

One parametrised ingest for the four layers we use; each pages through the
layer's ArcGIS FeatureServer (scripts.common.netl) and writes GeoJSON to
data/raw/netl/<layer>.geojson.

    layer        FeatureServer   expected features
    basins       Basins          ~1,046 polygons
    ports        Ports           ~3,702 points
    refineries   Refineries      ~2,272 points
    storage      Storage         ~26,103 points (14 pages at PAGE_SIZE=2000)

Source: https://prod.arcgis.netl.doe.gov/server/rest/services/Hosted/<Layer>/FeatureServer/0
License: US Government work, public domain (17 USC §105)

NETL serves live, unversioned layers: re-ingesting changes data/raw/netl/*, so
bump SOURCE_VERSION in scripts/transform/_netl_points.py / build_basins.py and
NETL_SNAPSHOT in build_catalog.py to the retrieval date when you do.

Usage:
    uv run python -m scripts.ingest.netl_gogi [layer ...]     # default: all four
    uv run python -m scripts.ingest.netl_basins               # (and _ports, …) shims
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from scripts.common.netl import fetch_netl_layer

RAW_DIR = Path("data/raw/netl")

# layer key → (FeatureServer name, progress note)
LAYERS: dict[str, tuple[str, str]] = {
    "basins": ("Basins", ""),
    "ports": ("Ports", ""),
    "refineries": ("Refineries", ""),
    "storage": ("Storage", " (~14 pages, takes a few minutes)"),
}


def out_path(layer: str) -> Path:
    """Raw GeoJSON path for *layer* (e.g. data/raw/netl/basins.geojson)."""
    if layer not in LAYERS:
        raise KeyError(f"unknown NETL layer {layer!r}; expected one of {sorted(LAYERS)}")
    return RAW_DIR / f"{layer}.geojson"


def ingest_layer(layer: str) -> int:
    """Fetch one NETL layer to data/raw/netl/; return the feature count."""
    service, note = LAYERS[layer]
    out = out_path(layer)
    print(f"Fetching NETL {service}...{note}", file=sys.stderr)
    count = fetch_netl_layer(service, out)
    print(f"Wrote {out}  features={count}")
    return count


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Ingest NETL GOGI layers.")
    parser.add_argument("layers", nargs="*", help=f"any of {', '.join(LAYERS)} (default: all)")
    layers = parser.parse_args(argv).layers or list(LAYERS)
    unknown = sorted(set(layers) - set(LAYERS))
    if unknown:
        parser.error(f"unknown layer(s) {unknown}; expected any of {list(LAYERS)}")
    for layer in layers:
        ingest_layer(layer)


if __name__ == "__main__":
    main()
