"""Ingest Global Energy Monitor Oil & Gas Extraction Tracker workbook.

Downloads the GOGET xlsx to data/raw/gem_extraction/.
The live GEM site requires an email-form/Supabase token exchange, so we
always source from the Wayback Machine, which has a CC-BY-4.0 archived copy
(pinned snapshot first; CDX discovery on the original URL as fallback).

Usage:
    uv run python -m scripts.ingest.gem_extraction [--force]
"""

from __future__ import annotations

from pathlib import Path

from scripts.common.download import cli

RAW_DIR = Path("data/raw/gem_extraction")

# Known Wayback Machine snapshot (July 2023 release, archived 2024-03-21)
# The live GEM download requires a gated form; Wayback provides public access.
WAYBACK_SNAPSHOT_URL = (
    "https://web.archive.org/web/20240321185306/"
    "https://globalenergymonitor.org/wp-content/uploads/2023/08/"
    "Global-Oil-and-Gas-Extraction-Tracker-July-2023.xlsx"
)
DEST_FILENAME = "Global-Oil-and-Gas-Extraction-Tracker-July-2023.xlsx"

# Fallback: re-discover via Wayback CDX in case the snapshot URL changes
ORIGINAL_URL = (
    "https://globalenergymonitor.org/wp-content/uploads/2023/08/"
    "Global-Oil-and-Gas-Extraction-Tracker-July-2023.xlsx"
)

HELP = (
    "No Wayback Machine snapshot found for GEM extraction xlsx. "
    "Download manually from https://globalenergymonitor.org/projects/"
    "global-oil-gas-extraction-tracker/ and place in "
    "data/raw/gem_extraction/."
)


def main(argv: list[str] | None = None) -> None:
    cli(
        __doc__,
        RAW_DIR / DEST_FILENAME,
        WAYBACK_SNAPSHOT_URL,
        cdx_target=ORIGINAL_URL,
        help_text=HELP,
        argv=argv,
    )


if __name__ == "__main__":
    main()
