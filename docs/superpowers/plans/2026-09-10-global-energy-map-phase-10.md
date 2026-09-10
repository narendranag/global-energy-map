# Phase 10 — Public-launch hardening (implementation plan)

> **Spec:** `docs/superpowers/specs/2026-09-10-refactor-redesign-review.md` §5 Phase 10 (10.1–10.6) and §6 decision 1 (go public after Phase 9 with `LICENSE-DATA.md`, map-footer attribution, downloads limited to CC BY / public-domain subsets).
> **Branch:** `phase-10-launch` → PR to `main`.
> **Goal:** fast, cached, self-contained, legally defensible, observable, and refreshable — ready to announce.
> **Out of scope:** new data sources, PMTiles, SQL console, daily time axis (Phase 11+ per the review).

## Baseline to beat (measure first, on the production build, cold cache, desktop broadband)
- Cold load of `/` to `data-ready`: today ~6–8 s; target **< 3 s**.
- Cold load of `/?mode=scenarios&scenario=hormuz&commodity=gas&year=2023` to `data-ready`: today ~15 s; target **< 5 s**.
- Revisit (warm cache) data bytes: today every `/data/*` revalidates (`max-age=0`); target **≈ 0 bytes** re-downloaded for unchanged data.
- No runtime dependency on jsDelivr.

## Execution model
Three parallel implementer agents on disjoint files (no commits/staging; orchestrator commits per item), then integration.

| Track | Items | Owner files (exclusive) |
|---|---|---|
| **P — Performance & caching** | 10.1, 10.2 | `src/lib/duckdb/**`, `src/lib/data/**`, `next.config.ts`, `package.json` scripts + `pnpm-lock.yaml`, new `scripts/copy-duckdb.mjs` (or similar), `public/duckdb/` (gitignored, generated at build), `.gitignore`, perf notes in `docs/performance.md` (new), unit tests for these |
| **L — Licensing, open extract, refresh runbook** | 10.3, 10.6 (+ open asset extract) | `LICENSE-DATA.md` (new), `README.md`, `docs/methodology.md` licensing section, `docs/data-sources.md`, `docs/refresh.md` (new), `scripts/**`, `tests/python/**`, `public/data/**` (via `build_all`), `src/components/ui/MapFooter.tsx`, `src/app/data/**` |
| **O — Observability, smoke, e2e hardening** | 10.4 | `src/app/layout.tsx`, `.github/workflows/**` (new `smoke.yml`; `ci.yml` only if needed), `tests/e2e/**`, `playwright.config.ts` |
| **Integration** | 10.5 | orchestrator: `CLAUDE.md`, final measurements, PR, merge on user OK |

`@vercel/analytics` is installed by the orchestrator before the tracks start (so Track O never edits `package.json`).

---

## Track P — Performance & caching (10.1, 10.2)

**P1. One DuckDB instance.** `getDuckDB()` caches the resolved DB, not the in-flight promise, so the first-load loaders each create a worker and instantiate DuckDB concurrently. Cache the promise (evict on rejection). Unit test: N concurrent calls → one instantiation.

**P2. Self-host the DuckDB bundle.** Copy the `@duckdb/duckdb-wasm` EH/MVP wasm + worker files from `node_modules` into `public/duckdb/` at `predev`/`prebuild` (gitignored; a small Node script); build a manual bundle map pointing at `/duckdb/...` instead of `getJsDelivrBundles()`. Keep bundle selection (EH vs MVP) via `selectBundle`. No jsDelivr requests at runtime (verify in the network panel).

**P3. Boot in parallel, early.** Kick off `getDuckDB()` at module load of the page (or on first render) so the ~7 MB wasm download overlaps the GeoJSON sidecar fetches; GeoJSON layers never wait on DuckDB. Consider `<link rel="preload">` for the wasm (as fetch) and the GeoJSON sidecars used by the default view.

**P4. Register each parquet once.** Use `db.registerFileURL(name, url, DuckDBDataProtocol.HTTP, false)` once per file (or fetch small parquets fully into a buffer with `registerFileBuffer` — `trade_flow` 760 KB, `country_year_series` 38 KB, `disruption_route` 10 KB, `lng_voyage` 275 KB, `assets` ~1 MB) so repeated queries don't re-issue HEAD + range requests. Pick per file by size; document the choice.

**P5. Cache headers with deploy-scoped URLs.** In `next.config.ts` `headers()`: `/data/:path*` and `/duckdb/:path*` → `Cache-Control: public, max-age=31536000, immutable`. To keep that safe across data changes, every runtime data URL carries a version query (`?v=<sha8>` from the file's `sha256` in `catalog.json`, which the app already imports statically — this is the "catalog for the hash only" rule; logical paths stay hardcoded). Verify DuckDB `read_parquet`/`registerFileURL` and `fetch` work with the query string. `/data/catalog.json` itself stays short-lived (`max-age=0, must-revalidate`) — it's bundled at build anyway.

**P6. Measure.** Record before/after for the three baseline numbers (production build locally via `pnpm build && pnpm start`, Chrome with cache disabled for cold, enabled for warm; note hardware). Write `docs/performance.md` with numbers, what dominates the remaining time, and the next lever (PMTiles for pipelines, etc.).

**Done:** lint/typecheck/unit pass; no jsDelivr requests; targets met or the gap explained with numbers.

---

## Track L — Licensing, open extract, refresh runbook (10.3, 10.6)

**L1. `LICENSE-DATA.md`.** Separate from the MIT code licence. Per source: licence, what we redistribute (and in which file), attribution string, and restrictions: GEM (CC BY 4.0), LNG-T3 (CC BY 4.0), NETL (US Gov public domain), Natural Earth (PD), OpenStreetMap (ODbL — share-alike; the 88 OSM refinery rows), Energy Institute Statistical Review (terms: use with attribution, no bulk redistribution — shown in app, not downloadable), CEPII BACI (academic/research terms, cite Gaulier & Zignago 2010 — shown in app; aggregates only; scenario CSV is our derived analysis), EIA/IEA (scenario share citations), OpenFreeMap/OpenMapTiles/OSM basemap. Plain-language, not legal advice; link each source's terms. README and `/methodology` licensing section point to it; `/data` links it in its header.

**L2. Open asset extract.** New `public/data/assets_open.parquet` = `assets.parquet` minus rows whose `source` is OSM (i.e. GEM + NETL + LNG-T3 only), written by a small transform added to `build_all` after the asset chain; catalogued as `downloadable: true` with its own licence line (CC BY 4.0 + public domain; attribution required). `/data` shows it as the downloadable version of the asset table; Share-menu refinery export can then offer the open subset (note "excludes 88 OSM-derived rows") — **only touch the Share menu if trivial; otherwise report it for integration.** Integrity tests: extract has no OSM rows; row count = assets − OSM.

**L3. Map attribution.** `MapFooter.tsx`: complete, compact attribution line covering every source visible on the map (GEM CC BY 4.0, LNG-T3 CC BY 4.0, NETL, EI, CEPII BACI, OSM contributors ODbL, basemap OpenFreeMap/OpenMapTiles), linking to `/methodology#licences` and `LICENSE-DATA.md` (on GitHub). Must stay ≥ 11 px and ≥ 4.5:1 (a11y tests exist).

**L4. Refresh runbook + pins (10.6).** `docs/refresh.md`: cadence per source (EI annual ~June; BACI annual ~Jan–Feb; GEM per tracker release; LNG-T3 per Zenodo version; NETL ad hoc; OSM quarterly), exact commands (`build_all --ingest`, per-source ingest), how to bump each source's pinned version/URL, what to check after (pytest integrity, `/data` diff of rows/sha, `lng_t3_vs_giignl`, scenario spot checks), and how to note data changes in a `CHANGELOG`-style section. Consolidate source pins (URLs/versions/dates currently scattered in ingest modules) into one `scripts/common/sources.py` (or TOML) — mechanical refactor, **do not re-run ingests**; verify imports and existing tests.

**Done:** pytest + ruff pass; `build_all` twice byte-identical; `/data` shows the open extract downloadable.

---

## Track O — Observability, smoke, e2e hardening (10.4)

**O1. Analytics.** Add `<Analytics />` from `@vercel/analytics/next` to `layout.tsx` (cookieless; must be enabled in the Vercel project — the orchestrator will tell the user). No other trackers.

**O2. Runtime error reporting.** Minimal, dependency-free: a client error boundary + `window.onerror`/`unhandledrejection` handler that shows a friendly "Something went wrong loading the map — reload / report" panel instead of a blank map, and logs to console. (A hosted error service like Sentry needs an account/DSN — out of scope unless the user asks; note it.)

**O3. Post-deploy smoke.** `.github/workflows/smoke.yml` on `deployment_status` (success, production and preview): curl the deployment URL for `/`, `/methodology`, `/data`, `/data/catalog.json` (parse; every catalog path returns 200 with matching size), and one parquet with a Range request; plus a single short Playwright check (`/` reaches `data-ready` with a basemap tile loaded) against the deployed URL. Fail loudly; no secrets needed.

**O4. e2e hardening.** Investigate the Phase 9 flaky test ("Hormuz (gas): LNG-specific description and metric" — ready-wait gave up after 2.7 s despite a 120 s timeout) and fix the cause (likely a `data-ready` flicker true→false→true between the mode preset and scenario load, so the wait resolves early and a later assertion races). If `data-ready` can flicker, fix the signal in the test helper by requiring it to stay true for ~500 ms, and report whether the app itself should change (Track O does not own `page.tsx`; propose the change). Add a spec asserting no requests to `cdn.jsdelivr.net` (will pass once Track P lands; mark `test.fixme` until then and report).

**Done:** lint/typecheck pass; smoke workflow validated with `act` or by reasoning + a dry run against the current production URL using the same script locally.

---

## Integration (10.5)
- Merge the tracks; full suite; production build measurements (P6 numbers); browser check (cold/warm network panels: no jsDelivr, cached `/data`).
- `CLAUDE.md`: commands (`copy-duckdb` prebuild, `assets_open`), conventions (versioned data URLs + immutable caching — never change a data file without regenerating the catalog; self-hosted DuckDB; error boundary; smoke workflow; refresh runbook), phase status (Phases 1–10 shipped → **launch-ready**), and the remaining launch checklist for the user (enable Vercel Analytics; optional custom domain; announce).
- PR; merge on CI green (user pre-approved Phase 9 merge; confirm for Phase 10).

## Risks
- **DuckDB + query-string URLs:** if `registerFileURL`/httpfs mishandles `?v=`, fall back to registering under the logical name with the versioned URL as the target.
- **Immutable caching mistakes are sticky for a year** — the version must change whenever bytes change; a unit test asserts every runtime data URL is built through the versioning helper.
- **Worker + self-hosted wasm under Next 16/Turbopack:** serve from `public/` (plain static), not bundled imports.
