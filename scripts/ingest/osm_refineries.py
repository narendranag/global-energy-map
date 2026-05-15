"""Pull oil refineries from OpenStreetMap via the Overpass API.

Caches the raw Overpass JSON response in data/raw/osm_refineries/.
Idempotent: re-running without --force uses the cached file.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

import httpx

CACHE_DIR = Path("data/raw/osm_refineries")

# Primary endpoint + fallbacks
ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]

# OSM canonical tags for oil refineries:
#   industrial=oil_refinery (preferred)
#   industrial=oil
#   man_made=works + product=oil
# We pull all three with `out center` to get centroids of ways/relations.
QUERY = """
[out:json][timeout:180];
(
  nwr["industrial"="oil_refinery"];
  nwr["industrial"="oil"];
  nwr["man_made"="works"]["product"="oil"];
);
out center tags;
"""


def _fetch(query: str) -> dict:
    """Try each Overpass endpoint in order; return first successful response."""
    last_exc: Exception | None = None
    for endpoint in ENDPOINTS:
        print(f"querying {endpoint}…", file=sys.stderr)
        try:
            with httpx.Client(timeout=300) as client:
                r = client.post(
                    endpoint,
                    data={"data": query},
                    headers={"User-Agent": "global-energy-map/0.1 (osint research)"},
                )
                r.raise_for_status()
                payload = r.json()
                print(f"success from {endpoint}", file=sys.stderr)
                payload["_source_endpoint"] = endpoint
                return payload
        except (httpx.HTTPStatusError, httpx.RequestError) as exc:
            print(f"  failed ({exc}), trying next endpoint…", file=sys.stderr)
            last_exc = exc
    raise RuntimeError(
        f"All Overpass endpoints failed. Last error: {last_exc}"
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    out = CACHE_DIR / "refineries.json"
    if out.exists() and not args.force:
        print(out)
        return

    payload = _fetch(QUERY)

    # Stamp the fetch time for reproducibility
    payload["_fetched_at"] = datetime.now(UTC).isoformat()
    out.write_text(json.dumps(payload))
    n = len(payload.get("elements", []))
    endpoint = payload.get("_source_endpoint", "unknown")
    print(f"wrote {out} elements={n} endpoint={endpoint}", file=sys.stderr)
    print(out)


if __name__ == "__main__":
    main()
