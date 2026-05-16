# Global Energy Map — Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship gas pipelines + LNG export/import terminals as new map layers, a top-chrome Oil/Gas commodity toggle on the reserves choropleth, and the **Hormuz extended to LNG** scenario — multi-commodity refactor of the chokepoint engine. With Hormuz active under commodity=Gas, LNG import terminals restyle by capacity-weighted Qatari-supply exposure.

**Architecture:** Python ingestion of GEM Global Gas Infrastructure Tracker → gas LineString rows appended to `pipelines.parquet`; LNG terminal point rows appended to `assets.parquet` with `kind ∈ {lng_export, lng_import}`. EI workbook gas sheets surfaced as new `proved_reserves_gas_tcm` metric in `country_year_series.parquet`. BACI HS 271111 (LNG) ingested as parallel script to existing HS 270900, merged in `build_trade_flow.py`. Scenario engine extracts refinery math into `refinery.ts`, adds parallel `lng.ts` for LNG import terminals, and grows a `commodity` axis. Frontend gains `CommoditySelector`, `LngTerminalsLayer`, two new layer toggles, and a commodity-aware `ScenarioPanel` that shows LNG ranked list when (commodity=gas, scenario=hormuz).

**Tech Stack:** Same as Phases 1+2 — Next.js 16 App Router, React 19, TS strict, deck.gl 9, maplibre-gl 4, DuckDB-WASM, pnpm 10. Python (uv): httpx, pandas, geopandas, pyarrow, duckdb. Spec: `docs/superpowers/specs/2026-05-16-global-energy-map-phase-3-design.md`.

**Branch:** Create and work on `phase-3`. Do NOT implement on `main`.

---

## Task 1: Create phase-3 branch

**Files:** none (branch only)

- [ ] **Step 1: Branch from latest main**

```bash
cd /Users/narendranag/ai/global-energy-map
git checkout main && git pull
git checkout -b phase-3
```

- [ ] **Step 2: Verify clean working tree**

```bash
git status
```

Expected: "nothing to commit, working tree clean".

---

## Task 2: Extend EI ingestion — gas reserves metric

The Phase 1 transform emits only `proved_reserves_oil_bbn_bbl` and `production_crude_kbpd`. The Oil/Gas choropleth toggle needs a parallel `proved_reserves_gas_tcm` metric, sourced from the EI workbook's `Gas - Proved reserves history ` sheet (note the trailing space — real sheet name).

**Files:**
- Modify: `scripts/transform/build_country_year.py`
- Output: `public/data/country_year_series.parquet` gains gas reserves rows

- [ ] **Step 1: Probe the gas reserves sheet structure**

```bash
uv run python -c "
from pathlib import Path
import pandas as pd
xlsx = next(Path('data/raw/ei_statistical_review').glob('*.xlsx'))
df = pd.read_excel(xlsx, sheet_name='Gas - Proved reserves history ', header=None, nrows=8)
print(df.to_string())
print()
df2 = pd.read_excel(xlsx, sheet_name='Gas - Proved reserves history ', header=2, nrows=5)
print('cols:', list(df2.columns)[:8])
print('unit hint from row 1:')
print(pd.read_excel(xlsx, sheet_name='Gas - Proved reserves history ', header=None, nrows=2).iloc[1].head(3).tolist())
"
```

Record the actual header row and unit string. The existing oil-reserves parse uses `header_row=2, data_start_row=3` — gas may differ by 0–1 rows.

- [ ] **Step 2: Add a third call to `_parse_wide_sheet` in `main()`**

Open `scripts/transform/build_country_year.py`. After the existing two `_parse_wide_sheet` calls in `main()` (around lines 145–165), add a third:

```python
    gas = _parse_wide_sheet(
        sheet_name="Gas - Proved reserves history ",  # trailing space is real
        header_row=<from probe>,
        data_start_row=<header_row + 1>,
        metric="proved_reserves_gas_tcm",
        unit="trillion cubic metres",
    )
```

Then update the combined assignment:

```python
    combined = pd.concat([oil_reserves, oil_production, gas], ignore_index=True)
```

- [ ] **Step 3: Run the transform**

```bash
uv run python -m scripts.transform.build_country_year
```

Expected: `per_metric={'proved_reserves_gas_tcm': <N>, 'production_crude_kbpd': <N>, 'proved_reserves_oil_bbn_bbl': <N>}` where the gas count is in the same order of magnitude as oil reserves (~1500 rows).

- [ ] **Step 4: Verify in DuckDB**

```bash
uv run python -c "
import duckdb
con = duckdb.connect()
print(con.execute(\"SELECT iso3, year, value FROM read_parquet('public/data/country_year_series.parquet') WHERE metric='proved_reserves_gas_tcm' AND year=2020 ORDER BY value DESC LIMIT 5\").fetchall())
"
```

Expected: Russia, Iran, Qatar, Turkmenistan, USA at the top — combined ~50–60% of global gas reserves. Sanity check passes if the top 5 looks right and values are in single-digit Tcm.

- [ ] **Step 5: Commit**

```bash
git add scripts/transform/build_country_year.py public/data/country_year_series.parquet
git commit -m "feat(data): EI gas reserves (Tcm) in country_year_series"
```

---

## Task 3: Ingest BACI HS 271111 (LNG)

**Files:**
- Create: `scripts/ingest/baci_2711.py`
- Output: filtered CSVs under `data/raw/baci/` per year (one per year, hs6=271111)

Mirror `scripts/ingest/baci_2709.py` exactly — the BACI zip structure, year offsets, and country-code handling are identical; only the `HS_CODE_FILTER` constant changes.

- [ ] **Step 1: Copy baci_2709.py to baci_2711.py**

```bash
cp scripts/ingest/baci_2709.py scripts/ingest/baci_2711.py
```

- [ ] **Step 2: Change the HS filter and output filename pattern**

Open `scripts/ingest/baci_2711.py`. Find and change:

```python
HS_CODE_FILTER = 270900
```

to:

```python
HS_CODE_FILTER = 271111
```

Update the module docstring's "crude petroleum (HS6=270900)" → "liquefied natural gas (HS6=271111)" and the script's `print(f"...")` strings that mention 270900.

Find the output filename construction (search for `270900` in the file — it appears in the output CSV name pattern) and change it to write to `data/raw/baci/baci_271111_YYYY.csv`.

- [ ] **Step 3: Run for a recent year as a smoke test**

```bash
uv run python -m scripts.ingest.baci_2711 --year 2022
ls -lh data/raw/baci/baci_271111_2022.csv
```

Expected: a few-hundred-KB CSV.

- [ ] **Step 4: Sanity-check row counts**

```bash
uv run python -c "
import pandas as pd
df = pd.read_csv('data/raw/baci/baci_271111_2022.csv')
print('rows:', len(df))
print('importers:', df['i'].nunique() if 'i' in df.columns else 'unknown col')
print('top exporter codes:', df.groupby('i' if 'i' in df.columns else df.columns[2]).size().nlargest(5).to_dict())
"
```

Expected: 200–600 rows for 2022. Qatar, Australia, USA should dominate as LNG exporters.

- [ ] **Step 5: Run for all years**

```bash
uv run python -m scripts.ingest.baci_2711
ls data/raw/baci/baci_271111_*.csv | wc -l
```

Expected: 30 files (1995–2024). Early years (1995–2005) may have few rows — LNG trade was small until the mid-2000s.

- [ ] **Step 6: Commit**

```bash
git add scripts/ingest/baci_2711.py
git commit -m "feat(ingest): BACI HS 271111 (LNG) bilateral trade"
```

(CSVs under `data/raw/baci/` should already be gitignored.)

---

## Task 4: Extend trade-flow transform to merge HS 270900 + 271111

**Files:**
- Modify: `scripts/transform/build_trade_flow.py`
- Output: `public/data/trade_flow.parquet` gains hs_code='271111' rows alongside existing '2709'

- [ ] **Step 1: Read current build_trade_flow.py to understand its shape**

```bash
sed -n '1,80p' scripts/transform/build_trade_flow.py
```

Note the existing per-year file glob, country-code-to-ISO3 join, and how `hs_code` is set.

- [ ] **Step 2: Generalize the file glob and add an HS-list loop**

In `build_trade_flow.py`, find where it globs `data/raw/baci/baci_2709_*.csv` (or similar). Refactor `main()` to iterate over both HS codes. Replace the single-HS loop with:

```python
HS_CODES: list[tuple[str, str]] = [
    ("2709", "270900"),    # (output hs_code label, BACI file hs6)
    ("271111", "271111"),  # LNG
]

def main() -> None:
    frames: list[pd.DataFrame] = []
    for out_hs, file_hs in HS_CODES:
        for csv_path in sorted(Path("data/raw/baci").glob(f"baci_{file_hs}_*.csv")):
            year = int(csv_path.stem.split("_")[-1])
            df = pd.read_csv(csv_path)
            # ... existing per-file transform (column rename, ISO3 join, etc.) ...
            df["hs_code"] = out_hs
            frames.append(df)
    combined = pd.concat(frames, ignore_index=True)
    # ... existing write to parquet ...
```

Preserve the existing engine convention that crude is labeled `'2709'` (4-digit) so Phase 1+2 `useScenario` queries continue to work untouched. LNG is labeled `'271111'` (6-digit) — engine code will filter explicitly.

- [ ] **Step 3: Run the transform**

```bash
uv run python -m scripts.transform.build_trade_flow
```

- [ ] **Step 4: Verify per-HS row counts**

```bash
uv run python -c "
import duckdb
con = duckdb.connect()
print(con.execute(\"SELECT hs_code, COUNT(*) FROM read_parquet('public/data/trade_flow.parquet') GROUP BY hs_code\").fetchall())
print('2022 LNG top exporters:')
print(con.execute(\"SELECT exporter_iso3, SUM(qty) FROM read_parquet('public/data/trade_flow.parquet') WHERE hs_code='271111' AND year=2022 GROUP BY exporter_iso3 ORDER BY 2 DESC LIMIT 5\").fetchall())
"
```

Expected: two `hs_code` values present; 2022 LNG top exporters dominated by AUS, USA, QAT.

- [ ] **Step 5: Commit**

```bash
git add scripts/transform/build_trade_flow.py public/data/trade_flow.parquet
git commit -m "feat(data): merge HS 270900 + 271111 into trade_flow.parquet"
```

---

## Task 5: Ingest GEM Global Gas Infrastructure Tracker

**Files:**
- Create: `scripts/ingest/gem_gas_infra.py`, `data/raw/gem_gas_infra/.gitkeep`

GEM's Global Gas Infrastructure Tracker bundles gas pipelines and LNG terminals in a single workbook. Same access-gating problem as the oil tracker — copy the Wayback CDX fallback pattern from `scripts/ingest/gem_oil_infra.py`.

- [ ] **Step 1: Probe GEM landing page**

```bash
uv run python -c "
import httpx, re
r = httpx.get('https://globalenergymonitor.org/projects/global-gas-infrastructure-tracker/', follow_redirects=True, timeout=60)
print('status:', r.status_code)
for m in re.findall(r'href=\"(https?://[^\"]+\\.(?:xlsx|geojson|zip))\"', r.text):
    print(m)
"
```

If no direct link, fall back to Wayback CDX:

```bash
uv run python -c "
import httpx
url = 'https://web.archive.org/cdx/search/cdx?url=globalenergymonitor.org/wp-content/*GAS-INFRASTRUCTURE*&output=json&limit=20&filter=statuscode:200'
r = httpx.get(url, timeout=30, follow_redirects=True)
print(r.text)
"
```

GEM has historically released gas data as **GeoJSON** in addition to (or instead of) XLSX — both extensions are worth probing.

- [ ] **Step 2: Write `scripts/ingest/gem_gas_infra.py`**

Mirror `scripts/ingest/gem_oil_infra.py` exactly — same idempotent pattern with `--force` flag, prints the saved path. Use `RAW_DIR = Path("data/raw/gem_gas_infra")`. Save whatever GEM publishes (XLSX, GeoJSON, or a zipped bundle).

- [ ] **Step 3: Run ingest**

```bash
uv run python -m scripts.ingest.gem_gas_infra
ls -lh data/raw/gem_gas_infra/
```

Expected: one or more files totaling 5–30 MB.

- [ ] **Step 4: Probe contents — identify pipelines vs LNG terminals split**

If XLSX:

```bash
uv run python -c "
from pathlib import Path
import pandas as pd
for x in Path('data/raw/gem_gas_infra').glob('*.xlsx'):
    xl = pd.ExcelFile(x)
    print(x.name, '→ sheets:', xl.sheet_names)
"
```

If GeoJSON, identify by inspecting `properties.type` or filename. Record exactly which file/sheet contains:
- Gas pipelines (LineString)
- LNG export terminals (Point)
- LNG import terminals / regasification (Point)

These three are addressed by separate transform tasks below.

- [ ] **Step 5: Commit**

```bash
git add scripts/ingest/gem_gas_infra.py data/raw/gem_gas_infra/.gitkeep
git commit -m "feat(ingest): GEM Global Gas Infrastructure Tracker download"
```

---

## Task 6: Extend pipelines.parquet — gas LineStrings + capacity_unit column

**Files:**
- Modify: `scripts/transform/build_pipelines.py`
- Output: `public/data/pipelines.parquet` (and `.geojson` sidecar) gains gas rows and a `capacity_unit` column

The existing `build_pipelines.py` builds the parquet from GEM oil infra. We extend it to ALSO read GEM gas infra and union the results, adding a `capacity_unit` column populated as `"kbpd"` for crude rows and `"bcm/y"` for gas rows. Single source of truth for `pipelines.parquet` schema stays intact.

- [ ] **Step 1: Inspect the gas pipelines sheet/file**

For XLSX (adjust sheet name):

```bash
uv run python -c "
from pathlib import Path
import pandas as pd
x = next(Path('data/raw/gem_gas_infra').glob('*.xlsx'))
sheet = '<gas pipelines sheet name from Task 5>'
df = pd.read_excel(x, sheet_name=sheet)
print('cols:', list(df.columns))
print('row count:', len(df))
print('status distribution:', df['Status'].value_counts().to_dict() if 'Status' in df.columns else 'no Status')
print('capacity cols:', [c for c in df.columns if 'capacity' in c.lower() or 'bcm' in c.lower() or 'mcfd' in c.lower()])
print('geom-like cols:', [c for c in df.columns if any(k in c.upper() for k in ['WKT','ROUTE','GEOM'])])
"
```

For GeoJSON:

```bash
uv run python -c "
import json
from pathlib import Path
f = next(Path('data/raw/gem_gas_infra').glob('*pipeline*.geojson'))  # adjust
g = json.load(open(f))
print('feature count:', len(g['features']))
print('sample props:', list(g['features'][0]['properties'].keys()))
print('sample geom type:', g['features'][0]['geometry']['type'])
"
```

Record exact column/property names for capacity, units, status, country.

- [ ] **Step 2: Refactor `build_pipelines.py` to a two-source merge**

Open `scripts/transform/build_pipelines.py`. Wrap the existing logic in a function `_load_oil_pipelines() -> gpd.GeoDataFrame` and add a parallel `_load_gas_pipelines() -> gpd.GeoDataFrame`. Both return frames with the same column set, including a new `capacity_unit` column:

```python
def _load_oil_pipelines() -> gpd.GeoDataFrame:
    # existing logic, refactored to return a GeoDataFrame
    # ... at the end, before returning:
    gdf["commodity"] = gdf["commodity"].fillna("crude")
    gdf["capacity_unit"] = "kbpd"
    return gdf


def _load_gas_pipelines() -> gpd.GeoDataFrame:
    src_dir = Path("data/raw/gem_gas_infra")
    # Probe whether GEM gas comes as XLSX or GeoJSON; handle both.
    geojson_files = list(src_dir.glob("*pipeline*.geojson"))
    if geojson_files:
        gdf = gpd.read_file(geojson_files[0])
    else:
        xlsx = next(src_dir.glob("*.xlsx"))
        df = pd.read_excel(xlsx, sheet_name="<gas pipelines sheet>")
        # WKT or start/end coord parsing (mirror oil pipelines pattern)
        # ... build gdf with geometry column ...
    # Filter to operating + in-construction; normalize status field.
    # Keep all gas pipelines (no commodity sub-filter — they're all gas).
    gdf["commodity"] = "gas"
    # GEM gas capacity is typically in bcm/y for pipelines and mtpa for LNG.
    # If the column header indicates bcm or mcfd, use that as the unit; default "bcm/y".
    gdf["capacity_unit"] = "bcm/y"
    # Rename to the unified schema columns: pipeline_id, name, status, commodity,
    # capacity_kbpd (preserve as raw numeric — DO NOT convert to kbpd; we'll keep
    # the source unit and let consumers respect capacity_unit), start_country_iso3,
    # end_country_iso3, operator, length_km, geometry, source, source_version.
    return gdf


def main() -> None:
    oil = _load_oil_pipelines()
    gas = _load_gas_pipelines()
    combined = pd.concat([oil, gas], ignore_index=True)
    gdf = gpd.GeoDataFrame(combined, geometry="geometry", crs="EPSG:4326")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    gdf.to_parquet(OUT, compression="zstd")
    # Sidecar GeoJSON (Phase 2 pattern — PipelinesLayer reads .geojson, not .parquet)
    gdf.to_file(OUT_GEOJSON, driver="GeoJSON")
    print(f"wrote {OUT} rows={len(gdf)} commodities={combined['commodity'].value_counts().to_dict()}")
```

The `capacity_kbpd` column keeps its name for back-compat (Phase 2 frontend reads it via that name) but for gas rows the numeric value is in the source unit (bcm/y or mcfd). The frontend will render the value with the `capacity_unit` suffix in tooltips (Task 17).

- [ ] **Step 3: Run the transform**

```bash
uv run python -m scripts.transform.build_pipelines
```

Expected: `commodities={'crude': <existing N>, 'gas': <new N>}`. Gas should be 300–800 LineStrings (GEM has ~500 operating + in-construction gas pipelines globally).

- [ ] **Step 4: Sanity-check geometry + units**

```bash
uv run python -c "
import geopandas as gpd
g = gpd.read_parquet('public/data/pipelines.parquet')
print('commodity:', g['commodity'].value_counts().to_dict())
print('capacity_unit:', g['capacity_unit'].value_counts().to_dict())
print('gas geom types:', g[g['commodity']=='gas'].geom_type.value_counts().to_dict())
print('gas sample:', g[g['commodity']=='gas'].iloc[0][['name','status','start_country_iso3','end_country_iso3','capacity_kbpd','capacity_unit']].to_dict())
"
```

- [ ] **Step 5: Commit**

```bash
uv run ruff check scripts/
git add scripts/transform/build_pipelines.py public/data/pipelines.parquet public/data/pipelines.geojson
git commit -m "feat(data): gas pipelines in pipelines.parquet + capacity_unit"
```

---

## Task 7: Append LNG export + import terminals to assets.parquet

**Files:**
- Create: `scripts/transform/build_lng_terminals.py`
- Modify: `public/data/assets.parquet` (gains `kind ∈ {lng_export, lng_import}` rows)

GEM LNG terminals come from the same Gas Infrastructure Tracker (either a separate sheet or a separate GeoJSON file). We append two new `kind` values to `assets.parquet`; the existing `kind` discriminator already supports it.

- [ ] **Step 1: Probe the LNG terminals source**

```bash
uv run python -c "
from pathlib import Path
import pandas as pd, json
# XLSX path
for x in Path('data/raw/gem_gas_infra').glob('*.xlsx'):
    xl = pd.ExcelFile(x)
    for s in xl.sheet_names:
        if 'lng' in s.lower() or 'terminal' in s.lower() or 'regas' in s.lower():
            df = pd.read_excel(x, sheet_name=s, nrows=2)
            print(s, '→ cols:', list(df.columns)[:20])
# GeoJSON path
for f in Path('data/raw/gem_gas_infra').glob('*lng*.geojson'):
    g = json.load(open(f))
    print(f.name, '→ sample props:', list(g['features'][0]['properties'].keys())[:20])
"
```

Record:
- The sheet/file containing export terminals (often `FacilityType ∈ {Export, Liquefaction}`)
- The sheet/file containing import terminals (often `FacilityType ∈ {Import, Regasification}`)
- Capacity column name (typically `Capacity (mtpa)` or `Capacity, mtpa`)

GEM may bundle export+import in one "LNG Terminals" sheet differentiated by a `FacilityType` column. If so, split in code by that column.

- [ ] **Step 2: Write `scripts/transform/build_lng_terminals.py`**

```python
"""Append GEM LNG terminals to assets.parquet as kind ∈ {lng_export, lng_import} rows.

Capacity is preserved in mtpa (million tonnes per annum) — the GEM-native unit
for LNG terminals. The `capacity_unit` column on assets.parquet (added here if
absent) discriminates from refinery rows where capacity is kbpd.
"""
from __future__ import annotations
from pathlib import Path
import sys

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

from scripts.common.iso3 import GEM_NAME_TO_ISO3

SRC_DIR = Path("data/raw/gem_gas_infra")
ASSETS_PATH = Path("public/data/assets.parquet")
SOURCE = "Global Energy Monitor — Global Gas Infrastructure Tracker"

# GEM facility-type values that map to our two LNG kinds.
EXPORT_TYPES = {"export", "liquefaction"}
IMPORT_TYPES = {"import", "regasification"}

# Statuses we keep (mirror Phase 2 pipelines)
KEEP_STATUSES = {"operating", "in-construction", "in construction", "construction"}


def pick_col(df: pd.DataFrame, *cands: str) -> str | None:
    cmap = {c.lower(): c for c in df.columns}
    for c in cands:
        if c.lower() in cmap:
            return cmap[c.lower()]
    return None


def _load_terminals() -> pd.DataFrame:
    # Probe XLSX first, fall back to GeoJSON
    xlsx_files = list(SRC_DIR.glob("*.xlsx"))
    if xlsx_files:
        xlsx = xlsx_files[0]
        sheet = "<LNG terminals sheet name from Task 7 Step 1>"
        df = pd.read_excel(xlsx, sheet_name=sheet)
        src_version = xlsx.name
    else:
        import json
        geojson = next(SRC_DIR.glob("*lng*.geojson"))
        g = json.load(open(geojson))
        rows = [{**f["properties"],
                 "Latitude": f["geometry"]["coordinates"][1],
                 "Longitude": f["geometry"]["coordinates"][0]}
                for f in g["features"]]
        df = pd.DataFrame(rows)
        src_version = geojson.name
    df.attrs["src_version"] = src_version
    return df


def main() -> None:
    df = _load_terminals()
    src_version = df.attrs["src_version"]

    id_col = pick_col(df, "Unit ID", "Terminal ID", "ID", "GEM ID")
    name_col = pick_col(df, "Terminal name", "Facility name", "Name")
    country_col = pick_col(df, "Country", "Country/Area")
    lat_col = pick_col(df, "Latitude", "Lat")
    lon_col = pick_col(df, "Longitude", "Lon", "Lng")
    op_col = pick_col(df, "Owner", "Operator", "Parent")
    status_col = pick_col(df, "Status")
    cap_col = pick_col(df, "Capacity (mtpa)", "Capacity, mtpa", "Capacity")
    type_col = pick_col(df, "FacilityType", "Facility Type", "Type")
    start_col = pick_col(df, "Start year", "Year of first production", "StartYear")

    required = [id_col, name_col, country_col, lat_col, lon_col, type_col]
    if not all(required):
        sys.exit(f"LNG terminal source missing required cols; saw {list(df.columns)}")

    df["_status_norm"] = (
        df[status_col].astype(str).str.lower().str.strip().str.replace("_", "-")
        if status_col else "operating"
    )
    df = df[df["_status_norm"].isin(KEEP_STATUSES)].copy()
    df["_status_norm"] = df["_status_norm"].replace({
        "in construction": "in-construction",
        "construction": "in-construction",
    })

    df["_type_norm"] = df[type_col].astype(str).str.lower().str.strip()
    df["_kind"] = df["_type_norm"].map(
        lambda t: "lng_export" if any(k in t for k in EXPORT_TYPES)
        else ("lng_import" if any(k in t for k in IMPORT_TYPES) else None)
    )
    df = df[df["_kind"].notna()].copy()

    out = pd.DataFrame({
        "asset_id": df[id_col].astype(str),
        "kind": df["_kind"],
        "name": df[name_col].astype(str),
        "country_iso3": df[country_col].map(lambda n: GEM_NAME_TO_ISO3.get(str(n).strip())),
        "lon": pd.to_numeric(df[lon_col], errors="coerce"),
        "lat": pd.to_numeric(df[lat_col], errors="coerce"),
        "capacity": pd.to_numeric(df[cap_col], errors="coerce") if cap_col else None,
        "capacity_unit": "mtpa",
        "operator": df[op_col].astype(str) if op_col else None,
        "status": df["_status_norm"],
        "commissioned_year": pd.to_numeric(df[start_col], errors="coerce").astype("Int64") if start_col else None,
        "decommissioned_year": None,
        "source": SOURCE,
        "source_version": src_version,
    })
    out = out[out["country_iso3"].notna() & out["lon"].notna() & out["lat"].notna()].copy()

    # Load existing assets, drop any prior LNG rows (idempotency), append new ones
    existing = pd.read_parquet(ASSETS_PATH)
    # Make sure existing has capacity_unit column; backfill if missing.
    # extraction_site capacity is kboe/d (matches page.tsx tooltip); refinery is kbpd.
    if "capacity_unit" not in existing.columns:
        existing["capacity_unit"] = existing["kind"].map(
            lambda k: {"extraction_site": "kboe/d", "refinery": "kbpd"}.get(k)
        )
    existing = existing[~existing["kind"].isin(["lng_export", "lng_import"])].copy()

    combined = pd.concat([existing, out], ignore_index=True)
    combined.to_parquet(ASSETS_PATH, compression="zstd")
    counts = combined["kind"].value_counts().to_dict()
    print(f"wrote {ASSETS_PATH} kinds={counts} new_lng_rows={len(out)}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 3: Run the transform**

```bash
uv run python -m scripts.transform.build_lng_terminals
```

Expected: `kinds={'extraction_site': <existing>, 'refinery': <existing>, 'lng_export': ~40-80, 'lng_import': ~140-180}` — totals roughly match GEM's ~50 export + ~160 import (varies with operating + in-construction).

- [ ] **Step 4: Sanity-check LNG terminals by country**

```bash
uv run python -c "
import duckdb
con = duckdb.connect()
print('Export terminals by country (top 5):')
print(con.execute(\"SELECT country_iso3, COUNT(*), SUM(capacity) FROM read_parquet('public/data/assets.parquet') WHERE kind='lng_export' GROUP BY country_iso3 ORDER BY 3 DESC NULLS LAST LIMIT 5\").fetchall())
print('Import terminals by country (top 5):')
print(con.execute(\"SELECT country_iso3, COUNT(*), SUM(capacity) FROM read_parquet('public/data/assets.parquet') WHERE kind='lng_import' GROUP BY country_iso3 ORDER BY 3 DESC NULLS LAST LIMIT 5\").fetchall())
"
```

Expected exporters at top: QAT, USA, AUS. Expected importers at top: JPN, CHN, KOR, GBR, ESP.

- [ ] **Step 5: Commit**

```bash
uv run ruff check scripts/
git add scripts/transform/build_lng_terminals.py public/data/assets.parquet
git commit -m "feat(data): LNG export + import terminals in assets.parquet"
```

---

## Task 8: Catalog updates

**Files:**
- Modify: `public/data/catalog.json`

- [ ] **Step 1: Add gem_gas_infrastructure entry; extend baci_2709 and ei_country_year**

Open `public/data/catalog.json`. Bump `version` from `1` to `2`. Update `generated_at` to today's ISO timestamp. Append a new entry and modify two existing ones:

```json
{
  "id": "gem_gas_infrastructure",
  "label": "Gas pipelines + LNG terminals (GEM)",
  "path": "/data/pipelines.parquet",
  "format": "geoparquet",
  "source_name": "Global Energy Monitor",
  "source_url": "https://globalenergymonitor.org/projects/global-gas-infrastructure-tracker/",
  "license": "CC BY 4.0",
  "as_of": "<release version or wayback timestamp from Task 5>",
  "layers": ["gas_pipelines", "lng_terminals"]
}
```

Edit existing `baci_2709` entry:
- Change `label` → `"Crude oil + LNG bilateral trade (HS 2709 + 271111)"`
- Change `layers` → `["trade", "scenario:hormuz", "scenario:hormuz-lng"]`

Edit existing `ei_country_year` entry:
- Change `layers` → `["reserves", "reserves:gas", "production"]`

- [ ] **Step 2: Run the catalog parser test**

```bash
pnpm test tests/unit/data-catalog
```

Expected: PASS (or, if the test asserts the entry count, update the expected count to reflect the new entry).

- [ ] **Step 3: Commit**

```bash
git add public/data/catalog.json
git commit -m "feat(catalog): GEM gas infra entry; relabel baci_2709 for HS 271111; surface gas reserves"
```

---

## Task 9: TDD — extend scenario types

**Files:**
- Modify: `src/lib/scenarios/types.ts`
- Test: `tests/unit/scenarios/types-shape.test.ts` (new)

Type extensions only; no runtime logic change. We TDD by writing a compile-only test that asserts the new shape, which the TS compiler enforces.

- [ ] **Step 1: Write the type-shape test**

`tests/unit/scenarios/types-shape.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import type {
  Commodity,
  LngImportRow,
  LngImportImpact,
  ScenarioDef,
  ScenarioInput,
  ScenarioResult,
} from "@/lib/scenarios/types";

describe("Phase 3 type extensions", () => {
  it("Commodity is a literal union", () => {
    const oil: Commodity = "oil";
    const gas: Commodity = "gas";
    expect([oil, gas]).toEqual(["oil", "gas"]);
  });

  it("LngImportRow has expected shape", () => {
    const row: LngImportRow = { asset_id: "x", country_iso3: "JPN", capacity: 12.5 };
    expect(row.country_iso3).toBe("JPN");
  });

  it("LngImportImpact mirrors RefineryImpact shape", () => {
    const impact: LngImportImpact = {
      asset_id: "x",
      iso3: "JPN",
      capacity: 12.5,
      atRiskQty: 0,
      shareAtRisk: 0,
      topSources: [],
    };
    expect(impact.shareAtRisk).toBe(0);
  });

  it("ScenarioDef carries commodities array", () => {
    const def: ScenarioDef = {
      id: "hormuz",
      label: "test",
      kind: "chokepoint",
      commodities: ["oil", "gas"],
      description: "test",
    };
    expect(def.commodities).toContain("gas");
  });

  it("ScenarioInput carries commodity + optional lngImports", () => {
    const input: ScenarioInput = {
      scenarioId: "hormuz",
      commodity: "gas",
      year: 2022,
      tradeFlows: [],
      routes: [],
      lngImports: [{ asset_id: "x", country_iso3: "JPN", capacity: 12.5 }],
    };
    expect(input.commodity).toBe("gas");
  });

  it("ScenarioResult carries byLngImport + rankedLngImports", () => {
    const result: ScenarioResult = {
      scenarioId: "hormuz",
      commodity: "gas",
      year: 2022,
      byImporter: [],
      rankedImporters: [],
      byRefinery: [],
      rankedRefineries: [],
      byLngImport: [],
      rankedLngImports: [],
    };
    expect(result.byLngImport).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — expect compile failure**

```bash
pnpm test tests/unit/scenarios/types-shape.test.ts
```

Expected: compilation errors on `Commodity`, `LngImportRow`, `LngImportImpact`, `ScenarioDef.commodities`, `ScenarioInput.commodity`, etc.

- [ ] **Step 3: Extend `src/lib/scenarios/types.ts`**

Add to the top of the file:

```typescript
export type Commodity = "oil" | "gas";
```

Add new interfaces:

```typescript
export interface LngImportRow {
  readonly asset_id: string;
  readonly country_iso3: string;
  /** Mtpa. May be 0 when GEM doesn't tag capacity — engine falls back to uniform-within-country. */
  readonly capacity: number;
}

export interface LngImportImpact {
  readonly asset_id: string;
  readonly iso3: string;
  readonly capacity: number;
  readonly atRiskQty: number;
  readonly shareAtRisk: number;
  readonly topSources: readonly { iso3: string; qty: number }[];
}
```

Extend `ScenarioResult`:

```typescript
export interface ScenarioResult {
  readonly scenarioId: ScenarioId;
  readonly commodity: Commodity;                 // NEW
  readonly year: number;
  readonly byImporter: readonly ImporterImpact[];
  readonly rankedImporters: readonly ImporterImpact[];
  readonly byRefinery: readonly RefineryImpact[];
  readonly rankedRefineries: readonly RefineryImpact[];
  readonly byLngImport: readonly LngImportImpact[];      // NEW
  readonly rankedLngImports: readonly LngImportImpact[]; // NEW
  /** Back-compat shims for Phase 1's ScenarioPanel — kept. */
  readonly chokepoint_id?: string;
  readonly ranked?: readonly ImporterImpact[];
}
```

- [ ] **Step 4: Extend `src/lib/scenarios/registry.ts`** — `ScenarioDef` gains `commodities`

Open `src/lib/scenarios/registry.ts`. Update:

```typescript
import type { Commodity, ScenarioId } from "./types";

export interface ScenarioDef {
  readonly id: ScenarioId;
  readonly label: string;
  readonly kind: "chokepoint" | "pipeline";
  readonly commodities: readonly Commodity[];   // NEW
  readonly description: string;
  readonly noteRecentYears?: string;
}
```

Update every entry in `SCENARIOS`. Hormuz gets `commodities: ["oil", "gas"]`; Druzhba, BTC, CPC each get `commodities: ["oil"]`.

- [ ] **Step 5: Extend `src/lib/scenarios/engine.ts`** — `ScenarioInput` gains `commodity` and `lngImports?`

Open `src/lib/scenarios/engine.ts`. Update the interface:

```typescript
import type { Commodity, LngImportRow, /* existing */ } from "./types";

export interface ScenarioInput {
  readonly scenarioId: ScenarioId;
  readonly commodity: Commodity;                          // NEW
  readonly year: number;
  readonly tradeFlows: readonly TradeFlowRow[];
  readonly routes: readonly DisruptionRouteRow[];
  readonly refineries?: readonly RefineryRow[];
  readonly lngImports?: readonly LngImportRow[];          // NEW
}
```

Inside `computeScenarioImpact`, add `commodity: input.commodity` and `byLngImport: []`, `rankedLngImports: []` to the returned object so existing tests still compile. LNG math comes in Task 11.

- [ ] **Step 6: Run the type-shape test — expect PASS**

```bash
pnpm test tests/unit/scenarios/types-shape.test.ts
```

Expected: 6 tests PASS.

- [ ] **Step 7: Run ALL existing scenario tests — expect they still pass**

```bash
pnpm test tests/unit/scenarios/
```

Expected: previous Phase 2 tests (hormuz, druzhba, btc, cpc, refinery-impact) still PASS. They construct `ScenarioInput` without `commodity` — that will now fail compilation. Fix each one by adding `commodity: "oil"` to the input literal.

- [ ] **Step 8: Commit**

```bash
git add src/lib/scenarios/types.ts src/lib/scenarios/registry.ts src/lib/scenarios/engine.ts tests/unit/scenarios/
git commit -m "feat(scenarios): commodity axis + LNG types"
```

---

## Task 10: Extract refinery math into refinery.ts (refactor, no behavior change)

**Files:**
- Create: `src/lib/scenarios/refinery.ts`
- Modify: `src/lib/scenarios/engine.ts`

For symmetry with the new `lng.ts` (Task 11), move the refinery loop body out of `engine.ts` into a focused helper. Pure refactor — all existing tests must still pass byte-for-byte semantics.

- [ ] **Step 1: Create `src/lib/scenarios/refinery.ts`**

```typescript
import type { RefineryImpact, RefineryRow } from "./types";

interface SrcQty {
  readonly iso3: string;
  readonly qty: number;
}

export interface RefineryImpactInput {
  readonly refineries: readonly RefineryRow[];
  readonly flowsByImporter: ReadonlyMap<string, readonly SrcQty[]>;
  readonly lookupShare: (exporter: string, importer: string) => number;
}

export function computeRefineryImpacts({
  refineries,
  flowsByImporter,
  lookupShare,
}: RefineryImpactInput): RefineryImpact[] {
  const countryCap = new Map<string, number>();
  const countryCount = new Map<string, number>();
  for (const r of refineries) {
    countryCap.set(r.country_iso3, (countryCap.get(r.country_iso3) ?? 0) + r.capacity);
    countryCount.set(r.country_iso3, (countryCount.get(r.country_iso3) ?? 0) + 1);
  }

  const out: RefineryImpact[] = [];
  for (const r of refineries) {
    const totalCap = countryCap.get(r.country_iso3) ?? 0;
    const count = countryCount.get(r.country_iso3) ?? 0;
    const refShare =
      totalCap > 0 ? r.capacity / totalCap : count > 0 ? 1 / count : 0;

    const flows = flowsByImporter.get(r.country_iso3) ?? [];
    const sources = flows.map((f) => ({ iso3: f.iso3, qty: f.qty * refShare }));
    const totalFeedstock = sources.reduce((s, x) => s + x.qty, 0);

    let refAtRisk = 0;
    for (const src of sources) {
      const share = lookupShare(src.iso3, r.country_iso3);
      if (share > 0) refAtRisk += src.qty * share;
    }
    const topSources = [...sources].sort((a, b) => b.qty - a.qty).slice(0, 5);

    out.push({
      asset_id: r.asset_id,
      iso3: r.country_iso3,
      capacity: r.capacity,
      atRiskQty: refAtRisk,
      shareAtRisk: totalFeedstock > 0 ? refAtRisk / totalFeedstock : 0,
      topSources,
    });
  }
  return out;
}
```

- [ ] **Step 2: Replace the inline refinery loop in `engine.ts` with a call to `computeRefineryImpacts`**

In `src/lib/scenarios/engine.ts`, delete the existing refinery-loop block (lines roughly 74–113) and replace with:

```typescript
import { computeRefineryImpacts } from "./refinery";

// ... existing code through the byImporter pass ...

const byRefinery =
  input.refineries && input.refineries.length > 0
    ? computeRefineryImpacts({
        refineries: input.refineries,
        flowsByImporter,
        lookupShare,
      })
    : [];
const rankedRefineries = [...byRefinery].sort((a, b) => b.atRiskQty - a.atRiskQty);
```

- [ ] **Step 3: Run ALL scenario tests — expect every one PASS**

```bash
pnpm test tests/unit/scenarios/
```

If any test fails, the refactor introduced behavior change — investigate before proceeding.

- [ ] **Step 4: Commit**

```bash
git add src/lib/scenarios/refinery.ts src/lib/scenarios/engine.ts
git commit -m "refactor(scenarios): extract refinery impact math into refinery.ts"
```

---

## Task 11: TDD — LNG impact math in lng.ts

**Files:**
- Create: `src/lib/scenarios/lng.ts`
- Test: `tests/unit/scenarios/lng-impact.test.ts` (new)

Parallel of `refinery.ts` for LNG import terminals. Capacity-weighted supply-share attribution. Same uniform-within-country fallback when capacity data is missing.

- [ ] **Step 1: Write `tests/unit/scenarios/lng-impact.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { computeLngImportImpacts } from "@/lib/scenarios/lng";
import type { LngImportRow } from "@/lib/scenarios/types";

const flowsByImporter = new Map([
  // JPN imports: 50 from QAT, 30 from AUS, 20 from USA
  ["JPN", [
    { iso3: "QAT", qty: 50 },
    { iso3: "AUS", qty: 30 },
    { iso3: "USA", qty: 20 },
  ]],
  // KOR imports: 60 from QAT, 40 from USA
  ["KOR", [
    { iso3: "QAT", qty: 60 },
    { iso3: "USA", qty: 40 },
  ]],
  // GBR imports: 70 from QAT, 30 from USA  (no terminals fixture — should not appear)
  ["GBR", [
    { iso3: "QAT", qty: 70 },
    { iso3: "USA", qty: 30 },
  ]],
]);

// Hormuz-LNG: QAT → all importers, share=1.0
const lookupShare = (exporter: string, _importer: string) =>
  exporter === "QAT" ? 1.0 : 0;

describe("computeLngImportImpacts", () => {
  it("attributes country imports by terminal capacity share", () => {
    // JPN has 2 terminals: 75 mtpa + 25 mtpa = 100 total → 75% / 25%
    const terms: LngImportRow[] = [
      { asset_id: "JPN-T1", country_iso3: "JPN", capacity: 75 },
      { asset_id: "JPN-T2", country_iso3: "JPN", capacity: 25 },
    ];
    const out = computeLngImportImpacts({ lngImports: terms, flowsByImporter, lookupShare });
    const t1 = out.find((t) => t.asset_id === "JPN-T1")!;
    const t2 = out.find((t) => t.asset_id === "JPN-T2")!;
    // T1 gets 75% of JPN's 100 total → 75, of which 50%*0.75=37.5 is from QAT
    expect(t1.atRiskQty).toBeCloseTo(50 * 0.75, 5);
    expect(t1.shareAtRisk).toBeCloseTo(0.5, 5); // 37.5 / (100 * 0.75)
    expect(t2.atRiskQty).toBeCloseTo(50 * 0.25, 5);
    expect(t2.shareAtRisk).toBeCloseTo(0.5, 5);
  });

  it("falls back to uniform-within-country when all capacities are zero", () => {
    const terms: LngImportRow[] = [
      { asset_id: "KOR-T1", country_iso3: "KOR", capacity: 0 },
      { asset_id: "KOR-T2", country_iso3: "KOR", capacity: 0 },
    ];
    const out = computeLngImportImpacts({ lngImports: terms, flowsByImporter, lookupShare });
    // Each terminal gets 50% of KOR's 100 total → 50; QAT at risk: 60 * 0.5 = 30
    expect(out[0].atRiskQty).toBeCloseTo(30, 5);
    expect(out[0].shareAtRisk).toBeCloseTo(0.6, 5);  // 30/50
    expect(out[1].atRiskQty).toBeCloseTo(30, 5);
  });

  it("returns top-5 sources sorted by attributed qty desc", () => {
    const terms: LngImportRow[] = [
      { asset_id: "JPN-T1", country_iso3: "JPN", capacity: 100 },
    ];
    const out = computeLngImportImpacts({ lngImports: terms, flowsByImporter, lookupShare });
    expect(out[0].topSources.map((s) => s.iso3)).toEqual(["QAT", "AUS", "USA"]);
  });

  it("yields shareAtRisk=0 for a terminal in a country with no imports", () => {
    const terms: LngImportRow[] = [
      { asset_id: "USA-T1", country_iso3: "USA", capacity: 20 },  // net-exporter case
    ];
    const out = computeLngImportImpacts({ lngImports: terms, flowsByImporter, lookupShare });
    expect(out[0].atRiskQty).toBe(0);
    expect(out[0].shareAtRisk).toBe(0);
    expect(out[0].topSources).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — expect failure (module missing)**

```bash
pnpm test tests/unit/scenarios/lng-impact.test.ts
```

Expected: "Cannot find module '@/lib/scenarios/lng'".

- [ ] **Step 3: Write `src/lib/scenarios/lng.ts`**

```typescript
import type { LngImportImpact, LngImportRow } from "./types";

interface SrcQty {
  readonly iso3: string;
  readonly qty: number;
}

export interface LngImportImpactInput {
  readonly lngImports: readonly LngImportRow[];
  readonly flowsByImporter: ReadonlyMap<string, readonly SrcQty[]>;
  readonly lookupShare: (exporter: string, importer: string) => number;
}

export function computeLngImportImpacts({
  lngImports,
  flowsByImporter,
  lookupShare,
}: LngImportImpactInput): LngImportImpact[] {
  const countryCap = new Map<string, number>();
  const countryCount = new Map<string, number>();
  for (const t of lngImports) {
    countryCap.set(t.country_iso3, (countryCap.get(t.country_iso3) ?? 0) + t.capacity);
    countryCount.set(t.country_iso3, (countryCount.get(t.country_iso3) ?? 0) + 1);
  }

  const out: LngImportImpact[] = [];
  for (const t of lngImports) {
    const totalCap = countryCap.get(t.country_iso3) ?? 0;
    const count = countryCount.get(t.country_iso3) ?? 0;
    const termShare = totalCap > 0 ? t.capacity / totalCap : count > 0 ? 1 / count : 0;

    const flows = flowsByImporter.get(t.country_iso3) ?? [];
    const sources = flows.map((f) => ({ iso3: f.iso3, qty: f.qty * termShare }));
    const totalSupply = sources.reduce((s, x) => s + x.qty, 0);

    let termAtRisk = 0;
    for (const src of sources) {
      const share = lookupShare(src.iso3, t.country_iso3);
      if (share > 0) termAtRisk += src.qty * share;
    }
    const topSources = [...sources].sort((a, b) => b.qty - a.qty).slice(0, 5);

    out.push({
      asset_id: t.asset_id,
      iso3: t.country_iso3,
      capacity: t.capacity,
      atRiskQty: termAtRisk,
      shareAtRisk: totalSupply > 0 ? termAtRisk / totalSupply : 0,
      topSources,
    });
  }
  return out;
}
```

- [ ] **Step 4: Run lng-impact tests — expect PASS**

```bash
pnpm test tests/unit/scenarios/lng-impact.test.ts
```

Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scenarios/lng.ts tests/unit/scenarios/lng-impact.test.ts
git commit -m "feat(scenarios): LNG import terminal impact math"
```

---

## Task 12: Wire LNG into the engine; Hormuz-gas fixture test

**Files:**
- Modify: `src/lib/scenarios/engine.ts`
- Test: `tests/unit/scenarios/hormuz-gas.test.ts` (new)

Engine consumes `input.lngImports` when commodity=gas; populates `byLngImport` + `rankedLngImports`. Refinery output goes empty when commodity=gas; LNG output goes empty when commodity=oil.

- [ ] **Step 1: Write `tests/unit/scenarios/hormuz-gas.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { computeScenarioImpact } from "@/lib/scenarios/engine";
import type {
  DisruptionRouteRow,
  LngImportRow,
  TradeFlowRow,
} from "@/lib/scenarios/types";

const hormuzRoutes: DisruptionRouteRow[] = [
  // Phase 2 Hormuz: QAT → all importers, share=1.0
  { disruption_id: "hormuz", kind: "chokepoint", exporter_iso3: "QAT", importer_iso3: null, share: 1.0 },
];

const lngFlows2022: TradeFlowRow[] = [
  { year: 2022, importer_iso3: "JPN", exporter_iso3: "QAT", qty: 50 },
  { year: 2022, importer_iso3: "JPN", exporter_iso3: "AUS", qty: 30 },
  { year: 2022, importer_iso3: "KOR", exporter_iso3: "QAT", qty: 60 },
  { year: 2022, importer_iso3: "GBR", exporter_iso3: "QAT", qty: 70 },
  { year: 2022, importer_iso3: "GBR", exporter_iso3: "USA", qty: 30 },
];

const lngImports: LngImportRow[] = [
  { asset_id: "JPN-T1", country_iso3: "JPN", capacity: 75 },
  { asset_id: "JPN-T2", country_iso3: "JPN", capacity: 25 },
  { asset_id: "KOR-T1", country_iso3: "KOR", capacity: 100 },
  { asset_id: "GBR-T1", country_iso3: "GBR", capacity: 100 },
];

describe("computeScenarioImpact — hormuz under commodity=gas", () => {
  it("populates byLngImport and leaves byRefinery empty", () => {
    const result = computeScenarioImpact({
      scenarioId: "hormuz",
      commodity: "gas",
      year: 2022,
      tradeFlows: lngFlows2022,
      routes: hormuzRoutes,
      lngImports,
    });
    expect(result.commodity).toBe("gas");
    expect(result.byRefinery).toEqual([]);
    expect(result.byLngImport.length).toBe(4);
    // KOR is 100% Qatari → KOR-T1 should be the top-ranked LNG terminal
    expect(result.rankedLngImports[0].asset_id).toBe("KOR-T1");
    expect(result.rankedLngImports[0].shareAtRisk).toBeCloseTo(0.6, 5);
  });

  it("country-level ranked list reflects gas flows, not crude", () => {
    const result = computeScenarioImpact({
      scenarioId: "hormuz",
      commodity: "gas",
      year: 2022,
      tradeFlows: lngFlows2022,
      routes: hormuzRoutes,
      lngImports,
    });
    const gbr = result.byImporter.find((i) => i.iso3 === "GBR")!;
    expect(gbr.totalQty).toBe(100);
    expect(gbr.atRiskQty).toBe(70);   // QAT portion
    expect(gbr.shareAtRisk).toBeCloseTo(0.7, 5);
  });

  it("under commodity=oil with no refineries, byLngImport stays empty", () => {
    const result = computeScenarioImpact({
      scenarioId: "hormuz",
      commodity: "oil",
      year: 2022,
      tradeFlows: lngFlows2022,
      routes: hormuzRoutes,
    });
    expect(result.commodity).toBe("oil");
    expect(result.byLngImport).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — expect failures**

```bash
pnpm test tests/unit/scenarios/hormuz-gas.test.ts
```

Expected: tests fail because `byLngImport` is still empty (Task 9 Step 5 set it to `[]` as a stub).

- [ ] **Step 3: Update `engine.ts` to actually populate the LNG side**

In `src/lib/scenarios/engine.ts`, replace the stub `byLngImport: []` with the real call:

```typescript
import { computeLngImportImpacts } from "./lng";

// ... after rankedRefineries ...

const byLngImport =
  input.lngImports && input.lngImports.length > 0
    ? computeLngImportImpacts({
        lngImports: input.lngImports,
        flowsByImporter,
        lookupShare,
      })
    : [];
const rankedLngImports = [...byLngImport].sort((a, b) => b.atRiskQty - a.atRiskQty);

return {
  scenarioId: input.scenarioId,
  commodity: input.commodity,
  year: input.year,
  byImporter,
  rankedImporters,
  byRefinery,
  rankedRefineries,
  byLngImport,
  rankedLngImports,
  // Back-compat shims for Phase 1's older ScenarioPanel:
  chokepoint_id: input.scenarioId,
  ranked: rankedImporters,
};
```

- [ ] **Step 4: Run all scenario tests — expect all PASS**

```bash
pnpm test tests/unit/scenarios/
```

Expected: 9+ tests PASS (5 from Phase 2 + types-shape + 4 lng-impact + 3 hormuz-gas).

- [ ] **Step 5: Commit**

```bash
git add src/lib/scenarios/engine.ts tests/unit/scenarios/hormuz-gas.test.ts
git commit -m "feat(scenarios): commodity-aware engine; hormuz-gas test"
```

---

## Task 13: CommoditySelector UI component

**Files:**
- Create: `src/components/ui/CommoditySelector.tsx`

A compact two-button pill toggle for Oil | Gas. Used in top chrome near the YearSlider.

- [ ] **Step 1: Write the component**

```bash
mkdir -p src/components/ui
```

```typescript
// src/components/ui/CommoditySelector.tsx
"use client";
import type { Commodity } from "@/lib/scenarios/types";

export interface CommoditySelectorProps {
  readonly value: Commodity;
  readonly onChange: (next: Commodity) => void;
}

export function CommoditySelector({ value, onChange }: CommoditySelectorProps) {
  return (
    <div
      role="group"
      aria-label="Commodity"
      className="pointer-events-auto inline-flex overflow-hidden rounded-md border border-slate-300 bg-white/90 text-xs font-medium shadow-sm backdrop-blur"
    >
      {(["oil", "gas"] as const).map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          aria-pressed={value === c}
          className={
            "px-3 py-1.5 " +
            (value === c
              ? "bg-slate-800 text-white"
              : "bg-transparent text-slate-700 hover:bg-slate-100")
          }
        >
          {c === "oil" ? "Oil" : "Gas"}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify it lints + typechecks**

```bash
pnpm lint
```

Expected: no errors in `src/components/ui/CommoditySelector.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/CommoditySelector.tsx
git commit -m "feat(ui): CommoditySelector pill toggle"
```

---

## Task 14: LngTerminalsLayer

**Files:**
- Create: `src/components/layers/LngTerminalsLayer.tsx`

Scatter-style layer. Filled triangle = export, hollow triangle = import. Capacity-sized (Mtpa). Color responds to scenario impact when commodity=gas, identical pattern to `RefineriesLayer`.

- [ ] **Step 1: Write the layer**

```typescript
// src/components/layers/LngTerminalsLayer.tsx
"use client";
import { useEffect, useState } from "react";
import { IconLayer } from "@deck.gl/layers";
import { query } from "@/lib/duckdb/query";
import type { LngImportImpact } from "@/lib/scenarios/types";

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
}

export interface LngTerminalsLayerInput {
  readonly visible: boolean;
  readonly impactByAssetId?: ReadonlyMap<string, LngImportImpact>;
}

// Inline SVG icons rendered to dataURI so we don't ship sprite assets.
// Filled triangle (export) and hollow triangle (import).
const ICON_ATLAS = "data:image/svg+xml;utf8," + encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="32" viewBox="0 0 64 32">
  <polygon points="16,4 28,28 4,28" fill="white"/>
  <polygon points="48,4 60,28 36,28" fill="none" stroke="white" stroke-width="3"/>
</svg>
`);

const ICON_MAPPING = {
  lng_export: { x: 0, y: 0, width: 32, height: 32, anchorX: 16, anchorY: 28, mask: true },
  lng_import: { x: 32, y: 0, width: 32, height: 32, anchorX: 16, anchorY: 28, mask: true },
} as const;

export function useLngTerminalsLayer({ visible, impactByAssetId }: LngTerminalsLayerInput) {
  const [layer, setLayer] = useState<IconLayer<LngTerminalRow> | null>(null);
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
      const res = await query<LngTerminalRow>(
        `SELECT asset_id, kind, name, country_iso3, lon, lat, capacity, operator, status
         FROM read_parquet('/data/assets.parquet')
         WHERE kind IN ('lng_export', 'lng_import')`,
      );
      if (ctrl.cancelled) return;
      const l = new IconLayer<LngTerminalRow>({
        id: "lng-terminals",
        data: res.rows,
        iconAtlas: ICON_ATLAS,
        iconMapping: ICON_MAPPING,
        getIcon: (d) => d.kind,
        getPosition: (d) => [d.lon, d.lat],
        // Capacity in mtpa; scale similar to refineries (sqrt for area perception)
        getSize: (d) => 14 + Math.sqrt(Math.max(0, d.capacity ?? 0)) * 2.2,
        sizeUnits: "pixels",
        sizeMinPixels: 10,
        sizeMaxPixels: 36,
        getColor: (d) => {
          const impact = impactByAssetId?.get(d.asset_id);
          if (impact && impact.shareAtRisk > 0) {
            const red = Math.round(80 + 175 * impact.shareAtRisk);
            return [red, 30, 30, 230];
          }
          // Base: cyan/teal to contrast with oil's warm palette
          return [20, 130, 160, 230];
        },
        pickable: true,
        updateTriggers: { getColor: [impactByAssetId] },
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

- [ ] **Step 2: Lint + typecheck**

```bash
pnpm lint
```

- [ ] **Step 3: Commit**

```bash
git add src/components/layers/LngTerminalsLayer.tsx
git commit -m "feat(layers): LngTerminalsLayer (IconLayer, export+import)"
```

---

## Task 15: Extend ReservesChoropleth — commodity prop

**Files:**
- Modify: `src/components/layers/ReservesChoropleth.tsx`

- [ ] **Step 1: Add `commodity` prop, conditionally select metric**

Open `src/components/layers/ReservesChoropleth.tsx`. Update the input interface and the SQL:

```typescript
import type { Commodity } from "@/lib/scenarios/types";

export interface ReservesChoroplethInput {
  readonly year: number;
  readonly commodity: Commodity;                                    // NEW
  readonly overlayByIso3?: ReadonlyMap<string, OverlayEntry>;
}

export function useReservesChoropleth({ year, commodity, overlayByIso3 }: ReservesChoroplethInput) {
  // ...
  const metric =
    commodity === "oil" ? "proved_reserves_oil_bbn_bbl" : "proved_reserves_gas_tcm";
  const res = await query<ReservesRow>(
    `SELECT iso3, value FROM read_parquet('/data/country_year_series.parquet')
     WHERE metric = ? AND year = ?`,
    [metric, year],
  );
  // ...
  const styled = new GeoJsonLayer<CountryProps>({
    id: `reserves-${commodity}-${String(year)}-${overlayByIso3 ? "ovl" : "base"}`,
    // ... rest unchanged ...
    updateTriggers: { getFillColor: [year, commodity, overlayByIso3] },
  });
```

The layer `id` includes commodity so deck.gl rebuilds when the toggle flips.

- [ ] **Step 2: Lint**

```bash
pnpm lint
```

Expected: `src/app/page.tsx` will now fail to typecheck because it passes `useReservesChoropleth({ year, ... })` without `commodity`. That's wired in Task 19 — leave the error for now.

- [ ] **Step 3: Commit**

```bash
git add src/components/layers/ReservesChoropleth.tsx
git commit -m "feat(layers): ReservesChoropleth commodity-aware metric"
```

---

## Task 16: Extend PipelinesLayer — gas styled distinctly

**Files:**
- Modify: `src/components/layers/PipelinesLayer.tsx`

`PipelinesLayer` reads `/data/pipelines.geojson`. Gas rows now exist in that file (Task 6). Add commodity-aware coloring; no filter — both commodities render when the toggle is on. (Per design, gas-pipelines is a SEPARATE layer toggle, but the underlying GeoJSON is shared. We split presentation by adding a `commodity` filter on the layer.)

- [ ] **Step 1: Refactor to take an optional `commodityFilter` prop**

Open `src/components/layers/PipelinesLayer.tsx`. Update:

```typescript
export interface PipelinesLayerInput {
  readonly visible: boolean;
  readonly commodityFilter?: "crude" | "gas";   // when set, only render features of this commodity
  readonly id?: string;                          // optional id override so we can mount two layers
}

export function usePipelinesLayer(input: PipelinesLayerInput | boolean): GeoJsonLayer | null {
  // Back-compat: Phase 2 callers passed a boolean. Treat bare `true` as { visible: true }
  // with no commodity filter (renders both crude and gas — preserves old behavior shape
  // until callers migrate).
  const cfg: PipelinesLayerInput =
    typeof input === "boolean" ? { visible: input } : input;
  const { visible, commodityFilter, id } = cfg;

  const [layer, setLayer] = useState<GeoJsonLayer | null>(null);

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
        const fc = await loadPipelines();
        if (ctrl.cancelled) return;

        // Filter features by commodity if requested
        const features = commodityFilter
          ? fc.features.filter((f) => f.properties.commodity === commodityFilter)
          : fc.features;
        const filtered = { ...fc, features };

        const isGas = commodityFilter === "gas";
        const l = new GeoJsonLayer<PipelineProps>({
          id: id ?? (isGas ? "pipelines-gas" : commodityFilter === "crude" ? "pipelines-crude" : "pipelines"),
          data: filtered,
          stroked: true,
          filled: false,
          lineWidthMinPixels: 1.2,
          getLineColor: (f) => {
            // Crude: existing navy palette. Gas: teal/cyan.
            const ops = f.properties.status === "operating";
            if (isGas) return ops ? [20, 140, 160, 220] : [20, 140, 160, 140];
            return ops ? [40, 60, 120, 220] : [40, 60, 120, 140];
          },
          pickable: true,
        });
        setLayer(l);
      } catch (err) {
        console.error("PipelinesLayer load failed:", err);
      }
    })();
    return () => { ctrl.cancelled = true; };
  }, [visible, commodityFilter, id]);

  return layer;
}
```

The back-compat overload (accepting a bare boolean) prevents Phase 2 callers from breaking until `page.tsx` migrates in Task 19.

- [ ] **Step 2: Lint + typecheck**

```bash
pnpm lint
```

- [ ] **Step 3: Commit**

```bash
git add src/components/layers/PipelinesLayer.tsx
git commit -m "feat(layers): commodity-aware PipelinesLayer (oil vs gas)"
```

---

## Task 17: Extend LayerPanel + Legend with gas + LNG toggles

**Files:**
- Modify: `src/components/layers/LayerPanel.tsx`
- Modify: `src/components/layers/Legend.tsx`

- [ ] **Step 1: Update LayerState + ROWS in LayerPanel.tsx**

```typescript
export interface LayerState {
  reserves: boolean;
  extraction: boolean;
  pipelines: boolean;       // crude
  refineries: boolean;
  gas_pipelines: boolean;   // NEW
  lng_terminals: boolean;   // NEW
}

const ROWS: readonly { key: keyof LayerState; label: string }[] = [
  { key: "reserves", label: "Reserves (country)" },
  { key: "extraction", label: "Extraction sites" },
  { key: "pipelines", label: "Oil pipelines" },
  { key: "refineries", label: "Refineries" },
  { key: "gas_pipelines", label: "Gas pipelines" },
  { key: "lng_terminals", label: "LNG terminals" },
];
```

- [ ] **Step 2: Update Legend.tsx with two new rows**

Open `src/components/layers/Legend.tsx`. Add swatches for gas pipelines (teal line) and LNG terminals (filled + hollow triangle). Keep the existing oil swatches unchanged. The exact JSX shape mirrors the existing rows — match local conventions.

- [ ] **Step 3: Lint**

```bash
pnpm lint
```

Expected: `src/app/page.tsx` still fails because its `LayerState` literal doesn't include the new keys. Wired in Task 19.

- [ ] **Step 4: Commit**

```bash
git add src/components/layers/LayerPanel.tsx src/components/layers/Legend.tsx
git commit -m "feat(layers): LayerPanel + Legend gain gas_pipelines + lng_terminals"
```

---

## Task 18: Extend useScenario + ScenarioPanel — commodity-aware

**Files:**
- Modify: `src/components/scenarios/useScenario.ts`
- Modify: `src/components/scenarios/ScenarioPanel.tsx`
- Modify: `src/components/scenarios/overlay.ts`

`useScenario` takes a `commodity` arg, queries the right HS code, and (for gas) loads LNG import terminals instead of refineries. `ScenarioPanel` renders the LNG ranked list when (commodity=gas, scenario active).

- [ ] **Step 1: Update useScenario.ts**

```typescript
"use client";
import { useEffect, useState } from "react";
import { computeScenarioImpact } from "@/lib/scenarios/engine";
import type { Commodity, ScenarioId, ScenarioResult } from "@/lib/scenarios/types";
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
interface AssetRow extends Record<string, unknown> {
  asset_id: string;
  country_iso3: string;
  capacity: number;
}

const HS_BY_COMMODITY: Record<Commodity, string> = {
  oil: "2709",
  gas: "271111",
};

export function useScenario(
  scenarioId: ScenarioId | null,
  year: number,
  commodity: Commodity,
) {
  const [result, setResult] = useState<ScenarioResult | null>(null);
  useEffect(() => {
    if (scenarioId === null) {
      void Promise.resolve().then(() => { setResult(null); });
      return;
    }
    const ctrl = { cancelled: false };
    void (async () => {
      const hs = HS_BY_COMMODITY[commodity];
      const flows = await query<FlowRow>(
        `SELECT CAST(year AS INTEGER) AS year, importer_iso3, exporter_iso3, COALESCE(qty, 0) AS qty
         FROM read_parquet('/data/trade_flow.parquet')
         WHERE year = ? AND hs_code = ?`,
        [year, hs],
      );
      const routes = await query<RouteRow>(
        `SELECT disruption_id, kind, exporter_iso3, importer_iso3, share
         FROM read_parquet('/data/disruption_route.parquet')
         WHERE disruption_id = ?`,
        [scenarioId],
      );
      let refineries: readonly AssetRow[] | undefined;
      let lngImports: readonly AssetRow[] | undefined;
      if (commodity === "oil") {
        const r = await query<AssetRow>(
          `SELECT asset_id, country_iso3, COALESCE(capacity, 0) AS capacity
           FROM read_parquet('/data/assets.parquet')
           WHERE kind = 'refinery'`,
        );
        refineries = r.rows;
      } else {
        const r = await query<AssetRow>(
          `SELECT asset_id, country_iso3, COALESCE(capacity, 0) AS capacity
           FROM read_parquet('/data/assets.parquet')
           WHERE kind = 'lng_import'`,
        );
        lngImports = r.rows;
      }
      if (ctrl.cancelled) return;
      setResult(
        computeScenarioImpact({
          scenarioId,
          commodity,
          year,
          tradeFlows: flows.rows,
          routes: routes.rows,
          ...(refineries !== undefined ? { refineries } : {}),
          ...(lngImports !== undefined ? { lngImports } : {}),
        }),
      );
    })();
    return () => { ctrl.cancelled = true; };
  }, [scenarioId, year, commodity]);
  return result;
}
```

- [ ] **Step 2: Update ScenarioPanel.tsx**

```typescript
"use client";
import type { Commodity, ScenarioId, ScenarioResult } from "@/lib/scenarios/types";
import { SCENARIOS, type ScenarioDef } from "@/lib/scenarios/registry";

export interface ScenarioPanelProps {
  readonly active: ScenarioId | null;
  readonly onChange: (id: ScenarioId | null) => void;
  readonly commodity: Commodity;
  readonly result: ScenarioResult | null;
}

function findScenario(id: ScenarioId): ScenarioDef | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

export function ScenarioPanel({ active, onChange, commodity, result }: ScenarioPanelProps) {
  const def = active ? findScenario(active) : undefined;
  // Filter the dropdown to scenarios applicable to the active commodity.
  const visibleScenarios = SCENARIOS.filter((s) => s.commodities.includes(commodity));
  const topImporters = result?.rankedImporters.slice(0, 6) ?? [];
  const showLng = commodity === "gas";
  const topAssets = showLng
    ? result?.rankedLngImports.slice(0, 6) ?? []
    : result?.rankedRefineries.slice(0, 6) ?? [];
  const assetLabel = showLng ? "Top LNG import terminals at risk" : "Top refineries at risk";
  const assetUnit = showLng ? "mtpa" : "kbpd";

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
        {visibleScenarios.map((s) => (
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
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-600">{assetLabel}</div>
            <ol className="space-y-0.5">
              {topAssets.map((r) => {
                // Both RefineryImpact and LngImportImpact have asset_id, iso3, capacity, shareAtRisk
                const a = r as { asset_id: string; iso3: string; capacity: number; shareAtRisk: number };
                return (
                  <li key={a.asset_id} className="flex justify-between font-mono text-xs">
                    <span className="truncate pr-2">{a.iso3} · {a.capacity.toFixed(0)} {assetUnit}</span>
                    <span>{(a.shareAtRisk * 100).toFixed(1)}%</span>
                  </li>
                );
              })}
            </ol>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Update overlay.ts to expose an LNG asset-impact map**

Open `src/components/scenarios/overlay.ts`. Find `refineryImpactMap` and add a parallel:

```typescript
import type { LngImportImpact } from "@/lib/scenarios/types";

export function lngImportImpactMap(
  result: ScenarioResult | null,
): ReadonlyMap<string, LngImportImpact> | undefined {
  if (!result || result.byLngImport.length === 0) return undefined;
  return new Map(result.byLngImport.map((i) => [i.asset_id, i]));
}
```

Keep `refineryImpactMap` unchanged.

- [ ] **Step 4: Lint + run all unit tests**

```bash
pnpm lint
pnpm test
```

`page.tsx` will still fail typecheck; that's wired in Task 19. Unit tests should all pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/scenarios/useScenario.ts src/components/scenarios/ScenarioPanel.tsx src/components/scenarios/overlay.ts
git commit -m "feat(scenarios): commodity-aware useScenario + LNG-aware ScenarioPanel"
```

---

## Task 19: Wire everything into page.tsx

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Update imports and state**

Open `src/app/page.tsx`. Replace the file content with:

```typescript
"use client";
import { useCallback, useMemo, useState } from "react";
import type { PickingInfo } from "@deck.gl/core";
import { MapShell } from "@/components/map/MapShell";
import { useReservesChoropleth } from "@/components/layers/ReservesChoropleth";
import { useExtractionPoints } from "@/components/layers/ExtractionPoints";
import { usePipelinesLayer } from "@/components/layers/PipelinesLayer";
import { useRefineriesLayer } from "@/components/layers/RefineriesLayer";
import { useLngTerminalsLayer } from "@/components/layers/LngTerminalsLayer";
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

export default function Home() {
  const [year, setYear] = useState(2020);
  const [commodity, setCommodity] = useState<Commodity>("oil");
  const [scenarioId, setScenarioId] = useState<ScenarioId | null>(null);
  const [layers, setLayers] = useState<LayerState>({
    reserves: true,
    extraction: true,
    pipelines: true,
    refineries: true,
    gas_pipelines: true,
    lng_terminals: true,
  });

  const scenario = useScenario(scenarioId, year, commodity);
  const overlay = useMemo(() => importerOverlay(scenario), [scenario]);
  const refImpacts = useMemo(() => refineryImpactMap(scenario), [scenario]);
  const lngImpacts = useMemo(() => lngImportImpactMap(scenario), [scenario]);

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
  const lngTerminals = useLngTerminalsLayer({
    visible: layers.lng_terminals,
    ...(lngImpacts !== undefined ? { impactByAssetId: lngImpacts } : {}),
  });

  const visibleLayers = [
    layers.reserves ? reserves : null,
    layers.extraction ? extraction : null,
    oilPipes,       // already gated by visible prop
    gasPipes,       // already gated by visible prop
    refineries,     // already gated by visible prop
    lngTerminals,   // already gated by visible prop
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
      const capStr = typeof cap === "number" && cap > 0 ? `${cap.toFixed(0)} kbpd` : "n/a";
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
        lines.push("");
        lines.push("Historical top sources (capacity-weighted):");
        for (const s of impact.topSources) {
          lines.push(`  ${s.iso3}: ${s.qty.toFixed(1)}`);
        }
        if (impact.shareAtRisk > 0) {
          lines.push("");
          lines.push(`At-risk under scenario: ${(impact.shareAtRisk * 100).toFixed(1)}%`);
        }
      }
      return lines.join("\n");
    }
    if (info.layer?.id?.startsWith("pipelines-")) {
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
  }, [refImpacts, lngImpacts]);

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
```

Expected: zero errors. If the lint complains about the `info.layer?.id?.startsWith` chain, replace with the safe form `(info.layer?.id ?? "").startsWith(...)`.

- [ ] **Step 3: Run dev server and smoke-test in a browser**

```bash
pnpm dev
```

Open http://localhost:3000:
- Reserves choropleth renders (oil). Click Gas → choropleth restyles using `proved_reserves_gas_tcm`.
- Scroll the year slider — values change.
- Layer panel has 6 toggles; toggling each shows/hides the respective layer.
- Open scenario dropdown under commodity=Oil → see Hormuz/Druzhba/BTC/CPC. Switch to commodity=Gas → see only Hormuz.
- Pick Hormuz under commodity=Gas → ranked panel shows "Top LNG import terminals at risk" with KOR / JPN / GBR at top.
- Hover an LNG terminal → tooltip shows top sources + at-risk share when scenario is active.

If any of the above fail, fix before committing. Open the browser DevTools console — there should be no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(app): wire commodity selector + LNG layer + Hormuz-gas"
```

---

## Task 20: Methodology + CLAUDE.md updates

**Files:**
- Modify: `docs/methodology.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update methodology.md**

Open `docs/methodology.md`. Add a new section "Phase 3 — Natural gas + LNG" near the existing "Phase 2 — Oil pipelines + refineries" section. Cover:

```markdown
### Gas pipelines + LNG terminals

Source: **Global Energy Monitor — Global Gas Infrastructure Tracker** (CC BY 4.0). Filtered to operating + in-construction. Pipeline capacity is preserved in source units (typically bcm/y); LNG terminal capacity is preserved in mtpa.

Data: Global Energy Monitor, CC BY 4.0. https://globalenergymonitor.org/projects/global-gas-infrastructure-tracker/

### LNG trade flows — HS code choice

BACI HS 271111 (liquefied natural gas) is used for the Hormuz-LNG scenario specifically because the Strait of Hormuz only affects waterborne (liquefied) gas — pipeline gas (HS 271121) does not transit chokepoints. Aggregating to HS 2711 would mix the two and overstate Hormuz's reach.

### LNG terminal feedstock attribution

For each LNG import terminal `T` in country `C`, year `Y`:

```
terminal_capacity_share     = T.capacity / Σ(capacity of LNG import terminals in C)
country_lng_imports_from_X  = BACI[271111, Y].importer=C, exporter=X
historical_lng_from_X(T)    = terminal_capacity_share × country_lng_imports_from_X
```

With a scenario active, `terminal_at_risk = Σ_X historical_lng_from_X(T) × route_share(scenario, X, C)` and `terminal_share_at_risk = terminal_at_risk / Σ_X historical_lng_from_X(T)`. Terminals in countries with no LNG imports show zero exposure with a tooltip note.

Caveat (mirrors refinery model): contracted-offtake data is not used; attribution is purely capacity-weighted on import volumes. This is the country-proxy approximation, not actual cargo-level allocation.

### Gas reserves

Source: **Energy Institute Statistical Review of World Energy** — sheet `Gas - Proved reserves history`. Unit: trillion cubic metres (Tcm). Same temporal coverage as oil reserves.
```

- [ ] **Step 2: Update CLAUDE.md**

Open `CLAUDE.md`. Update the schema table to include LNG kinds:

```markdown
| `asset` | asset_id, kind (extraction_site, refinery, lng_export, lng_import), name, iso3, lon, lat, capacity, capacity_unit, ... | GEM trackers + OpenStreetMap |
| `pipelines` | pipeline_id, name, status, commodity (crude, gas), capacity_kbpd, capacity_unit, operator, geom | GEM oil + gas infrastructure trackers |
```

Update the phase-status block:

```markdown
- **Phase 1** — _shipped 2026-05-15_ ...
- **Phase 2** — _shipped 2026-05-15_ ...
- **Phase 3** — _in progress 2026-05-16_ (gas pipelines + LNG terminals + Hormuz-LNG scenario)
- **Phase 4** — pending ...
```

(Flip to "shipped" once the PR merges, in Task 23.)

- [ ] **Step 3: Commit**

```bash
git add docs/methodology.md CLAUDE.md
git commit -m "docs: Phase 3 methodology + CLAUDE.md updates"
```

---

## Task 21: Playwright Phase 3 smoke test

**Files:**
- Create: `tests/e2e/phase-3.spec.ts`

- [ ] **Step 1: Write the e2e**

```typescript
// tests/e2e/phase-3.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Phase 3 — gas + LNG + Hormuz-LNG", () => {
  test("commodity toggle restyles the choropleth", async ({ page }) => {
    await page.goto("/");
    // Wait for initial render
    await page.waitForSelector("canvas");
    const gasBtn = page.getByRole("button", { name: "Gas" });
    await expect(gasBtn).toBeVisible();
    await gasBtn.click();
    await expect(gasBtn).toHaveAttribute("aria-pressed", "true");
    // Canvas should still be present (a soft check — full pixel-diff is overkill here)
    await page.waitForTimeout(500);
    await expect(page.locator("canvas")).toBeVisible();
  });

  test("gas pipeline + LNG layer toggles in the layer panel", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByLabel("Gas pipelines")).toBeVisible();
    await expect(page.getByLabel("LNG terminals")).toBeVisible();
    // Toggle gas pipelines off then on
    await page.getByLabel("Gas pipelines").click();
    await page.getByLabel("Gas pipelines").click();
  });

  test("Hormuz under commodity=gas shows LNG ranked panel", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Gas" }).click();
    // Wait for the gas scenario list to settle (filter excludes Druzhba/BTC/CPC)
    const scenarioSelect = page.locator("select");
    await scenarioSelect.selectOption("hormuz");
    // LNG ranked label should appear
    await expect(page.getByText("Top LNG import terminals at risk")).toBeVisible({ timeout: 10_000 });
  });
});
```

- [ ] **Step 2: Run**

```bash
pnpm test:e2e tests/e2e/phase-3.spec.ts
```

Expected: 3 tests PASS. If the scenario panel appears in a different selector shape (e.g., a custom dropdown), adapt the locator. The `Top LNG import terminals at risk` literal must match the ScenarioPanel label exactly.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/phase-3.spec.ts
git commit -m "test(e2e): Phase 3 smoke — commodity toggle, gas layers, Hormuz-LNG"
```

---

## Task 22: Final build + lint + test sweep

**Files:** none (verification only)

- [ ] **Step 1: Run the full local CI**

```bash
pnpm lint && pnpm test && pnpm build
```

All must pass. The build step verifies that the dev-server feature checks haven't regressed.

- [ ] **Step 2: Run Python lints + smoke tests**

```bash
uv run ruff check scripts/ tests/python/
uv run pytest tests/python/ -v
```

Expected: clean lint, all tests pass.

- [ ] **Step 3: Vercel preview deploy + manual smoke**

```bash
vercel
```

Open the preview URL. Re-run the manual smoke from Task 19 Step 3. Confirm Lighthouse LCP < 4s and zero console errors.

If anything regresses, fix before opening the PR.

- [ ] **Step 4: No commit needed if everything passes.** Move to Task 23.

---

## Task 23: Push, create PR, squash-merge after review

**Files:** none (git ops)

- [ ] **Step 1: Push the branch**

```bash
git push -u origin phase-3
```

- [ ] **Step 2: Create the PR**

```bash
gh pr create --title "Phase 3: gas pipelines + LNG terminals + Hormuz extended to LNG" --body "$(cat <<'EOF'
## Summary
- Adds gas pipelines (GEM Global Gas Infrastructure Tracker) and LNG export/import terminals as new map layers
- Adds Oil/Gas commodity toggle on the reserves choropleth (gas reserves sourced from EI Statistical Review)
- Extends the scenario engine with a `commodity` axis; refactors refinery math into `refinery.ts`; adds parallel `lng.ts` for LNG import terminal supply-share attribution
- Ships **Hormuz extended to LNG** as the sole new scenario — multi-commodity refactor of the chokepoint mechanic, ranks LNG import terminals by Qatari supply exposure

Per spec: `docs/superpowers/specs/2026-05-16-global-energy-map-phase-3-design.md`.

## Test plan
- [x] `pnpm lint && pnpm test && pnpm build` clean
- [x] `uv run pytest tests/python/` clean
- [x] Vercel preview manually smoke-tested (commodity toggle, gas layer visibility, LNG tooltip, Hormuz-gas ranked panel)
- [x] Playwright Phase 3 e2e green
- [x] Lighthouse LCP < 4s, no console errors

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Address review feedback (if any), then squash-merge**

After review approval:

```bash
gh pr merge --squash --delete-branch
```

- [ ] **Step 4: Update CLAUDE.md to flip Phase 3 to "shipped"**

```bash
git checkout main && git pull
```

Open `CLAUDE.md`. Change:

```markdown
- **Phase 3** — _in progress 2026-05-16_ (gas pipelines + LNG terminals + Hormuz-LNG scenario)
```

to:

```markdown
- **Phase 3** — _shipped <YYYY-MM-DD>_ (gas pipelines + LNG terminals + Hormuz-LNG scenario)
```

Commit and push directly to main:

```bash
git add CLAUDE.md
git commit -m "docs: mark Phase 3 shipped"
git push
```

Phase 3 done.
