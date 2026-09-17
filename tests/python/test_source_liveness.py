"""Every pinned download URL still resolves.

Opt-in, because it is the only test here that touches the network::

    RUN_NETWORK_TESTS=1 uv run python -m pytest tests/python/test_source_liveness.py -v

Why this exists: GEM reorganised its public bucket around 2026-07-02 and the
pinned GOIT/GGIT GeoJSON URLs started returning 404. Nothing caught it for
~2.5 months, because ``public/data/`` is committed — the deployed site was
fine while ``build_all --ingest`` was broken. A dead pin is invisible until
someone tries to refresh, which is exactly when they least want a surprise.

Run this before starting a refresh (``docs/refresh.md``) and after changing
any pin. A failure means the pin is stale, not that the test is wrong: find
the new URL and re-pin, don't relax the assertion.
"""

from __future__ import annotations

import os

import pytest

from scripts.common.sources import ALL, SourcePin

pytestmark = pytest.mark.network

# Pins whose download_url is a direct file fetch, so a HEAD/range GET is
# meaningful. The others are service endpoints that answer only real queries:
# NETL is an ArcGIS FeatureServer root and OSM is an Overpass POST endpoint.
_FILE_DOWNLOAD_KEYS = {"ei", "baci", "gem_goget", "gem_goit", "gem_ggit", "lng_t3"}

_OK = {200, 206}
# Cloudflare and friends answer bots with 403 rather than telling us the file
# is gone. That is a "cannot tell from here", not a failure — docs/refresh.md
# already documents EI as a manual download for this reason.
_INCONCLUSIVE = {401, 403, 429}


def _pins() -> list[SourcePin]:
    return [p for p in ALL if p.key in _FILE_DOWNLOAD_KEYS and p.download_url]


def _status(url: str) -> int:
    import urllib.error
    import urllib.request

    # Range-GET rather than HEAD: several of these hosts (the GEM CDN, Zenodo)
    # answer HEAD with a status that says nothing about the object.
    req = urllib.request.Request(
        url,
        method="GET",
        headers={"Range": "bytes=0-256", "User-Agent": "global-energy-map/pin-liveness"},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return resp.status
    except urllib.error.HTTPError as exc:
        return exc.code


@pytest.mark.skipif(
    not os.environ.get("RUN_NETWORK_TESTS"),
    reason="network test; set RUN_NETWORK_TESTS=1 to run",
)
@pytest.mark.parametrize("pin", _pins(), ids=[p.key for p in _pins()])
def test_pinned_download_url_resolves(pin: SourcePin) -> None:
    status = _status(pin.download_url)
    if status in _INCONCLUSIVE:
        pytest.skip(f"{pin.key}: HTTP {status} — bot-blocked, check by hand ({pin.landing_url})")
    assert status in _OK, (
        f"{pin.key} pin is dead: HTTP {status} for {pin.download_url}\n"
        f"Find the current release at {pin.landing_url} and re-pin it in "
        f"scripts/common/sources.py (see docs/refresh.md)."
    )
