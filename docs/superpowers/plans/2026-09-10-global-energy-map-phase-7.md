# Phase 7 — Correctness (implementation plan)

> **Spec:** `docs/superpowers/specs/2026-09-10-refactor-redesign-review.md` §5 Phase 7 (items 7.1–7.11) plus the user decisions recorded in §6.
> **Branch:** `phase-7-correctness` → PR to `main`.
> **Goal:** the default URL shows a correct, coloured reserves choropleth over a visible basemap; the slider reaches 2024; scenario colouring is proportional to exposure; `/about` matches what is on disk; CI has data-integrity tests that would have caught every Phase 7 defect.
> **Out of scope:** everything in Phase 8+ (asset cache, store, MapboxOverlay, symbology module, per-layer tooltips, Python `build_all`), the three-mode IA, export/cite. Resist scope creep — if a fix needs a Phase 8 refactor to be clean, do the minimal correct version now and leave a `// Phase 8:` note.

## Decisions baked in

- Light-only UI: delete the `prefers-color-scheme: dark` block (user decision 3).
- Reserves after 2020: show the 2020 value with a visible "Reserves: 2020 value (latest in source)" badge; no second source (user decision 5).
- Scenario shares: every hardcoded row gets `source_title`, `source_url`, `source_year` (user decision 6).
- Keep DuckDB (decision 2) — no runtime architecture changes in this phase.
- Do not rewrite git history (decision 7) — just stop shipping dead files.

## Execution model

Parallel implementer agents on **disjoint file sets**; agents do not commit; the orchestrator commits each set with explicit `git add <files>` (CLAUDE.md convention). Two waves:

| Wave | Track | Owner files (exclusive) |
|---|---|---|
| 1 | **A — Data pipeline** | `scripts/**`, `tests/python/**`, `public/data/**`, `src/lib/data-catalog/**`, `tests/unit/data-catalog*`, `.github/workflows/ci.yml`, `.gitignore`, `pyproject.toml` |
| 1 | **B — Shell & chrome** | `src/components/map/**`, `src/app/layout.tsx`, `src/app/globals.css`, `src/app/about/**`, `tests/e2e/basemap.spec.ts` (new), `package.json` (only if a markdown dep is needed — see B3) |
| 1 | **C — Time, reserves, scenarios** | `src/app/page.tsx`, `src/components/time-slider/**`, `src/components/layers/**`, `src/components/scenarios/**`, `src/components/ui/**`, `src/lib/url-state/**`, `src/lib/scenarios/registry.ts`, `src/lib/geo/**`, `tests/unit/**` (except data-catalog), `tests/e2e/phase-*.spec.ts`, new `tests/e2e/time.spec.ts`, `tests/e2e/scenario-overlay.spec.ts` |
| 2 | **D — Integration & verification** | orchestrator: full lint/typecheck/test/build/e2e, visual check in browser, docs (`CLAUDE.md`, `docs/methodology.md` stale-claim fixes) |

All three wave-1 tracks are independent. Track C reads `country_year_series.parquet` at runtime; it must not assume the parquet is already fixed (write code that is correct for one row per `(iso3, metric, year)`; Track A delivers that).

---

## Track A — Data pipeline

### A1. EI year-column parsing (7.1, R1) — TDD
- **Bug:** `scripts/transform/build_country_year.py:94-107` accepts any header cell that parses as a year. EI sheets end with "change YYYY–YY" / "share YYYY" columns whose header cell repeats a year, producing 3 rows per country for reserves-2020 and production-2024 (`SAU 2020 → 297.5, −0.00017, 0.1717`).
- **Fix:** only take the *leading run of consecutive, strictly increasing* year columns; stop at the first non-year or non-increasing header. Assert `(iso3, metric, year)` unique before writing (raise with a helpful message).
- **Refactor for testability:** move the module-level `next(Path(...).glob("*.xlsx"))` into `main()` / a function so the parser can be imported in tests; `_parse_wide_sheet` takes a DataFrame (or path) argument.
- **Test first:** `tests/python/test_country_year.py` — build a tiny in-memory DataFrame mimicking the EI layout (title rows, header row `[name, 2018, 2019, 2020, "2020 change", 2020]`, a country row, an aggregate "Total" row) → assert one row per year, correct values, aggregate dropped.
- **Regenerate:** `uv run python -m scripts.transform.build_country_year`. Verify with DuckDB: `SELECT metric, year, count(*) … GROUP BY ALL HAVING count(*) > 1` → empty; SAU 2020 oil ≈ 297.5.
- Also log (don't silently drop) unmapped country names (R7, `:117-119`).

### A2. BACI pseudo-countries (7.5, R2) — TDD
- `build_trade_flow.py:91` accepts any 3-char code. Validate exporter/importer against the Natural Earth ISO3 set (read from `public/data/countries.geojson`) plus an explicit allowlist constant for legitimate codes missing from NE 1:110m (e.g. small island states; derive the list by inspecting what is dropped — keep only real sovereign/territory ISO3s, never `S19`, `ZA1`, `N.A.`-style aggregates).
- Print dropped codes with summed qty so the log shows what disappeared.
- Test: fixture frame with `S19`, `ZA1`, `SAU`, `CHN` → only real codes survive.
- Regenerate `trade_flow.parquet`. Check that scenario engine unit tests still pass (`pnpm test`).

### A3. `build_assets.py` becomes an appender; restore `capacity_unit` (7.6, R3, R4) — TDD
- Use the same drop-kind-then-append pattern as the siblings: read existing `assets.parquet` if present, drop `kind == 'extraction_site'`, concat, write. Missing file → write fresh.
- Extraction rows: `capacity_unit = "kboe/d"` (matches the shipped file; capacity stays NULL — GEM gives no single figure).
- Siblings (`build_storage.py:134`, `build_ports.py:137`, `build_refineries.py:281`, `build_lng_terminals.py:307`) must not crash when `assets.parquet` is missing — guard with an existence check. Minimal change; the shared `append_kind` helper is Phase 8.
- Stop writing `date.today()` into `source_version` (`build_storage.py:110`, `build_ports.py:113`, `build_basins.py:119`) — use the source's own release/as-of constant so rebuilds are byte-stable.
- Test: `tests/python/test_build_assets_append.py` — temp dir, seed a parquet with a refinery row, run the append function twice with a fake extraction frame → refinery row survives, extraction rows not duplicated.
- **Regenerate the full asset chain in order** and confirm row counts per kind match the shipped file (extraction 5,008; refinery 2,360; LNG 312; storage 26,102; ports 3,694): `build_assets → build_refineries → build_storage → build_ports → build_lng_terminals`. Document this order in a module docstring in `build_assets.py` (the `build_all.py` DAG is Phase 8). If counts differ from shipped, stop and report — do not ship a silently different dataset.

### A4. Generated catalog (7.7, R5)
- New `scripts/transform/build_catalog.py` with a Python registry (list of dicts) holding the hand-written fields for each entry: `id, label, path, format, source_name, source_url, license, as_of, layers, attribution` — seeded from the current `catalog.json` but corrected:
  - remove `chokepoint_route` (file does not exist); delete `scripts/transform/build_chokepoint_routing.py` (dead, superseded by `build_disruption_routing.py`);
  - add entries for `pipelines.geojson` and `basins.geojson` (the files the runtime actually reads);
  - fix `netl_gogi` / `gem_gas_infrastructure` entries so `path` and `layers` agree (split entries if one source feeds several files);
  - normalise every `as_of` to `YYYY-MM-DD` (or `YYYY-MM` where the source only gives a month — pick one rule and apply it everywhere).
- Computed fields per entry: `bytes`, `sha256`, `rows` (parquet via pyarrow metadata; GeoJSON feature count). `generated_at` = UTC now; bump `version` to 6.
- `src/lib/data-catalog/index.ts`: replace the `version !== 1 … !== 5` chain with `typeof version === "number" && version >= 1`; add the new optional fields to `types.ts` (`bytes?`, `sha256?`, `rows?`, `attribution?`). Keep backward-compatible so Track B's `/about` table keeps working.
- Vitest: parse the real `public/data/catalog.json` (extend the existing data-catalog test).

### A5. Stop shipping dead files (7.8)
- `pipelines.parquet` (34 MB) and `basins.parquet` (2.2 MB) have no runtime consumer. Change `build_pipelines.py` / `build_basins.py` to write the full-resolution GeoParquet to `data/derived/` (add to `.gitignore`) and keep writing the GeoJSON sidecars to `public/data/`. `git rm` the two parquets from `public/data/`.
- `lng_trade_daily.parquet` / `lng_terminal_daily.parquet` (160 KB, no runtime consumer) stay — they are documented reproducibility artefacts — but mark them `runtime: false` in the catalog registry.
- Grep `src/` and `tests/` for the removed paths before deleting; nothing should reference them.

### A6. Scenario share citations (user decision 6, R6)
- `scripts/transform/build_disruption_routing.py:44-73` holds 16 hand-set shares. Add `source_title`, `source_url`, `source_year` to each row, and write them to `disruption_route.parquet`.
- Research each number (EIA World Oil Transit Chokepoints; EIA country analysis briefs; IEA Oil Market Report / pipeline notes; operator disclosures for BTC/CPC; Druzhba via IEA/EC). Use WebSearch/WebFetch. Cite the specific document and year that supports the value. **If a value cannot be supported, keep it, set `source_title` to "Analyst estimate (unsourced)" and list it in the track report** — do not silently change numbers that drive every scenario; the orchestrator will raise changes with the user.
- Test: every row has non-empty `source_title` and `source_year`.

### A7. Data-integrity tests + CI (7.11, R31)
- `tests/python/test_data_integrity.py` (reads shipped files, no network):
  - every catalog `path` exists; every file in `public/data/` (except `catalog.json`) is catalogued;
  - catalog `sha256`/`bytes` match disk;
  - `country_year_series`: `(iso3, metric, year)` unique; reserves max year = 2020; values ≥ 0 for reserves;
  - `trade_flow`: every ISO3 ∈ Natural Earth set ∪ allowlist (import the allowlist constant from A2);
  - `assets`: `kind` non-null; expected kinds present; `capacity_unit` single value per kind (allowing NULL);
  - `disruption_route`: citation columns non-empty.
- `.github/workflows/ci.yml`: `uv run pytest tests/python -q` → `uv run python -m pytest tests/python -q`. Do not add `ruff format --check` yet (35 files would reformat — Phase 8).
- **Done when:** `uv run python -m pytest tests/python -q` and `uv run ruff check scripts tests` pass; `pnpm test` still passes.

---

## Track B — Shell & chrome

### B1. Basemap renders (7.2, R9)
- Diagnose first: run `pnpm dev`, open http://localhost:3000 in Chrome (claude-in-chrome), measure `.maplibregl-map` and `.maplibregl-canvas` height with `javascript_tool`. Expected cause: `maplibre-gl.css` sets `.maplibregl-map{position:relative}`, overriding Tailwind's `absolute` on the container in `MapShell.tsx:91`, so `inset-0` collapses to 0 height.
- Fix minimally in `MapShell.tsx`: give the map container explicit `h-full w-full` (which survives `position: relative`) or an inline style; confirm the canvas is full-size and CARTO tiles draw; confirm deck layers still align on pan/zoom.
- Clamp deck.gl to the same `maxZoom: 8` as MapLibre (pass `maxZoom` via `initialViewState` + clamp in `onViewStateChange`) so layers cannot drift off the basemap (R12). Full `MapboxOverlay` migration is Phase 8.
- Make CARTO + OSM attribution visible (CARTO's terms require it). MapLibre's attribution control sits under the deck canvas — ensure it is visible and clickable (z-index / pointer-events); `style.ts` must carry the attribution string.
- New `tests/e2e/basemap.spec.ts`: `.maplibregl-canvas` bounding box height > 300; at least one `basemaps.cartocdn.com` tile response observed; attribution text contains "CARTO".

### B2. Light-only + metadata (7.9 part, R22, user decision 3)
- `globals.css`: delete the `prefers-color-scheme: dark` block and the `font-family: Arial` override (Geist is loaded and should apply). Keep `--background`/`--foreground` light tokens.
- `layout.tsx`: real metadata — `title: { default: "Global Energy Map", template: "%s · Global Energy Map" }`, a one-sentence description (the CLAUDE.md one-liner, trimmed), `openGraph` title/description, `metadataBase` = `https://global-energy-map-one.vercel.app`. No OG image yet.

### B3. `/about` renders markdown + navigation (7.9, D6 part)
- `about/page.tsx`: render `docs/methodology.md` as HTML instead of `<pre>`. Prefer `marked` (tiny, server-side at build time, no client JS) — add it to `package.json`. Style with a small set of Tailwind element selectors (`[&_h2]:…`, `[&_a]:underline`, tables) rather than adding `@tailwindcss/typography`.
- `metadata.title = "Methodology"`.
- Add a "← Back to map" link at top.
- Data-sources table: add a "Rows" and "Size" column when present in the catalog (fields added by A4 — render only if defined, so it works before and after A4 lands). Show GEM / LNG-T3 attribution strings if `attribution` present.
- Do **not** rewrite `methodology.md` content (Phase 9.4); Track D fixes only claims that are now false.

**Done when:** `pnpm lint && pnpm typecheck && pnpm build` pass; basemap visible in a real browser; `/about` shows formatted headings, not literal `#`.

---

## Track C — Time, reserves, scenarios

### C1. Year range 1990–2024 + clamp (7.3, R10) — TDD
- New `src/lib/time/range.ts`: `YEAR_MIN = 1990`, `YEAR_MAX = 2024`, `RESERVES_LATEST_YEAR = 2020`, `clampYear(n)`. (Allowed new directory for Track C.)
- `encode.ts` `decodeAppState`: clamp decoded year into range. Extend `tests/unit/url-state*.test.ts`: `?year=99999` → 2024, `?year=1800` → 1990, `?year=abc` → default.
- `page.tsx`: slider uses the constants. Default year: change to 2024? **No** — keep default 2020 so the reserves choropleth is not showing a frozen value on first load; but make sure the 2020 default is now correct after A1.

### C2. Reserves frozen at 2020 with badge (user decision 5)
- `ReservesChoropleth.tsx`: query `year = min(year, RESERVES_LATEST_YEAR)`. Give the layer a **stable id** (`reserves`) and rely on `updateTriggers` (R17) — the page's tooltip dispatch matches `startsWith("reserves-")`; update that check in `page.tsx` accordingly.
- Replace the linear max-normalised ramp with a log/quantile ramp so more than VEN/SAU/CAN are visible (D3, minimal version: `log1p(v)/log1p(max)`), and paint countries with no data as a distinct light grey (not the same as "zero").
- Country tooltip shows the value: `Saudi Arabia (SAU)\nProved oil reserves: 297.5 bn bbl (2020)` — plus "(latest in source; year selected: 2023)" when frozen. Pass the value map out of the hook or attach values to feature properties.
- Badge: when `year > RESERVES_LATEST_YEAR` and reserves layer is on, show a small amber note next to the slider: "Reserves: 2020 value (latest in EI Statistical Review)". Put it in `YearSlider.tsx` via an optional `note` prop.

### C3. Honest scenario overlay (7.4, R11, D4) — TDD
- `overlay.ts` `importerOverlay`: `t = shareAtRisk`; `t <= 0` → no override (country falls back to the reserves/base fill); `t > 0` → sequential red ramp with alpha rising with `t` (e.g. alpha 60→230, lightness decreasing). Extract `exposureColor(t)` as a pure exported function.
- Tooltip text commodity-aware ("crude imports" vs "LNG imports") — `importerOverlay(r, commodity)`; and **display** it: the country tooltip in `page.tsx` shows the overlay tooltip line when a scenario is active.
- Unit tests `tests/unit/overlay.test.ts` (extend): `exposureColor(0)` is undefined/no-override; monotonic alpha and redness in `t`; `t=0.05` visibly distinct from `t=0.6` (alpha difference ≥ 100).
- Scenario legend: a small ramp bar with "0% → 100% of {year} {crude|LNG} imports routed through {scenario}" inside `ScenarioPanel`.
- `ScenarioPanel.tsx`: header defines the metric; importer rows show country *name* (look up from `countries.geojson` properties via `src/lib/geo/countries.ts`) with ISO3 in muted text; asset rows show the asset **name** (both impact types carry `name` — verify in `src/lib/scenarios/types.ts`, add if missing) not just `ISO3 · capacity`; confirm ranking sorts by the displayed `shareAtRisk`.
- Defensive filter: drop any importer whose ISO3 is not in the countries set from the ranked list (belt-and-braces for A2).
- `registry.ts`: add a gas-specific description for Hormuz (`descriptionByCommodity` or a `gasDescription` field): Qatar + UAE LNG (~20% of global LNG trade) transit Hormuz; no bypass for LNG.

### C4. Title bar + nav (7.9 part, D7)
- New `src/components/ui/TitleBar.tsx`: compact top-centre bar — "Global Energy Map" (as `<h1>`), a one-line subtitle, links: "Methodology & sources" (`/about`). Must not overlap LayerPanel (`left-4 top-4 w-60`) or ScenarioPanel (`right-4 top-4 w-80`) at ≥ 1024 px; at narrower widths it can hide the subtitle. Carries `text-slate-800` (panels set their own text colour).
- Map-footer attribution line (decision 1 groundwork): "Data: Global Energy Monitor (CC BY 4.0), LNG-T3 (CC BY 4.0), NETL, EI Statistical Review, CEPII BACI, OSM contributors (ODbL) · Methodology" — small text, bottom-left above the MapLibre attribution, linking to `/about`.

### C5. Dedupe GeoJSON fetch + loading indicator (7.10, R15, D14)
- `PipelinesLayer.tsx:38-46`, `BasinPolygonsLayer.tsx:25-33`, `src/lib/geo/countries.ts:8-18`: cache the **promise**, not the result (on rejection, clear the cache so a retry is possible).
- Loading indicator: each layer hook already returns `layer | null`; in `page.tsx` compute `pending = visible layers whose hook returned null` and render a small "Loading N layers…" pill (with `role="status"`) until zero; also set `data-ready="true"` on `<main>` when zero pending (this is the e2e ready signal — cheap now, used by 8.9).
- e2e: exactly one request to `/data/pipelines.geojson` on cold load.

### C6. e2e updates
- `tests/e2e/time.spec.ts`: slider max is 2024; set 2023 via keyboard (focus + ArrowRight) and see the reserves badge; with `lng_voyages` on at 2023 the voyages layer loads (reuse the pattern from `phase-6.spec.ts`).
- `tests/e2e/scenario-overlay.spec.ts`: select Hormuz → ranked importers list has no `S19`; metric definition text visible.
- Update existing `phase-*.spec.ts` assertions that break from: stable `reserves` id, new title, new tooltip text, panel text changes. Keep the 180 s budgets.

**Done when:** `pnpm lint && pnpm typecheck && pnpm test && pnpm build` pass; C6 specs pass locally (`pnpm test:e2e`, serial — ~3–5 min).

---

## Track D — Integration & verification (orchestrator)

1. Commit each track with explicit `git add` (one commit per item where practical: A1…A7, B1…B3, C1…C6).
2. Full suite: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`, `uv run python -m pytest tests/python -q`, `uv run ruff check scripts tests`, `pnpm test:e2e`.
3. Browser check (claude-in-chrome) against `pnpm build && pnpm start`: default URL — basemap visible, choropleth coloured with SAU/VEN/CAN/IRN/IRQ darkest; slide to 2024 — badge shows; Hormuz oil — graded red, no `S19`, names shown; Hormuz gas — gas text; `/about` formatted with back link; network: one `pipelines.geojson`, no `pipelines.parquet`.
4. Docs: `CLAUDE.md` — schema table (drop `chokepoint_route`), commands (`build_catalog`, `python -m pytest`, asset build order), conventions (light-only; catalog is generated — never hand-edit), phase status (Phase 7 = Correctness; the old consolidation backlog → Phase 8 per review). `docs/methodology.md` — fix only claims now false (e.g. year range, capacity-field statements). `docs/data-sources.md` — note the pseudo-country filter.
5. Open PR `Phase 7: correctness`; after CI green and user OK, merge → Vercel auto-deploys; verify live.

## Risks

- **A3 regeneration drift:** ingests of NETL/OSM are live/unpinned; re-running *transforms* on existing `data/raw/` is fine, but do not re-run *ingests* in this phase. If row counts drift, stop and report.
- **A6 research may not support some numbers.** Report, don't silently edit.
- **B1 root cause may differ** from the CSS-order hypothesis — diagnose in the browser before editing.
- **e2e flakiness** on CI (CPU-bound) — keep budgets, don't add parallelism.
