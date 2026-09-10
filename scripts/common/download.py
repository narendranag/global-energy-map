"""Shared single-file download scaffold for the GEM / EI ingests.

Every such ingest does the same thing: try a known URL (HEAD), fall back to the
newest Wayback Machine snapshot found via the CDX API, stream the file into
``data/raw/<source>/``, and skip the download when the file is already there
(unless ``--force``). Ingests declare their constants and call :func:`cli`.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import httpx

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
}

WAYBACK_CDX = (
    "http://web.archive.org/cdx/search/cdx"
    "?url={url}&output=json&limit=1&filter=statuscode:200"
    "&fl=timestamp,original&matchType=exact"
)
WAYBACK_SNAPSHOT = "http://web.archive.org/web/{timestamp}/{url}"


def cdx_query_url(url: str) -> str:
    """Wayback CDX query for the first 200-status capture of *url*."""
    return WAYBACK_CDX.format(url=url)


def snapshot_url_from_cdx(rows: list[list[str]]) -> str | None:
    """Turn a CDX JSON response (header row + matches) into a snapshot URL."""
    if len(rows) < 2:
        return None
    timestamp, original = rows[1][:2]
    return WAYBACK_SNAPSHOT.format(timestamp=timestamp, url=original)


def resolve_download_url(primary: str, *, cdx_target: str | None = None, help_text: str) -> str:
    """Return *primary* if it answers HEAD 200, else a Wayback snapshot of *cdx_target*.

    *cdx_target* defaults to *primary*. Raises RuntimeError(help_text) when
    neither works.
    """
    try:
        r = httpx.head(primary, follow_redirects=True, timeout=15, headers=HEADERS)
        if r.status_code == 200:
            return primary
    except httpx.RequestError:
        pass

    try:
        r = httpx.get(cdx_query_url(cdx_target or primary), timeout=60)
        r.raise_for_status()
        snapshot = snapshot_url_from_cdx(r.json())
        if snapshot:
            return snapshot
    except (httpx.HTTPError, ValueError):
        pass

    raise RuntimeError(help_text)


def download(url: str, dest: Path) -> Path:
    """Stream *url* to *dest* (parents created)."""
    print(f"downloading from: {url}", flush=True)
    dest.parent.mkdir(parents=True, exist_ok=True)
    total = 0
    with httpx.stream("GET", url, follow_redirects=True, timeout=300, headers=HEADERS) as r:
        r.raise_for_status()
        with dest.open("wb") as fh:
            for chunk in r.iter_bytes(chunk_size=65_536):
                fh.write(chunk)
                total += len(chunk)
    print(f"downloaded {total:,} bytes → {dest}")
    return dest


def fetch(
    dest: Path,
    primary: str,
    *,
    cdx_target: str | None = None,
    help_text: str,
    force: bool = False,
) -> Path:
    """Download to *dest* unless it already exists (or *force*)."""
    if dest.exists() and not force:
        print(f"already exists, skipping: {dest}")
        return dest
    print("Resolving download URL …", flush=True)
    url = resolve_download_url(primary, cdx_target=cdx_target, help_text=help_text)
    return download(url, dest)


def parse_force(description: str | None, argv: list[str] | None = None) -> bool:
    """Parse the ingests' common ``[--force]`` command line."""
    parser = argparse.ArgumentParser(description=description)
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-download even if the file already exists",
    )
    return parser.parse_args(argv).force


def cli(
    description: str | None,
    dest: Path,
    primary: str,
    *,
    cdx_target: str | None = None,
    help_text: str,
    argv: list[str] | None = None,
) -> Path:
    """The whole ``main()`` of a single-file ingest."""
    force = parse_force(description, argv)
    path = fetch(dest, primary, cdx_target=cdx_target, help_text=help_text, force=force)
    print(path)
    return path
