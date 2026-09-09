# CLAUDE.md — Global Energy Map

> An interactive OSINT visualization of the world's hydrocarbon energy system — reserves, extraction, transport, refining, distribution — for academics, energy-policy researchers, and IR/economics scholars who think in systems.
>
> Status: Phases 1–5 shipped (live at https://global-energy-map-one.vercel.app). See `docs/superpowers/specs/2026-05-15-global-energy-map-design.md` for the full design and `docs/superpowers/plans/` for per-phase plans.

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
- `maplibre-gl` for basemap, currently served by CARTO raster tiles (`light_all`) via `src/components/map/style.ts` — no API key, no local tile server. PMTiles is on the roadmap but not in use today.
- Natural Earth admin-0 polygons (public domain) for the reserves choropleth

**In-browser data layer**
- `@duckdb/duckdb-wasm` runs SQL over Parquet/GeoParquet served from the CDN
- GeoParquet for geometries; plain Parquet for time-series
- Direct HTTP range reads — no backend for the analytics path

**Build-time data layer**
- Python (uv-managed) under `scripts/ingest/` and `scripts/transform/`
- Deps: `httpx`, `pandas`, `geopandas`, `pyarrow`, `duckdb` (Python bindings)
- Outputs versioned Parquet/GeoParquet under `public/data/`

**Hosting**
- Vercel for the app, auto-deploys on push to `main`
- Vercel Blob (or Cloudflare R2 if size demands) for any data exceeding ~25 MB single-file / ~100 MB total. Not in use yet — Phase 5 cleared the largest sidecar (pipelines.geojson) to 14 MB via geometry simplification.

## Repo layout

```
global-energy-map/
├── src/
│   ├── app/                       # Next.js App Router (page.tsx, about/)
│   ├── components/
│   │   ├── map/                   # MapLibre + Deck.gl shell + CARTO basemap style
│   │   ├── layers/                # one file per data layer (Reserves, Extraction, Pipelines, Refineries, LngTerminals, BasinPolygons, Storage, Ports, LayerPanel, Legend)
│   │   ├── time-slider/
│   │   ├── scenarios/             # ScenarioPanel, overlay, useScenario hook
│   │   └── ui/
│   └── lib/
│       ├── duckdb/                # WASM bootstrap, query helpers
│       ├── data-catalog/          # typed access to catalog.json
│       ├── scenarios/             # pure-function scenario engine (oil + gas axes, refinery/LNG attribution)
│       ├── url-state/             # encode/decode + useUrlState hook (shareable URLs)
│       ├── vintage/               # vintage filter predicate for time-aware layers
│       └── geo/
├── public/
│   └── data/                      # built Parquet/GeoParquet + catalog.json + GeoJSON sidecars
├── scripts/
│   ├── common/                    # iso3 mappings, NETL REST helper, secrets loader
│   ├── ingest/                    # one script per source
│   └── transform/                 # joins / harmonization → Parquet
├── tests/
│   ├── unit/                      # Vitest (TS) — scenarios, url-state, vintage filter, data-catalog
│   ├── python/                    # pytest — NETL helper, ISO3, refinery capacity parser, dedup
│   └── e2e/                       # Playwright smoke
├── docs/
│   ├── data-sources.md            # researcher-facing source inventory
│   ├── methodology.md             # rendered into /about
│   └── superpowers/
│       ├── specs/                 # design specs (per phase + master)
│       └── plans/                 # implementation plans (per phase)
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
| `chokepoint_route`, `disruption_route` | scenario_id, origin_iso3, destination_iso3, route_share, affected_infrastructure | EIA / IEA scenario analysis |
| `lng_voyage`, `lng_trade_daily`, `lng_terminal_daily` | start/end dates, IMO, from/to terminal + country/iso3, amount_cbm, confidence_score | Phase 6 — LNG-T3 |

All artifacts indexed in `public/data/catalog.json` (path, version, license, source URL, as-of) — the methodology page renders straight off this.

## Data sources (verified, public)

For a researcher-facing inventory (with coverage gaps, evaluated-and-rejected sources, and Phase 6+ candidates) see `docs/data-sources.md`. The table below is the quick reference.

| Layer | Source | License | Notes |
|---|---|---|---|
| Reserves (country-year, oil + gas) | Energy Institute Statistical Review of World Energy | Free, terms on site | Phase 1/3 — reserves capped at 2020; production runs through 2024 |
| Extraction sites | GEM Global Oil & Gas Extraction Tracker | **CC BY 4.0** | Phase 1 — 5,008 sites; July 2023 snapshot; commissioned_year populated 22% |
| Oil pipelines | GEM Global Oil Infrastructure Tracker (GOIT GeoJSON) | **CC BY 4.0** | Phase 2 — 2025-04-09 release; start_year populated 71% |
| Gas pipelines | GEM Global Gas Infrastructure Tracker (GGIT) | **CC BY 4.0** | Phase 3 — 2026-02-20 release; capacity in bcm/y |
| LNG terminals + voyages + daily flows | LNG-T3 (Zhou et al. 2026, Zenodo) primary + GEM GGIT supplement | CC BY 4.0 / CC BY 4.0 | Phase 6 — 305 LNG-T3 active terminals (25 duplicate operating/construction names collapsed) + 8 GEM terminals after 25 km same-country dedup (149 verbatim-duplicate GEM features dropped first); 313 LNG terminals total, 97.8% with `commissioned_year`; 17,592 voyages + 16,691 trade-daily + 16,115 terminal-daily rows, 2020–2024 |
| Refineries | NETL GOGI Refineries (primary) + OpenStreetMap (supplement) | Public domain / ODbL | Phase 5 — 2,272 NETL + 88 OSM after 2 km same-country dedup; NETL capacity parsed for ~15% |
| Basins / storage / ports | NETL Global Oil & Gas Infrastructure (US DOE) | Public domain (17 USC §105) | Phase 4 — 1,046 basins + 26,102 storage + 3,694 ports |
| Crude + LNG trade flows | BACI (CEPII), HS 2709 + HS 271111 | Free for academic/research use; see CEPII terms | Annual bilateral flows; no API key required; pre-processed & deduplicated |
| Chokepoints + pipeline disruption scenarios | EIA World Oil Transit Chokepoints + IEA pipeline reports | Public, free | 5 scenarios: Hormuz, Hormuz-LNG, Druzhba, BTC, CPC |
| Country boundaries | Natural Earth admin-0 (1:110m) | Public domain | Phase 1 — basemap + reserves choropleth fills |
| Raster basemap | CARTO `light_all` raster tiles | Free (no key) | Runtime tiles via `src/components/map/style.ts` |
| Coal (mines + plants) | _deferred to Phase 6+_ | GEM CC BY 4.0 (when integrated) | Coal sector / cross-commodity scenarios are a Phase 6+ candidate |
| Tankers / AIS | _deferred to Phase 6+_ | TankerMap free for live; paid for historical | Own brainstorm — AIS sourcing is the gating decision |
| EIA STEO US shale basin time series | _deferred to Phase 6+_ | Public (US gov), free API key | Only authoritative open per-basin time-series we've found (Anadarko/Bakken/Eagle Ford/Permian/etc.) |

API keys live in `~/.config/secrets.env` (e.g., `TAVILY_API_KEY`, `EXA_API_KEY`). The EIA API key is registered separately; add to `~/.config/secrets.env` as `EIA_API_KEY` before any Phase 6+ EIA work. BACI (the trade-flow source) does not require a key. Never commit secrets.

## Common commands

```bash
# App
pnpm install
pnpm dev                       # localhost:3000
pnpm build && pnpm start
pnpm lint
pnpm typecheck                 # tsc --noEmit
pnpm test                      # Vitest unit
pnpm test:e2e                  # Playwright

# Data pipeline (build-time)
uv sync                                              # install Python deps
uv run python -m scripts.ingest.<source>            # one ingest per source (gem_*, netl_*, baci_*, osm_*, ei_*, lng_t3)
uv run python -m scripts.transform.build_country_year     # reserves + production time series
uv run python -m scripts.transform.build_assets           # extraction sites (other asset transforms append by kind)
uv run python -m scripts.transform.build_refineries       # NETL primary + OSM supplement
uv run python -m scripts.transform.build_pipelines        # oil + gas pipelines + simplified GeoJSON sidecar
uv run python -m scripts.transform.build_lng_terminals    # LNG-T3 primary + GEM supplement (Phase 6)
uv run python -m scripts.transform.build_lng_voyages       # LNG-T3 voyages + trade-daily + terminal-daily parquets
uv run python -m scripts.transform.build_basins           # NETL basin polygons + simplified sidecar
uv run python -m scripts.transform.build_storage          # NETL storage hubs (append to assets.parquet)
uv run python -m scripts.transform.build_ports            # NETL ports (append to assets.parquet)
uv run python -m scripts.transform.build_trade_flow       # BACI HS 2709 + 271111
uv run python -m scripts.transform.build_chokepoint_routing
uv run python -m scripts.transform.build_disruption_routing
uv run python -m scripts.validate.lng_t3_vs_giignl        # LNG-T3 vs GIIGNL public-total reconciliation
uv run pytest tests/python -v

# Deploy
vercel                         # preview
vercel --prod                  # production
```

CI (`.github/workflows/ci.yml`) runs on every push/PR: `pnpm lint` + `pnpm typecheck` + `pnpm test` (Vitest) + `pnpm build` for the app; `ruff` + `pytest tests/python` for the Python pipeline; and a Playwright e2e job.

## Conventions

- **TDD where it pays:** scenario engine, data transforms, query helpers — write failing test first. UI components covered by Playwright e2e smoke tests, not unit-tested by default.
- **Pure functions for scenarios:** `src/lib/scenarios/` exports pure functions that take in baseline data + scenario params and return derived layer styling. No side effects, no map handles. Easy to unit-test.
- **Catalog manifest is the source of truth for `/about` and pipeline metadata** (license, source URL, as-of date). The methodology page (`src/app/about/page.tsx`) reads `public/data/catalog.json` at build time and renders the source table from it.
- **Runtime data paths are hardcoded by design.** Layer hooks call `read_parquet('/data/<file>.parquet')` directly in DuckDB SQL. Do not try to thread catalog `path` fields through the runtime — the catalog is metadata, not a config table. When you add a new layer, add a `public/data/catalog.json` entry AND hardcode the path in the SQL.
- **Geometry: GeoParquet, not GeoJSON, for anything > a few hundred features.** DuckDB-WASM reads it natively via the `spatial` extension.
- **Citations:** Every layer must register a source entry in `catalog.json` (source URL, license, version/as-of). The `/about` page enumerates them — no manual list.
- **GEM data attribution:** All GEM outputs require visible "Data: Global Energy Monitor, CC BY 4.0" attribution in the methodology page and any layer-level metadata UI.
- **No client-side calls to data-provider APIs.** BACI, EIA, NETL, GEM, etc. are hit only at build time by Python ingestion scripts. The runtime analytics path is pure HTTP range reads over Parquet/GeoJSON.
- **Idempotent transforms.** Every `build_*.py` drops prior rows of its kind from the target Parquet before appending — re-running is safe.
- **Source provenance on rows.** Multi-source tables (e.g., refineries) carry a `source` column so downstream consumers can filter or label by origin.
- **Vintage-aware layer behavior.** Pipelines (`start_year`, 71%) and extraction sites (`commissioned_year`, 22%) respect the active year slider. Null vintage = always visible; refineries/LNG/storage/ports have no vintage data and remain time-independent.

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
- **Phase 6** — pending (EIA STEO US shale basin time series, or coal + cross-commodity scenarios, or tankers/AIS — see docs/data-sources.md).
