"""One-command reproducible build of every shipped artefact in public/data/.

Runs the transforms in dependency order (each step imports its module and
calls ``main()``; steps are timed and the build stops at the first failure):

    build_country_year → build_trade_flow → build_assets → build_refineries
    → build_storage → build_ports → build_lng_terminals → build_assets_open
    → build_lng_voyages → build_pipelines → build_basins
    → build_disruption_routing → build_catalog

(build_assets_open writes the downloadable open subset of assets.parquet, so
it runs after the last assets.parquet writer.) Source URLs and release pins
live in scripts/common/sources.py; the refresh runbook is docs/refresh.md.

Ingests (network, unpinned sources) are NOT run unless ``--ingest`` is given;
the transforms read the raw snapshots already in data/raw/.

Determinism: every writer is deterministic (fixed row order, no wall-clock
timestamps; catalog ``generated_at`` is the newest source ``as_of``), so two
consecutive runs leave ``git status`` clean.

Usage:
    uv run python -m scripts.build_all                       # all transforms
    uv run python -m scripts.build_all --from build_refineries
    uv run python -m scripts.build_all --only build_catalog
    uv run python -m scripts.build_all --ingest              # ingests first
"""

from __future__ import annotations

import argparse
import importlib
import sys
import time
from collections.abc import Callable, Sequence

TRANSFORMS: list[str] = [
    "build_country_year",
    "build_trade_flow",
    "build_assets",
    "build_refineries",
    "build_storage",
    "build_ports",
    "build_lng_terminals",
    "build_assets_open",
    "build_lng_voyages",
    "build_pipelines",
    "build_basins",
    "build_disruption_routing",
    "build_catalog",
]

INGESTS: list[str] = [
    "ei_statistical_review",
    "baci",
    "gem_extraction",
    "gem_oil_infra",
    "gem_gas_infra",
    "netl_gogi",
    "osm_refineries",
    "lng_t3",
]


def _module(step: str) -> str:
    package = "scripts.transform" if step in TRANSFORMS else "scripts.ingest"
    return f"{package}.{step}"


def select_steps(
    only: Sequence[str] | None = None,
    start: str | None = None,
    ingest: bool = False,
) -> list[str]:
    """Return the ordered step names to run.

    *only* runs just those transforms (in DAG order); *start* runs the
    transform named and everything after it. *ingest* prepends every ingest.
    """
    for name in [*(only or []), *([start] if start else [])]:
        if name not in TRANSFORMS:
            raise ValueError(f"unknown step {name!r}; expected one of {TRANSFORMS}")
    if only and start:
        raise ValueError("--only and --from are mutually exclusive")
    if only:
        steps = [t for t in TRANSFORMS if t in set(only)]
    elif start:
        steps = TRANSFORMS[TRANSFORMS.index(start) :]
    else:
        steps = list(TRANSFORMS)
    return [*INGESTS, *steps] if ingest else steps


def run_step(step: str, load: Callable[[str], object] = importlib.import_module) -> float:
    """Import the step's module and call its ``main()``; return seconds taken."""
    module = load(_module(step))
    t0 = time.perf_counter()
    argv = sys.argv
    sys.argv = [_module(step)]  # steps parse their own (empty) command line
    try:
        module.main()  # type: ignore[attr-defined]
    finally:
        sys.argv = argv
    return time.perf_counter() - t0


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Rebuild public/data/ from data/raw/.")
    parser.add_argument("--only", action="append", metavar="STEP", help="run only STEP")
    parser.add_argument("--from", dest="start", metavar="STEP", help="run STEP and later")
    parser.add_argument("--ingest", action="store_true", help="run the ingests first")
    args = parser.parse_args(argv)
    try:
        steps = select_steps(args.only, args.start, args.ingest)
    except ValueError as exc:
        parser.error(str(exc))

    total = 0.0
    for i, step in enumerate(steps, 1):
        print(f"\n=== [{i}/{len(steps)}] {step} ===", flush=True)
        try:
            dt = run_step(step)
        except SystemExit as exc:
            if exc.code not in (None, 0):
                print(f"\nFAILED at {step}: {exc.code}", file=sys.stderr)
                raise SystemExit(1) from exc
            dt = 0.0
        except Exception:
            print(f"\nFAILED at {step}", file=sys.stderr)
            raise
        total += dt
        print(f"--- {step} done in {dt:.1f}s", flush=True)
    print(f"\nbuild_all: {len(steps)} steps in {total:.1f}s")


if __name__ == "__main__":
    main()
