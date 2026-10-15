"""Ingest IMF PortWatch daily chokepoint transits for the modelled chokepoints.

PortWatch (IMF with the University of Oxford) estimates, from AIS vessel
positions, how many ships of each type pass each of 28 maritime chokepoints a
day and their deadweight capacity. It is the one observed, current measure of
traffic at the chokepoints the scenarios close, so it is shown beside them as
context — never as an input to the exposure figure.

Only the chokepoints a scenario models are fetched (``CHOKEPOINTS``). The
public ArcGIS FeatureServer needs no key; it pages at 1,000 records, so each
chokepoint's full daily series since 2019 is a handful of requests. Every run
refetches the whole series, because PortWatch revises recent days weekly.

Writes one JSON list of attribute dicts per chokepoint under
data/raw/portwatch/<portid>.json.

Usage:
    uv run python -m scripts.ingest.portwatch_chokepoints [--from YYYY-MM-DD]
"""

from __future__ import annotations

import argparse
import json

import httpx

from scripts.common.sources import PORTWATCH

RAW_DIR = PORTWATCH.raw_dir
QUERY_URL = PORTWATCH.download_url
PAGE_SIZE = 1000

# PortWatch id → our scenario id (src/lib/scenarios/registry.ts). PortWatch
# also tracks Panama, Gibraltar, Dover, Oresund, the Cape of Good Hope and
# others; none is a modelled scenario. "Bosporus Strait" stands for the
# Turkish Straits scenario (Bosporus + Dardanelles in series).
CHOKEPOINTS: dict[str, str] = {
    "chokepoint1": "suez",  # Suez Canal
    "chokepoint3": "turkish_straits",  # Bosporus Strait
    "chokepoint4": "bab_el_mandeb",  # Bab el-Mandeb Strait
    "chokepoint5": "malacca",  # Malacca Strait
    "chokepoint6": "hormuz",  # Strait of Hormuz
}

FIELDS = (
    "date",
    "portid",
    "portname",
    "n_total",
    "n_tanker",
    "capacity_tanker",
)


def query_params(portid: str, since: str, offset: int) -> dict[str, str]:
    """One page of one chokepoint's daily rows, oldest first."""
    return {
        "where": f"portid = '{portid}' AND date >= TIMESTAMP '{since} 00:00:00'",
        "outFields": ",".join(FIELDS),
        "orderByFields": "date",
        "resultOffset": str(offset),
        "resultRecordCount": str(PAGE_SIZE),
        "f": "json",
    }


def fetch_chokepoint(client: httpx.Client, portid: str, since: str) -> list[dict]:
    rows: list[dict] = []
    offset = 0
    while True:
        resp = client.get(QUERY_URL, params=query_params(portid, since, offset))
        resp.raise_for_status()
        body = resp.json()
        if "error" in body:
            raise RuntimeError(f"PortWatch error for {portid}: {body['error']}")
        page = [f["attributes"] for f in body.get("features", [])]
        rows.extend(page)
        if not body.get("exceededTransferLimit") or not page:
            return rows
        offset += len(page)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Fetch IMF PortWatch daily chokepoint transits.")
    ap.add_argument("--from", dest="since", default=PORTWATCH.extra["series_start"])
    args = ap.parse_args(argv)

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    with httpx.Client(timeout=60.0, headers={"User-Agent": "global-energy-map"}) as client:
        for portid, scenario in CHOKEPOINTS.items():
            rows = fetch_chokepoint(client, portid, args.since)
            if not rows:
                raise SystemExit(f"PortWatch returned no rows for {portid} ({scenario})")
            (RAW_DIR / f"{portid}.json").write_text(json.dumps(rows, separators=(",", ":")))
            print(f"  {portid} ({scenario}): {len(rows):,} days, last {rows[-1]['date']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
