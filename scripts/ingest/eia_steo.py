"""Ingest EIA STEO shale-region production + the files that draw the regions.

Three inputs, all US Government public domain:

* **STEO annual series** (API v2) — crude oil and marketed natural gas
  production for the five county-defined producing regions STEO reports:
  Permian, Bakken, Eagle Ford, Haynesville, Appalachia. One JSON, one request.
* **DPR workbook** — its ``RegionCounties`` sheet is the county list that
  defines those regions (see the ``EIA_DPR_COUNTIES`` pin for why the DPR's).
* **Census 1:20m counties** — the polygons dissolved into region shapes.

STEO returns forecast years in the same series as history; this ingest keeps
the raw response whole and the transform drops forecasts, so the raw file
always shows what EIA actually served.

Requires EIA_API_KEY (register free at https://www.eia.gov/opendata/register.php).
Without it, falls back to api.data.gov's shared DEMO_KEY with a warning: that
key is public and rate-limited to a handful of calls an hour, which covers this
ingest's one request but not repeated runs.

Usage:
    uv run python -m scripts.ingest.eia_steo [--force]
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

from scripts.common.sources import CENSUS_COUNTIES, EIA_DPR_COUNTIES, EIA_STEO

RAW_DIR = EIA_STEO.raw_dir

# region_id → STEO series suffix. COPR* = crude oil production (million b/d),
# NGMP* = marketed natural gas production (billion cubic feet/d).
REGIONS: dict[str, str] = {
    "permian": "PM",
    "bakken": "BK",
    "eagle_ford": "EF",
    "haynesville": "HA",
    "appalachia": "AP",
}
SERIES_PREFIXES = ("COPR", "NGMP")


def series_ids() -> list[str]:
    return [f"{p}{code}" for code in REGIONS.values() for p in SERIES_PREFIXES]


def _api_key() -> str:
    key = os.environ.get(EIA_STEO.extra["api_key_env"], "").strip()
    if key:
        return key
    print(
        "EIA_API_KEY is not set — using the shared, rate-limited DEMO_KEY. Register free at "
        "https://www.eia.gov/opendata/register.php and add it to ~/.config/secrets.env.",
        file=sys.stderr,
    )
    return "DEMO_KEY"


def _get_json(url: str, attempts: int = 4) -> dict:
    for attempt in range(attempts):
        req = urllib.request.Request(url, headers={"User-Agent": "global-energy-map/eia"})
        try:
            with urllib.request.urlopen(req, timeout=90) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as exc:
            if exc.code in (429, 500, 502, 503) and attempt < attempts - 1:
                time.sleep(2 ** (attempt + 1))
                continue
            raise
    raise RuntimeError("unreachable")


STEO_FILE = "steo_annual.json"


def steo_url(key: str) -> str:
    """Every region series in one request (10 series × ~20 years, well under 5,000 rows)."""
    params = [
        ("api_key", key),
        ("frequency", "annual"),
        ("data[0]", "value"),
        *[("facets[seriesId][]", sid) for sid in series_ids()],
        ("sort[0][column]", "period"),
        ("sort[0][direction]", "asc"),
        ("length", "5000"),
    ]
    return f"{EIA_STEO.download_url}?{urllib.parse.urlencode(params)}"


def fetch_series(force: bool = False) -> int:
    dest = RAW_DIR / STEO_FILE
    if dest.exists() and not force:
        return 0
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    payload = _get_json(steo_url(_api_key()))
    if "response" not in payload:
        raise SystemExit(f"EIA API error: {payload.get('error', payload)}")
    rows = payload["response"]["data"]
    missing = set(series_ids()) - {r["seriesId"] for r in rows}
    if missing:
        raise SystemExit(
            f"EIA returned no rows for {sorted(missing)} — have the series ids changed?"
        )
    # Keep the response body only: the request echo would record the key.
    dest.write_text(json.dumps(payload["response"], indent=1))
    print(f"  {STEO_FILE}: {len(rows)} series-years", file=sys.stderr)
    return 1


def fetch_file(url: str, dest_name: str, force: bool = False) -> bool:
    dest = RAW_DIR / dest_name
    if dest.exists() and not force:
        return False
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 global-energy-map"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        dest.write_bytes(resp.read())
    print(f"  {dest_name}: {dest.stat().st_size:,} bytes", file=sys.stderr)
    return True


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--force", action="store_true", help="refetch files already on disk")
    args = ap.parse_args(argv)
    n = fetch_series(force=args.force)
    for pin in (EIA_DPR_COUNTIES, CENSUS_COUNTIES):
        n += fetch_file(pin.download_url, pin.dest_filename, force=args.force)
    print(f"wrote {n} files → {RAW_DIR}")


if __name__ == "__main__":
    main()
