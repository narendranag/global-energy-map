# CLAUDE.md — Global Energy Map

> An interactive OSINT visualization of the world's hydrocarbon energy system — reserves, extraction, transport, refining, distribution — for academics, energy-policy researchers, and IR/economics scholars who think in systems.
>
> Status: Phase 1 not yet implemented. Project scaffold pending. See `docs/superpowers/specs/2026-05-15-global-energy-map-design.md` for the full design and `docs/superpowers/plans/` for the active implementation plan.

## One-liner

A public web app that lets serious analysts interrogate global energy dependencies as inspectable, time-varying, scenario-testable structure.

## Tech stack at a glance

**App**
- Next.js 15 (App Router) · React 19 · TypeScript strict (ES2022) · `@/*` → `./src/*`
- pnpm 10.x · Tailwind v4
- ESLint flat config (`typescript-eslint` strictTypeChecked + `next/core-web-vitals`)
- Vitest (unit) · Playwright (e2e)

**Map / viz**
- `deck.gl` for data layers (points, choropleths, animated flows)
- `maplibre-gl` for basemap, fed by `pmtiles` (single-file vector tiles — no tile server)
- Natural Earth admin-0 polygons (public domain)

**In-browser data layer**
- `@duckdb/duckdb-wasm` runs SQL over Parquet/GeoParquet served from the CDN
- GeoParquet for geometries; plain Parquet for time-series
- Direct HTTP range reads — no backend for the analytics path

**Build-time data layer**
- Python (uv-managed) under `scripts/ingest/` and `scripts/transform/`
- Deps: `httpx`, `pandas`, `geopandas`, `pyarrow`, `duckdb` (Python bindings)
- Outputs versioned Parquet/GeoParquet under `public/data/`

**Hosting**
- Vercel for the app
- Vercel Blob (or Cloudflare R2 if size demands) for any data exceeding ~25MB single-file / ~100MB total
- PMTiles basemap shipped under `public/basemap/`

## Repo layout

```
global-energy-map/
├── src/
│   ├── app/                       # Next.js App Router
│   ├── components/
│   │   ├── map/                   # MapLibre + Deck.gl shell
│   │   ├── layers/                # one file per asset/data layer
│   │   ├── time-slider/
│   │   ├── scenarios/
│   │   └── ui/
│   └── lib/
│       ├── duckdb/                # WASM bootstrap, query helpers
│       ├── data-catalog/          # typed access to catalog.json
│       ├── scenarios/             # pure-function scenario engine
│       └── geo/
├── public/
│   ├── data/                      # built Parquet/GeoParquet + catalog.json
│   └── basemap/                   # PMTiles
├── scripts/
│   ├── ingest/                    # one script per source
│   ├── transform/                 # joins / harmonization → Parquet
│   └── publish/
├── tests/unit/ tests/e2e/
├── docs/
│   ├── superpowers/specs/         # design specs
│   ├── superpowers/plans/         # implementation plans
│   └── methodology.md             # rendered into /about
├── pyproject.toml
└── package.json
```

## Schema (Phase 1 outputs)

Designed so adding a new commodity is a row, not a migration.

| Table | Shape | Source |
|---|---|---|
| `country` | iso3, name, region, geom | Natural Earth |
| `basin` | basin_id, name, type, geom | USGS World Petroleum Assessment |
| `asset` | asset_id, kind, name, iso3, lon, lat, capacity, ... | GEM trackers |
| `country_year_series` | iso3, year, metric, value, unit | EI Statistical Review, EIA, OPEC ASB |
| `trade_flow` | year, hs_code, exporter_iso3, importer_iso3, qty | UN Comtrade |
| `chokepoint` / `chokepoint_route` | flow shares per O-D pair | EIA chokepoints |

All artifacts indexed in `public/data/catalog.json` (path, version, license, source URL, as-of) — the methodology page renders straight off this.

## Data sources (verified, public)

| Layer | Source | License | Notes |
|---|---|---|---|
| Reserves (country-year) | Energy Institute Statistical Review | Free, terms on site | Canonical, back to 1965 |
| Reserves (basin polygons) | USGS World Petroleum Assessment | Public domain (US gov) | Shapefiles, 2000–2012 vintage |
| Production / consumption | EIA International API | Public, free key | Country time-series 1980+ |
| Extraction (asset) | GEM Oil & Gas Extraction Tracker | **CC BY 4.0** | Attribution required |
| Pipelines (oil) | GEM Global Oil Infrastructure Tracker | **CC BY 4.0** | Phase 2 |
| Pipelines (gas) + LNG | GEM Global Gas Infrastructure Tracker | **CC BY 4.0** | Phase 3 |
| Coal | GEM Coal Plant + Mine Trackers | **CC BY 4.0** | Phase 5 |
| Crude trade flows | UN Comtrade HS 2709 | Public, free key | 500 calls/day, 100K records/call |
| Chokepoints | EIA World Oil Transit Chokepoints | Public, free | 6 named chokepoints |
| Basemap | Natural Earth + Protomaps PMTiles | Public domain / OSM ODbL | |
| Tankers / AIS | **Deferred to Phase 4** | Paid for historical | TankerMap free for live snapshot |

API keys live in `~/.config/secrets.env` (already present: `EIA_API_KEY` is registered separately; Comtrade key needed). Never commit secrets.

## Common commands

```bash
# App
pnpm install
pnpm dev                       # localhost:3000
pnpm build && pnpm start
pnpm lint
pnpm test                      # Vitest unit
pnpm test:e2e                  # Playwright

# Data pipeline
uv sync                        # install Python deps
uv run scripts/ingest/<source>.py
uv run scripts/transform/build_country_year.py
uv run scripts/transform/build_assets.py
uv run scripts/transform/build_chokepoint_routing.py

# Deploy
vercel                         # preview
vercel --prod                  # production
```

## Conventions

- **TDD where it pays:** scenario engine, data transforms, query helpers — write failing test first. UI components covered by Playwright e2e smoke tests, not unit-tested by default.
- **Pure functions for scenarios:** `src/lib/scenarios/` exports pure functions that take in baseline data + scenario params and return derived layer styling. No side effects, no map handles. Easy to unit-test.
- **Data via catalog, not magic paths:** Every Parquet/GeoParquet read goes through `lib/data-catalog/` so the methodology page and the runtime see the same manifest. No raw `fetch('/data/foo.parquet')` calls.
- **Geometry: GeoParquet, not GeoJSON, for anything > a few hundred features.** DuckDB-WASM reads it natively via the `spatial` extension.
- **Citations:** Every layer must register a source entry in `catalog.json` (source URL, license, version/as-of). The `/about` page enumerates them — no manual list.
- **GEM data attribution:** All GEM outputs require visible "Data: Global Energy Monitor, CC BY 4.0" attribution in the methodology page and any layer-level metadata UI.
- **No client-side calls to data-provider APIs.** Comtrade, EIA, etc. are hit only at build time by Python ingestion scripts.

## Workflow

- Plans live in `docs/superpowers/plans/`. Execute via `superpowers:subagent-driven-development` (preferred) or `superpowers:executing-plans`.
- Each phase is a vertical slice that produces a deployable artifact (see the phase plan in the spec).
- Commit small and often. Each ingestion script, each layer, each scenario is its own commit.

## Sibling-project precedents (in `~/ai/`)

- `org-spine` — copy lint/TS/pnpm/Vitest/Playwright config (Next 15, pnpm 10, ES2022, strict).
- `calendars` — pattern for CLI-driven periodic data refresh (launchd, logging, health checks).
- No sibling has Deck.gl + DuckDB-WASM + PMTiles — we're establishing the convention here.

## Phase status

- **Phase 1** — _planning complete_ (reserves + extraction + time slider + Hormuz scenario). See `docs/superpowers/plans/2026-05-15-global-energy-map-phase-1.md`.
- **Phase 2** — pending (crude pipelines + refineries).
- **Phase 3** — pending (gas + LNG).
- **Phase 4** — pending (distribution + tankers).
- **Phase 5** — pending (coal + cross-commodity scenarios).
