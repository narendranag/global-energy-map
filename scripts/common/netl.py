"""Shared NETL ArcGIS REST helper for GOGI layers.

NETL exposes oil & gas infrastructure feature services at
https://arcgis.netl.doe.gov/portal/home/item.html?id=1e1c13b43dfb4af68040598c6f4baf44

Each layer caps responses at 2000 records; we paginate via resultOffset.
All responses are requested as GeoJSON in EPSG:4326 (outSR=4326) so
downstream geopandas calls don't need explicit reprojection.

Public functions:
    build_query_url(layer, offset)   — pure URL constructor (testable)
    paginate_features(layer)         — fetch all features with pagination
    fetch_netl_layer(layer, out)     — paginate + write GeoJSON to out path

License: NETL data is US Government work (17 USC §105), public domain.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlencode

import httpx

NETL_BASE = "https://prod.arcgis.netl.doe.gov/server/rest/services/Hosted"
PAGE_SIZE = 2000


def build_query_url(layer: str, offset: int) -> str:
    """Construct a NETL FeatureServer query URL for one page of features."""
    qs = urlencode(
        {
            "where": "1=1",
            "outFields": "*",
            "f": "geojson",
            "outSR": "4326",
            "resultRecordCount": PAGE_SIZE,
            "resultOffset": offset,
            "returnGeometry": "true",
        }
    )
    return f"{NETL_BASE}/{layer}/FeatureServer/0/query?{qs}"


def paginate_features(layer: str, timeout: float = 90.0) -> list[dict]:
    """Fetch ALL features from a NETL layer via offset-pagination.

    Stops when a page is empty or shorter than PAGE_SIZE.
    Returns the concatenated features list (NOT wrapped in a FeatureCollection).
    """
    all_features: list[dict] = []
    offset = 0
    while True:
        url = build_query_url(layer, offset)
        r = httpx.get(url, timeout=timeout)
        r.raise_for_status()
        page = r.json()
        feats = page.get("features", [])
        all_features.extend(feats)
        if len(feats) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
    return all_features


def fetch_netl_layer(layer: str, out_path: Path) -> int:
    """Fetch all features from `layer` and write to `out_path` as a single GeoJSON.

    Returns the feature count written.
    """
    feats = paginate_features(layer)
    fc = {
        "type": "FeatureCollection",
        "_fetched_at": datetime.now(UTC).isoformat(),
        "features": feats,
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w") as f:
        json.dump(fc, f)
    return len(feats)
