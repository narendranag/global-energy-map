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

from scripts.common.download import cli
from scripts.common.sources import GEM_GGIT

RAW_DIR = GEM_GGIT.raw_dir
LANDING = GEM_GGIT.landing_url

# Publicly-accessible GeoJSON on GEM's DigitalOcean CDN (no form/token required).
# The xlsx is gated behind Supabase; no Wayback snapshot of it exists (CDX confirmed).
# URL discovered from: https://globalenergymonitor.github.io/maps/trackers/ggit/config.js
# Pinned in scripts/common/sources.py.
GEOJSON_URL = GEM_GGIT.download_url
DEST_FILENAME = GEM_GGIT.dest_filename

HELP = (
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


def main(argv: list[str] | None = None) -> None:
    cli(__doc__, RAW_DIR / DEST_FILENAME, GEOJSON_URL, help_text=HELP, argv=argv)


if __name__ == "__main__":
    main()
