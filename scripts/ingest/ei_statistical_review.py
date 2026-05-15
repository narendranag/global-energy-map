"""Ingest Energy Institute Statistical Review of World Energy Excel workbook.

Downloads the main EI Stats Review xlsx to data/raw/ei_statistical_review/.
Uses the Wayback Machine CDX API to find a cached copy when the live site
returns 403 (Cloudflare bot-challenge protection).

Usage:
    uv run python -m scripts.ingest.ei_statistical_review [--force]
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import httpx

RAW_DIR = Path("data/raw/ei_statistical_review")

# Live EI download URL (may be blocked by Cloudflare)
EI_LIVE_URL = (
    "https://www.energyinst.org/__data/assets/excel_doc/0008/1656215/"
    "EI-Stats-Review-ALL-data.xlsx"
)

# Fallback: Wayback Machine CDX API
WAYBACK_CDX = (
    "http://web.archive.org/cdx/search/cdx"
    "?url={url}&output=json&limit=1&filter=statuscode:200"
    "&fl=timestamp,original&matchType=exact"
)
WAYBACK_SNAPSHOT = "http://web.archive.org/web/{timestamp}/{url}"

DEST_FILENAME = "EI-Stats-Review-ALL-data.xlsx"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
}


def _resolve_download_url() -> str:
    """Return a downloadable URL: live EI URL if accessible, else Wayback."""
    # Try live EI URL first (HEAD only to avoid downloading)
    try:
        r = httpx.head(EI_LIVE_URL, follow_redirects=True, timeout=15, headers=HEADERS)
        if r.status_code == 200:
            return EI_LIVE_URL
    except httpx.RequestError:
        pass

    # Fall back to Wayback Machine
    cdx_url = WAYBACK_CDX.format(url=EI_LIVE_URL)
    r = httpx.get(cdx_url, timeout=30)
    r.raise_for_status()
    rows = r.json()
    # rows[0] is header ["timestamp","original"], rows[1..] are matches
    if len(rows) < 2:
        raise RuntimeError(
            "No Wayback Machine snapshot found for EI xlsx. "
            "Download manually and place in data/raw/ei_statistical_review/."
        )
    timestamp, original = rows[1]
    return WAYBACK_SNAPSHOT.format(timestamp=timestamp, url=original)


def download(dest: Path, force: bool = False) -> Path:
    """Download the workbook to *dest*, skip if already exists (unless force)."""
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
