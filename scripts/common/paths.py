"""Deterministic raw-input discovery."""

from __future__ import annotations

from pathlib import Path


def latest(raw_dir: Path, pattern: str) -> Path:
    """Return the lexicographically last file in *raw_dir* matching *pattern*.

    Raw snapshots carry their release date in the file name, so "last" is the
    newest release. Sorting makes the choice independent of directory order.
    Raises FileNotFoundError (naming the ingest to run) when nothing matches.
    """
    matches = sorted(raw_dir.glob(pattern))
    if not matches:
        raise FileNotFoundError(
            f"no {pattern} in {raw_dir} — run the matching scripts.ingest first"
        )
    return matches[-1]
