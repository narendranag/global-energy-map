"""Ingest Global Energy Monitor Global Gas Infrastructure Tracker (GGIT).

Downloads the GGIT GeoJSON to data/raw/gem_gas_infra/.

The live GEM site distributes the xlsx behind a Supabase token-exchange form.
No public Wayback Machine snapshot of the xlsx exists (confirmed via CDX search).

However, GEM publishes the same gas infrastructure data as a publicly-accessible
GeoJSON on their DigitalOcean CDN:
    https://publicgemdata.nyc3.cdn.digitaloceanspaces.com/ggit/2026-03/ggit_map_2026-02-20.geojson

This GeoJSON contains both LineString geometries (gas pipelines) and Point
geometries (LNG terminals) in a single file.  The ``tracker-custom`` property
discriminates between the three asset types:

    - ``"GGIT"``        → gas transmission pipeline (LineString)
    - ``"GGIT-import"`` → LNG import/regasification terminal (Point)
    - ``"GGIT-export"`` → LNG export terminal (Point)

The URL was discovered from the publicly-accessible GGIT interactive-map
config at:
    https://globalenergymonitor.github.io/maps/trackers/ggit/config.js

GGIT covers natural gas transmission pipelines + LNG import and export
terminals globally.

Usage:
    uv run python -m scripts.ingest.gem_gas_infra [--force]
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import httpx

RAW_DIR = Path("data/raw/gem_gas_infra")
LANDING = "https://globalenergymonitor.org/projects/global-gas-infrastructure-tracker/"

# Publicly-accessible GeoJSON on GEM's DigitalOcean CDN (no form/token required).
# The xlsx is gated behind Supabase; no Wayback snapshot of it exists (CDX confirmed).
# URL discovered from: https://globalenergymonitor.github.io/maps/trackers/ggit/config.js
GEOJSON_URL = (
    "https://publicgemdata.nyc3.cdn.digitaloceanspaces.com/"
    "ggit/2026-03/ggit_map_2026-02-20.geojson"
)
DEST_FILENAME = "ggit_map_2026-02-20.geojson"

# Fallback: re-discover the latest snapshot via CDX in case the file moves.
# The slug used by the GEM download form is "gas-pipeline-tracker".
WAYBACK_CDX = (
    "http://web.archive.org/cdx/search/cdx"
    "?url={url}&output=json&limit=1&filter=statuscode:200"
    "&fl=timestamp,original&matchType=exact"
)
WAYBACK_SNAPSHOT = "http://web.archive.org/web/{timestamp}/{url}"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
}


def _resolve_download_url() -> str:
    """Return a downloadable URL for the GGIT GeoJSON.

    Tries the known CDN URL first; falls back to Wayback CDX discovery if
    the primary URL is unavailable.
    """
    # Try the known CDN URL (HEAD to check availability quickly)
    try:
        r = httpx.head(
            GEOJSON_URL, follow_redirects=True, timeout=15, headers=HEADERS
        )
        if r.status_code == 200:
            return GEOJSON_URL
    except httpx.RequestError:
        pass

    # Fall back to CDX discovery
    cdx_url = WAYBACK_CDX.format(url=GEOJSON_URL)
    try:
        r = httpx.get(cdx_url, timeout=60)
        r.raise_for_status()
        rows = r.json()
        if len(rows) >= 2:
            timestamp, original = rows[1]
            return WAYBACK_SNAPSHOT.format(timestamp=timestamp, url=original)
    except Exception:
        pass

    raise RuntimeError(
        "Could not resolve a download URL for the GGIT GeoJSON.\n"
        f"Primary CDN: {GEOJSON_URL}\n"
        f"Landing page: {LANDING}\n"
        "The xlsx download requires an email-form/Supabase token exchange and "
        "no public Wayback Machine snapshot of the xlsx exists.\n"
        "Options:\n"
        "  1. Check the GGIT interactive-map config for a newer CDN URL:\n"
        "     https://globalenergymonitor.github.io/maps/trackers/ggit/config.js\n"
        "  2. Download the xlsx manually from the GEM landing page and place it in "
        "data/raw/gem_gas_infra/.\n"
        "  3. Re-run after the CDN URL is updated."
    )


def download(dest: Path, force: bool = False) -> Path:
    """Download the GGIT GeoJSON to *dest*, skip if already exists (unless force)."""
    if dest.exists() and not force:
        print(f"already exists, skipping: {dest}")
        return dest

    print("Resolving download URL …", flush=True)
    url = _resolve_download_url()
    print(f"downloading from: {url}", flush=True)

    dest.parent.mkdir(parents=True, exist_ok=True)
    with httpx.stream(
        "GET", url, follow_redirects=True, timeout=300, headers=HEADERS
    ) as r:
        r.raise_for_status()
        total = 0
        with dest.open("wb") as fh:
            for chunk in r.iter_bytes(chunk_size=65_536):
                fh.write(chunk)
                total += len(chunk)

    print(f"downloaded {total:,} bytes → {dest}")
    return dest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-download even if the file already exists",
    )
    args = parser.parse_args()

    dest = RAW_DIR / DEST_FILENAME
    path = download(dest, force=args.force)
    print(path)


if __name__ == "__main__":
    sys.exit(main())
