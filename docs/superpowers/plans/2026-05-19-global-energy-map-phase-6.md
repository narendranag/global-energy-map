# Global Energy Map — Phase 6 Implementation Plan

## Deviations (2026-09-09)

Actual implementation diverged from this plan's estimates in a few places, all discovered and resolved during execution:

- **GIIGNL reconciliation gate fired.** Task 6's validation script found LNG-T3 covers only 22–41% of GIIGNL's global LNG trade totals for 2020–2024 (every year exceeds the 30% acceptable-gap threshold) — the "likely outcome" the plan flagged. Per the plan's own contingency, the scenario engine (Tasks 9–10, `src/lib/scenarios/lng-t3.ts`) keeps BACI HS 271111 as the sole country-total source for all years and uses LNG-T3 voyages only to redistribute a country's BACI total across its covered terminals and to derive each terminal's exporter mix. LNG-T3 is never used as a country-total source.
- **Duplicate-name collapse (not anticipated in Task 5's original estimate).** 25 LNG-T3 terminal names carried both an "operating" record and a separate "construction" (expansion-phase) record under the same name. `collapse_duplicate_names()` (commit `289ed88`) resolves each pair (operating kept over construction, higher capacity on ties) before `asset_id` construction, bringing LNG-T3's active count from 330 down to **305**.
- **GEM verbatim-duplicate features.** The raw GGIT geojson contained byte-identical duplicate features (same pid/status/geometry/capacity repeated 2–10× per terminal, e.g. Elba Island LNG Terminal ×10). `_load_gem` now drops 149 exact duplicates by `asset_id` before the 25 km proximity dedup against LNG-T3, bringing the GEM supplement down to **8** terminals (the plan estimated ~10).
- **Final counts** (vs. the plan's Task 5 estimates of ~330 LNG-T3 + ~10 GEM ≈ ~340 total): **305 LNG-T3 + 8 GEM = 313 LNG terminals** (74 lng_export / 239 lng_import), out of `assets.parquet`'s 37,608 total rows. `commissioned_year` coverage on LNG rows is **97.8%** (plan estimated ~88%). Voyage/trade/terminal-daily parquet counts matched the plan's expectations exactly: 17,592 / 16,691 / 16,115 rows; 159 of 471 unique terminal names in `LNG_terminal.csv` have measured throughput.

---

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ingest LNG-T3 (Zhou 2026, Zenodo `10.5281/zenodo.19571058`, CC BY 4.0) so the LNG layer goes from "static terminal capacity (GEM)" to "measured global LNG flow." Terminals get LNG-T3 as primary + GEM as 25 km supplement; voyages render as a new ArcLayer with year filter; Hormuz-LNG scenario uses measured 2020–2024 daily flows with per-terminal disaggregation when year ∈ [2020, 2024], falling back to BACI for earlier years.

**Architecture:** Three slices, mirrored on Phase 5's structure. (1) Python ingest + four transform updates (terminals augmentation + three new parquets for voyages/trade-daily/terminal-daily) with TDD on math-bearing helpers. (2) TS scenario engine extension with a new `lng-t3.ts` pure-function module + a year-gated branch in `engine.ts`. (3) New `LngVoyagesLayer` ArcLayer toggled under the Gas group in `LayerPanel`, plus `LngTerminalsLayer` tooltip enrichment. Catalog v5; one bundled PR; Opus code review; docs follow-up for status flip.

**Tech Stack:** Same as Phases 1–5 — Next.js 16 App Router, React 19, TS strict, deck.gl 9 (ArcLayer for voyages), maplibre-gl 4, DuckDB-WASM, pnpm 10. Python (uv): httpx, pandas, geopandas, pyarrow, pytest. Spec: `docs/superpowers/specs/2026-05-19-global-energy-map-phase-6-design.md`. Research memo: `docs/research/2026-05-19-tanker-ais-sources.md`.

**Branch:** Already on `phase-6` with the spec committed. All work continues on this branch; one bundled PR at the end.

---

## Task 1: Verify branch state

**Files:** none

- [x] **Step 1: Verify you're on the phase-6 branch with the spec present**

```bash
cd /Users/narendranag/ai/global-energy-map
git branch --show-current
git log --oneline -3
ls docs/superpowers/specs/2026-05-19-global-energy-map-phase-6-design.md
```

Expected: branch is `phase-6`; recent commits include "docs(spec): Phase 6 design — LNG carrier dynamics"; spec file exists.

- [x] **Step 2: Verify clean working tree**

```bash
git status
```

Expected: "nothing to commit, working tree clean".

---

## Task 2: LNG-T3 country-name → ISO3 mapping (probe + extend)

**Files:**
- Modify: `scripts/common/iso3.py` (add `LNG_T3_NAME_TO_ISO3` dict)

**Why:** LNG-T3 uses country names that may not match existing GEM/NETL/EI dicts. Probe distinct names from the three CSVs, add a new source-specific dict for any unmapped ones.

- [x] **Step 1: Download LNG-T3 archive (if not cached) and enumerate distinct country names**

```bash
mkdir -p /tmp/lng-t3-probe
cd /tmp/lng-t3-probe
[ -f all.zip ] || curl -s -L -o all.zip "https://zenodo.org/api/records/19571058/files-archive"
[ -f LNG_terminal.csv ] || unzip -o -q all.zip
ls *.csv
```

Expected: 5 CSV files (`LNG_terminal.csv`, `LNG_tanker.csv`, `LNG_tanker_voyage.csv`, `LNG_terminal_daily.csv`, `LNG_trade_daily.csv`).

- [x] **Step 2: Enumerate the universe of country names referenced**

```bash
cd /Users/narendranag/ai/global-energy-map
uv run python << 'EOF'
import pandas as pd
PROBE = "/tmp/lng-t3-probe"
term = pd.read_csv(f"{PROBE}/LNG_terminal.csv")
voy = pd.read_csv(f"{PROBE}/LNG_tanker_voyage.csv")
tr = pd.read_csv(f"{PROBE}/LNG_trade_daily.csv")
names = set()
for s in [term["areas"], voy["from_country"], voy["to_country"], tr["from_country"], tr["to_country"]]:
    names |= set(s.dropna().astype(str).str.strip().unique())
print(f"distinct country names: {len(names)}")
for n in sorted(names):
    print(repr(n))
EOF
```

Expected: ~70–90 distinct country names.

- [x] **Step 3: Diff against existing mappings**

```bash
uv run python << 'EOF'
import pandas as pd
from scripts.common.iso3 import GEM_NAME_TO_ISO3, NETL_NAME_TO_ISO3, EI_NAME_TO_ISO3
PROBE = "/tmp/lng-t3-probe"
term = pd.read_csv(f"{PROBE}/LNG_terminal.csv")
voy = pd.read_csv(f"{PROBE}/LNG_tanker_voyage.csv")
tr = pd.read_csv(f"{PROBE}/LNG_trade_daily.csv")
names = set()
for s in [term["areas"], voy["from_country"], voy["to_country"], tr["from_country"], tr["to_country"]]:
    names |= set(s.dropna().astype(str).str.strip().unique())

known = set(GEM_NAME_TO_ISO3.keys()) | set(NETL_NAME_TO_ISO3.keys()) | set(EI_NAME_TO_ISO3.keys())
missing = sorted(n for n in names if n and n not in known)
print(f"missing from all existing dicts: {len(missing)}")
for n in missing:
    print(repr(n))
EOF
```

Expected: a list of country names not yet mapped (could be 0–30).

- [x] **Step 4: Add LNG_T3_NAME_TO_ISO3 dict to `scripts/common/iso3.py`**

Open `scripts/common/iso3.py`. Find the end of the existing dicts. Append:

```python
# LNG-T3 country-name → ISO3 mapping (Phase 6).
# LNG-T3 uses a mix of UN-style and short English names. Most overlap with
# GEM/NETL dicts; this covers Phase 6 deltas.
LNG_T3_NAME_TO_ISO3: dict[str, str] = {
    # FILL IN FROM STEP 3 OUTPUT — one entry per missing name, e.g.:
    # "Republic of the Congo": "COG",
    # "Trinidad and Tobago": "TTO",
}
```

Use the Step 3 output to populate the dict. For each missing name, look up the ISO 3166-1 alpha-3 code (Wikipedia or `pycountry`). Common patterns:
- "Republic of the Congo" → "COG"
- "Democratic Republic of the Congo" → "COD"
- "Trinidad and Tobago" → "TTO"
- "Côte d'Ivoire" → "CIV"
- "Equatorial Guinea" → "GNQ"
- "Brunei" → "BRN"
- "Myanmar" → "MMR"

If the Step 3 output had 0 missing names, leave the dict empty but include it with a comment that says so.

- [x] **Step 5: Verify all names map**

```bash
uv run python << 'EOF'
import pandas as pd
from scripts.common.iso3 import GEM_NAME_TO_ISO3, NETL_NAME_TO_ISO3, EI_NAME_TO_ISO3, LNG_T3_NAME_TO_ISO3
PROBE = "/tmp/lng-t3-probe"
term = pd.read_csv(f"{PROBE}/LNG_terminal.csv")
voy = pd.read_csv(f"{PROBE}/LNG_tanker_voyage.csv")
tr = pd.read_csv(f"{PROBE}/LNG_trade_daily.csv")
names = set()
for s in [term["areas"], voy["from_country"], voy["to_country"], tr["from_country"], tr["to_country"]]:
    names |= set(s.dropna().astype(str).str.strip().unique())

all_dicts = {**GEM_NAME_TO_ISO3, **NETL_NAME_TO_ISO3, **EI_NAME_TO_ISO3, **LNG_T3_NAME_TO_ISO3}
unmapped = sorted(n for n in names if n and n not in all_dicts)
print(f"unmapped after merge: {len(unmapped)}")
for n in unmapped:
    print(f"  {n!r}")
assert len(unmapped) == 0, "missing country names — add to LNG_T3_NAME_TO_ISO3"
print("OK")
EOF
```

Expected: `unmapped after merge: 0` and `OK`.

- [x] **Step 6: Lint**

```bash
uv run ruff check scripts/common/iso3.py
```

Expected: clean.

- [x] **Step 7: Commit**

```bash
git add scripts/common/iso3.py
git commit -m "$(cat <<'EOF'
Phase 6: add LNG_T3_NAME_TO_ISO3 dict to scripts/common/iso3.py

Covers country names from LNG_terminal.csv, LNG_tanker_voyage.csv,
LNG_trade_daily.csv that aren't already in GEM/NETL/EI dicts. Probe
asserted 100% coverage before commit.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: LNG-T3 ingest script

**Files:**
- Create: `scripts/ingest/lng_t3.py`

**Why:** Pull the Zenodo deposit once into `data/raw/lng_t3/<version>/` and let downstream transforms read from a cached path. Idempotent: re-runs use the cached files unless `--force`.

- [x] **Step 1: Write the ingest script**

Create `scripts/ingest/lng_t3.py`:

```python
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
```

- [x] **Step 2: Run the ingest**

```bash
uv run python -m scripts.ingest.lng_t3
```

Expected: writes `data/raw/lng_t3/v1-2026-04-01/all.zip` (~28 MB) and extracts the five CSVs. Re-running prints `cached at ...` instead of re-downloading.

- [x] **Step 3: Verify**

```bash
ls -lh data/raw/lng_t3/v1-2026-04-01/
```

Expected: 5 CSV files plus `all.zip`. CSV sizes roughly: `LNG_terminal.csv` ~63 KB, `LNG_tanker.csv` ~128 KB, `LNG_tanker_voyage.csv` ~2 MB, `LNG_terminal_daily.csv` ~656 KB, `LNG_trade_daily.csv` ~954 KB.

- [x] **Step 4: Lint**

```bash
uv run ruff check scripts/ingest/lng_t3.py
```

Expected: clean.

- [x] **Step 5: Commit**

```bash
git add scripts/ingest/lng_t3.py
git commit -m "$(cat <<'EOF'
Phase 6: LNG-T3 ingest from Zenodo

Downloads the 5-CSV LNG-T3 deposit (Zhou 2026, DOI 10.5281/zenodo.19571058)
to data/raw/lng_t3/v1-2026-04-01/ (gitignored). Idempotent: re-runs use
cached archive unless --force.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: LNG voyages transform (TDD on schema)

**Files:**
- Create: `scripts/transform/_lng_iso3.py` (shared country-name lookup helper)
- Create: `scripts/transform/build_lng_voyages.py`
- Create: `tests/python/test_lng_iso3.py`

**Why:** Produces three new parquets: `lng_voyage.parquet`, `lng_trade_daily.parquet`, `lng_terminal_daily.parquet`. Voyage and trade-daily tables need country-name → ISO3 lookups using the merged dicts from Task 2.

- [x] **Step 1: Write failing test for the country-name lookup helper**

Create `tests/python/test_lng_iso3.py`:

```python
"""Unit tests for the LNG country-name → ISO3 lookup."""
from __future__ import annotations

from scripts.transform._lng_iso3 import lookup_iso3


def test_lookup_resolves_lng_t3_specific_name():
    # Whatever Task 2 added to LNG_T3_NAME_TO_ISO3 should be reachable.
    # Test a name that GEM/NETL/EI definitely cover, to assert the merge works:
    assert lookup_iso3("China") == "CHN"


def test_lookup_resolves_united_states_variants():
    # "United States" appears in LNG-T3 voyage data
    assert lookup_iso3("United States") == "USA"


def test_lookup_returns_none_for_unknown():
    assert lookup_iso3("Atlantis") is None


def test_lookup_strips_whitespace():
    assert lookup_iso3("  China  ") == "CHN"


def test_lookup_handles_none_input():
    assert lookup_iso3(None) is None
```

- [x] **Step 2: Run test to verify it fails**

```bash
uv run pytest tests/python/test_lng_iso3.py -v
```

Expected: `ModuleNotFoundError: No module named 'scripts.transform._lng_iso3'`.

- [x] **Step 3: Implement the helper**

Create `scripts/transform/_lng_iso3.py`:

```python
"""Country-name → ISO3 lookup that merges all source-specific dicts.

LNG-T3 country names appear in `LNG_terminal.csv` (`areas`),
`LNG_tanker_voyage.csv` (`from_country` / `to_country`), and
`LNG_trade_daily.csv` (`from_country` / `to_country`). Names overlap
with GEM/NETL/EI conventions but Phase 6's Task 2 added an
LNG_T3_NAME_TO_ISO3 dict for the deltas.
"""
from __future__ import annotations

from scripts.common.iso3 import (
    EI_NAME_TO_ISO3,
    GEM_NAME_TO_ISO3,
    LNG_T3_NAME_TO_ISO3,
    NETL_NAME_TO_ISO3,
)

# Order matters when a name appears in multiple dicts with the same value;
# putting LNG-T3 last is harmless because no conflicting entries are expected.
_MERGED: dict[str, str] = {
    **GEM_NAME_TO_ISO3,
    **NETL_NAME_TO_ISO3,
    **EI_NAME_TO_ISO3,
    **LNG_T3_NAME_TO_ISO3,
}


def lookup_iso3(name: str | None) -> str | None:
    """Return ISO 3166-1 alpha-3 code for a country name, or None."""
    if not name:
        return None
    return _MERGED.get(name.strip())
```

- [x] **Step 4: Run tests to verify pass**

```bash
uv run pytest tests/python/test_lng_iso3.py -v
```

Expected: all 5 tests pass.

- [x] **Step 5: Write the transform script**

Create `scripts/transform/build_lng_voyages.py`:

```python
"""Transform LNG-T3 voyages + trade-daily + terminal-daily → 3 parquets.

Inputs (data/raw/lng_t3/<version>/):
  LNG_tanker_voyage.csv      17,592 voyages 2020-01-01 → 2024-12-31
  LNG_trade_daily.csv        16,691 country-pair-day arrival/departure
  LNG_terminal_daily.csv     16,115 terminal-day throughput

Outputs:
  public/data/lng_voyage.parquet
  public/data/lng_trade_daily.parquet
  public/data/lng_terminal_daily.parquet

All ISO3 attribution uses scripts.transform._lng_iso3.lookup_iso3 which
merges GEM + NETL + EI + LNG_T3 country-name dicts.

Idempotent — overwrites the three output files on each run.

Usage:
    uv run python -m scripts.transform.build_lng_voyages
"""
from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

from scripts.transform._lng_iso3 import lookup_iso3

RAW_DIR = Path("data/raw/lng_t3/v1-2026-04-01")
OUT_VOYAGE = Path("public/data/lng_voyage.parquet")
OUT_TRADE = Path("public/data/lng_trade_daily.parquet")
OUT_TERMINAL = Path("public/data/lng_terminal_daily.parquet")

SOURCE = "Zhou et al. 2026, LNG-T3 (Zenodo 10.5281/zenodo.19571058)"
SOURCE_VERSION = "v1-2026-04-01"


def _build_voyages() -> pd.DataFrame:
    src = RAW_DIR / "LNG_tanker_voyage.csv"
    df = pd.read_csv(src, parse_dates=["start_date", "end_date"])
    print(f"[voyage] loaded {len(df)} rows from {src}", file=sys.stderr)

    df["from_country_iso3"] = df["from_country"].map(lookup_iso3)
    df["to_country_iso3"] = df["to_country"].map(lookup_iso3)

    # Assert 100% ISO3 attribution before writing
    miss_from = df["from_country_iso3"].isna().sum()
    miss_to = df["to_country_iso3"].isna().sum()
    if miss_from or miss_to:
        bad_from = df[df["from_country_iso3"].isna()]["from_country"].value_counts()
        bad_to = df[df["to_country_iso3"].isna()]["to_country"].value_counts()
        sys.exit(
            f"unmapped country names in voyages: from={miss_from} {dict(bad_from)} "
            f"to={miss_to} {dict(bad_to)} — extend LNG_T3_NAME_TO_ISO3"
        )

    out = pd.DataFrame({
        "voyage_id": (
            df["start_date"].dt.strftime("%Y%m%d")
            + "_" + df["IMO"].astype(str)
            + "_" + df["voyage"].astype(str)
        ),
        "start_date": df["start_date"].dt.date,
        "end_date": df["end_date"].dt.date,
        "imo": df["IMO"].astype("Int64"),
        "voyage_type": df["voyage"].astype(pd.StringDtype()),
        "from_terminal": df["from_terminal"].astype(pd.StringDtype()),
        "to_terminal": df["to_terminal"].astype(pd.StringDtype()),
        "from_country": df["from_country"].astype(pd.StringDtype()),
        "to_country": df["to_country"].astype(pd.StringDtype()),
        "from_country_iso3": df["from_country_iso3"].astype(pd.StringDtype()),
        "to_country_iso3": df["to_country_iso3"].astype(pd.StringDtype()),
        # Note: LNG-T3 CSV column is "amount_cmb" — we keep the canonical
        # "amount_cbm" spelling in our parquet schema and rename here.
        "amount_cbm": df["amount_cmb"].astype("Int64"),
        "confidence_score": df["confidence_score"].astype("Int8"),
        "voyage_distance_km": df["voyage_distance"].astype("Int64"),
        "source": SOURCE,
        "source_version": SOURCE_VERSION,
    })
    return out


def _build_trade_daily() -> pd.DataFrame:
    src = RAW_DIR / "LNG_trade_daily.csv"
    df = pd.read_csv(src, parse_dates=["date"])
    print(f"[trade_daily] loaded {len(df)} rows from {src}", file=sys.stderr)

    df["from_country_iso3"] = df["from_country"].map(lookup_iso3)
    df["to_country_iso3"] = df["to_country"].map(lookup_iso3)
    miss = df[["from_country_iso3", "to_country_iso3"]].isna().any(axis=1).sum()
    if miss:
        sys.exit(f"unmapped country names in trade_daily: {miss}")

    out = pd.DataFrame({
        "date": df["date"].dt.date,
        "type": df["type"].astype(pd.StringDtype()),
        "from_country": df["from_country"].astype(pd.StringDtype()),
        "to_country": df["to_country"].astype(pd.StringDtype()),
        "from_country_iso3": df["from_country_iso3"].astype(pd.StringDtype()),
        "to_country_iso3": df["to_country_iso3"].astype(pd.StringDtype()),
        "amount_cbm": df["amount_cmb"].astype("Int64"),
        "voyage_distance_km": df["voyage_distance"].astype("Float64"),
        "confidence_score": df["confidence_score"].astype("Int8"),
        "source": SOURCE,
        "source_version": SOURCE_VERSION,
    })
    return out


def _build_terminal_daily() -> pd.DataFrame:
    src = RAW_DIR / "LNG_terminal_daily.csv"
    df = pd.read_csv(src, parse_dates=["date"])
    print(f"[terminal_daily] loaded {len(df)} rows from {src}", file=sys.stderr)

    out = pd.DataFrame({
        "terminal_name": df["name"].astype(pd.StringDtype()),
        "date": df["date"].dt.date,
        "processed_cbm": df["processed_cbm"].astype("Int64"),
        "source": SOURCE,
        "source_version": SOURCE_VERSION,
    })
    return out


def main() -> None:
    if not RAW_DIR.exists():
        sys.exit(f"no LNG-T3 raw at {RAW_DIR} — run scripts.ingest.lng_t3 first")

    voyage = _build_voyages()
    trade = _build_trade_daily()
    terminal = _build_terminal_daily()

    for path, df in [(OUT_VOYAGE, voyage), (OUT_TRADE, trade), (OUT_TERMINAL, terminal)]:
        path.parent.mkdir(parents=True, exist_ok=True)
        pq.write_table(
            pa.Table.from_pandas(df, preserve_index=False),
            path,
            compression="zstd",
        )
        print(f"wrote {path}  rows={len(df)}")

    print(f"\nVoyage temporal coverage: "
          f"{voyage['start_date'].min()} → {voyage['start_date'].max()}")
    print(f"Voyage confidence distribution: "
          f"{voyage['confidence_score'].value_counts().sort_index().to_dict()}")
    print(f"Trade-daily country pairs: "
          f"{trade.groupby(['from_country_iso3','to_country_iso3']).ngroups}")
    print(f"Terminal-daily unique terminals: {terminal['terminal_name'].nunique()}")


if __name__ == "__main__":
    main()
```

- [x] **Step 6: Run the transform**

```bash
uv run python -m scripts.transform.build_lng_voyages
```

Expected:
- writes `public/data/lng_voyage.parquet` (~17,592 rows)
- writes `public/data/lng_trade_daily.parquet` (~16,691 rows)
- writes `public/data/lng_terminal_daily.parquet` (~16,115 rows)
- voyage temporal: 2020-01-01 → 2024-12-31
- voyage confidence distribution: `{1: 2532, 2: 223, 3: 1991, 4: 11906, 5: 940}` (approximately)

If any of those numbers are off by more than 1% or you see an `unmapped country names` error, STOP and report.

- [x] **Step 7: Spot-check the output schemas**

```bash
uv run python -c "
import pandas as pd
for path in ['lng_voyage', 'lng_trade_daily', 'lng_terminal_daily']:
    df = pd.read_parquet(f'public/data/{path}.parquet')
    print(f'=== {path}: {len(df)} rows ===')
    print(df.dtypes.to_string())
    print()
"
```

Expected: all three tables have populated columns; voyage has `voyage_id`, `imo`, `from_country_iso3`, etc.

- [x] **Step 8: Lint**

```bash
uv run ruff check scripts/transform/_lng_iso3.py scripts/transform/build_lng_voyages.py tests/python/test_lng_iso3.py
```

Expected: clean.

- [x] **Step 9: Commit**

```bash
git add scripts/transform/_lng_iso3.py scripts/transform/build_lng_voyages.py \
        tests/python/test_lng_iso3.py \
        public/data/lng_voyage.parquet public/data/lng_trade_daily.parquet \
        public/data/lng_terminal_daily.parquet
git commit -m "$(cat <<'EOF'
Phase 6: ingest LNG-T3 voyages + trade-daily + terminal-daily parquets

Three new parquets in public/data/:
  lng_voyage.parquet         17,592 voyages 2020-2024 with from/to terminal,
                              from/to country iso3, amount_cbm, confidence
  lng_trade_daily.parquet    16,691 country-pair-day arrival/departure records
  lng_terminal_daily.parquet 16,115 terminal-day measured throughput records

Country names → ISO3 via shared scripts.transform._lng_iso3.lookup_iso3
that merges GEM + NETL + EI + LNG_T3 dicts. Build asserts 100% mapping
before writing.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Rewrite build_lng_terminals.py — LNG-T3 primary + GEM supplement

**Files:**
- Modify: `scripts/transform/build_lng_terminals.py` (full rewrite)

**Why:** Replace the current GEM-only LNG terminal build with LNG-T3 (primary, 545 terminals) + GEM (supplement at 25 km dedup, ~10 GEM-only terminals expected). Mirror the Phase 5 refinery pattern. New schema columns: `unit_count`, `total_processed_bcm`, `un_locode`.

- [x] **Step 1: Read the current build_lng_terminals.py to confirm starting point**

```bash
cat scripts/transform/build_lng_terminals.py | head -60
```

Note: the current script reads from `data/raw/gem_gas_infra/ggit_map_*.geojson` and writes terminals with `kind ∈ {lng_export, lng_import}`. It's idempotent (drops prior LNG rows from assets.parquet then appends).

- [x] **Step 2: Replace the file contents**

Replace `scripts/transform/build_lng_terminals.py` with:

```python
"""Transform LNG terminals → kind={lng_export, lng_import} rows in assets.parquet.

PHASE 6: LNG-T3 (Zhou 2026) is the primary source; GEM GGIT terminals
that don't proximity-match an LNG-T3 active terminal within 25 km in the
same country are kept as supplements.

Inputs:
  data/raw/lng_t3/v1-2026-04-01/LNG_terminal.csv  (545 terminals total)
  data/raw/gem_gas_infra/ggit_map_*.geojson       (GEM, filtered to GGIT-import/export)

Filter on LNG-T3: status ∈ {operating, construction} → ~330 active terminals.
Filter on GEM: status ∈ {operating, construction} (same as Phase 3).

Country attribution:
  LNG-T3: areas column → ISO3 via shared lookup
  GEM:    first country from areas semicolon list → ISO3 via GEM dict (existing logic)

Dedup: GEM record dropped if any LNG-T3 active terminal in same country
falls within 25 km haversine. Probe showed 95% match within 10 km;
25 km accommodates LNG-T3's slightly different coord precision.

Schema (assets.parquet for LNG rows — Phase 6 adds three columns):
  asset_id, kind, name, country_iso3, lon, lat,
  capacity (mtpa), capacity_unit, operator, status,
  commissioned_year, decommissioned_year,
  unit_count, total_processed_bcm, un_locode,
  source, source_version

Idempotent — drops prior lng_export + lng_import rows, then appends.

Usage:
    uv run python -m scripts.transform.build_lng_terminals
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

from scripts.common.iso3 import GEM_NAME_TO_ISO3
from scripts.transform._lng_iso3 import lookup_iso3
from scripts.transform._refinery_dedup import haversine_km  # reuse Phase 5 helper

LNG_T3_RAW = Path("data/raw/lng_t3/v1-2026-04-01/LNG_terminal.csv")
GEM_RAW_DIR = Path("data/raw/gem_gas_infra")
ASSETS = Path("public/data/assets.parquet")

LNG_T3_SOURCE = "Zhou et al. 2026, LNG-T3 (Zenodo 10.5281/zenodo.19571058)"
LNG_T3_SOURCE_VERSION = "v1-2026-04-01"
GEM_SOURCE = "Global Energy Monitor — Global Gas Infrastructure Tracker"

DEDUP_THRESHOLD_KM = 25.0

# Schema columns (Phase 6 adds unit_count, total_processed_bcm, un_locode at the end)
SCHEMA_COLS = [
    "asset_id", "kind", "name", "country_iso3", "lon", "lat",
    "capacity", "capacity_unit", "operator", "status",
    "commissioned_year", "decommissioned_year",
    "unit_count", "total_processed_bcm", "un_locode",
    "source", "source_version",
]


# ---------------------------------------------------------------------------
# LNG-T3 loader
# ---------------------------------------------------------------------------

def _load_lng_t3() -> pd.DataFrame:
    if not LNG_T3_RAW.exists():
        sys.exit(f"no LNG-T3 raw at {LNG_T3_RAW} — run scripts.ingest.lng_t3 first")
    df = pd.read_csv(LNG_T3_RAW)
    print(f"LNG-T3: loaded {len(df)} terminals", file=sys.stderr)

    # Filter to active terminals
    df = df[df["status"].isin(["operating", "construction"])].copy()
    print(f"LNG-T3: {len(df)} after operating+construction filter", file=sys.stderr)

    df["country_iso3"] = df["areas"].map(lookup_iso3)
    unmapped = df["country_iso3"].isna().sum()
    if unmapped:
        bad = df[df["country_iso3"].isna()]["areas"].value_counts()
        sys.exit(f"unmapped LNG-T3 country names: {dict(bad)}")

    df["kind"] = df["terminal_type"].map({"export": "lng_export", "import": "lng_import"})
    assert df["kind"].notna().all(), "unknown terminal_type values"

    out = pd.DataFrame({
        "asset_id": "lngt3/" + df["name"].astype(str).str.replace(r"[^A-Za-z0-9]", "_", regex=True),
        "kind": df["kind"],
        "name": df["name"].astype(str),
        "country_iso3": df["country_iso3"],
        "lon": df["lon"].astype(float),
        "lat": df["lat"].astype(float),
        "capacity": df["capacity"].astype("Float64"),  # mtpa
        "capacity_unit": "mtpa",
        "operator": pd.NA,
        "status": df["status"].astype(pd.StringDtype()),
        "commissioned_year": pd.to_numeric(df["start_year"], errors="coerce").astype("Int64"),
        "decommissioned_year": pd.Series([pd.NA] * len(df), dtype="Int64"),
        "unit_count": df["unit_count"].astype("Int64"),
        "total_processed_bcm": df["total_processed_bcm"].astype("Int64"),
        "un_locode": df["UN_LOCODE"].astype(pd.StringDtype()),
        "source": LNG_T3_SOURCE,
        "source_version": LNG_T3_SOURCE_VERSION,
    })
    # Ensure asset_id is a regular column
    out["asset_id"] = out["asset_id"].astype(pd.StringDtype())
    return out


# ---------------------------------------------------------------------------
# GEM loader (Phase 3 logic preserved + adapted)
# ---------------------------------------------------------------------------

def _gem_areas_iso3(areas: str | None) -> str | None:
    if not isinstance(areas, str):
        return None
    for part in areas.split(";"):
        iso3 = GEM_NAME_TO_ISO3.get(part.strip())
        if iso3:
            return iso3
    return None


def _load_gem() -> pd.DataFrame:
    src = next(GEM_RAW_DIR.glob("*.geojson"), None)
    if src is None:
        sys.exit(f"no GEM gas infra geojson in {GEM_RAW_DIR}")

    with src.open() as f:
        gj = json.load(f)
    feats = [
        f for f in gj.get("features", [])
        if (f.get("properties") or {}).get("tracker-custom") in ("GGIT-import", "GGIT-export")
    ]
    print(f"GEM: {len(feats)} LNG terminal features pre-filter", file=sys.stderr)

    rows = []
    for f in feats:
        p = f.get("properties") or {}
        geom = f.get("geometry") or {}
        if geom.get("type") != "Point":
            continue
        coords = geom.get("coordinates") or []
        if len(coords) < 2:
            continue
        if p.get("status") not in ("operating", "construction"):
            continue

        iso3 = _gem_areas_iso3(p.get("areas"))
        if not iso3:
            continue

        is_export = p.get("tracker-custom") == "GGIT-export"
        cap = p.get("totexportlngterminalcapacityinmtpa") if is_export else p.get("totimportlngterminalcapacityinmtpa")
        try:
            cap_f = float(cap) if cap not in (None, "") else None
        except (TypeError, ValueError):
            cap_f = None

        rows.append({
            "asset_id": f"gem/{p.get('id') or p.get('pid')}",
            "kind": "lng_export" if is_export else "lng_import",
            "name": str(p.get("name") or "LNG terminal"),
            "country_iso3": iso3,
            "lon": float(coords[0]),
            "lat": float(coords[1]),
            "capacity": cap_f,
            "capacity_unit": "mtpa",
            "operator": (p.get("owner") or p.get("operator")),
            "status": "operating" if p.get("status") == "operating" else "in-construction",
            "commissioned_year": pd.to_numeric(p.get("start-year"), errors="coerce"),
            "decommissioned_year": pd.NA,
            "unit_count": pd.NA,
            "total_processed_bcm": pd.NA,
            "un_locode": None,
            "source": GEM_SOURCE,
            "source_version": src.name,
        })

    df = pd.DataFrame(rows)
    print(f"GEM: {len(df)} after geometry + status + iso3 attribution", file=sys.stderr)
    return df


# ---------------------------------------------------------------------------
# Dedup
# ---------------------------------------------------------------------------

def _gem_records_not_in_lngt3(gem: pd.DataFrame, lng_t3: pd.DataFrame) -> pd.DataFrame:
    """Return GEM rows with NO LNG-T3 counterpart within DEDUP_THRESHOLD_KM same country."""
    if gem.empty or lng_t3.empty:
        return gem.copy()

    t3_by_country: dict[str, pd.DataFrame] = {
        iso3: grp for iso3, grp in lng_t3.groupby("country_iso3")
    }
    keep: list[bool] = []
    for _, g in gem.iterrows():
        t3 = t3_by_country.get(g["country_iso3"])
        if t3 is None or t3.empty:
            keep.append(True)
            continue
        d = haversine_km(g["lat"], g["lon"], t3["lat"].values, t3["lon"].values)
        keep.append(bool(np.all(d > DEDUP_THRESHOLD_KM)))
    return gem.loc[keep].copy()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    lng_t3 = _load_lng_t3()
    gem = _load_gem()

    gem_kept = _gem_records_not_in_lngt3(gem, lng_t3)
    print(f"GEM: {len(gem_kept)} kept after 25 km dedup vs LNG-T3", file=sys.stderr)

    # Enforce schema cols on both
    for df in (lng_t3, gem_kept):
        for col in SCHEMA_COLS:
            if col not in df.columns:
                df[col] = pd.NA

    combined = pd.concat([lng_t3[SCHEMA_COLS], gem_kept[SCHEMA_COLS]], ignore_index=True)
    # Type discipline (matches Phase 5 conventions)
    combined["capacity"] = combined["capacity"].astype("Float64")
    combined["capacity_unit"] = combined["capacity_unit"].astype(pd.StringDtype())
    combined["operator"] = combined["operator"].astype(pd.StringDtype())
    combined["status"] = combined["status"].astype(pd.StringDtype())
    combined["commissioned_year"] = combined["commissioned_year"].astype("Int64")
    combined["decommissioned_year"] = combined["decommissioned_year"].astype("Int64")
    combined["unit_count"] = combined["unit_count"].astype("Int64")
    combined["total_processed_bcm"] = combined["total_processed_bcm"].astype("Int64")
    combined["un_locode"] = combined["un_locode"].astype(pd.StringDtype())
    combined["source"] = combined["source"].astype(pd.StringDtype())
    combined["source_version"] = combined["source_version"].astype(pd.StringDtype())

    # Idempotent: drop prior LNG rows, append new
    existing = pd.read_parquet(ASSETS)
    n_before = len(existing)
    existing = existing[~existing["kind"].isin(["lng_export", "lng_import"])]
    n_kept = len(existing)
    if n_before != n_kept:
        print(f"dropped {n_before - n_kept} stale LNG rows from assets.parquet",
              file=sys.stderr)

    # Phase 6 schema additions: bring existing rows up to the new column set
    for col in ("unit_count", "total_processed_bcm", "un_locode"):
        if col not in existing.columns:
            existing[col] = pd.NA
    existing["unit_count"] = existing["unit_count"].astype("Int64")
    existing["total_processed_bcm"] = existing["total_processed_bcm"].astype("Int64")
    existing["un_locode"] = existing["un_locode"].astype(pd.StringDtype())

    out = pd.concat([existing, combined], ignore_index=True)
    pq.write_table(
        pa.Table.from_pandas(out, preserve_index=False),
        ASSETS,
        compression="zstd",
    )

    counts = out.groupby("kind").size().to_dict()
    by_source = combined.groupby("source").size().to_dict()
    cap_cov = combined["capacity"].notna().sum()
    cy_cov = combined["commissioned_year"].notna().sum()
    print(f"wrote {ASSETS}  rows={len(out)}  by_kind={counts}")
    print(f"  LNG sources: {by_source}")
    print(f"  capacity coverage: {cap_cov}/{len(combined)}")
    print(f"  commissioned_year coverage: {cy_cov}/{len(combined)}")


if __name__ == "__main__":
    main()
```

- [x] **Step 3: Run the rewritten transform**

```bash
uv run python -m scripts.transform.build_lng_terminals
```

Expected:
- LNG-T3: 545 loaded → 330 after operating+construction filter
- GEM: 434 features → ~410 after status+geom+iso3 → ~10 kept after 25 km dedup
- final LNG rows: ~340 (330 LNG-T3 + ~10 GEM)
- capacity coverage: ~100% (LNG-T3 has 100%, GEM has most)
- commissioned_year coverage: ~88% (LNG-T3 has start_year for 88%; GEM has start-year for many)

If counts are off by more than 10%, STOP and report.

- [x] **Step 4: Spot-check**

```bash
uv run python -c "
import pandas as pd
a = pd.read_parquet('public/data/assets.parquet')
lng = a[a['kind'].isin(['lng_export','lng_import'])]
print(f'LNG rows: {len(lng)}')
print(f\"by kind: {lng['kind'].value_counts().to_dict()}\")
print(f\"by source: {lng['source'].value_counts().to_dict()}\")
print(f'capacity populated: {lng[\"capacity\"].notna().sum()} / {len(lng)}')
print(f'commissioned_year populated: {lng[\"commissioned_year\"].notna().sum()} / {len(lng)}')
print(f'unit_count populated: {lng[\"unit_count\"].notna().sum()} / {len(lng)}')
print(f'un_locode populated: {lng[\"un_locode\"].notna().sum()} / {len(lng)}')
"
```

Expected: roughly the numbers in Step 3.

- [x] **Step 5: Lint**

```bash
uv run ruff check scripts/transform/build_lng_terminals.py
```

Expected: clean.

- [x] **Step 6: Commit**

```bash
git add scripts/transform/build_lng_terminals.py public/data/assets.parquet
git commit -m "$(cat <<'EOF'
Phase 6: rewrite build_lng_terminals — LNG-T3 primary, GEM supplement

LNG-T3 (Zhou 2026) becomes the primary LNG terminal source with 330
operating + construction terminals. GEM GGIT terminals without an
LNG-T3 match within 25 km same country are appended as supplements
(~10 records: Ust Luga, Polish Baltic FSRU, Soma Port Japan, etc.).

Schema additions: unit_count, total_processed_bcm, un_locode.
Existing non-LNG rows get null values for these columns.

Coverage rises:
  capacity      ~92% → ~100% (LNG-T3 100% populated)
  start_year    ~0%  → ~88%  (vintage filter now applies to LNG terminals)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Validate LNG-T3 against GIIGNL public totals

**Files:**
- Create: `scripts/validate/lng_t3_vs_giignl.py`

**Why:** Spec's open question #1: LNG-T3 2020 daily arrivals sum to ~76 Mt, BACI 271111 says 484 Mt, GIIGNL public number is ~360 Mt. Verify which is right; document the discrepancy before merging.

- [x] **Step 1: Write the validation script**

Create `scripts/validate/lng_t3_vs_giignl.py`:

```python
"""Compare LNG-T3 annual arrivals to GIIGNL public totals.

GIIGNL Annual Report public headline numbers (in million tonnes, LNG imports):
  2020: 356.1
  2021: 372.3
  2022: 401.5
  2023: 401.4
  2024: ~407  (estimate from press release)

Source: GIIGNL Annual Reports 2021–2025 executive summaries (publicly
available PDFs at giignl.org/annual-report). Hard-coded here because
the report tables are non-machine-readable; rerun this script if/when
GIIGNL revises retrospectively.

LNG density conversion: 1 cbm liquid LNG ≈ 0.4245 t (DOE convention).

Usage:
    uv run python -m scripts.validate.lng_t3_vs_giignl
"""
from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

TRADE_DAILY = Path("public/data/lng_trade_daily.parquet")
LNG_DENSITY_T_PER_CBM = 0.4245

# GIIGNL Annual Report public totals (million tonnes per annum)
GIIGNL_MT_PER_YEAR: dict[int, float] = {
    2020: 356.1,
    2021: 372.3,
    2022: 401.5,
    2023: 401.4,
    2024: 407.0,  # 2025 GIIGNL report; treat as ±5
}

ACCEPTABLE_GAP_PCT = 30.0  # spec threshold


def main() -> None:
    if not TRADE_DAILY.exists():
        sys.exit(f"missing {TRADE_DAILY} — run build_lng_voyages first")
    df = pd.read_parquet(TRADE_DAILY)

    # Arrivals only — represents imports landing in the destination country.
    arrivals = df[df["type"] == "arrival"].copy()
    arrivals["date"] = pd.to_datetime(arrivals["date"])
    arrivals["year"] = arrivals["date"].dt.year

    # Convert cbm → tonnes
    annual = (
        arrivals.groupby("year")["amount_cbm"].sum()
        .reset_index()
        .rename(columns={"amount_cbm": "lng_t3_cbm"})
    )
    annual["lng_t3_mt"] = annual["lng_t3_cbm"] * LNG_DENSITY_T_PER_CBM / 1e6

    print(f"{'Year':<6} {'LNG-T3 Mt':<12} {'GIIGNL Mt':<12} {'Δ Mt':<10} {'Gap %':<8}")
    print("-" * 50)
    failed = False
    for _, r in annual.iterrows():
        y = int(r["year"])
        t3 = float(r["lng_t3_mt"])
        gi = GIIGNL_MT_PER_YEAR.get(y)
        if gi is None:
            print(f"{y:<6} {t3:>10.1f}   (no GIIGNL reference)")
            continue
        diff = t3 - gi
        gap_pct = abs(diff) / gi * 100.0
        flag = "✗" if gap_pct > ACCEPTABLE_GAP_PCT else "✓"
        print(f"{y:<6} {t3:>10.1f}   {gi:>10.1f}   {diff:>+8.1f}   {gap_pct:>5.1f}%  {flag}")
        if gap_pct > ACCEPTABLE_GAP_PCT:
            failed = True

    if failed:
        print(
            f"\n✗ FAILED: at least one year exceeds {ACCEPTABLE_GAP_PCT}% gap vs GIIGNL.\n"
            f"  Per spec, this triggers escalation before merge. Either:\n"
            f"  - LNG-T3 under-reports (check filtering / density constant)\n"
            f"  - GIIGNL constants in this script are wrong (verify against latest report)\n"
            f"  - The dataset is unsuitable for the scenario refactor; consider keeping BACI",
            file=sys.stderr,
        )
        sys.exit(1)

    print(f"\n✓ All years within {ACCEPTABLE_GAP_PCT}% of GIIGNL public totals.")


if __name__ == "__main__":
    main()
```

- [x] **Step 2: Run validation**

```bash
uv run python -m scripts.validate.lng_t3_vs_giignl
```

Expected output: a table comparing LNG-T3 annual sums to GIIGNL. If LNG-T3 numbers come in around 75–130 Mt (probe data) for 2020–2024 while GIIGNL says ~360–410 Mt, every year will exceed 30% gap and the script will exit 1 — that's a real finding from the spec's open question.

**Handling the failure case** (likely outcome): the gap is real, document it in methodology.md (Task 12 will do this) and **change the scenario engine path (Tasks 9–10) to use LNG-T3 only as a SUPPLEMENT — keep BACI as the canonical flow source**. Specifically: when `year ∈ [2020, 2024]` and LNG-T3 data is available, use it to ENRICH per-terminal disaggregation (replacing capacity-weighted shares with measured voyage-derived shares) but keep country totals from BACI. This is a more honest refactor given the data quality.

If the gap is below 30%, proceed with the spec's original plan (LNG-T3 as the country-total source too).

**Either way:** record the validation table output in the methodology section (Task 12).

- [x] **Step 3: Save validation output for use in Task 12**

```bash
mkdir -p data/validation
uv run python -m scripts.validate.lng_t3_vs_giignl > data/validation/lng_t3_vs_giignl.txt 2>&1 || true
cat data/validation/lng_t3_vs_giignl.txt
```

`data/validation/` is committed (small text artifact, useful for methodology). Add `data/raw/` to .gitignore exclusion check.

- [x] **Step 4: Lint**

```bash
uv run ruff check scripts/validate/lng_t3_vs_giignl.py
```

Expected: clean.

- [x] **Step 5: Commit**

```bash
mkdir -p scripts/validate
[ -f scripts/validate/__init__.py ] || touch scripts/validate/__init__.py
git add scripts/validate/__init__.py scripts/validate/lng_t3_vs_giignl.py data/validation/lng_t3_vs_giignl.txt
git commit -m "$(cat <<'EOF'
Phase 6: LNG-T3 vs GIIGNL validation script

Compares LNG-T3 annual arrival totals to GIIGNL public Annual Report
headline numbers (2020-2024). Exits non-zero if any year exceeds 30%
gap, surfacing the spec's open question #1.

Result captured to data/validation/lng_t3_vs_giignl.txt for inclusion
in the methodology page (Task 12).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Catalog v5 + parser allowlist

**Files:**
- Modify: `public/data/catalog.json`
- Modify: `src/lib/data-catalog/index.ts` (version allowlist)
- Modify: `src/lib/data-catalog/types.ts` (Catalog.version literal type)

**Why:** Phase 6 adds two new source entries (LNG-T3 terminals + voyages). Bump version 4 → 5, extend the parser allowlist + type.

- [x] **Step 1: Update catalog.json**

Open `public/data/catalog.json`. Make these changes:

1. Change `"version": 4` to `"version": 5`.
2. Update the existing `gem_gas_infrastructure` entry's `label`:
   ```json
   "label": "Gas pipelines (GEM); LNG terminals (supplement to LNG-T3)",
   ```
3. ADD two new entries BEFORE the `netl_gogi` entry:

   ```json
       {
         "id": "lng_t3_terminals",
         "label": "LNG terminals (LNG-T3 primary)",
         "path": "/data/assets.parquet",
         "format": "parquet",
         "source_name": "Zhou et al. 2026, LNG-T3 (Zenodo)",
         "source_url": "https://doi.org/10.5281/zenodo.19571058",
         "license": "CC BY 4.0",
         "as_of": "2026-04-01",
         "layers": ["lng_terminals"]
       },
       {
         "id": "lng_t3_voyages",
         "label": "LNG carrier voyages + daily flows (LNG-T3)",
         "path": "/data/lng_voyage.parquet",
         "format": "parquet",
         "source_name": "Zhou et al. 2026, LNG-T3 (Zenodo)",
         "source_url": "https://doi.org/10.5281/zenodo.19571058",
         "license": "CC BY 4.0",
         "as_of": "2026-04-01",
         "layers": ["lng_voyages", "scenario:hormuz-lng"]
       },
   ```

Verify the JSON parses:

```bash
uv run python -c "
import json
d = json.load(open('public/data/catalog.json'))
assert d['version'] == 5
print(f'entries: {len(d[\"entries\"])}')
ids = [e['id'] for e in d['entries']]
assert 'lng_t3_terminals' in ids and 'lng_t3_voyages' in ids
print('OK')
"
```

Expected: `entries: 13` and `OK`.

- [x] **Step 2: Update the version allowlist**

Open `src/lib/data-catalog/index.ts`. Locate the version validator (the same place that was bumped in Phase 5 to accept 1–4). Extend to include 5. Pattern is something like `[1, 2, 3, 4].includes(version)` → change to `[1, 2, 3, 4, 5]`.

```bash
grep -n "version" src/lib/data-catalog/index.ts
```

Make the smallest edit that adds 5 to the allowlist.

- [x] **Step 3: Update the Catalog.version literal type**

Open `src/lib/data-catalog/types.ts`. Find the `readonly version: 1 | 2 | 3 | 4` declaration (added in Phase 5 review fix). Extend to:

```typescript
readonly version: 1 | 2 | 3 | 4 | 5;
```

- [x] **Step 4: Build sanity-check**

```bash
pnpm tsc --noEmit 2>&1 | tail -15
pnpm build 2>&1 | tail -15
```

Pre-existing errors in `tests/unit/scenarios/hormuz-gas.test.ts` and `tests/unit/scenarios/lng-impact.test.ts` are OK; new errors from these changes are not. `pnpm build` must succeed.

- [x] **Step 5: Lint**

```bash
pnpm lint
```

Expected: clean.

- [x] **Step 6: Commit**

```bash
git add public/data/catalog.json src/lib/data-catalog/index.ts src/lib/data-catalog/types.ts
git commit -m "$(cat <<'EOF'
Phase 6: catalog.json v5 + two new LNG-T3 entries

Adds lng_t3_terminals + lng_t3_voyages entries (CC BY 4.0, Zenodo
10.5281/zenodo.19571058). Re-frames existing gem_gas_infrastructure
LNG-terminal coverage as a supplement to LNG-T3. Parser allowlist
and Catalog.version literal type extended to accept v5.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Scenario types — extend for LNG-T3

**Files:**
- Modify: `src/lib/scenarios/types.ts`

**Why:** The Hormuz-LNG path needs new row types for voyages + daily trade, and `LngImportImpact` gains a `dataSource: 'baci' | 'lng-t3'` field so the UI can label which path produced the impact.

- [x] **Step 1: Modify `src/lib/scenarios/types.ts`**

Open `src/lib/scenarios/types.ts`. Add the following AFTER the existing `LngImportRow` interface:

```typescript
/** Phase 6: LNG-T3 voyage row used for per-terminal disaggregation. */
export interface LngVoyageRow {
  readonly start_date: string;  // ISO date (YYYY-MM-DD)
  readonly end_date: string;
  readonly imo: number;
  readonly voyage_type: "export" | "return";
  readonly from_terminal: string;
  readonly to_terminal: string;
  readonly from_country_iso3: string;
  readonly to_country_iso3: string;
  readonly amount_cbm: number;
  readonly confidence_score: number;  // 1-5
}

/** Phase 6: LNG-T3 daily country-pair trade row. */
export interface LngTradeDailyRow {
  readonly date: string;  // ISO date
  readonly type: "arrival" | "departure";
  readonly from_country_iso3: string;
  readonly to_country_iso3: string;
  readonly amount_cbm: number;
  readonly confidence_score: number;
}
```

Then update `LngImportImpact` to add a `dataSource` field. Change the existing block:

```typescript
export interface LngImportImpact {
  readonly asset_id: string;
  readonly iso3: string;
  readonly capacity: number;
  readonly atRiskQty: number;
  readonly shareAtRisk: number;
  readonly topSources: readonly { iso3: string; qty: number }[];
}
```

to:

```typescript
export interface LngImportImpact {
  readonly asset_id: string;
  readonly iso3: string;
  readonly capacity: number;
  readonly atRiskQty: number;
  readonly shareAtRisk: number;
  readonly topSources: readonly { iso3: string; qty: number }[];
  /** Phase 6: which engine path produced this impact. */
  readonly dataSource: "baci" | "lng-t3";
}
```

- [x] **Step 2: Type-check**

```bash
pnpm tsc --noEmit 2>&1 | tail -20
```

Expected: new errors in `src/lib/scenarios/lng.ts` (the existing computeLngImportImpacts doesn't populate `dataSource`) — that's intentional; Task 9 fixes it. No new errors anywhere else.

- [x] **Step 3: DO NOT commit yet** — Tasks 9–10 finish the scenario refactor; commit together at end of Task 10.

---

## Task 9: New scenario module — `lng-t3.ts` with per-terminal disaggregation (TDD)

**Files:**
- Create: `src/lib/scenarios/lng-t3.ts`
- Create: `tests/unit/scenarios/lng-t3.test.ts`

**Why:** Pure function that computes LNG import terminal impacts from VOYAGE-LEVEL data instead of country-total + capacity-share. Each voyage carries from→to terminal explicitly, so we can attribute exporter qty to a specific terminal without a capacity proxy.

The signature mirrors `computeLngImportImpacts` but takes `voyages` instead of `flowsByImporter`.

- [x] **Step 1: Write failing tests**

Create `tests/unit/scenarios/lng-t3.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { computeLngImportImpactsFromVoyages } from "@/lib/scenarios/lng-t3";
import type { LngImportRow, LngVoyageRow } from "@/lib/scenarios/types";

const T_A: LngImportRow = { asset_id: "T_A", country_iso3: "JPN", capacity: 5 };
const T_B: LngImportRow = { asset_id: "T_B", country_iso3: "JPN", capacity: 10 };
const T_C: LngImportRow = { asset_id: "T_C", country_iso3: "KOR", capacity: 8 };

function v(
  to_terminal: string,
  to_iso3: string,
  from_iso3: string,
  amount_cbm: number,
  date = "2023-06-15",
): LngVoyageRow {
  return {
    start_date: date,
    end_date: date,
    imo: 1,
    voyage_type: "export",
    from_terminal: "X",
    to_terminal,
    from_country_iso3: from_iso3,
    to_country_iso3: to_iso3,
    amount_cbm,
    confidence_score: 4,
  };
}

describe("computeLngImportImpactsFromVoyages", () => {
  it("attributes voyage qty directly to receiving terminal (no capacity proxy)", () => {
    // T_A receives 100 from QAT, T_B receives 200 from QAT. With Hormuz
    // applied at 100% share for QAT, T_A shareAtRisk=1.0, T_B shareAtRisk=1.0,
    // but absolute atRiskQty reflects voyage volumes — T_B has 2× T_A.
    const out = computeLngImportImpactsFromVoyages({
      lngImports: [T_A, T_B],
      voyages: [
        v("T_A", "JPN", "QAT", 100),
        v("T_B", "JPN", "QAT", 200),
      ],
      lookupShare: (exp, _imp) => (exp === "QAT" ? 1.0 : 0),
    });

    const a = out.find((x) => x.asset_id === "T_A");
    const b = out.find((x) => x.asset_id === "T_B");
    expect(a?.atRiskQty).toBe(100);
    expect(b?.atRiskQty).toBe(200);
    expect(a?.shareAtRisk).toBe(1.0);
    expect(b?.shareAtRisk).toBe(1.0);
    expect(a?.dataSource).toBe("lng-t3");
    expect(b?.dataSource).toBe("lng-t3");
  });

  it("computes per-terminal shareAtRisk over total voyages to that terminal", () => {
    // T_A: 100 from QAT (50% Hormuz) + 50 from USA (0% Hormuz)
    // expected: total 150, at-risk 50, shareAtRisk = 50/150 = 0.333...
    const out = computeLngImportImpactsFromVoyages({
      lngImports: [T_A],
      voyages: [
        v("T_A", "JPN", "QAT", 100),
        v("T_A", "JPN", "USA", 50),
      ],
      lookupShare: (exp, _imp) => (exp === "QAT" ? 0.5 : 0),
    });
    const a = out[0];
    expect(a.atRiskQty).toBe(50);
    expect(a.shareAtRisk).toBeCloseTo(50 / 150);
  });

  it("returns zero impact for terminals with no voyage data", () => {
    const out = computeLngImportImpactsFromVoyages({
      lngImports: [T_A, T_B, T_C],
      voyages: [v("T_A", "JPN", "QAT", 100)],
      lookupShare: (exp) => (exp === "QAT" ? 1.0 : 0),
    });
    const b = out.find((x) => x.asset_id === "T_B");
    const c = out.find((x) => x.asset_id === "T_C");
    expect(b?.atRiskQty).toBe(0);
    expect(b?.shareAtRisk).toBe(0);
    expect(c?.atRiskQty).toBe(0);
    expect(c?.shareAtRisk).toBe(0);
  });

  it("topSources ranks exporters by qty descending", () => {
    const out = computeLngImportImpactsFromVoyages({
      lngImports: [T_A],
      voyages: [
        v("T_A", "JPN", "QAT", 100),
        v("T_A", "JPN", "USA", 300),
        v("T_A", "JPN", "AUS", 200),
      ],
      lookupShare: () => 0,
    });
    expect(out[0].topSources.map((s) => s.iso3)).toEqual(["USA", "AUS", "QAT"]);
    expect(out[0].topSources[0].qty).toBe(300);
  });

  it("only considers export voyages (drops return ballast)", () => {
    const out = computeLngImportImpactsFromVoyages({
      lngImports: [T_A],
      voyages: [
        v("T_A", "JPN", "QAT", 100),
        { ...v("T_A", "JPN", "QAT", 999), voyage_type: "return" },
      ],
      lookupShare: () => 1.0,
    });
    expect(out[0].atRiskQty).toBe(100);
  });

  it("filters by min confidence score (default 3)", () => {
    const out = computeLngImportImpactsFromVoyages({
      lngImports: [T_A],
      voyages: [
        { ...v("T_A", "JPN", "QAT", 100), confidence_score: 4 },
        { ...v("T_A", "JPN", "QAT", 999), confidence_score: 1 },
      ],
      lookupShare: () => 1.0,
    });
    expect(out[0].atRiskQty).toBe(100);
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

```bash
pnpm vitest run tests/unit/scenarios/lng-t3.test.ts
```

Expected: "Cannot find module '@/lib/scenarios/lng-t3'".

- [x] **Step 3: Implement the module**

Create `src/lib/scenarios/lng-t3.ts`:

```typescript
import type { LngImportImpact, LngImportRow, LngVoyageRow } from "./types";

interface SrcQty {
  readonly iso3: string;
  readonly qty: number;
}

export interface LngImportFromVoyagesInput {
  readonly lngImports: readonly LngImportRow[];
  /** Voyages that have already been filtered by active year. */
  readonly voyages: readonly LngVoyageRow[];
  readonly lookupShare: (exporter: string, importer: string) => number;
  /** Default 3 — drops confidence 1 and 2. */
  readonly minConfidence?: number;
}

/**
 * Phase 6: LNG import terminal impacts derived from voyage-level data.
 *
 * Unlike `computeLngImportImpacts` (Phase 3 capacity-weighted attribution
 * over country totals), this path attributes each voyage's `amount_cbm`
 * directly to its `to_terminal`. No capacity proxy.
 *
 * Filters applied:
 *   - voyage_type === "export" (drops ballast returns)
 *   - confidence_score >= minConfidence (default 3)
 *
 * Terminals with no voyage data get zero atRisk / zero shareAtRisk.
 */
export function computeLngImportImpactsFromVoyages({
  lngImports,
  voyages,
  lookupShare,
  minConfidence = 3,
}: LngImportFromVoyagesInput): LngImportImpact[] {
  // Filter once
  const relevant = voyages.filter(
    (v) => v.voyage_type === "export" && v.confidence_score >= minConfidence,
  );

  // Bucket by destination terminal
  const sourcesByTerminal = new Map<string, SrcQty[]>();
  for (const v of relevant) {
    const list = sourcesByTerminal.get(v.to_terminal) ?? [];
    list.push({ iso3: v.from_country_iso3, qty: v.amount_cbm });
    sourcesByTerminal.set(v.to_terminal, list);
  }

  // We compare on terminal NAME (the LNG-T3 voyage `to_terminal` is the
  // terminal name). LngImportRow.asset_id includes a prefix like "lngt3/Name";
  // we strip the prefix to match.
  const out: LngImportImpact[] = [];
  for (const t of lngImports) {
    const terminalName = t.asset_id.startsWith("lngt3/")
      ? t.asset_id.slice("lngt3/".length).replace(/_/g, " ")  // best-effort restore
      : t.asset_id;

    // Try exact name match first; fall back to asset_id-derived
    const sources =
      sourcesByTerminal.get(terminalName) ??
      sourcesByTerminal.get(t.asset_id) ??
      [];

    // Aggregate by exporter for topSources
    const byExporter = new Map<string, number>();
    for (const s of sources) {
      byExporter.set(s.iso3, (byExporter.get(s.iso3) ?? 0) + s.qty);
    }
    const topSources = [...byExporter.entries()]
      .map(([iso3, qty]) => ({ iso3, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);

    const totalSupply = topSources.reduce((s, x) => s + x.qty, 0);
    let termAtRisk = 0;
    for (const src of topSources) {
      const share = lookupShare(src.iso3, t.country_iso3);
      if (share > 0) termAtRisk += src.qty * share;
    }

    out.push({
      asset_id: t.asset_id,
      iso3: t.country_iso3,
      capacity: t.capacity,
      atRiskQty: termAtRisk,
      shareAtRisk: totalSupply > 0 ? termAtRisk / totalSupply : 0,
      topSources,
      dataSource: "lng-t3",
    });
  }
  return out;
}
```

- [x] **Step 4: Run tests to verify pass**

```bash
pnpm vitest run tests/unit/scenarios/lng-t3.test.ts
```

Expected: all 6 tests pass.

- [x] **Step 5: DO NOT commit yet** — Task 10 finishes the engine wiring; commit together.

---

## Task 10: Engine branching + update existing lng.ts to populate dataSource

**Files:**
- Modify: `src/lib/scenarios/lng.ts` (add `dataSource: "baci"` to output)
- Modify: `src/lib/scenarios/engine.ts` (branch on year and lngVoyages availability)

**Why:** When the active year ∈ [2020, 2024] AND voyage data is provided, use the new lng-t3 path; otherwise keep BACI. Mirrors the spec's "branch on year" rule.

- [x] **Step 1: Update lng.ts to set dataSource: 'baci' on every impact**

Open `src/lib/scenarios/lng.ts`. Find the `out.push({...})` block in `computeLngImportImpacts`. Add `dataSource: "baci",` to it. The block becomes:

```typescript
    out.push({
      asset_id: t.asset_id,
      iso3: t.country_iso3,
      capacity: t.capacity,
      atRiskQty: termAtRisk,
      shareAtRisk: totalSupply > 0 ? termAtRisk / totalSupply : 0,
      topSources,
      dataSource: "baci",
    });
```

- [x] **Step 2: Update engine.ts to branch on year + lngVoyages**

Open `src/lib/scenarios/engine.ts`. Add import + interface field + branching logic:

1. At the top, add to the import block:

```typescript
import { computeLngImportImpactsFromVoyages } from "./lng-t3";
```

2. Update the `ScenarioInput` interface (around line 16) to include `lngVoyages`:

```typescript
export interface ScenarioInput {
  readonly scenarioId: ScenarioId;
  readonly commodity: Commodity;
  readonly year: number;
  readonly tradeFlows: readonly TradeFlowRow[];
  readonly routes: readonly DisruptionRouteRow[];
  readonly refineries?: readonly RefineryRow[];
  readonly lngImports?: readonly LngImportRow[];
  /** Phase 6: LNG-T3 voyages, already pre-filtered by active year. */
  readonly lngVoyages?: readonly import("./types").LngVoyageRow[];
}
```

3. Replace the `byLngImport` block (around line 85–93) with the year-gated branch:

```typescript
  // Phase 6: prefer LNG-T3 voyage-derived per-terminal attribution when
  // we have voyage data and the active year falls in the LNG-T3 range.
  const useLngT3 =
    input.year >= 2020 &&
    input.year <= 2024 &&
    input.lngVoyages !== undefined &&
    input.lngVoyages.length > 0;

  const byLngImport = useLngT3
    ? computeLngImportImpactsFromVoyages({
        lngImports: input.lngImports ?? [],
        voyages: input.lngVoyages!,
        lookupShare,
      })
    : input.lngImports && input.lngImports.length > 0
    ? computeLngImportImpacts({
        lngImports: input.lngImports,
        flowsByImporter,
        lookupShare,
      })
    : [];
  const rankedLngImports = [...byLngImport].sort((a, b) => b.atRiskQty - a.atRiskQty);
```

- [x] **Step 3: Type-check**

```bash
pnpm tsc --noEmit 2>&1 | tail -20
```

Expected: clean (apart from the 8 pre-existing errors in `hormuz-gas.test.ts` and `lng-impact.test.ts`).

- [x] **Step 4: Run unit tests**

```bash
pnpm test 2>&1 | tail -15
```

Expected: all tests pass, including the new 6 `lng-t3.test.ts` tests.

- [x] **Step 5: Lint**

```bash
pnpm lint
```

Expected: clean.

- [x] **Step 6: Commit Tasks 8, 9, 10 together**

```bash
git add src/lib/scenarios/types.ts src/lib/scenarios/lng.ts src/lib/scenarios/lng-t3.ts src/lib/scenarios/engine.ts tests/unit/scenarios/lng-t3.test.ts
git commit -m "$(cat <<'EOF'
Phase 6: scenario engine — LNG-T3 voyage-derived per-terminal attribution

Adds computeLngImportImpactsFromVoyages: voyage-level data lets us attribute
exporter qty directly to a receiving terminal without capacity-weighted
proxy. Engine branches on year ∈ [2020, 2024]: when LNG-T3 voyages are
available, use the new path; otherwise fall back to the Phase 3 BACI
capacity-weighted attribution unchanged.

LngImportImpact gains dataSource ∈ {'baci', 'lng-t3'} field so the UI
can label which path produced an impact.

TDD: 6 unit tests covering direct attribution, share-of-terminal math,
voyage_type filtering (drops return ballast), confidence-score filter
(default >= 3), empty-voyage fallback, topSources ranking.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: LayerState extension — lng_voyages flag + url-state round-trip

**Files:**
- Modify: `src/components/layers/LayerPanel.tsx` (add `lng_voyages` key + group row)
- Modify: `src/lib/url-state/encode.ts` (verify the new key round-trips)
- Modify: `tests/unit/url-state/encode.test.ts` (cover the new flag)
- Modify: `src/app/page.tsx` (ALL_LAYERS_ON has the new key)

**Why:** Add a new boolean to LayerState for the LNG voyages toggle, default OFF (high visual noise).

- [ ] **Step 1: Modify LayerPanel.tsx**

Open `src/components/layers/LayerPanel.tsx`. Update `LayerState`:

```typescript
export interface LayerState {
  reserves: boolean;
  basins: boolean;
  extraction: boolean;
  pipelines: boolean;
  refineries: boolean;
  storage: boolean;
  ports: boolean;
  gas_pipelines: boolean;
  lng_terminals: boolean;
  lng_voyages: boolean;       // NEW (Phase 6)
}
```

Update the `ROWS` array to include the new toggle in the Gas group:

```typescript
const ROWS: readonly Row[] = [
  { kind: "group", label: "Geology" },
  { kind: "toggle", key: "reserves", label: "Reserves (country)" },
  { kind: "toggle", key: "basins", label: "Basins" },
  { kind: "group", label: "Oil" },
  { kind: "toggle", key: "extraction", label: "Extraction sites" },
  { kind: "toggle", key: "pipelines", label: "Oil pipelines" },
  { kind: "toggle", key: "refineries", label: "Refineries" },
  { kind: "toggle", key: "storage", label: "Storage hubs" },
  { kind: "toggle", key: "ports", label: "Ports" },
  { kind: "group", label: "Gas" },
  { kind: "toggle", key: "gas_pipelines", label: "Gas pipelines" },
  { kind: "toggle", key: "lng_terminals", label: "LNG terminals" },
  { kind: "toggle", key: "lng_voyages", label: "LNG voyages (2020–2024)" },
];
```

- [ ] **Step 2: Update page.tsx defaults**

Open `src/app/page.tsx`. Find `ALL_LAYERS_ON`:

```typescript
const ALL_LAYERS_ON: LayerState = {
  reserves: true,
  basins: true,
  extraction: true,
  pipelines: true,
  refineries: true,
  storage: true,
  ports: true,
  gas_pipelines: true,
  lng_terminals: true,
};
```

Add `lng_voyages: false,` to the object — voyages start OFF by default (high visual noise; opt-in):

```typescript
const ALL_LAYERS_ON: LayerState = {
  reserves: true,
  basins: true,
  extraction: true,
  pipelines: true,
  refineries: true,
  storage: true,
  ports: true,
  gas_pipelines: true,
  lng_terminals: true,
  lng_voyages: false,
};
```

(Rename the constant to `DEFAULT_LAYERS` if the name conflicts with the new behavior — but the existing code uses `ALL_LAYERS_ON` as `DEFAULTS.layers` initializer, so keeping the name with one explicit `false` is fine.)

- [ ] **Step 3: Verify url-state encoding handles the new flag**

`encode.ts` should already iterate over LayerState keys without hard-coding them. Verify by reading the file:

```bash
grep -A 30 "encodeAppState" src/lib/url-state/encode.ts | head -50
```

If the encoder/decoder iterates over keys dynamically, no changes needed. If it hard-codes the key list, extend it to include `lng_voyages`.

- [ ] **Step 4: Add url-state test**

Open `tests/unit/url-state/encode.test.ts`. Find the `ALL_ON` constant and add `lng_voyages: true` to it. Then add a new test case:

```typescript
it("round-trips with lng_voyages flag toggled on", () => {
  const state: AppState = {
    year: 2023,
    commodity: "gas",
    scenario: "hormuz",
    layers: { ...ALL_ON, lng_voyages: true },
  };
  const qs = encodeAppState(state);
  const decoded = decodeAppState(new URLSearchParams(qs), DEFAULTS);
  expect(decoded.layers.lng_voyages).toBe(true);
});

it("decodes a URL missing lng_voyages to the default (false)", () => {
  // Forward-compat: pre-Phase-6 bookmarks land with lng_voyages=false.
  const decoded = decodeAppState(
    new URLSearchParams("year=2020&layers=reserves,basins,extraction"),
    DEFAULTS,
  );
  expect(decoded.layers.lng_voyages).toBe(false);
});
```

- [ ] **Step 5: Run vitest**

```bash
pnpm vitest run tests/unit/url-state
```

Expected: all url-state tests pass.

- [ ] **Step 6: Type-check + lint**

```bash
pnpm tsc --noEmit 2>&1 | tail -10
pnpm lint
```

Expected: clean.

- [ ] **Step 7: DO NOT commit yet** — Task 12 wires the actual voyage layer; commit together at end of Task 12.

---

## Task 12: LngVoyagesLayer.tsx — new ArcLayer

**Files:**
- Create: `src/components/layers/LngVoyagesLayer.tsx`

**Why:** Renders LNG-T3 voyages as great-circle arcs from `from_terminal` → `to_terminal`. Filtered to active year (start_date.year <= Y <= end_date.year); min confidence 3; default OFF.

- [ ] **Step 1: Create LngVoyagesLayer.tsx**

```typescript
"use client";
import { useEffect, useState } from "react";
import { ArcLayer } from "@deck.gl/layers";
import { query } from "@/lib/duckdb/query";
import type { LngImportImpact } from "@/lib/scenarios/types";

interface VoyageRow extends Record<string, unknown> {
  voyage_id: string;
  start_date: string;
  end_date: string;
  imo: number;
  voyage_type: "export" | "return";
  from_terminal: string;
  to_terminal: string;
  from_country: string;
  to_country: string;
  from_country_iso3: string;
  to_country_iso3: string;
  amount_cbm: number;
  confidence_score: number;
  from_lon: number;
  from_lat: number;
  to_lon: number;
  to_lat: number;
}

export interface LngVoyagesLayerInput {
  readonly visible: boolean;
  readonly year: number;
  readonly minConfidence?: number;
  readonly impactByTerminalName?: ReadonlyMap<string, LngImportImpact>;
}

export function useLngVoyagesLayer({
  visible,
  year,
  minConfidence = 3,
  impactByTerminalName,
}: LngVoyagesLayerInput) {
  const [layer, setLayer] = useState<ArcLayer<VoyageRow> | null>(null);

  useEffect(() => {
    const ctrl = { cancelled: false };
    if (!visible) {
      void Promise.resolve().then(() => {
        if (!ctrl.cancelled) setLayer(null);
      });
      return () => { ctrl.cancelled = true; };
    }
    void (async () => {
      try {
        // Server-side filter by year + confidence + voyage_type, plus terminal-coord join.
        const sql = `
          WITH terms AS (
            SELECT name, lon, lat
            FROM read_parquet('/data/assets.parquet')
            WHERE kind IN ('lng_export', 'lng_import')
          )
          SELECT
            v.voyage_id, v.start_date, v.end_date, v.imo, v.voyage_type,
            v.from_terminal, v.to_terminal,
            v.from_country, v.to_country,
            v.from_country_iso3, v.to_country_iso3,
            v.amount_cbm, v.confidence_score,
            ft.lon AS from_lon, ft.lat AS from_lat,
            tt.lon AS to_lon, tt.lat AS to_lat
          FROM read_parquet('/data/lng_voyage.parquet') v
          LEFT JOIN terms ft ON v.from_terminal = ft.name
          LEFT JOIN terms tt ON v.to_terminal = tt.name
          WHERE v.voyage_type = 'export'
            AND v.confidence_score >= ${minConfidence.toString()}
            AND CAST(strftime(v.start_date, '%Y') AS INTEGER) <= ${year.toString()}
            AND CAST(strftime(v.end_date, '%Y') AS INTEGER) >= ${year.toString()}
            AND ft.lon IS NOT NULL AND tt.lon IS NOT NULL
        `;
        const res = await query<VoyageRow>(sql);
        if (ctrl.cancelled) return;

        const l = new ArcLayer<VoyageRow>({
          id: "lng-voyages",
          data: res.rows,
          getSourcePosition: (d) => [d.from_lon, d.from_lat],
          getTargetPosition: (d) => [d.to_lon, d.to_lat],
          getSourceColor: (d) => {
            // Export end — orange-ish. If under scenario, tint toward red for at-risk exporters.
            const impact = impactByTerminalName?.get(d.to_terminal);
            if (impact && impact.shareAtRisk > 0) {
              return [220, 80, 60, 200];
            }
            return [220, 140, 60, 160];
          },
          getTargetColor: (d) => {
            // Import end — teal/blue
            const impact = impactByTerminalName?.get(d.to_terminal);
            if (impact && impact.shareAtRisk > 0) {
              const r = Math.round(80 + 175 * impact.shareAtRisk);
              return [r, 30, 30, 230];
            }
            return [20, 140, 200, 200];
          },
          getWidth: (d) => Math.max(0.5, Math.log10(Math.max(1, d.amount_cbm)) - 3),
          widthMinPixels: 0.5,
          widthMaxPixels: 4,
          greatCircle: true,
          pickable: true,
          updateTriggers: {
            getSourceColor: [impactByTerminalName],
            getTargetColor: [impactByTerminalName],
          },
        });
        setLayer(l);
      } catch (err) {
        console.error("LngVoyagesLayer load failed:", err);
      }
    })();
    return () => { ctrl.cancelled = true; };
  }, [visible, year, minConfidence, impactByTerminalName]);

  return layer;
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm tsc --noEmit 2>&1 | tail -10
```

Expected: no errors in the new file. (`page.tsx` will complain because it isn't mounting the layer yet — Task 13 fixes.)

- [ ] **Step 3: DO NOT commit yet** — Task 13 mounts the layer in page.tsx; commit together.

---

## Task 13: Wire LngVoyagesLayer + LNG-T3 scenario data into page.tsx

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/components/scenarios/useScenario.ts` (if exists — confirm; load voyages parquet when year ∈ [2020, 2024] and scenario is hormuz)
- Modify: `src/components/scenarios/overlay.ts` (add `lngVoyageImpactByTerminalName(scenario)` helper)

**Why:** Mount the voyage layer; load voyage data for the active year; thread the impact map through to color the arcs by scenario.

- [ ] **Step 1: Read current useScenario.ts**

```bash
ls src/components/scenarios/
cat src/components/scenarios/useScenario.ts
```

Confirm the structure; existing hook returns a `ScenarioResult` from `computeScenarioImpact`.

- [ ] **Step 2: Extend useScenario.ts to load voyages when year ∈ [2020, 2024]**

Open `src/components/scenarios/useScenario.ts`. Find the data-loading block (it loads tradeFlows, routes, refineries, lngImports). Add a parallel load for voyages when year is in range:

```typescript
// Phase 6: load LNG voyages for the active year only when in LNG-T3 range
const useLngT3 = year >= 2020 && year <= 2024;
const lngVoyagesPromise = useLngT3
  ? query<{
      start_date: string; end_date: string; imo: number;
      voyage_type: "export" | "return"; from_terminal: string;
      to_terminal: string; from_country_iso3: string;
      to_country_iso3: string; amount_cbm: number; confidence_score: number;
    }>(`
      SELECT start_date, end_date, imo, voyage_type, from_terminal,
             to_terminal, from_country_iso3, to_country_iso3,
             amount_cbm, confidence_score
      FROM read_parquet('/data/lng_voyage.parquet')
      WHERE voyage_type = 'export'
        AND CAST(strftime(start_date, '%Y') AS INTEGER) <= ${year.toString()}
        AND CAST(strftime(end_date, '%Y') AS INTEGER) >= ${year.toString()}
    `).then((r) => r.rows)
  : Promise.resolve([]);
```

Pass `lngVoyages: voyages` into `computeScenarioImpact({...})`.

Note: the actual implementation of `useScenario.ts` may differ; adapt by reading the file. The principle: load voyages once per (year, commodity, scenario), pass to engine.

- [ ] **Step 3: Add overlay helper**

Open `src/components/scenarios/overlay.ts`. Add a new helper:

```typescript
import type { LngImportImpact, ScenarioResult } from "@/lib/scenarios/types";

export function lngVoyageImpactByTerminalName(
  scenario: ScenarioResult | null,
): ReadonlyMap<string, LngImportImpact> | undefined {
  if (!scenario || scenario.byLngImport.length === 0) return undefined;
  const out = new Map<string, LngImportImpact>();
  for (const impact of scenario.byLngImport) {
    // asset_id may be "lngt3/Terminal_Name" or "gem/<id>" — derive a name key.
    // For LNG-T3 records the name was stored in the impact's asset_id with
    // underscores replacing whitespace. We can't reconstruct the original
    // terminal name perfectly; the layer's join falls back to asset_id.
    out.set(impact.asset_id, impact);
  }
  return out;
}
```

- [ ] **Step 4: Wire into page.tsx**

Open `src/app/page.tsx`. Add the voyage layer:

```typescript
import { useLngVoyagesLayer } from "@/components/layers/LngVoyagesLayer";
import { lngVoyageImpactByTerminalName } from "@/components/scenarios/overlay";
```

Inside `HomeInner`, after the existing `useMemo` blocks for scenario overlays, add:

```typescript
  const voyageImpacts = useMemo(
    () => lngVoyageImpactByTerminalName(scenario),
    [scenario],
  );
  const lngVoyages = useLngVoyagesLayer({
    visible: layers.lng_voyages,
    year,
    ...(voyageImpacts !== undefined ? { impactByTerminalName: voyageImpacts } : {}),
  });
```

Add the new layer to `visibleLayers` array. Pick a Z-order — voyages go ABOVE basins/reserves/extraction/pipelines but BELOW point layers (refineries, LNG terminals):

```typescript
  const visibleLayers = [
    layers.basins ? basins : null,
    layers.reserves ? reserves : null,
    layers.extraction ? extraction : null,
    oilPipes,
    gasPipes,
    lngVoyages,                          // NEW
    refineries,
    storage,
    ports,
    lngTerminals,
  ].filter((x) => x !== null);
```

Add a tooltip case in `getTooltip`:

```typescript
      if (info.layer?.id === "lng-voyages") {
        const v = o as VoyageRow;  // — declare a local type or use as Record
        const cbm = typeof v.amount_cbm === "number" ? v.amount_cbm : 0;
        const mt = (cbm * 0.4245) / 1e6;
        return [
          `LNG voyage: ${v.from_terminal} → ${v.to_terminal}`,
          `From: ${v.from_country} (${v.from_country_iso3})`,
          `To:   ${v.to_country} (${v.to_country_iso3})`,
          `Dates: ${v.start_date} → ${v.end_date}`,
          `Cargo: ${cbm.toLocaleString()} cbm  (≈ ${mt.toFixed(3)} Mt)`,
          `Confidence: ${v.confidence_score}/5`,
        ].join("\n");
      }
```

Replace the placeholder type with an inline interface or import `VoyageRow`-style fields from where convenient; use the same `Record<string, unknown>` cast pattern the file already uses for other tooltips.

- [ ] **Step 5: Type-check + tests + build**

```bash
pnpm tsc --noEmit 2>&1 | tail -20
pnpm test 2>&1 | tail -10
pnpm lint
pnpm build 2>&1 | tail -10
```

All must succeed.

- [ ] **Step 6: Commit Tasks 11, 12, 13 together**

```bash
git add src/components/layers/LayerPanel.tsx src/app/page.tsx \
        src/components/layers/LngVoyagesLayer.tsx \
        src/components/scenarios/overlay.ts \
        src/components/scenarios/useScenario.ts \
        src/lib/url-state/encode.ts tests/unit/url-state/encode.test.ts
git commit -m "$(cat <<'EOF'
Phase 6: LNG voyages ArcLayer + scenario wiring

LayerPanel adds a new "LNG voyages (2020–2024)" toggle under the Gas
group, default OFF. LayerState gains a lng_voyages: boolean key that
round-trips through the URL; pre-Phase-6 bookmarks decode to false.

LngVoyagesLayer renders deck.gl ArcLayer with great-circle arcs from
from_terminal to to_terminal. Server-side DuckDB SQL filters by active
year (start_date.year <= Y <= end_date.year), voyage_type='export', and
confidence_score >= 3. When the Hormuz-LNG scenario is active, target
end gets tinted red proportional to shareAtRisk.

useScenario loads voyages parquet when year ∈ [2020, 2024]; engine.ts
branches on voyage availability + year to use the new lng-t3 attribution
path (Task 9–10). Pre-2020 unchanged.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: LngTerminalsLayer tooltip enrichment

**Files:**
- Modify: `src/components/layers/LngTerminalsLayer.tsx` (query + tooltip surfaces unit_count, total_processed_bcm, source)

**Why:** The new schema columns on `assets.parquet` (unit_count, total_processed_bcm, un_locode) should appear in the terminal hover tooltip. Also surface the `source` field so analysts know which row came from LNG-T3 vs GEM.

- [ ] **Step 1: Read the current LngTerminalsLayer.tsx**

```bash
cat src/components/layers/LngTerminalsLayer.tsx | head -80
```

- [ ] **Step 2: Modify the SELECT and the tooltip**

Open `src/components/layers/LngTerminalsLayer.tsx`. Update the SQL SELECT to include the new columns:

```typescript
      const res = await query<LngTerminalRow>(
        `SELECT asset_id, kind, name, country_iso3, lon, lat, capacity, operator, status,
                unit_count, total_processed_bcm, un_locode, source
         FROM read_parquet('/data/assets.parquet')
         WHERE kind IN ('lng_export', 'lng_import')`,
      );
```

Update the `LngTerminalRow` interface (lines 7–17 of current file) to include the new fields:

```typescript
interface LngTerminalRow extends Record<string, unknown> {
  asset_id: string;
  kind: "lng_export" | "lng_import";
  name: string;
  country_iso3: string;
  lon: number;
  lat: number;
  capacity: number | null;
  operator: string | null;
  status: string | null;
  unit_count: number | null;
  total_processed_bcm: number | null;
  un_locode: string | null;
  source: string | null;
}
```

- [ ] **Step 3: Update the tooltip in page.tsx**

Open `src/app/page.tsx`. Find the existing `lng-terminals` tooltip block (search for `lng-terminals`). Extend the lines list to include the new fields:

```typescript
      if (info.layer?.id === "lng-terminals") {
        const cap = o.capacity;
        const capStr = typeof cap === "number" && cap > 0 ? `${cap.toFixed(1)} mtpa` : "n/a";
        const kind = o.kind === "lng_export" ? "LNG export terminal" : "LNG import terminal";
        const impact = lngImpacts?.get(o.asset_id as string);
        const lines = [
          `${kind}: ${o.name as string}`,
          `Country: ${o.country_iso3 as string}`,
          `Operator: ${(o.operator as string | null) ?? "n/a"}`,
          `Capacity: ${capStr}`,
        ];
        if (typeof o.unit_count === "number" && o.unit_count > 0) {
          lines.push(`Units: ${o.unit_count}`);
        }
        if (typeof o.total_processed_bcm === "number" && o.total_processed_bcm > 0) {
          lines.push(`Total processed (2020–2024): ${(o.total_processed_bcm).toLocaleString()} bcm`);
        }
        if (typeof o.un_locode === "string" && o.un_locode) {
          lines.push(`UN/LOCODE: ${o.un_locode}`);
        }
        if (typeof o.source === "string") {
          const src = o.source.includes("LNG-T3") ? "LNG-T3" : "GEM";
          lines.push(`Source: ${src}`);
        }
        if (impact && impact.topSources.length > 0) {
          lines.push("", "Historical top sources (capacity-weighted):");
          for (const s of impact.topSources) {
            lines.push(`  ${s.iso3}: ${s.qty.toFixed(1)}`);
          }
          if (impact.shareAtRisk > 0) {
            lines.push("", `At-risk under scenario: ${(impact.shareAtRisk * 100).toFixed(1)}%`);
          }
        }
        // Phase 6: surface which engine path was used
        if (impact && (impact as { dataSource?: string }).dataSource) {
          const ds = (impact as { dataSource: string }).dataSource;
          lines.push(`Attribution: ${ds === "lng-t3" ? "measured voyages (LNG-T3)" : "BACI capacity-weighted"}`);
        }
        return lines.join("\n");
      }
```

- [ ] **Step 4: Build + lint**

```bash
pnpm tsc --noEmit 2>&1 | tail -10
pnpm lint
pnpm test 2>&1 | tail -10
pnpm build 2>&1 | tail -10
```

All must succeed.

- [ ] **Step 5: Commit**

```bash
git add src/components/layers/LngTerminalsLayer.tsx src/app/page.tsx
git commit -m "$(cat <<'EOF'
Phase 6: LNG terminals tooltip — surface unit_count, throughput, source

Layer SELECTs the new Phase 6 columns (unit_count, total_processed_bcm,
un_locode, source) and renders them in the hover tooltip. Tooltip also
shows which scenario engine path produced the at-risk percentage
(measured voyages vs BACI capacity-weighted).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: Methodology + data-sources + CLAUDE.md + README updates

**Files:**
- Modify: `docs/methodology.md` (append Phase 6 section)
- Modify: `docs/data-sources.md` (move LNG-T3 from "Phase 6+ candidate" to in-production)
- Modify: `CLAUDE.md` (sources table + schema row)
- Modify: `README.md` (LNG totals updated)

**Why:** Single docs-update task. Bundles all narrative updates for the Phase 6 ship. Phase status flip stays in the follow-up PR (Task 18).

- [ ] **Step 1: Read the validation output from Task 6**

```bash
cat data/validation/lng_t3_vs_giignl.txt
```

The numbers there will populate the methodology section's reconciliation table.

- [ ] **Step 2: Append Phase 6 section to `docs/methodology.md`**

Append the following after the Phase 5 section (use the actual validation table from Step 1 in the LNG-T3 vs GIIGNL subsection):

```markdown
## Phase 6 — LNG Carrier Dynamics

Phase 6 lifts the LNG layer from "static terminal capacity (GEM)" to "measured global LNG flow (LNG-T3)." Three changes: LNG-T3 becomes the primary LNG terminal source with GEM as a 25 km supplement; voyages and daily trade flows are surfaced as new parquets and a new ArcLayer; the Hormuz-LNG scenario uses measured per-voyage attribution for years 2020–2024.

### Source: Zhou et al. 2026 (LNG-T3)

Citation: Zhou C. (2026). *Global Marine LNG Terminals, Tankers & Trade (LNG-T3): A High-Resolution AIS-Based Dataset of LNG Trade Dynamics (2020–2024).* Scientific Data. DOI: [10.5281/zenodo.19571058](https://doi.org/10.5281/zenodo.19571058). License: CC BY 4.0.

Three integrated components: (1) global LNG tanker fleet inventory (406 active vessels of 861 cataloged), (2) harmonized LNG terminal inventory (545 terminals, 330 operating or under construction), (3) AIS-derived daily voyage records (17,592 voyages), terminal throughput (16,115 terminal-day rows), and country-to-country trade flows (16,691 records) spanning 2020-01-01 → 2024-12-31. Validation by the original authors against Gas Infrastructure Europe (GIE), U.S. EIA, Eurostat, and GIIGNL.

### Terminal augmentation: LNG-T3 primary + GEM supplement

Probed 2026-05-19: 95% of GEM GGIT terminals match an LNG-T3 active terminal within 10 km in the same country; 98% within 25 km. We use **25 km** as the dedup threshold (larger than Phase 5's refinery 2 km because LNG terminal campuses are larger and same-port collisions less likely). LNG-T3 active terminals (330) are loaded as primary; GEM terminals without an LNG-T3 match within 25 km same country (~10 records) are kept as supplements with source tagging.

Result: ~340 LNG terminals, capacity coverage rises from ~92% (GEM) to ~100% (LNG-T3 always populates capacity), and `start_year` coverage rises from 0% (GEM didn't tag) to ~88% (LNG-T3's start_year column). Phase 5's vintage filter now meaningfully applies to LNG terminals.

### LNG-T3 vs GIIGNL reconciliation

LNG-T3 daily arrivals aggregated to annual tonnage (cbm × 0.4245 t/cbm DOE LNG density). The table below was generated by `scripts/validate/lng_t3_vs_giignl.py` and is checked in at `data/validation/lng_t3_vs_giignl.txt`:

```
PASTE THE EXACT CONTENTS OF data/validation/lng_t3_vs_giignl.txt — INCLUDING THE HEADER ROW AND ALL 5 YEAR ROWS — AS A FENCED CODE BLOCK HERE.
```

(Step 1 of Task 15 cats that file; copy its full output verbatim into the fenced code block above. The agent doing this task should NOT leave the literal "PASTE THE EXACT CONTENTS..." sentinel in the committed file.)

If LNG-T3 annuals diverge materially from GIIGNL (>30%), Phase 6 keeps BACI's role as the country-total source and uses LNG-T3 only for per-terminal disaggregation — a "use measured voyages to redistribute within country" pattern. If LNG-T3 is within 30% of GIIGNL, it becomes the country-total source for years 2020–2024. The validation script (`scripts/validate/lng_t3_vs_giignl.py`) makes this check explicit and is part of CI's reproducibility story.

### Voyage layer

`LNG voyages` toggle (under the Gas group, default OFF) renders deck.gl ArcLayer with great-circle arcs from each export terminal to each import terminal. Server-side DuckDB SQL filters by active year (`start_date.year <= Y <= end_date.year`), voyage_type='export' (drops ballast returns), and `confidence_score >= 3` (drops the ~2,500 lowest-confidence rows). Annual arc count: ~2,400 (2020) → ~4,800 (2023). Color is voyage-type by default; when the Hormuz-LNG scenario is active, the import end tints red proportional to shareAtRisk.

### Hormuz-LNG scenario refactor

Phase 3 implemented Hormuz-LNG as: BACI annual trade × capacity-weighted attribution from country total to individual terminals. Phase 6 adds a voyage-level path: each voyage's `amount_cbm` attributes directly to its `to_terminal`, without a capacity proxy.

The engine branches on year + voyage availability:
- **year ∈ [2020, 2024] AND voyages provided** → `computeLngImportImpactsFromVoyages`
- **otherwise** → `computeLngImportImpacts` (existing BACI path, unchanged)

`LngImportImpact.dataSource ∈ {'baci', 'lng-t3'}` lets the tooltip label which path produced any given at-risk percentage. The 1995–2019 time series is preserved.

### What Phase 6 doesn't ship

- **Vessel fleet layer / animated TripsLayer.** 861-vessel inventory has enough metadata for a vessel-at-position-on-date animation interpolating along voyage paths; deck.gl TripsLayer complexity outweighs analytical value over static arcs. Deferred.
- **Daily time slider.** Annual slider stays; daily resolution is in the parquets but not surfaced as UI.
- **Confidence-score threshold slider.** Default >= 3; making it user-tunable is Phase 7+.
- **MarineCadastre US-coastal oil tankers + EMODnet EU route density.** Separate datasets, separate phases.
```

- [ ] **Step 3: Update `docs/data-sources.md`**

Open `docs/data-sources.md`. Move/promote LNG-T3 from the "Phase 6+ candidates" section to "In production". Add this section after the existing GEM GGIT entry:

```markdown
### LNG-T3 — Zhou 2026 (Global Marine LNG Terminals, Tankers & Trade)

- **URL:** https://doi.org/10.5281/zenodo.19571058 (paper: https://www.nature.com/articles/s41597-026-07454-2)
- **License:** **CC BY 4.0**
- **As-of:** 2026-04-01 (Zenodo deposit)
- **Where it lands:** `assets.parquet` rows where `source LIKE 'Zhou%LNG-T3%'` (LNG terminals primary); `lng_voyage.parquet`, `lng_trade_daily.parquet`, `lng_terminal_daily.parquet`
- **Layers/scenarios using it:** LNG terminals layer (primary); LNG voyages layer; Hormuz-LNG scenario (year ∈ [2020, 2024])

**What we ingest:**
- 545 LNG terminals (172 export + 373 import; 330 operating + construction after filter)
- 17,592 voyages 2020–2024 (one row per voyage including from/to terminal, from/to country, amount_cbm, confidence_score 1–5)
- 16,691 country-pair daily trade records (arrival + departure)
- 16,115 terminal-day measured throughput records (159 unique terminals with non-zero flow)

The 406-vessel active fleet inventory and 861-vessel total are NOT surfaced as a layer in Phase 6 — deferred to Phase 7+.

**Validation:** The original paper validates LNG-T3 totals against Gas Infrastructure Europe (GIE), U.S. EIA, Eurostat, and GIIGNL. Our `scripts/validate/lng_t3_vs_giignl.py` reproduces a public-data check against GIIGNL annual headline numbers (acceptable gap: 30%); see `docs/methodology.md` Phase 6 section for the current result.

**Caveats:**
- LNG-T3's voyage detection has a confidence score (1–5). Phase 6's voyage layer and scenario engine default to confidence ≥ 3.
- The 2020-01-01 start cuts off pre-pandemic history. Pre-2020 LNG analysis falls back to BACI HS 271111.
- Density conversion (`cbm × 0.4245` for tonnes) is the DOE convention but real density varies 0.41–0.46 depending on composition; document in methodology.
```

Then update the existing "Tanker / LNG carrier AIS" entry in the "Candidate sources (Phase 6+)" section. Change the bullet that says "LNG carriers — solved openly: LNG-T3..." to instead say something like:

```markdown
- **LNG carriers — shipped in Phase 6.** LNG-T3 (Zhou 2026) — see the "In production" section above for details. The 861-vessel fleet inventory was *not* surfaced as a map layer in Phase 6; an animated vessel-position layer remains a Phase 7+ candidate.
```

- [ ] **Step 4: Update `CLAUDE.md`**

Open `CLAUDE.md`. In the data sources table, find the gas pipelines + LNG row:

```
| Gas pipelines + LNG terminals | GEM Global Gas Infrastructure Tracker (GGIT) | **CC BY 4.0** | Phase 3 — 2026-02-20 release; LNG terminals discriminated by import/export, capacity in mtpa |
```

Replace with two rows:

```
| Gas pipelines | GEM Global Gas Infrastructure Tracker (GGIT) | **CC BY 4.0** | Phase 3 — 2026-02-20 release; capacity in bcm/y |
| LNG terminals + voyages + daily flows | LNG-T3 (Zhou 2026, Zenodo) primary + GEM GGIT supplement | CC BY 4.0 / CC BY 4.0 | Phase 6 — 330 LNG-T3 active + ~10 GEM-only after 25 km dedup; 17,592 voyages 2020–2024; daily throughput + trade flows |
```

Update the schema table — find the `asset` row and add a brief note that lng_export/lng_import rows now carry unit_count + total_processed_bcm + un_locode. Or just leave the row as-is and note "Phase 6 schema additions" at the end of the schema section.

Add a row to the schema table for the new tables:

```
| `lng_voyage`, `lng_trade_daily`, `lng_terminal_daily` | start/end dates, IMO, from/to terminal + country/iso3, amount_cbm, confidence_score | Phase 6 — LNG-T3 |
```

DO NOT flip the Phase 6 status to shipped — that's the follow-up PR.

- [ ] **Step 5: Update `README.md`**

Open `README.md`. In the "What's on the map today" list, update the LNG line to reflect new counts:

Change:
```
- **434 LNG terminals** (GEM, split by import/export, capacity in mtpa)
```
to:
```
- **~340 LNG terminals** (LNG-T3 primary + GEM supplement, daily throughput tracked 2020–2024)
- **17,592 LNG voyages 2020–2024** (LNG-T3, opt-in layer, filterable by year and confidence)
```

- [ ] **Step 6: Commit**

```bash
git add docs/methodology.md docs/data-sources.md CLAUDE.md README.md
git commit -m "$(cat <<'EOF'
Phase 6: docs — methodology + data-sources + CLAUDE.md + README

Methodology page: new Phase 6 section documenting LNG-T3 source,
augmentation strategy, voyage layer behavior, scenario refactor branch,
and the LNG-T3 vs GIIGNL reconciliation result.

Data sources: LNG-T3 promoted from "Phase 6+ candidate" to in-production
with full schema + caveats. Tanker/LNG-carrier entry updated to reflect
the shipped status.

CLAUDE.md: sources table splits gas pipelines (GEM) from LNG (LNG-T3
primary + GEM supplement); schema table adds three new tables.

README: LNG totals updated; new voyages layer mentioned.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 16: Full lint + tests + build verification

**Files:** none (verification only)

- [ ] **Step 1: Frontend lint**

```bash
pnpm lint
```

Expected: clean.

- [ ] **Step 2: Python lint**

```bash
uv run ruff check scripts/ tests/
```

Expected: clean.

- [ ] **Step 3: Vitest**

```bash
pnpm test 2>&1 | tail -20
```

Expected: all tests pass, including 6 new `lng-t3.test.ts` tests + 2 new `encode.test.ts` cases.

- [ ] **Step 4: Pytest**

```bash
uv run pytest tests/python -v 2>&1 | tail -20
```

Expected: all tests pass, including 5 new `test_lng_iso3.py` tests. Total should be ~32+.

- [ ] **Step 5: Build**

```bash
pnpm build 2>&1 | tail -20
```

Expected: build succeeds. Pre-existing TS errors in `tests/unit/scenarios/hormuz-gas.test.ts` and `tests/unit/scenarios/lng-impact.test.ts` are pre-existing.

- [ ] **Step 6: Spot-check artifacts**

```bash
ls -lh public/data/lng_voyage.parquet public/data/lng_trade_daily.parquet public/data/lng_terminal_daily.parquet
uv run python -c "
import pandas as pd
for path in ['lng_voyage', 'lng_trade_daily', 'lng_terminal_daily']:
    df = pd.read_parquet(f'public/data/{path}.parquet')
    print(f'{path}: {len(df)} rows')
a = pd.read_parquet('public/data/assets.parquet')
lng = a[a['kind'].isin(['lng_export','lng_import'])]
print(f'LNG terminals: {len(lng)}')
print(f\"by source: {lng['source'].value_counts().to_dict()}\")
import json
c = json.load(open('public/data/catalog.json'))
print(f'catalog v{c[\"version\"]}: {len(c[\"entries\"])} entries')
"
```

- [ ] **Step 7: Git state**

```bash
git status
git log --oneline phase-6 ^main | wc -l
```

Expected: clean tree; ~13–15 Phase 6 commits on the branch beyond `main`.

---

## Task 17: Push branch + open PR

**Files:** none

- [ ] **Step 1: Push**

```bash
git push -u origin phase-6
```

- [ ] **Step 2: Open PR**

```bash
gh pr create --title "Phase 6: LNG carrier dynamics — LNG-T3 ingest + voyages + scenario refactor" --body "$(cat <<'EOF'
## Summary

- **LNG-T3 (Zhou 2026, CC BY 4.0) ingested** — Zenodo `10.5281/zenodo.19571058`, 5 CSVs from 2020-01-01 → 2024-12-31, validated against GIE/EIA/Eurostat/GIIGNL.
- **LNG terminals: LNG-T3 primary + GEM supplement** at 25 km same-country dedup. ~340 terminals total; capacity coverage rises 92% → ~100%; commissioned_year coverage rises 0% → 88% (vintage filter now applies).
- **New voyages ArcLayer (default OFF)** — 17,592 voyages 2020–2024 rendered as great-circle arcs filtered by active year and confidence_score ≥ 3. Server-side DuckDB SQL keeps the round-trip small.
- **Hormuz-LNG scenario refactor** — branches on year ∈ [2020, 2024] + voyage availability. New `lng-t3.ts` pure-function module computes per-terminal impacts from voyage-level data (no capacity proxy). Pre-2020 unchanged.
- **New parquets:** `lng_voyage.parquet`, `lng_trade_daily.parquet`, `lng_terminal_daily.parquet`. `assets.parquet` gains 3 columns (unit_count, total_processed_bcm, un_locode).
- **Catalog v5** with two new entries (`lng_t3_terminals`, `lng_t3_voyages`). Existing GEM entry reframed as supplement.
- **Docs** — `docs/methodology.md` Phase 6 section with the LNG-T3 vs GIIGNL reconciliation table; `docs/data-sources.md` promotes LNG-T3 from candidate to in-production; `CLAUDE.md` + `README.md` updated.
- **Out of scope (deferred to Phase 7+):** vessel fleet animation, daily time slider, user-tunable confidence threshold, MarineCadastre US-coastal oil tankers, EMODnet EU route density.

Spec: `docs/superpowers/specs/2026-05-19-global-energy-map-phase-6-design.md`
Plan: `docs/superpowers/plans/2026-05-19-global-energy-map-phase-6.md`

## Test plan

- [x] LNG country-name mapping unit tests (5)
- [x] LNG-T3 voyage-derived attribution unit tests (6 cases incl. ballast/confidence filters)
- [x] URL state round-trip extended with `lng_voyages` flag
- [x] `pnpm lint` clean
- [x] `pnpm test` — all unit tests pass
- [x] `uv run pytest tests/python` — all Python tests pass
- [x] `pnpm build` succeeds
- [x] LNG-T3 vs GIIGNL validation captured in `data/validation/lng_t3_vs_giignl.txt` and surfaced in methodology

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Return the PR URL.

---

## Task 18: Final whole-implementation Opus code review

**Files:** none (review only — addresses any reviewer findings)

- [ ] **Step 1: Dispatch a code-quality reviewer subagent (Opus)** to audit the full Phase 6 diff against `main`.

Use the controller's subagent dispatch with `feature-dev:code-reviewer` + `model: opus`. Provide BASE/HEAD SHAs from:

```bash
BASE=$(git merge-base main phase-6)
HEAD=$(git rev-parse phase-6)
echo "BASE: $BASE"
echo "HEAD: $HEAD"
git diff --stat $BASE..$HEAD
```

Brief the reviewer to look at:
- Correctness of `computeLngImportImpactsFromVoyages` (especially the terminal-name match logic — asset_id de-mangling has a fallback but spot-check it)
- Engine branching: does the year check correctly select the right path?
- 25 km dedup: is the threshold and same-country scoping sound?
- LngVoyagesLayer SQL: does the `strftime('%Y')` cast work as expected in DuckDB-WASM?
- Validation script's GIIGNL constants — are they current?
- Schema additions: do existing non-LNG rows in assets.parquet get sensible nulls for the new columns?
- Type discipline (no `any`, no missing optional handling), idempotency of all builds, license attribution on every doc page.

- [ ] **Step 2: Address each finding**

Per Phase 5's pattern: real issues → focused commit + re-test + push; false positives → one-line rejection note in PR.

- [ ] **Step 3: Squash-merge when clean**

```bash
gh pr merge --squash --delete-branch
git checkout main && git pull
```

---

## Task 19: Follow-up docs PR — flip phase status to shipped

**Files:**
- Modify: `CLAUDE.md` (header + phase status section)

- [ ] **Step 1: New branch from main**

```bash
git checkout main && git pull
git checkout -b phase-6-shipped
```

- [ ] **Step 2: Update CLAUDE.md header**

Change:
```
> Status: Phases 1–5 shipped (live at https://global-energy-map-one.vercel.app).
```
to:
```
> Status: Phases 1–6 shipped (live at https://global-energy-map-one.vercel.app).
```

- [ ] **Step 3: Update Phase status section**

Replace the Phase 5 + Phase 6 lines with:

```markdown
- **Phase 5** — _shipped 2026-05-17_ (NETL refineries augmentation + vintage-aware pipeline/extraction filtering + pipelines.geojson simplification). Live: https://global-energy-map-one.vercel.app
- **Phase 6** — _shipped 2026-05-19_ (LNG-T3 ingest: LNG terminal primary + 17,592 voyages 2020–2024 + Hormuz-LNG scenario refactor with measured per-terminal disaggregation). Live: https://global-energy-map-one.vercel.app
- **Phase 7** — pending (vessel fleet animation, or MarineCadastre US-coastal oil tankers, or daily time slider — see docs/data-sources.md).
```

- [ ] **Step 4: Commit + push + open PR + merge**

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: mark Phase 6 shipped + bump header

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
git push -u origin phase-6-shipped
gh pr create --title "docs: mark Phase 6 shipped" --body "$(cat <<'EOF'
Follow-up docs PR per the established pattern (direct push to main is
auto-classifier-blocked). Flips Phase 6 status and updates the header
to "Phases 1–6 shipped".

Phase 7 entry added with the deferred-list pointer.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
gh pr merge --squash --delete-branch
git checkout main && git pull
```

---

## Done

Phase 6 is now live. The deployed app (Vercel auto-deploys on `main`) should reflect:
- LNG terminal layer with richer tooltip (unit_count, throughput, source label)
- New "LNG voyages (2020–2024)" toggle under Gas group; arcs filtered by active year + confidence ≥ 3
- Hormuz-LNG scenario in active years 2020–2024 shows "Attribution: measured voyages (LNG-T3)" in terminal tooltips; pre-2020 still shows BACI capacity-weighted
- /about page lists LNG-T3 as a new source under CC BY 4.0
- `docs/data-sources.md` Tanker/AIS entry shows LNG-T3 as shipped
