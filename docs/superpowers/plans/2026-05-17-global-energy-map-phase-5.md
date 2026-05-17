# Global Energy Map — Phase 5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three data-quality wins — pipelines.geojson simplified 5× (no Blob), refineries augmented from 168 to ~2,300 via NETL+OSM merge with proximity dedup, and pipelines + extraction sites become vintage-aware so the year slider has real effect on infrastructure layers.

**Architecture:** Slice 1 adds one shapely simplify step inside `scripts/transform/build_pipelines.py`. Slice 2 adds a new ingest wrapper (`scripts/ingest/netl_refineries.py`) and rewrites the transform (`scripts/transform/build_refineries.py`) to load NETL as primary, dedup OSM at 2 km haversine, and parse NETL's string capacity field. Slice 3 threads `year` down from `useUrlState` through `usePipelinesLayer` and `useExtractionPoints` and filters by `start_year`/`commissioned_year` (null-passes through). Scenario engine untouched. Catalog version bumps to 4.

**Tech Stack:** Same as Phases 1-4 — Next.js 16 App Router, React 19, TS strict, deck.gl 9, maplibre-gl 4, DuckDB-WASM, pnpm 10. Python (uv): httpx, pandas, geopandas, shapely, pyarrow, pytest. Spec: `docs/superpowers/specs/2026-05-17-global-energy-map-phase-5-design.md`.

**Branch:** Already on `phase-5` with the spec + `docs/data-sources.md` committed. All work continues on this branch; one bundled PR at the end.

---

## Task 1: Verify branch state

**Files:** none

- [ ] **Step 1: Verify you're on the phase-5 branch with spec + data-sources doc present**

```bash
cd /Users/narendranag/ai/global-energy-map
git branch --show-current
git log --oneline -3
ls docs/superpowers/specs/2026-05-17-global-energy-map-phase-5-design.md
ls docs/data-sources.md
```

Expected: branch is `phase-5`; recent commits include "docs(spec): add Phase 5 design" and "docs: add data-sources reference"; both files exist.

- [ ] **Step 2: Verify clean working tree**

```bash
git status
```

Expected: "nothing to commit, working tree clean".

---

## Task 2: Pipelines geometry simplification (Slice 1)

**Files:**
- Modify: `scripts/transform/build_pipelines.py:300-307` (the sidecar write block)

**Why:** Raw `pipelines.geojson` is 73 MB (over 25 MB ceiling). Simplify at tolerance 0.005 (~500 m) drops it to ~13 MB. Probe data: `simplify(0.005, preserve_topology=True)` → 13.0 MB; `0.01` → 12.3 MB; `0.05` → 11.4 MB. Pick 0.005 — highest fidelity that wins the budget.

- [ ] **Step 1: Locate the sidecar write block**

Open `scripts/transform/build_pipelines.py`. Find the block near line 300:

```python
    # GeoJSON sidecar — columns needed for map layer + tooltip
    geojson_cols = [
        "pipeline_id", "name", "status", "commodity",
        "capacity_kbpd", "capacity_unit", "start_country_iso3", "end_country_iso3",
        "operator", "start_year", "geometry",
    ]
    combined[geojson_cols].to_file(OUT_GEOJSON, driver="GeoJSON")
    print(f"wrote {OUT_GEOJSON} ({OUT_GEOJSON.stat().st_size // 1024} KB)")
```

- [ ] **Step 2: Add the simplification step before the sidecar write**

Replace that block with:

```python
    # GeoJSON sidecar — columns needed for map layer + tooltip.
    # Geometry is simplified to keep the sidecar under the 25 MB single-file
    # ceiling (raw ~73 MB → ~13 MB at tolerance 0.005, which corresponds to
    # roughly 500 m and is well below typical pixel resolution at country zoom).
    # Full-resolution geometry is preserved in pipelines.parquet.
    SIMPLIFY_TOLERANCE_DEG = 0.005
    geojson_cols = [
        "pipeline_id", "name", "status", "commodity",
        "capacity_kbpd", "capacity_unit", "start_country_iso3", "end_country_iso3",
        "operator", "start_year", "geometry",
    ]
    sidecar = combined[geojson_cols].copy()
    sidecar["geometry"] = sidecar.geometry.simplify(
        tolerance=SIMPLIFY_TOLERANCE_DEG, preserve_topology=True
    )
    sidecar.to_file(OUT_GEOJSON, driver="GeoJSON")
    print(
        f"wrote {OUT_GEOJSON} ({OUT_GEOJSON.stat().st_size // 1024} KB; "
        f"simplified at tolerance={SIMPLIFY_TOLERANCE_DEG})"
    )
```

- [ ] **Step 3: Re-run the transform**

```bash
uv run python -m scripts.transform.build_pipelines
```

Expected output ends with something like:
```
wrote public/data/pipelines.geojson (~13000 KB; simplified at tolerance=0.005)
```

- [ ] **Step 4: Verify file size**

```bash
ls -l public/data/pipelines.geojson
```

Expected: file is ≤ 15 MB (under both the 25 MB ceiling and GitHub's 50 MB warning).

- [ ] **Step 5: Run lint**

```bash
uv run ruff check scripts/transform/build_pipelines.py
```

Expected: no warnings.

- [ ] **Step 6: Commit**

```bash
git add scripts/transform/build_pipelines.py public/data/pipelines.geojson
git commit -m "$(cat <<'EOF'
Phase 5: simplify pipelines.geojson sidecar to clear 25 MB ceiling

shapely.simplify(tolerance=0.005, preserve_topology=True) drops the sidecar
from 73 MB to ~13 MB. Full-resolution geometry is preserved in
pipelines.parquet. No layer-side change.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: NETL refinery capacity parser (TDD)

**Files:**
- Create: `scripts/transform/_refinery_capacity.py` (new pure-function module)
- Create: `tests/python/test_refinery_capacity.py`

**Why:** NETL's `capacity` field is a string. Probe shows 343/355 (97%) are pure numbers like `"59000"` and 12/355 (3%) are HTML-wrapped like `"<table>...150,000 bpd crude capacity</td>..."`. Parser must handle both, return kbpd (numeric), and return None for unparseable / blank inputs.

- [ ] **Step 1: Write failing tests**

Create `tests/python/test_refinery_capacity.py`:

```python
"""Unit tests for NETL refinery capacity string parser."""
from __future__ import annotations

from scripts.transform._refinery_capacity import parse_netl_capacity_kbpd


def test_parses_pure_integer_as_bpd():
    # NETL stores numbers in bbl/d. 59000 bbl/d = 59 kbpd.
    assert parse_netl_capacity_kbpd("59000") == 59.0


def test_parses_pure_integer_with_commas():
    assert parse_netl_capacity_kbpd("150,000") == 150.0


def test_parses_html_wrapped_with_bpd_suffix():
    s = '<table width="300" border="0"><tr><td colspan="2">150,000 bpd crude capacity</td></tr></table>'
    assert parse_netl_capacity_kbpd(s) == 150.0


def test_parses_plain_bpd_suffix():
    assert parse_netl_capacity_kbpd("343,000 bpd crude capacity") == 343.0


def test_blank_returns_none():
    assert parse_netl_capacity_kbpd("") is None
    assert parse_netl_capacity_kbpd(" ") is None


def test_none_returns_none():
    assert parse_netl_capacity_kbpd(None) is None


def test_unparseable_returns_none():
    assert parse_netl_capacity_kbpd("n/a") is None
    assert parse_netl_capacity_kbpd("unknown") is None


def test_leading_trailing_whitespace_handled():
    assert parse_netl_capacity_kbpd("  59000  ") == 59.0
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
uv run pytest tests/python/test_refinery_capacity.py -v
```

Expected: `ModuleNotFoundError: No module named 'scripts.transform._refinery_capacity'` (module not yet created).

- [ ] **Step 3: Implement the parser**

Create `scripts/transform/_refinery_capacity.py`:

```python
"""Parse NETL Refineries `capacity` string field to numeric kbpd.

NETL stores capacities as strings in bbl/d.  Probe (Phase 5):
  * 97% of populated values are pure numbers like "59000" or "150,000"
  * 3% are HTML-wrapped: "<table>...150,000 bpd crude capacity</td>..."
  * Blank/whitespace/None/"n/a" → None
"""
from __future__ import annotations

import re

_HTML_TAG = re.compile(r"<[^>]+>")
_FIRST_NUMBER = re.compile(r"[\d,]+")


def parse_netl_capacity_kbpd(value: str | None) -> float | None:
    """Return capacity in kbpd, or None if value is blank/unparseable.

    Assumes input is bbl/d (consistent with probed NETL data ranging
    12k–323k, matching typical refinery throughputs in barrels/day).
    """
    if value is None:
        return None
    s = _HTML_TAG.sub("", value).strip()
    if not s:
        return None
    m = _FIRST_NUMBER.search(s)
    if not m:
        return None
    raw = m.group(0).replace(",", "")
    if not raw:
        return None
    try:
        bpd = float(raw)
    except ValueError:
        return None
    return bpd / 1000.0
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
uv run pytest tests/python/test_refinery_capacity.py -v
```

Expected: all 8 tests pass.

- [ ] **Step 5: Lint**

```bash
uv run ruff check scripts/transform/_refinery_capacity.py tests/python/test_refinery_capacity.py
```

Expected: no warnings.

- [ ] **Step 6: Commit**

```bash
git add scripts/transform/_refinery_capacity.py tests/python/test_refinery_capacity.py
git commit -m "$(cat <<'EOF'
Phase 5: add NETL refinery capacity string parser (TDD)

Pure function that handles both NETL capacity-string patterns (97% pure
numbers, 3% HTML-wrapped) and returns kbpd numeric or None.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Refinery dedup helper (TDD)

**Files:**
- Create: `scripts/transform/_refinery_dedup.py`
- Create: `tests/python/test_refinery_dedup.py`

**Why:** Probe shows 2 km is the empirical knee for OSM↔NETL dedup. Match at ≤ 2 km in same country = same facility (Joliet/Joliet 0.12 km, Pembroke 0.02 km). > 2 km = keep both. Pure function so it's unit-testable.

- [ ] **Step 1: Write failing tests**

Create `tests/python/test_refinery_dedup.py`:

```python
"""Unit tests for OSM↔NETL refinery proximity dedup."""
from __future__ import annotations

import pandas as pd

from scripts.transform._refinery_dedup import (
    DEDUP_THRESHOLD_KM,
    haversine_km,
    osm_records_not_in_netl,
)


def test_dedup_threshold_is_2km():
    assert DEDUP_THRESHOLD_KM == 2.0


def test_haversine_zero_distance():
    assert haversine_km(40.0, -74.0, 40.0, -74.0) == 0.0


def test_haversine_known_distance():
    # NYC (40.7128, -74.0060) ↔ LA (34.0522, -118.2437) ≈ 3935 km
    d = haversine_km(40.7128, -74.0060, 34.0522, -118.2437)
    assert 3920 < d < 3950


def test_osm_dropped_when_netl_within_2km_same_country():
    osm = pd.DataFrame([
        {"country_iso3": "USA", "lat": 41.4154, "lon": -88.1822, "name": "Joliet Refinery"},
    ])
    netl = pd.DataFrame([
        # NETL Joliet at virtually identical coords (~0.12 km away)
        {"country_iso3": "USA", "lat": 41.4163, "lon": -88.1815, "facility_n": "Joliet"},
    ])
    kept = osm_records_not_in_netl(osm, netl)
    assert len(kept) == 0


def test_osm_kept_when_netl_far_away():
    osm = pd.DataFrame([
        {"country_iso3": "DEU", "lat": 49.0558, "lon": 8.3447, "name": "MiRO"},
    ])
    netl = pd.DataFrame([
        {"country_iso3": "DEU", "lat": 53.5511, "lon": 9.9937, "facility_n": "Hamburg"},  # ~500 km away
    ])
    kept = osm_records_not_in_netl(osm, netl)
    assert len(kept) == 1
    assert kept.iloc[0]["name"] == "MiRO"


def test_osm_kept_when_netl_close_but_different_country():
    # Two refineries 1 km apart but in different countries — keep OSM
    osm = pd.DataFrame([
        {"country_iso3": "FRA", "lat": 49.0558, "lon": 8.3447, "name": "FR refinery"},
    ])
    netl = pd.DataFrame([
        {"country_iso3": "DEU", "lat": 49.0558, "lon": 8.3500, "facility_n": "DE refinery"},
    ])
    kept = osm_records_not_in_netl(osm, netl)
    assert len(kept) == 1


def test_empty_netl_keeps_all_osm():
    osm = pd.DataFrame([
        {"country_iso3": "USA", "lat": 41.0, "lon": -88.0, "name": "A"},
        {"country_iso3": "GBR", "lat": 51.0, "lon": -1.0, "name": "B"},
    ])
    netl = pd.DataFrame(columns=["country_iso3", "lat", "lon", "facility_n"])
    kept = osm_records_not_in_netl(osm, netl)
    assert len(kept) == 2


def test_empty_osm_returns_empty():
    osm = pd.DataFrame(columns=["country_iso3", "lat", "lon", "name"])
    netl = pd.DataFrame([
        {"country_iso3": "USA", "lat": 41.0, "lon": -88.0, "facility_n": "A"},
    ])
    kept = osm_records_not_in_netl(osm, netl)
    assert len(kept) == 0
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
uv run pytest tests/python/test_refinery_dedup.py -v
```

Expected: `ModuleNotFoundError: No module named 'scripts.transform._refinery_dedup'`.

- [ ] **Step 3: Implement the dedup helper**

Create `scripts/transform/_refinery_dedup.py`:

```python
"""Proximity dedup helper for OSM↔NETL refinery merge.

Probe (Phase 5) determined 2 km is the empirical knee for the same-country
nearest-neighbor distribution: matches ≤ 2 km are virtually always the same
facility, while > 2 km may legitimately be distinct neighbors (e.g., Marcus
Hook / Trainer in the Philadelphia refinery cluster).
"""
from __future__ import annotations

import numpy as np
import pandas as pd

DEDUP_THRESHOLD_KM: float = 2.0
EARTH_RADIUS_KM: float = 6371.0


def haversine_km(lat1: float, lon1: float, lat2_array, lon2_array) -> "np.ndarray | float":
    """Vectorized haversine distance in km. Either input may be a scalar or array."""
    lat1r = np.radians(lat1)
    lat2r = np.radians(lat2_array)
    dlat = lat2r - lat1r
    dlon = np.radians(np.asarray(lon2_array) - lon1)
    a = np.sin(dlat / 2) ** 2 + np.cos(lat1r) * np.cos(lat2r) * np.sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_KM * np.arcsin(np.sqrt(a))


def osm_records_not_in_netl(
    osm: pd.DataFrame,
    netl: pd.DataFrame,
    threshold_km: float = DEDUP_THRESHOLD_KM,
) -> pd.DataFrame:
    """Return the subset of OSM rows that have NO NETL counterpart within
    `threshold_km` in the SAME country.

    Both inputs must have columns: country_iso3, lat, lon.
    """
    if osm.empty:
        return osm.copy()
    if netl.empty:
        return osm.copy()

    keep_mask: list[bool] = []
    # Index NETL by country for fast lookup
    netl_by_country: dict[str, pd.DataFrame] = {
        iso3: grp for iso3, grp in netl.groupby("country_iso3")
    }

    for _, row in osm.iterrows():
        iso3 = row["country_iso3"]
        netl_in_country = netl_by_country.get(iso3)
        if netl_in_country is None or netl_in_country.empty:
            keep_mask.append(True)
            continue
        dists = haversine_km(
            row["lat"], row["lon"],
            netl_in_country["lat"].values,
            netl_in_country["lon"].values,
        )
        keep_mask.append(bool(np.all(dists > threshold_km)))

    return osm.loc[keep_mask].copy()
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
uv run pytest tests/python/test_refinery_dedup.py -v
```

Expected: all 7 tests pass.

- [ ] **Step 5: Lint**

```bash
uv run ruff check scripts/transform/_refinery_dedup.py tests/python/test_refinery_dedup.py
```

Expected: no warnings.

- [ ] **Step 6: Commit**

```bash
git add scripts/transform/_refinery_dedup.py tests/python/test_refinery_dedup.py
git commit -m "$(cat <<'EOF'
Phase 5: add OSM↔NETL refinery dedup helper (TDD)

Pure-function haversine + same-country nearest-neighbor predicate at the
2 km empirical knee from Phase 5 probe (Joliet/Joliet 0.12 km matches;
Marcus Hook/Trainer 2 km kept distinct).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: NETL country-name mapping for refineries

**Files:**
- Modify: `scripts/common/iso3.py` (add NETL refinery country names to `NETL_NAME_TO_ISO3`)

**Why:** NETL Refineries reports `md_country` in UN-style English names that differ from GEM ("United States of America" vs "USA", "Russian Federation" vs "Russia"). The Phase 4 `NETL_NAME_TO_ISO3` dict covers basins/storage/ports but may miss names that only appear in the Refineries layer. Probe and extend if needed.

- [ ] **Step 1: Inspect existing mapping**

```bash
grep -c '"' scripts/common/iso3.py | head -1
head -30 scripts/common/iso3.py
```

Expected: file contains source-specific dicts including `NETL_NAME_TO_ISO3`.

- [ ] **Step 2: Probe NETL Refineries country names**

```bash
uv run python -c "
import httpx
url = 'https://prod.arcgis.netl.doe.gov/server/rest/services/Hosted/Refineries/FeatureServer/0/query?where=1%3D1&outFields=md_country&f=pjson&returnDistinctValues=true&returnGeometry=false'
r = httpx.get(url, timeout=120).json()
names = sorted({(f['attributes'].get('md_country') or '').strip() for f in r.get('features', [])})
print(f'Distinct NETL refinery countries: {len(names)}')
for n in names:
    print(repr(n))
" > /tmp/netl_refinery_countries.txt
cat /tmp/netl_refinery_countries.txt
```

- [ ] **Step 3: Find any names missing from `NETL_NAME_TO_ISO3`**

```bash
uv run python -c "
from scripts.common.iso3 import NETL_NAME_TO_ISO3
with open('/tmp/netl_refinery_countries.txt') as f:
    lines = [l.strip().strip(\"'\") for l in f if l.startswith(\"'\")]
missing = [n for n in lines if n and n not in NETL_NAME_TO_ISO3]
print(f'Missing: {len(missing)}')
for m in missing:
    print(repr(m))
"
```

- [ ] **Step 4: Add missing entries to `NETL_NAME_TO_ISO3`**

If the missing list from Step 3 is non-empty, open `scripts/common/iso3.py` and append entries to the `NETL_NAME_TO_ISO3` dict using ISO 3166-1 alpha-3 codes. Example format (use the actual missing names from Step 3):

```python
    "Some Country Name": "XYZ",
```

If the list is empty, skip the edit and proceed to Step 5.

- [ ] **Step 5: Lint**

```bash
uv run ruff check scripts/common/iso3.py
```

Expected: no warnings.

- [ ] **Step 6: Commit (only if changes were made)**

```bash
git status
# If iso3.py is modified:
git add scripts/common/iso3.py
git commit -m "$(cat <<'EOF'
Phase 5: extend NETL_NAME_TO_ISO3 with refinery-layer country names

Names that appear only in the Refineries FeatureServer (not in Basins /
Storage / Ports already covered in Phase 4).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

If no changes, skip the commit (Step 3's empty result is itself the validation).

---

## Task 6: NETL Refineries ingest script

**Files:**
- Create: `scripts/ingest/netl_refineries.py`

**Why:** Thin wrapper around `scripts/common/netl.fetch_netl_layer` mirroring the Phase 4 pattern of `netl_basins.py` / `netl_storage.py` / `netl_ports.py`. Pulls all 2,272 refinery features as GeoJSON in EPSG:4326 to `data/raw/netl/refineries.geojson`.

- [ ] **Step 1: Write the ingest script**

Create `scripts/ingest/netl_refineries.py`:

```python
"""Ingest NETL GOGI Refineries layer.

Source: https://prod.arcgis.netl.doe.gov/server/rest/services/Hosted/Refineries/FeatureServer/0
License: US Government work, public domain (17 USC §105)
Expected feature count: ~2,272 points

Usage:
    uv run python -m scripts.ingest.netl_refineries
"""
from __future__ import annotations

import sys
from pathlib import Path

from scripts.common.netl import fetch_netl_layer

OUT = Path("data/raw/netl/refineries.geojson")
LAYER = "Refineries"


def main() -> None:
    print(f"Fetching NETL {LAYER}...", file=sys.stderr)
    count = fetch_netl_layer(LAYER, OUT)
    print(f"Wrote {OUT}  features={count}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run the ingest**

```bash
uv run python -m scripts.ingest.netl_refineries
```

Expected output:
```
Fetching NETL Refineries...
Wrote data/raw/netl/refineries.geojson  features=2272
```

(±5 features is fine — NETL data can drift slightly.)

- [ ] **Step 3: Verify the file exists with sensible size**

```bash
ls -l data/raw/netl/refineries.geojson
```

Expected: file is roughly 0.5–2 MB.

- [ ] **Step 4: Lint**

```bash
uv run ruff check scripts/ingest/netl_refineries.py
```

Expected: no warnings.

- [ ] **Step 5: Commit**

```bash
git add scripts/ingest/netl_refineries.py
git commit -m "$(cat <<'EOF'
Phase 5: NETL Refineries ingest wrapper

Thin wrapper on scripts.common.netl.fetch_netl_layer for the Refineries
FeatureServer (2,272 points). Mirrors Phase 4's netl_basins/storage/ports
scripts. Raw geojson lands in data/raw/netl/refineries.geojson (gitignored).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Rewrite build_refineries.py for NETL primary + OSM supplement

**Files:**
- Modify: `scripts/transform/build_refineries.py` (full rewrite of the loading + dedup logic; OSM helper code preserved as a function)

**Why:** Switch from "OSM only" to "NETL primary, OSM supplement at 2 km dedup". Output `assets.parquet` rows where `kind='refinery'` now have a `source` column ∈ {osm, netl} and capacity populated for the ~16% of NETL records with parseable strings.

The OSM filtering logic (REFINERY_NAME_KEYWORDS, _is_refinery, parse_capacity) stays — we still need to extract OSM refineries from the raw Overpass JSON. Only the merge stage changes.

- [ ] **Step 1: Replace the script with the NETL-primary + OSM-supplement build**

Open `scripts/transform/build_refineries.py` and replace its contents with:

```python
"""Transform NETL Refineries + OSM Overpass refineries → kind=refinery rows in assets.parquet.

NETL is the primary source (~2,272 features, government public-domain).
OSM is the supplement: any OSM refinery WITHOUT a NETL counterpart within
2 km in the same country is added.  See spec
docs/superpowers/specs/2026-05-17-global-energy-map-phase-5-design.md
for the empirical dedup threshold justification.

Country attribution:
  - NETL records: md_country → ISO3 via scripts.common.iso3.NETL_NAME_TO_ISO3.
  - OSM records: spatial join against public/data/countries.geojson.

Capacity:
  - NETL: parse string `capacity` field (97% pure numbers, 3% HTML-wrapped).
  - OSM:  parse `capacity` / `capacity:bpd` tags (existing behavior preserved).
  - Records without parseable capacity get NULL; scenario engine falls back
    to uniform-within-country attribution.

Output schema (matches existing assets.parquet shape, adds `source` column):
  asset_id, kind, name, country_iso3, lon, lat,
  capacity, capacity_unit, operator, status,
  commissioned_year, decommissioned_year,
  source, source_version

Usage:
    uv run python -m scripts.transform.build_refineries
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import geopandas as gpd
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
from shapely.geometry import Point

from scripts.common.iso3 import NETL_NAME_TO_ISO3
from scripts.transform._refinery_capacity import parse_netl_capacity_kbpd
from scripts.transform._refinery_dedup import osm_records_not_in_netl

OSM_CACHE = Path("data/raw/osm_refineries/refineries.json")
NETL_RAW = Path("data/raw/netl/refineries.geojson")
COUNTRIES = Path("public/data/countries.geojson")
ASSETS = Path("public/data/assets.parquet")

OSM_SOURCE = "OpenStreetMap (Overpass)"
NETL_SOURCE = "National Energy Technology Laboratory (US DOE) — GOGI Refineries"

# Reused from prior OSM-only implementation
REFINERY_NAME_KEYWORDS = [
    "refin", "raffinerie", "raffineri",
    "нпз", "нефтеперераб", "нафтопереробн",
    "oljraffinaderi", "petrokimia", "petrochemical",
    "refinaria", "rафинерия",
]


# ---------------------------------------------------------------------------
# OSM loader (preserved from prior implementation)
# ---------------------------------------------------------------------------

def _is_refinery_osm(element: dict) -> bool:
    tags = element.get("tags", {})
    ind = tags.get("industrial", "")
    name_haystack = (tags.get("name", "") + " " + tags.get("name:en", "")).lower()
    man_made = tags.get("man_made", "")
    etype = element["type"]

    if ind in ("oil_refinery", "refinery"):
        return True
    if ind == "oil":
        if any(kw in name_haystack for kw in REFINERY_NAME_KEYWORDS):
            return True
        if man_made == "works" and etype in ("way", "relation") and tags.get("name"):
            return True
    return False


def _parse_osm_capacity_kbpd(tags: dict[str, str]) -> float | None:
    """Best-effort parse of OSM capacity tags → kbpd (or None)."""
    candidates = [
        "capacity:bpd", "capacity_bpd", "oil:capacity:bpd",
        "production:bpd", "capacity", "capacity:oil",
        "capacity:production:oil",
    ]
    for k in candidates:
        v = tags.get(k)
        if not v:
            continue
        m = re.search(r"[\d.,]+", v)
        if not m:
            continue
        try:
            num = float(m.group(0).replace(",", ""))
        except ValueError:
            continue
        s = v.lower()
        if "kbpd" in s or "kb/d" in s or "kilo" in s:
            return num
        if "bpd" in s or "b/d" in s or "barrel" in s:
            return num / 1_000.0
        if "tpd" in s or "tonne" in s or "ton/" in s:
            return num * 7.33 / 1_000.0
        if num > 1_000:
            return num / 1_000.0
        return num
    return None


def _load_osm_refineries() -> pd.DataFrame:
    """Extract refinery rows from cached OSM Overpass response.

    Returns a DataFrame with columns: lon, lat, name, operator, capacity (kbpd),
    asset_id, source_version. Country attribution is added later via sjoin.
    """
    if not OSM_CACHE.exists():
        sys.exit(f"no OSM cache at {OSM_CACHE} — run scripts.ingest.osm_refineries first")
    data = json.load(OSM_CACHE.open())
    elements = data.get("elements", [])
    refinery_elements = [e for e in elements if _is_refinery_osm(e)]
    print(f"OSM: filtered {len(refinery_elements)} refineries from {len(elements)} elements",
          file=sys.stderr)

    rows = []
    for e in refinery_elements:
        tags = e.get("tags", {})
        if e["type"] == "node":
            lon, lat = e.get("lon"), e.get("lat")
        else:
            c = e.get("center", {})
            lon, lat = c.get("lon"), c.get("lat")
        if lon is None or lat is None:
            continue
        rows.append({
            "asset_id": f"osm/{e['type']}/{e['id']}",
            "name": tags.get("name") or tags.get("operator") or f"Refinery {e['id']}",
            "lon": float(lon),
            "lat": float(lat),
            "capacity": _parse_osm_capacity_kbpd(tags),
            "operator": tags.get("operator"),
            "source_version": data.get("_fetched_at", "unknown"),
        })
    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# NETL loader
# ---------------------------------------------------------------------------

def _load_netl_refineries() -> pd.DataFrame:
    """Load NETL Refineries from cached GeoJSON, parse capacities, attribute ISO3.

    Returns DataFrame with: asset_id, country_iso3, lon, lat, name, operator,
    capacity (kbpd|null), status (str|null), source_version.
    Records with unresolved country are dropped with a console warning.
    """
    if not NETL_RAW.exists():
        sys.exit(f"no NETL raw at {NETL_RAW} — run scripts.ingest.netl_refineries first")
    with NETL_RAW.open() as f:
        gj = json.load(f)
    feats = gj.get("features", [])
    print(f"NETL: loaded {len(feats)} features", file=sys.stderr)

    rows = []
    unresolved: dict[str, int] = {}
    for f in feats:
        props = f.get("properties", {})
        geom = f.get("geometry") or {}
        coords = geom.get("coordinates") or []
        if not coords or len(coords) < 2:
            continue
        lon, lat = float(coords[0]), float(coords[1])

        raw_country = (props.get("md_country") or "").strip()
        iso3 = NETL_NAME_TO_ISO3.get(raw_country)
        if iso3 is None:
            unresolved[raw_country] = unresolved.get(raw_country, 0) + 1
            continue

        fid = props.get("fid") or props.get("md_fkey") or f"netl_{len(rows)}"
        name = (props.get("facility_n") or "").strip()
        operator = (props.get("operator") or "").strip()
        # Label fallback: facility_n → operator → "Refinery"
        if not name:
            name = operator if operator else "Refinery"

        status = (props.get("status") or "").strip() or None

        rows.append({
            "asset_id": f"netl/{fid}",
            "country_iso3": iso3,
            "lon": lon,
            "lat": lat,
            "name": name,
            "operator": operator if operator else None,
            "capacity": parse_netl_capacity_kbpd(props.get("capacity")),
            "status": status,
            "source_version": gj.get("_fetched_at", "netl-gogi"),
        })

    if unresolved:
        print(f"NETL: skipped {sum(unresolved.values())} features with unresolved country names",
              file=sys.stderr)
        top_unresolved = sorted(unresolved.items(), key=lambda kv: -kv[1])[:10]
        for name, n in top_unresolved:
            print(f"  - {name!r}: {n}", file=sys.stderr)

    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    netl = _load_netl_refineries()
    print(f"NETL: kept {len(netl)} refineries (post-ISO3 attribution)", file=sys.stderr)

    osm = _load_osm_refineries()
    print(f"OSM: {len(osm)} raw rows (pre-country attribution)", file=sys.stderr)

    # OSM country attribution via spatial join (NETL already has country_iso3)
    osm_pts = gpd.GeoDataFrame(
        osm,
        geometry=[Point(xy) for xy in zip(osm.lon, osm.lat, strict=False)],
        crs="EPSG:4326",
    )
    countries = gpd.read_file(COUNTRIES)[["iso3", "geometry"]]
    osm_joined = gpd.sjoin(osm_pts, countries, how="left", predicate="within")
    osm["country_iso3"] = osm_joined["iso3"].values
    osm_before = len(osm)
    osm = osm.dropna(subset=["country_iso3"]).reset_index(drop=True)
    if osm_before != len(osm):
        print(f"OSM: dropped {osm_before - len(osm)} refineries with no country (offshore)",
              file=sys.stderr)

    # Dedup: drop OSM rows that have a NETL refinery within 2 km same country
    osm_kept = osm_records_not_in_netl(osm, netl)
    print(f"OSM: {len(osm_kept)} kept after dedup ({osm_before - len(osm_kept)} dropped or no-country)",
          file=sys.stderr)

    # Tag source
    netl_out = netl.copy()
    netl_out["source"] = NETL_SOURCE
    netl_out["status"] = netl_out["status"].fillna("operating")  # NETL status is sparse

    osm_out = osm_kept.copy()
    osm_out["source"] = OSM_SOURCE
    osm_out["status"] = "operating"

    # Combine + enforce schema
    refineries = pd.concat([netl_out, osm_out], ignore_index=True)
    refineries["kind"] = "refinery"
    refineries["capacity_unit"] = refineries["capacity"].apply(
        lambda v: "kbpd" if pd.notna(v) else None
    )
    refineries["commissioned_year"] = pd.Series([pd.NA] * len(refineries), dtype=pd.Int64Dtype())
    refineries["decommissioned_year"] = pd.Series([pd.NA] * len(refineries), dtype=pd.Int64Dtype())

    schema_cols = [
        "asset_id", "kind", "name", "country_iso3", "lon", "lat",
        "capacity", "capacity_unit", "operator", "status",
        "commissioned_year", "decommissioned_year",
        "source", "source_version",
    ]
    # Type discipline matching existing assets.parquet schema
    refineries["capacity"] = refineries["capacity"].astype("Float64")
    refineries["capacity_unit"] = refineries["capacity_unit"].astype(pd.StringDtype())
    refineries["operator"] = refineries["operator"].astype(pd.StringDtype())
    refineries["status"] = refineries["status"].astype(pd.StringDtype())
    refineries["source"] = refineries["source"].astype(pd.StringDtype())
    refineries["source_version"] = refineries["source_version"].astype(pd.StringDtype())
    refineries = refineries[schema_cols]

    # Idempotent: drop prior refinery rows, append new
    existing = pd.read_parquet(ASSETS)
    n_before = len(existing)
    existing = existing[existing["kind"] != "refinery"]
    n_kept = len(existing)
    if n_before != n_kept:
        print(f"dropped {n_before - n_kept} stale refinery rows from assets.parquet",
              file=sys.stderr)

    combined = pd.concat([existing, refineries], ignore_index=True)
    pq.write_table(
        pa.Table.from_pandas(combined, preserve_index=False),
        ASSETS,
        compression="zstd",
    )

    counts = combined.groupby("kind").size().to_dict()
    cap_coverage = refineries["capacity"].notna().sum()
    by_source = refineries.groupby("source").size().to_dict()
    print(
        f"wrote {ASSETS}  rows={len(combined)}  by_kind={counts}"
    )
    print(f"  refinery sources: {by_source}")
    print(f"  refinery capacity coverage: {cap_coverage}/{len(refineries)}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run the transform**

```bash
uv run python -m scripts.transform.build_refineries
```

Expected output:
- NETL loads ~2,272 features
- NETL keeps ~2,200+ after ISO3 attribution (some unresolved countries get skipped)
- OSM ~168 raw, mostly kept after sjoin
- OSM dedup drops ~80 (the ones within 2 km of NETL), keeps ~80–100
- Final refinery row count: roughly 2,250–2,350
- Capacity coverage: roughly 16% of NETL = ~360 + most of OSM that had capacity = ~360 total

If the output looks wildly off (e.g., 0 refineries kept, or thousands more than expected), abort and investigate before continuing.

- [ ] **Step 3: Spot-check the output**

```bash
uv run python -c "
import pandas as pd
a = pd.read_parquet('public/data/assets.parquet')
r = a[a['kind']=='refinery']
print(f'refineries: {len(r)}')
print(f\"by source: {r['source'].value_counts().to_dict()}\")
print(f'capacity populated: {r[\"capacity\"].notna().sum()} / {len(r)}')
print(f'top 5 countries: {r[\"country_iso3\"].value_counts().head(5).to_dict()}')
# Sample a NETL row and an OSM row
print()
print('NETL sample:')
netl_sample = r[r['source'].str.contains('NETL', na=False)].head(2)
print(netl_sample[['asset_id','name','country_iso3','capacity','operator']].to_string())
print()
print('OSM sample:')
osm_sample = r[r['source'].str.contains('OpenStreetMap', na=False)].head(2)
print(osm_sample[['asset_id','name','country_iso3','capacity','operator']].to_string())
"
```

Expected: NETL rows have asset_id starting with `netl/`, OSM rows have `osm/...`. Capacity is populated for some NETL rows. Major refining countries (USA, RUS, CHN, IND, SAU) show high counts.

- [ ] **Step 4: Lint**

```bash
uv run ruff check scripts/transform/build_refineries.py
```

Expected: no warnings.

- [ ] **Step 5: Commit**

```bash
git add scripts/transform/build_refineries.py public/data/assets.parquet
git commit -m "$(cat <<'EOF'
Phase 5: rewrite build_refineries — NETL primary, OSM supplement

NETL Refineries (2272) becomes the primary source; OSM refineries
without a NETL match within 2 km same country are appended as
supplements with source='OpenStreetMap (Overpass)'. NETL capacity
strings are parsed via the unit-tested parser. 13× coverage upgrade
over OSM-only; capacity coverage rises from 0% to ~16%.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: catalog.json bump + parser allowlist

**Files:**
- Modify: `public/data/catalog.json`
- Modify: `src/lib/data-catalog/index.ts` (version validator allowlist)

**Why:** Phase 5 adds NETL Refineries as a source. Catalog bumps to version 4; client-side parser must accept v4.

- [ ] **Step 1: Update catalog.json**

Open `public/data/catalog.json`. Change `"version": 3` to `"version": 4`. Inside the `"entries"` array, add a new entry **before** the existing `netl_gogi` entry (keep entries logically grouped by source family). Insert:

```json
    {
      "id": "netl_refineries",
      "label": "Oil refineries (NETL GOGI)",
      "path": "/data/assets.parquet",
      "format": "parquet",
      "source_name": "National Energy Technology Laboratory (US DOE)",
      "source_url": "https://prod.arcgis.netl.doe.gov/server/rest/services/Hosted/Refineries/FeatureServer",
      "license": "US Government work, public domain (17 USC §105)",
      "as_of": "2026-05-17",
      "layers": ["refineries"]
    },
```

Also update the existing `osm_refineries` entry's `label` to clarify its supplementary role:

```json
    {
      "id": "osm_refineries",
      "label": "Oil refineries (OpenStreetMap, supplement to NETL)",
      ...
    },
```

And update the `as_of` on the `gem_oil_pipelines` entry to today (since pipelines.geojson was regenerated in Task 2): change its `"as_of"` to `"2026-05-17"`.

- [ ] **Step 2: Update the version validator**

Open `src/lib/data-catalog/index.ts`. Find the version validator (the spot that accepts 1, 2, 3). Extend to accept 4. Example: if it currently reads `if (version !== 1 && version !== 2 && version !== 3)`, change to include `version !== 4`. If it uses an array like `[1, 2, 3]`, change to `[1, 2, 3, 4]`.

```bash
grep -n "version" src/lib/data-catalog/index.ts
```

Use the grep output to locate the exact lines; the existing pattern from prior phases is the model.

- [ ] **Step 3: Verify catalog parses**

```bash
pnpm vitest run tests/unit/data-catalog --reporter=dot 2>&1 | tail -10 || true
pnpm build 2>&1 | tail -20
```

Expected: build completes without "unknown catalog version" errors. (If there are no existing data-catalog vitest tests, just rely on the build.)

- [ ] **Step 4: Lint**

```bash
pnpm lint
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add public/data/catalog.json src/lib/data-catalog/index.ts
git commit -m "$(cat <<'EOF'
Phase 5: catalog.json v4 + NETL refineries entry

Adds netl_refineries source entry (US Government public domain),
reframes osm_refineries label as supplement, bumps gem_oil_pipelines
as_of to reflect the simplified sidecar. Parser allowlist extended.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Vintage filter predicate (TDD, TS side)

**Files:**
- Create: `src/lib/vintage/filter.ts`
- Create: `tests/unit/vintage-filter.test.ts`

**Why:** Pure predicate used by both PipelinesLayer and ExtractionPoints. Null vintage = always visible; vintage ≤ year = visible; vintage > year = hidden. Centralizing keeps both layers consistent.

- [ ] **Step 1: Write failing tests**

Create `tests/unit/vintage-filter.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { isVisibleAtYear } from "@/lib/vintage/filter";

describe("isVisibleAtYear", () => {
  it("returns true when vintage is null (always visible)", () => {
    expect(isVisibleAtYear(null, 1990)).toBe(true);
    expect(isVisibleAtYear(null, 2020)).toBe(true);
  });

  it("returns true when vintage is undefined", () => {
    expect(isVisibleAtYear(undefined, 1990)).toBe(true);
  });

  it("returns true when vintage equals year", () => {
    expect(isVisibleAtYear(1990, 1990)).toBe(true);
  });

  it("returns true when vintage is before year", () => {
    expect(isVisibleAtYear(1985, 1990)).toBe(true);
    expect(isVisibleAtYear(1900, 2020)).toBe(true);
  });

  it("returns false when vintage is after year", () => {
    expect(isVisibleAtYear(2020, 1990)).toBe(false);
    expect(isVisibleAtYear(2010, 2009)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm vitest run tests/unit/vintage-filter.test.ts
```

Expected: "Cannot find module @/lib/vintage/filter" or similar.

- [ ] **Step 3: Implement the predicate**

Create `src/lib/vintage/filter.ts`:

```typescript
/**
 * Vintage filter for time-aware infrastructure layers.
 *
 * Returns true if a feature should be visible in the active year:
 *   - vintage is null/undefined → always visible (preserves current
 *     behavior for features without a known build year, ~29% of pipelines
 *     and ~78% of extraction sites in the current dataset).
 *   - vintage <= year → visible (feature existed by the active year).
 *   - vintage  > year → hidden (feature is from the future).
 */
export function isVisibleAtYear(
  vintage: number | null | undefined,
  year: number,
): boolean {
  if (vintage == null) return true;
  return vintage <= year;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm vitest run tests/unit/vintage-filter.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 5: Lint**

```bash
pnpm lint
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/vintage/filter.ts tests/unit/vintage-filter.test.ts
git commit -m "$(cat <<'EOF'
Phase 5: add vintage filter predicate (TDD)

Pure function used by PipelinesLayer and ExtractionPoints to filter
features by build year. Null vintage = always visible, preserves
behavior for features without dates (29% of pipelines, 78% of sites).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Pipelines layer becomes year-aware

**Files:**
- Modify: `src/components/layers/PipelinesLayer.tsx`

**Why:** PipelinesLayer accepts a `year` prop; filters features whose `start_year` is after the active year (null pass-through). The hook already has a fetched-once cache + per-instance filtering for `commodityFilter`; year filtering composes with that.

- [ ] **Step 1: Add `year` to the input interface and effect dependencies**

Open `src/components/layers/PipelinesLayer.tsx`. Modify the input interface:

```typescript
export interface PipelinesLayerInput {
  readonly visible: boolean;
  readonly commodityFilter?: "crude" | "gas"; // when set, only render features of this commodity
  readonly id?: string;                        // optional id override so we can mount two layers
  readonly year: number;                       // active year — filter out pipelines built after Y
}
```

Note: making `year` required (non-optional) forces callers to wire it up and surfaces missing-wiring at compile time.

- [ ] **Step 2: Import the predicate**

At the top of the file, add:

```typescript
import { isVisibleAtYear } from "@/lib/vintage/filter";
```

- [ ] **Step 3: Apply the year filter when building the layer**

Find the block (around line 85-90) that does:

```typescript
        const features = commodityFilter
          ? fc.features.filter((f) => f.properties.commodity === commodityFilter)
          : fc.features;
        const filtered = { ...fc, features };
```

Replace with:

```typescript
        const features = fc.features.filter((f) => {
          if (commodityFilter && f.properties.commodity !== commodityFilter) {
            return false;
          }
          return isVisibleAtYear(f.properties.start_year, year);
        });
        const filtered = { ...fc, features };
```

- [ ] **Step 4: Update the boolean back-compat handler to require year**

The hook currently supports `usePipelinesLayer(true)` for back-compat. Since `year` is now required, remove the boolean back-compat. Replace:

```typescript
export function usePipelinesLayer(input: PipelinesLayerInput | boolean): GeoJsonLayer | null {
  const cfg: PipelinesLayerInput =
    typeof input === "boolean" ? { visible: input } : input;
  const { visible, commodityFilter, id } = cfg;
```

with:

```typescript
export function usePipelinesLayer(input: PipelinesLayerInput): GeoJsonLayer | null {
  const { visible, commodityFilter, id, year } = input;
```

- [ ] **Step 5: Add `year` to the effect dependency array**

Find the existing `}, [visible, commodityFilter, id]);` and change to:

```typescript
  }, [visible, commodityFilter, id, year]);
```

- [ ] **Step 6: Verify TS compiles (page.tsx will fail temporarily — that's fine, Task 12 wires it)**

```bash
pnpm tsc --noEmit 2>&1 | head -20
```

Expected: errors complaining that `page.tsx` doesn't pass `year` to `usePipelinesLayer`. That's the next task. No errors inside `PipelinesLayer.tsx` itself.

- [ ] **Step 7: DO NOT commit yet** — wait for Tasks 11+12 to wire year through.

---

## Task 11: Extraction points layer becomes year-aware

**Files:**
- Modify: `src/components/layers/ExtractionPoints.tsx`

**Why:** Same shape as Task 10 but for extraction sites. The layer currently accepts no input; needs a `{ year }` argument.

- [ ] **Step 1: Restructure the hook signature**

Open `src/components/layers/ExtractionPoints.tsx`. Replace its contents with:

```typescript
"use client";
import { useEffect, useState } from "react";
import { ScatterplotLayer } from "@deck.gl/layers";
import { query } from "@/lib/duckdb/query";
import { isVisibleAtYear } from "@/lib/vintage/filter";

interface AssetRow extends Record<string, unknown> {
  asset_id: string;
  name: string;
  country_iso3: string;
  lon: number;
  lat: number;
  capacity: number | null;
  operator: string | null;
  status: string | null;
  commissioned_year: number | null;
}

export interface ExtractionPointsInput {
  readonly year: number;
}

export function useExtractionPoints({ year }: ExtractionPointsInput) {
  const [layer, setLayer] = useState<ScatterplotLayer<AssetRow> | null>(null);
  useEffect(() => {
    const ctrl = { cancelled: false };
    void (async () => {
      const res = await query<AssetRow>(
        `SELECT asset_id, name, country_iso3, lon, lat, capacity, operator, status,
                commissioned_year
         FROM read_parquet('/data/assets.parquet')
         WHERE kind = 'extraction_site'`,
      );
      if (ctrl.cancelled) return;
      const filtered = (res.rows as AssetRow[]).filter((r) =>
        isVisibleAtYear(r.commissioned_year, year),
      );
      const l = new ScatterplotLayer<AssetRow>({
        id: "extraction",
        data: filtered,
        getPosition: (d) => [d.lon, d.lat],
        getRadius: (d) => 2_500 + Math.sqrt(Math.max(0, d.capacity ?? 0)) * 1_500,
        radiusUnits: "meters",
        radiusMinPixels: 1.5,
        radiusMaxPixels: 8,
        getFillColor: [220, 60, 40, 180],
        stroked: true,
        getLineColor: [40, 20, 10, 220],
        lineWidthMinPixels: 0.5,
        pickable: true,
      });
      setLayer(l);
    })();
    return () => {
      ctrl.cancelled = true;
    };
  }, [year]);
  return layer;
}
```

- [ ] **Step 2: Verify TS compiles (page.tsx still pending wire-up)**

```bash
pnpm tsc --noEmit 2>&1 | head -20
```

Expected: errors only in `page.tsx` about `useExtractionPoints()` being called without arguments. No errors in `ExtractionPoints.tsx`.

- [ ] **Step 3: DO NOT commit yet** — Task 12 wires the page.

---

## Task 12: Wire year into PipelinesLayer + ExtractionPoints in page.tsx

**Files:**
- Modify: `src/app/page.tsx`

**Why:** Pass the active `year` (already destructured from `useUrlState`) down to both layer hooks.

- [ ] **Step 1: Pass `year` to the three `usePipelinesLayer` calls**

Open `src/app/page.tsx`. Find the three calls (lines ~73-82):

```typescript
  const oilPipes = usePipelinesLayer({
    visible: layers.pipelines,
    commodityFilter: "crude",
    id: "pipelines-crude",
  });
  const gasPipes = usePipelinesLayer({
    visible: layers.gas_pipelines,
    commodityFilter: "gas",
    id: "pipelines-gas",
  });
```

Change to (add `year`):

```typescript
  const oilPipes = usePipelinesLayer({
    visible: layers.pipelines,
    commodityFilter: "crude",
    id: "pipelines-crude",
    year,
  });
  const gasPipes = usePipelinesLayer({
    visible: layers.gas_pipelines,
    commodityFilter: "gas",
    id: "pipelines-gas",
    year,
  });
```

- [ ] **Step 2: Pass `year` to `useExtractionPoints`**

Find:

```typescript
  const extraction = useExtractionPoints();
```

Change to:

```typescript
  const extraction = useExtractionPoints({ year });
```

- [ ] **Step 3: Verify TS compiles cleanly**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Run unit tests**

```bash
pnpm test
```

Expected: all unit tests pass.

- [ ] **Step 5: Lint**

```bash
pnpm lint
```

Expected: no errors.

- [ ] **Step 6: Commit Tasks 10, 11, 12 together**

```bash
git add src/components/layers/PipelinesLayer.tsx src/components/layers/ExtractionPoints.tsx src/app/page.tsx
git commit -m "$(cat <<'EOF'
Phase 5: vintage-aware filtering for pipelines + extraction sites

PipelinesLayer and ExtractionPoints accept an active year prop and
filter features by start_year (pipelines, 71% coverage) and
commissioned_year (extraction sites, 22% coverage). Features without
dates pass through (always visible) — preserves prior behavior for
unmapped features. Refineries/LNG/storage/ports have no vintage data
in source and remain year-independent.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Methodology page updates

**Files:**
- Modify: `docs/methodology.md`

**Why:** Document Phase 5 changes — refinery augmentation, vintage filter caveats, simplified pipelines sidecar.

- [ ] **Step 1: Append a Phase 5 section**

Open `docs/methodology.md`. After the existing Phase 4 section (around line 147), append:

```markdown
## Phase 5 — Data quality polish

Phase 5 strengthens existing layers with three independent improvements: pipeline sidecar simplification, NETL refineries augmentation, and vintage-aware time filtering. No new commodity, no new scenarios.

### NETL Refineries augmentation

Source: **NETL Global Oil & Gas Infrastructure (US Department of Energy)** — `Refineries` FeatureServer. License: US Government work, public domain (17 USC §105). Adds ~2,272 refineries to the existing 168 OpenStreetMap features.

NETL is the primary source; OpenStreetMap is the supplement. For each OSM refinery, the build checks whether any NETL refinery falls within 2 km in the same country — if yes, the OSM record is dropped (NETL covers it). The 2 km threshold is the empirical knee of the OSM↔NETL nearest-neighbor distance distribution: matches ≤ 2 km are virtually always the same facility (Joliet/Joliet 0.12 km, Pembroke 0.02 km), while > 2 km may legitimately be distinct neighbors (e.g., Marcus Hook / Trainer in the Philadelphia refinery cluster).

NETL's `capacity` field is a string. A parser (`scripts/transform/_refinery_capacity.py`) handles both observed patterns — 97% pure numbers (e.g., `"59000"`) and 3% HTML-wrapped (e.g., `"<td>150,000 bpd crude capacity</td>"`). Unparseable / blank values produce NULL capacity; the scenario engine falls back to uniform-within-country attribution.

`source` column added to refinery rows: `"National Energy Technology Laboratory (US DOE) — GOGI Refineries"` or `"OpenStreetMap (Overpass)"`.

Capacity coverage improves from 0% (OSM-only) to ~16% (NETL's populated subset). Geographic skew shifts from OECD-heavy (OSM bias) toward global coverage (NETL includes major refineries in China, India, Saudi Arabia, South Korea that OSM under-tags).

### Vintage-aware time filtering

Pipelines and extraction sites become time-aware: the year slider now hides features whose build year is after the active year. A pipeline built in 2020 no longer appears on the 1990 map; an extraction site commissioned in 2015 no longer appears in 1990.

Coverage of vintage data in source:

| Layer | Vintage field | Populated |
|---|---|---|
| Oil + gas pipelines | `start_year` | 71% |
| Extraction sites | `commissioned_year` | 22% |
| Refineries | — | 0% |
| LNG terminals | — | 0% |
| Storage hubs | — | 0% |
| Ports | — | 0% |

Features without populated vintage data appear in all years (preserves prior behavior). The 29% of pipelines and 78% of extraction sites without dates are always-visible regardless of slider position. Refineries, LNG terminals, storage hubs, and ports have no vintage data in source and remain always-visible.

`decommissioned_year` is 0% populated across all asset types; no decommission filtering is applied.

### Pipelines GeoJSON sidecar simplification

`public/data/pipelines.geojson` is simplified at `tolerance=0.005` (Shapely `simplify(tol, preserve_topology=True)`, corresponding to roughly 500 m in lon/lat units). This reduces the sidecar from ~73 MB to ~13 MB, clearing the 25 MB single-file ceiling without requiring Vercel Blob hosting. Full-resolution geometry is preserved in `pipelines.parquet`.

```

- [ ] **Step 2: Commit**

```bash
git add docs/methodology.md
git commit -m "$(cat <<'EOF'
Phase 5: methodology page — refinery augmentation + vintage filter + simplification

Documents the NETL Refineries augmentation strategy with the 2 km dedup
threshold rationale, vintage-data coverage table for all layers, and the
geometry simplification cut.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Update CLAUDE.md schema table + data sources row

**Files:**
- Modify: `CLAUDE.md`

**Why:** CLAUDE.md is the controller-facing onboarding doc. Its "Data sources" table needs the NETL Refineries row (currently shows OSM only) and the schema table needs the new `source` column on refineries.

- [ ] **Step 1: Update the data sources table**

Open `CLAUDE.md`. Find the data sources table (around line 132–142). Replace the existing refinery row:

```
| Refineries | OpenStreetMap (Overpass) | **ODbL** | Phase 2 — 168 features; uniform-within-country fallback (no OSM capacity data) |
```

with:

```
| Refineries | NETL GOGI (primary) + OpenStreetMap (supplement) | Public domain / ODbL | Phase 5 — NETL ~2,272 + OSM-only ~80–100 after 2 km dedup; NETL capacity parsed for ~16% |
```

- [ ] **Step 2: Update the schema table comment for assets**

The `asset` row currently lists `kind (extraction_site, refinery, lng_export, lng_import, storage, port)`. Leave the row but add a sentence after the schema table about the new `source` column:

Find the asset row in the schema table:

```
| `asset` | asset_id, kind (extraction_site, refinery, lng_export, lng_import, storage, port), name, iso3, lon, lat, capacity, capacity_unit, ... | GEM trackers + OpenStreetMap + NETL GOGI |
```

Update to include `source` column hint and reflect the new NETL refineries source:

```
| `asset` | asset_id, kind (extraction_site, refinery, lng_export, lng_import, storage, port), name, iso3, lon, lat, capacity, capacity_unit, source, ... | GEM trackers + NETL GOGI + OpenStreetMap |
```

- [ ] **Step 3: DO NOT flip phase status to shipped yet**

Phase status flip ("Phase 5 — shipped 2026-05-17") goes in a follow-up docs PR after the main bundle merges. Direct push to main is auto-classifier-blocked; the docs flip uses the same pattern as Phases 2/3/4.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
Phase 5: CLAUDE.md — refineries source + assets.source column

Refineries row now reflects NETL-primary + OSM-supplement merge.
Schema table mentions the new `source` column on assets.parquet.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: Build + smoke test

**Files:** none (verification only)

- [ ] **Step 1: Full lint**

```bash
pnpm lint
uv run ruff check scripts/ tests/
```

Expected: no errors from either.

- [ ] **Step 2: Run all unit tests**

```bash
pnpm test
uv run pytest tests/python -v
```

Expected: all tests pass.

- [ ] **Step 3: Production build**

```bash
pnpm build 2>&1 | tail -20
```

Expected: build succeeds; no SSR errors; bundle sizes reasonable.

- [ ] **Step 4: Boot dev server and visually smoke-test (optional but recommended if a browser is available)**

```bash
pnpm dev &
DEV_PID=$!
sleep 8
curl -s http://localhost:3000 > /dev/null && echo "OK"
kill $DEV_PID
```

If you have a browser: open `http://localhost:3000`, move year slider to 1990 → confirm pipelines built post-1990 disappear; slide back to 2020 → all visible. Hover a refinery → tooltip shows `source` field implicitly via capacity coverage.

- [ ] **Step 5: Verify git state is clean**

```bash
git status
git log --oneline phase-5 -20
```

Expected: clean tree; ~10–13 commits on the branch since the spec commit.

---

## Task 16: Push branch + open PR

**Files:** none

- [ ] **Step 1: Push the branch**

```bash
git push -u origin phase-5
```

- [ ] **Step 2: Open a PR against main**

```bash
gh pr create --title "Phase 5: NETL refineries augmentation + vintage filter + pipelines simplify" --body "$(cat <<'EOF'
## Summary

- **Pipelines sidecar simplified** — `pipelines.geojson` from 73 MB to ~13 MB via Shapely `simplify(0.005, preserve_topology=True)`. No Vercel Blob needed. Full-resolution geometry preserved in `pipelines.parquet`.
- **NETL Refineries augmentation** — adds ~2,272 NETL refineries (US Gov public domain) alongside the 168 OSM features. NETL is primary; OSM kept only where NETL has no match within 2 km in the same country. NETL capacity strings parsed via TDD'd helper (97% pure numbers, 3% HTML-wrapped patterns). New `source` column on refinery rows. Capacity coverage rises 0% → ~16%.
- **Vintage-aware filtering** — `PipelinesLayer` and `ExtractionPoints` accept an active `year` prop; features built after the year are hidden. Null vintage = always visible (preserves prior behavior for the 29% of pipelines and 78% of extraction sites without dates). Refineries / LNG / storage / ports have no vintage data and stay year-independent.
- **Docs** — new `docs/data-sources.md` researcher-oriented inventory of in-production + evaluated-and-rejected + Phase 6+ candidate sources. Methodology page documents Phase 5 changes with worked examples. CLAUDE.md schema + sources tables updated.
- **Out of scope (deferred via probe)** — GOIT XLSX refresh (GeoJSON has all analytical content), NETL LNG merge (1.2% capacity coverage, no import/export discriminant), Vercel Blob (simplification clears ceiling), per-basin attribution (per user directive — no temporal support globally).

Spec: `docs/superpowers/specs/2026-05-17-global-energy-map-phase-5-design.md`
Plan: `docs/superpowers/plans/2026-05-17-global-energy-map-phase-5.md`

## Test plan

- [x] Capacity parser unit tests (8 cases, all patterns from probe)
- [x] Refinery dedup unit tests (7 cases incl. cross-country, empty inputs)
- [x] Vintage filter unit tests (5 cases incl. null/undefined/edges)
- [x] `pnpm lint` clean
- [x] `pnpm test` + `uv run pytest` all pass
- [x] `pnpm build` succeeds
- [x] `pipelines.geojson` ≤ 15 MB
- [x] `assets.parquet` refinery row count is roughly 2,300 with `source` column populated
- [x] Catalog v4 parses

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Return the PR URL.

---

## Task 17: Final whole-implementation code review

**Files:** none (review only — addresses any reviewer findings)

- [ ] **Step 1: Dispatch a code-quality reviewer subagent (Opus)** to audit the full Phase 5 diff against `main`.

Use the controller's subagent dispatch to run a thorough review with Opus targeted at the full diff. The review should look at:
- Correctness of the NETL capacity parser edge cases
- Correctness of the haversine + dedup logic (no false negatives that would over-collapse the dataset)
- TS strict mode discipline (no `any`, no missing optionals)
- Idempotency of the build_refineries rewrite
- catalog.json schema sanity (versioning, all required fields)
- Vintage filter behavior on edge cases (year 1989 vs 1990 boundary)
- Any TS errors or lint warnings the prior tasks may have missed

- [ ] **Step 2: Address each reviewer finding**

For each finding that's a real issue:
1. Make the fix in a focused commit.
2. Re-run the relevant tests / lint.
3. Push the fix to the `phase-5` branch.

If a finding is a false-positive, write a one-line rejection note in the PR body explaining why.

- [ ] **Step 3: When all findings are addressed, mark the PR ready and squash-merge**

```bash
gh pr merge --squash --delete-branch
```

After merge:
```bash
git checkout main
git pull
git branch -D phase-5  # (already deleted on remote, just drop the local ref if it survived)
```

---

## Task 18: Follow-up docs PR — flip phase status to shipped

**Files:**
- Modify: `CLAUDE.md` (header + phase status section)

**Why:** Direct push to main is auto-classifier-blocked (every prior phase flipped status via a small follow-up PR). This task creates the trailing PR.

- [ ] **Step 1: From `main`, create a new branch**

```bash
git checkout main && git pull
git checkout -b phase-5-shipped
```

- [ ] **Step 2: Update the CLAUDE.md header**

Open `CLAUDE.md`. Change the second line of the project intro from:

```
> Status: Phases 1–4 shipped (live at https://global-energy-map-one.vercel.app).
```

to:

```
> Status: Phases 1–5 shipped (live at https://global-energy-map-one.vercel.app).
```

- [ ] **Step 3: Update the "Phase status" section at the bottom**

Find the Phase status section. Add the Phase 5 line after Phase 4 and update Phase 5 from "pending" to "shipped". The result should look like:

```markdown
- **Phase 4** — _shipped 2026-05-17_ (NETL basins + storage + ports + shareable URL state). Live: https://global-energy-map-one.vercel.app
- **Phase 5** — _shipped 2026-05-17_ (NETL refineries augmentation + vintage-aware pipeline/extraction filtering + pipelines.geojson simplification). Live: https://global-energy-map-one.vercel.app
- **Phase 6** — pending (EIA STEO US shale basin time series, or coal + cross-commodity scenarios, or tankers/AIS — see docs/data-sources.md).
```

- [ ] **Step 4: Commit + open PR**

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: mark Phase 5 shipped + bump header

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
git push -u origin phase-5-shipped
gh pr create --title "docs: mark Phase 5 shipped" --body "$(cat <<'EOF'
Follow-up docs PR per the established pattern (direct push to main is
auto-classifier-blocked). Flips Phase 5 status and updates the header to
"Phases 1–5 shipped."

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: Merge the follow-up**

```bash
gh pr merge --squash --delete-branch
git checkout main && git pull
```

---

## Done

Phase 5 is now live. The deployed app (Vercel auto-deploys on `main`) should reflect:
- Pipelines render at simplified resolution but visually unchanged at world/continent zoom
- Year slider visibly affects pipelines + extraction sites
- ~2,300 refineries instead of 168 (most pronounced in China, India, Saudi Arabia, Russia, USA)
- `/about` page lists NETL Refineries as a new source
- `docs/data-sources.md` is the new researcher-facing reference
