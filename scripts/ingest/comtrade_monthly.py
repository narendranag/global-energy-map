"""Ingest UN Comtrade monthly bilateral trade for crude (HS 2709) and LNG (HS 271111).

Supplements BACI rather than replacing it. BACI is the harmonised annual
backbone (1995–2024, both sides of every flow reconciled); Comtrade is
as-reported and monthly, so it reaches roughly a year and a half further
forward at the cost of that reconciliation. The two are kept in separate
tables for that reason — see docs/data-sources.md.

Requires a key. The keyless preview tier cannot do this: `reporterCode=all`
returns 400 there and omitting it returns 429, so a global matrix would need
~200 calls per month. With a subscription key one call returns every reporter
for a period, which is what makes this feasible at all.

Calls are one per (period, commodity) — asking for both commodities at once
took 213 s against 49 s each, and asking for three periods at once returned
500. One JSON per call lands under data/raw/comtrade/, so an interrupted run
resumes instead of restarting.

Requires COMTRADE_API_KEY (free tier: https://comtradedeveloper.un.org/).
Note the portal regenerates free keys ad hoc and deactivates them if the
account goes unused, so a failing refresh may just need a new key.

Usage:
    uv run python -m scripts.ingest.comtrade_monthly [--from YYYYMM] [--to YYYYMM] [--force]
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

from scripts.common.sources import COMTRADE

RAW_DIR = COMTRADE.raw_dir
API = COMTRADE.download_url

# HS 2709 crude petroleum, HS 271111 liquefied natural gas — the same two codes
# the BACI table carries, so the layers line up.
COMMODITIES = ("2709", "271111")

# Imports only. The importer's declaration is what the exposure scenarios key
# on, and pulling exports as well would double an already slow ingest for a
# second, less-reliable view of the same flows.
FLOW = "M"


def _api_key() -> str:
    key = os.environ.get("COMTRADE_API_KEY", "").strip()
    if not key:
        raise SystemExit(
            "COMTRADE_API_KEY is not set. Subscribe (free) at "
            "https://comtradedeveloper.un.org/ and add it to ~/.config/secrets.env."
        )
    return key


def months(start: str, end: str) -> list[str]:
    """Inclusive YYYYMM range."""
    out: list[str] = []
    y, m = int(start[:4]), int(start[4:])
    ey, em = int(end[:4]), int(end[4:])
    while (y, m) <= (ey, em):
        out.append(f"{y}{m:02d}")
        m += 1
        if m == 13:
            y, m = y + 1, 1
    return out


def _get(url: str, key: str, attempts: int = 3) -> dict:
    """GET with backoff. These responses take ~50 s, so the timeout is generous."""
    for attempt in range(attempts):
        req = urllib.request.Request(
            url,
            headers={
                "Ocp-Apim-Subscription-Key": key,
                "User-Agent": "global-energy-map/comtrade",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=300) as resp:
                return json.loads(resp.read())
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as exc:
            code = getattr(exc, "code", None)
            if attempt < attempts - 1 and (code is None or code in (429, 500, 502, 503, 504)):
                time.sleep(10 * (attempt + 1))
                continue
            raise
    raise RuntimeError("unreachable")


def fetch(start: str, end: str, force: bool = False) -> int:
    key = _api_key()
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    written = 0
    for period in months(start, end):
        for cmd in COMMODITIES:
            dest = RAW_DIR / f"{period}_{cmd}.json"
            if dest.exists() and not force:
                continue
            qs = urllib.parse.urlencode({"period": period, "cmdCode": cmd, "flowCode": FLOW})
            started = time.time()
            payload = _get(f"{API}?{qs}", key)
            rows = payload.get("data") or []
            dest.write_text(json.dumps(rows))
            written += 1
            print(
                f"  {period} HS{cmd}: {len(rows)} rows ({time.time() - started:.0f}s)",
                file=sys.stderr,
            )
    print(f"wrote {written} files → {RAW_DIR} ({start} … {end})")
    return written


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--from", dest="start", default=COMTRADE.extra["series_start"])
    ap.add_argument("--to", dest="end", default=COMTRADE.extra["series_end"])
    ap.add_argument("--force", action="store_true", help="refetch periods already on disk")
    args = ap.parse_args(argv)
    fetch(args.start, args.end, force=args.force)


if __name__ == "__main__":
    main()
