"""Ingest GIE AGSI (gas storage) and ALSI (LNG terminals) daily country series.

Gas Infrastructure Europe publishes, once a day at 19:30 CET, the fill level of
European gas storage (AGSI) and the inventory and send-out of European LNG
terminals (ALSI). It is the freshest thing in this project by two years — the
LNG layer otherwise stops at 2024 — and it is free, needing only a registration
key.

**Country level only, deliberately.** Both APIs also expose per-facility series,
but ALSI's 41 facility names match our LNG terminal names for only ~71 % after
normalisation, and the near-misses are the dangerous kind: "Rovigo LNG Terminal"
against "Adriatic LNG", "Isle of Grain" against "Grain LNG". A fuzzy join there
would silently attach one terminal's throughput to another. Country codes are
unambiguous, so that is what we ingest; terminal-level needs a hand-checked name
map, which is a separate, deliberate piece of work.

Writes one JSON per (dataset, country) under data/raw/gie/<dataset>/, so a
re-run only refetches what it needs and a failure mid-way is resumable.

Requires GIE_API_KEY in the environment (register free at https://agsi.gie.eu/account).

Usage:
    uv run python -m scripts.ingest.gie_daily [--from YYYY-MM-DD] [--force]
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

from scripts.common.sources import GIE

RAW_DIR = GIE.raw_dir

# AGSI = storage, ALSI = LNG. Same API shape, different hosts.
DATASETS = {
    "agsi": "https://agsi.gie.eu/api",
    "alsi": "https://alsi.gie.eu/api",
}

# EU + UK + Ukraine. AGSI and ALSI cover overlapping but not identical sets; a
# country absent from one returns an empty `data` list, which we keep as an
# empty file so the transform can tell "no data" from "not fetched".
COUNTRIES = [
    "AT",
    "BE",
    "BG",
    "HR",
    "CZ",
    "DK",
    "FR",
    "DE",
    "GR",
    "HU",
    "IE",
    "IT",
    "LV",
    "LT",
    "NL",
    "PL",
    "PT",
    "RO",
    "SK",
    "SI",
    "ES",
    "SE",
    "GB",
    "UA",
]

START_DEFAULT = GIE.extra["series_start"]
_PAGE_SIZE = 300


def _api_key() -> str:
    key = os.environ.get("GIE_API_KEY", "").strip()
    if not key:
        raise SystemExit(
            "GIE_API_KEY is not set. Register free at https://agsi.gie.eu/account "
            "and add it to ~/.config/secrets.env."
        )
    return key


def _get(url: str, key: str, attempts: int = 4) -> dict:
    """GET with backoff. GIE rate-limits, and a refresh makes ~48 calls."""
    for attempt in range(attempts):
        req = urllib.request.Request(
            url, headers={"x-key": key, "User-Agent": "global-energy-map/gie"}
        )
        try:
            with urllib.request.urlopen(req, timeout=90) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as exc:
            if exc.code in (429, 500, 502, 503) and attempt < attempts - 1:
                time.sleep(2**attempt)
                continue
            raise
    raise RuntimeError("unreachable")


def fetch_one(dataset: str, country: str, start: str, end: str, key: str) -> list[dict]:
    """All gas days for one country, following pagination."""
    base = DATASETS[dataset]
    rows: list[dict] = []
    page = 1
    while True:
        qs = urllib.parse.urlencode(
            {"country": country, "from": start, "to": end, "size": _PAGE_SIZE, "page": page}
        )
        payload = _get(f"{base}?{qs}", key)
        rows.extend(payload.get("data", []))
        if page >= int(payload.get("last_page", 1) or 1):
            return rows
        page += 1


def fetch(start: str, end: str, force: bool = False) -> int:
    key = _api_key()
    written = 0
    for dataset in DATASETS:
        out_dir = RAW_DIR / dataset
        out_dir.mkdir(parents=True, exist_ok=True)
        for country in COUNTRIES:
            dest = out_dir / f"{country}.json"
            if dest.exists() and not force:
                continue
            rows = fetch_one(dataset, country, start, end, key)
            dest.write_text(json.dumps(rows))
            written += 1
            print(f"  {dataset}/{country}: {len(rows)} gas days", file=sys.stderr)
    print(f"wrote {written} files → {RAW_DIR} ({start} … {end})")
    return written


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--from", dest="start", default=START_DEFAULT, help="first gas day")
    ap.add_argument("--to", dest="end", default=GIE.as_of, help="last gas day")
    ap.add_argument("--force", action="store_true", help="refetch countries already on disk")
    args = ap.parse_args(argv)
    fetch(args.start, args.end, force=args.force)


if __name__ == "__main__":
    main()
