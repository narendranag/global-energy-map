"""Ingest Global Energy Monitor Oil & Gas Extraction Tracker workbook.

Downloads the GOGET xlsx to data/raw/gem_extraction/.
The live GEM site requires an email-form/Supabase token exchange, so we
always source from the Wayback Machine CDX API which has a CC-BY-4.0
archived copy.

Usage:
    uv run python -m scripts.ingest.gem_extraction [--force]
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import httpx

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
_ORIGINAL_URL = (
    "https://globalenergymonitor.org/wp-content/uploads/2023/08/"
    "Global-Oil-and-Gas-Extraction-Tracker-July-2023.xlsx"
)
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
    """Return a downloadable Wayback URL, falling back to CDX discovery."""
    # Try the known snapshot URL first (HEAD to check availability)
    try:
        r = httpx.head(
            WAYBACK_SNAPSHOT_URL, follow_redirects=True, timeout=15, headers=HEADERS
        )
        if r.status_code == 200:
            return WAYBACK_SNAPSHOT_URL
    except httpx.RequestError:
        pass

    # Fall back to CDX discovery
    cdx_url = WAYBACK_CDX.format(url=_ORIGINAL_URL)
    r = httpx.get(cdx_url, timeout=60)
    r.raise_for_status()
    rows = r.json()
    # rows[0] is the header ["timestamp","original"], rows[1..] are matches
    if len(rows) < 2:
        raise RuntimeError(
            "No Wayback Machine snapshot found for GEM extraction xlsx. "
            "Download manually from https://globalenergymonitor.org/projects/"
            "global-oil-gas-extraction-tracker/ and place in "
            "data/raw/gem_extraction/."
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
