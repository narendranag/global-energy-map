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

from scripts.common.download import cli
from scripts.common.sources import GEM_GOIT

RAW_DIR = GEM_GOIT.raw_dir
LANDING = GEM_GOIT.landing_url

# Publicly-accessible GeoJSON on GEM's DigitalOcean CDN (no form/token required).
# The xlsx is gated behind Supabase; no Wayback snapshot of it exists (CDX confirmed).
# If the CDN URL fails, the newest Wayback capture of the same URL is used.
# Pinned in scripts/common/sources.py.
GEOJSON_URL = GEM_GOIT.download_url
DEST_FILENAME = GEM_GOIT.dest_filename

HELP = (
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


def main(argv: list[str] | None = None) -> None:
    cli(__doc__, RAW_DIR / DEST_FILENAME, GEOJSON_URL, help_text=HELP, argv=argv)


if __name__ == "__main__":
    main()
