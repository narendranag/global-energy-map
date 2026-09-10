# Global Energy Map — Refactor & Redesign Review (2026-09-10)

> **Status:** review + roadmap, for discussion. Nothing in this document has been implemented.
> **Scope:** the whole repo at `main` (`4aa4ad5`) plus the live deployment at https://global-energy-map-one.vercel.app.
> **Goal:** get from a six-phase accreted prototype to a coherent, finished, publicly defensible product ("take it to complete").
> **Method:** full read of `src/`, `scripts/`, `tests/`, `docs/`, CI and data; health checks run locally; live site walked in Chrome (desktop, dark colour scheme, 1365 px) and probed at 400/768 px; shipped parquets inspected with DuckDB.

---

## 1. Executive summary

1. **The engineering foundation is sound and green** — lint, typecheck, 62 Vitest and 53 pytest tests all pass; strict TS, pure-function scenario engine, catalogued sources and CI are genuinely above-average. The problem is not code quality; it is that six vertical slices were each "done" without anyone ever using the product as a researcher would.
2. **The headline layer has been broken at its default view since Phase 1.** `country_year_series.parquet` carries three rows per country for reserves-2020 (and production-2024) because `build_country_year.py` parses the EI sheet's trailing "change %" / "share of total" columns as another year column. The choropleth keeps the *last* row, so at the default `year=2020` it paints "share of world total" (0–0.17) and renders uniformly grey. Must-fix, one-line cause, large trust impact.
3. **The basemap does not render in production.** The MapLibre container has computed height 0; the map is deck.gl layers on a black (dark scheme) or white (light scheme) void. Nobody noticed because on a white background the choropleth borders *look* like a minimal basemap. Root cause is almost certainly a CSS-order collision between Tailwind's `absolute` and `.maplibregl-map { position: relative }`.
4. **Phase 6's headline feature is unreachable from the UI.** The year slider is capped at 2020 (`page.tsx:285`) while LNG voyages, LNG-T3 attribution, and BACI/production all run to 2024. Only the e2e tests (which hand-write `?year=2023`) ever exercise it.
5. **Scenario visuals are misleading.** Under any scenario every importing country is painted dark maroon regardless of exposure (`overlay.ts:7-10` uses `80 + 175·t` with no alpha ramp and no zero-cut), so "0 % exposed" is indistinguishable from "60 % exposed" at a glance, and BACI pseudo-countries (`S19`) leak into the ranking.
6. **The data pipeline is not reproducible and the catalog is not trustworthy.** `build_assets.py` truncates `assets.parquet` instead of appending; the shipped file cannot be regenerated from current code; `catalog.json` is hand-edited, lists a file that does not exist (`chokepoint_route.parquet`) and omits the two GeoJSON sidecars the runtime actually reads; 34 MB `pipelines.parquet` is shipped with zero consumers.
7. **Performance is fine for a desktop researcher but wasteful:** ~19 MB over the wire on a cold load, `pipelines.geojson` fetched twice (promise not cached), every `/data/*` response `max-age=0, must-revalidate`, and DuckDB-WASM (7 MB from jsDelivr) doing nothing more than `WHERE kind = 'x'` filters.
8. **The product surface reads as a prototype:** `<title>Create Next App</title>`, all nine layers on by default, a legend that does not match the symbology, `/about` rendering raw markdown, no onboarding, no navigation between `/` and `/about`, no export or "cite this view", unusable at phone width.
9. **The existing Phase 7 backlog is roughly right but under-prioritised.** Half of it (asset cache, ready signals, Legend from LayerState, drop `pipelines.parquet`, skip voyage query) is correct and cheap; "app state store that syncs to the URL" is necessary but for a different reason than stated (each slider tick currently triggers a Next.js `router.replace` navigation); "daily-throughput tooltip" and "vintage filter on scenario inputs" should be deferred behind the correctness work above.
10. **Recommended sequencing:** Phase 7 *Correctness* (data + visual bugs, ~2 weeks) → Phase 8 *Consolidation* (pipeline + runtime refactor) → Phase 9 *Product* (IA, defaults, legend, about, export/cite, responsive) → Phase 10 *Public launch hardening* (licensing decision, caching, self-hosted WASM, a11y, docs). Do not add new data sources until Phase 9 ships.

---

## 2. Current-state assessment

### 2.1 Health check (2026-09-10, local)

| Check | Result |
|---|---|
| `pnpm lint` | pass, 0 warnings |
| `pnpm typecheck` | pass |
| `pnpm test` (Vitest) | 15 files, **62/62 pass**, 2.4 s |
| `uv run python -m pytest tests/python -q` | **53/53 pass**, 1.0 s |
| `uv run pytest` | **fails to spawn** locally ("No such file or directory") even though `.venv/bin/pytest` exists — CI uses this exact form and passes on ubuntu; treat as a local uv quirk but switch CI and docs to `python -m pytest` |
| `uv run ruff check scripts tests` | pass |
| `uv run ruff format --check` | **35 of 45 files would be reformatted** (not enforced in CI) |
| `pnpm build` | pass; 3 static routes (`/`, `/about`, `/_not-found`); ~2.6 MB JS decoded across 13 chunks |
| e2e | not run locally (CPU-bound, 3 min serial); CI green per history |

### 2.2 Data on disk vs. runtime

| File | Size | Runtime consumer | Catalogued |
|---|---|---|---|
| `pipelines.parquet` | **34 MB** | none (`PipelinesLayer.tsx:28-30` reads the GeoJSON sidecar) | yes |
| `pipelines.geojson` | 14 MB (3.1 MB br) | oil + gas pipeline layers — **fetched twice** | **no** |
| `basins.geojson` | 7.1 MB (2.5 MB br) | basins layer | **no** |
| `basins.parquet` | 2.2 MB | none | yes |
| `assets.parquet` | 1.3 MB | 5 layer hooks + `useScenario` — scanned 6–7× per state change | yes (4 entries) |
| `trade_flow.parquet` | 760 KB | `useScenario` | yes |
| `lng_voyage.parquet` | 275 KB | voyages layer + `useScenario` | yes |
| `lng_trade_daily.parquet`, `lng_terminal_daily.parquet` | 160 KB | none (documented as reproducibility artefacts) | yes |
| `country_year_series.parquet` | 38 KB | reserves choropleth | yes |
| `disruption_route.parquet` | 4 KB | `useScenario` | yes |
| `chokepoint_route.parquet` | **missing** | none | **yes (stale)** |
| `countries.geojson` | 464 KB | choropleth | yes |
| DuckDB-WASM (jsDelivr) | 7 MB wasm + 184 KB worker | all parquet reads | n/a |

Cold-load wire total ≈ 19 MB; decoded ≈ 40 MB (the double `pipelines.geojson` fetch alone is 28 MB decoded). Time to first data layer ≈ 1 s (GeoJSON), full render ≈ 6–8 s (DuckDB boot + scans). All `/data/*` responses: `cache-control: public, max-age=0, must-revalidate`.

### 2.3 Architecture sketch (as built)

```
page.tsx (HomeInner)
  ├─ useUrlState() ──── every state change → router.replace(?qs)  [Next navigation per slider tick]
  ├─ useScenario() ──── 4 sequential DuckDB queries → computeScenarioImpact() (pure)
  ├─ 9 × use<X>Layer() ─ each: useEffect → query()/fetch() → new deck Layer → useState
  │     └─ query() ──── getDuckDB() (jsDelivr bundle, worker) → conn.prepare → arrow.toArray()
  ├─ getTooltip() ───── 150-line switch on layer.id (page.tsx:124-276)
  └─ <MapShell> ─────── MapLibre (raster CARTO) + Deck (separate canvas) synced via onViewStateChange→map.jumpTo
```

Build-time: 12 ingest scripts → `data/raw/` → 13 `build_*` transforms → `public/data/*.parquet|geojson` → hand-edited `catalog.json` → `/about` at build time.

What is good and should be kept: the pure scenario engine (`src/lib/scenarios/*`) with its 12 unit-test files; the `source`/`source_version` provenance columns; the vintage predicate; the URL state codec (`encode.ts`) with tests; the terminal-name join invariant asserted in Python; `docs/data-sources.md`, which is unusually honest.

---

## 3. Refactor findings (code-level)

Severity key: **M** must-fix (bug, correctness, data integrity, misleading visual) · **S** should-do · **C** could-do / defer.

### 3.1 Data integrity

| # | Sev | Finding | Evidence |
|---|---|---|---|
| R1 | **M** | **Duplicate year rows from EI trailing columns.** `_parse_wide_sheet` accepts any header cell that parses to a year in 1900–2100. EI sheets end with "change 2023–24" and "share 2024" columns whose header cell is the year again, so 2020 reserves (and 2024 production) get three rows per country: real value, delta, share. Downstream `new Map(rows)` keeps the last → the default view paints shares. | `scripts/transform/build_country_year.py:94-107`; DuckDB: `proved_reserves_oil_bbn_bbl, 2020 → 144 rows` vs 48 elsewhere; `SAU 2020 → 297.5, −0.00017, 0.1717`. `ReservesChoropleth.tsx:46`. |
| R2 | **M** | **BACI pseudo-countries pass as ISO3.** `build_trade_flow.py:91` accepts any 3-char code; 63 codes in `trade_flow.parquet` are absent from `countries.geojson`, including `S19` (a BACI aggregate, ~$881 bn) and `ZA1`. They surface in the scenario ranking as "S19". | `scripts/transform/build_trade_flow.py:91`; live scenario panel shows `S19`. |
| R3 | **M** | **`build_assets.py` truncates `assets.parquet`.** It writes only extraction rows (`df.to_parquet(OUT_PATH)`), so running it after any sibling wipes 32 k refinery/LNG/storage/port rows. All four siblings `read_parquet` unguarded and crash if the file is missing. The order (`build_assets` first, `build_lng_terminals` last because only it adds Phase 6 columns) is undocumented and unenforced. | `scripts/transform/build_assets.py:130`; `build_storage.py:134`, `build_ports.py:137`, `build_refineries.py:281`, `build_lng_terminals.py:307,327-332`. |
| R4 | **M** | **Shipped `assets.parquet` is not reproducible.** All 5,008 extraction rows carry `capacity_unit='kboe/d'` with NULL capacity; current `build_assets.py:102-103` writes `None`. The backfill lived in Phase 3's `build_lng_terminals.py` and was deleted in Phase 6 (`git log -S'kboe/d'`). `source_version = date.today()` in three transforms also changes bytes on every rebuild. | `build_assets.py:102-103`; `build_storage.py:110`, `build_ports.py:113`, `build_basins.py:119`. |
| R5 | **M** | **`catalog.json` is hand-maintained and wrong.** Has a `generated_at` but no script writes it. Lists `/data/chokepoint_route.parquet` (missing on disk; `build_chokepoint_routing.py` is dead, superseded by `build_disruption_routing.py`). Omits `pipelines.geojson` and `basins.geojson`, the only geometry the runtime reads. `netl_gogi` points at `basins.parquet` but claims `storage`/`ports` layers; `gem_gas_infrastructure` points at `pipelines.parquet` but claims `lng_terminals`. `as_of` formats are inconsistent (`"2026-01"`, full ISO timestamp, dates). | `public/data/catalog.json:61-73,104-130,193-207`; `ls public/data`. |
| R6 | **S** | **Hardcoded scenario shares with no per-row citation.** Sixteen numbers (`SAU 0.88`, `ARE 0.65`, `DEU 0.60`…) with a source string like "EIA / IEA pipeline analysis (Phase 2 simplified)" — no year, document, or URL per row. Every scenario result flows from these. | `scripts/transform/build_disruption_routing.py:44-73`. |
| R7 | **S** | **Silent unit guessing and fabricated values.** `_normalize_oil_capacity` divides unknown units by 1000; `_parse_osm_capacity_kbpd` infers kbpd vs bpd from magnitude; `build_refineries.py:250` rewrites NULL NETL status to `"operating"`; `capacity_kbpd` holds bcm/y for 2,772 gas rows (documented, but a trap). `build_country_year.py:117-119` drops unmapped country names with no log. | `build_pipelines.py:107,255`; `build_refineries.py:109,250`; `build_storage.py:100`. |
| R8 | **S** | **Capacity coverage is far lower than the UI implies.** Refinery 355/2360 (15 %), ports 23/3694, storage 4/26102, extraction 0/5008. Yet refinery radius and port size are capacity-scaled and the legend says "size = capacity". | DuckDB `count(capacity)` by kind; `RefineriesLayer.tsx:49`, `PortsLayer.tsx:57`, `Legend.tsx:28`. |

### 3.2 Runtime / React

| # | Sev | Finding | Evidence |
|---|---|---|---|
| R9 | **M** | **Basemap container has zero height in production.** MapLibre tiles load (200s, 12 KB PNGs) but `.maplibregl-map` computes to 0 px; the map is a black/white void. Likely cause: `maplibre-gl.css` (`.maplibregl-map{position:relative}`) is imported after Tailwind and overrides the utility `absolute` on the container div, so `inset-0` no longer stretches it. `MapShell.tsx:91`, `src/components/map/style.ts`. Verify with a screenshot in light *and* dark schemes; fix by giving the container explicit `h-full w-full` (or `!absolute`) and adding an e2e assertion on `.maplibregl-canvas` height > 0. |
| R10 | **M** | **Year slider capped at 2020.** `YearSlider min={1990} max={2020}` while voyages, LNG-T3 attribution (`useScenario.ts:94`, `engine.ts:92`), BACI and production all reach 2024. `decodeAppState` also accepts any integer year (`encode.ts:40-45`), so `?year=99999` is "valid". | `page.tsx:285`; `tests/e2e/phase-6.spec.ts:27,38` hand-write `year=2023`. |
| R11 | **M** | **Scenario overlay paints every importer maroon.** `importerOverlay` emits `[80+175·t, 30, 30, 220]` for *every* importer in `byImporter` (which is every country with any trade row), so `t=0` → opaque dark red. The `tooltip` string it builds is never displayed (`page.tsx:269-272` shows name only), and it says "crude imports" even for gas. | `src/components/scenarios/overlay.ts:3-15`; `page.tsx:269-272`. |
| R12 | **M** | **Deck/MapLibre zoom desync past `maxZoom: 8`.** MapLibre is created with `maxZoom: 8` but the Deck controller has no limit; `map.jumpTo` clamps, Deck keeps zooming, layers drift off the basemap. Moot once the basemap renders — and better fixed by moving to `MapboxOverlay` (interleaved) from `@deck.gl/mapbox`, which is already a dependency and removes the hand-rolled sync. | `MapShell.tsx:45,58-65`. |
| R13 | **S** | **Nine copies of the same hook shape.** Each layer hook repeats: `useState<Layer|null>`, `useEffect` with a `{cancelled}` token, the `Promise.resolve().then(setLayer(null))` lint dodge, a DuckDB `SELECT … FROM read_parquet('/data/assets.parquet') WHERE kind = …`, layer construction, cleanup. ~600 lines that should be ~150. Visibility is inconsistently handled: reserves and extraction are always queried regardless of `layers.reserves` / `layers.extraction` (`page.tsx:74-79`) and filtered only at `visibleLayers`. | `RefineriesLayer.tsx:23-74`, `StorageLayer.tsx:17-56`, `PortsLayer.tsx:31-71`, `ExtractionPoints.tsx:23-59`, `LngTerminalsLayer.tsx:47-112`, `BasinPolygonsLayer.tsx:42-83`, `PipelinesLayer.tsx:63-129`. |
| R14 | **S** | **Assets scanned once per hook, per state change.** `assets.parquet` is read by 5 layer hooks + `useScenario` (which re-queries refineries the layer already has). Extraction re-queries on every year tick (`ExtractionPoints.tsx:57`) to do a filter that `isVisibleAtYear` could do in memory. DuckDB-WASM's httpfs does HEAD + range reads each time. The Phase 7 "shared asset query cache" item is valid — but the cleaner fix is one `useAssets()` that loads all 37 k rows once (1.3 MB) and hands each layer a filtered slice; no SQL needed. |
| R15 | **S** | **`pipelines.geojson` fetched twice.** `_cache` is set after `await res.json()`, so the oil and gas hooks both issue the fetch on mount. Cache the promise, not the result. Same pattern in `BasinPolygonsLayer.tsx:25-33` and `countries.ts:8-18` (single caller today). | `PipelinesLayer.tsx:38-46`; live network log shows two 3.1 MB entries. |
| R16 | **S** | **URL is the state store; every change is a Next navigation.** `useUrlState` calls `router.replace` on every slider tick (`useUrlState.ts:48`), which goes through the App Router (RSC round-trip, `useSearchParams` re-render, `Suspense` boundary). It also needed a ref hack to survive two quick updates (`:28-46`). Replace with a local reducer/store (React `useReducer` or `zustand`) + debounced `window.history.replaceState` (Next ≥14.1 keeps `useSearchParams` in sync with native history). Keep `encode.ts` unchanged. |
| R17 | **S** | **Choropleth layer id includes year and commodity** (`reserves-${commodity}-${year}-…`), so deck.gl destroys and rebuilds the 175-polygon layer every tick instead of updating `getFillColor` via `updateTriggers` (which it *also* sets, redundantly). | `ReservesChoropleth.tsx:49,63`. |
| R18 | **S** | **Tooltip logic centralised in `page.tsx` as a 150-line `switch` on `layer.id`** with `as` casts against untyped `Record<string, unknown>`. Each layer module should export its row type and a `formatTooltip(row)`; `page.tsx` should just dispatch. | `page.tsx:124-276`. |
| R19 | **S** | **`useScenario` runs four queries sequentially** (`await` chain) and re-fetches refineries/LNG rows the layers already hold. With R14's `useAssets()` it becomes two parallel queries. | `useScenario.ts:58-111`. |
| R20 | **S** | **BigInt leakage from Arrow is handled ad hoc.** `year != input.year` "intentional coercion" (`engine.ts:55`), `amount_cbm: number | bigint` (`types.ts:59`), `Number()` at the use site (`lng-t3.ts:83`). Fix once in `query()`: cast BIGINT → INTEGER/DOUBLE in SQL (already done in some hooks) or map `toArray()` rows through a BigInt-normaliser. |
| R21 | **S** | **Dead code and dead deps.** `hormuz.ts` wrapper, `ChokepointRouteRow` alias, `chokepoint_id`/`ranked` "back-compat shims" (`engine.ts:121-123`, `types.ts:120-122`) have no consumers. `pmtiles`, `@deck.gl/react`, `@deck.gl/geo-layers`, `@deck.gl/mapbox`, `deck.gl` meta-package, `@testing-library/*`, `prettier` config are unused in `src/`/`tests/`. `parseCatalog` hard-codes `version !== 1 … !== 5` (`data-catalog/index.ts:32`). `scripts/common/secrets.py` and `iso3.lookup()` are never imported. |
| R22 | **S** | **Fonts and metadata are create-next-app defaults.** `layout.tsx:15-18` title "Create Next App"; Geist fonts are loaded then overridden by `font-family: Arial` in `globals.css:25`. |
| R23 | **C** | `MapShell` uses `canvas: "deck-canvas"` by DOM id — fine while there is one map, but blocks a second map/inset. Goes away with `MapboxOverlay`. |

### 3.3 Python pipeline structure

| # | Sev | Finding | Evidence |
|---|---|---|---|
| R24 | **S** | **Near-verbatim clones.** `baci_2709.py` / `baci_2711.py` differ by 8 of 234 lines and each range-fetches all 30 yearly blocks (~2.4 GB) from CEPII — twice. `netl_basins/ports/storage/refineries.py` are identical 28-line files bar two constants. Four ingests copy the same `HEADERS`/`WAYBACK_CDX`/`_resolve_download_url`/`download`/`main` scaffold byte-for-byte (`gem_oil_infra.py:101-123` == `gem_gas_infra.py:112-134`). |
| R25 | **S** | **Three ISO3 lookup APIs, three copies of `_country_iso3`/`_to_float`, four variants of "drop kind, union columns, concat, write".** | `build_storage.py:37-71,133-149`; `build_ports.py:39-73,136-152`; `build_basins.py:53-60`; `build_refineries.py:280-294`; `build_lng_terminals.py:306-342`; `scripts/common/iso3.py:410`; `scripts/transform/_lng_iso3.py`. |
| R26 | **S** | **No schema assertion on any output**; `commissioned_year` is `Int32` in one writer and `Int64` in others and survives only via concat coercion. No test opens a parquet. | `build_assets.py:114`. |
| R27 | **S** | **Zero tests on `build_*` or ingests.** Only helpers are tested. The most fragile code (`_is_aggregate` prefix heuristic, hardcoded `header_row`/`data_start_row`) is untested. Module-level `next(Path(...).glob("*.xlsx"))` raises at import time, which is *why* nothing imports them in tests. | `build_country_year.py:33,39-69,148-175`; `build_assets.py:55`. |
| R28 | **S** | **No `build_all` entrypoint, no checksums, no pinning for OSM/NETL/EI.** OSM Overpass runs live without `[date:]`; NETL is live ArcGIS; EI falls back to "first Wayback snapshot". BACI ingest hard-codes zip byte offsets (`baci_2709.py:50-90`). |
| R29 | **C** | Ruff selects `E,F,W,I,UP,B,SIM` only; no `ruff format --check`, no `uv sync --locked` in CI; `sys.exit(main())` on `None`-returning mains; `type: ignore` on `year_fn: object` (`build_trade_flow.py:52,117`). |

### 3.4 Tests and CI

| # | Sev | Finding |
|---|---|---|
| R30 | **S** | **e2e specs are organised by phase, not feature** (`phase-1.spec.ts` … `phase-6.spec.ts`), and none asserts a *rendered* outcome — they wait for `#deck-canvas` and check DOM text. That is how R1 and R9 shipped. Add (a) a `data-ready` attribute set when every visible layer resolved (the backlog's "explicit ready signal"), (b) one pixel/probe assertion: read back the deck canvas at a known lon/lat (e.g. Saudi centroid at 2019 must not equal the ocean colour), (c) `.maplibregl-canvas` height > 0. |
| R31 | **S** | **No data-integrity tests.** A 20-line pytest that asserts: every catalog path exists, every `public/data/*` is catalogued, `(iso3, metric, year)` is unique in `country_year_series`, all `trade_flow` ISO3s ∈ Natural Earth (or an explicit allowlist), `kind` non-null in `assets`, `capacity_unit` consistent per kind — would have caught R1, R2, R5. |
| R32 | **C** | Unit tests are strong on the scenario engine and codec; there is nothing on colour ramps, tooltip formatting, or the overlay (the `overlay.test.ts` tests structure, not colour). Add a small `colorScale` module with tests when doing R11/R17. |
| R33 | **C** | CI runs `pnpm build` twice (web + e2e jobs). Upload the `.next` artefact or merge jobs. |

---

## 4. Redesign findings (product / UX / architecture)

### 4.1 Who is this for, and what do they do on arrival?

The target user is a researcher who "thinks in systems" — they arrive with a question ("how exposed is Poland's refining to Druzhba?", "what did the LNG import mix look like in 2022?") and want to (1) answer it, (2) trust it, (3) cite/export it. The current IA is built for the *builder*: a flat list of ten layer toggles, all on, a slider, a dropdown. Nothing tells the user what the map can answer, what the defaults mean, or how to get a number out of it.

**Recommendation:** re-centre the IA on **three modes**, each a default layer set + panel: *Infrastructure* (what exists, when — reserves off by default, pipelines + refineries + LNG on), *Flows* (trade + voyages — choropleth of imports, arcs), *Scenarios* (disruption — importer exposure, ranked table, affected assets). Layer toggles remain available under an "Advanced" disclosure. This is an ordering/defaults change, not new data.

### 4.2 Findings

| # | Sev | Area | Finding and recommendation |
|---|---|---|---|
| D1 | **M** | Default view | Nine of ten layers on; 26 k storage dots and 3.7 k anchor glyphs turn every coastline into a smudge at z2–3; LNG triangles are 14–36 px and dominate. Default to ≤4 layers; add zoom-gated visibility (`minZoom`) for storage/ports; halve glyph sizes; consider `radiusScale` by zoom. |
| D2 | **M** | Legend | Static, hand-drawn, and wrong: reserves swatch is green (map is grey→teal), LNG terminals shown as a dot (map draws triangles), pipeline swatch indigo (map is navy), no scenario legend at all. Generate the Legend from the same colour constants the layers use (backlog item "Legend driven by LayerState" — correct, but the deeper fix is a shared `symbology.ts` that both Legend and layers import). Hide rows for hidden layers. |
| D3 | **M** | Colour | Blue is used for refineries, oil pipelines, gas pipelines, LNG terminals, voyage import arcs *and* the reserves ramp. Nothing is separable by hue. Assign one hue family per commodity (oil warm, gas cool), lightness/shape per asset kind, and a *sequential* ramp for the choropleth that does not collide with either. Use a quantile or log scale for reserves — a linear max-normalised ramp (`ReservesChoropleth.tsx:24-30`) makes everything but VEN/SAU/CAN near-white. |
| D4 | **M** | Scenario overlay | See R11. Design: alpha-ramp by `shareAtRisk`, transparent at 0, a distinct "no trade data" hatch/grey, a scenario legend, and the `%` defined in the panel header ("share of 20XX seaborne crude imports routed through …"). Sort the ranked table by the displayed number. Show asset names, not just ISO3 + capacity. Give the gas Hormuz scenario its own description (currently reuses the oil text, `registry.ts:18-19`). |
| D5 | **M** | Tooltips | Country tooltip is name only; the single quantitative layer never shows a number. Every tooltip should carry value + unit + year + source (+ `as_of`). Pipelines are effectively un-hoverable at z<5 (1.2 px lines, no `pickingRadius`). Refinery "Capacity: n/a" for 85 % of rows should say "not in source" and the size encoding should be dropped for those (R8). |
| D6 | **M** | `/about` | `methodology.md` is rendered inside `<pre>` — literal `#`, `**`, backticks and `>` on the live page (`about/page.tsx:23-25`). Render markdown (e.g. `react-markdown` + `remark-gfm`, or precompile with `marked` at build). The document itself is a per-phase changelog with stale claims ("capacity field currently null … will be harmonized in Phase 2"); a researcher needs a *current-state* methodology: one section per layer (source, as-of, coverage %, units, known gaps, how the scenario uses it). `docs/data-sources.md` is already 80 % of that — promote it and demote the phase narrative to `docs/history.md`. Add "How to cite" (CITATION.cff → APA/BibTeX blocks), data download links per catalog entry, and a link back to the map. |
| D7 | **M** | Navigation & metadata | No link from `/` to `/about` or back; `<title>Create Next App</title>`; no `<h1>`; no description; no OG image. A researcher who lands via a shared URL sees an unnamed map. Add a compact title bar (name, one-line description, About, Share, Data). |
| D8 | **S** | Onboarding | No first-run hint. A dismissible 3-bullet "what you can do" card (hover, slide, pick a scenario) plus example-question chips that set URL state (`?scenario=druzhba&commodity=oil&year=2021&layers=…`) would do more than any tour. |
| D9 | **S** | Time slider | 1990–2020 with no ticks, no play, no indication of which layers respond to it (pipelines 71 %, extraction 22 %, LNG 98 %, refineries/storage/ports never), and reserves frozen at 2020 while production/trade run to 2024. Extend to 2024; show per-layer "time-aware" badges in the layer panel; show "reserves: 2020 value (source frozen)" when year > 2020 rather than silently reusing; add ±1 keyboard and a small play control. |
| D10 | **S** | Share / export | URL state works but there is no visible affordance; add "Copy link". For export: "Download what I see" (CSV of the current scenario table; the current layer's rows as CSV/GeoJSON) and "Cite this view" (APA/BibTeX with URL + as-of dates from the catalog). Both are cheap because DuckDB is already in the page (`COPY (…) TO` into a buffer, or just `Blob` from rows). This is the single feature that turns the site from "demo" into "tool" for the audience. |
| D11 | **S** | Responsive | At 400 px: scenario panel overlaps the layer panel header, the 480 px slider overflows and causes horizontal scroll, ~85 % of the width is panel. At 768 px it is usable. Decide: phone = read-only view with panels as bottom sheets (S), or explicitly unsupported with a message (XS). Recommend the latter for launch, the former later. |
| D12 | **S** | Accessibility | All ten checkboxes have accessible name "on" (label wraps input but `<span>` text is not associated in the a11y tree the way screen readers expect — use `htmlFor`/`id` or `aria-label`). Select is named by its value. No skip link, no keyboard route to map features, legend text 10 px. `/about` body is mid-grey on near-black in dark scheme. Fix labels and contrast for launch; keyboard map navigation is a defer. |
| D13 | **S** | Dark mode | The app is light-only by design (`bg-white/90` panels) but `globals.css` flips body colours under `prefers-color-scheme: dark`, which is what exposed the basemap bug and the panel-text bug (#14). Pick one: either commit to a light UI and remove the dark media query, or design a real dark theme (basemap `dark_all`, panel tokens). Recommend the former for launch. |
| D14 | **S** | Performance / load | See R14–R17 and §2.2. Targets for launch: ≤ 8 MB wire on cold load, first data layer < 1 s, all layers < 4 s on broadband, and immutable caching so a revisit is ~0 bytes. Concretely: dedupe the GeoJSON fetch; `Cache-Control: public, max-age=31536000, immutable` on `/data/*` via `next.config.ts` `headers()` **with content-hashed or version-suffixed filenames** (the catalog already has `as_of`; add `sha256` and use it in the path); self-host the DuckDB bundle under `/public/duckdb/` (removes the jsDelivr runtime dependency and lets it cache); show a loading state (there is none — `Suspense` has no fallback, and the page is silent for 6–8 s). |
| D15 | **S** | Basemap | CARTO raster `light_all` is fine and free with attribution, but the attribution is currently invisible (R9) and CARTO's basemap terms require it. Once R9 is fixed, keep CARTO for launch. Do **not** adopt PMTiles for the basemap yet (see §7). |

### 4.3 Architecture questions

**Is client-only DuckDB-WASM right at this size?** Today it costs 7 MB + a worker boot to run `WHERE kind = 'x'` over a 1.3 MB file; the one real query (the voyage/terminal join) is 17 k rows. On pure engineering grounds it should be removed and replaced by fetching Arrow/JSON per layer. **But** the spec's thesis is "inspectable, scenario-testable structure", and the audience is exactly the group that would use an in-page SQL/export surface. Recommendation: **keep DuckDB, but make it earn its place** — (a) load it lazily and in parallel with the GeoJSON layers so first paint does not wait for it, (b) register each parquet once (`registerFileURL`/buffer) instead of re-fetching via httpfs, (c) expose it through "Download what I see" and, later, a small query console. If the user decides against export/query features, remove it (Phase 8 alternative path, ~M).

**Should data move to Blob/R2?** No. Total runtime data is ~24 MB uncompressed / ~8 MB brotli, well under Vercel limits once `pipelines.parquet` (34 MB, unused) is dropped from `public/`. Keep everything in the repo; move to Blob only if a Phase 10+ source (AIS, wells) crosses ~25 MB per file.

**PMTiles / vector tiles?** Not for the basemap. *Maybe* for pipelines: 14 MB of GeoJSON simplified to 500 m is the wrong trade-off at both ends (blurry at z8, heavy at z2). `tippecanoe` → PMTiles + deck.gl `MVTLayer` (or MapLibre line layer) gives full detail at zoom and ~2–3 MB total, with range reads. This is a Phase 9/10 "could-do" that pays off only if the product emphasises infrastructure inspection at high zoom.

**State architecture.** Replace URL-as-store with a single typed app store (reducer + context, or `zustand`) holding `AppState` + `viewState` + `loading`/`ready` per layer, with `encode.ts` as the URL serialiser and a debounced `history.replaceState` sync. Include the map view (lon/lat/zoom) in the URL — a shareable link that does not preserve where you were looking is half a link.

**Rendering.** Move to `MapboxOverlay` (interleaved) from `@deck.gl/mapbox` — already installed — so MapLibre owns the camera and the canvas; deletes the sync effect, the `maxZoom` desync, the `deck-canvas` id coupling, and lets the basemap labels draw *above* the fills.

---

## 5. Prioritised roadmap

Each phase is a deployable slice. Sizes: S ≤ 1 day, M 2–4 days, L 1–2 weeks. Follow the repo's parallel-implementer convention: disjoint file sets, explicit `git add`.

### Phase 7 — Correctness (must-fix; ship before anything else)

| Item | Rationale | Files | Approach | Verification | Size | Deps |
|---|---|---|---|---|---|---|
| 7.1 Fix EI year-column parsing (R1) | Default view is wrong | `scripts/transform/build_country_year.py`; regenerate `country_year_series.parquet` | Accept a year column only if the header cell is an int-typed year *and* the column is not after the last consecutive year, or explicitly stop at the first non-year header; assert `(iso3, metric, year)` unique before write | pytest on a fixture sheet with trailing share/change columns; integrity test 8.4 | S | — |
| 7.2 Basemap renders (R9) | Map is a void | `src/components/map/MapShell.tsx`, `style.ts`, `globals.css` | Give the container explicit sizing that survives maplibre CSS; verify in both colour schemes; make attribution visible | e2e: `.maplibregl-canvas` height > 0 and a tile request observed | S | — |
| 7.3 Year range 1990–2024 + clamp (R10) | Phase 6 feature unreachable; bad URLs accepted | `page.tsx`, `YearSlider.tsx`, `url-state/encode.ts` | `YEAR_MIN/MAX` constants in one module; clamp in `decodeAppState`; reserves layer shows "2020 value (source frozen)" for year > 2020 | encode tests for clamp; e2e slides to 2023 and sees voyages | S | — |
| 7.4 Scenario overlay honesty (R11, D4) | Misleading colouring | `overlay.ts`, `ReservesChoropleth.tsx`, `ScenarioPanel.tsx`, `registry.ts` | Alpha/lightness ramp by `shareAtRisk`; transparent at 0; grey "no trade data"; scenario legend; sorted table; define the %; gas-specific Hormuz text | unit tests on the colour function; e2e text assertions | M | 7.2 |
| 7.5 Drop BACI pseudo-countries (R2) | `S19` in rankings | `build_trade_flow.py`; regenerate `trade_flow.parquet` | Validate against Natural Earth ISO3 set + explicit allowlist (TWN, XKX…); log dropped totals | pytest fixture; integrity test | S | — |
| 7.6 Make `build_assets` an appender; restore `capacity_unit` (R3, R4) | Rebuild destroys data | `build_assets.py` | Same drop-kind-then-append pattern as siblings; write `kboe/d` explicitly | pytest: run twice on a temp parquet → identical | S | — |
| 7.7 Catalog truth (R5) | `/about` lies | `public/data/catalog.json`; new `scripts/transform/build_catalog.py`; `src/lib/data-catalog/*` | Generate catalog from a small registry in Python (id, label, path, source…, computed `rows`, `sha256`, `bytes`); include GeoJSON sidecars; delete `chokepoint_route` entry and `build_chokepoint_routing.py`; drop the `version 1…5` chain in `parseCatalog` (validate shape, not version) | pytest: every catalog path exists and every file is catalogued; Vitest `parseCatalog` on the real file | M | — |
| 7.8 Remove `pipelines.parquet` and `basins.parquet` from `public/` (R5, backlog) | 36 MB dead weight in the bundle | `public/data/`, `build_pipelines.py`, `build_basins.py`, `.gitignore`, catalog | Write full-res GeoParquet to `data/derived/` (gitignored or LFS) and keep only the sidecars public — or keep them public but out of the catalog "runtime" set with an explicit `runtime: false` flag. Recommend the former. | catalog test | S | 7.7 |
| 7.9 Metadata + nav (D7, R22) | "Create Next App" | `layout.tsx`, `globals.css`, `page.tsx`, `about/page.tsx` | Real title/description/OG; title bar with About link; back link; delete Arial override | e2e title assertion | S | — |
| 7.10 Dedupe GeoJSON fetch + loading state (R15, D14) | 28 MB decoded waste; 6 s of silence | `PipelinesLayer.tsx`, `BasinPolygonsLayer.tsx`, `countries.ts`, `page.tsx` | Cache the promise; minimal "loading N layers…" indicator driven by per-layer ready flags | e2e: exactly one `pipelines.geojson` request | S | — |
| 7.11 Integrity tests in CI (R31) | Prevent recurrence | `tests/python/test_data_integrity.py`, `ci.yml` | Uniqueness, ISO3 membership, catalog↔disk, `kind` non-null, `capacity_unit` per kind | runs in the python CI job | S | 7.1, 7.5, 7.7 |

Exit criteria: default URL shows a coloured choropleth over a basemap; slider reaches 2024; scenario colouring is proportional; `/about` table matches disk; CI includes data-integrity tests; all e2e green.

### Phase 8 — Consolidation (should-do; the real "Phase 7" from CLAUDE.md, resequenced)

| Item | Rationale | Files | Approach | Verification | Size | Deps |
|---|---|---|---|---|---|---|
| 8.1 `useAssets()` + `createLayerHook` (R13, R14, R19) | 600 → 150 lines; one scan | new `src/lib/data/useAssets.ts`, `src/components/layers/*` | One query for all asset rows (typed by `kind` discriminated union); layers become pure `rows → Layer` functions memoised on inputs; visibility handled uniformly; `useScenario` takes rows from the same source | existing e2e; new Vitest for the row→layer builders (deck layers are plain objects — assert `props`) | M | 7.x |
| 8.2 App store + URL sync (R16) | Slider ticks are navigations | `src/lib/state/store.ts`, `useUrlState.ts` → `useUrlSync.ts`, `page.tsx` | Reducer/store for `AppState` + view state + per-layer ready; debounced `history.replaceState`; include lon/lat/zoom in URL | encode tests extended; e2e "share link restores view" | M | — |
| 8.3 `MapboxOverlay` interleaved (R12, R23) | Delete sync code; fix desync | `MapShell.tsx` | `map.addControl(new MapboxOverlay({interleaved: true, layers}))`; drop the second canvas | e2e basemap + layer assertion | S | 7.2 |
| 8.4 Symbology module + generated Legend (D2, D3, R17) | Legend matches map | new `src/lib/symbology.ts`, `Legend.tsx`, all layers | Colour constants + scales (quantile/log ramp) in one place; Legend renders from `LayerState` × symbology; choropleth updates via `updateTriggers` with a stable id | Vitest on scales; visual check | M | 8.1 |
| 8.5 Per-layer tooltips (R18, D5) | Typed, local, complete | each layer file exports `formatTooltip`; `page.tsx` dispatches | Include value/unit/year/source/as_of (from catalog); `pickingRadius` for lines | Vitest on formatters | S | 8.1 |
| 8.6 BigInt normalisation in `query()` (R20) | One fix, not three | `src/lib/duckdb/query.ts`, `engine.ts`, `types.ts`, `lng-t3.ts` | Normalise in `toArray()` mapping; remove the `!=` hack and the `number | bigint` type | existing scenario tests | S | — |
| 8.7 Python: `build_all.py`, shared helpers, schema check (R24–R28) | Reproducible pipeline | `scripts/build_all.py`, `scripts/common/{download,parquet,iso3}.py`, all `build_*`/ingests, `pyproject.toml` | Ordered DAG in one file; `append_kind(df, kind)` helper with a `pyarrow` schema per table; collapse NETL ×4, BACI ×2, downloader scaffold ×4; `source_version` from source, not `date.today()`; log dropped rows; move module-level `glob` into `main()`; add `ruff format --check`, `uv sync --locked`, `python -m pytest` to CI | fixture-based pytest per `build_*` (tiny CSV/XLSX → parquet → assert schema + counts); byte-identical rebuild check on two runs | L | 7.6, 7.7 |
| 8.8 Dead code/deps sweep (R21) | Hygiene | `package.json`, `src/lib/scenarios/{hormuz,types,engine}.ts`, `scripts/common/secrets.py`, `iso3.py` | Remove unused deps and shims; `pnpm dedupe` | lint/typecheck/build | S | 8.3 (keeps `@deck.gl/mapbox`) |
| 8.10 NETL within-source refinery dedup (found in Phase 7 browser check) | NETL lists the same plant up to 3× within ~100 m (English name, numbered "333 - …", French "Raffinerie de …" — e.g. Myanmar's Chauk/Thanbayakan/Thanlyin); inflates counts and dilutes per-refinery attribution | `build_refineries.py`, `_refinery_dedup.py` | Same-country ≤ 1 km cluster within NETL; keep the row with capacity / cleanest name; report merged counts | pytest fixture; integrity test on near-duplicate pairs | S | 8.7 |
| 8.9 e2e reorganisation + ready signal (R30) | Tests that would have caught R1/R9 | `tests/e2e/*` | Rename by feature (`map.spec`, `layers.spec`, `scenarios.spec`, `url.spec`, `about.spec`); `data-ready` attribute; canvas probe assertions | CI | M | 8.2 |

### Phase 9 — Product redesign (should-do; what "complete" looks like)

| Item | Rationale | Files | Approach | Verification | Size | Deps |
|---|---|---|---|---|---|---|
| 9.1 IA: modes + sane defaults + title bar (§4.1, D1, D7, D8) | Researcher-first arrival | `page.tsx`, new `components/ui/{TitleBar,ModeTabs,IntroCard}.tsx`, `LayerPanel.tsx` | Three modes with default layer sets; "Advanced layers" disclosure; example-question chips that set URL state; dismissible intro; zoom-gated storage/ports | e2e per mode | M | 8.2, 8.4 |
| 9.2 Visual design pass (D3, D13) | Reads as finished | `symbology.ts`, panels, `globals.css` | Commodity hue families; glyph sizes by zoom; commit to light UI (remove dark media query) or design dark properly; type scale ≥ 11 px | design review; contrast check | M | 8.4 |
| 9.3 Time controls (D9) | Time is a first-class axis | `YearSlider.tsx`, `LayerPanel.tsx`, `ReservesChoropleth.tsx` | Ticks, play, keyboard; time-aware badges per layer; explicit "frozen at 2020" note | e2e | S | 7.3 |
| 9.4 `/about` → Methodology + Data pages (D6) | Defensible to a reviewer | `about/page.tsx`, `docs/methodology.md` (rewrite as current-state), `docs/history.md` (old narrative), `docs/data-sources.md` | Render markdown; one section per layer; per-entry download links, row counts, sha256, as-of, coverage %; "How to cite" (APA/BibTeX from CITATION.cff); required GEM/LNG-T3 attribution lines verbatim | e2e: attribution strings present; links resolve | M | 7.7 |
| 9.5 Export + cite + share (D10) | Turns demo into tool | new `components/ui/ExportMenu.tsx`, `src/lib/export/*` | "Copy link"; CSV of scenario table; CSV/GeoJSON of the current layer rows (DuckDB `COPY` or client-side serialisation); "Cite this view" text with URL + as-of | Vitest on serialisers; e2e download event | M | 8.1, 8.2 |
| 9.6 Scenario panel v2 (D4) | Explainable numbers | `ScenarioPanel.tsx`, `registry.ts`, `disruption_route` schema | Definition of the metric inline; per-row citation for route shares (from R6's new `source_url`/`source_year` columns); asset names; "why is X at 0 %?" hover | unit + e2e | M | 7.4, 8.7 |
| 9.7 Responsive decision (D11) | Phones | panels, `YearSlider.tsx` | Launch: ≥ 768 px supported; < 768 px shows a "best on desktop" banner with the map still pannable and panels collapsed | e2e at 400/768 | S | 9.1 |
| 9.8 Accessibility pass (D12) | Public site | all controls | Proper labels, focus order, contrast ≥ 4.5:1, `aria-live` for scenario results | axe run in e2e | S | 9.2 |

### Phase 10 — Public-launch hardening

| Item | Rationale | Files | Approach | Verification | Size | Deps |
|---|---|---|---|---|---|---|
| 10.1 Caching + self-hosted DuckDB (D14) | Revisit ≈ 0 bytes; no jsDelivr runtime dep | `next.config.ts` (`headers()`), `public/data/` naming, `public/duckdb/`, `bootstrap.ts` | Immutable cache on hashed data paths (catalog carries the hash → runtime resolves path from catalog **for the hash only**, keeping the "hardcoded path" convention for the logical name); bundle the wasm/worker locally | Lighthouse; network audit | M | 7.7 |
| 10.2 Lazy/parallel DuckDB boot | First paint < 1 s | `bootstrap.ts`, `useAssets.ts` | Start GeoJSON layers immediately; DuckDB in parallel; `registerFileURL` once per parquet | perf trace | S | 8.1 |
| 10.3 Licensing pass (see §6) | Public defensibility | `README`, `/about`, `LICENSE-DATA.md` | Per-source terms, visible attributions, ODbL share-alike note for the OSM subset, EI/BACI terms statement, data licence file separate from MIT code licence | legal read-through | S | user decision |
| 10.4 Observability | Know when it breaks | `layout.tsx`, `ci.yml` | Vercel Analytics or Plausible (privacy-preserving); Sentry or equivalent for runtime errors; a post-deploy smoke that fetches `/data/catalog.json` and one parquet | — | S | — |
| 10.5 Docs refresh | Match reality | `CLAUDE.md`, `README.md`, `docs/*` | Update schema table (remove `chokepoint_route`), commands (`build_all`), conventions (symbology, store, tooltips), phase status | — | S | all |
| 10.6 Refresh cadence | Data ages | `scripts/build_all.py`, a `refresh.md` runbook | Annual EI/BACI, GEM per release; a `make refresh` that reruns ingests with pins bumped in one file | dry run | S | 8.7 |

**Explicitly deferred (Phase 11+):** vector tiles/PMTiles for pipelines; SQL query console; daily-resolution LNG slider and throughput tooltip (backlog item — it needs a daily time axis first, which is a product decision, not a tooltip); vintage filter on scenario inputs (backlog item — the trade data is already year-specific; filtering *assets* by vintage in the attribution would change results for the 78 % of undated sites in ways the UI cannot explain; do it only after 9.6 makes attribution explainable); coal; AIS; EIA STEO basins; mobile-first layout; dark theme.

---

## 6. Open decisions for the user

> **Resolved 2026-09-10 (user):** (1) go public after Phase 9 per the recommendation; (2) keep DuckDB-WASM — export (9.5) and a later query console are in scope; (3) light-only UI — remove the dark media query (pulled forward into Phase 7); (4) phones get a "best on desktop" banner. (5) reserves frozen at the 2020 value for 2021–24 with a visible badge; a second reserves source is TBD; (6) cite each scenario share row now, derive from EIA later; (7) do not rewrite git history.

1. **Go public, and under what data terms?** The code is MIT, but the *site* redistributes data under five different regimes. GEM (CC BY 4.0) and LNG-T3 (CC BY 4.0) are fine with visible attribution — currently satisfied on `/about` only, not on the map; put the attribution line in the map footer. **OSM refineries (ODbL)** are share-alike: the 88 OSM-derived rows in `assets.parquet` technically make the *asset table* a derivative database; either publish that subset separately under ODbL (a `refineries_osm.parquet` + notice) or drop the 88 rows (NETL covers 96 % anyway). **EI Statistical Review** terms permit use with attribution for non-commercial purposes but restrict redistribution of the dataset itself; shipping `country_year_series.parquet` for download is redistribution — safest is to keep it in the app but exclude it from "Download" and say so. **BACI** is "free for academic/research use"; a public website is arguably research dissemination, but CEPII asks for citation and the bilateral file is a derivative — keep the aggregated `trade_flow.parquet` behind the app, cite CEPII's paper, and do not offer it for bulk download. **Recommendation:** go public *after* Phase 9, with a `LICENSE-DATA.md`, map-footer attribution, and download limited to the CC BY / public-domain subsets. This is a legal-read decision, not mine.
2. **Keep DuckDB-WASM or remove it?** Keep only if 9.5 (export) and a later query console are in scope — that is where it earns its 7 MB. If the user does not want those, remove it in Phase 8 and ship Arrow/JSON per layer (smaller, faster, simpler). **Recommendation:** keep; the audience is exactly the one that wants SQL over the data.
3. **Visual direction.** Light-only (current, cheapest; commit and delete the dark media query) vs. a real dark "OSINT dashboard" theme (more work, and the raster `dark_all` basemap makes labels harder). **Recommendation:** light, editorial, restrained — it fits the audience and the citation-heavy `/about`.
4. **Phones.** Support (bottom sheets, M) vs. "best on desktop" banner (XS). **Recommendation:** banner for launch.
5. **Reserves after 2020.** EI has not updated reserves; options are (a) show the 2020 value with a badge for 2021–24 (recommended), (b) blank the choropleth after 2020, (c) add OPEC ASB as a second reserves source (new ingest, M).
6. **Scenario share provenance.** Sixteen hand-set numbers drive every scenario. Options: (a) keep, but cite each row to a document + year (S), (b) derive Hormuz shares per year from EIA's chokepoint volumes (M), (c) hide scenarios until (b). **Recommendation:** (a) now, (b) as a Phase 11 candidate.
7. **Repository history hygiene.** `public/data/pipelines.parquet` (34 MB) is in git history; removing it from the tree does not shrink clones. Rewrite history before going public, or accept a ~50 MB repo. **Recommendation:** accept; rewriting is not worth the risk on a solo repo.

---

## 7. Things not to do

- **Do not add new data sources (coal, AIS, EIA STEO, wells) before Phase 9 ships.** Every accreted phase so far added a layer without anyone using the previous one as a researcher; the defects in §3–4 are the cost. Breadth is not the gap.
- **Do not adopt PMTiles for the basemap.** CARTO raster is free, attributed, and adequate; the spec's "self-hosted PMTiles before going public" note (`style.ts:3-4`) was a Phase 1 assumption that no longer buys anything. Revisit only if CARTO terms change.
- **Do not move data to Vercel Blob/R2.** Under 10 MB brotli after dropping `pipelines.parquet`; Blob adds an auth/URL indirection for no benefit.
- **Do not build a daily time slider or the "daily-throughput tooltip"** until the annual axis is correct and explainable (7.3, 9.3). A second time resolution in the UI doubles the explanation burden.
- **Do not apply the vintage filter to scenario inputs yet** (backlog item). With 78 % of extraction sites and 100 % of refineries undated, it would silently change attribution for an unexplainable subset.
- **Do not rewrite the scenario engine.** It is the best-tested code in the repo; the problems are in how its output is *rendered* (R11) and *sourced* (R6), not in the maths.
- **Do not thread catalog `path` fields into runtime SQL** (existing convention, still right) — but *do* let the runtime read the catalog for `sha256`/`as_of` so tooltips, cache-busting, and "cite this view" have one source of truth.
- **Do not unit-test deck.gl rendering.** Test the `rows → Layer` builders' props and use canvas-probe e2e assertions instead.
- **Do not build a mobile-first layout.** The audience works at a desk; a banner is enough.
- **Do not rewrite git history** to purge `pipelines.parquet` (see decision 7).
