# Phase 8 — Consolidation (implementation plan)

> **Spec:** `docs/superpowers/specs/2026-09-10-refactor-redesign-review.md` §5 Phase 8 (items 8.1–8.10).
> **Branch:** `phase-8-consolidation` → PR to `main`.
> **Goal:** the same product, built on one data path, one state store, one render surface, one symbology source, and a reproducible one-command data build. No user-visible feature changes except: legend matches the map, richer tooltips, map view (lon/lat/zoom) in shareable URLs, fewer duplicate refineries.
> **Out of scope:** Phase 9 product work (modes/IA, default-layer changes, visual redesign, export/cite, responsive banner, a11y). Keep current colours unless the symbology module exposes an outright mismatch — the colour *redesign* is 9.2.

## Execution model

Wave 1 runs three parallel implementer agents on **disjoint file sets**; agents do not commit; the orchestrator commits per item with explicit `git add`. Wave 2 is sequential.

| Wave | Track | Items | Owner files (exclusive) |
|---|---|---|---|
| 1 | **P — Python pipeline** | 8.7, 8.10 | `scripts/**`, `tests/python/**`, `public/data/**`, `pyproject.toml`, `uv.lock`, `.github/workflows/ci.yml` (python job only) |
| 1 | **L — Data path, layers, symbology, tooltips** | 8.1, 8.4, 8.5, 8.6 | `src/app/page.tsx`, `src/components/layers/**`, `src/components/scenarios/**`, `src/lib/duckdb/**`, `src/lib/scenarios/**`, new `src/lib/data/**`, new `src/lib/symbology/**`, `tests/unit/**` (except url-state/state tests) |
| 1 | **S — State store, URL sync, render surface** | 8.2, 8.3 | `src/components/map/**`, `src/lib/url-state/**`, new `src/lib/state/**`, `tests/unit/url-state/**`, new `tests/unit/state/**`, and the `#deck-canvas` selector swap across `tests/e2e/**` (selectors only) |
| 2 | **E — e2e reorg + sweep** | 8.8, 8.9 | `tests/e2e/**`, `package.json`, `pnpm-lock.yaml`, dead files anywhere |
| 2 | **D — Integration** | — | orchestrator: full suite, browser check, docs, PR |

### Interface contracts between L and S (so they can run in parallel)

- **S must keep** `useUrlState(defaults): [AppState, (patch: Partial<AppState>) => void]` as the hook signature `page.tsx` calls (it may become a thin wrapper over the new store). L must not change how `page.tsx` obtains state.
- **S must keep** `<MapShell layers={Layer[]} getTooltip={(info) => string | null} />` as MapShell's public props. The view state (lon/lat/zoom) lives inside S's store/MapShell; `page.tsx` does not handle it.
- `#deck-canvas` disappears under `MapboxOverlay` interleaved mode. S swaps e2e selectors to the MapLibre canvas (`.maplibregl-canvas`) and exports nothing L depends on.
- L owns `data-ready` / pending logic in `page.tsx`.

---

## Track P — Python pipeline (8.7, 8.10)

### P1. `scripts/build_all.py` — one-command reproducible build
- Ordered DAG of transforms (no ingests by default): `build_country_year → build_trade_flow → build_assets → build_refineries → build_storage → build_ports → build_lng_terminals → build_lng_voyages → build_pipelines → build_basins → build_disruption_routing → build_catalog`. Flags: `--only <name>`, `--from <name>`, `--ingest` (run ingests first; off by default).
- Each step runs via `runpy`/import of `main()`, timed, fails fast.
- Acceptance: two consecutive `uv run python -m scripts.build_all` runs leave `git status` clean (byte-identical outputs) — make every writer deterministic (row order, no timestamps; `build_catalog`'s `generated_at` should derive from the newest input mtime or be omitted from the hash comparison — pick one and document it).

### P2. Shared helpers
- `scripts/common/parquet.py`: `append_kind(df, kind, path, schema)` (drop kind → concat → sort by a stable key → write with explicit `pyarrow` schema). Define the `assets` schema once (fix `commissioned_year` Int32/Int64 drift, R26). All five asset writers use it.
- `scripts/common/download.py`: collapse the duplicated `HEADERS`/Wayback CDX/`_resolve_download_url`/`download` scaffold from the four GEM/EI ingests (R24). Collapse `netl_{basins,ports,storage,refineries}.py` to one parametrised module (keep the four module entrypoints as 3-line shims so CLAUDE.md commands still work). Collapse `baci_2709.py`/`baci_2711.py` into one parametrised module + shims.
- One ISO3 lookup API (R25): fold `scripts/transform/_lng_iso3.py` and the per-file `_country_iso3` copies into `scripts/common/iso3.py`; one `_to_float` helper.
- Move module-level `glob`/file discovery into `main()` so every transform is importable in tests (R27).
- **Do not re-run ingests.** Refactor them, then prove they still import and their pure helpers pass tests.

### P3. Schema + fixture tests
- `tests/python/test_schemas.py`: every shipped parquet matches its declared schema (column names, types, nullability).
- Fixture-based tests for at least `build_assets`, `build_storage`/`build_ports` (NETL shape), `build_refineries` (dedup), `build_trade_flow` (already has one — keep): tiny in-memory inputs → output frame → assert schema + counts.

### P4. NETL within-source refinery dedup (8.10)
- In `build_refineries.py` / `_refinery_dedup.py`: before the NETL-vs-OSM dedup, cluster NETL rows same-country within 1 km. Keep one row per cluster: prefer non-null capacity, then a name without numeric prefix (`^\d+ - `) and not a French duplicate (`^Raffinerie de `), then the longest name. Record `merged_from` count if cheap; log clusters merged.
- Report before/after refinery counts (expect 2,360 → noticeably fewer; Myanmar's 9 rows → 3). Integrity test: no two NETL refineries in the same country within 1 km.
- Regenerate `assets.parquet` via `build_all --from build_refineries`, then `build_catalog`.

### P5. CI
- Python job: `uv sync --locked`, `ruff check`, `ruff format --check` (run `ruff format scripts tests` once as its own commit-able change), `python -m pytest`.

**Done when:** pytest, ruff check, ruff format --check pass; `build_all` twice → clean tree; refinery counts reported.

---

## Track L — Data path, layers, symbology, tooltips (8.1, 8.4, 8.5, 8.6)

### L1. BigInt normalisation in `query()` (8.6) — do first
- `src/lib/duckdb/query.ts`: map Arrow rows so BIGINT → `number` (safe: all our ints are years/counts < 2^53) in one place. Remove `year != input.year` coercion hack (`engine.ts`), `number | bigint` types (`types.ts`), and use-site `Number()` (`lng-t3.ts`). Existing scenario tests must pass unchanged.

### L2. `useAssets()` + pure layer builders (8.1)
- New `src/lib/data/assets.ts`: one DuckDB query `SELECT … FROM read_parquet('/data/assets.parquet')` (all kinds, only needed columns), module-level promise cache, returned as a discriminated union by `kind`, grouped `{ extraction, refinery, lngExport, lngImport, storage, port }`. React hook `useAssets()` returns `AssetsByKind | null`.
- Each layer file becomes a **pure builder** `buildXLayer(rows, opts) → Layer | null` plus (where it needs GeoJSON) a cached loader. `page.tsx` memoises builders on their inputs (`useMemo`). Vintage/year filtering happens in memory (no re-query per slider tick — R14).
- `useScenario` takes refinery / LNG rows from `useAssets()` instead of querying them again; the remaining scenario queries (`trade_flow`, `disruption_route`, voyages) run in parallel (`Promise.all`, R19). Skip the voyage query when year ∉ 2020–2024.
- Layer ids stay stable (e2e and tooltip dispatch depend on them).
- Vitest: builders return a layer with expected `id`, `data.length`, and visibility behaviour for small fixtures (assert props, not rendering).

### L3. Symbology module + generated Legend (8.4)
- New `src/lib/symbology/index.ts`: every colour, radius rule, and ramp used by the layers, exported as named constants/functions (reserves log ramp, no-data grey, pipeline crude/gas × status, refinery, storage, port, LNG export/import, voyages, scenario exposure). Layers import from here — no inline RGBA arrays left in layer files.
- `Legend.tsx` renders from `LayerState` × symbology: only visible layers get rows; swatches use the real RGBA and the real shape (LNG = triangle, port = anchor icon if that's what's drawn, lines for pipelines); scenario ramp row when a scenario is active; "size = capacity" only where capacity drives size *and* coverage is meaningful (drop it for refineries with 15 % coverage — say "size = capacity where known").
- Vitest: symbology ramps are monotonic; every layer id has a legend entry.

### L4. Per-layer tooltips (8.5)
- Each layer module exports `formatTooltip(object, ctx) → string | null`; `page.tsx`'s 150-line switch becomes a map `{ [layerId]: formatter }`. Every tooltip includes the source name and as-of (read once from `catalog.json` at build — import the JSON statically; do not thread catalog paths into SQL).
- Lines get `pickingRadius` / wider hit area so pipelines are hoverable at z<5.
- Vitest on formatters with fixture objects (value/unit/year/source present; "not in source" for missing capacity).

**Done when:** lint, typecheck, Vitest pass; `page.tsx` < ~200 lines; no layer file issues its own `assets.parquet` query.

---

## Track S — State store, URL sync, render surface (8.2, 8.3)

### S1. `MapboxOverlay` interleaved (8.3)
- `MapShell.tsx`: create the MapLibre map; `map.addControl(new MapboxOverlay({ interleaved: true, layers, getTooltip }))`; update via `overlay.setProps`. Delete the separate `<canvas id="deck-canvas">`, the `onViewStateChange → jumpTo` sync, and the deck-side zoom clamp (MapLibre's `minZoom/maxZoom` now govern). Keep the container sizing fix from Phase 7.
- Put deck layers **beneath basemap labels** (use `beforeId` on layers, or insert the overlay before the first symbol layer of the Positron style) so country/city names draw above the choropleth.
- Swap `#deck-canvas` selectors in `tests/e2e/**` to `.maplibregl-canvas` (selectors only; no other e2e edits).
- Verify in a real browser (claude-in-chrome, `pnpm dev --port 3100`): layers render, align, pick/tooltip, labels above fills.

### S2. App store + URL sync (8.2)
- New `src/lib/state/store.ts`: a small external store (`useSyncExternalStore`; no new dependency unless clearly better) holding `AppState` + `view` (`{lon, lat, zoom}`).
- URL sync: debounced (~250 ms) `window.history.replaceState` using `encodeAppState` (+ `lon`,`lat`,`z` params, 2–3 decimals); initial state from `decodeAppState` on first client render. No `router.replace` per change.
- `useUrlState` keeps its signature as a thin wrapper over the store (contract above).
- MapShell reads the initial view from the store and writes `moveend` view back to it.
- Extend `encode.test.ts` for view params (round-trip, clamping, garbage). New `tests/unit/state/store.test.ts` for patch semantics and debounced URL writes (fake timers).

**Done when:** lint, typecheck, Vitest pass; in the browser, dragging the slider does not trigger Next navigations (no RSC requests in the network panel), and a copied URL restores layers + year + scenario + view.

---

## Wave 2

### E1. e2e reorganisation + ready signal (8.9)
- Replace `phase-{1..6}.spec.ts`, `basemap.spec.ts`, `time.spec.ts`, `scenario-overlay.spec.ts` with feature specs: `map.spec.ts` (basemap, layers render, labels), `layers.spec.ts` (toggles incl. "only extraction"), `time.spec.ts`, `scenarios.spec.ts`, `url.spec.ts` (share link restores view), `about.spec.ts`. Keep every existing assertion's intent.
- Every spec waits on `main[data-ready="true"]` instead of fixed sleeps; canvas probe assertion: read back MapLibre canvas pixels (`preserveDrawingBuffer` only in test via a query flag, or `map.getCanvas().toDataURL()` after `map.once('idle')`) at a known land point to prove fills rendered.
- Budgets stay 180 s; `workers: 1`.

### E2. Dead code / deps sweep (8.8)
- Remove unused deps (verify each with grep first): `pmtiles`, `@deck.gl/react`, `@deck.gl/geo-layers`, `deck.gl` meta-package, unused `@testing-library/*`, `prettier` config if unused. Keep `@deck.gl/mapbox` (now used).
- Remove dead shims: `src/lib/scenarios/hormuz.ts`, `ChokepointRouteRow`, `chokepoint_id`/`ranked` back-compat fields; `scripts/common/secrets.py` if still unused; `pnpm dedupe`.

### D. Integration (orchestrator)
- Full suite, `pnpm build`, e2e, `build_all` twice → clean tree; browser check (default view, only-extraction, scenario, slider, share-link round-trip, tooltips, legend vs map); docs (`CLAUDE.md` commands → `build_all`, conventions: store, symbology, tooltips, MapboxOverlay; phase status); PR; merge on user OK.

## Risks
- **MapboxOverlay + deck 9.3 + MapLibre 5**: interleaved mode requires WebGL2 and matching versions; if interleaved rendering misbehaves, fall back to `interleaved: false` (overlaid canvas, still MapLibre-owned camera) and note it.
- **Headless e2e with interleaved mode**: software WebGL may be slower; keep budgets, watch CI time.
- **P2 refactor of ingests without running them**: keep changes mechanical; tests on pure helpers only.
- **Refinery dedup changes scenario attribution** (per-refinery shares); expected and desirable — report the Myanmar before/after.
