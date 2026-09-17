"""Ingest GEM's pipeline route geometries (GOIT + GGIT) from GitHub.

``GlobalEnergyMonitor/goit-ggit-pipeline-routes`` is, per its own README,
"the source of truth for route geometry" for both pipeline trackers: one
GeoJSON per pipeline, named ``<ProjectID>.geojson``, in WGS 84, validated on
every pull request. It is the only GEM pipeline source still publicly
maintained — the DigitalOcean CDN we used through 2026-06 is empty and the
origin answers 410 Gone (see docs/refresh.md).

It carries geometry *only*; attributes (capacity, status, country, operator,
start year) still come from the tracker snapshots in ``data/raw/gem_*_infra/``.
``build_pipelines`` joins the two on ``pipeline_id``.

Downloads the repository tarball once — 6,856 files is far too many to fetch
individually — and extracts just the route GeoJSONs.

Usage:
    uv run python -m scripts.ingest.gem_pipeline_routes [--force]
"""

from __future__ import annotations

import argparse
import io
import sys
import tarfile
import urllib.request
from pathlib import Path

from scripts.common.sources import GEM_ROUTES

RAW_DIR = GEM_ROUTES.raw_dir
TARBALL_URL = GEM_ROUTES.download_url

# Only these subtrees hold pipelines we draw; hydrogen is out of scope.
WANTED_FOLDERS = ("gas-pipelines", "liquid-pipelines")
_ROUTES_PREFIX = "data/individual-routes/"


def _member_target(name: str) -> Path | None:
    """Map a tarball member path to its destination, or None to skip it.

    GitHub tarballs nest everything under a commit-specific top directory, so
    the first path segment is dropped.
    """
    parts = Path(name).parts
    if len(parts) < 2:
        return None
    rel = "/".join(parts[1:])
    if not rel.startswith(_ROUTES_PREFIX) or not rel.endswith(".geojson"):
        return None
    tail = rel[len(_ROUTES_PREFIX) :]
    folder, _, filename = tail.partition("/")
    if folder not in WANTED_FOLDERS or not filename or "/" in filename:
        return None
    return RAW_DIR / folder / filename


def fetch(force: bool = False) -> int:
    """Download and extract route files. Returns the number written."""
    marker = RAW_DIR / ".complete"
    if marker.exists() and not force:
        existing = sum(1 for _ in RAW_DIR.rglob("*.geojson"))
        print(f"{RAW_DIR} already populated ({existing} routes); use --force to re-fetch")
        return existing

    print(f"downloading {TARBALL_URL} …", file=sys.stderr)
    req = urllib.request.Request(
        TARBALL_URL, headers={"User-Agent": "global-energy-map/gem-pipeline-routes"}
    )
    with urllib.request.urlopen(req, timeout=300) as resp:
        blob = resp.read()
    print(f"downloaded {len(blob):,} bytes", file=sys.stderr)

    written = 0
    with tarfile.open(fileobj=io.BytesIO(blob), mode="r:gz") as tar:
        for member in tar:
            if not member.isfile():
                continue
            target = _member_target(member.name)
            if target is None:
                continue
            fh = tar.extractfile(member)
            if fh is None:
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(fh.read())
            written += 1

    if not written:
        raise SystemExit(
            f"no route files found in the tarball — the repo layout changed. "
            f"Check {GEM_ROUTES.landing_url} and update WANTED_FOLDERS / _ROUTES_PREFIX."
        )
    marker.write_text("")
    print(f"extracted {written} route files → {RAW_DIR}")
    return written


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--force", action="store_true", help="re-download even if already present")
    args = ap.parse_args(argv)
    fetch(force=args.force)


if __name__ == "__main__":
    main()
