"""Ingest LNG-T3 dataset from Zenodo.

Source: Zhou et al. 2026, "Global Marine LNG Terminals, Tankers & Trade
(LNG-T3): A High-Resolution AIS-Based Dataset of LNG Trade Dynamics
(2020-2024)", DOI 10.5281/zenodo.19571058, CC BY 4.0.

Downloads the archive bundle (~28 MB) and unpacks five CSVs to
data/raw/lng_t3/<version>/. data/raw/ is gitignored.

Usage:
    uv run python -m scripts.ingest.lng_t3 [--force]
"""
from __future__ import annotations

import argparse
import sys
import zipfile
from pathlib import Path

import httpx

ZENODO_RECORD_ID = "19571058"
ARCHIVE_URL = f"https://zenodo.org/api/records/{ZENODO_RECORD_ID}/files-archive"
VERSION = "v1-2026-04-01"  # matches Zenodo publication_date
RAW_DIR = Path("data/raw/lng_t3") / VERSION

EXPECTED_FILES = [
    "LNG_terminal.csv",
    "LNG_tanker.csv",
    "LNG_tanker_voyage.csv",
    "LNG_terminal_daily.csv",
    "LNG_trade_daily.csv",
]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="Re-download even if cached")
    args = ap.parse_args()

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    archive = RAW_DIR / "all.zip"

    if archive.exists() and not args.force:
        print(f"[lng_t3] cached at {archive}", file=sys.stderr)
    else:
        print(f"[lng_t3] downloading from {ARCHIVE_URL}", file=sys.stderr)
        with httpx.stream("GET", ARCHIVE_URL, follow_redirects=True, timeout=120) as r:
            r.raise_for_status()
            with archive.open("wb") as f:
                for chunk in r.iter_bytes(chunk_size=65536):
                    f.write(chunk)
        print(f"[lng_t3] wrote {archive} ({archive.stat().st_size // 1024} KB)",
              file=sys.stderr)

    print(f"[lng_t3] extracting CSVs to {RAW_DIR}", file=sys.stderr)
    with zipfile.ZipFile(archive) as zf:
        for name in EXPECTED_FILES:
            if name not in zf.namelist():
                sys.exit(f"missing {name} in archive")
            zf.extract(name, RAW_DIR)

    for name in EXPECTED_FILES:
        p = RAW_DIR / name
        assert p.exists(), f"extraction missing {p}"
        print(f"  {p}  ({p.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
