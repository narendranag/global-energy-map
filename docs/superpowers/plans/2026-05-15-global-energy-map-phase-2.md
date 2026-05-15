# Global Energy Map — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship oil pipelines + refineries as new map layers, a layer toggle/legend panel, and a scenario registry with 4 disruptions (Hormuz refactored + Druzhba + BTC + CPC). With any scenario active, refineries restyle by capacity-weighted feedstock-at-risk.

**Architecture:** Python ingestion of GEM Oil Infrastructure Tracker → `pipelines.parquet` (GeoParquet) + refinery rows appended to `assets.parquet`. Scenario engine generalizes from one-off `computeHormuzImpact` to `computeScenarioImpact(scenarioId, ...)` reading a new `disruption_route.parquet` that subsumes `chokepoint_route.parquet`. Refinery feedstock derived in-engine: refinery_capacity_share × country BACI imports × disrupted-route share. Frontend gains `PipelinesLayer`, `RefineriesLayer`, `LayerPanel`, `Legend`, scenario `<select>` dropdown.

**Tech Stack:** Same as Phase 1 — Next.js 16 (App Router), React 19, TS strict, deck.gl 9, maplibre-gl 4, DuckDB-WASM, pnpm 10. Python (uv): httpx, pandas, geopandas, pyarrow, duckdb. Spec: `docs/superpowers/specs/2026-05-15-global-energy-map-phase-2-design.md`.

**Branch:** Create and work on `phase-2`. Do NOT implement on `main`.

---

## Task 1: Create phase-2 branch + extract shared ISO3 utility

Carries Phase 1's review carryover: deduplicate the `NAME_TO_ISO3` dicts duplicated between `scripts/transform/build_country_year.py` and `scripts/transform/build_assets.py`.

**Files:**
- Create: `scripts/common/iso3.py`, `tests/python/test_iso3.py`
- Modify: `scripts/transform/build_country_year.py`, `scripts/transform/build_assets.py`
- New branch: `phase-2`

- [ ] **Step 1: Create branch from main**

```bash
cd /Users/narendranag/ai/global-energy-map
git checkout main && git pull
git checkout -b phase-2
```

- [ ] **Step 2: Inspect the two existing dicts**

```bash
grep -n "NAME_TO_ISO3" scripts/transform/build_country_year.py scripts/transform/build_assets.py | head -20
```

Both files define their own `NAME_TO_ISO3` dict — the EI version has ~49 keys, the GEM version has ~85 keys, and they have different source-name spellings (e.g., "Russian Federation" vs "Russia"). They MUST stay as separate named dicts so future ingestion scripts can pick the right one.

- [ ] **Step 3: Write `scripts/common/iso3.py`**

Combined module exposing TWO named dicts and a small helper. Move both dicts verbatim from the two scripts; do not merge them.

```python
"""ISO 3166-1 alpha-3 lookup tables for source-specific country name spellings.

EI Statistical Review and GEM use slightly different country name spellings,
so we keep two separate dicts. Future sources can add their own.
"""
from __future__ import annotations

# Energy Institute Statistical Review (panel + wide sheets)
EI_NAME_TO_ISO3: dict[str, str] = {
    # paste the dict body from scripts/transform/build_country_year.py
}

# Global Energy Monitor (extraction tracker, oil infrastructure tracker)
GEM_NAME_TO_ISO3: dict[str, str] = {
    # paste the dict body from scripts/transform/build_assets.py
}


def lookup(name: str, source: str) -> str | None:
    """Return iso3 for a name; source ∈ {'ei', 'gem'}."""
    table = {"ei": EI_NAME_TO_ISO3, "gem": GEM_NAME_TO_ISO3}[source]
    return table.get(name) or table.get(name.strip())
```

- [ ] **Step 4: Write the unit test FIRST**

`tests/python/test_iso3.py`:
```python
import pytest
from scripts.common.iso3 import EI_NAME_TO_ISO3, GEM_NAME_TO_ISO3, lookup


def test_known_ei_names():
    assert lookup("Saudi Arabia", "ei") == "SAU"
    assert lookup("United States", "ei") == "USA"


def test_known_gem_names():
    assert lookup("Saudi Arabia", "gem") == "SAU"
    assert lookup("United States of America", "gem") == "USA"


def test_unknown_name_returns_none():
    assert lookup("Atlantis", "ei") is None


def test_dicts_are_non_trivial():
    assert len(EI_NAME_TO_ISO3) >= 40
    assert len(GEM_NAME_TO_ISO3) >= 80
```

- [ ] **Step 5: Run the test — should fail (module missing)**

```bash
uv run pytest tests/python/test_iso3.py -v
```
Expected: FAIL with "No module named 'scripts.common.iso3'" or similar.

- [ ] **Step 6: Implement the module by copying both dicts**

Read each existing dict and paste it into `scripts/common/iso3.py`. Verify by re-running the test.

```bash
uv run pytest tests/python/test_iso3.py -v
```
Expected: PASS (4 tests).

- [ ] **Step 7: Refactor `build_country_year.py` to import the shared dict**

Replace the inline `NAME_TO_ISO3` dict in `build_country_year.py` with:
```python
from scripts.common.iso3 import EI_NAME_TO_ISO3 as NAME_TO_ISO3
```
(Keep `NAME_TO_ISO3` as a local alias to minimize downstream churn — name calls below don't change.)

- [ ] **Step 8: Refactor `build_assets.py` to import the shared dict**

Same pattern:
```python
from scripts.common.iso3 import GEM_NAME_TO_ISO3 as NAME_TO_ISO3
```

- [ ] **Step 9: Re-run the existing transforms to confirm parity**

```bash
uv run python -m scripts.transform.build_country_year
uv run python -m scripts.transform.build_assets
uv run python -c "
import duckdb
con = duckdb.connect()
print('country_year rows:', con.execute(\"SELECT COUNT(*) FROM read_parquet('public/data/country_year_series.parquet')\").fetchone())
print('assets rows:', con.execute(\"SELECT COUNT(*) FROM read_parquet('public/data/assets.parquet')\").fetchone())
"
```

Row counts should match Phase 1's: country_year_series ≈ 3,369 rows; assets ≈ 5,008 rows. If counts changed, you broke something — investigate.

- [ ] **Step 10: Lint + commit**

```bash
uv run ruff check scripts/ tests/python/
git add -A
git commit -m "refactor: extract shared NAME_TO_ISO3 to scripts/common/iso3.py"
```

---

## Task 2: Ingest GEM Oil Infrastructure Tracker (pipelines + refineries)

**Files:**
- Create: `scripts/ingest/gem_oil_infra.py`, `data/raw/gem_oil_infra/.gitkeep`
- Output: raw XLSX under `data/raw/gem_oil_infra/` (gitignored)

GEM's Oil Infrastructure Tracker bundles pipelines and refineries in a single workbook. Same access-gating problem as Phase 1's extraction tracker — use the Wayback CDX fallback pattern from `scripts/ingest/gem_extraction.py`.

- [ ] **Step 1: Probe GEM landing page**

```bash
uv run python -c "
import httpx, re
r = httpx.get('https://globalenergymonitor.org/projects/global-oil-infrastructure-tracker/', follow_redirects=True, timeout=60)
print('status:', r.status_code)
for m in re.findall(r'href=\"(https?://[^\"]+\\.xlsx)\"', r.text):
    print(m)
"
```

If no direct .xlsx link, fall back to Wayback CDX:

```bash
uv run python -c "
import httpx
url = 'https://web.archive.org/cdx/search/cdx?url=globalenergymonitor.org/wp-content/*OIL-INFRASTRUCTURE*.xlsx&output=json&limit=10&filter=statuscode:200'
r = httpx.get(url, timeout=30, follow_redirects=True)
print(r.text)
"
```

Also try patterns for `Global-Oil-Infrastructure-Tracker` (case variants).

- [ ] **Step 2: Write `scripts/ingest/gem_oil_infra.py`**

Mirror `scripts/ingest/gem_extraction.py` from Phase 1 — same idempotent pattern with --force flag, prints path. Use CDX-pinned snapshot URL once you find one. Set `RAW_DIR = Path("data/raw/gem_oil_infra")`.

- [ ] **Step 3: Run ingest**

```bash
uv run python -m scripts.ingest.gem_oil_infra
ls -lh data/raw/gem_oil_infra/
```

Should produce a 1–10 MB XLSX.

- [ ] **Step 4: Probe workbook sheets**

```bash
uv run python -c "
from pathlib import Path
import pandas as pd
xlsx = next(Path('data/raw/gem_oil_infra').glob('*.xlsx'))
xl = pd.ExcelFile(xlsx)
print('sheets:', xl.sheet_names)
for s in xl.sheet_names[:8]:
    df = pd.read_excel(xlsx, sheet_name=s, nrows=2)
    print(s, '->', list(df.columns)[:25])
"
```

Look for sheets named "Pipelines", "Refineries", "Main data — pipelines", etc. Record the EXACT sheet names and column names for the next two tasks.

- [ ] **Step 5: Commit**

```bash
git add scripts/ingest/gem_oil_infra.py data/raw/gem_oil_infra/.gitkeep
git commit -m "feat(ingest): GEM Oil Infrastructure Tracker download"
```

(Do NOT commit the XLSX — it's gitignored per `data/raw/.gitignore`.)

---

## Task 3: Transform — build pipelines.parquet (GeoParquet)

**Files:**
- Create: `scripts/transform/build_pipelines.py`
- Output: `public/data/pipelines.parquet` (GeoParquet, LineString)
- Update: `public/data/catalog.json` — append `gem_oil_infrastructure` entry

GEM publishes pipeline route geometry as WKT strings in a column (typically "Route" or "WKT"). For pipelines lacking explicit geometry, GEM provides start/end coordinates which we can stitch as a straight LineString (acceptable approximation for unspecified routes).

- [ ] **Step 1: Inspect the pipelines sheet structure**

```bash
uv run python -c "
from pathlib import Path
import pandas as pd
xlsx = next(Path('data/raw/gem_oil_infra').glob('*.xlsx'))
df = pd.read_excel(xlsx, sheet_name='<pipelines sheet name from Task 2 Step 4>')
print('columns:', list(df.columns))
print('row count:', len(df))
print('status distribution:', df['Status'].value_counts().to_dict() if 'Status' in df.columns else 'no Status col')
# look for WKT column
print('WKT-like cols:', [c for c in df.columns if 'WKT' in c.upper() or 'ROUTE' in c.upper() or 'GEOM' in c.upper()])
"
```

Record the WKT column name. If GEM uses linestrings encoded as WKT, geopandas can parse them via `shapely.wkt.loads`.

- [ ] **Step 2: Write `scripts/transform/build_pipelines.py`**

```python
"""Transform GEM Oil Infrastructure Tracker pipelines sheet → pipelines.parquet (GeoParquet)."""
from __future__ import annotations
from pathlib import Path
import sys

import geopandas as gpd
import pandas as pd
import pyarrow as pa
from shapely import wkt

from scripts.common.iso3 import GEM_NAME_TO_ISO3

RAW_DIR = Path("data/raw/gem_oil_infra")
OUT = Path("public/data/pipelines.parquet")
SOURCE = "Global Energy Monitor — Global Oil Infrastructure Tracker"

# Statuses we keep
KEEP_STATUSES = {"operating", "in-construction"}


def pick_col(df: pd.DataFrame, *candidates: str) -> str | None:
    cmap = {c.lower(): c for c in df.columns}
    for c in candidates:
        if c.lower() in cmap:
            return cmap[c.lower()]
    return None


def main() -> None:
    xlsx = next(RAW_DIR.glob("*.xlsx"), None)
    if xlsx is None:
        sys.exit("no GEM oil infra xlsx — run scripts.ingest.gem_oil_infra first")

    sheet = "<actual pipelines sheet name from probe>"  # TODO: replace with exact name found
    df = pd.read_excel(xlsx, sheet_name=sheet)

    id_col = pick_col(df, "Unit ID", "Pipeline ID", "ID")
    name_col = pick_col(df, "Pipeline name", "Name", "Project name")
    status_col = pick_col(df, "Status")
    commodity_col = pick_col(df, "Material being transported", "Commodity", "Fuel")
    cap_col = pick_col(df, "Capacity (bpd)", "Capacity (boe/d)", "Capacity (kbpd)", "Capacity")
    start_country_col = pick_col(df, "Start country", "Start Country")
    end_country_col = pick_col(df, "End country", "End Country")
    operator_col = pick_col(df, "Owner", "Operator", "Parent")
    length_col = pick_col(df, "Length (km)", "Length")
    wkt_col = pick_col(df, "WKT", "Route WKT", "Geometry WKT", "Route")

    required = [id_col, name_col, status_col, wkt_col]
    if not all(required):
        sys.exit(f"missing required GEM pipeline columns; saw {list(df.columns)}")

    # Status filter — keep operating + in-construction only.
    df["_status_norm"] = df[status_col].astype(str).str.lower().str.strip().str.replace("_", "-")
    df = df[df["_status_norm"].isin(KEEP_STATUSES)].copy()

    # Commodity filter — keep crude only for Phase 2.
    if commodity_col:
        df = df[df[commodity_col].astype(str).str.lower().str.contains("crude|oil", regex=True)]

    # Parse WKT to geometry; drop rows with invalid WKT.
    def safe_wkt(s):
        try:
            return wkt.loads(s) if isinstance(s, str) and s.strip() else None
        except Exception:
            return None

    df["geometry"] = df[wkt_col].map(safe_wkt)
    df = df[df["geometry"].notna()].copy()

    # Capacity in kbpd — normalize. Many GEM rows are bpd; divide by 1000 if so.
    def cap_to_kbpd(v, header=cap_col or ""):
        if v is None or pd.isna(v):
            return None
        v = float(v)
        if "kbpd" in (header or "").lower():
            return v
        if "boe" in (header or "").lower() and "k" not in (header or "").lower():
            return v / 1000.0
        return v / 1000.0  # default: assume bpd

    out = pd.DataFrame({
        "pipeline_id": df[id_col].astype(str),
        "name": df[name_col].astype(str),
        "status": df["_status_norm"],
        "commodity": "crude",
        "capacity_kbpd": df[cap_col].map(cap_to_kbpd) if cap_col else None,
        "start_country_iso3": (
            df[start_country_col].map(lambda n: GEM_NAME_TO_ISO3.get(str(n).strip())) if start_country_col else None
        ),
        "end_country_iso3": (
            df[end_country_col].map(lambda n: GEM_NAME_TO_ISO3.get(str(n).strip())) if end_country_col else None
        ),
        "operator": df[operator_col].astype(str) if operator_col else None,
        "length_km": pd.to_numeric(df[length_col], errors="coerce") if length_col else None,
        "geometry": df["geometry"],
        "source": SOURCE,
        "source_version": xlsx.name,
    })

    gdf = gpd.GeoDataFrame(out, geometry="geometry", crs="EPSG:4326")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    gdf.to_parquet(OUT, compression="zstd")
    print(f"wrote {OUT} rows={len(gdf)} statuses={out['status'].value_counts().to_dict()}")


if __name__ == "__main__":
    main()
```

Replace `"<actual pipelines sheet name from probe>"` with the actual name you found in Task 2 Step 4.

- [ ] **Step 3: Run the transform**

```bash
uv run python -m scripts.transform.build_pipelines
```

Expected: `wrote public/data/pipelines.parquet rows=<N>` where N is in the hundreds (~600-1000 operating + in-construction crude pipelines is realistic for GEM).

- [ ] **Step 4: Sanity-check geometry**

```bash
uv run python -c "
import geopandas as gpd
g = gpd.read_parquet('public/data/pipelines.parquet')
print('crs:', g.crs)
print('geom types:', g.geom_type.value_counts().to_dict())
print('status:', g['status'].value_counts().to_dict())
print('top operators:', g['operator'].value_counts().head(5).to_dict())
print('sample:', g.iloc[0][['name', 'status', 'start_country_iso3', 'end_country_iso3', 'capacity_kbpd']].to_dict())
"
```

Geom types should be LineString (and possibly MultiLineString). CRS should be EPSG:4326.

- [ ] **Step 5: Append catalog entry**

Read `public/data/catalog.json`, append (the entry covers both pipelines and refineries since they're from one source XLSX):

```json
{
  "id": "gem_oil_infrastructure",
  "label": "Oil pipelines + refineries (GEM)",
  "path": "/data/pipelines.parquet",
  "format": "geoparquet",
  "source_name": "Global Energy Monitor",
  "source_url": "https://globalenergymonitor.org/projects/global-oil-infrastructure-tracker/",
  "license": "CC BY 4.0",
  "as_of": "<release version from the GEM file or wayback timestamp>",
  "layers": ["pipelines", "refineries"]
}
```

Update `generated_at`. Validate parser still passes: `pnpm test tests/unit/data-catalog`.

- [ ] **Step 6: Commit**

```bash
uv run ruff check scripts/
git add -A
git commit -m "feat(data): GEM oil pipelines → pipelines.parquet"
```

---

## Task 4: Transform — extend assets.parquet with refinery rows

**Files:**
- Create: `scripts/transform/build_refineries.py`
- Modify: `public/data/assets.parquet` (now contains both `extraction_site` and `refinery` rows)

GEM refineries live in a separate sheet of the oil infrastructure XLSX. We append them to `assets.parquet` rather than create a separate file — the `kind` column already discriminates.

- [ ] **Step 1: Probe the refineries sheet**

```bash
uv run python -c "
from pathlib import Path
import pandas as pd
xlsx = next(Path('data/raw/gem_oil_infra').glob('*.xlsx'))
df = pd.read_excel(xlsx, sheet_name='<refineries sheet name>')
print('columns:', list(df.columns))
print('row count:', len(df))
print('status:', df['Status'].value_counts().to_dict() if 'Status' in df.columns else 'no Status')
"
```

Record exact sheet name and column names. Typical GEM refinery columns: "Unit ID", "Refinery name", "Country", "Latitude", "Longitude", "Operator", "Status", "Capacity (kbpd)", "Refining Type", "Start Year".

- [ ] **Step 2: Write `scripts/transform/build_refineries.py`**

```python
"""Append GEM refineries to assets.parquet as kind='refinery' rows."""
from __future__ import annotations
from pathlib import Path
import sys

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

from scripts.common.iso3 import GEM_NAME_TO_ISO3

RAW_DIR = Path("data/raw/gem_oil_infra")
ASSETS_PATH = Path("public/data/assets.parquet")
SOURCE = "Global Energy Monitor — Global Oil Infrastructure Tracker"


def pick_col(df, *cands):
    cmap = {c.lower(): c for c in df.columns}
    for c in cands:
        if c.lower() in cmap:
            return cmap[c.lower()]
    return None


def main() -> None:
    xlsx = next(RAW_DIR.glob("*.xlsx"), None)
    if xlsx is None:
        sys.exit("no GEM oil infra xlsx")

    sheet = "<refineries sheet name>"  # TODO: replace
    df = pd.read_excel(xlsx, sheet_name=sheet)

    id_col = pick_col(df, "Unit ID", "Refinery ID", "ID")
    name_col = pick_col(df, "Refinery name", "Name", "Unit name")
    country_col = pick_col(df, "Country", "Country/Area")
    lat_col = pick_col(df, "Latitude")
    lon_col = pick_col(df, "Longitude")
    op_col = pick_col(df, "Owner", "Operator", "Parent")
    status_col = pick_col(df, "Status")
    cap_col = pick_col(df, "Capacity (kbpd)", "Crude distillation capacity (kbpd)", "Capacity")
    start_col = pick_col(df, "Start year", "Year of first production")

    required = [id_col, name_col, country_col, lat_col, lon_col, cap_col]
    if not all(required):
        sys.exit(f"refinery sheet missing required cols; saw {list(df.columns)}")

    df["_status_norm"] = df[status_col].astype(str).str.lower().str.strip() if status_col else "operating"
    # Phase 2: keep operating + in-construction only
    df = df[df["_status_norm"].isin(["operating", "in-construction", "in construction"])].copy()
    df["_status_norm"] = df["_status_norm"].replace({"in construction": "in-construction"})

    out = pd.DataFrame({
        "asset_id": df[id_col].astype(str),
        "kind": "refinery",
        "name": df[name_col].astype(str),
        "country_iso3": df[country_col].map(lambda n: GEM_NAME_TO_ISO3.get(str(n).strip())),
        "lon": pd.to_numeric(df[lon_col], errors="coerce"),
        "lat": pd.to_numeric(df[lat_col], errors="coerce"),
        "capacity": pd.to_numeric(df[cap_col], errors="coerce"),
        "capacity_unit": "kbpd",
        "operator": df[op_col].astype(str) if op_col else None,
        "status": df["_status_norm"],
        "commissioned_year": pd.to_numeric(df[start_col], errors="coerce") if start_col else None,
        "decommissioned_year": None,
        "source": SOURCE,
        "source_version": xlsx.name,
    })

    out = out.dropna(subset=["lat", "lon", "country_iso3"]).reset_index(drop=True)
    out["capacity"] = out["capacity"].astype("Float64")
    out["capacity_unit"] = out["capacity_unit"].astype(pd.StringDtype())
    out["commissioned_year"] = out["commissioned_year"].astype("Int64")
    out["decommissioned_year"] = pd.Series([pd.NA] * len(out), dtype="Int64")

    # Read existing assets, drop any existing refinery rows (idempotent), append new ones.
    if ASSETS_PATH.exists():
        existing = pd.read_parquet(ASSETS_PATH)
        existing = existing[existing["kind"] != "refinery"]
    else:
        sys.exit("assets.parquet missing — run scripts.transform.build_assets first")

    combined = pd.concat([existing, out], ignore_index=True)
    pq.write_table(pa.Table.from_pandas(combined, preserve_index=False), ASSETS_PATH, compression="zstd")
    print(f"wrote {ASSETS_PATH} kind=refinery rows={len(out)} total rows={len(combined)}")


if __name__ == "__main__":
    main()
```

Replace `"<refineries sheet name>"` with the real one.

- [ ] **Step 3: Run + verify**

```bash
uv run python -m scripts.transform.build_refineries
uv run python -c "
import duckdb
con = duckdb.connect()
print(con.execute(\"SELECT kind, COUNT(*) FROM read_parquet('public/data/assets.parquet') GROUP BY kind\").fetchall())
# Top countries by refining capacity
print(con.execute(\"SELECT country_iso3, ROUND(SUM(capacity), 0) AS total_kbpd FROM read_parquet('public/data/assets.parquet') WHERE kind='refinery' GROUP BY country_iso3 ORDER BY total_kbpd DESC LIMIT 10\").fetchall())
"
```

Expected: ~700-1000 refineries, top countries by capacity: USA, China, Russia, India, South Korea, Japan, Saudi Arabia. If top-5 doesn't roughly match, something's off — investigate.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(data): GEM refineries → assets.parquet (kind=refinery)"
```

---

## Task 5: Transform — build disruption_route.parquet (4 scenarios)

**Files:**
- Create: `scripts/transform/build_disruption_routing.py`
- Output: `public/data/disruption_route.parquet`
- Deprecate: `public/data/chokepoint_route.parquet` stays in place until Task 9 (engine refactor); not deleted yet to avoid breaking the Phase 1 code on this branch mid-refactor

- [ ] **Step 1: Write the transform**

```python
"""Build disruption_route.parquet covering Hormuz + Druzhba + BTC + CPC scenarios.

Each row: (disruption_id, kind, exporter_iso3, importer_iso3, share, source)

Share semantics:
- For chokepoint disruptions: fraction of exporter's seaborne crude that transits the chokepoint.
- For pipeline disruptions: fraction of exporter→importer trade flow that moves on this pipeline.

Where importer_iso3 is null, the share applies to all importers of that exporter
(used for chokepoints, which affect everyone downstream).
"""
from __future__ import annotations
from pathlib import Path

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

OUT = Path("public/data/disruption_route.parquet")
SRC_EIA = "EIA World Oil Transit Chokepoints"
SRC_IEA_PIPELINE = "EIA / IEA pipeline analysis (Phase 2 simplified)"

# ── Hormuz (existing Phase 1 shares, now namespaced) ────────────────────────
HORMUZ = [
    {"disruption_id": "hormuz", "kind": "chokepoint", "exporter_iso3": "IRN", "importer_iso3": None, "share": 1.00, "source": SRC_EIA},
    {"disruption_id": "hormuz", "kind": "chokepoint", "exporter_iso3": "IRQ", "importer_iso3": None, "share": 1.00, "source": SRC_EIA},
    {"disruption_id": "hormuz", "kind": "chokepoint", "exporter_iso3": "KWT", "importer_iso3": None, "share": 1.00, "source": SRC_EIA},
    {"disruption_id": "hormuz", "kind": "chokepoint", "exporter_iso3": "QAT", "importer_iso3": None, "share": 1.00, "source": SRC_EIA},
    {"disruption_id": "hormuz", "kind": "chokepoint", "exporter_iso3": "SAU", "importer_iso3": None, "share": 0.88, "source": SRC_EIA},
    {"disruption_id": "hormuz", "kind": "chokepoint", "exporter_iso3": "ARE", "importer_iso3": None, "share": 0.65, "source": SRC_EIA},
    {"disruption_id": "hormuz", "kind": "chokepoint", "exporter_iso3": "BHR", "importer_iso3": None, "share": 1.00, "source": SRC_EIA},
]

# ── Druzhba (RUS → CE Europe) ───────────────────────────────────────────────
# Northern branch: Belarus, Poland (mostly halted 2023), Germany (mostly halted 2023).
# Southern branch: Slovakia, Hungary, Czechia (still operating, multiple exemptions).
# These are approximate historical shares; refine if you have a primary source.
DRUZHBA = [
    {"disruption_id": "druzhba", "kind": "pipeline", "exporter_iso3": "RUS", "importer_iso3": "BLR", "share": 1.00, "source": SRC_IEA_PIPELINE},
    {"disruption_id": "druzhba", "kind": "pipeline", "exporter_iso3": "RUS", "importer_iso3": "POL", "share": 0.95, "source": SRC_IEA_PIPELINE},
    {"disruption_id": "druzhba", "kind": "pipeline", "exporter_iso3": "RUS", "importer_iso3": "DEU", "share": 0.60, "source": SRC_IEA_PIPELINE},
    {"disruption_id": "druzhba", "kind": "pipeline", "exporter_iso3": "RUS", "importer_iso3": "SVK", "share": 1.00, "source": SRC_IEA_PIPELINE},
    {"disruption_id": "druzhba", "kind": "pipeline", "exporter_iso3": "RUS", "importer_iso3": "HUN", "share": 1.00, "source": SRC_IEA_PIPELINE},
    {"disruption_id": "druzhba", "kind": "pipeline", "exporter_iso3": "RUS", "importer_iso3": "CZE", "share": 0.90, "source": SRC_IEA_PIPELINE},
]

# ── BTC (Baku-Tbilisi-Ceyhan) ───────────────────────────────────────────────
# Carries ~80-100% of Azerbaijani seaborne crude to Turkey, then onward.
BTC = [
    {"disruption_id": "btc", "kind": "pipeline", "exporter_iso3": "AZE", "importer_iso3": None, "share": 0.90, "source": SRC_IEA_PIPELINE},
]

# ── CPC (Caspian Pipeline Consortium) ───────────────────────────────────────
# Kazakhstan: ~80% of crude exports. Some Russian volumes via CPC blend too.
CPC = [
    {"disruption_id": "cpc", "kind": "pipeline", "exporter_iso3": "KAZ", "importer_iso3": None, "share": 0.80, "source": SRC_IEA_PIPELINE},
    {"disruption_id": "cpc", "kind": "pipeline", "exporter_iso3": "RUS", "importer_iso3": None, "share": 0.10, "source": SRC_IEA_PIPELINE},
]


def main() -> None:
    rows = HORMUZ + DRUZHBA + BTC + CPC
    df = pd.DataFrame(rows)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    pq.write_table(pa.Table.from_pandas(df, preserve_index=False), OUT, compression="zstd")
    counts = df.groupby("disruption_id").size().to_dict()
    print(f"wrote {OUT} rows={len(df)} per-scenario={counts}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run + verify**

```bash
uv run python -m scripts.transform.build_disruption_routing
uv run python -c "
import duckdb
con = duckdb.connect()
print(con.execute(\"SELECT disruption_id, kind, COUNT(*) FROM read_parquet('public/data/disruption_route.parquet') GROUP BY 1, 2 ORDER BY 1\").fetchall())
"
```

Expected: hormuz/chokepoint=7, druzhba/pipeline=6, btc/pipeline=1, cpc/pipeline=2.

- [ ] **Step 3: Update catalog entry**

In `public/data/catalog.json`, rename the existing `chokepoint_route` entry's `id` to `disruption_route`, update `label` to "Disruption routing shares (chokepoints + pipelines)", change `path` to `/data/disruption_route.parquet`, expand `layers` to `["scenario:hormuz", "scenario:druzhba", "scenario:btc", "scenario:cpc"]`. Update `generated_at`.

(Leave `chokepoint_route.parquet` file on disk for now; Task 9 cleanup removes it.)

- [ ] **Step 4: Validate catalog tests**

```bash
pnpm test tests/unit/data-catalog
```

Should pass (2 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(data): disruption_route.parquet with 4 scenarios"
```

---

## Task 6: TDD — extend scenario types

**Files:**
- Modify: `src/lib/scenarios/types.ts`
- Test: tests still in `tests/unit/scenarios/hormuz.test.ts` (existing must keep passing)

- [ ] **Step 1: Read the current types**

```bash
cat src/lib/scenarios/types.ts
```

You should see `TradeFlowRow`, `ChokepointRouteRow`, `ImporterImpact`, `ScenarioResult` from Phase 1.

- [ ] **Step 2: Replace `src/lib/scenarios/types.ts` with the extended types**

```ts
export type ScenarioId = "hormuz" | "druzhba" | "btc" | "cpc";

export interface TradeFlowRow {
  readonly year: number;
  readonly importer_iso3: string;
  readonly exporter_iso3: string;
  readonly qty: number;
}

/** Generalizes Phase 1's ChokepointRouteRow. */
export interface DisruptionRouteRow {
  readonly disruption_id: ScenarioId;
  readonly kind: "chokepoint" | "pipeline";
  readonly exporter_iso3: string;
  /** null = applies to all importers of this exporter */
  readonly importer_iso3: string | null;
  readonly share: number;
}

/** Back-compat alias used by Phase 1's hormuz.ts wrapper. */
export type ChokepointRouteRow = DisruptionRouteRow;

export interface RefineryRow {
  readonly asset_id: string;
  readonly country_iso3: string;
  readonly capacity: number;  // kbpd
}

export interface ImporterImpact {
  readonly iso3: string;
  readonly totalQty: number;
  readonly atRiskQty: number;
  readonly shareAtRisk: number;
}

export interface RefineryImpact {
  readonly asset_id: string;
  readonly iso3: string;
  readonly capacity: number;
  readonly atRiskQty: number;
  readonly shareAtRisk: number;
  readonly topSources: readonly { iso3: string; qty: number }[];
}

export interface ScenarioResult {
  readonly scenarioId: ScenarioId;
  readonly year: number;
  readonly byImporter: readonly ImporterImpact[];
  readonly rankedImporters: readonly ImporterImpact[];
  readonly byRefinery: readonly RefineryImpact[];
  readonly rankedRefineries: readonly RefineryImpact[];
  /** Preserved for back-compat with Phase 1's ScenarioResult shape. */
  readonly chokepoint_id?: string;
  readonly ranked?: readonly ImporterImpact[];
}
```

The `chokepoint_id` and `ranked` optional fields preserve backward compatibility with the existing Phase 1 ScenarioPanel during the refactor. They'll be removed in Task 13's UI cleanup.

- [ ] **Step 3: Run tests — existing Hormuz tests must still pass**

```bash
pnpm test tests/unit/scenarios
```

Expected: PASS — Phase 1's 3 hormuz tests still pass because the existing `hormuz.ts` produces a result satisfying both the old and new shape (we kept the old fields optional).

If tests fail, the old `hormuz.ts` will need a touch-up to populate new fields. Inspect `src/lib/scenarios/hormuz.ts` and add `byImporter`, `rankedImporters`, `scenarioId: "hormuz"` to the returned object (no `byRefinery` yet — that comes in Task 7).

- [ ] **Step 4: Lint + commit**

```bash
pnpm lint
git add -A
git commit -m "feat(scenarios): extend types for refinery impact + scenario registry"
```

---

## Task 7: TDD — generalized scenario engine + refinery impact

**Files:**
- Create: `src/lib/scenarios/engine.ts` (replace existing facade with generic engine)
- Modify: `src/lib/scenarios/hormuz.ts` (becomes thin wrapper)
- Test: `tests/unit/scenarios/refinery-impact.test.ts` (new)
- Test: `tests/unit/scenarios/hormuz.test.ts` (existing — keep passing)

- [ ] **Step 1: Write the failing refinery-impact test**

`tests/unit/scenarios/refinery-impact.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { computeScenarioImpact } from "@/lib/scenarios/engine";

// Synthetic fixture: one refinery in Germany (250 of 2000 capacity = 12.5% share),
// Germany imports 100 from Russia, with Druzhba route share 0.6.
// Expected: refinery historical_feedstock_from_RUS = 100 * 0.125 = 12.5
//           refinery_at_risk = 12.5 * 0.6 = 7.5
//           refinery total feedstock = 12.5 (only RUS) → share_at_risk = 0.6
const tradeFlows = [
  { year: 2022, importer_iso3: "DEU", exporter_iso3: "RUS", qty: 100 },
  { year: 2022, importer_iso3: "DEU", exporter_iso3: "USA", qty: 50 },
];
const routes = [
  { disruption_id: "druzhba" as const, kind: "pipeline" as const, exporter_iso3: "RUS", importer_iso3: "DEU", share: 0.6 },
];
const refineries = [
  { asset_id: "DEU-1", country_iso3: "DEU", capacity: 250 },
  { asset_id: "DEU-2", country_iso3: "DEU", capacity: 1750 },  // larger refinery in same country
];

describe("computeScenarioImpact refinery view", () => {
  it("attributes feedstock by refinery capacity share within country", () => {
    const r = computeScenarioImpact({
      scenarioId: "druzhba",
      year: 2022,
      tradeFlows,
      routes,
      refineries,
    });
    const small = r.byRefinery.find((x) => x.asset_id === "DEU-1");
    expect(small).toBeDefined();
    expect(small!.capacity).toBe(250);
    // Refinery share = 250/2000 = 0.125
    // Total historical feedstock for DEU-1 = 0.125 * (100 + 50) = 18.75
    // At risk: 0.125 * 100 (RUS imports) * 0.6 (druzhba share) = 7.5
    expect(small!.atRiskQty).toBeCloseTo(7.5, 6);
    expect(small!.shareAtRisk).toBeCloseTo(7.5 / 18.75, 6);
  });

  it("ranks refineries by atRiskQty descending", () => {
    const r = computeScenarioImpact({
      scenarioId: "druzhba",
      year: 2022,
      tradeFlows,
      routes,
      refineries,
    });
    expect(r.rankedRefineries[0]?.asset_id).toBe("DEU-2");  // larger refinery → larger absolute at-risk
  });

  it("returns empty topSources when refinery has no historical imports", () => {
    const r = computeScenarioImpact({
      scenarioId: "druzhba",
      year: 2022,
      tradeFlows: [],
      routes,
      refineries: [{ asset_id: "SAU-1", country_iso3: "SAU", capacity: 500 }],
    });
    expect(r.byRefinery[0]?.topSources).toEqual([]);
    expect(r.byRefinery[0]?.shareAtRisk).toBe(0);
  });
});
```

- [ ] **Step 2: Run — should fail (computeScenarioImpact doesn't exist yet)**

```bash
pnpm test tests/unit/scenarios/refinery-impact
```

Expected: FAIL.

- [ ] **Step 3: Write `src/lib/scenarios/engine.ts`**

```ts
import type {
  DisruptionRouteRow,
  ImporterImpact,
  RefineryImpact,
  RefineryRow,
  ScenarioId,
  ScenarioResult,
  TradeFlowRow,
} from "./types";

export interface ScenarioInput {
  readonly scenarioId: ScenarioId;
  readonly year: number;
  readonly tradeFlows: readonly TradeFlowRow[];
  readonly routes: readonly DisruptionRouteRow[];
  readonly refineries?: readonly RefineryRow[];
}

interface SrcQty {
  readonly iso3: string;
  readonly qty: number;
}

export function computeScenarioImpact(input: ScenarioInput): ScenarioResult {
  // Filter routes to this scenario
  const scenarioRoutes = input.routes.filter((r) => r.disruption_id === input.scenarioId);

  // Build share lookup: (exporter, importer | null) → share
  // We split into two maps for fast lookup.
  const sharePerPair = new Map<string, number>();
  const sharePerExporter = new Map<string, number>();
  for (const r of scenarioRoutes) {
    if (r.importer_iso3 === null) {
      sharePerExporter.set(r.exporter_iso3, r.share);
    } else {
      sharePerPair.set(`${r.exporter_iso3}→${r.importer_iso3}`, r.share);
    }
  }
  const lookupShare = (exporter: string, importer: string): number => {
    return sharePerPair.get(`${exporter}→${importer}`) ?? sharePerExporter.get(exporter) ?? 0;
  };

  // First pass: per-importer totals + at-risk
  const totals = new Map<string, number>();
  const atRisk = new Map<string, number>();
  const flowsByImporter = new Map<string, SrcQty[]>();
  for (const row of input.tradeFlows) {
    if (row.year !== input.year) continue;
    totals.set(row.importer_iso3, (totals.get(row.importer_iso3) ?? 0) + row.qty);
    const share = lookupShare(row.exporter_iso3, row.importer_iso3);
    if (share > 0) {
      atRisk.set(row.importer_iso3, (atRisk.get(row.importer_iso3) ?? 0) + row.qty * share);
    }
    const list = flowsByImporter.get(row.importer_iso3) ?? [];
    list.push({ iso3: row.exporter_iso3, qty: row.qty });
    flowsByImporter.set(row.importer_iso3, list);
  }

  const byImporter: ImporterImpact[] = [];
  for (const [iso3, totalQty] of totals) {
    const atRiskQty = atRisk.get(iso3) ?? 0;
    byImporter.push({
      iso3,
      totalQty,
      atRiskQty,
      shareAtRisk: totalQty > 0 ? atRiskQty / totalQty : 0,
    });
  }
  const rankedImporters = [...byImporter].sort((a, b) => b.atRiskQty - a.atRiskQty);

  // Refinery view (only if refineries provided)
  const byRefinery: RefineryImpact[] = [];
  if (input.refineries && input.refineries.length > 0) {
    // Country total refining capacity (for share denominator)
    const countryCap = new Map<string, number>();
    for (const r of input.refineries) {
      countryCap.set(r.country_iso3, (countryCap.get(r.country_iso3) ?? 0) + r.capacity);
    }
    for (const r of input.refineries) {
      const totalCap = countryCap.get(r.country_iso3) ?? 0;
      const refShare = totalCap > 0 ? r.capacity / totalCap : 0;
      const flows = flowsByImporter.get(r.country_iso3) ?? [];
      // historical feedstock per source for this refinery
      const sources = flows.map((f) => ({ iso3: f.iso3, qty: f.qty * refShare }));
      const totalFeedstock = sources.reduce((s, x) => s + x.qty, 0);
      let refAtRisk = 0;
      for (const src of sources) {
        const share = lookupShare(src.iso3, r.country_iso3);
        if (share > 0) refAtRisk += src.qty * share;
      }
      const topSources = [...sources].sort((a, b) => b.qty - a.qty).slice(0, 5);
      byRefinery.push({
        asset_id: r.asset_id,
        iso3: r.country_iso3,
        capacity: r.capacity,
        atRiskQty: refAtRisk,
        shareAtRisk: totalFeedstock > 0 ? refAtRisk / totalFeedstock : 0,
        topSources,
      });
    }
  }
  const rankedRefineries = [...byRefinery].sort((a, b) => b.atRiskQty - a.atRiskQty);

  return {
    scenarioId: input.scenarioId,
    year: input.year,
    byImporter,
    rankedImporters,
    byRefinery,
    rankedRefineries,
    // Back-compat shims for Phase 1 ScenarioPanel:
    chokepoint_id: input.scenarioId,
    ranked: rankedImporters,
  };
}
```

- [ ] **Step 4: Update `src/lib/scenarios/hormuz.ts` to delegate to the generic engine**

```ts
import type { ScenarioResult, TradeFlowRow, DisruptionRouteRow } from "./types";
import { computeScenarioImpact } from "./engine";

export interface HormuzInput {
  readonly year: number;
  readonly tradeFlows: readonly TradeFlowRow[];
  readonly routes: readonly DisruptionRouteRow[];
}

export function computeHormuzImpact(input: HormuzInput): ScenarioResult {
  return computeScenarioImpact({
    scenarioId: "hormuz",
    year: input.year,
    tradeFlows: input.tradeFlows,
    routes: input.routes,
  });
}
```

Existing Phase 1 hormuz tests imported routes with the old field name `chokepoint_id`. Since `DisruptionRouteRow` uses `disruption_id`, the existing tests will FAIL until they're updated. That's fine — we adapt them:

- [ ] **Step 5: Update `tests/unit/scenarios/hormuz.test.ts` field names**

Find the `routes` fixture in that file and replace `chokepoint_id: "hormuz"` with `disruption_id: "hormuz"` AND add `kind: "chokepoint"`. Also add `importer_iso3: null` to every row (Phase 1 didn't have this field).

Example route row:
```ts
{ disruption_id: "hormuz" as const, kind: "chokepoint" as const, exporter_iso3: "SAU", importer_iso3: null, share: 0.88 },
```

The existing assertion `r.byImporter.find((x) => x.iso3 === "IND")` still works because the new result object includes `byImporter`. The old assertion `r.ranked[0]?.iso3 === "CHN"` still works because we preserved `ranked` as a back-compat alias for `rankedImporters`.

- [ ] **Step 6: Run all tests**

```bash
pnpm test
```

Expected: 11/11 pass (8 from Phase 1 + 3 new in refinery-impact.test.ts).

- [ ] **Step 7: Lint + commit**

```bash
pnpm lint
git add -A
git commit -m "feat(scenarios): generalize engine with refinery impact"
```

---

## Task 8: TDD — Druzhba scenario fixture test

**Files:**
- Test: `tests/unit/scenarios/druzhba.test.ts`

Targeted test using realistic Druzhba shares from Task 5.

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect } from "vitest";
import { computeScenarioImpact } from "@/lib/scenarios/engine";

describe("Druzhba scenario", () => {
  it("hits Hungary at ~100%, Germany at ~60%", () => {
    const r = computeScenarioImpact({
      scenarioId: "druzhba",
      year: 2022,
      tradeFlows: [
        // Hungary imports only from Russia (via Druzhba southern)
        { year: 2022, importer_iso3: "HUN", exporter_iso3: "RUS", qty: 100 },
        // Germany imports from Russia (60% via Druzhba) + USA + Norway
        { year: 2022, importer_iso3: "DEU", exporter_iso3: "RUS", qty: 100 },
        { year: 2022, importer_iso3: "DEU", exporter_iso3: "USA", qty: 100 },
        { year: 2022, importer_iso3: "DEU", exporter_iso3: "NOR", qty: 100 },
      ],
      routes: [
        { disruption_id: "druzhba", kind: "pipeline", exporter_iso3: "RUS", importer_iso3: "HUN", share: 1.0 },
        { disruption_id: "druzhba", kind: "pipeline", exporter_iso3: "RUS", importer_iso3: "DEU", share: 0.6 },
      ],
    });
    const hun = r.byImporter.find((x) => x.iso3 === "HUN");
    expect(hun!.shareAtRisk).toBeCloseTo(1.0, 6);
    const deu = r.byImporter.find((x) => x.iso3 === "DEU");
    // DEU at-risk = 100 (RUS) * 0.6 = 60; total = 300; share = 60/300 = 0.2
    expect(deu!.shareAtRisk).toBeCloseTo(60 / 300, 6);
  });

  it("ignores Hormuz-only routes when Druzhba is active", () => {
    const r = computeScenarioImpact({
      scenarioId: "druzhba",
      year: 2022,
      tradeFlows: [{ year: 2022, importer_iso3: "IND", exporter_iso3: "SAU", qty: 100 }],
      routes: [
        { disruption_id: "hormuz", kind: "chokepoint", exporter_iso3: "SAU", importer_iso3: null, share: 0.88 },
      ],
    });
    expect(r.byImporter.find((x) => x.iso3 === "IND")?.shareAtRisk).toBe(0);
  });
});
```

- [ ] **Step 2: Run**

```bash
pnpm test tests/unit/scenarios/druzhba
```

Expected: PASS (2 tests).

- [ ] **Step 3: Commit**

```bash
git add tests/unit/scenarios/druzhba.test.ts
git commit -m "test(scenarios): Druzhba fixture tests"
```

---

## Task 9: TDD — BTC + CPC scenario fixture tests + delete chokepoint_route.parquet

**Files:**
- Test: `tests/unit/scenarios/btc.test.ts`, `tests/unit/scenarios/cpc.test.ts`
- Delete: `public/data/chokepoint_route.parquet`

- [ ] **Step 1: Write `tests/unit/scenarios/btc.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { computeScenarioImpact } from "@/lib/scenarios/engine";

describe("BTC scenario", () => {
  it("hits 90% of Azerbaijani exports regardless of destination", () => {
    const r = computeScenarioImpact({
      scenarioId: "btc",
      year: 2023,
      tradeFlows: [
        { year: 2023, importer_iso3: "ITA", exporter_iso3: "AZE", qty: 60 },
        { year: 2023, importer_iso3: "ISR", exporter_iso3: "AZE", qty: 40 },
      ],
      routes: [
        { disruption_id: "btc", kind: "pipeline", exporter_iso3: "AZE", importer_iso3: null, share: 0.90 },
      ],
    });
    const ita = r.byImporter.find((x) => x.iso3 === "ITA");
    expect(ita!.shareAtRisk).toBeCloseTo(0.9, 6);
    const isr = r.byImporter.find((x) => x.iso3 === "ISR");
    expect(isr!.shareAtRisk).toBeCloseTo(0.9, 6);
  });
});
```

- [ ] **Step 2: Write `tests/unit/scenarios/cpc.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { computeScenarioImpact } from "@/lib/scenarios/engine";

describe("CPC scenario", () => {
  it("hits Kazakhstan exports at 80% and partial Russia at 10%", () => {
    const r = computeScenarioImpact({
      scenarioId: "cpc",
      year: 2023,
      tradeFlows: [
        { year: 2023, importer_iso3: "ITA", exporter_iso3: "KAZ", qty: 100 },
        { year: 2023, importer_iso3: "ITA", exporter_iso3: "RUS", qty: 200 },
      ],
      routes: [
        { disruption_id: "cpc", kind: "pipeline", exporter_iso3: "KAZ", importer_iso3: null, share: 0.80 },
        { disruption_id: "cpc", kind: "pipeline", exporter_iso3: "RUS", importer_iso3: null, share: 0.10 },
      ],
    });
    const ita = r.byImporter.find((x) => x.iso3 === "ITA");
    // ITA at-risk = 100 * 0.8 + 200 * 0.1 = 80 + 20 = 100; total = 300; share = 1/3
    expect(ita!.atRiskQty).toBeCloseTo(100, 6);
    expect(ita!.shareAtRisk).toBeCloseTo(100 / 300, 6);
  });
});
```

- [ ] **Step 3: Run**

```bash
pnpm test tests/unit/scenarios
```

Expected: 9 tests pass (3 hormuz + 3 refinery-impact + 2 druzhba + 1 btc + 1 cpc). Adjust count if I miscounted; just confirm everything green.

- [ ] **Step 4: Delete `chokepoint_route.parquet`**

```bash
git rm public/data/chokepoint_route.parquet
```

The catalog already references `disruption_route.parquet` (per Task 5 Step 3), so nothing else changes.

- [ ] **Step 5: Lint + commit**

```bash
pnpm lint
git add -A
git commit -m "test(scenarios): BTC + CPC fixtures; drop chokepoint_route.parquet"
```

---

## Task 10: Build scenario registry

**Files:**
- Create: `src/lib/scenarios/registry.ts`

The registry powers the UI dropdown and provides per-scenario user-facing copy.

- [ ] **Step 1: Write `src/lib/scenarios/registry.ts`**

```ts
import type { ScenarioId } from "./types";

export interface ScenarioDef {
  readonly id: ScenarioId;
  readonly label: string;
  readonly kind: "chokepoint" | "pipeline";
  readonly description: string;
  readonly noteRecentYears?: string;
}

export const SCENARIOS: readonly ScenarioDef[] = [
  {
    id: "hormuz",
    label: "Close Strait of Hormuz",
    kind: "chokepoint",
    description:
      "Strait between the Persian Gulf and the Gulf of Oman; about 20% of global oil traded by sea transits here. Closure stops nearly all crude exports from Iran, Iraq, Kuwait, Qatar, Bahrain and most from Saudi Arabia and UAE (some bypass via East-West and Fujairah).",
    noteRecentYears:
      "BACI suppresses Iran exports in 2023+. Recent-year impact for partners that historically imported Iranian crude may be understated.",
  },
  {
    id: "druzhba",
    label: "Cut Druzhba pipeline",
    kind: "pipeline",
    description:
      "Soviet-era pipeline carrying Russian crude to Belarus, Poland, Germany (mostly halted 2023), Slovakia, Hungary, and Czechia. Southern branch remains active under EU sanctions exemptions.",
  },
  {
    id: "btc",
    label: "Cut Baku-Tbilisi-Ceyhan",
    kind: "pipeline",
    description:
      "Carries ~90% of Azerbaijani crude from the Caspian to the Mediterranean via Georgia and Turkey, bypassing Russia and the Bosporus.",
  },
  {
    id: "cpc",
    label: "Cut Caspian Pipeline Consortium",
    kind: "pipeline",
    description:
      "Moves ~80% of Kazakh crude (and ~10% of Russian crude) to Novorossiysk on the Black Sea. Has been disrupted multiple times by Russian regulatory and infrastructure decisions.",
  },
];

export function getScenario(id: ScenarioId): ScenarioDef {
  const found = SCENARIOS.find((s) => s.id === id);
  if (!found) throw new Error(`unknown scenario: ${id}`);
  return found;
}
```

- [ ] **Step 2: Lint + commit**

```bash
pnpm lint
git add src/lib/scenarios/registry.ts
git commit -m "feat(scenarios): registry with 4 scenario definitions"
```

---

## Task 11: PipelinesLayer.tsx

**Files:**
- Create: `src/components/layers/PipelinesLayer.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";
import { useEffect, useState } from "react";
import { GeoJsonLayer } from "@deck.gl/layers";
import type { Feature, LineString, MultiLineString } from "geojson";
import { query } from "@/lib/duckdb/query";

interface PipelineRow extends Record<string, unknown> {
  pipeline_id: string;
  name: string;
  status: string;
  capacity_kbpd: number | null;
  start_country_iso3: string | null;
  end_country_iso3: string | null;
  operator: string | null;
  length_km: number | null;
  geometry: { type: string; coordinates: number[][] | number[][][] };
}

type PipelineFeature = Feature<LineString | MultiLineString, PipelineRow>;

export function usePipelinesLayer(visible: boolean) {
  const [layer, setLayer] = useState<GeoJsonLayer | null>(null);
  useEffect(() => {
    if (!visible) {
      setLayer(null);
      return;
    }
    const ctrl = { cancelled: false };
    void (async () => {
      // DuckDB-WASM with spatial extension; geoparquet geometry is materialized as WKB.
      // Use the spatial extension to convert to GeoJSON for client-side rendering.
      const res = await query<PipelineRow>(
        `INSTALL spatial; LOAD spatial;
         SELECT pipeline_id, name, status, capacity_kbpd,
                start_country_iso3, end_country_iso3, operator, length_km,
                ST_AsGeoJSON(geometry)::JSON AS geometry
         FROM read_parquet('/data/pipelines.parquet')`,
      );
      if (ctrl.cancelled) return;

      const features: PipelineFeature[] = res.rows.map((r) => ({
        type: "Feature",
        geometry: r.geometry as unknown as LineString | MultiLineString,
        properties: r,
      }));

      const l = new GeoJsonLayer<PipelineRow>({
        id: "pipelines",
        data: features,
        stroked: true,
        filled: false,
        lineWidthMinPixels: 1.2,
        getLineColor: (f: PipelineFeature) =>
          f.properties.status === "operating" ? [40, 60, 120, 220] : [40, 60, 120, 140],
        getDashArray: (f: PipelineFeature) =>
          f.properties.status === "in-construction" ? [4, 3] : [0, 0],
        dashJustified: true,
        extensions: [],  // PathStyleExtension would be needed for dash; keep simple for Phase 2
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

NOTE on dashed lines: deck.gl's GeoJsonLayer doesn't natively support per-feature `getDashArray` without `@deck.gl/extensions`'s `PathStyleExtension`. For Phase 2's first pass, render in-construction as semi-transparent solid (alpha 140 vs 220) — visually distinguishable, no extra dep. Defer true dashed styling to Phase 3 polish.

Adjust the implementation: remove `getDashArray` / `dashJustified` / `extensions` lines (those are noise without the extension). The alpha-channel differentiation in `getLineColor` is enough.

- [ ] **Step 2: Verify build + lint**

```bash
pnpm build 2>&1 | tail -5
pnpm lint
```

Expected: clean.

- [ ] **Step 3: Commit (it'll be wired into page.tsx in Task 14)**

```bash
git add src/components/layers/PipelinesLayer.tsx
git commit -m "feat(layers): pipelines GeoJsonLayer"
```

---

## Task 12: RefineriesLayer.tsx with scenario-aware coloring

**Files:**
- Create: `src/components/layers/RefineriesLayer.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";
import { useEffect, useState } from "react";
import { ScatterplotLayer } from "@deck.gl/layers";
import { query } from "@/lib/duckdb/query";
import type { RefineryImpact } from "@/lib/scenarios/engine";

interface RefineryRow extends Record<string, unknown> {
  asset_id: string;
  name: string;
  country_iso3: string;
  lon: number;
  lat: number;
  capacity: number | null;
  operator: string | null;
  status: string | null;
}

export interface RefineriesLayerInput {
  readonly visible: boolean;
  readonly impactByAssetId?: ReadonlyMap<string, RefineryImpact>;
}

export function useRefineriesLayer({ visible, impactByAssetId }: RefineriesLayerInput) {
  const [layer, setLayer] = useState<ScatterplotLayer<RefineryRow> | null>(null);
  useEffect(() => {
    if (!visible) {
      setLayer(null);
      return;
    }
    const ctrl = { cancelled: false };
    void (async () => {
      const res = await query<RefineryRow>(
        `SELECT asset_id, name, country_iso3, lon, lat, capacity, operator, status
         FROM read_parquet('/data/assets.parquet')
         WHERE kind = 'refinery'`,
      );
      if (ctrl.cancelled) return;
      const l = new ScatterplotLayer<RefineryRow>({
        id: "refineries",
        data: res.rows,
        getPosition: (d) => [d.lon, d.lat],
        // capacity in kbpd; min radius 3000m, scaled by sqrt(capacity)
        getRadius: (d) => 3_000 + Math.sqrt(Math.max(0, d.capacity ?? 0)) * 400,
        radiusUnits: "meters",
        radiusMinPixels: 2,
        radiusMaxPixels: 14,
        getFillColor: (d) => {
          const impact = impactByAssetId?.get(d.asset_id);
          if (impact && impact.shareAtRisk > 0) {
            const red = Math.round(60 + 180 * impact.shareAtRisk);
            return [red, 30, 30, 230];
          }
          return [30, 80, 160, 200];  // base teal/blue
        },
        stroked: true,
        getLineColor: [20, 20, 40, 220],
        lineWidthMinPixels: 0.5,
        pickable: true,
        updateTriggers: { getFillColor: [impactByAssetId] },
      });
      setLayer(l);
    })();
    return () => {
      ctrl.cancelled = true;
    };
  }, [visible, impactByAssetId]);
  return layer;
}
```

- [ ] **Step 2: Verify build + lint**

```bash
pnpm build 2>&1 | tail -5
pnpm lint
```

- [ ] **Step 3: Commit**

```bash
git add src/components/layers/RefineriesLayer.tsx
git commit -m "feat(layers): refineries layer with scenario-aware coloring"
```

---

## Task 13: LayerPanel + Legend components

**Files:**
- Create: `src/components/layers/LayerPanel.tsx`, `src/components/layers/Legend.tsx`

- [ ] **Step 1: Write `src/components/layers/Legend.tsx`**

```tsx
"use client";

export function Legend() {
  return (
    <div className="space-y-1 text-[10px] leading-tight text-slate-600">
      <div className="flex items-center gap-2">
        <span className="inline-block h-2 w-6 rounded bg-gradient-to-r from-slate-200 to-emerald-700" />
        <span>Reserves: low → high</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="inline-block h-2 w-2 rounded-full bg-red-600" />
        <span>Extraction site</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="inline-block h-0.5 w-6 bg-indigo-700" />
        <span>Pipeline (operating)</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="inline-block h-0.5 w-6 bg-indigo-300" />
        <span>Pipeline (in-construction)</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="inline-block h-2 w-2 rounded-full bg-blue-700" />
        <span>Refinery (size = capacity)</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write `src/components/layers/LayerPanel.tsx`**

```tsx
"use client";
import { Legend } from "./Legend";

export interface LayerState {
  reserves: boolean;
  extraction: boolean;
  pipelines: boolean;
  refineries: boolean;
}

export interface LayerPanelProps {
  readonly state: LayerState;
  readonly onChange: (next: LayerState) => void;
}

const ROWS: { key: keyof LayerState; label: string }[] = [
  { key: "reserves", label: "Reserves (country)" },
  { key: "extraction", label: "Extraction sites" },
  { key: "pipelines", label: "Pipelines" },
  { key: "refineries", label: "Refineries" },
];

export function LayerPanel({ state, onChange }: LayerPanelProps) {
  return (
    <div className="pointer-events-auto absolute left-4 top-4 z-10 w-60 rounded-md bg-white/90 p-3 text-sm shadow-lg backdrop-blur">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-600">Layers</div>
      <div className="space-y-1.5">
        {ROWS.map((r) => (
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
        ))}
      </div>
      <div className="mt-3 border-t border-slate-200 pt-2">
        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-600">Legend</div>
        <Legend />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify build + lint**

```bash
pnpm build 2>&1 | tail -5
pnpm lint
```

- [ ] **Step 4: Commit**

```bash
git add src/components/layers/LayerPanel.tsx src/components/layers/Legend.tsx
git commit -m "feat(ui): layer toggle panel + legend"
```

---

## Task 14: useScenario hook + ScenarioPanel dropdown rewrite

**Files:**
- Create: `src/components/scenarios/useScenario.ts`, `src/components/scenarios/overlay.ts`
- Modify: `src/components/scenarios/ScenarioPanel.tsx`
- Delete (after move): `src/components/scenarios/useHormuzScenario.ts`

- [ ] **Step 1: Write `src/components/scenarios/useScenario.ts`**

```tsx
"use client";
import { useEffect, useState } from "react";
import { computeScenarioImpact, type ScenarioResult, type ScenarioId } from "@/lib/scenarios/engine";
import { query } from "@/lib/duckdb/query";

interface FlowRow extends Record<string, unknown> {
  year: number;
  importer_iso3: string;
  exporter_iso3: string;
  qty: number;
}
interface RouteRow extends Record<string, unknown> {
  disruption_id: ScenarioId;
  kind: "chokepoint" | "pipeline";
  exporter_iso3: string;
  importer_iso3: string | null;
  share: number;
}
interface RefRow extends Record<string, unknown> {
  asset_id: string;
  country_iso3: string;
  capacity: number;
}

export function useScenario(scenarioId: ScenarioId | null, year: number) {
  const [result, setResult] = useState<ScenarioResult | null>(null);
  useEffect(() => {
    if (scenarioId === null) {
      setResult(null);
      return;
    }
    const ctrl = { cancelled: false };
    void (async () => {
      const flows = await query<FlowRow>(
        `SELECT year, importer_iso3, exporter_iso3, COALESCE(qty, 0) AS qty
         FROM read_parquet('/data/trade_flow.parquet')
         WHERE year = ? AND hs_code = '2709'`,
        [year],
      );
      const routes = await query<RouteRow>(
        `SELECT disruption_id, kind, exporter_iso3, importer_iso3, share
         FROM read_parquet('/data/disruption_route.parquet')
         WHERE disruption_id = ?`,
        [scenarioId],
      );
      const refineries = await query<RefRow>(
        `SELECT asset_id, country_iso3, COALESCE(capacity, 0) AS capacity
         FROM read_parquet('/data/assets.parquet')
         WHERE kind = 'refinery' AND capacity IS NOT NULL`,
      );
      if (ctrl.cancelled) return;
      setResult(
        computeScenarioImpact({
          scenarioId,
          year,
          tradeFlows: flows.rows,
          routes: routes.rows,
          refineries: refineries.rows,
        }),
      );
    })();
    return () => {
      ctrl.cancelled = true;
    };
  }, [scenarioId, year]);
  return result;
}
```

- [ ] **Step 2: Write `src/components/scenarios/overlay.ts`**

```ts
import type { ScenarioResult, RefineryImpact } from "@/lib/scenarios/engine";

export function importerOverlay(r: ScenarioResult | null) {
  if (!r) return undefined;
  const m = new Map<string, { color: readonly [number, number, number, number]; tooltip: string }>();
  for (const imp of r.byImporter) {
    const t = imp.shareAtRisk;
    const red = Math.round(80 + 175 * t);
    m.set(imp.iso3, {
      color: [red, 30, 30, 220] as const,
      tooltip: `${imp.iso3}: ${(t * 100).toFixed(1)}% of crude imports at risk`,
    });
  }
  return m;
}

export function refineryImpactMap(r: ScenarioResult | null): ReadonlyMap<string, RefineryImpact> | undefined {
  if (!r) return undefined;
  const m = new Map<string, RefineryImpact>();
  for (const imp of r.byRefinery) m.set(imp.asset_id, imp);
  return m;
}
```

- [ ] **Step 3: Rewrite `src/components/scenarios/ScenarioPanel.tsx`**

```tsx
"use client";
import type { ScenarioResult } from "@/lib/scenarios/engine";
import { SCENARIOS, type ScenarioDef } from "@/lib/scenarios/registry";
import type { ScenarioId } from "@/lib/scenarios/engine";

export interface ScenarioPanelProps {
  readonly active: ScenarioId | null;
  readonly onChange: (id: ScenarioId | null) => void;
  readonly result: ScenarioResult | null;
}

function findScenario(id: ScenarioId): ScenarioDef | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

export function ScenarioPanel({ active, onChange, result }: ScenarioPanelProps) {
  const def = active ? findScenario(active) : undefined;
  const topImporters = result?.rankedImporters.slice(0, 6) ?? [];
  const topRefineries = result?.rankedRefineries.slice(0, 6) ?? [];
  return (
    <div className="pointer-events-auto absolute right-4 top-4 z-10 w-80 rounded-md bg-white/90 p-3 text-sm shadow-lg backdrop-blur">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-600">Scenario</div>
      <select
        value={active ?? ""}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === "" ? null : (v as ScenarioId));
        }}
        className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm"
      >
        <option value="">None</option>
        {SCENARIOS.map((s) => (
          <option key={s.id} value={s.id}>{s.label}</option>
        ))}
      </select>
      {def && (
        <p className="mt-2 text-[10px] leading-tight text-slate-600">{def.description}</p>
      )}
      {def?.noteRecentYears && (
        <p className="mt-2 text-[10px] leading-tight text-amber-700">{def.noteRecentYears}</p>
      )}
      {result && (
        <>
          <div className="mt-3">
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-600">Top importers at risk</div>
            <ol className="space-y-0.5">
              {topImporters.map((r) => (
                <li key={r.iso3} className="flex justify-between font-mono text-xs">
                  <span>{r.iso3}</span>
                  <span>{(r.shareAtRisk * 100).toFixed(1)}%</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="mt-3">
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-600">Top refineries at risk</div>
            <ol className="space-y-0.5">
              {topRefineries.map((r) => (
                <li key={r.asset_id} className="flex justify-between font-mono text-xs">
                  <span className="truncate pr-2">{r.iso3} · {r.capacity.toFixed(0)} kbpd</span>
                  <span>{(r.shareAtRisk * 100).toFixed(1)}%</span>
                </li>
              ))}
            </ol>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Delete the old `useHormuzScenario.ts`**

```bash
git rm src/components/scenarios/useHormuzScenario.ts
```

- [ ] **Step 5: Lint, build**

```bash
pnpm lint
pnpm build 2>&1 | tail -5
```

Build will fail at this point because `page.tsx` still imports `useHormuzScenario` — fix it in Task 15.

- [ ] **Step 6: Commit (build-broken-on-purpose intermediate state)**

```bash
git add -A
git commit -m "feat(scenarios): useScenario hook + dropdown panel"
```

---

## Task 15: Wire everything into page.tsx

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Replace `src/app/page.tsx`**

```tsx
"use client";
import { useCallback, useMemo, useState } from "react";
import type { PickingInfo } from "@deck.gl/core";
import { MapShell } from "@/components/map/MapShell";
import { useReservesChoropleth } from "@/components/layers/ReservesChoropleth";
import { useExtractionPoints } from "@/components/layers/ExtractionPoints";
import { usePipelinesLayer } from "@/components/layers/PipelinesLayer";
import { useRefineriesLayer } from "@/components/layers/RefineriesLayer";
import { LayerPanel, type LayerState } from "@/components/layers/LayerPanel";
import { YearSlider } from "@/components/time-slider/YearSlider";
import { ScenarioPanel } from "@/components/scenarios/ScenarioPanel";
import { useScenario } from "@/components/scenarios/useScenario";
import { importerOverlay, refineryImpactMap } from "@/components/scenarios/overlay";
import type { ScenarioId } from "@/lib/scenarios/engine";

export default function Home() {
  const [year, setYear] = useState(2020);
  const [scenarioId, setScenarioId] = useState<ScenarioId | null>(null);
  const [layers, setLayers] = useState<LayerState>({
    reserves: true,
    extraction: true,
    pipelines: true,
    refineries: true,
  });

  const scenario = useScenario(scenarioId, year);
  const overlay = useMemo(() => importerOverlay(scenario), [scenario]);
  const refImpacts = useMemo(() => refineryImpactMap(scenario), [scenario]);

  const reserves = useReservesChoropleth({ year, ...(overlay !== undefined ? { overlayByIso3: overlay } : {}) });
  const extraction = useExtractionPoints();
  const pipelines = usePipelinesLayer(layers.pipelines);
  const refineries = useRefineriesLayer({
    visible: layers.refineries,
    ...(refImpacts !== undefined ? { impactByAssetId: refImpacts } : {}),
  });

  const visibleLayers = [
    layers.reserves ? reserves : null,
    layers.extraction ? extraction : null,
    pipelines,    // already gated by visible prop
    refineries,
  ].filter((x) => x !== null);

  const getTooltip = useCallback((info: PickingInfo) => {
    const o = info.object as Record<string, unknown> | undefined;
    if (!o) return null;
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
      const capStr = typeof cap === "number" ? `${cap.toFixed(0)} kbpd` : "n/a";
      const impact = refImpacts?.get(o.asset_id as string);
      const lines = [
        `Refinery: ${o.name as string}`,
        `Country: ${o.country_iso3 as string}`,
        `Operator: ${(o.operator as string | null) ?? "n/a"}`,
        `Capacity: ${capStr}`,
      ];
      if (impact && impact.topSources.length > 0) {
        lines.push("");
        lines.push("Historical top sources (capacity-weighted):");
        for (const s of impact.topSources) {
          lines.push(`  ${s.iso3}: ${s.qty.toFixed(1)}`);
        }
        if (impact.shareAtRisk > 0) {
          lines.push("");
          lines.push(`At-risk under scenario: ${(impact.shareAtRisk * 100).toFixed(1)}%`);
        }
      } else if (impact) {
        lines.push("");
        lines.push("Country runs primarily domestic crude — feedstock model not informative.");
      }
      return lines.join("\n");
    }
    if (info.layer?.id === "pipelines") {
      const cap = o.capacity_kbpd;
      const capStr = typeof cap === "number" ? `${cap.toFixed(0)} kbpd` : "n/a";
      return [
        `Pipeline: ${o.name as string}`,
        `Status: ${o.status as string}`,
        `Operator: ${(o.operator as string | null) ?? "n/a"}`,
        `Capacity: ${capStr}`,
        `Length: ${o.length_km == null ? "n/a" : `${(o.length_km as number).toFixed(0)} km`}`,
      ].join("\n");
    }
    if (typeof info.layer?.id === "string" && info.layer.id.startsWith("reserves-")) {
      const props = (o as { properties?: { name?: string; iso3?: string } }).properties;
      return props ? `${props.name ?? ""} (${props.iso3 ?? ""})` : null;
    }
    return null;
  }, [refImpacts]);

  return (
    <main className="relative h-screen w-screen">
      <MapShell layers={visibleLayers} getTooltip={getTooltip} />
      <LayerPanel state={layers} onChange={setLayers} />
      <YearSlider min={1990} max={2020} value={year} onChange={setYear} />
      <ScenarioPanel active={scenarioId} onChange={setScenarioId} result={scenario} />
    </main>
  );
}
```

- [ ] **Step 2: Build, dev server, lint, full test suite**

```bash
pnpm build 2>&1 | tail -5
pnpm lint
pnpm dev &
sleep 8
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000
kill %1 2>/dev/null
pnpm test
```

All exit 0. HTTP 200.

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(app): wire pipelines, refineries, layer panel, scenario dropdown"
```

---

## Task 16: Methodology page update + CLAUDE.md refresh

**Files:**
- Modify: `docs/methodology.md`, `CLAUDE.md`

- [ ] **Step 1: Update `docs/methodology.md`**

Read the existing file, then add sections:
- New under **Scope & approach**: "Phase 2 adds oil pipelines (operating + in-construction), refineries, and three pipeline-cut scenarios (Druzhba, BTC, CPC)."
- New under **Caveats & simplifications**:
  - "Refinery feedstock attribution: refinery `R` in country `C` is assigned its capacity-share of `C`'s BACI imports. This is a country-proxy — refinery slate (API gravity, contract structure, etc.) is NOT modeled. Use as a first-order signal of exposure, not a literal feedstock specification."
  - "Net-supplier refineries (e.g., Saudi Arabia): countries with negligible crude imports show base-color refineries with a 'domestic crude — model not informative' tooltip note."
  - "Pipeline route shares (Druzhba, BTC, CPC) are simplified to canonical operating shares per EIA/IEA pipeline reports. Real shares vary year-to-year with sanctions, maintenance, and joint-ownership renegotiations."
- New under **Attribution**: add `gem_oil_infrastructure` (CC BY 4.0) row.

- [ ] **Step 2: Update `CLAUDE.md`**

In the data sources table, ADD:
- `Pipelines (oil)` row: `Global Energy Monitor Oil Infrastructure Tracker` / `CC BY 4.0` / `Operating + in-construction shipped Phase 2`
- `Refineries` row: same source / `CC BY 4.0` / `Phase 2 — capacity-weighted feedstock model`

In Phase status, update Phase 2 line to "_shipped_" once merged. For now, the plan commit can mark it "_in progress_".

In the schema table, add rows for `pipelines` and the updated `asset` (now includes `kind=refinery`) and `disruption_route` (renamed from `chokepoint_route`).

- [ ] **Step 3: Run full suite + commit**

```bash
pnpm test
pnpm lint
git add docs/methodology.md CLAUDE.md
git commit -m "docs: methodology + CLAUDE.md for Phase 2 (pipelines, refineries, 4 scenarios)"
```

---

## Task 17: Playwright Phase 2 smoke test

**Files:**
- Create: `tests/e2e/phase-2.spec.ts`

- [ ] **Step 1: Write the test**

```ts
import { test, expect } from "@playwright/test";

test("phase 2 critical path", async ({ page }) => {
  page.on("pageerror", (err) => console.error("PAGE ERROR:", err.message));
  await page.goto("/");

  // All four layer checkboxes present
  await expect(page.getByLabel(/Reserves \(country\)/i)).toBeVisible();
  await expect(page.getByLabel(/Extraction sites/i)).toBeVisible();
  await expect(page.getByLabel(/Pipelines/i)).toBeVisible();
  await expect(page.getByLabel(/Refineries/i)).toBeVisible();

  // Layer toggle works (extraction off)
  const extraction = page.getByLabel(/Extraction sites/i);
  await extraction.uncheck();
  await expect(extraction).not.toBeChecked();
  await extraction.check();

  // Scenario dropdown lists all 4 scenarios
  const select = page.locator("select").first();
  await expect(select).toBeVisible();
  const optionLabels = await select.locator("option").allTextContents();
  expect(optionLabels.some((s) => /Hormuz/i.test(s))).toBe(true);
  expect(optionLabels.some((s) => /Druzhba/i.test(s))).toBe(true);
  expect(optionLabels.some((s) => /Baku-Tbilisi-Ceyhan/i.test(s))).toBe(true);
  expect(optionLabels.some((s) => /Caspian/i.test(s))).toBe(true);

  // Select Druzhba — ranked lists populate
  await select.selectOption({ label: /Druzhba/i });
  await expect(page.getByText(/Top importers at risk/i)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Top refineries at risk/i)).toBeVisible({ timeout: 20_000 });

  // About page renders with new sources
  await page.goto("/about");
  await expect(page.getByRole("heading", { name: "Methodology" })).toBeVisible();
  await expect(page.getByText("Global Energy Monitor")).toBeVisible();
});
```

- [ ] **Step 2: Run**

```bash
pnpm test:e2e
```

Expected: 2 passing (phase-1 still passes, phase-2 also passes).

If phase-1 fails because the scenario panel structure changed (Phase 1 looked for a checkbox; Phase 2 has a dropdown), update `tests/e2e/phase-1.spec.ts` to use the same dropdown selector as phase-2. That's an acceptable refactor.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/
git commit -m "test(e2e): Phase 2 critical-path smoke"
```

---

## Task 18: Push, create PR, squash-merge after review

**Files:** none

- [ ] **Step 1: Push the branch**

```bash
git push -u origin phase-2
```

- [ ] **Step 2: Create PR with full Phase 2 summary**

```bash
gh pr create --base main --head phase-2 --title "Phase 2: oil pipelines + refineries + scenario registry" --body "$(cat <<'EOF'
## Summary

- Adds oil **pipelines** (operating + in-construction) and **refineries** layers from GEM Oil Infrastructure Tracker (CC BY 4.0).
- Generalizes the scenario engine into a registry — four scenarios available: Strait of Hormuz, Druzhba cut, BTC cut, CPC cut.
- Adds **refinery feedstock-at-risk view**: capacity-weighted attribution of country-level BACI imports. Refineries restyle by share-at-risk under any active scenario.
- New top-left **Layer panel** with per-layer toggles + legend.
- Scenario panel becomes a `<select>` dropdown with ranked importers + ranked refineries.
- All new code keeps Phase 1's TS strictness (no `any`, no eslint-disable except for documented type bridges).

## Test plan
- [ ] All 4 layer checkboxes visible and individually toggleable
- [ ] Scenario dropdown shows all 4 scenarios
- [ ] Selecting Druzhba restyles Germany / Poland / Hungary; ranked importer + refinery lists populate
- [ ] Refinery hover tooltip shows top-5 historical sources and at-risk %
- [ ] `pnpm test` — 11+ unit tests pass
- [ ] `pnpm test:e2e` — phase-1 + phase-2 specs pass

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Capture the PR URL — stop and report back to controller**

After the PR is created, stop. The controller will run the final whole-branch review before squash-merge.

---

## Phase 2 DoD checklist (final verification after Task 17)

- [ ] `pnpm dev` renders pipelines (operating darker, in-construction lighter) + refineries (blue, size by capacity)
- [ ] Layer panel toggles each layer independently
- [ ] Legend visible
- [ ] Scenario `<select>` shows None + 4 scenarios
- [ ] With Druzhba selected, Germany / Poland / Hungary shade red; ranked importers + refineries populate
- [ ] Refinery hover shows top-5 historical sources + at-risk % when scenario active
- [ ] Net-supplier refineries (SAU) show "domestic crude — model not informative" instead of zero
- [ ] `pnpm test` — 11+ unit tests pass
- [ ] `pnpm test:e2e` — both spec files pass
- [ ] `pnpm lint` clean
- [ ] `pnpm build` clean
- [ ] `/about` lists GEM oil infrastructure source with CC BY 4.0 attribution
- [ ] No `as any` or new `eslint-disable` added

## Known limits (carry to Phase 3)

- Pipeline dashed-line styling is approximated via alpha (true dashes need `@deck.gl/extensions` PathStyleExtension)
- Druzhba / BTC / CPC route shares are Phase 2 simplifications — actual shares vary by year and by sanctions exemptions
- Refinery feedstock is country-proxy only — does NOT model API gravity preferences or contract structure
- Net-supplier heuristic uses a fixed 5%-of-refining-capacity threshold; may need tuning when actual data comes back
