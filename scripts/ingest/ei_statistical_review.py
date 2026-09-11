"""Ingest Energy Institute Statistical Review of World Energy Excel workbook.

Downloads the main EI Stats Review xlsx to data/raw/ei_statistical_review/.
Uses the Wayback Machine CDX API to find a cached copy when the live site
returns 403 (Cloudflare bot-challenge protection).

Usage:
    uv run python -m scripts.ingest.ei_statistical_review [--force]
"""

from __future__ import annotations

from scripts.common.download import cli
from scripts.common.sources import EI

RAW_DIR = EI.raw_dir

# Live EI download URL (may be blocked by Cloudflare) — pinned in scripts/common/sources.py
EI_LIVE_URL = EI.download_url
DEST_FILENAME = EI.dest_filename

HELP = (
    "No Wayback Machine snapshot found for EI xlsx. "
    "Download manually and place in data/raw/ei_statistical_review/."
)


def main(argv: list[str] | None = None) -> None:
    cli(__doc__, RAW_DIR / DEST_FILENAME, EI_LIVE_URL, help_text=HELP, argv=argv)


if __name__ == "__main__":
    main()
