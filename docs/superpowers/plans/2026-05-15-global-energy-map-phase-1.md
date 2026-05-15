# Global Energy Map — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a public Vercel-hosted interactive map showing world oil reserves (country choropleth + basin polygons) and extraction sites (point cloud), with a working **Strait of Hormuz closure** scenario, all driven from in-browser DuckDB-WASM queries over Parquet/GeoParquet files. Time slider scrubs 1990–latest.

**Architecture:** Python (uv-managed) ingestion scripts pull from public sources (Energy Institute Statistical Review, GEM Extraction Tracker, USGS basin polygons, UN Comtrade HS 2709, EIA chokepoints) and emit versioned Parquet/GeoParquet plus a manifest (`public/data/catalog.json`). Next.js app loads DuckDB-WASM in the browser, queries those files via HTTP range reads, and feeds Deck.gl layers over a MapLibre + PMTiles basemap. The Hormuz scenario is a pure TS function that takes baseline trade flows and returns per-importer impact shares, restyling the choropleth without any backend round-trip.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript strict (ES2022), Tailwind v4, deck.gl 9, maplibre-gl 4, @duckdb/duckdb-wasm 1.x, pmtiles 3.x, Vitest 2, Playwright 1.x, pnpm 10. Python (uv): httpx, pandas, geopandas, pyarrow, duckdb.

**Data attribution:** GEM data is CC BY 4.0 — methodology page MUST cite "Global Energy Monitor".

---

## Task 1: Scaffold Next.js + pnpm + TypeScript strict

**Files:**
- Create: `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `next.config.ts`, `src/app/layout.tsx`, `src/app/page.tsx`, `.gitignore` (extend), `.nvmrc`

- [ ] **Step 1: Init via create-next-app with the chosen flags**

```bash
cd /Users/narendranag/ai/global-energy-map
pnpm dlx create-next-app@latest . \
  --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" \
  --use-pnpm --no-turbopack
```

Accept overwrite for README.md when prompted (we'll restore it).

- [ ] **Step 2: Tighten `tsconfig.json` to strict + ES2022**

Edit `tsconfig.json` `compilerOptions` to include:
```json
{
  "target": "ES2022",
  "lib": ["dom", "dom.iterable", "esnext"],
  "strict": true,
  "noUncheckedIndexedAccess": true,
  "exactOptionalPropertyTypes": true,
  "noImplicitOverride": true,
  "moduleResolution": "Bundler"
}
```

- [ ] **Step 3: Restore README**

Restore the original `# global-energy-map\nAn attempt to vizualize the world's energy linkages\n` and append a one-line "See CLAUDE.md and docs/superpowers/specs/ for project docs."

- [ ] **Step 4: Verify dev server boots**

```bash
pnpm dev
```
Expected: localhost:3000 returns 200; default Next.js page renders. Ctrl-C to stop.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "scaffold: Next.js 15 + TS strict + Tailwind + pnpm"
```

---

## Task 2: Configure ESLint flat config + Prettier (mirroring org-spine)

**Files:**
- Create: `eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`

- [ ] **Step 1: Inspect `~/ai/org-spine/eslint.config.mjs` and copy the relevant pieces**

```bash
cat ~/ai/org-spine/eslint.config.mjs
```

- [ ] **Step 2: Write `eslint.config.mjs`**

```js
import { FlatCompat } from "@eslint/eslintrc";
import { fileURLToPath } from "node:url";
import path from "node:path";
import tseslint from "typescript-eslint";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({ baseDirectory: __dirname });

export default tseslint.config(
  ...compat.extends("next/core-web-vitals"),
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: { project: "./tsconfig.json", tsconfigRootDir: __dirname },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  { ignores: [".next/", "node_modules/", "public/", "scripts/", "tests/e2e/.cache/"] },
);
```

- [ ] **Step 3: Install missing dev deps**

```bash
pnpm add -D typescript-eslint @eslint/eslintrc prettier prettier-plugin-tailwindcss eslint-config-prettier
```

- [ ] **Step 4: `.prettierrc.json`**

```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "printWidth": 100,
  "plugins": ["prettier-plugin-tailwindcss"]
}
```

- [ ] **Step 5: Run lint**

```bash
pnpm lint
```
Expected: PASS (or only minor warnings on scaffold code). Fix any errors.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "chore: ESLint strictTypeChecked + Prettier"
```

---

## Task 3: Configure Vitest + Playwright

**Files:**
- Create: `vitest.config.ts`, `playwright.config.ts`, `tests/unit/.gitkeep`, `tests/e2e/.gitkeep`
- Modify: `package.json` scripts

- [ ] **Step 1: Install deps**

```bash
pnpm add -D vitest @vitest/coverage-v8 @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom
pnpm add -D @playwright/test
pnpm exec playwright install --with-deps chromium
```

- [ ] **Step 2: Write `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx"],
    setupFiles: ["./tests/unit/setup.ts"],
  },
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
});
```

- [ ] **Step 3: Write `tests/unit/setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 4: Write `playwright.config.ts`**

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  use: { baseURL: "http://localhost:3000", trace: "on-first-retry" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

- [ ] **Step 5: Add `package.json` scripts**

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint && eslint .",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test"
  }
}
```

- [ ] **Step 6: Smoke test — write a trivial passing unit test**

`tests/unit/sanity.test.ts`:
```ts
import { describe, it, expect } from "vitest";
describe("sanity", () => { it("adds", () => { expect(1 + 1).toBe(2); }); });
```

Run: `pnpm test` → 1 passing.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "chore: Vitest + Playwright"
```

---

## Task 4: Python ingestion environment with uv

**Files:**
- Create: `pyproject.toml`, `.python-version`, `scripts/__init__.py`, `scripts/ingest/__init__.py`, `scripts/transform/__init__.py`, `scripts/common/__init__.py`, `scripts/common/secrets.py`

- [ ] **Step 1: Init uv project**

```bash
uv init --python 3.12 --no-readme --no-workspace
```

- [ ] **Step 2: Add deps**

```bash
uv add httpx pandas geopandas pyarrow duckdb python-dotenv openpyxl shapely
uv add --dev pytest ruff
```

- [ ] **Step 3: Write `scripts/common/secrets.py`**

```python
"""Load API keys from ~/.config/secrets.env."""
from __future__ import annotations
import os
from pathlib import Path
from dotenv import load_dotenv

SECRETS_PATH = Path.home() / ".config" / "secrets.env"

def load_secrets() -> None:
    if SECRETS_PATH.exists():
        load_dotenv(SECRETS_PATH)

def require(name: str) -> str:
    load_secrets()
    val = os.environ.get(name)
    if not val:
        raise RuntimeError(
            f"Missing required secret {name}. Add it to {SECRETS_PATH}."
        )
    return val
```

- [ ] **Step 4: Add ruff config to `pyproject.toml`**

```toml
[tool.ruff]
line-length = 100
target-version = "py312"

[tool.ruff.lint]
select = ["E", "F", "W", "I", "UP", "B", "SIM"]
```

- [ ] **Step 5: Verify**

```bash
uv run python -c "from scripts.common.secrets import require; print('ok')"
```
Expected: prints `ok`.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "chore: Python ingestion env with uv"
```

---

## Task 5: Define data catalog types + schema

**Files:**
- Create: `src/lib/data-catalog/types.ts`, `src/lib/data-catalog/index.ts`
- Create: `public/data/catalog.json` (empty skeleton; populated by ingestion)
- Test: `tests/unit/data-catalog/catalog.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/data-catalog/catalog.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseCatalog, type Catalog } from "@/lib/data-catalog";

describe("data-catalog", () => {
  it("parses a valid catalog with one entry", () => {
    const raw = {
      version: 1,
      generated_at: "2026-05-15T00:00:00Z",
      entries: [
        {
          id: "ei_reserves",
          label: "Energy Institute Statistical Review — Reserves",
          path: "/data/country_year_series.parquet",
          format: "parquet",
          source_name: "Energy Institute",
          source_url: "https://www.energyinst.org/statistical-review",
          license: "Free, see source terms",
          as_of: "2025-06-01",
          layers: ["reserves"],
        },
      ],
    };
    const catalog: Catalog = parseCatalog(raw);
    expect(catalog.entries).toHaveLength(1);
    expect(catalog.entries[0]?.id).toBe("ei_reserves");
  });

  it("throws on missing required fields", () => {
    expect(() => parseCatalog({ version: 1, entries: [{ id: "x" }] })).toThrow();
  });
});
```

- [ ] **Step 2: Run test — should fail (module not found)**

```bash
pnpm test tests/unit/data-catalog
```
Expected: FAIL ("Cannot find module '@/lib/data-catalog'").

- [ ] **Step 3: Write `src/lib/data-catalog/types.ts`**

```ts
export type DataFormat = "parquet" | "geoparquet" | "json";

export interface CatalogEntry {
  readonly id: string;
  readonly label: string;
  readonly path: string;
  readonly format: DataFormat;
  readonly source_name: string;
  readonly source_url: string;
  readonly license: string;
  readonly as_of: string;
  readonly layers: readonly string[];
}

export interface Catalog {
  readonly version: 1;
  readonly generated_at: string;
  readonly entries: readonly CatalogEntry[];
}
```

- [ ] **Step 4: Write `src/lib/data-catalog/index.ts`**

```ts
import type { Catalog, CatalogEntry, DataFormat } from "./types";

export type { Catalog, CatalogEntry, DataFormat };

const REQUIRED_FIELDS = [
  "id", "label", "path", "format", "source_name",
  "source_url", "license", "as_of", "layers",
] as const;

function assertEntry(raw: unknown): asserts raw is CatalogEntry {
  if (typeof raw !== "object" || raw === null) throw new Error("entry must be object");
  for (const f of REQUIRED_FIELDS) {
    if (!(f in raw)) throw new Error(`entry missing field: ${f}`);
  }
}

export function parseCatalog(raw: unknown): Catalog {
  if (typeof raw !== "object" || raw === null) throw new Error("catalog must be object");
  const obj = raw as Record<string, unknown>;
  if (obj.version !== 1) throw new Error("unsupported catalog version");
  if (typeof obj.generated_at !== "string") throw new Error("generated_at required");
  if (!Array.isArray(obj.entries)) throw new Error("entries must be array");
  for (const e of obj.entries) assertEntry(e);
  return obj as unknown as Catalog;
}

export async function loadCatalog(baseUrl = ""): Promise<Catalog> {
  const res = await fetch(`${baseUrl}/data/catalog.json`);
  if (!res.ok) throw new Error(`catalog fetch failed: ${res.status}`);
  return parseCatalog(await res.json());
}
```

- [ ] **Step 5: Write skeleton `public/data/catalog.json`**

```json
{
  "version": 1,
  "generated_at": "2026-05-15T00:00:00Z",
  "entries": []
}
```

- [ ] **Step 6: Run test — should pass**

```bash
pnpm test tests/unit/data-catalog
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(catalog): typed data catalog schema + parser"
```

---

## Task 6: Ingest Energy Institute Statistical Review → country-year reserves + production

**Files:**
- Create: `scripts/ingest/ei_statistical_review.py`, `scripts/transform/build_country_year.py`
- Create (input cache): `data/raw/ei_statistical_review/` (gitignored except a `.gitkeep`)
- Create: `data/raw/.gitignore`
- Output: `public/data/country_year_series.parquet`

- [ ] **Step 1: Add `data/raw/.gitignore`**

```
*
!.gitignore
!.gitkeep
```

- [ ] **Step 2: Inspect the EI download page programmatically**

```bash
uv run python -c "
import httpx, re
r = httpx.get('https://www.energyinst.org/statistical-review/resources-and-data-downloads', follow_redirects=True, timeout=30)
print('status:', r.status_code)
for m in re.finditer(r'href=\"([^\"]+\\.xlsx)\"', r.text):
    print(m.group(1))
"
```
Expected: prints one or more `.xlsx` URLs for the consolidated dataset (panel or narrow format).

- [ ] **Step 3: Write `scripts/ingest/ei_statistical_review.py`**

```python
"""Download the Energy Institute Statistical Review consolidated dataset.

Saves the workbook to data/raw/ei_statistical_review/ and prints the path.
Re-running is idempotent unless --force is passed.
"""
from __future__ import annotations
import argparse
import sys
import time
from pathlib import Path

import httpx

# Canonical URL pattern; year is encoded in filename.
# We discover the latest by scraping the resource page.
RESOURCE_PAGE = "https://www.energyinst.org/statistical-review/resources-and-data-downloads"
RAW_DIR = Path("data/raw/ei_statistical_review")

def discover_panel_xlsx() -> str:
    import re
    r = httpx.get(RESOURCE_PAGE, follow_redirects=True, timeout=30)
    r.raise_for_status()
    # Prefer "Panel format" / "consolidated" .xlsx
    matches = re.findall(r'href="([^"]+\.xlsx)"', r.text)
    panel = [m for m in matches if "panel" in m.lower() or "consolidated" in m.lower()]
    candidate = panel[0] if panel else matches[0]
    if candidate.startswith("/"):
        candidate = "https://www.energyinst.org" + candidate
    return candidate

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    url = discover_panel_xlsx()
    fname = url.rsplit("/", 1)[-1]
    out = RAW_DIR / fname
    if out.exists() and not args.force:
        print(f"cached: {out}", file=sys.stderr)
        print(out)
        return
    print(f"downloading {url}", file=sys.stderr)
    with httpx.stream("GET", url, follow_redirects=True, timeout=120) as r:
        r.raise_for_status()
        with out.open("wb") as f:
            for chunk in r.iter_bytes():
                f.write(chunk)
    print(out)

if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run the ingestion**

```bash
uv run python -m scripts.ingest.ei_statistical_review
```
Expected: prints the path to a downloaded `.xlsx` under `data/raw/ei_statistical_review/`. Confirm with `ls data/raw/ei_statistical_review/`.

- [ ] **Step 5: Probe the workbook structure**

```bash
uv run python -c "
from pathlib import Path
import pandas as pd
xlsx = next(Path('data/raw/ei_statistical_review').glob('*.xlsx'))
xl = pd.ExcelFile(xlsx)
print('sheets:', xl.sheet_names[:25])
df = pd.read_excel(xlsx, sheet_name=xl.sheet_names[0], nrows=5)
print(df.head())
print('shape:', df.shape, 'cols:', list(df.columns)[:10])
"
```
Expected: prints sheet names and a sample of the panel format columns (typically `Country`, `ISO3`, `Year`, `Var`, `Value`, `Unit`, or similar).

- [ ] **Step 6: Write `scripts/transform/build_country_year.py`**

```python
"""Transform raw EI Statistical Review into country_year_series.parquet.

Output schema:
    iso3 (str3) | year (int) | metric (str) | value (float) | unit (str) | source (str)

Metrics emitted in Phase 1:
    proved_reserves_oil_bbn_bbl
    production_crude_kbpd
"""
from __future__ import annotations
from pathlib import Path
import sys

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

RAW_DIR = Path("data/raw/ei_statistical_review")
OUT = Path("public/data/country_year_series.parquet")
SOURCE_LABEL = "Energy Institute Statistical Review of World Energy"

# Map EI metric names -> our internal metric IDs.
# These are based on the EI panel format. Verify with --inspect first.
METRIC_MAP: dict[str, tuple[str, str]] = {
    # ei panel value of "Var" column -> (our metric id, unit)
    "oilreserves_bbnbbl": ("proved_reserves_oil_bbn_bbl", "billion barrels"),
    "oilprod_kbd": ("production_crude_kbpd", "thousand barrels/day"),
}

def find_panel_sheet(xl: pd.ExcelFile) -> str:
    for cand in ("Panel format", "Data (panel)", "Consolidated Dataset (Panel)"):
        if cand in xl.sheet_names:
            return cand
    # fallback: first sheet that has > 5000 rows
    for s in xl.sheet_names:
        head = pd.read_excel(xl, sheet_name=s, nrows=1)
        if head.shape[1] >= 4:
            return s
    raise RuntimeError(f"could not identify panel sheet from {xl.sheet_names}")

def main() -> None:
    xlsx = next(RAW_DIR.glob("*.xlsx"), None)
    if xlsx is None:
        sys.exit("no EI xlsx — run scripts.ingest.ei_statistical_review first")
    xl = pd.ExcelFile(xlsx)
    sheet = find_panel_sheet(xl)
    df = pd.read_excel(xlsx, sheet_name=sheet)

    # Normalize column names — robust to small EI changes.
    cols = {c.lower(): c for c in df.columns}
    iso_col = cols.get("iso3166_a3") or cols.get("iso3") or cols.get("country code")
    year_col = cols.get("year")
    var_col = cols.get("var") or cols.get("variable")
    value_col = cols.get("value")
    if not all([iso_col, year_col, var_col, value_col]):
        sys.exit(f"unexpected columns: {df.columns.tolist()}")

    df = df.rename(columns={iso_col: "iso3", year_col: "year", var_col: "var", value_col: "value"})
    df = df[df["var"].isin(METRIC_MAP.keys())].copy()
    df["metric"] = df["var"].map(lambda v: METRIC_MAP[v][0])
    df["unit"] = df["var"].map(lambda v: METRIC_MAP[v][1])
    df["source"] = SOURCE_LABEL
    df = df[["iso3", "year", "metric", "value", "unit", "source"]]
    df = df.dropna(subset=["iso3", "year", "value"])
    df["year"] = df["year"].astype("int32")
    df = df[df["year"] >= 1990].reset_index(drop=True)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    pq.write_table(pa.Table.from_pandas(df, preserve_index=False), OUT, compression="zstd")
    print(f"wrote {OUT} rows={len(df)} metrics={sorted(df['metric'].unique())}")

if __name__ == "__main__":
    main()
```

- [ ] **Step 7: Run the transform**

```bash
uv run python -m scripts.transform.build_country_year
```
Expected: `wrote public/data/country_year_series.parquet rows=<N>` where N is in the thousands.

**If column names differ:** the script will exit with the actual columns — update `METRIC_MAP` keys and the `find_panel_sheet` candidates to match what EI actually publishes (this is the one spot the EI workbook structure may vary year-to-year).

- [ ] **Step 8: Append a catalog entry**

Patch `public/data/catalog.json`:
```json
{
  "version": 1,
  "generated_at": "2026-05-15T00:00:00Z",
  "entries": [
    {
      "id": "ei_country_year",
      "label": "Country-year reserves + production",
      "path": "/data/country_year_series.parquet",
      "format": "parquet",
      "source_name": "Energy Institute Statistical Review of World Energy",
      "source_url": "https://www.energyinst.org/statistical-review/resources-and-data-downloads",
      "license": "Free; see Energy Institute terms",
      "as_of": "2025-06-01",
      "layers": ["reserves", "production"]
    }
  ]
}
```

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat(data): EI Statistical Review ingest + transform"
```

---

## Task 7: Ingest GEM Oil & Gas Extraction Tracker → assets.parquet

**Files:**
- Create: `scripts/ingest/gem_extraction.py`, `scripts/transform/build_assets.py`
- Output: `public/data/assets.parquet`

GEM publishes their trackers as Excel downloads from a tracker page; the URL changes per release. We resolve it dynamically.

- [ ] **Step 1: Write `scripts/ingest/gem_extraction.py`**

```python
"""Download the latest GEM Global Oil & Gas Extraction Tracker workbook."""
from __future__ import annotations
import re
import sys
from pathlib import Path

import httpx

RAW_DIR = Path("data/raw/gem_extraction")
LANDING = "https://globalenergymonitor.org/projects/global-oil-gas-extraction-tracker/"

def find_xlsx_url() -> str:
    r = httpx.get(LANDING, follow_redirects=True, timeout=60)
    r.raise_for_status()
    matches = re.findall(r'href="(https?://[^"]+\.xlsx)"', r.text)
    # Prefer ones with "extraction" in the URL.
    pref = [m for m in matches if "extraction" in m.lower() or "GOGET" in m]
    if not pref:
        sys.exit(f"could not find extraction xlsx; saw {matches[:5]}")
    return pref[0]

def main() -> None:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    url = find_xlsx_url()
    out = RAW_DIR / url.rsplit("/", 1)[-1]
    if out.exists():
        print(out)
        return
    print(f"downloading {url}", file=sys.stderr)
    with httpx.stream("GET", url, follow_redirects=True, timeout=300) as r:
        r.raise_for_status()
        with out.open("wb") as f:
            for chunk in r.iter_bytes():
                f.write(chunk)
    print(out)

if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run the ingest**

```bash
uv run python -m scripts.ingest.gem_extraction
```
Expected: prints path to a downloaded `.xlsx`. If it fails, the link discovery regex may need updating — inspect the landing page HTML.

- [ ] **Step 3: Probe the workbook**

```bash
uv run python -c "
from pathlib import Path
import pandas as pd
xlsx = next(Path('data/raw/gem_extraction').glob('*.xlsx'))
xl = pd.ExcelFile(xlsx)
print('sheets:', xl.sheet_names)
for s in xl.sheet_names[:3]:
    df = pd.read_excel(xlsx, sheet_name=s, nrows=2)
    print(s, '->', list(df.columns)[:25])
"
```

- [ ] **Step 4: Write `scripts/transform/build_assets.py`**

```python
"""Transform GEM extraction tracker into assets.parquet.

Schema:
    asset_id (str) | kind (str) | name (str) | country_iso3 (str3)
    lon (float) | lat (float) | capacity (float|null) | capacity_unit (str|null)
    operator (str|null) | status (str|null)
    commissioned_year (int|null) | decommissioned_year (int|null)
    source (str) | source_version (str)
"""
from __future__ import annotations
from pathlib import Path
import sys

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

RAW_DIR = Path("data/raw/gem_extraction")
OUT = Path("public/data/assets.parquet")
SOURCE = "Global Energy Monitor — Global Oil & Gas Extraction Tracker"

def pick_col(df: pd.DataFrame, *candidates: str) -> str | None:
    cmap = {c.lower(): c for c in df.columns}
    for c in candidates:
        if c.lower() in cmap:
            return cmap[c.lower()]
    return None

def main() -> None:
    xlsx = next(RAW_DIR.glob("*.xlsx"), None)
    if xlsx is None:
        sys.exit("no GEM xlsx — run scripts.ingest.gem_extraction first")
    xl = pd.ExcelFile(xlsx)
    # GEM data sheet is typically the second one ("Main data", "Units" etc.)
    main_sheet = next(
        (s for s in xl.sheet_names if s.lower() in ("main data", "data", "units", "extraction projects")),
        xl.sheet_names[1] if len(xl.sheet_names) > 1 else xl.sheet_names[0],
    )
    df = pd.read_excel(xlsx, sheet_name=main_sheet)

    name_col = pick_col(df, "Unit name", "Project name", "Name")
    country_col = pick_col(df, "Country/Area", "Country", "ISO-3166-3")
    iso_col = pick_col(df, "ISO-3166-3", "ISO3")
    lat_col = pick_col(df, "Latitude")
    lon_col = pick_col(df, "Longitude")
    op_col = pick_col(df, "Operator", "Owner")
    status_col = pick_col(df, "Status")
    cap_col = pick_col(df, "Production (kboe/d)", "Production (boe/d)", "Production")
    start_col = pick_col(df, "Start year", "Production start year")
    end_col = pick_col(df, "End year", "Production end year")

    if not all([name_col, lat_col, lon_col, country_col]):
        sys.exit(f"unexpected GEM columns: {df.columns.tolist()}")

    # ISO3 fallback via pycountry if needed; for now expect a column.
    if iso_col is None:
        sys.exit("GEM sheet missing an ISO3 column; add a mapping step")

    out = pd.DataFrame({
        "asset_id": "gem-extract-" + df.index.astype(str),
        "kind": "extraction_site",
        "name": df[name_col].astype(str),
        "country_iso3": df[iso_col].astype(str).str.upper().str[:3],
        "lon": pd.to_numeric(df[lon_col], errors="coerce"),
        "lat": pd.to_numeric(df[lat_col], errors="coerce"),
        "capacity": pd.to_numeric(df[cap_col], errors="coerce") if cap_col else pd.Series([None]*len(df)),
        "capacity_unit": "kboe/d" if cap_col else None,
        "operator": df[op_col].astype(str) if op_col else None,
        "status": df[status_col].astype(str) if status_col else None,
        "commissioned_year": pd.to_numeric(df[start_col], errors="coerce") if start_col else None,
        "decommissioned_year": pd.to_numeric(df[end_col], errors="coerce") if end_col else None,
        "source": SOURCE,
        "source_version": xlsx.name,
    })
    out = out.dropna(subset=["lat", "lon"]).reset_index(drop=True)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    pq.write_table(pa.Table.from_pandas(out, preserve_index=False), OUT, compression="zstd")
    print(f"wrote {OUT} rows={len(out)}")

if __name__ == "__main__":
    main()
```

- [ ] **Step 5: Run the transform**

```bash
uv run python -m scripts.transform.build_assets
```
Expected: `wrote public/data/assets.parquet rows=<N>` where N is in the thousands. If columns don't match, add the actual column name to the `pick_col` candidates.

- [ ] **Step 6: Append catalog entry**

```json
{
  "id": "gem_extraction",
  "label": "Oil & gas extraction sites (GEM)",
  "path": "/data/assets.parquet",
  "format": "parquet",
  "source_name": "Global Energy Monitor",
  "source_url": "https://globalenergymonitor.org/projects/global-oil-gas-extraction-tracker/",
  "license": "CC BY 4.0",
  "as_of": "2025-03-01",
  "layers": ["extraction"]
}
```

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(data): GEM extraction tracker → assets.parquet"
```

---

## Task 8: Ingest UN Comtrade HS 2709 (crude oil trade flows)

**Files:**
- Create: `scripts/ingest/comtrade_2709.py`
- Output: `public/data/trade_flow.parquet`

Requires a Comtrade API key. Free tier: 500 calls/day, 100K records/call.

- [ ] **Step 1: Register a free Comtrade key**

Go to https://uncomtrade.org/docs/how-to-create-an-account/ and add to `~/.config/secrets.env`:
```
COMTRADE_API_KEY=...
```

- [ ] **Step 2: Write `scripts/ingest/comtrade_2709.py`**

```python
"""Pull crude oil (HS 2709) annual bilateral trade flows from UN Comtrade.

Reporters = all countries; partners = all countries; periods = 1990..latest.
We chunk by year to stay under per-call limits.
"""
from __future__ import annotations
from pathlib import Path
import time
import sys

import httpx
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

from scripts.common.secrets import require

OUT = Path("public/data/trade_flow.parquet")
SOURCE = "UN Comtrade"
HS = "2709"
ENDPOINT = "https://comtradeapi.un.org/data/v1/get/C/A/HS"
START_YEAR = 1990

def fetch_year(client: httpx.Client, key: str, year: int) -> pd.DataFrame:
    params = {
        "subscription-key": key,
        "reporterCode": "all",
        "partnerCode": "all",
        "period": str(year),
        "cmdCode": HS,
        "flowCode": "M",  # imports; mirror-check exports later
        "maxRecords": 100_000,
    }
    r = client.get(ENDPOINT, params=params, timeout=120)
    r.raise_for_status()
    payload = r.json()
    data = payload.get("data") or []
    if not data:
        return pd.DataFrame()
    df = pd.DataFrame(data)
    keep = {
        "period": "year",
        "reporterISO": "importer_iso3",
        "partnerISO": "exporter_iso3",
        "primaryValue": "value_usd",
        "qty": "qty",
        "qtyUnitAbbr": "qty_unit",
    }
    df = df[[k for k in keep if k in df.columns]].rename(columns=keep)
    df["hs_code"] = HS
    df["source"] = SOURCE
    return df

def main() -> None:
    key = require("COMTRADE_API_KEY")
    last_year = pd.Timestamp.utcnow().year - 1
    frames: list[pd.DataFrame] = []
    with httpx.Client() as client:
        for y in range(START_YEAR, last_year + 1):
            try:
                df = fetch_year(client, key, y)
                print(f"{y}: {len(df)} rows", file=sys.stderr)
                if not df.empty:
                    frames.append(df)
            except httpx.HTTPStatusError as e:
                print(f"{y}: HTTP {e.response.status_code}", file=sys.stderr)
            time.sleep(0.4)  # be polite
    if not frames:
        sys.exit("no Comtrade data returned — check API key and quota")
    full = pd.concat(frames, ignore_index=True)
    full = full.dropna(subset=["importer_iso3", "exporter_iso3"])
    OUT.parent.mkdir(parents=True, exist_ok=True)
    pq.write_table(pa.Table.from_pandas(full, preserve_index=False), OUT, compression="zstd")
    print(f"wrote {OUT} rows={len(full)}")

if __name__ == "__main__":
    main()
```

- [ ] **Step 3: Run the ingest**

```bash
uv run python -m scripts.ingest.comtrade_2709
```
Expected: 35+ years × thousands of records. Will take ~5-10 minutes. **If the free tier blocks bulk, scope to last 10 years first** (edit `START_YEAR = 2014`) and revisit later.

- [ ] **Step 4: Append catalog entry**

```json
{
  "id": "comtrade_2709",
  "label": "Crude oil bilateral trade (HS 2709)",
  "path": "/data/trade_flow.parquet",
  "format": "parquet",
  "source_name": "UN Comtrade",
  "source_url": "https://comtradeplus.un.org/",
  "license": "Public, free with API key",
  "as_of": "2025-12-31",
  "layers": ["trade", "scenario:hormuz"]
}
```

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(data): Comtrade HS 2709 crude oil trade flows"
```

---

## Task 9: Build chokepoint routing table (powers Hormuz scenario)

**Files:**
- Create: `scripts/transform/build_chokepoint_routing.py`
- Output: `public/data/chokepoint_route.parquet`

For Phase 1, we hard-code which exporters route through Hormuz. EIA-confirmed: Iran, Iraq, Kuwait, Qatar, Saudi Arabia (partial — has Red Sea pipeline), UAE (partial — has Fujairah bypass), Bahrain.

- [ ] **Step 1: Write the transform**

```python
"""Build chokepoint_route.parquet — fraction of each (exporter, chokepoint) flow.

Phase 1: Strait of Hormuz only, hardcoded shares per EIA chokepoint reports.
"""
from __future__ import annotations
from pathlib import Path

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

OUT = Path("public/data/chokepoint_route.parquet")
SOURCE = "EIA World Oil Transit Chokepoints (Phase 1 simplification)"

# Share of each exporter's seaborne crude (HS 2709) that transits the strait.
# Based on EIA chokepoint analysis; bypass pipelines reduce the share for KSA and UAE.
HORMUZ_SHARES: dict[str, float] = {
    "IRN": 1.00,
    "IRQ": 1.00,
    "KWT": 1.00,
    "QAT": 1.00,
    "SAU": 0.88,  # ~12% can move via East-West pipeline to Yanbu
    "ARE": 0.65,  # Fujairah pipeline bypass
    "BHR": 1.00,
}

def main() -> None:
    rows = [
        {"chokepoint_id": "hormuz", "exporter_iso3": iso, "share": share, "source": SOURCE}
        for iso, share in HORMUZ_SHARES.items()
    ]
    df = pd.DataFrame(rows)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    pq.write_table(pa.Table.from_pandas(df, preserve_index=False), OUT, compression="zstd")
    print(f"wrote {OUT} rows={len(df)}")

if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run**

```bash
uv run python -m scripts.transform.build_chokepoint_routing
```
Expected: `wrote public/data/chokepoint_route.parquet rows=7`.

- [ ] **Step 3: Append catalog entry**

```json
{
  "id": "chokepoint_route",
  "label": "Chokepoint routing shares",
  "path": "/data/chokepoint_route.parquet",
  "format": "parquet",
  "source_name": "EIA World Oil Transit Chokepoints",
  "source_url": "https://www.eia.gov/international/analysis/special-topics/World_Oil_Transit_Chokepoints",
  "license": "Public (US government)",
  "as_of": "2025-06-01",
  "layers": ["scenario:hormuz"]
}
```

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(data): chokepoint routing shares (Hormuz Phase 1)"
```

---

## Task 10: DuckDB-WASM bootstrap + query helper

**Files:**
- Create: `src/lib/duckdb/bootstrap.ts`, `src/lib/duckdb/query.ts`
- Test: `tests/unit/duckdb/query.test.ts`

We can't run the WASM binary in unit tests cleanly, so we'll keep the bootstrap thin and unit-test the helper shape, with the real integration covered by Playwright.

- [ ] **Step 1: Install deps**

```bash
pnpm add @duckdb/duckdb-wasm apache-arrow
```

- [ ] **Step 2: Write `src/lib/duckdb/bootstrap.ts`**

```ts
import * as duckdb from "@duckdb/duckdb-wasm";

let _db: duckdb.AsyncDuckDB | undefined;

export async function getDuckDB(): Promise<duckdb.AsyncDuckDB> {
  if (_db) return _db;
  const bundles = duckdb.getJsDelivrBundles();
  const bundle = await duckdb.selectBundle(bundles);
  const workerUrl = URL.createObjectURL(
    new Blob([`importScripts("${bundle.mainWorker!}");`], { type: "text/javascript" }),
  );
  const worker = new Worker(workerUrl);
  const logger = new duckdb.ConsoleLogger();
  const db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  URL.revokeObjectURL(workerUrl);
  _db = db;
  return db;
}
```

- [ ] **Step 3: Write `src/lib/duckdb/query.ts`**

```ts
import type { Table } from "apache-arrow";
import { getDuckDB } from "./bootstrap";

export interface QueryResult<TRow> {
  readonly rows: readonly TRow[];
  readonly count: number;
}

export async function query<TRow extends Record<string, unknown>>(
  sql: string,
  params: readonly (string | number)[] = [],
): Promise<QueryResult<TRow>> {
  const db = await getDuckDB();
  const conn = await db.connect();
  try {
    const stmt = await conn.prepare(sql);
    const arrow = (await stmt.query(...params)) as Table;
    const rows = arrow.toArray() as TRow[];
    return { rows, count: rows.length };
  } finally {
    await conn.close();
  }
}

export function quoteIdent(s: string): string {
  return `"${s.replaceAll('"', '""')}"`;
}
```

- [ ] **Step 4: Write the unit test (covers helpers only, not WASM)**

`tests/unit/duckdb/query.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { quoteIdent } from "@/lib/duckdb/query";

describe("quoteIdent", () => {
  it("wraps a simple ident", () => { expect(quoteIdent("year")).toBe(`"year"`); });
  it("escapes embedded quotes", () => { expect(quoteIdent('na"me')).toBe(`"na""me"`); });
});
```

- [ ] **Step 5: Run tests**

```bash
pnpm test
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(duckdb): WASM bootstrap + typed query helper"
```

---

## Task 11: Scenario engine — Hormuz closure (TDD)

**Files:**
- Create: `src/lib/scenarios/types.ts`, `src/lib/scenarios/engine.ts`, `src/lib/scenarios/hormuz.ts`
- Test: `tests/unit/scenarios/hormuz.test.ts`

Pure functions; no DOM, no network. Easy to unit-test.

- [ ] **Step 1: Write the failing test**

`tests/unit/scenarios/hormuz.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { computeHormuzImpact } from "@/lib/scenarios/hormuz";

const tradeFlows = [
  // importer, exporter, qty
  { year: 2024, importer_iso3: "IND", exporter_iso3: "SAU", qty: 100 },
  { year: 2024, importer_iso3: "IND", exporter_iso3: "IRQ", qty: 50 },
  { year: 2024, importer_iso3: "IND", exporter_iso3: "USA", qty: 25 },
  { year: 2024, importer_iso3: "CHN", exporter_iso3: "SAU", qty: 200 },
  { year: 2024, importer_iso3: "CHN", exporter_iso3: "RUS", qty: 300 },
];
const routes = [
  { chokepoint_id: "hormuz", exporter_iso3: "SAU", share: 0.88 },
  { chokepoint_id: "hormuz", exporter_iso3: "IRQ", share: 1.0 },
  { chokepoint_id: "hormuz", exporter_iso3: "IRN", share: 1.0 },
  { chokepoint_id: "hormuz", exporter_iso3: "KWT", share: 1.0 },
  { chokepoint_id: "hormuz", exporter_iso3: "QAT", share: 1.0 },
  { chokepoint_id: "hormuz", exporter_iso3: "ARE", share: 0.65 },
  { chokepoint_id: "hormuz", exporter_iso3: "BHR", share: 1.0 },
];

describe("computeHormuzImpact", () => {
  it("computes per-importer at-risk share for a given year", () => {
    const r = computeHormuzImpact({ year: 2024, tradeFlows, routes });
    // India: SAU 100*0.88 = 88; IRQ 50*1 = 50; sum at risk = 138 of total 175 → 0.788...
    const india = r.byImporter.find((x) => x.iso3 === "IND");
    expect(india).toBeDefined();
    expect(india!.totalQty).toBe(175);
    expect(india!.atRiskQty).toBeCloseTo(138, 6);
    expect(india!.shareAtRisk).toBeCloseTo(138 / 175, 6);
    // China: SAU 200*0.88 = 176; RUS not in chokepoint set → 0; share = 176 / 500 = 0.352
    const china = r.byImporter.find((x) => x.iso3 === "CHN");
    expect(china!.shareAtRisk).toBeCloseTo(176 / 500, 6);
  });

  it("returns zero impact for importers with no chokepoint exposure", () => {
    const r = computeHormuzImpact({
      year: 2024,
      tradeFlows: [{ year: 2024, importer_iso3: "MEX", exporter_iso3: "USA", qty: 10 }],
      routes,
    });
    expect(r.byImporter[0]?.shareAtRisk).toBe(0);
  });

  it("ranks importers by absolute at-risk qty descending", () => {
    const r = computeHormuzImpact({ year: 2024, tradeFlows, routes });
    expect(r.ranked[0]?.iso3).toBe("CHN"); // 176 > 138
    expect(r.ranked[1]?.iso3).toBe("IND");
  });
});
```

- [ ] **Step 2: Run — should fail (module missing)**

```bash
pnpm test tests/unit/scenarios
```
Expected: FAIL.

- [ ] **Step 3: Write `src/lib/scenarios/types.ts`**

```ts
export interface TradeFlowRow {
  readonly year: number;
  readonly importer_iso3: string;
  readonly exporter_iso3: string;
  readonly qty: number;
}

export interface ChokepointRouteRow {
  readonly chokepoint_id: string;
  readonly exporter_iso3: string;
  readonly share: number;
}

export interface ImporterImpact {
  readonly iso3: string;
  readonly totalQty: number;
  readonly atRiskQty: number;
  readonly shareAtRisk: number;
}

export interface ScenarioResult {
  readonly chokepoint_id: string;
  readonly year: number;
  readonly byImporter: readonly ImporterImpact[];
  readonly ranked: readonly ImporterImpact[];
}
```

- [ ] **Step 4: Write `src/lib/scenarios/hormuz.ts`**

```ts
import type {
  ChokepointRouteRow,
  ImporterImpact,
  ScenarioResult,
  TradeFlowRow,
} from "./types";

export interface HormuzInput {
  readonly year: number;
  readonly tradeFlows: readonly TradeFlowRow[];
  readonly routes: readonly ChokepointRouteRow[];
}

export function computeHormuzImpact(input: HormuzInput): ScenarioResult {
  const shareByExporter = new Map<string, number>();
  for (const r of input.routes) {
    if (r.chokepoint_id === "hormuz") shareByExporter.set(r.exporter_iso3, r.share);
  }

  const totals = new Map<string, number>();
  const atRisk = new Map<string, number>();
  for (const row of input.tradeFlows) {
    if (row.year !== input.year) continue;
    totals.set(row.importer_iso3, (totals.get(row.importer_iso3) ?? 0) + row.qty);
    const share = shareByExporter.get(row.exporter_iso3) ?? 0;
    if (share > 0) {
      atRisk.set(row.importer_iso3, (atRisk.get(row.importer_iso3) ?? 0) + row.qty * share);
    }
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
  const ranked = [...byImporter].sort((a, b) => b.atRiskQty - a.atRiskQty);
  return { chokepoint_id: "hormuz", year: input.year, byImporter, ranked };
}
```

- [ ] **Step 5: Write `src/lib/scenarios/engine.ts` (thin facade)**

```ts
export * from "./types";
export { computeHormuzImpact } from "./hormuz";
export type { HormuzInput } from "./hormuz";
```

- [ ] **Step 6: Run tests — should pass**

```bash
pnpm test tests/unit/scenarios
```
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(scenarios): Hormuz closure impact engine + tests"
```

---

## Task 12: Map shell — MapLibre + Deck.gl + PMTiles basemap

**Files:**
- Create: `src/components/map/MapShell.tsx`, `src/components/map/style.ts`
- Modify: `src/app/page.tsx`
- Download: `public/basemap/world.pmtiles` (Protomaps build, deferred — use raster fallback for now)

For Phase 1, use a hosted Protomaps basemap URL to avoid the PMTiles asset weight. We'll vendor a self-hosted PMTiles file in a later task once the size budget is clearer.

- [ ] **Step 1: Install deps**

```bash
pnpm add maplibre-gl deck.gl @deck.gl/react @deck.gl/layers @deck.gl/geo-layers @deck.gl/mapbox pmtiles
```

- [ ] **Step 2: Write `src/components/map/style.ts`**

```ts
import type { StyleSpecification } from "maplibre-gl";

// Protomaps public demo basemap — minimal, neutral, no API key needed for dev.
// Replace with self-hosted PMTiles before going public.
export const basemapStyle: StyleSpecification = {
  version: 8,
  sources: {
    "carto-light": {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
        "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      attribution: "© OpenStreetMap, © CARTO",
    },
  },
  layers: [{ id: "carto-light", type: "raster", source: "carto-light" }],
};
```

- [ ] **Step 3: Write `src/components/map/MapShell.tsx`**

```tsx
"use client";
import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import { Deck, type Layer, type PickingInfo } from "@deck.gl/core";
import "maplibre-gl/dist/maplibre-gl.css";
import { basemapStyle } from "./style";

export interface MapShellProps {
  readonly layers: readonly Layer[];
  readonly getTooltip?: (info: PickingInfo) => string | null;
}

export function MapShell({ layers, getTooltip }: MapShellProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const deckRef = useRef<Deck | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: basemapStyle,
      center: [40, 25],
      zoom: 2,
      maxZoom: 8,
    });
    mapRef.current = map;
    const deck = new Deck({
      canvas: "deck-canvas",
      width: "100%",
      height: "100%",
      initialViewState: { longitude: 40, latitude: 25, zoom: 2, pitch: 0, bearing: 0 },
      controller: true,
      onViewStateChange: ({ viewState }) => {
        map.jumpTo({
          center: [viewState.longitude, viewState.latitude],
          zoom: viewState.zoom,
          bearing: viewState.bearing,
          pitch: viewState.pitch,
        });
      },
      getTooltip: getTooltip
        ? (info) => {
            const text = getTooltip(info);
            return text ? { text } : null;
          }
        : undefined,
      layers: [...layers],
    });
    deckRef.current = deck;
    return () => {
      deck.finalize();
      map.remove();
    };
  }, []);

  useEffect(() => {
    deckRef.current?.setProps({
      layers: [...layers],
      getTooltip: getTooltip
        ? (info) => {
            const text = getTooltip(info);
            return text ? { text } : null;
          }
        : undefined,
    });
  }, [layers, getTooltip]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="absolute inset-0" />
      <canvas id="deck-canvas" className="pointer-events-auto absolute inset-0" />
    </div>
  );
}
```

- [ ] **Step 4: Replace `src/app/page.tsx`**

```tsx
import { MapShell } from "@/components/map/MapShell";

export default function Home() {
  return (
    <main className="h-screen w-screen">
      <MapShell layers={[]} />
    </main>
  );
}
```

- [ ] **Step 5: Verify dev server**

```bash
pnpm dev
```
Expected: localhost:3000 shows a pannable world map (CARTO light tiles) covering the viewport.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(map): MapShell with MapLibre + Deck.gl"
```

---

## Task 13: Reserves choropleth layer (Natural Earth + DuckDB join)

**Files:**
- Create: `src/components/layers/ReservesChoropleth.tsx`, `src/lib/geo/countries.ts`
- Add asset: `public/data/countries.geojson` (Natural Earth 1:110m admin-0, simplified)

- [ ] **Step 1: Download Natural Earth admin-0 (1:110m)**

```bash
mkdir -p public/data
curl -L -o /tmp/ne_110m.zip \
  https://naciscdn.org/naturalearth/110m/cultural/ne_110m_admin_0_countries.zip
unzip -o /tmp/ne_110m.zip -d /tmp/ne110/
uv run python - <<'PY'
import geopandas as gpd
g = gpd.read_file("/tmp/ne110/ne_110m_admin_0_countries.shp")
# Keep iso3, name, geometry
g = g[["ADM0_A3", "NAME", "geometry"]].rename(columns={"ADM0_A3": "iso3", "NAME": "name"})
g.to_file("public/data/countries.geojson", driver="GeoJSON")
print("rows:", len(g))
PY
```
Expected: ~258 country features.

- [ ] **Step 2: Write `src/lib/geo/countries.ts`**

```ts
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";

export interface CountryProps {
  readonly iso3: string;
  readonly name: string;
}

let _cache: FeatureCollection<Polygon | MultiPolygon, CountryProps> | undefined;

export async function loadCountries(): Promise<
  FeatureCollection<Polygon | MultiPolygon, CountryProps>
> {
  if (_cache) return _cache;
  const res = await fetch("/data/countries.geojson");
  if (!res.ok) throw new Error("countries.geojson fetch failed");
  _cache = (await res.json()) as FeatureCollection<Polygon | MultiPolygon, CountryProps>;
  return _cache;
}
```

- [ ] **Step 3: Write `src/components/layers/ReservesChoropleth.tsx`**

```tsx
"use client";
import { useEffect, useState } from "react";
import { GeoJsonLayer } from "@deck.gl/layers";
import type { Feature, Polygon, MultiPolygon } from "geojson";
import { loadCountries, type CountryProps } from "@/lib/geo/countries";
import { query } from "@/lib/duckdb/query";

type ReservesRow = { iso3: string; value: number };

function colorRamp(t: number): [number, number, number, number] {
  // simple sequential ramp from light grey → deep teal
  const t01 = Math.max(0, Math.min(1, t));
  const r = Math.round(230 - 200 * t01);
  const g = Math.round(230 - 80 * t01);
  const b = Math.round(230 - 50 * t01);
  return [r, g, b, 200];
}

export function useReservesChoropleth(year: number) {
  const [layer, setLayer] = useState<GeoJsonLayer | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const countries = await loadCountries();
      const res = await query<ReservesRow>(
        `SELECT iso3, value FROM read_parquet('/data/country_year_series.parquet')
         WHERE metric = 'proved_reserves_oil_bbn_bbl' AND year = ?`,
        [year],
      );
      if (cancelled) return;
      const byIso = new Map(res.rows.map((r) => [r.iso3, r.value]));
      const maxVal = Math.max(0, ...res.rows.map((r) => r.value));
      const styled = new GeoJsonLayer<CountryProps>({
        id: `reserves-${year}`,
        data: countries as unknown as Feature<Polygon | MultiPolygon, CountryProps>[],
        filled: true,
        stroked: true,
        getFillColor: (f) => {
          const v = byIso.get(f.properties.iso3) ?? 0;
          return colorRamp(maxVal > 0 ? v / maxVal : 0);
        },
        getLineColor: [120, 120, 120, 180],
        lineWidthMinPixels: 0.5,
        pickable: true,
        updateTriggers: { getFillColor: [year] },
      });
      setLayer(styled);
    })();
    return () => { cancelled = true; };
  }, [year]);
  return layer;
}
```

- [ ] **Step 4: Wire into `src/app/page.tsx`**

```tsx
"use client";
import { useState } from "react";
import { MapShell } from "@/components/map/MapShell";
import { useReservesChoropleth } from "@/components/layers/ReservesChoropleth";

export default function Home() {
  const [year] = useState(2024);
  const reserves = useReservesChoropleth(year);
  const layers = reserves ? [reserves] : [];
  return (
    <main className="h-screen w-screen">
      <MapShell layers={layers} />
    </main>
  );
}
```

- [ ] **Step 5: Verify**

```bash
pnpm dev
```
Expected: Globe with country polygons shaded by 2024 oil reserves (Saudi Arabia, Venezuela, Canada, Iran prominent).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(layers): reserves choropleth"
```

---

## Task 14: Extraction points layer

**Files:**
- Create: `src/components/layers/ExtractionPoints.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Write `src/components/layers/ExtractionPoints.tsx`**

```tsx
"use client";
import { useEffect, useState } from "react";
import { ScatterplotLayer } from "@deck.gl/layers";
import { query } from "@/lib/duckdb/query";

type AssetRow = {
  asset_id: string;
  name: string;
  country_iso3: string;
  lon: number;
  lat: number;
  capacity: number | null;
  operator: string | null;
  status: string | null;
};

export function useExtractionPoints() {
  const [layer, setLayer] = useState<ScatterplotLayer<AssetRow> | null>(null);
  useEffect(() => {
    void (async () => {
      const res = await query<AssetRow>(
        `SELECT asset_id, name, country_iso3, lon, lat, capacity, operator, status
         FROM read_parquet('/data/assets.parquet')
         WHERE kind = 'extraction_site'`,
      );
      const l = new ScatterplotLayer<AssetRow>({
        id: "extraction",
        data: res.rows,
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
  }, []);
  return layer;
}
```

- [ ] **Step 2: Wire into `src/app/page.tsx` with tooltip**

```tsx
"use client";
import { useCallback, useState } from "react";
import type { PickingInfo } from "@deck.gl/core";
import { MapShell } from "@/components/map/MapShell";
import { useReservesChoropleth } from "@/components/layers/ReservesChoropleth";
import { useExtractionPoints } from "@/components/layers/ExtractionPoints";

export default function Home() {
  const [year] = useState(2024);
  const reserves = useReservesChoropleth({ year });
  const extraction = useExtractionPoints();
  const layers = [reserves, extraction].filter((x) => x !== null);
  const getTooltip = useCallback((info: PickingInfo) => {
    const o = info.object as Record<string, unknown> | undefined;
    if (!o) return null;
    if (info.layer?.id === "extraction") {
      return [
        o.name as string,
        `Country: ${o.country_iso3 as string}`,
        `Operator: ${(o.operator as string) ?? "n/a"}`,
        `Status: ${(o.status as string) ?? "n/a"}`,
        `Capacity: ${o.capacity == null ? "n/a" : `${o.capacity as number} kboe/d`}`,
        `Source: ${(o.source as string) ?? "GEM"}`,
      ].join("\n");
    }
    if (typeof info.layer?.id === "string" && info.layer.id.startsWith("reserves-")) {
      const props = (o as { properties?: { name?: string; iso3?: string } }).properties;
      return props ? `${props.name ?? ""} (${props.iso3 ?? ""})` : null;
    }
    return null;
  }, []);
  return (
    <main className="h-screen w-screen">
      <MapShell layers={layers} getTooltip={getTooltip} />
    </main>
  );
}
```

- [ ] **Step 3: Verify**

```bash
pnpm dev
```
Expected: choropleth + red dots clustered in Gulf, Permian, North Sea, West Africa, Russia. Hovering an extraction point shows a multi-line tooltip with name/country/operator/status/capacity/source.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(layers): extraction sites scatterplot + tooltips"
```

---

## Task 15: Year slider

**Files:**
- Create: `src/components/time-slider/YearSlider.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Write `src/components/time-slider/YearSlider.tsx`**

```tsx
"use client";
import { useId } from "react";

export interface YearSliderProps {
  readonly min: number;
  readonly max: number;
  readonly value: number;
  readonly onChange: (year: number) => void;
}

export function YearSlider({ min, max, value, onChange }: YearSliderProps) {
  const id = useId();
  return (
    <div className="pointer-events-auto absolute bottom-6 left-1/2 z-10 w-[480px] -translate-x-1/2 rounded-md bg-white/90 p-3 shadow-lg backdrop-blur">
      <label htmlFor={id} className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">
        Year: <span className="font-mono text-slate-900">{value}</span>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => { onChange(Number(e.target.value)); }}
        className="w-full"
      />
    </div>
  );
}
```

- [ ] **Step 2: Wire into `src/app/page.tsx` (preserving tooltip)**

```tsx
"use client";
import { useCallback, useState } from "react";
import type { PickingInfo } from "@deck.gl/core";
import { MapShell } from "@/components/map/MapShell";
import { useReservesChoropleth } from "@/components/layers/ReservesChoropleth";
import { useExtractionPoints } from "@/components/layers/ExtractionPoints";
import { YearSlider } from "@/components/time-slider/YearSlider";

export default function Home() {
  const [year, setYear] = useState(2024);
  const reserves = useReservesChoropleth({ year });
  const extraction = useExtractionPoints();
  const layers = [reserves, extraction].filter((x) => x !== null);
  const getTooltip = useCallback((info: PickingInfo) => {
    const o = info.object as Record<string, unknown> | undefined;
    if (!o) return null;
    if (info.layer?.id === "extraction") {
      return [
        o.name as string,
        `Country: ${o.country_iso3 as string}`,
        `Operator: ${(o.operator as string) ?? "n/a"}`,
        `Status: ${(o.status as string) ?? "n/a"}`,
        `Capacity: ${o.capacity == null ? "n/a" : `${o.capacity as number} kboe/d`}`,
      ].join("\n");
    }
    return null;
  }, []);
  return (
    <main className="relative h-screen w-screen">
      <MapShell layers={layers} getTooltip={getTooltip} />
      <YearSlider min={1990} max={2024} value={year} onChange={setYear} />
    </main>
  );
}
```

- [ ] **Step 3: Verify**

```bash
pnpm dev
```
Expected: dragging the slider updates the choropleth shading.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(ui): year slider"
```

---

## Task 16: Scenario UI panel + Hormuz wiring

**Files:**
- Create: `src/components/scenarios/ScenarioPanel.tsx`, `src/components/scenarios/useHormuzScenario.ts`
- Modify: `src/components/layers/ReservesChoropleth.tsx` (accept a per-iso3 override callback)
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Refactor `ReservesChoropleth` to accept an optional override**

Replace the full contents of `src/components/layers/ReservesChoropleth.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";
import { GeoJsonLayer } from "@deck.gl/layers";
import type { Feature, Polygon, MultiPolygon } from "geojson";
import { loadCountries, type CountryProps } from "@/lib/geo/countries";
import { query } from "@/lib/duckdb/query";

type ReservesRow = { iso3: string; value: number };

export interface OverlayEntry {
  readonly color: readonly [number, number, number, number];
  readonly tooltip?: string;
}

export interface ReservesChoroplethInput {
  readonly year: number;
  readonly overlayByIso3?: ReadonlyMap<string, OverlayEntry>;
}

function colorRamp(t: number): [number, number, number, number] {
  const t01 = Math.max(0, Math.min(1, t));
  const r = Math.round(230 - 200 * t01);
  const g = Math.round(230 - 80 * t01);
  const b = Math.round(230 - 50 * t01);
  return [r, g, b, 200];
}

export function useReservesChoropleth({
  year,
  overlayByIso3,
}: ReservesChoroplethInput) {
  const [layer, setLayer] = useState<GeoJsonLayer | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const countries = await loadCountries();
      const res = await query<ReservesRow>(
        `SELECT iso3, value FROM read_parquet('/data/country_year_series.parquet')
         WHERE metric = 'proved_reserves_oil_bbn_bbl' AND year = ?`,
        [year],
      );
      if (cancelled) return;
      const byIso = new Map(res.rows.map((r) => [r.iso3, r.value]));
      const maxVal = Math.max(0, ...res.rows.map((r) => r.value));
      const styled = new GeoJsonLayer<CountryProps>({
        id: `reserves-${year}-${overlayByIso3 ? "ovl" : "base"}`,
        data: countries as unknown as Feature<Polygon | MultiPolygon, CountryProps>[],
        filled: true,
        stroked: true,
        getFillColor: (f) => {
          const iso = f.properties.iso3;
          const override = overlayByIso3?.get(iso);
          if (override) return [...override.color] as [number, number, number, number];
          const v = byIso.get(iso) ?? 0;
          return colorRamp(maxVal > 0 ? v / maxVal : 0);
        },
        getLineColor: [120, 120, 120, 180],
        lineWidthMinPixels: 0.5,
        pickable: true,
        updateTriggers: { getFillColor: [year, overlayByIso3] },
      });
      setLayer(styled);
    })();
    return () => { cancelled = true; };
  }, [year, overlayByIso3]);
  return layer;
}
```

Also update Task 13's call sites (`src/app/page.tsx` from Task 14/15) — pass `{ year }` instead of bare `year`. The downstream change is covered in Step 4 of this task.

- [ ] **Step 2: Write `src/components/scenarios/useHormuzScenario.ts`**

```tsx
"use client";
import { useEffect, useState } from "react";
import { computeHormuzImpact, type ScenarioResult } from "@/lib/scenarios/engine";
import { query } from "@/lib/duckdb/query";

interface FlowRow { year: number; importer_iso3: string; exporter_iso3: string; qty: number }
interface RouteRow { chokepoint_id: string; exporter_iso3: string; share: number }

export function useHormuzScenario(year: number, enabled: boolean) {
  const [result, setResult] = useState<ScenarioResult | null>(null);
  useEffect(() => {
    if (!enabled) { setResult(null); return; }
    let cancelled = false;
    void (async () => {
      const flows = await query<FlowRow>(
        `SELECT year, importer_iso3, exporter_iso3, COALESCE(qty, 0) AS qty
         FROM read_parquet('/data/trade_flow.parquet')
         WHERE year = ? AND hs_code = '2709'`,
        [year],
      );
      const routes = await query<RouteRow>(
        `SELECT chokepoint_id, exporter_iso3, share FROM read_parquet('/data/chokepoint_route.parquet')`,
      );
      if (cancelled) return;
      setResult(computeHormuzImpact({ year, tradeFlows: flows.rows, routes: routes.rows }));
    })();
    return () => { cancelled = true; };
  }, [year, enabled]);
  return result;
}

export function hormuzOverlay(r: ScenarioResult | null) {
  if (!r) return undefined;
  const m = new Map<string, { color: [number, number, number, number]; tooltip: string }>();
  for (const imp of r.byImporter) {
    const t = imp.shareAtRisk;
    // red intensity ∝ share at risk
    const red = Math.round(80 + 175 * t);
    m.set(imp.iso3, {
      color: [red, 30, 30, 220],
      tooltip: `${imp.iso3}: ${(t * 100).toFixed(1)}% of crude imports at risk`,
    });
  }
  return m;
}
```

- [ ] **Step 3: Write `src/components/scenarios/ScenarioPanel.tsx`**

```tsx
"use client";
import type { ScenarioResult } from "@/lib/scenarios/engine";

export interface ScenarioPanelProps {
  readonly enabled: boolean;
  readonly onToggle: (v: boolean) => void;
  readonly result: ScenarioResult | null;
}

export function ScenarioPanel({ enabled, onToggle, result }: ScenarioPanelProps) {
  const top = result?.ranked.slice(0, 8) ?? [];
  return (
    <div className="pointer-events-auto absolute right-4 top-4 z-10 w-72 rounded-md bg-white/90 p-3 text-sm shadow-lg backdrop-blur">
      <label className="flex items-center gap-2 font-medium">
        <input type="checkbox" checked={enabled} onChange={(e) => { onToggle(e.target.checked); }} />
        Close Strait of Hormuz
      </label>
      {enabled && result && (
        <div className="mt-3">
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-600">
            Top importers at risk
          </div>
          <ol className="space-y-0.5">
            {top.map((r) => (
              <li key={r.iso3} className="flex justify-between font-mono text-xs">
                <span>{r.iso3}</span>
                <span>{(r.shareAtRisk * 100).toFixed(1)}%</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Update `src/app/page.tsx` to glue it all together**

```tsx
"use client";
import { useCallback, useMemo, useState } from "react";
import type { PickingInfo } from "@deck.gl/core";
import { MapShell } from "@/components/map/MapShell";
import { useReservesChoropleth } from "@/components/layers/ReservesChoropleth";
import { useExtractionPoints } from "@/components/layers/ExtractionPoints";
import { YearSlider } from "@/components/time-slider/YearSlider";
import { ScenarioPanel } from "@/components/scenarios/ScenarioPanel";
import { useHormuzScenario, hormuzOverlay } from "@/components/scenarios/useHormuzScenario";

export default function Home() {
  const [year, setYear] = useState(2024);
  const [hormuzOn, setHormuzOn] = useState(false);
  const scenario = useHormuzScenario(year, hormuzOn);
  const overlay = useMemo(() => hormuzOverlay(scenario), [scenario]);
  const reserves = useReservesChoropleth({ year, overlayByIso3: overlay });
  const extraction = useExtractionPoints();
  const layers = [reserves, extraction].filter((x) => x !== null);
  const getTooltip = useCallback((info: PickingInfo) => {
    const o = info.object as Record<string, unknown> | undefined;
    if (!o) return null;
    if (info.layer?.id === "extraction") {
      return [
        o.name as string,
        `Country: ${o.country_iso3 as string}`,
        `Operator: ${(o.operator as string) ?? "n/a"}`,
        `Status: ${(o.status as string) ?? "n/a"}`,
        `Capacity: ${o.capacity == null ? "n/a" : `${o.capacity as number} kboe/d`}`,
      ].join("\n");
    }
    return null;
  }, []);
  return (
    <main className="relative h-screen w-screen">
      <MapShell layers={layers} getTooltip={getTooltip} />
      <YearSlider min={1990} max={2024} value={year} onChange={setYear} />
      <ScenarioPanel enabled={hormuzOn} onToggle={setHormuzOn} result={scenario} />
    </main>
  );
}
```

- [ ] **Step 5: Verify**

```bash
pnpm dev
```
Expected: ticking the checkbox restyles importer countries by red intensity proportional to share-at-risk; ranked list populates (China, India, Japan, South Korea high; Mexico ~0).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(scenarios): Hormuz closure overlay + ranked-impact panel"
```

---

## Task 17: Methodology page rendered from catalog.json

**Files:**
- Create: `src/app/about/page.tsx`, `docs/methodology.md`

- [ ] **Step 1: Author `docs/methodology.md`**

Write a 3-section markdown doc:
1. Scope & approach (what Phase 1 covers, what's deferred)
2. Caveats (single-source values, simplifications like Hormuz share fixing)
3. Attribution: explicit "Data: Global Energy Monitor, CC BY 4.0" for GEM sources

- [ ] **Step 2: Write `src/app/about/page.tsx`**

```tsx
import fs from "node:fs/promises";
import path from "node:path";
import type { Catalog } from "@/lib/data-catalog/types";
import { parseCatalog } from "@/lib/data-catalog";

async function readCatalog(): Promise<Catalog> {
  const raw = await fs.readFile(
    path.join(process.cwd(), "public", "data", "catalog.json"),
    "utf8",
  );
  return parseCatalog(JSON.parse(raw));
}

async function readMethodology(): Promise<string> {
  return fs.readFile(path.join(process.cwd(), "docs", "methodology.md"), "utf8");
}

export default async function AboutPage() {
  const [catalog, methodology] = await Promise.all([readCatalog(), readMethodology()]);
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold">Methodology</h1>
      <pre className="mt-4 whitespace-pre-wrap text-sm">{methodology}</pre>
      <h2 className="mt-10 text-2xl font-semibold">Data sources</h2>
      <table className="mt-4 w-full text-sm">
        <thead className="text-left text-xs uppercase text-slate-500">
          <tr><th>Label</th><th>Source</th><th>License</th><th>As of</th></tr>
        </thead>
        <tbody>
          {catalog.entries.map((e) => (
            <tr key={e.id} className="border-t border-slate-200">
              <td className="py-2 pr-4">{e.label}</td>
              <td className="py-2 pr-4">
                <a className="underline" href={e.source_url}>{e.source_name}</a>
              </td>
              <td className="py-2 pr-4">{e.license}</td>
              <td className="py-2 pr-4 font-mono">{e.as_of}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
```

- [ ] **Step 3: Verify**

Visit http://localhost:3000/about — table lists all catalog entries with working source links.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(about): methodology page driven by catalog.json"
```

---

## Task 18: Playwright smoke test

**Files:**
- Create: `tests/e2e/phase-1.spec.ts`

- [ ] **Step 1: Write the test**

```ts
import { test, expect } from "@playwright/test";

test("phase 1 critical path", async ({ page }) => {
  await page.goto("/");
  // map canvas attaches
  await expect(page.locator("#deck-canvas")).toBeVisible();
  // year slider present
  const slider = page.locator('input[type="range"]');
  await expect(slider).toBeVisible();
  // scenario panel + checkbox
  const checkbox = page.getByLabel(/Close Strait of Hormuz/i);
  await expect(checkbox).toBeVisible();
  await checkbox.check();
  // ranked list should populate; wait for at least one importer row
  await expect(page.getByText(/% /).first()).toBeVisible({ timeout: 15_000 });
  // about page renders catalog
  await page.goto("/about");
  await expect(page.getByRole("heading", { name: "Methodology" })).toBeVisible();
  await expect(page.getByText("Energy Institute")).toBeVisible();
});
```

- [ ] **Step 2: Run**

```bash
pnpm test:e2e
```
Expected: 1 passing.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "test(e2e): Phase 1 critical-path smoke"
```

---

## Task 19: Deploy to Vercel

**Files:**
- Create: `vercel.json` (only if needed for headers / routing)

- [ ] **Step 1: Configure project**

```bash
pnpm dlx vercel link
pnpm dlx vercel pull
```

- [ ] **Step 2: Configure CORS / cache headers for `/data/*` if needed**

If DuckDB-WASM hits range-request issues, add `vercel.json`:
```json
{
  "headers": [
    {
      "source": "/data/(.*)",
      "headers": [
        { "key": "Access-Control-Allow-Origin", "value": "*" },
        { "key": "Cache-Control", "value": "public, max-age=3600" }
      ]
    }
  ]
}
```

- [ ] **Step 3: Preview deploy**

```bash
pnpm dlx vercel
```
Verify the preview URL: map loads, slider works, Hormuz scenario toggles, /about lists sources.

- [ ] **Step 4: Promote to production**

```bash
pnpm dlx vercel --prod
```

- [ ] **Step 5: Final commit**

```bash
git add -A && git commit -m "chore: Vercel deploy config"
```

---

## Verification — Phase 1 DoD

Run through each item; do not call Phase 1 done until all pass.

- [ ] `pnpm dev` shows globe + reserves choropleth + extraction points.
- [ ] Year slider scrubs 1990→2024 and choropleth restyles.
- [ ] Hover an extraction point → tooltip surfaces name / country / operator / status / capacity.
- [ ] Toggle Hormuz scenario → importer overlay restyles + ranked panel populates with at least China and India in top 8.
- [ ] `/about` lists every entry in `catalog.json` with working source URLs.
- [ ] `pnpm test` — all Vitest tests pass.
- [ ] `pnpm test:e2e` — Playwright passes.
- [ ] Production Vercel URL renders without console errors; Lighthouse LCP < 4s.
- [ ] CLAUDE.md phase-status block updated to "Phase 1 — shipped".

---

## Notes / known gotchas

- **EI workbook schema drift:** the column-name discovery in `build_country_year.py` is robust but not bulletproof. If a year's release changes the `Var` codes (e.g., `oilreserves_bbnbbl` → `oil_reserves_bbn_bbl`), update `METRIC_MAP` in one place.
- **Comtrade quota:** 500 calls/day; full backfill from 1990 is ~36 calls (one per year), well within budget. If a single year returns > 100K records, paginate by reporterCode.
- **DuckDB-WASM range reads:** ensure Vercel serves Parquet files with `Accept-Ranges: bytes`. It does by default for static assets, but `vercel.json` cache headers above keep it tidy.
- **Map performance:** ~15K extraction points should render fine in Deck.gl. If perf flags, switch `ScatterplotLayer` to `IconLayer` with a sprite atlas or aggregate via `H3HexagonLayer` at low zooms.
- **Phase 1 simplification:** Hormuz shares are hardcoded (EIA-derived). Phase 2+ should refine using actual seaborne vs pipeline export shares per exporter per year.
