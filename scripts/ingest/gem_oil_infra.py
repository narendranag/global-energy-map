"""Ingest Global Energy Monitor Global Oil Infrastructure Tracker (GOIT).

Downloads the GOIT GeoJSON to data/raw/gem_oil_infra/.

The live GEM site distributes the xlsx behind a Supabase token-exchange form.
No public Wayback Machine snapshot of the xlsx exists (confirmed via CDX search).

However, GEM publishes the same pipeline data as a publicly-accessible GeoJSON
on their DigitalOcean CDN:
    https://publicgemdata.nyc3.cdn.digitaloceanspaces.com/GOIT/2025-03/goit_2025-04-09.geojson

This GeoJSON contains LineString geometries plus all attribute columns used in
the interactive tracker map, and is strictly better than the xlsx for
GeoParquet downstream processing (Tasks 3 onward).

GOIT covers oil + NGL transmission pipelines only.  There is no separate
GEM refineries tracker with a public data file as of the 2025-03 release.

Usage:
    uv run python -m scripts.ingest.gem_oil_infra [--force]
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import httpx

RAW_DIR = Path("data/raw/gem_oil_infra")
LANDING = "https://globalenergymonitor.org/projects/global-oil-infrastructure-tracker/"

# Publicly-accessible GeoJSON on GEM's DigitalOcean CDN (no form/token required).
# The xlsx is gated behind Supabase; no Wayback snapshot of it exists (CDX confirmed).
GEOJSON_URL = (
    "https://publicgemdata.nyc3.cdn.digitaloceanspaces.com/"
    "GOIT/2025-03/goit_2025-04-09.geojson"
)
DEST_FILENAME = "goit_2025-04-09.geojson"

# Fallback: re-discover the latest snapshot via CDX in case the file moves.
# The slug used by the GEM download form is "oil-pipeline-tracker".
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
    """Return a downloadable URL for the GOIT GeoJSON.

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
        "Could not resolve a download URL for the GOIT GeoJSON.\n"
        f"Primary CDN: {GEOJSON_URL}\n"
        f"Landing page: {LANDING}\n"
        "The xlsx download requires an email-form/Supabase token exchange and "
        "no public Wayback Machine snapshot of the xlsx exists.\n"
        "Options:\n"
        "  1. Download the xlsx manually from the GEM landing page and place it in "
        "data/raw/gem_oil_infra/.\n"
        "  2. Re-run after the CDN URL is updated."
    )


def download(dest: Path, force: bool = False) -> Path:
    """Download the GOIT GeoJSON to *dest*, skip if already exists (unless force)."""
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
