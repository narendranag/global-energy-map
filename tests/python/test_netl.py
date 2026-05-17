"""Unit tests for scripts.common.netl.

Uses pytest-style monkeypatching of httpx.get to avoid real network calls.
The integration smoke test that hits a real NETL layer lives in the ingest
scripts themselves (Tasks 3-5).
"""
from __future__ import annotations

from unittest.mock import patch

from scripts.common.netl import (
    NETL_BASE,
    PAGE_SIZE,
    build_query_url,
    paginate_features,
)


def test_netl_base_constant():
    assert NETL_BASE == "https://prod.arcgis.netl.doe.gov/server/rest/services/Hosted"


def test_page_size_is_2000():
    """NETL services cap at maxRecordCount=2000."""
    assert PAGE_SIZE == 2000


def test_build_query_url_first_page():
    url = build_query_url("Basins", offset=0)
    assert "Basins/FeatureServer/0/query" in url
    assert "where=1%3D1" in url or "where=1=1" in url
    assert "f=geojson" in url
    assert "outSR=4326" in url
    assert "resultRecordCount=2000" in url
    assert "resultOffset=0" in url


def test_build_query_url_with_offset():
    url = build_query_url("Storage", offset=4000)
    assert "resultOffset=4000" in url


def test_paginate_features_stops_at_empty_page():
    """Pagination stops as soon as a page returns 0 features (not before)."""
    pages = [
        {"type": "FeatureCollection", "features": [{"id": n} for n in range(2000)]},
        {"type": "FeatureCollection", "features": [{"id": n} for n in range(2000, 4000)]},
        {"type": "FeatureCollection", "features": []},
    ]
    call_idx = {"i": 0}

    def fake_get(url, timeout):
        i = call_idx["i"]
        call_idx["i"] += 1

        class R:
            status_code = 200

            def json(self):
                return pages[i]

            def raise_for_status(self):
                pass

        return R()

    with patch("scripts.common.netl.httpx.get", side_effect=fake_get):
        out = paginate_features("Basins")
    assert len(out) == 4000
    assert out[0]["id"] == 0
    assert out[2000]["id"] == 2000


def test_paginate_features_stops_at_short_page():
    """A page shorter than PAGE_SIZE means we're done (no further request needed)."""
    pages = [
        {"type": "FeatureCollection", "features": [{"id": n} for n in range(2000)]},
        {"type": "FeatureCollection", "features": [{"id": 2001}]},
        {"type": "FeatureCollection", "features": []},
    ]
    call_idx = {"i": 0}

    def fake_get(url, timeout):
        i = call_idx["i"]
        call_idx["i"] += 1

        class R:
            status_code = 200

            def json(self):
                return pages[i]

            def raise_for_status(self):
                pass

        return R()

    with patch("scripts.common.netl.httpx.get", side_effect=fake_get):
        out = paginate_features("Storage")
    assert len(out) == 2001
