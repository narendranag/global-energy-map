# Global Energy Map — Design Spec

> Status: approved 2026-05-15. Phase 1 implementation plan: `docs/superpowers/plans/2026-05-15-global-energy-map-phase-1.md`.

## Context

Build an interactive web visualization that maps the world's hydrocarbon energy system — reserves, extraction, transport, refining, distribution — as an OSINT resource for academics, energy-policy researchers, IR scholars, and economists who think in systems. The goal is to surface global energy dependencies as inspectable, time-varying, scenario-testable structure rather than as opinion or narrative.

The project ships in **five vertical slices**, each producing a deployable, useful artifact. Phase 1 proves the full stack (data → store → map → time-slider → scenario) end-to-end with the two simplest layers (reserves + extraction). Later phases add transport, refining, distribution, and other commodities (gas, LNG, coal) on top of the same foundation.

## Locked Decisions

| Axis | Decision |
|---|---|
| Delivery | Interactive web app, public on Vercel |
| Energy scope | All hydrocarbons in schema from day 1 (oil + gas + LNG + coal); oil ships first visually |
| Time | Full time-series, target ~1990–present |
| Analysis depth | Map + scenario tools (chokepoint closure, sanctions, etc.) |
| Data layer | DuckDB-WASM + Parquet/GeoParquet + PMTiles, all client-side |
| Citations | Methodology page (one doc, per-layer source + as-of) |
| Phase 1 DoD | Reserves + extraction + time slider + Strait of Hormuz closure scenario |
| First scenario | Strait of Hormuz closure |
| Ingestion lang | Python (uv-managed) |
| App lang | TypeScript strict |

## Tech Stack

**App**
- Next.js 15 (App Router), React 19, TypeScript strict, ES2022, `@/*` → `./src/*`
- pnpm 10.x; Tailwind v4
- ESLint flat config with `typescript-eslint` strictTypeChecked + `next/core-web-vitals`
- Vitest (unit) + Playwright (e2e smoke)

**Map / viz**
- `deck.gl` for data layers (large point clouds, animated flows, choropleths)
- `maplibre-gl` for the basemap, fed by `pmtiles` (single-file vector tiles)
- Natural Earth admin-0 polygons for country choropleths (public domain)

**Data layer (in-browser)**
- `@duckdb/duckdb-wasm` for SQL over Parquet/GeoParquet served from the CDN
- GeoParquet for geometries; plain Parquet for time-series
- Direct HTTP range reads — no backend required for the analytics path

**Data layer (build-time)**
- Python ingestion scripts (`httpx`, `pandas`, `geopandas`, `pyarrow`, `duckdb` Python bindings), managed by `uv`
- Outputs versioned Parquet/GeoParquet committed to the repo (small) or uploaded to Vercel Blob (large)

**Hosting**
- Vercel for the app
- Vercel Blob (or Cloudflare R2 if size demands) for large Parquet/PMTiles assets
- PMTiles basemap shipped under `/public/basemap/`

## Data Sources (verified)

All sources verified for public availability and license during planning.

### Reserves (country-year + basin polygons)
- **Energy Institute Statistical Review of World Energy** — annual XLSX, free, back to 1965. https://www.energyinst.org/statistical-review/resources-and-data-downloads
- **OPEC Annual Statistical Bulletin** — annual data tables, free. https://asb.opec.org/data/ASB_Data.php
- **USGS World Petroleum Assessment** — basin shapefiles (2000–2012 vintage). https://www.usgs.gov/tools/world-oil-and-gas-assessments-downloadable-data
- **EIA International** — free API. https://www.eia.gov/opendata/

### Extraction
- **Global Energy Monitor — Global Oil & Gas Extraction Tracker** — CC BY 4.0. https://globalenergymonitor.org/projects/global-oil-gas-extraction-tracker

### Pipelines (later)
- **GEM — Global Oil Infrastructure Tracker** — CC BY 4.0. https://globalenergymonitor.org/projects/global-oil-infrastructure-tracker
- **GEM — Global Gas Infrastructure Tracker** — CC BY 4.0. https://globalenergymonitor.org/projects/global-gas-infrastructure-tracker

### Refineries (later)
- GEM Oil Infrastructure Tracker (above); EI Statistical Review for capacity time series

### LNG (later)
- GEM Gas Infrastructure Tracker; GIIGNL Annual Report (cross-ref)

### Coal (later)
- GEM Global Coal Plant Tracker + Global Coal Mine Tracker (CC BY 4.0)

### Crude trade flows
- **UN Comtrade HS 2709** — free API w/ key, 500 calls/day, 100K records/call. https://comtradeplus.un.org/

### Chokepoints
- **EIA World Oil Transit Chokepoints** — six named chokepoints + flow volumes. https://www.eia.gov/international/analysis/special-topics/World_Oil_Transit_Chokepoints

### Tankers / live AIS — *deferred to Phase 4*
Free real-time trackers exist (TankerMap, MarineTraffic free tier); historical AIS is paid.

### Basemap + geography
- **Natural Earth** — public domain admin-0/-1 vectors. https://www.naturalearthdata.com/
- **Protomaps** PMTiles for the basemap

## Schema

Designed so adding a commodity is a row, not a migration.

```
country               (iso3, name, region, geom)
basin                 (basin_id, name, type, geom, source)
asset                 (asset_id, kind, name, country_iso3, lon, lat,
                       capacity, capacity_unit, operator, status,
                       commissioned_year, decommissioned_year, source, source_version)
  kind ∈ {extraction_site, refinery, pipeline_segment, lng_export,
          lng_import, storage_hub, coal_mine, ...}
pipeline_geom         (asset_id, geom_linestring, length_km, throughput, commodity)
country_year_series   (iso3, year, metric, value, unit, source)
  metric ∈ {proved_reserves_oil, production_crude, refining_capacity,
            consumption, net_imports, ...}
trade_flow            (year, hs_code, exporter_iso3, importer_iso3, value_usd, qty, qty_unit, source)
chokepoint            (chokepoint_id, name, geom_polygon, geom_centroid,
                       avg_flow_mmbd_year, fraction_seaborne_oil)
chokepoint_route      (chokepoint_id, exporter_iso3, importer_iso3,
                       est_share_through_chokepoint, source)
```

All data is published via `/public/data/catalog.json` so the client (and the methodology page) can enumerate sources programmatically.

## Repo Structure

```
global-energy-map/
├── src/
│   ├── app/                          # Next.js app router
│   │   ├── page.tsx                  # Main map view
│   │   ├── about/page.tsx            # Methodology
│   │   └── layout.tsx
│   ├── components/
│   │   ├── map/                      # MapLibre + Deck.gl shell
│   │   ├── layers/                   # one file per asset layer
│   │   ├── time-slider/
│   │   ├── scenarios/
│   │   └── ui/
│   └── lib/
│       ├── duckdb/                   # WASM bootstrap, query helpers
│       ├── data-catalog/             # typed access to catalog.json
│       ├── scenarios/                # pure-function scenario engine
│       └── geo/
├── public/
│   ├── data/                         # built Parquet/GeoParquet + catalog.json
│   │   ├── catalog.json
│   │   ├── country_year_series.parquet
│   │   ├── assets.parquet
│   │   ├── basins.parquet            # GeoParquet
│   │   ├── trade_flow.parquet
│   │   └── chokepoint_route.parquet
│   └── basemap/
├── scripts/
│   ├── ingest/
│   ├── transform/
│   └── publish/
├── tests/
│   ├── unit/
│   └── e2e/
├── docs/
│   ├── superpowers/specs/
│   ├── superpowers/plans/
│   └── methodology.md
├── pyproject.toml
└── package.json
```

## Phase Plan

### Phase 1 — Reserves + Extraction + Hormuz scenario (proves the stack)
See `docs/superpowers/plans/2026-05-15-global-energy-map-phase-1.md`.

### Phase 2 — Crude transport + refining
- GEM Oil Infrastructure Tracker (pipelines + refineries) as new layers.
- Refinery feedstock-dependency view using Comtrade origin shares.
- Extend scenario engine with pipeline-cut scenarios (e.g., Druzhba).

### Phase 3 — Natural gas + LNG
- GEM gas pipelines + LNG terminals + LNG carrier snapshots.
- Comtrade HS 2711 (natural gas).
- Scenarios: Nord-Stream-style cuts, LNG terminal outages.

### Phase 4 — Distribution + storage + tankers (re-evaluate AIS)
- Refined-product pipelines, major storage hubs, port-level throughput.
- Re-evaluate AIS sourcing.

### Phase 5 — Coal + cross-commodity scenarios
- GEM Coal Plant + Mine trackers.
- Cross-commodity substitution scenarios.

## Phase 1 Definition of Done

1. `pnpm dev` → globe renders, choropleth displays 2024 reserves, time slider moves it to 1990.
2. Click any extraction point → tooltip with operator, capacity, status, source.
3. Toggle "Strait of Hormuz closed" → choropleth restyles by import-loss share; ranked impact panel populates; deselecting restores baseline.
4. `/about` enumerates every source in `catalog.json` with license, source URL, and as-of date.
5. `pnpm test` → unit tests (scenario engine, query helpers) pass.
6. `pnpm test:e2e` → Playwright smoke test for map load + slider + scenario passes.
7. Vercel production deploy succeeds; URL is shareable.
8. Lighthouse: LCP < 4s on broadband, no console errors.

## Reusable Patterns From Sibling Projects

- Lint/test/CI config: copy from `~/ai/org-spine` (Next 15, pnpm 10, ES2022, strict TS, flat ESLint, Vitest + Playwright).
- CLI/automation patterns for periodic refresh: model after `~/ai/calendars`.
- New stack — Deck.gl + DuckDB-WASM + PMTiles — has no sibling precedent; establish conventions as we build.
