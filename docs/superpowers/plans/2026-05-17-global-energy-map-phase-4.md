# Global Energy Map — Phase 4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship three NETL GOGI layers (basin polygons, oil/gas storage hubs, oil/gas ports) plus shareable URL state (year + commodity + scenario + visible layers in the querystring, replace-on-change).

**Architecture:** A single shared NETL REST helper (`scripts/common/netl.py`) handles pagination + EPSG:4326 reprojection for all three NETL layers (one HTTP pattern, three thin ingest scripts on top). Basins land in a new `basins.parquet` + GeoJSON sidecar; storage and ports append to the existing `assets.parquet` as new `kind` values. Frontend gains three deck.gl layer hooks (GeoJsonLayer for basins, ScatterplotLayer for storage, IconLayer for ports), three new LayerPanel toggles with subdued group headers (Geology / Oil / Gas), and a `useUrlState` hook that round-trips the full app state through the URL via `router.replace`. Scenario engine untouched.

**Tech Stack:** Same as Phases 1-3 — Next.js 16 App Router, React 19, TS strict, deck.gl 9, maplibre-gl 4, DuckDB-WASM, pnpm 10. Python (uv): httpx, pandas, geopandas, pyarrow. Spec: `docs/superpowers/specs/2026-05-17-global-energy-map-phase-4-design.md`.

**Branch:** Create and work on `phase-4`. Do NOT implement on `main`.

---

## Task 1: Create phase-4 branch

**Files:** none (branch only)

- [ ] **Step 1: Branch from latest main**

```bash
cd /Users/narendranag/ai/global-energy-map
git checkout main && git pull
git checkout -b phase-4
```

- [ ] **Step 2: Verify clean working tree**

```bash
git status
```

Expected: "nothing to commit, working tree clean".

---

## Task 2: NETL REST helper (TDD)

**Files:**
- Create: `scripts/common/netl.py`
- Create: `tests/python/test_netl.py`

A shared, paginating, reprojecting fetcher for any NETL ArcGIS FeatureServer layer. All three downstream ingest scripts (basins, storage, ports) call this with just a layer name. The helper writes a single GeoJSON FeatureCollection in EPSG:4326 to a given path.

- [ ] **Step 1: Write the failing test**

`tests/python/test_netl.py`:

```python
"""Unit tests for scripts.common.netl.

Uses pytest-style monkeypatching of httpx.get to avoid real network calls.
The integration smoke test that hits a real NETL layer lives in the ingest
scripts themselves (Tasks 3-5).
"""
from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import patch

import pytest

from scripts.common.netl import (
    PAGE_SIZE,
    NETL_BASE,
    build_query_url,
    paginate_features,
)


def test_netl_base_constant():
    assert NETL_BASE == "https://prod.arcgis.netl.doe.gov/server/rest/services/Hosted"


def test_page_size_is_2000():
    """NETL services cap at maxRecordCount=2000."""
    assert PAGE_SIZE == 2000


def test_build_query_url_first_page():
    url = build_query_url("Basins", offset=0)
    # Required query params:
    assert "Basins/FeatureServer/0/query" in url
    assert "where=1%3D1" in url or "where=1=1" in url
    assert "f=geojson" in url
    assert "outSR=4326" in url
    assert "resultRecordCount=2000" in url
    assert "resultOffset=0" in url


def test_build_query_url_with_offset():
    url = build_query_url("Storage", offset=4000)
    assert "resultOffset=4000" in url


def test_paginate_features_stops_at_empty_page():
    """Pagination stops as soon as a page returns 0 features."""
    pages = [
        {"type": "FeatureCollection", "features": [{"id": 1}, {"id": 2}]},
        {"type": "FeatureCollection", "features": [{"id": 3}]},
        {"type": "FeatureCollection", "features": []},
    ]
    call_idx = {"i": 0}

    def fake_get(url, timeout):
        i = call_idx["i"]
        call_idx["i"] += 1

        class R:
            status_code = 200

            def json(self):
                return pages[i]

            def raise_for_status(self):
                pass

        return R()

    with patch("scripts.common.netl.httpx.get", side_effect=fake_get):
        out = paginate_features("Basins")
    assert len(out) == 3
    assert [f["id"] for f in out] == [1, 2, 3]


def test_paginate_features_stops_at_short_page():
    """A page shorter than PAGE_SIZE means we're done."""
    pages = [
        {"type": "FeatureCollection", "features": [{"id": n} for n in range(2000)]},
        {"type": "FeatureCollection", "features": [{"id": 2001}]},
    ]
    call_idx = {"i": 0}

    def fake_get(url, timeout):
        i = call_idx["i"]
        call_idx["i"] += 1

        class R:
            status_code = 200

            def json(self):
                return pages[i]

            def raise_for_status(self):
                pass

        return R()

    with patch("scripts.common.netl.httpx.get", side_effect=fake_get):
        out = paginate_features("Storage")
    assert len(out) == 2001
```

- [ ] **Step 2: Run test — expect failure**

```bash
uv run pytest tests/python/test_netl.py -v
```

Expected: FAIL with "No module named 'scripts.common.netl'".

- [ ] **Step 3: Implement `scripts/common/netl.py`**

```python
"""Shared NETL ArcGIS REST helper for GOGI layers.

NETL exposes oil & gas infrastructure feature services at
https://arcgis.netl.doe.gov/portal/home/item.html?id=1e1c13b43dfb4af68040598c6f4baf44

Each layer caps responses at 2000 records; we paginate via resultOffset.
All responses are requested as GeoJSON in EPSG:4326 (outSR=4326) so
downstream geopandas calls don't need explicit reprojection.

Public functions:
    build_query_url(layer, offset)   — pure URL constructor (testable)
    paginate_features(layer)         — fetch all features with pagination
    fetch_netl_layer(layer, out)     — paginate + write GeoJSON to out path

License: NETL data is US Government work (17 USC §105), public domain.
"""
from __future__ import annotations

import json
from pathlib import Path
from urllib.parse import urlencode

import httpx

NETL_BASE = "https://prod.arcgis.netl.doe.gov/server/rest/services/Hosted"
PAGE_SIZE = 2000


def build_query_url(layer: str, offset: int) -> str:
    """Construct a NETL FeatureServer query URL for one page of features."""
    qs = urlencode(
        {
            "where": "1=1",
            "outFields": "*",
            "f": "geojson",
            "outSR": "4326",
            "resultRecordCount": PAGE_SIZE,
            "resultOffset": offset,
            "returnGeometry": "true",
        }
    )
    return f"{NETL_BASE}/{layer}/FeatureServer/0/query?{qs}"


def paginate_features(layer: str, timeout: float = 90.0) -> list[dict]:
    """Fetch ALL features from a NETL layer via offset-pagination.

    Stops when a page is empty or shorter than PAGE_SIZE.
    Returns the concatenated features list (NOT wrapped in a FeatureCollection).
    """
    all_features: list[dict] = []
    offset = 0
    while True:
        url = build_query_url(layer, offset)
        r = httpx.get(url, timeout=timeout)
        r.raise_for_status()
        page = r.json()
        feats = page.get("features", [])
        all_features.extend(feats)
        if len(feats) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
    return all_features


def fetch_netl_layer(layer: str, out_path: Path) -> int:
    """Fetch all features from `layer` and write to `out_path` as a single GeoJSON.

    Returns the feature count written.
    """
    feats = paginate_features(layer)
    fc = {"type": "FeatureCollection", "features": feats}
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w") as f:
        json.dump(fc, f)
    return len(feats)
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
uv run pytest tests/python/test_netl.py -v
```

Expected: 5 tests PASS.

- [ ] **Step 5: Lint + commit**

```bash
uv run ruff check scripts/common/netl.py tests/python/test_netl.py
git add scripts/common/netl.py tests/python/test_netl.py
git commit -m "feat(common): NETL paginating REST helper"
```

---

## Task 3: Ingest NETL Basins

**Files:**
- Create: `scripts/ingest/netl_basins.py`
- Output: `data/raw/netl/basins.geojson` (gitignored)

- [ ] **Step 1: Confirm `data/raw/netl/.gitkeep` directory ignored**

```bash
mkdir -p data/raw/netl
touch data/raw/netl/.gitkeep
# Check that data/raw/.gitignore already covers this dir
cat data/raw/.gitignore 2>&1 | head -5
```

If the existing `data/raw/.gitignore` excludes `*` already, no change needed. Otherwise add `netl/` to it.

- [ ] **Step 2: Write `scripts/ingest/netl_basins.py`**

```python
"""Ingest NETL GOGI Basins layer.

Source: https://prod.arcgis.netl.doe.gov/server/rest/services/Hosted/Basins/FeatureServer/0
License: US Government work, public domain (17 USC §105)
Expected feature count: ~1,046 polygons

Usage:
    uv run python -m scripts.ingest.netl_basins
"""
from __future__ import annotations

import sys
from pathlib import Path

from scripts.common.netl import fetch_netl_layer

OUT = Path("data/raw/netl/basins.geojson")
LAYER = "Basins"


def main() -> None:
    print(f"Fetching NETL {LAYER}...", file=sys.stderr)
    count = fetch_netl_layer(LAYER, OUT)
    print(f"Wrote {OUT}  features={count}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 3: Run ingest**

```bash
uv run python -m scripts.ingest.netl_basins
ls -lh data/raw/netl/basins.geojson
```

Expected: `Wrote data/raw/netl/basins.geojson  features=1046` (count may vary slightly with NETL updates; expect 1000-1200). File size ~5-15 MB.

- [ ] **Step 4: Sanity-check the GeoJSON**

```bash
uv run python -c "
import json
g = json.load(open('data/raw/netl/basins.geojson'))
print('features:', len(g['features']))
sample = g['features'][0]
print('sample props:', list(sample['properties'].keys())[:10])
print('sample geom type:', sample['geometry']['type'])
"
```

Expected: ~1046 features; properties include `md_country`, `basin_id`, `area_km2`, `md_region`; geometry types are Polygon or MultiPolygon.

- [ ] **Step 5: Commit**

```bash
git add scripts/ingest/netl_basins.py data/raw/netl/.gitkeep
git commit -m "feat(ingest): NETL Basins layer download"
```

---

## Task 4: Ingest NETL Storage

**Files:**
- Create: `scripts/ingest/netl_storage.py`
- Output: `data/raw/netl/storage.geojson`

- [ ] **Step 1: Write `scripts/ingest/netl_storage.py`**

```python
"""Ingest NETL GOGI Storage layer.

Source: https://prod.arcgis.netl.doe.gov/server/rest/services/Hosted/Storage/FeatureServer/0
License: US Government work, public domain (17 USC §105)
Expected feature count: ~26,103 points (14 pages at PAGE_SIZE=2000)

Usage:
    uv run python -m scripts.ingest.netl_storage
"""
from __future__ import annotations

import sys
from pathlib import Path

from scripts.common.netl import fetch_netl_layer

OUT = Path("data/raw/netl/storage.geojson")
LAYER = "Storage"


def main() -> None:
    print(f"Fetching NETL {LAYER}... (~14 pages, takes a few minutes)", file=sys.stderr)
    count = fetch_netl_layer(LAYER, OUT)
    print(f"Wrote {OUT}  features={count}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run ingest (long-running, allow 5-10 min)**

```bash
uv run python -m scripts.ingest.netl_storage
ls -lh data/raw/netl/storage.geojson
```

Expected: `Wrote data/raw/netl/storage.geojson  features=26103` (±). File size: 20-50 MB. Allow Bash timeout up to 600000ms (10 min) for this command.

- [ ] **Step 3: Sanity-check counts past pagination boundary**

```bash
uv run python -c "
import json
g = json.load(open('data/raw/netl/storage.geojson'))
print('features:', len(g['features']))
# Spot-check: pagination should have stitched all 14 pages
assert len(g['features']) > 16000, 'pagination stopped early (likely at standardMaxRecordCount=16000)'
sample = g['features'][0]
print('sample props:', list(sample['properties'].keys())[:12])
print('sample geom type:', sample['geometry']['type'])
"
```

Expected: features > 16000 (proves pagination went past the standard cap); points.

- [ ] **Step 4: Commit**

```bash
git add scripts/ingest/netl_storage.py
git commit -m "feat(ingest): NETL Storage layer download"
```

---

## Task 5: Ingest NETL Ports

**Files:**
- Create: `scripts/ingest/netl_ports.py`
- Output: `data/raw/netl/ports.geojson`

- [ ] **Step 1: Write `scripts/ingest/netl_ports.py`**

```python
"""Ingest NETL GOGI Ports layer.

Source: https://prod.arcgis.netl.doe.gov/server/rest/services/Hosted/Ports/FeatureServer/0
License: US Government work, public domain (17 USC §105)
Expected feature count: ~3,702 points

Usage:
    uv run python -m scripts.ingest.netl_ports
"""
from __future__ import annotations

import sys
from pathlib import Path

from scripts.common.netl import fetch_netl_layer

OUT = Path("data/raw/netl/ports.geojson")
LAYER = "Ports"


def main() -> None:
    print(f"Fetching NETL {LAYER}...", file=sys.stderr)
    count = fetch_netl_layer(LAYER, OUT)
    print(f"Wrote {OUT}  features={count}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run ingest**

```bash
uv run python -m scripts.ingest.netl_ports
ls -lh data/raw/netl/ports.geojson
```

Expected: `Wrote data/raw/netl/ports.geojson  features=3702` (±). File size ~5-15 MB.

- [ ] **Step 3: Sanity-check**

```bash
uv run python -c "
import json
g = json.load(open('data/raw/netl/ports.geojson'))
print('features:', len(g['features']))
sample = g['features'][0]
print('sample props:', list(sample['properties'].keys())[:15])
print('sample geom type:', sample['geometry']['type'])
print('sample commodity values:')
from collections import Counter
commodities = Counter(f['properties'].get('commodity') for f in g['features'])
print(dict(commodities.most_common(8)))
"
```

Expected: ~3702 points; sample includes `md_country`, `commodity`, `status`, `type`, `operator`.

- [ ] **Step 4: Commit**

```bash
git add scripts/ingest/netl_ports.py
git commit -m "feat(ingest): NETL Ports layer download"
```

---

## Task 6: Transform — build basins.parquet

**Files:**
- Create: `scripts/transform/build_basins.py`
- Output: `public/data/basins.parquet`, `public/data/basins.geojson`

- [ ] **Step 1: Probe field names in the raw GeoJSON**

```bash
uv run python -c "
import json
g = json.load(open('data/raw/netl/basins.geojson'))
sample = g['features'][0]
print('all property keys:', list(sample['properties'].keys()))
print('sample property values:')
for k, v in sample['properties'].items():
    print(f'  {k}: {v!r}')
"
```

Record the EXACT property names. Likely: `md_country`, `basin_id`, `area_km2`, `md_region`, `name` or similar. md_country may be semicolon-delimited for multi-country basins (mirror the Phase 3 GGIT areas handling).

- [ ] **Step 2: Write `scripts/transform/build_basins.py`**

```python
"""Transform NETL basins GeoJSON → basins.parquet + sidecar GeoJSON.

Output schema:
    basin_id (str)         NETL basin_id
    name (str|null)        Basin name where tagged
    country_iso3 (str|null) First country from md_country (semicolon-split)
    area_km2 (float|null)
    region (str|null)      NETL md_region
    geometry (Polygon | MultiPolygon)
    source                 "NETL Global Oil and Gas Infrastructure (GOGI)"
    source_version         ISO date string at build time

Usage:
    uv run python -m scripts.transform.build_basins
"""
from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

import geopandas as gpd
import pandas as pd
from shapely.geometry.collection import GeometryCollection

from scripts.common.iso3 import GEM_NAME_TO_ISO3

SRC = Path("data/raw/netl/basins.geojson")
OUT = Path("public/data/basins.parquet")
OUT_GEOJSON = Path("public/data/basins.geojson")
SOURCE = "NETL Global Oil and Gas Infrastructure (GOGI)"


def _country_iso3(md_country: str | None) -> str | None:
    """First country from semicolon-or-comma-delimited md_country."""
    if not isinstance(md_country, str) or not md_country.strip():
        return None
    # NETL uses comma or semicolon; handle both
    sep = ";" if ";" in md_country else ","
    first = md_country.split(sep)[0].strip()
    return GEM_NAME_TO_ISO3.get(first)


def main() -> None:
    if not SRC.exists():
        sys.exit(f"missing {SRC} — run scripts.ingest.netl_basins first")

    gdf = gpd.read_file(SRC)
    print(f"loaded {len(gdf)} raw features", file=sys.stderr)

    # Drop empty/null/collection geometries
    gdf = gdf[~gdf.geometry.apply(lambda g: isinstance(g, GeometryCollection))]
    gdf = gdf[gdf.geometry.notna() & ~gdf.geometry.is_empty].copy()
    print(f"after geometry filter: {len(gdf)}", file=sys.stderr)

    out = pd.DataFrame(
        {
            "basin_id": gdf.get("basin_id", pd.Series(dtype=str)).astype(str),
            "name": gdf.get("name") if "name" in gdf.columns else None,
            "country_iso3": gdf.get("md_country", pd.Series([None] * len(gdf))).map(_country_iso3),
            "area_km2": pd.to_numeric(gdf.get("area_km2"), errors="coerce") if "area_km2" in gdf.columns else None,
            "region": gdf.get("md_region") if "md_region" in gdf.columns else None,
            "source": SOURCE,
            "source_version": date.today().isoformat(),
        }
    )
    out["geometry"] = gdf.geometry.values

    result = gpd.GeoDataFrame(out, geometry="geometry", crs="EPSG:4326")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    result.to_parquet(OUT, compression="zstd")
    result.to_file(OUT_GEOJSON, driver="GeoJSON")
    print(f"wrote {OUT} + {OUT_GEOJSON}  rows={len(result)}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 3: Run the transform**

```bash
uv run python -m scripts.transform.build_basins
```

Expected: `wrote public/data/basins.parquet + public/data/basins.geojson  rows=~1000-1200`.

- [ ] **Step 4: Sanity-check**

```bash
uv run python -c "
import geopandas as gpd
g = gpd.read_parquet('public/data/basins.parquet')
print('rows:', len(g))
print('geom types:', g.geom_type.value_counts().to_dict())
print('country_iso3 hit rate:', (g['country_iso3'].notna().sum() / len(g) * 100), '%')
print('sample row:', g.iloc[0].to_dict())
"
```

The country_iso3 hit rate may be 60-80% — some basins straddle countries not in our GEM_NAME_TO_ISO3 lookup. Acceptable. Note any missing-country basins for potential ISO3 dict additions.

- [ ] **Step 5: Lint + commit**

```bash
uv run ruff check scripts/transform/build_basins.py
git add scripts/transform/build_basins.py public/data/basins.parquet public/data/basins.geojson
git commit -m "feat(data): NETL basins → basins.parquet + sidecar GeoJSON"
```

---

## Task 7: Transform — append storage to assets.parquet

**Files:**
- Create: `scripts/transform/build_storage.py`
- Modify: `public/data/assets.parquet` (appends ~26k `kind='storage'` rows)

- [ ] **Step 1: Probe storage field names**

```bash
uv run python -c "
import json
g = json.load(open('data/raw/netl/storage.geojson'))
sample = g['features'][0]
print('all property keys:', list(sample['properties'].keys()))
for k, v in sample['properties'].items():
    print(f'  {k}: {v!r}')
"
```

Look for: name field (likely `facility_n` or `name`), capacity (likely `capacity` as STRING), operator, status, type, commodity.

- [ ] **Step 2: Write `scripts/transform/build_storage.py`**

```python
"""Append NETL Storage to assets.parquet as kind='storage' rows.

Idempotent: drops prior kind='storage' rows before append.

Usage:
    uv run python -m scripts.transform.build_storage
"""
from __future__ import annotations

import sys
from pathlib import Path

import geopandas as gpd
import pandas as pd

from scripts.common.iso3 import GEM_NAME_TO_ISO3

SRC = Path("data/raw/netl/storage.geojson")
ASSETS_PATH = Path("public/data/assets.parquet")
SOURCE = "NETL Global Oil and Gas Infrastructure (GOGI)"


def _country_iso3(md_country: str | None) -> str | None:
    if not isinstance(md_country, str) or not md_country.strip():
        return None
    sep = ";" if ";" in md_country else ","
    first = md_country.split(sep)[0].strip()
    return GEM_NAME_TO_ISO3.get(first)


def _to_float(v) -> float | None:
    """NETL ships capacity as a string. Try to coerce; NaN on failure."""
    if v is None or v == "" or (isinstance(v, float) and pd.isna(v)):
        return None
    try:
        # Strip commas and unit hints
        s = str(v).replace(",", "").strip()
        return float(s)
    except (TypeError, ValueError):
        return None


def main() -> None:
    if not SRC.exists():
        sys.exit(f"missing {SRC} — run scripts.ingest.netl_storage first")

    gdf = gpd.read_file(SRC)
    print(f"loaded {len(gdf)} raw features", file=sys.stderr)

    # Identify the actual field names from probe (Task 7 Step 1)
    name_col = "facility_n" if "facility_n" in gdf.columns else "name"
    operator_col = "operator" if "operator" in gdf.columns else None
    status_col = "status" if "status" in gdf.columns else None

    # IDs: prefer fid, else md_fkey
    if "fid" in gdf.columns:
        ids = gdf["fid"].astype(str)
    elif "md_fkey" in gdf.columns:
        ids = gdf["md_fkey"].astype(str)
    else:
        ids = pd.Series([f"netl-storage-{i}" for i in range(len(gdf))])

    out = pd.DataFrame(
        {
            "asset_id": "netl-storage-" + ids,
            "kind": "storage",
            "name": gdf.get(name_col, pd.Series(["unknown"] * len(gdf))).astype(str),
            "country_iso3": gdf.get("md_country", pd.Series([None] * len(gdf))).map(_country_iso3),
            "lon": gdf.geometry.x,
            "lat": gdf.geometry.y,
            "capacity": gdf.get("capacity", pd.Series([None] * len(gdf))).map(_to_float),
            "capacity_unit": "bbl",
            "operator": gdf.get(operator_col, pd.Series([None] * len(gdf))).astype(str) if operator_col else None,
            "status": gdf.get(status_col, pd.Series([None] * len(gdf))).astype(str) if status_col else None,
            "commissioned_year": None,
            "decommissioned_year": None,
            "source": SOURCE,
            "source_version": "2026-05-17",
        }
    )

    # Drop rows with no geometry or no country
    out = out[out["country_iso3"].notna() & out["lon"].notna() & out["lat"].notna()].copy()

    # Idempotent merge into assets.parquet: drop any prior kind='storage' rows
    existing = pd.read_parquet(ASSETS_PATH)
    existing = existing[existing["kind"] != "storage"].copy()

    # Schema reconciliation: ensure all-column union
    all_cols = list(set(existing.columns) | set(out.columns))
    for c in all_cols:
        if c not in existing.columns:
            existing[c] = None
        if c not in out.columns:
            out[c] = None
    existing = existing[all_cols]
    out = out[all_cols]

    combined = pd.concat([existing, out], ignore_index=True)
    combined.to_parquet(ASSETS_PATH, compression="zstd")
    counts = combined["kind"].value_counts().to_dict()
    print(f"wrote {ASSETS_PATH}  kinds={counts}  new_storage_rows={len(out)}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 3: Run the transform**

```bash
uv run python -m scripts.transform.build_storage
```

Expected: `kinds={'extraction_site': ~5008, 'refinery': ~168, 'lng_export': ~152, 'lng_import': ~282, 'storage': ~20000-26000}`. The storage count may drop a bit from 26103 raw → output after filtering out null-country / null-geometry rows.

- [ ] **Step 4: Sanity-check**

```bash
uv run python -c "
import duckdb
con = duckdb.connect()
print('Storage top countries:')
print(con.execute(\"SELECT country_iso3, COUNT(*) FROM read_parquet('public/data/assets.parquet') WHERE kind='storage' GROUP BY country_iso3 ORDER BY 2 DESC LIMIT 5\").fetchall())
print('Existing kinds preserved:')
print(con.execute(\"SELECT kind, COUNT(*) FROM read_parquet('public/data/assets.parquet') GROUP BY kind ORDER BY 1\").fetchall())
"
```

Expected top storage countries: USA, RUS, CHN, IRN (rough — NETL coverage is global). Existing extraction_site (5008), refinery (168), lng_export (152), lng_import (282) all unchanged.

- [ ] **Step 5: Idempotency check**

Run the transform again and confirm counts don't change:

```bash
uv run python -m scripts.transform.build_storage
uv run python -c "
import duckdb
con = duckdb.connect()
print(con.execute(\"SELECT kind, COUNT(*) FROM read_parquet('public/data/assets.parquet') GROUP BY kind ORDER BY 1\").fetchall())
"
```

Counts should be identical to Step 4.

- [ ] **Step 6: Commit**

```bash
uv run ruff check scripts/transform/build_storage.py
git add scripts/transform/build_storage.py public/data/assets.parquet
git commit -m "feat(data): NETL storage hubs (kind=storage) in assets.parquet"
```

---

## Task 8: Transform — append ports to assets.parquet

**Files:**
- Create: `scripts/transform/build_ports.py`
- Modify: `public/data/assets.parquet` (appends ~3.7k `kind='port'` rows)

- [ ] **Step 1: Probe ports field names**

```bash
uv run python -c "
import json
g = json.load(open('data/raw/netl/ports.geojson'))
sample = g['features'][0]
for k, v in sample['properties'].items():
    print(f'  {k}: {v!r}')
"
```

Looking for: facility_n / name, capacity, operator, status, type, commodity.

- [ ] **Step 2: Write `scripts/transform/build_ports.py`**

```python
"""Append NETL Ports to assets.parquet as kind='port' rows.

Idempotent: drops prior kind='port' rows before append.

Usage:
    uv run python -m scripts.transform.build_ports
"""
from __future__ import annotations

import sys
from pathlib import Path

import geopandas as gpd
import pandas as pd

from scripts.common.iso3 import GEM_NAME_TO_ISO3

SRC = Path("data/raw/netl/ports.geojson")
ASSETS_PATH = Path("public/data/assets.parquet")
SOURCE = "NETL Global Oil and Gas Infrastructure (GOGI)"


def _country_iso3(md_country: str | None) -> str | None:
    if not isinstance(md_country, str) or not md_country.strip():
        return None
    sep = ";" if ";" in md_country else ","
    first = md_country.split(sep)[0].strip()
    return GEM_NAME_TO_ISO3.get(first)


def _to_float(v) -> float | None:
    if v is None or v == "" or (isinstance(v, float) and pd.isna(v)):
        return None
    try:
        s = str(v).replace(",", "").strip()
        return float(s)
    except (TypeError, ValueError):
        return None


def main() -> None:
    if not SRC.exists():
        sys.exit(f"missing {SRC} — run scripts.ingest.netl_ports first")

    gdf = gpd.read_file(SRC)
    print(f"loaded {len(gdf)} raw features", file=sys.stderr)

    name_col = "facility_n" if "facility_n" in gdf.columns else "name"
    operator_col = "operator" if "operator" in gdf.columns else None
    status_col = "status" if "status" in gdf.columns else None
    type_col = "type" if "type" in gdf.columns else None
    commodity_col = "commodity" if "commodity" in gdf.columns else None

    if "fid" in gdf.columns:
        ids = gdf["fid"].astype(str)
    elif "md_fkey" in gdf.columns:
        ids = gdf["md_fkey"].astype(str)
    else:
        ids = pd.Series([f"netl-port-{i}" for i in range(len(gdf))])

    out = pd.DataFrame(
        {
            "asset_id": "netl-port-" + ids,
            "kind": "port",
            "name": gdf.get(name_col, pd.Series(["unknown"] * len(gdf))).astype(str),
            "country_iso3": gdf.get("md_country", pd.Series([None] * len(gdf))).map(_country_iso3),
            "lon": gdf.geometry.x,
            "lat": gdf.geometry.y,
            "capacity": gdf.get("capacity", pd.Series([None] * len(gdf))).map(_to_float),
            "capacity_unit": None,  # port capacity has no consistent unit in NETL
            "operator": gdf.get(operator_col, pd.Series([None] * len(gdf))).astype(str) if operator_col else None,
            "status": gdf.get(status_col, pd.Series([None] * len(gdf))).astype(str) if status_col else None,
            "commissioned_year": None,
            "decommissioned_year": None,
            "source": SOURCE,
            "source_version": "2026-05-17",
        }
    )

    # Port-specific extra columns we want to surface but don't have first-class
    # places in the asset schema. Stash on tooltip-relevant rows via the name suffix
    # for v1; if we later add proper columns, do that in Phase 5.
    # (Keeping the schema clean here; tooltip pulls type/commodity from NETL directly via Phase 5 if needed.)

    out = out[out["country_iso3"].notna() & out["lon"].notna() & out["lat"].notna()].copy()

    existing = pd.read_parquet(ASSETS_PATH)
    existing = existing[existing["kind"] != "port"].copy()

    all_cols = list(set(existing.columns) | set(out.columns))
    for c in all_cols:
        if c not in existing.columns:
            existing[c] = None
        if c not in out.columns:
            out[c] = None
    existing = existing[all_cols]
    out = out[all_cols]

    combined = pd.concat([existing, out], ignore_index=True)
    combined.to_parquet(ASSETS_PATH, compression="zstd")
    counts = combined["kind"].value_counts().to_dict()
    print(f"wrote {ASSETS_PATH}  kinds={counts}  new_port_rows={len(out)}")
```

- [ ] **Step 3: Run + sanity-check + idempotency**

```bash
uv run python -m scripts.transform.build_ports
uv run python -c "
import duckdb
con = duckdb.connect()
print(con.execute(\"SELECT kind, COUNT(*) FROM read_parquet('public/data/assets.parquet') GROUP BY kind ORDER BY 1\").fetchall())
"
# Re-run, counts should match
uv run python -m scripts.transform.build_ports
uv run python -c "
import duckdb
con = duckdb.connect()
print(con.execute(\"SELECT kind, COUNT(*) FROM read_parquet('public/data/assets.parquet') GROUP BY kind ORDER BY 1\").fetchall())
"
```

Expected: `port` kind has ~2500-3700 rows (after country-filter). All other kinds unchanged from Task 7. Both runs return identical counts.

- [ ] **Step 4: Commit**

```bash
uv run ruff check scripts/transform/build_ports.py
git add scripts/transform/build_ports.py public/data/assets.parquet
git commit -m "feat(data): NETL ports (kind=port) in assets.parquet"
```

---

## Task 9: Catalog update

**Files:**
- Modify: `public/data/catalog.json`

- [ ] **Step 1: Append `netl_gogi` entry; bump version + generated_at**

Open `public/data/catalog.json`. Bump `version` from 2 to 3. Update `generated_at` to current UTC ISO timestamp (`python -c "from datetime import datetime, timezone; print(datetime.now(timezone.utc).isoformat())"`).

Append new entry:

```json
{
  "id": "netl_gogi",
  "label": "NETL Global Oil & Gas Infrastructure (basins, storage, ports)",
  "path": "/data/basins.parquet",
  "format": "geoparquet",
  "source_name": "National Energy Technology Laboratory (US DOE)",
  "source_url": "https://arcgis.netl.doe.gov/portal/home/item.html?id=1e1c13b43dfb4af68040598c6f4baf44",
  "license": "US Government work, public domain (17 USC §105)",
  "as_of": "2026-05-17",
  "layers": ["basins", "storage", "ports"]
}
```

- [ ] **Step 2: Run the catalog parser test**

```bash
pnpm test tests/unit/data-catalog
```

Expected: PASS. If the parser rejects version 3 (mirroring the version 2 issue Phase 3 caught), the implementer will need to update the version-allowlist in `src/lib/data-catalog/index.ts` — extend the check to allow version 3.

- [ ] **Step 3: Commit**

```bash
git add public/data/catalog.json src/lib/data-catalog/index.ts 2>/dev/null || git add public/data/catalog.json
git commit -m "feat(catalog): NETL GOGI entry; bump version to 3"
```

---

## Task 10: BasinPolygonsLayer

**Files:**
- Create: `src/components/layers/BasinPolygonsLayer.tsx`

- [ ] **Step 1: Write the layer hook**

```typescript
// src/components/layers/BasinPolygonsLayer.tsx
"use client";
import { useEffect, useState } from "react";
import { GeoJsonLayer } from "@deck.gl/layers";
import type { Feature, FeatureCollection, Polygon, MultiPolygon } from "geojson";

export interface BasinProps extends Record<string, unknown> {
  basin_id: string;
  name: string | null;
  country_iso3: string | null;
  area_km2: number | null;
  region: string | null;
}

export type BasinFeature = Feature<Polygon | MultiPolygon, BasinProps>;
export type BasinCollection = FeatureCollection<Polygon | MultiPolygon, BasinProps>;

let _cache: BasinCollection | undefined;

async function loadBasins(): Promise<BasinCollection> {
  if (_cache) return _cache;
  const res = await fetch("/data/basins.geojson");
  if (!res.ok) throw new Error(`basins.geojson fetch failed: ${String(res.status)}`);
  _cache = (await res.json()) as BasinCollection;
  return _cache;
}

export function useBasinPolygonsLayer(visible: boolean): GeoJsonLayer | null {
  const [layer, setLayer] = useState<GeoJsonLayer | null>(null);
  useEffect(() => {
    const ctrl = { cancelled: false };
    if (!visible) {
      void Promise.resolve().then(() => {
        if (!ctrl.cancelled) setLayer(null);
      });
      return () => {
        ctrl.cancelled = true;
      };
    }
    void (async () => {
      try {
        const fc = await loadBasins();
        if (ctrl.cancelled) return;
        const l = new GeoJsonLayer<BasinProps>({
          id: "basins",
          data: fc,
          stroked: true,
          filled: true,
          getFillColor: [120, 100, 80, 50],   // muted brown, low alpha
          getLineColor: [120, 100, 80, 200],  // same hue, higher alpha
          lineWidthMinPixels: 0.5,
          pickable: true,
        });
        setLayer(l);
      } catch (err) {
        console.error("BasinPolygonsLayer load failed:", err);
      }
    })();
    return () => {
      ctrl.cancelled = true;
    };
  }, [visible]);
  return layer;
}
```

- [ ] **Step 2: Lint**

```bash
pnpm lint
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/layers/BasinPolygonsLayer.tsx
git commit -m "feat(layers): BasinPolygonsLayer (GeoJsonLayer)"
```

---

## Task 11: StorageLayer

**Files:**
- Create: `src/components/layers/StorageLayer.tsx`

- [ ] **Step 1: Write the layer hook**

```typescript
// src/components/layers/StorageLayer.tsx
"use client";
import { useEffect, useState } from "react";
import { ScatterplotLayer } from "@deck.gl/layers";
import { query } from "@/lib/duckdb/query";

interface StorageRow extends Record<string, unknown> {
  asset_id: string;
  name: string;
  country_iso3: string;
  lon: number;
  lat: number;
  capacity: number | null;
  operator: string | null;
  status: string | null;
}

export function useStorageLayer(visible: boolean): ScatterplotLayer<StorageRow> | null {
  const [layer, setLayer] = useState<ScatterplotLayer<StorageRow> | null>(null);
  useEffect(() => {
    const ctrl = { cancelled: false };
    if (!visible) {
      void Promise.resolve().then(() => {
        if (!ctrl.cancelled) setLayer(null);
      });
      return () => {
        ctrl.cancelled = true;
      };
    }
    void (async () => {
      const res = await query<StorageRow>(
        `SELECT asset_id, name, country_iso3, lon, lat, capacity, operator, status
         FROM read_parquet('/data/assets.parquet')
         WHERE kind = 'storage'`,
      );
      if (ctrl.cancelled) return;
      const l = new ScatterplotLayer<StorageRow>({
        id: "storage",
        data: res.rows,
        getPosition: (d) => [d.lon, d.lat],
        // Fixed radius — 26k points; deck.gl handles this in WebGL2.
        // Capacity-driven sizing could come in Phase 5 if we want it.
        radiusMinPixels: 2,
        radiusMaxPixels: 6,
        getRadius: 3000,
        radiusUnits: "meters",
        getFillColor: [170, 100, 40, 180],   // amber-brown
        stroked: false,
        pickable: true,
      });
      setLayer(l);
    })();
    return () => {
      ctrl.cancelled = true;
    };
  }, [visible]);
  return layer;
}
```

- [ ] **Step 2: Lint**

```bash
pnpm lint
```

- [ ] **Step 3: Commit**

```bash
git add src/components/layers/StorageLayer.tsx
git commit -m "feat(layers): StorageLayer (ScatterplotLayer, 26k points)"
```

---

## Task 12: PortsLayer

**Files:**
- Create: `src/components/layers/PortsLayer.tsx`

- [ ] **Step 1: Write the layer hook**

```typescript
// src/components/layers/PortsLayer.tsx
"use client";
import { useEffect, useState } from "react";
import { IconLayer } from "@deck.gl/layers";
import { query } from "@/lib/duckdb/query";

interface PortRow extends Record<string, unknown> {
  asset_id: string;
  name: string;
  country_iso3: string;
  lon: number;
  lat: number;
  capacity: number | null;
  operator: string | null;
  status: string | null;
}

// Inline SVG anchor glyph. mask=true so getColor controls the tint at runtime.
const ICON_ATLAS =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <path d="M16 4 L16 28 M10 10 L22 10 M6 22 Q16 32 26 22" stroke="white" stroke-width="3" fill="none"/>
  <circle cx="16" cy="7" r="2.5" fill="white"/>
</svg>
`);

const ICON_MAPPING = {
  anchor: { x: 0, y: 0, width: 32, height: 32, anchorX: 16, anchorY: 16, mask: true },
} as const;

export function usePortsLayer(visible: boolean): IconLayer<PortRow> | null {
  const [layer, setLayer] = useState<IconLayer<PortRow> | null>(null);
  useEffect(() => {
    const ctrl = { cancelled: false };
    if (!visible) {
      void Promise.resolve().then(() => {
        if (!ctrl.cancelled) setLayer(null);
      });
      return () => {
        ctrl.cancelled = true;
      };
    }
    void (async () => {
      const res = await query<PortRow>(
        `SELECT asset_id, name, country_iso3, lon, lat, capacity, operator, status
         FROM read_parquet('/data/assets.parquet')
         WHERE kind = 'port'`,
      );
      if (ctrl.cancelled) return;
      const l = new IconLayer<PortRow>({
        id: "ports",
        data: res.rows,
        iconAtlas: ICON_ATLAS,
        iconMapping: ICON_MAPPING,
        getIcon: () => "anchor",
        getPosition: (d) => [d.lon, d.lat],
        // Capacity unit varies; size capped, scaled by sqrt where capacity known.
        getSize: (d) => (d.capacity != null && d.capacity > 0 ? 14 + Math.sqrt(d.capacity) * 0.5 : 16),
        sizeUnits: "pixels",
        sizeMinPixels: 12,
        sizeMaxPixels: 28,
        getColor: [60, 80, 100, 230],   // slate
        pickable: true,
      });
      setLayer(l);
    })();
    return () => {
      ctrl.cancelled = true;
    };
  }, [visible]);
  return layer;
}
```

- [ ] **Step 2: Lint**

```bash
pnpm lint
```

- [ ] **Step 3: Commit**

```bash
git add src/components/layers/PortsLayer.tsx
git commit -m "feat(layers): PortsLayer (IconLayer, anchor glyph)"
```

---

## Task 13: LayerPanel + Legend extend (3 toggles + group headers)

**Files:**
- Modify: `src/components/layers/LayerPanel.tsx`
- Modify: `src/components/layers/Legend.tsx`

- [ ] **Step 1: Update LayerPanel.tsx**

Open `src/components/layers/LayerPanel.tsx`. Update `LayerState` and `ROWS`:

```typescript
"use client";
import { Legend } from "./Legend";

export interface LayerState {
  reserves: boolean;
  basins: boolean;          // NEW
  extraction: boolean;
  pipelines: boolean;
  refineries: boolean;
  storage: boolean;         // NEW
  ports: boolean;           // NEW
  gas_pipelines: boolean;
  lng_terminals: boolean;
}

export interface LayerPanelProps {
  readonly state: LayerState;
  readonly onChange: (next: LayerState) => void;
}

type Row =
  | { kind: "toggle"; key: keyof LayerState; label: string }
  | { kind: "group"; label: string };

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
];

export function LayerPanel({ state, onChange }: LayerPanelProps) {
  return (
    <div className="pointer-events-auto absolute left-4 top-4 z-10 w-60 rounded-md bg-white/90 p-3 text-sm shadow-lg backdrop-blur">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-600">Layers</div>
      <div className="space-y-1.5">
        {ROWS.map((r, idx) =>
          r.kind === "group" ? (
            <div
              key={`group-${String(idx)}`}
              className="pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400"
            >
              {r.label}
            </div>
          ) : (
            <label key={r.key} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={state[r.key]}
                onChange={(e) => {
                  onChange({ ...state, [r.key]: e.target.checked });
                }}
              />
              <span>{r.label}</span>
            </label>
          ),
        )}
      </div>
      <div className="mt-3 border-t border-slate-200 pt-2">
        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-600">Legend</div>
        <Legend />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update Legend.tsx**

Read the existing `src/components/layers/Legend.tsx` first. Add three new swatch rows after existing ones, matching the existing visual conventions:

- Basins: muted brown rectangle/swatch
- Storage hubs: amber-brown circle
- Ports: slate anchor (use a small ⚓ or the same SVG path)

Match the existing styling pattern in the file. If existing rows use inline color swatches, do the same.

- [ ] **Step 3: Lint**

```bash
pnpm lint
```

`src/app/page.tsx` will fail tsc due to missing keys in its `LayerState` literal — that's Task 16's job. ESLint should still pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/layers/LayerPanel.tsx src/components/layers/Legend.tsx
git commit -m "feat(layers): LayerPanel + Legend gain basins/storage/ports + group headers"
```

---

## Task 14: URL state encoding (TDD)

**Files:**
- Create: `src/lib/url-state/encode.ts`
- Create: `tests/unit/url-state/encode.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/url-state/encode.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { encodeAppState, decodeAppState, type AppState } from "@/lib/url-state/encode";
import type { LayerState } from "@/components/layers/LayerPanel";

const ALL_ON: LayerState = {
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

const DEFAULTS: AppState = {
  year: 2020,
  commodity: "oil",
  scenario: null,
  layers: ALL_ON,
};

describe("encodeAppState", () => {
  it("encodes a non-default state to a querystring", () => {
    const qs = encodeAppState({
      year: 2015,
      commodity: "gas",
      scenario: "hormuz",
      layers: { ...ALL_ON, basins: false, ports: false },
    });
    const params = new URLSearchParams(qs);
    expect(params.get("year")).toBe("2015");
    expect(params.get("commodity")).toBe("gas");
    expect(params.get("scenario")).toBe("hormuz");
    // Layers serialized as comma-separated list of ENABLED keys
    const layers = params.get("layers")?.split(",") ?? [];
    expect(layers).not.toContain("basins");
    expect(layers).not.toContain("ports");
    expect(layers).toContain("reserves");
  });
});

describe("decodeAppState", () => {
  it("round-trips a full state", () => {
    const original: AppState = {
      year: 2015,
      commodity: "gas",
      scenario: "hormuz",
      layers: { ...ALL_ON, basins: false, ports: false, gas_pipelines: false },
    };
    const qs = encodeAppState(original);
    const decoded = decodeAppState(new URLSearchParams(qs), DEFAULTS);
    expect(decoded).toEqual(original);
  });

  it("falls back to defaults for missing year", () => {
    const decoded = decodeAppState(new URLSearchParams("commodity=gas"), DEFAULTS);
    expect(decoded.year).toBe(2020);
    expect(decoded.commodity).toBe("gas");
  });

  it("ignores unknown commodity (falls back to default)", () => {
    const decoded = decodeAppState(new URLSearchParams("commodity=coal"), DEFAULTS);
    expect(decoded.commodity).toBe("oil");
  });

  it("ignores unknown scenario (falls back to null)", () => {
    const decoded = decodeAppState(new URLSearchParams("scenario=nonexistent"), DEFAULTS);
    expect(decoded.scenario).toBeNull();
  });

  it("ignores unknown layer keys in the layers list", () => {
    const decoded = decodeAppState(
      new URLSearchParams("layers=reserves,basins,fictional"),
      DEFAULTS,
    );
    expect(decoded.layers.reserves).toBe(true);
    expect(decoded.layers.basins).toBe(true);
    // Layers not mentioned default to false (URL is authoritative)
    expect(decoded.layers.refineries).toBe(false);
  });

  it("falls back to defaults for non-numeric year", () => {
    const decoded = decodeAppState(new URLSearchParams("year=banana"), DEFAULTS);
    expect(decoded.year).toBe(2020);
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
pnpm test tests/unit/url-state/encode.test.ts
```

Expected: "Cannot find module '@/lib/url-state/encode'".

- [ ] **Step 3: Implement `src/lib/url-state/encode.ts`**

```typescript
import type { Commodity, ScenarioId } from "@/lib/scenarios/types";
import { SCENARIOS } from "@/lib/scenarios/registry";
import type { LayerState } from "@/components/layers/LayerPanel";

export interface AppState {
  readonly year: number;
  readonly commodity: Commodity;
  readonly scenario: ScenarioId | null;
  readonly layers: LayerState;
}

const COMMODITIES: readonly Commodity[] = ["oil", "gas"];
const LAYER_KEYS: readonly (keyof LayerState)[] = [
  "reserves",
  "basins",
  "extraction",
  "pipelines",
  "refineries",
  "storage",
  "ports",
  "gas_pipelines",
  "lng_terminals",
];

export function encodeAppState(state: AppState): string {
  const params = new URLSearchParams();
  params.set("year", String(state.year));
  params.set("commodity", state.commodity);
  if (state.scenario !== null) params.set("scenario", state.scenario);
  const enabled = LAYER_KEYS.filter((k) => state.layers[k]);
  params.set("layers", enabled.join(","));
  return params.toString();
}

export function decodeAppState(
  params: URLSearchParams,
  defaults: AppState,
): AppState {
  const rawYear = params.get("year");
  let year = defaults.year;
  if (rawYear !== null) {
    const n = Number(rawYear);
    if (Number.isFinite(n) && Number.isInteger(n)) year = n;
  }

  const rawCommodity = params.get("commodity");
  const commodity: Commodity =
    rawCommodity !== null && (COMMODITIES as readonly string[]).includes(rawCommodity)
      ? (rawCommodity as Commodity)
      : defaults.commodity;

  const rawScenario = params.get("scenario");
  let scenario: ScenarioId | null = defaults.scenario;
  if (rawScenario !== null) {
    const known = SCENARIOS.find((s) => s.id === rawScenario);
    scenario = known ? known.id : null;
  }

  const rawLayers = params.get("layers");
  let layers = defaults.layers;
  if (rawLayers !== null) {
    const enabled = new Set(rawLayers.split(",").filter(Boolean));
    const next = {} as LayerState;
    for (const k of LAYER_KEYS) {
      next[k] = enabled.has(k);
    }
    layers = next;
  }

  return { year, commodity, scenario, layers };
}
```

- [ ] **Step 4: Run tests — expect all PASS**

```bash
pnpm test tests/unit/url-state/encode.test.ts
```

Expected: 7 tests PASS.

- [ ] **Step 5: Lint + commit**

```bash
pnpm lint
git add src/lib/url-state/encode.ts tests/unit/url-state/encode.test.ts
git commit -m "feat(url-state): encode/decode pure functions with TDD"
```

---

## Task 15: useUrlState hook

**Files:**
- Create: `src/lib/url-state/useUrlState.ts`

- [ ] **Step 1: Write the hook**

```typescript
// src/lib/url-state/useUrlState.ts
"use client";
import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { encodeAppState, decodeAppState, type AppState } from "./encode";

export function useUrlState(defaults: AppState): [
  AppState,
  (next: Partial<AppState>) => void,
] {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Decode current state from the URL on each render. searchParams is stable
  // when the URL hasn't changed, so this is cheap.
  const state = useMemo(
    () => decodeAppState(new URLSearchParams(searchParams?.toString() ?? ""), defaults),
    [searchParams, defaults],
  );

  const setState = useCallback(
    (partial: Partial<AppState>) => {
      const merged: AppState = {
        ...state,
        ...partial,
        layers: { ...state.layers, ...(partial.layers ?? {}) },
      };
      const qs = encodeAppState(merged);
      router.replace(`?${qs}`, { scroll: false });
    },
    [state, router],
  );

  return [state, setState];
}
```

- [ ] **Step 2: Lint**

```bash
pnpm lint
```

Expected: clean. The hook uses `next/navigation` which is the standard Next 13+/App Router import.

- [ ] **Step 3: Commit**

```bash
git add src/lib/url-state/useUrlState.ts
git commit -m "feat(url-state): useUrlState hook (router.replace on change)"
```

---

## Task 16: Wire page.tsx

**Files:**
- Modify: `src/app/page.tsx`

This is the central integration task. Replaces multiple `useState` calls with a single `useUrlState`; mounts the three new layers; extends `getTooltip` for basins/storage/ports.

- [ ] **Step 1: Full replacement**

Open `src/app/page.tsx` and replace with:

```typescript
"use client";
import { useCallback, useMemo } from "react";
import type { PickingInfo } from "@deck.gl/core";
import { MapShell } from "@/components/map/MapShell";
import { useReservesChoropleth } from "@/components/layers/ReservesChoropleth";
import { useExtractionPoints } from "@/components/layers/ExtractionPoints";
import { usePipelinesLayer } from "@/components/layers/PipelinesLayer";
import { useRefineriesLayer } from "@/components/layers/RefineriesLayer";
import { useLngTerminalsLayer } from "@/components/layers/LngTerminalsLayer";
import { useBasinPolygonsLayer } from "@/components/layers/BasinPolygonsLayer";
import { useStorageLayer } from "@/components/layers/StorageLayer";
import { usePortsLayer } from "@/components/layers/PortsLayer";
import { LayerPanel, type LayerState } from "@/components/layers/LayerPanel";
import { CommoditySelector } from "@/components/ui/CommoditySelector";
import { YearSlider } from "@/components/time-slider/YearSlider";
import { ScenarioPanel } from "@/components/scenarios/ScenarioPanel";
import { useScenario } from "@/components/scenarios/useScenario";
import {
  importerOverlay,
  refineryImpactMap,
  lngImportImpactMap,
} from "@/components/scenarios/overlay";
import type { Commodity, ScenarioId } from "@/lib/scenarios/types";
import { useUrlState } from "@/lib/url-state/useUrlState";
import type { AppState } from "@/lib/url-state/encode";

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

const DEFAULTS: AppState = {
  year: 2020,
  commodity: "oil",
  scenario: null,
  layers: ALL_LAYERS_ON,
};

export default function Home() {
  const [state, setState] = useUrlState(DEFAULTS);
  const { year, commodity, scenario: scenarioId, layers } = state;

  const setYear = useCallback((y: number) => setState({ year: y }), [setState]);
  const setCommodity = useCallback((c: Commodity) => setState({ commodity: c }), [setState]);
  const setScenarioId = useCallback(
    (id: ScenarioId | null) => setState({ scenario: id }),
    [setState],
  );
  const setLayers = useCallback(
    (next: LayerState) => setState({ layers: next }),
    [setState],
  );

  const scenario = useScenario(scenarioId, year, commodity);
  const overlay = useMemo(() => importerOverlay(scenario), [scenario]);
  const refImpacts = useMemo(() => refineryImpactMap(scenario), [scenario]);
  const lngImpacts = useMemo(() => lngImportImpactMap(scenario), [scenario]);

  const basins = useBasinPolygonsLayer(layers.basins);
  const reserves = useReservesChoropleth({
    year,
    commodity,
    ...(overlay !== undefined ? { overlayByIso3: overlay } : {}),
  });
  const extraction = useExtractionPoints();
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
  const refineries = useRefineriesLayer({
    visible: layers.refineries,
    ...(refImpacts !== undefined ? { impactByAssetId: refImpacts } : {}),
  });
  const storage = useStorageLayer(layers.storage);
  const ports = usePortsLayer(layers.ports);
  const lngTerminals = useLngTerminalsLayer({
    visible: layers.lng_terminals,
    ...(lngImpacts !== undefined ? { impactByAssetId: lngImpacts } : {}),
  });

  // Z-order: basins (bottom) -> reserves -> extraction -> pipelines -> refineries -> storage -> ports -> lng terminals (top)
  const visibleLayers = [
    layers.basins ? basins : null,
    layers.reserves ? reserves : null,
    layers.extraction ? extraction : null,
    oilPipes,
    gasPipes,
    refineries,
    storage,
    ports,
    lngTerminals,
  ].filter((x) => x !== null);

  const getTooltip = useCallback(
    (info: PickingInfo) => {
      const o = info.object as Record<string, unknown> | undefined;
      if (!o) return null;

      if (info.layer?.id === "basins") {
        const props = (o as { properties?: Record<string, unknown> }).properties ?? {};
        const area = props.area_km2;
        const areaStr = typeof area === "number" ? `${area.toFixed(0)} km²` : "n/a";
        return [
          `Basin: ${String(props.name ?? props.basin_id ?? "unknown")}`,
          `Country: ${String(props.country_iso3 ?? "n/a")}`,
          `Area: ${areaStr}`,
          `Region: ${String(props.region ?? "n/a")}`,
        ].join("\n");
      }

      if (info.layer?.id === "storage") {
        const cap = o.capacity;
        const capStr = typeof cap === "number" && cap > 0 ? `${cap.toFixed(0)} bbl` : "n/a";
        return [
          `Storage: ${String(o.name)}`,
          `Country: ${String(o.country_iso3)}`,
          `Operator: ${String(o.operator ?? "n/a")}`,
          `Status: ${String(o.status ?? "n/a")}`,
          `Capacity: ${capStr}`,
        ].join("\n");
      }

      if (info.layer?.id === "ports") {
        return [
          `Port: ${String(o.name)}`,
          `Country: ${String(o.country_iso3)}`,
          `Operator: ${String(o.operator ?? "n/a")}`,
          `Status: ${String(o.status ?? "n/a")}`,
        ].join("\n");
      }

      // Existing handlers preserved (extraction, refineries, lng-terminals, pipelines-*, reserves-*)
      if (info.layer?.id === "extraction") {
        const cap = o.capacity;
        const capStr = typeof cap === "number" ? `${cap.toFixed(1)} kboe/d` : "n/a";
        return [
          o.name as string,
          `Country: ${o.country_iso3 as string}`,
          `Operator: ${(o.operator as string | null) ?? "n/a"}`,
          `Status: ${(o.status as string | null) ?? "n/a"}`,
          `Capacity: ${capStr}`,
        ].join("\n");
      }
      if (info.layer?.id === "refineries") {
        const cap = o.capacity;
        const capStr = typeof cap === "number" && cap > 0 ? `${cap.toFixed(0)} kbpd` : "n/a";
        const impact = refImpacts?.get(o.asset_id as string);
        const lines = [
          `Refinery: ${o.name as string}`,
          `Country: ${o.country_iso3 as string}`,
          `Operator: ${(o.operator as string | null) ?? "n/a"}`,
          `Capacity: ${capStr}`,
        ];
        if (impact && impact.topSources.length > 0) {
          lines.push("", "Historical top sources (capacity-weighted):");
          for (const s of impact.topSources) {
            lines.push(`  ${s.iso3}: ${s.qty.toFixed(1)}`);
          }
          if (impact.shareAtRisk > 0) {
            lines.push("", `At-risk under scenario: ${(impact.shareAtRisk * 100).toFixed(1)}%`);
          }
        } else if (impact) {
          lines.push("", "Country runs primarily domestic crude — feedstock model not informative.");
        }
        return lines.join("\n");
      }
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
        if (impact && impact.topSources.length > 0) {
          lines.push("", "Historical top sources (capacity-weighted):");
          for (const s of impact.topSources) {
            lines.push(`  ${s.iso3}: ${s.qty.toFixed(1)}`);
          }
          if (impact.shareAtRisk > 0) {
            lines.push("", `At-risk under scenario: ${(impact.shareAtRisk * 100).toFixed(1)}%`);
          }
        }
        return lines.join("\n");
      }
      if ((info.layer?.id ?? "").startsWith("pipelines-")) {
        const props = (o as { properties?: Record<string, unknown> }).properties ?? {};
        const cap = props.capacity_kbpd;
        const unit = (props.capacity_unit as string | undefined) ?? "kbpd";
        const capStr = typeof cap === "number" ? `${cap.toFixed(0)} ${unit}` : "n/a";
        return [
          `Pipeline: ${props.name as string}`,
          `Commodity: ${props.commodity as string}`,
          `Status: ${props.status as string}`,
          `Operator: ${(props.operator as string | null) ?? "n/a"}`,
          `Capacity: ${capStr}`,
        ].join("\n");
      }
      if (typeof info.layer?.id === "string" && info.layer.id.startsWith("reserves-")) {
        const props = (o as { properties?: { name?: string; iso3?: string } }).properties;
        return props ? `${props.name ?? ""} (${props.iso3 ?? ""})` : null;
      }
      return null;
    },
    [refImpacts, lngImpacts],
  );

  return (
    <main className="relative h-screen w-screen">
      <MapShell layers={visibleLayers} getTooltip={getTooltip} />
      <LayerPanel state={layers} onChange={setLayers} />
      <div className="pointer-events-none absolute bottom-20 left-1/2 z-10 -translate-x-1/2">
        <CommoditySelector value={commodity} onChange={setCommodity} />
      </div>
      <YearSlider min={1990} max={2020} value={year} onChange={setYear} />
      <ScenarioPanel
        active={scenarioId}
        onChange={setScenarioId}
        commodity={commodity}
        result={scenario}
      />
    </main>
  );
}
```

- [ ] **Step 2: Lint + typecheck**

```bash
pnpm lint
npx tsc --noEmit 2>&1 | head -20
```

Expected: lint clean. tsc may flag pre-existing test-file issues; no NEW errors in src/.

- [ ] **Step 3: Build + dev server smoke**

```bash
pnpm build 2>&1 | tail -15
```

Expected: build succeeds, all routes prerender.

Then start dev server and confirm initial load:

```bash
pnpm dev &
sleep 8
curl -s http://localhost:3000 | head -15
# stop the dev server
pkill -f "next dev"
```

Confirm initial HTML renders without errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(app): wire useUrlState + basins/storage/ports layers"
```

---

## Task 17: Methodology + CLAUDE.md docs

**Files:**
- Modify: `docs/methodology.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update methodology.md**

Add a "Phase 4 — NETL basins + storage + ports + URL state" section after the existing Phase 3 section:

```markdown
## Phase 4 — NETL basins + storage + ports + URL state

### NETL Global Oil and Gas Infrastructure (GOGI)

Source: **National Energy Technology Laboratory (US Department of Energy)** — Global Oil and Gas Data ArcGIS portal (https://arcgis.netl.doe.gov/portal/home/item.html?id=1e1c13b43dfb4af68040598c6f4baf44). Data accessed via the public ArcGIS REST FeatureServer endpoints. License: **US Government work, public domain (17 USC §105)**.

Three layers ingested in Phase 4:
- **Basins** — petroleum-bearing geological basins (~1,046 polygons)
- **Storage hubs** — oil and gas storage facilities globally (~26,000 points; capacity in barrels)
- **Ports** — oil & gas handling ports (~3,700 points)

The NETL dataset also includes Wells (4.8M features), Power Plants, Mines, Processing Plants, Stations, Railways, Platforms/Pads, and Fields — out of Phase 4 scope, possible Phase 5+ candidates.

### Shareable URL state

The application's full UI state — year, commodity (oil/gas), active scenario, and visible-layer toggles — round-trips through the querystring. Every control change calls `router.replace` to keep the URL in sync without polluting browser history. Bookmarking or sharing a URL preserves the exact view.

Format:

```
?year=2020&commodity=gas&scenario=hormuz&layers=reserves,basins,gas_pipelines,lng_terminals
```

Layers default to ON; the `layers` querystring lists only ENABLED layers. **Forward-compat caveat:** when Phase 5 adds new layer toggles, URLs bookmarked from Phase 4 will load the new layers in their default-OFF state (since the bookmark's `layers=` list won't mention them). This is intentional — the URL is authoritative — so analysts sharing links know exactly what others will see.

### Basin layer

Basins render as semi-transparent muted-brown fills beneath all point/line layers, with stroke at higher alpha. Tooltip on hover shows basin name, country, area (km²), and region.
```

- [ ] **Step 2: Update CLAUDE.md**

Schema table — append `basin` row and update `asset` row:

```markdown
| `basin` | basin_id, name, country_iso3, area_km2, region, geometry | NETL Global Oil and Gas Infrastructure |
| `asset` | asset_id, kind (extraction_site, refinery, lng_export, lng_import, storage, port), name, iso3, lon, lat, capacity, capacity_unit, ... | GEM trackers + OpenStreetMap + NETL GOGI |
```

Phase status — flip Phase 4 to in-progress:

```markdown
- **Phase 4** — _in progress 2026-05-17_ (NETL basins + storage + ports + shareable URL state)
```

Data sources table — append:

```markdown
| Basins / storage / ports | NETL Global Oil & Gas Infrastructure (US DOE) | **Public domain** (US Gov work, 17 USC §105) | Phase 4 — 1,046 basins + ~26k storage + ~3.7k ports |
```

- [ ] **Step 3: Commit**

```bash
git add docs/methodology.md CLAUDE.md
git commit -m "docs: Phase 4 methodology + CLAUDE.md updates"
```

---

## Task 18: Playwright phase-4 e2e

**Files:**
- Create: `tests/e2e/phase-4.spec.ts`

- [ ] **Step 1: Write the spec**

```typescript
// tests/e2e/phase-4.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Phase 4 — basins + storage + ports + URL state", () => {
  test("URL state round-trips", async ({ page }) => {
    await page.goto("/?year=2015&commodity=gas&scenario=hormuz&layers=reserves,lng_terminals");
    await page.waitForSelector("#deck-canvas");
    // CommoditySelector should reflect gas
    await expect(page.getByRole("button", { name: "Gas" })).toHaveAttribute("aria-pressed", "true");
    // Scenario panel should show Hormuz selected
    await expect(page.locator("select")).toHaveValue("hormuz");
    // Layer panel — basins/extraction/etc. should be OFF since not in querystring
    await expect(page.getByLabel("Basins")).not.toBeChecked();
    await expect(page.getByLabel("Extraction sites")).not.toBeChecked();
    await expect(page.getByLabel("Reserves (country)")).toBeChecked();
  });

  test("flipping a toggle updates the URL", async ({ page }) => {
    await page.goto("/?layers=reserves,basins");
    await page.waitForSelector("#deck-canvas");
    // Initial: storage off (not in querystring)
    await expect(page.getByLabel("Storage hubs")).not.toBeChecked();
    // Toggle on
    await page.getByLabel("Storage hubs").click();
    // URL should now include storage
    await expect(page).toHaveURL(/layers=[^&]*storage/);
  });

  test("basin tooltip on hover", async ({ page }) => {
    // Load with basins on, nothing else
    await page.goto("/?layers=basins");
    await page.waitForSelector("#deck-canvas");
    await page.waitForTimeout(1500); // basin layer fetch + render
    // Hover roughly over Saudi Arabia / Iraq area — should hit a major oil basin
    await page.locator("#deck-canvas").hover({ position: { x: 600, y: 280 } });
    // Tooltip should appear with basin info; tolerate slow render
    await expect(page.locator("body")).toContainText(/Basin:|Country:/, { timeout: 5000 });
  });

  test("storage + ports layer toggles render", async ({ page }) => {
    await page.goto("/?layers=storage,ports");
    await page.waitForSelector("#deck-canvas");
    await expect(page.getByLabel("Storage hubs")).toBeChecked();
    await expect(page.getByLabel("Ports")).toBeChecked();
  });
});
```

- [ ] **Step 2: Run**

```bash
pnpm test:e2e tests/e2e/phase-4.spec.ts
```

Expected: 4 tests PASS. If the basin tooltip test fails due to map-position imprecision, adjust the hover coordinates or relax the assertion to just check that the layer rendered (e.g. that a canvas pixel changed). Don't loosen the URL round-trip tests — those are the core Phase 4 contract.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/phase-4.spec.ts
git commit -m "test(e2e): Phase 4 smoke — URL roundtrip + basin/storage/port toggles"
```

---

## Task 19: Final lint + build + test sweep

**Files:** none (verification only)

- [ ] **Step 1: Full local CI**

```bash
pnpm lint && pnpm test && pnpm build
```

All must pass.

- [ ] **Step 2: Python lints + tests**

```bash
uv run ruff check scripts/ tests/python/
uv run pytest tests/python/ -v
```

Expected: clean lint, all tests pass (including the new NETL helper tests from Task 2).

- [ ] **Step 3: Vercel preview deploy (manual)**

(Vercel will auto-deploy preview on push. No manual `vercel` call needed.)

If any step fails, fix before opening the PR.

---

## Task 20: Push, PR, merge, flip phase status

**Files:** none (git ops); post-merge: `CLAUDE.md`

- [ ] **Step 1: Push the branch**

```bash
git push -u origin phase-4
```

- [ ] **Step 2: Create the PR**

```bash
gh pr create --title "Phase 4: NETL basins + storage + ports + shareable URL state" --body "$(cat <<'EOF'
## Summary

- Adds three new map layers from NETL's Global Oil and Gas Infrastructure (GOGI) ArcGIS portal: basin polygons (~1,046), storage hubs (~26k), and oil/gas ports (~3.7k). All public domain (US Government work, 17 USC §105).
- Adds shareable URL state — year + commodity + scenario + visible layers round-trip through the querystring via `router.replace`; bad/missing params silently fall back to defaults.
- Layer panel grows to 9 toggles with subdued group headers (Geology / Oil / Gas) for readability.
- Scenario engine completely untouched this slice.

Per spec: `docs/superpowers/specs/2026-05-17-global-energy-map-phase-4-design.md`.

## Test plan

- [x] `pnpm lint && pnpm test && pnpm build` clean
- [x] `uv run pytest tests/python/` clean (includes new NETL helper tests)
- [x] Playwright phase-4 e2e green (URL round-trip + layer toggles + basin tooltip)
- [x] Vercel preview manually smoke-tested (basins render under all other layers; 26k storage points render without FPS regression; URL bar updates on every interaction)

## Known limitations

- **OSM refineries (168) NOT replaced** with NETL refineries (2,272). Deferred to its own phase — meaningful improvement but regresses Phase 2 data; deserves a separate diff.
- **GEM LNG terminals (434) NOT replaced** with NETL LNG (329). Different counting conventions; deferred for comparison work.
- **NETL Wells, Power Plants, Mines, Processing Plants, etc.** — out of Phase 4 scope. Phase 5+ candidates.
- **Refined-product pipelines** — no clean public per-pipeline source identified; deferred.
- **Tanker tracking / LNG carriers** — needs AIS-source decision; deferred to its own slice.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Wait for CI green, then squash-merge**

```bash
gh pr view --json mergeStateStatus,statusCheckRollup 2>&1 | head -10
gh pr merge --squash --delete-branch
```

- [ ] **Step 4: Flip Phase 4 status to shipped (post-merge PR)**

```bash
git checkout main && git pull
```

Open `CLAUDE.md`:
- Change top header `Status: Phases 1–3 shipped` → `Status: Phases 1–4 shipped`
- Change phase-status block `Phase 4 — _in progress 2026-05-17_` → `Phase 4 — _shipped <merge-date>_`

```bash
git checkout -b docs/phase-4-shipped
git add CLAUDE.md
git commit -m "docs: mark Phase 4 shipped in CLAUDE.md"
git push -u origin docs/phase-4-shipped
gh pr create --title "docs: mark Phase 4 shipped" --body "One-line follow-up to the Phase 4 PR."
gh pr merge --squash --delete-branch
```

Phase 4 done.
