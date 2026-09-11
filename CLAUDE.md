# CLAUDE.md — Global Energy Map

> An interactive OSINT visualization of the world's hydrocarbon energy system — reserves, extraction, transport, refining, distribution — for academics, energy-policy researchers, and IR/economics scholars who think in systems.
>
> Status: Phases 1–9 shipped; Phase 10 (launch hardening) in review (live at https://energymap.marain.space; the old https://global-energy-map-one.vercel.app address permanently redirects there). See `docs/superpowers/specs/2026-05-15-global-energy-map-design.md` for the full design and `docs/superpowers/plans/` for per-phase plans.

## One-liner

A public web app that lets serious analysts interrogate global energy dependencies as inspectable, time-varying, scenario-testable structure.

## Tech stack at a glance

**App**
- Next.js 16 (App Router) · React 19 · TypeScript strict (ES2022) · `@/*` → `./src/*`
- pnpm 10.x · Tailwind v4
- ESLint flat config (`typescript-eslint` strictTypeChecked + `next/core-web-vitals`)
- Vitest (unit) · Playwright (e2e)

**Map / viz**
- `deck.gl` for data layers (points, choropleths, animated flows)
- `maplibre-gl` for basemap, served by OpenFreeMap Positron vector tiles via `src/components/map/style.ts` — no API key, no local tile server. (CARTO `light_all` was used through Phase 6 until CARTO began watermarking keyless tiles.) PMTiles for the basemap is deliberately deferred.
- Natural Earth admin-0 polygons (public domain) for the reserves choropleth

**In-browser data layer**
- `@duckdb/duckdb-wasm` runs SQL over Parquet served from our own origin. The wasm/worker bundles and the signed `parquet` extension are **self-hosted** under `/duckdb/` (copied/downloaded at `predev`/`prebuild` by `scripts/copy-duckdb.mjs`, sha256-pinned) — no runtime request to jsDelivr or extensions.duckdb.org
- One shared DuckDB instance (the boot promise is cached); each parquet is registered once (small files as buffers)
- No backend for the analytics path; the only third-party runtime host is the OpenFreeMap basemap

**Build-time data layer**
- Python (uv-managed) under `scripts/ingest/` and `scripts/transform/`
- Deps: `httpx`, `pandas`, `geopandas`, `pyarrow`, `duckdb` (Python bindings)
- Outputs versioned Parquet/GeoParquet under `public/data/`

**Hosting**
- Vercel for the app, auto-deploys on push to `main`; Vercel Web Analytics (cookieless) via `<Analytics />` in `layout.tsx` — must be enabled in the Vercel project
- `.github/workflows/smoke.yml` runs after each successful deployment against the public alias (per-deployment `*.vercel.app` URLs sit behind Vercel login; previews need `VERCEL_AUTOMATION_BYPASS_SECRET`)
- Vercel Blob (or Cloudflare R2 if size demands) for any data exceeding ~25 MB single-file / ~100 MB total. Not in use yet — the largest sidecar (pipelines.geojson) is ~8 MB after merging line fragments and simplifying (Phase 5, Phase 10).

## Repo layout

```
global-energy-map/
├── src/
│   ├── app/                       # Next.js App Router: page.tsx (map), methodology/, data/ (/about → /methodology redirect in next.config.ts)
│   ├── components/
│   │   ├── map/                   # MapShell: MapLibre map + deck.gl via MapboxOverlay (interleaved, beneath basemap labels)
│   │   ├── layers/                # pure builders `buildXLayer(rows, opts)` + `formatXTooltip` per layer; useMapLayers memoises them; LayerPanel, generated Legend
│   │   ├── time-slider/
│   │   ├── scenarios/             # ScenarioPanel, overlay, useScenario hook
│   │   └── ui/
│   └── lib/
│       ├── duckdb/                # WASM bootstrap, query() (BIGINT → number at the boundary)
│       ├── data/                  # cached loaders: assets (one scan, grouped by kind), voyages, reserves, scenario inputs, catalog sources
│       ├── symbology/             # every colour, ramp, radius rule and glyph — layers and Legend both import from here
│       ├── state/                 # external app store (AppState + map view) with debounced history.replaceState
│       ├── data-catalog/          # typed access to catalog.json
│       ├── scenarios/             # pure-function scenario engine (oil + gas axes, refinery/LNG attribution)
│       ├── url-state/             # encode/decode (incl. lon/lat/z) + useUrlState (thin wrapper over the store)
│       ├── vintage/               # vintage filter predicate for time-aware layers
│       └── geo/
├── public/
│   └── data/                      # built Parquet + GeoJSON sidecars + generated catalog.json (runtime files only)
├── scripts/
│   ├── build_all.py               # one-command ordered rebuild of every transform (byte-identical reruns)
│   ├── common/                    # iso3, parquet schemas + append_kind, download, NETL REST helper
│   ├── ingest/                    # one script per source
│   └── transform/                 # joins / harmonization → Parquet
├── tests/
│   ├── unit/                      # Vitest (TS) — scenarios, url-state, vintage filter, data-catalog
│   ├── python/                    # pytest — helpers, transform fixtures, data-integrity checks over public/data
│   └── e2e/                       # Playwright feature specs (map, layers, time, scenarios, url, about) + helpers.ts
├── docs/
│   ├── data-sources.md            # researcher-facing source inventory
│   ├── methodology.md             # current-state methodology, rendered at /methodology
│   ├── history.md                 # per-phase narrative (Phases 1–8), verbatim
│   └── superpowers/
│       ├── specs/                 # design specs (per phase + master)
│       └── plans/                 # implementation plans (per phase)
├── .github/
│   └── workflows/
│       └── ci.yml                 # lint + typecheck + Vitest + build (app); ruff + pytest (Python); Playwright e2e
├── pyproject.toml
├── README.md
├── LICENSE
├── CITATION.cff
└── package.json
```

## Schema (Phase 1–2 outputs)

Designed so adding a new commodity is a row, not a migration.

| Table | Shape | Source |
|---|---|---|
| `country` | iso3, name, region, geom | Natural Earth |
| `basin` | basin_id, name, country_iso3, area_km2, region, geometry | NETL Global Oil and Gas Infrastructure |
| `asset` | asset_id, kind (extraction_site, refinery, lng_export, lng_import, storage, port), name, iso3, lon, lat, capacity, capacity_unit, operator, status, commissioned_year, decommissioned_year, source, source_version | GEM trackers + NETL GOGI + OpenStreetMap |
| `pipelines` | pipeline_id, name, status, commodity (crude, ngl, crude+ngl, gas), capacity_kbpd, capacity_unit, start_country_iso3, end_country_iso3, operator, start_year, geometry (LineString / MultiLineString) | GEM oil + gas infrastructure trackers |
| `country_year_series` | iso3, year (1990–2024), metric (production_crude_kbpd, proved_reserves_oil_bbn_bbl, proved_reserves_gas_tcm), value, unit | EI Statistical Review |
| `trade_flow` | year, hs_code (2709 crude, 271111 LNG), exporter_iso3, importer_iso3, qty | BACI (CEPII) |
| `disruption_route` | scenario_id, origin_iso3, destination_iso3, route_share, affected_infrastructure, source_title, source_url, source_year | EIA / IEA scenario analysis (per-row citations) |
| `lng_voyage`, `lng_trade_daily`, `lng_terminal_daily` | start/end dates, IMO, from/to terminal + country/iso3, amount_cbm, confidence_score | Phase 6 — LNG-T3 |

All artifacts indexed in `public/data/catalog.json` (path, license, source URL, as-of, rows, bytes, sha256) — **generated** by `build_catalog.py`, never hand-edited; the methodology page renders straight off it. Full-resolution `pipelines`/`basins` GeoParquet is written to `data/derived/` (gitignored); only the simplified GeoJSON sidecars ship.

## Data sources (verified, public)

For a researcher-facing inventory (with coverage gaps, evaluated-and-rejected sources, and post-launch candidates) see `docs/data-sources.md`. The table below is the quick reference.

| Layer | Source | License | Notes |
|---|---|---|---|
| Reserves (country-year, oil + gas) | Energy Institute Statistical Review of World Energy | Free, terms on site | Phase 1/3 — reserves capped at 2020; production runs through 2024 |
| Extraction sites | GEM Global Oil & Gas Extraction Tracker | **CC BY 4.0** | Phase 1 — 5,008 sites; July 2023 snapshot; commissioned_year populated 22% |
| Oil pipelines | GEM Global Oil Infrastructure Tracker (GOIT GeoJSON) | **CC BY 4.0** | Phase 2 — 2025-04-09 release; start_year populated 71% |
| Gas pipelines | GEM Global Gas Infrastructure Tracker (GGIT) | **CC BY 4.0** | Phase 3 — 2026-02-20 release; capacity in bcm/y |
| LNG terminals + voyages + daily flows | LNG-T3 (Zhou et al. 2026, Zenodo) primary + GEM GGIT supplement | CC BY 4.0 / CC BY 4.0 | Phase 6 — 305 LNG-T3 active terminals (25 duplicate operating/construction names collapsed) + 7 GEM terminals after collapsing multi-unit pids to one row per terminal, a same-name-same-country pre-pass, and a 25 km same-country haversine dedup; 312 LNG terminals total, capacity 310/312, `commissioned_year` 305/312 (97.8%); 17,592 voyages + 16,691 trade-daily + 16,115 terminal-daily rows, 2020–2024 |
| Refineries | NETL GOGI Refineries (primary) + OpenStreetMap (supplement) | Public domain / ODbL | Phase 5/8 — 1,075 NETL (after 1 km within-source dedup that never merges conflicting capacities) + 88 OSM (2 km cross-source dedup) = 1,163; capacity for 350 |
| Basins / storage / ports | NETL Global Oil & Gas Infrastructure (US DOE) | Public domain (17 USC §105) | Phase 4 — 1,046 basins + 26,102 storage + 3,694 ports |
| Crude + LNG trade flows | BACI (CEPII), HS 2709 + HS 271111 | Free for academic/research use; see CEPII terms | Annual bilateral flows; no API key required; pre-processed & deduplicated |
| Chokepoints + pipeline disruption scenarios | EIA World Oil Transit Chokepoints + IEA pipeline reports | Public, free | 5 scenarios: Hormuz, Hormuz-LNG, Druzhba, BTC, CPC |
| Country boundaries | Natural Earth admin-0 (1:110m) | Public domain | Phase 1 — basemap + reserves choropleth fills |
| Basemap | OpenFreeMap Positron (vector, OpenMapTiles schema) | Free (no key); © OpenMapTiles, data © OpenStreetMap | Runtime tiles via `src/components/map/style.ts` |
| Coal (mines + plants) | _deferred (post-launch)_ | GEM CC BY 4.0 (when integrated) | Coal sector / cross-commodity scenarios are a post-launch candidate |
| Tankers / AIS | _deferred (post-launch)_ | TankerMap free for live; paid for historical | Own brainstorm — AIS sourcing is the gating decision |
| EIA STEO US shale basin time series | _deferred (post-launch)_ | Public (US gov), free API key | Only authoritative open per-basin time-series we've found (Anadarko/Bakken/Eagle Ford/Permian/etc.) |

API keys live in `~/.config/secrets.env` (e.g., `TAVILY_API_KEY`, `EXA_API_KEY`). The EIA API key is registered separately; add to `~/.config/secrets.env` as `EIA_API_KEY` before any EIA work. BACI (the trade-flow source) does not require a key. Never commit secrets.

## Common commands

```bash
# App
pnpm install
pnpm dev                       # localhost:3000
pnpm build && pnpm start        # prebuild copies DuckDB bundles + downloads the pinned parquet extension into public/duckdb/
pnpm lint
pnpm typecheck                 # tsc --noEmit
pnpm test                      # Vitest unit
pnpm test:e2e                  # Playwright
scripts/smoke/run.sh <url>     # post-deploy smoke against a deployed URL (pages, catalog sizes+sha256, Range read, one browser check)

# Data pipeline (build-time)
uv sync                                              # install Python deps
uv run python -m scripts.ingest.<source>            # one ingest per source (gem_*, netl_*, baci_*, osm_*, ei_*, lng_t3)
uv run python -m scripts.build_all                         # every transform in dependency order, then build_catalog (reruns are byte-identical)
uv run python -m scripts.build_all --from build_refineries # resume from one step (also --only <step>, --ingest to fetch sources first)
uv run python -m scripts.transform.build_<name>           # any single transform (see build_all.py for the order; asset writers use append_kind)
uv run python -m scripts.validate.lng_t3_vs_giignl        # LNG-T3 vs GIIGNL public-total reconciliation
uv run python -m pytest tests/python -v                   # `python -m` form: bare `uv run pytest` fails to spawn on some machines

# Deploy
vercel                         # preview
vercel --prod                  # production
```

CI (`.github/workflows/ci.yml`) runs on every push/PR: `pnpm lint` + `pnpm typecheck` + `pnpm test` (Vitest) + `pnpm build` for the app; `uv sync --locked` + `ruff check` + `ruff format --check` + `python -m pytest tests/python` (schemas, fixtures, data integrity) for the Python pipeline; and a Playwright e2e job.

**Environment:** after moving or re-cloning the repo, run `pnpm install` (relinks node_modules) and `uv sync` (rebuilds `.venv`) — a stale link makes `next dev` panic with "Next.js package not found".

## Conventions

- **TDD where it pays:** scenario engine, data transforms, query helpers — write failing test first. UI components covered by Playwright e2e smoke tests, not unit-tested by default.
- **Pure functions for scenarios:** `src/lib/scenarios/` exports pure functions that take in baseline data + scenario params and return derived layer styling. No side effects, no map handles. Easy to unit-test.
- **Catalog manifest is the source of truth for `/methodology`, `/data`, tooltips and Share/cite** (license, source URL, as-of, rows, sha256, `redistributable` / `downloadable`). `build_catalog.py` also writes `src/lib/export/citations.generated.json` (scenario-share citations + CITATION.cff) — regenerate, never hand-edit.
- **Runtime data paths are hardcoded by design.** Loaders in `src/lib/data/` call `read_parquet('/data/<file>.parquet')` directly in DuckDB SQL (or `fetch` a GeoJSON sidecar). Do not try to thread catalog `path` fields through the runtime — the catalog is metadata, not a config table. When you add a new layer, add a `public/data/catalog.json` entry AND hardcode the path in the SQL.
- **Geometry ships as simplified GeoJSON sidecars** (`pipelines.geojson`, `basins.geojson`, `countries.geojson`); the DuckDB-WASM `spatial` extension is not reliable in the pinned dev build. Full-resolution GeoParquet stays build-time only in `data/derived/`.
- **One data path.** Layers never query on their own: `src/lib/data/` loaders are module-cached promises (cache the promise, not the result), `useAssets()` scans `assets.parquet` once and groups by `kind`, and layer files are pure `buildXLayer(rows, opts)` functions memoised in `useMapLayers`. Year/vintage filtering happens in memory. Layer ids are stable (tooltips and e2e key on them).
- **Symbology lives in `src/lib/symbology/`.** No inline RGBA in layer files; the Legend renders from the same constants plus `LayerState`, so they cannot drift.
- **Tooltips are per layer.** Each layer exports `formatXTooltip`; `page.tsx` dispatches by layer id. Every tooltip ends with source + as-of from the statically imported catalog.
- **State and URL.** `src/lib/state/store.ts` owns `AppState` + map view; `useUrlState` wraps it. The URL is written with a debounced `history.replaceState` — never `router.replace` (that turned every slider tick into a Next navigation).
- **Map rendering.** deck.gl runs inside MapLibre via `MapboxOverlay({ interleaved: true })`; MapShell inserts deck layers before the style's first symbol layer so basemap labels draw above fills. There is one canvas (`.maplibregl-canvas`).
- **Citations:** Every layer must register a source entry in `catalog.json` (source URL, license, version/as-of). `/methodology` and `/data` enumerate them — no manual list.
- **GEM data attribution:** All GEM outputs require visible "Data: Global Energy Monitor, CC BY 4.0" attribution in the methodology page and any layer-level metadata UI.
- **No client-side calls to data-provider APIs.** BACI, EIA, NETL, GEM, etc. are hit only at build time by Python ingestion scripts. The runtime analytics path is pure HTTP range reads over Parquet/GeoJSON.
- **Idempotent transforms.** Every `build_*.py` drops prior rows of its kind from the target Parquet before appending — re-running is safe.
- **Source provenance on rows.** Multi-source tables (e.g., refineries) carry a `source` column so downstream consumers can filter or label by origin.
- **Vintage-aware layer behavior.** Pipelines (`start_year`, 71%) and extraction sites (`commissioned_year`, 22%) respect the active year slider. Null vintage = always visible; refineries/LNG/storage/ports have no vintage data and remain time-independent.
- **Versioned data URLs + immutable caching.** Runtime data URLs go through `dataUrl()` (`src/lib/data/urls.ts`), which appends `?v=<first 8 of sha256>` from the bundled catalog; `next.config.ts` serves `?v=` requests `max-age=31536000, immutable` and unversioned ones `max-age=0`. Never change a file in `public/data/` without regenerating the catalog (`build_all` does) — a stale hash would pin browsers to old bytes for a year.
- **DuckDB core version is pinned twice** (`DUCKDB_CORE_VERSION` in `src/lib/duckdb/bundles.ts` and `scripts/copy-duckdb.mjs`, with the extension sha256s). Upgrading `@duckdb/duckdb-wasm` means bumping both and the hashes; on a mismatch the app warns and falls back to DuckDB's default extension repository.
- **Errors surface.** Render errors, uncaught errors/rejections and failed data loads (`useAsync` → `reportError`) show the error panel (reload / report-an-issue) instead of a blank or forever-loading map.
- **Data licensing lives in `LICENSE-DATA.md`.** Downloadable = every source of the file is CC BY 4.0, public domain, Etalab Open Licence 2.0 (BACI) or project-derived. `assets_open.parquet` is the downloadable asset table (no ODbL OSM rows); EI reserves stay view-only.
- **Refreshing data:** follow `docs/refresh.md`; all source URLs/releases/dates are pinned in `scripts/common/sources.py`.
- **e2e is CPU-bound.** Every Playwright spec boots DuckDB-WASM and deck.gl under headless software WebGL. `playwright.config.ts` runs `workers: 1` unconditionally; scenario-panel expects need ~120 s inside 180 s test budgets to pass on ubuntu-latest (a Mac passes at 60 s). CI runs e2e against `pnpm build && pnpm start` under `CI=1`; the push trigger is limited to `main` so a PR branch runs once.
- **Parallel implementer agents do not commit or stage.** Give each a disjoint file set, have them report changed files, then commit each set with an explicit `git add <files>`. Never `git add -A` on a shared tree. An agent's `git rm` stages a deletion that the next commit sweeps up — agents delete with plain `rm`.
- **e2e waits on `main[data-ready="true"]`** (data loaded for the current inputs), clicks through the hydration-safe helpers in `tests/e2e/helpers.ts`, and proves rendering with screenshot pixel probes at projected lon/lat points — never fixed sleeps.
- **Modes are presets, not filters.** `mode` (infrastructure | flows | scenarios) fills in only what the URL leaves out; explicit `layers`/`year`/`commodity`/`scenario` params always win, so old shared links render unchanged. Presets live in `src/lib/modes/`.
- **Downloads follow the licensing decision.** Only files whose every source is CC BY 4.0 or public domain are downloadable (`downloadable` in the catalog). EI reserves, BACI trade and `assets.parquet` (88 ODbL OSM rows mixed in) are view-only. The scenario-results CSV is treated as derived analysis and ships with citation header lines.
- **Palette discipline.** Oil = warm family, gas = cool family, reserves = olive sequential, red only for scenario exposure; `tests/unit/symbology-contrast.test.ts` guards contrast against the Positron basemap and between key pairs. Storage and ports render only from zoom 4.
- **a11y is tested.** `tests/e2e/a11y.spec.ts` runs axe on `/`, `/methodology`, `/data` (zero serious/critical) and checks focus order (DOM order = header → intro → panels → map). Panel text must stay ≥ 4.5:1 composited over black (worst case); slate-500 fails — use slate-600 or darker.
- **Light-only UI.** There is no dark theme (decided 2026-09-10); `globals.css` sets `color-scheme: light` and has no `prefers-color-scheme` block. Panels still set their own text colour (`text-slate-800`) so they never inherit from the host.
- **Tailwind v4 layers vs. third-party CSS.** Tailwind utilities live in `@layer utilities`; unlayered library CSS (e.g. `maplibre-gl.css`) beats them regardless of order. Size the MapLibre container with inline styles (see `MapShell.tsx`).
- **deck.gl accessors need `updateTriggers`.** Recolouring a layer from a `useMemo` with fresh closures does nothing unless the trigger changes; keep `updateTriggers` keyed on the input that drives the colour.
- **Terminal name is the runtime join key** between `lng_voyage.parquet` and LNG terminal rows (never `asset_id`); `build_lng_terminals.py` asserts `(country_iso3, name)` uniqueness and `build_lng_voyages.py` asserts every `to_terminal` resolves.

## Workflow

- Plans live in `docs/superpowers/plans/`. Execute via `superpowers:subagent-driven-development` (preferred) or `superpowers:executing-plans`.
- Each phase is a vertical slice that produces a deployable artifact (see the phase plan in the spec).
- Commit small and often. Each ingestion script, each layer, each scenario is its own commit.

## Sibling-project precedents (in `~/ai/`)

- `org-spine` — copy lint/TS/pnpm/Vitest/Playwright config (Next 15, pnpm 10, ES2022, strict).
- `calendars` — pattern for CLI-driven periodic data refresh (launchd, logging, health checks).
- No sibling has Deck.gl + DuckDB-WASM + PMTiles — we're establishing the convention here.

## Phase status

- **Phase 1** — _shipped 2026-05-15_ (reserves + extraction + time slider + Hormuz scenario). Live: https://global-energy-map-one.vercel.app
- **Phase 2** — _shipped 2026-05-15_ (oil pipelines + refineries + 4 disruption scenarios: Hormuz/Druzhba/BTC/CPC).
- **Phase 3** — _shipped 2026-05-16_ (gas pipelines + LNG terminals + Hormuz-LNG scenario). Live: https://global-energy-map-one.vercel.app
- **Phase 4** — _shipped 2026-05-17_ (NETL basins + storage + ports + shareable URL state). Live: https://global-energy-map-one.vercel.app
- **Phase 5** — _shipped 2026-05-17_ (NETL refineries augmentation + vintage-aware pipeline/extraction filtering + pipelines.geojson simplification). Live: https://global-energy-map-one.vercel.app
- **Phase 6** — _shipped 2026-09-09_ (LNG-T3 terminals + voyages + BACI-anchored Hormuz-LNG attribution + CI + MIT/CITATION). Live: https://global-energy-map-one.vercel.app
- **Phase 7 — Correctness** — _shipped 2026-09-10_ (PR #16: EI year parsing, basemap render + OpenFreeMap, 1990–2024 time axis, honest scenario overlay, generated catalog, cited scenario shares, data-integrity tests). Plan: `docs/superpowers/plans/2026-09-10-global-energy-map-phase-7.md`. Roadmap from the refactor/redesign review (`docs/superpowers/specs/2026-09-10-refactor-redesign-review.md`): Phase 7 Correctness → Phase 8 Consolidation → Phase 9 Product redesign → Phase 10 Launch hardening.
- **Phase 8 — Consolidation** — _shipped 2026-09-10_ (PR #17) (plan: `docs/superpowers/plans/2026-09-10-global-energy-map-phase-8.md`): one cached asset load + pure layer builders, symbology module + generated Legend, per-layer tooltips, app store + `replaceState` URL sync with map view, MapboxOverlay interleaved, `build_all.py` with byte-identical rebuilds, NETL refinery dedup (2,360 → 1,163), NGL pipelines drawn, feature e2e with pixel probes, dependency sweep. Deferred per review: daily-throughput tooltip, vintage filter on scenario inputs.
- **Phase 9 — Product redesign** — _shipped 2026-09-10_ (PR #19) (plan: `docs/superpowers/plans/2026-09-10-global-energy-map-phase-9.md`): three-mode IA + sane defaults, visual pass, time controls, Methodology/Data pages, export + cite + copy link, scenario panel v2, phone banner, accessibility.
- **Phase 10 — Public-launch hardening** — _in review_ on branch `phase-10-launch` (plan: `docs/superpowers/plans/2026-09-10-global-energy-map-phase-10.md`): perf + caching + self-hosted DuckDB, LICENSE-DATA.md + open asset extract, refresh runbook, analytics + error boundary + post-deploy smoke.
- **Going public** — decided: after Phase 9, with `LICENSE-DATA.md` (done), map-footer attribution (done), downloads limited to openly licensed files (CC BY / public domain / Etalab). Remaining launch steps for the maintainer: enable Vercel Web Analytics; optional custom domain; announce. Light-only UI; phones get a "best on desktop" banner; keep DuckDB-WASM (export + query console in scope).
