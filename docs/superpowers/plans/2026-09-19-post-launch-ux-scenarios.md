# Post-launch: UX, scenarios, and researcher tooling (implementation plan)

> **Context:** review of 2026-09-19 (after the data-freshness upgrade). The map is correct and current; what it lacks is *interrogation*: a scenario does not show where it happens, lists do not talk to the map, Flows is a hairball, crude trade is never drawn, and only five scenarios exist.
> **Branch:** `post-launch-ux-scenarios` → PR to `main`. Nothing is pushed to `main` without the maintainer's say-so (a push deploys production).
> **Execution:** orchestrated sub-agents. Haiku = small mechanical edits; Sonnet = research and most implementation; Opus = hard design/implementation and every review. The orchestrator merges, runs the gates, and owns this document.
> **Out of scope:** paid data, coal, AIS, extending the year slider past 2024 (BACI ends 2024, so scenarios cannot follow it — decided in the freshness plan).

## 0. Rules for every worker

1. Read `CLAUDE.md` first. Its conventions are binding (pure layer builders, symbology module, hardcoded data paths, generated catalog, append-only `LAYER_KEYS`, a11y contrast, light-only).
2. **Wave 0 runs on the shared tree: do not commit or stage; report changed files.** Wave 2+ workers run in their **own git worktree** and commit there in small commits with explanatory bodies; the orchestrator merges.
3. In a worktree: `pnpm install --frozen-lockfile`; Python work also needs `uv sync` and `ln -s /Users/narendranag/ai/_projects/global-energy-map/data data` if `data/` is absent (raw inputs are gitignored).
4. Gates a worker must pass before reporting: `pnpm lint`, `pnpm typecheck`, `pnpm test`; Python work adds `uv run ruff check`, `uv run ruff format --check`, `uv run python -m pytest tests/python`. **Workers do not run Playwright** (one port, CPU-bound); they write/adjust specs and the orchestrator runs e2e at each wave boundary.
5. Any change under `public/data/` goes through `uv run python -m scripts.build_all` (or `--only <step>` + `--from build_catalog`) so the catalog hash moves with the bytes, and must be byte-identical on rerun.
6. **Every number written into code or docs is verified against its source or the data first.** Scenario shares carry a citation per row (`source_title`/`source_url`/`source_year`/`source_note`); a share no document supports is marked `UNSOURCED`, never invented.
7. Research uses Tavily (`TAVILY_API_KEY` in `~/.config/secrets.env`; `POST https://api.tavily.com/search`, Bearer auth). Prefer primary sources (EIA, IEA, operator reports, ENTSOG, Eurostat) over news; record URL + publication year + the exact sentence or table the figure came from.
8. If what the site collects or loads changes (new host, storage key), update `docs/legal/privacy.md` in the same change.

## 1. Workstreams

### Wave 0 — fixes (shared tree, parallel, disjoint files)

| ID | What | Files | Worker |
|---|---|---|---|
| F1 | **Comtrade completeness.** A month counts as *reported* if the reporter filed **either** HS code that month (Comtrade has no zero rows, so a sporadic LNG importer with no cargo in a month is indistinguishable from a non-reporter today; measured after the fix: 6 LNG and 9 crude importers incl. USA were mis-flagged — the orchestrator's first estimate of 25 counted every incomplete LNG importer, most of which really are missing filings). `monthsReported` → months reported; add `monthsWithImports` for the tooltip. If a reporter files only one code, fall back to today's behaviour. Tests first. | `src/lib/data/recent-imports.ts`, `src/components/layers/RecentImportsChoropleth.tsx` (tooltip wording only), `tests/unit/data/recent-imports.test.ts`, `docs/methodology.md` (the paragraph describing the rule) | Sonnet |
| F2 | `engine.ts` uses `LNG_T3_FIRST_YEAR`/`LNG_T3_LAST_YEAR` instead of literal 2020/2024 (move the constants to `types.ts` if the import would be circular). | `src/lib/scenarios/engine.ts` (+ `types.ts`/`registry.ts` only for the move) | Haiku |
| F3 | **Intro card yields to deep links.** Do not auto-show when the initial URL carries any explicit state param (`scenario`, `layers`, `year`, `commodity`, `lon/lat/z`); a bare `/` or `?mode=` only still shows it. Keep the reopen affordance. Adjust e2e that relies on the card. | `src/components/ui/IntroCard.tsx`, affected `tests/e2e/*.spec.ts` | Haiku |
| F4 | Importer ranking defaults to **Volume**; Share stays one click away. | `src/components/scenarios/ScenarioPanel.tsx` (default only), e2e expectations | Haiku |

### Wave 1 — research (parallel with Wave 0; writes only new files under `docs/superpowers/research/`)

| ID | Question | Output | Worker |
|---|---|---|---|
| R1 | **Chokepoint shares**: Bab el-Mandeb, Suez + SUMED, Malacca, Turkish Straits, Danish Straits, Panama — for crude and (where it matters) LNG. These are **direction-dependent** (Saudi crude to Europe crosses Bab el-Mandeb; to Asia it does not), so shares are per *(exporter, importer region)*, not per exporter. Deliver: region definitions as ISO3 lists, a share table with a citation per row, marker lon/lat per chokepoint, and known BACI gaps per scenario. | `research/chokepoints.md` | Sonnet |
| R2 | **Oil pipeline shares**: ESPO (incl. Kozmino vs Daqing spur), Kirkuk–Ceyhan (note the 2023–25 shutdown), Saudi East–West (a *bypass*: model as Hormuz mitigation or its own cut?), Keystone + Enbridge Mainline (CAN→USA). Per exporter→importer pair, cited; plus the GEM `pipeline_id`s in `public/data/pipelines.geojson` that make up each route, for highlighting. Same id lookup for the existing Druzhba/BTC/CPC. | `research/oil-pipelines.md` | Sonnet |
| R3 | **Pipeline gas**: is BACI HS 271121 usable? Measure in the local BACI archive: share of rows with null/implausible `qty`, compare 3–4 known flows (RUS→DEU 2021, NOR→DEU, DZA→ITA, RUS→TUR) with ENTSOG/Eurostat/EI figures. If unusable, name the best free redistributable alternative. Then the scenario list (Ukraine transit, TurkStream, Nord Stream [historical], Yamal, TransMed/Medgaz, Norway→EU) with cited pair shares, and a recommendation on the commodity axis: third axis `pipeline_gas`, or gas = LNG + pipe. | `research/pipeline-gas.md` | Opus |
| R4 | **PMTiles + query console feasibility.** PMTiles: deck.gl `MVTLayer`/maplibre source options under `MapboxOverlay` interleaved, build tooling (tippecanoe is *not* installed), effect on tooltips, vintage filter, scenario highlighting and the e2e pixel probes; expected byte saving vs the 8 MB GeoJSON. Console: what `src/lib/duckdb/` already gives, which files may be queried (view-only vs downloadable licence!), how to keep it off `/`'s load path (`tests/e2e/network.spec.ts`). | `research/pmtiles-and-console.md` | Sonnet |
| RV | Verify R1/R2/R3 figures: re-open every cited URL, confirm the number and that it means what the note says. Flag anything off by unit, year, or direction. | appended `## Verification` sections | Opus |

**Maintainer gate:** new scenario shares are an editorial decision (precedent: the 2026-09-10 share corrections were approved one by one). The verified tables go to the maintainer before they reach `main`.

### Wave 2a — foundation (one worker, lands before 2b)

| ID | What | Worker |
|---|---|---|
| S0 | **Selection + camera seam.** `AppState.focus: string \| null` (ISO3; URL `focus=`), store/URL encode+decode with tests; `MapShell` gains `onPick` (country click → focus) and an imperative `flyTo(bounds \| point)` exposed through the store or a ref; a `countryBounds(iso3)` helper over `countries.geojson`. No visible feature yet beyond a focused-country outline. Everything in 2b builds on this instead of inventing its own. | Opus |

### Wave 2b — features (parallel, one worktree each)

| ID | What | Main files | Worker |
|---|---|---|---|
| S1 | **Scenario on the map.** Chokepoint marker / highlighted cut pipeline (ids from R2), camera fits the affected importers *clear of the panel*, ranked rows ↔ map: hover highlights, click sets `focus` and flies. | `scenarios/overlay.ts`, `ScenarioPanel.tsx`, `registry.ts` (`location`, `pipelineIds`), symbology | Opus |
| S2 | **Trade flows layer.** BACI crude + LNG country-pair arcs, width = volume, top-N with a stated cutoff; with `focus` set, only that country's flows (imports and exports distinguished). Flows mode defaults to the latest BACI year and to this layer; LNG voyages stay available. Full new-layer checklist (see the freshness handoff). | new `TradeFlowsLayer.tsx`, `lib/data/trade-flows.ts`, `modes/`, layer plumbing | Sonnet |
| S3 | **Country panel.** Opens on `focus`: reserves, production, top suppliers/customers, exposure under each scenario, inline SVG sparklines over 1990–2024 (no chart lib), source lines from the catalog, CSV of what is shown. Sparklines reused in tooltips only if cheap. | new `components/country/*`, `lib/data/country-profile.ts` | Opus |
| S4 | **Search.** Header combobox over countries, pipelines, terminals, refineries (names from already-loaded data; lazy-load the rest on first keystroke); Enter flies + sets `focus` for countries. a11y: ARIA combobox pattern, axe clean. | new `components/search/*`, `Header.tsx` | Sonnet |
| S5 | **Scenario engine extensions (pure functions + tests only, no UI).** `severity` (0–1 multiplier), exporter-side impact (`byExporter`), combined scenarios (union of routes, max share per pair, never double-counted), importer-wide wildcard for inbound Hormuz exposure. | `src/lib/scenarios/*`, `tests/unit/scenarios/*` | Opus |
| S6 | **New scenario data** from R1/R2 (after RV): region-expanded pair rows in `build_disruption_routing.py`, `ScenarioId` + registry entries, integrity tests, generated methodology tables. | `scripts/transform/build_disruption_routing.py`, `registry.ts`, `types.ts`, `public/data/` | Sonnet |
| S7 | **Embed mode.** `?embed=1`: no header/intro/footer chrome beyond a one-line attribution + "open full map" link; panels collapsed. Document the iframe snippet on `/data`. | `page.tsx`, url-state, docs | Sonnet |
| S8 | **Scheduled refresh.** `scripts/refresh/monthly.sh` (GIE, Comtrade, STEO ingests → `build_all` → pytest → opens a PR branch, never pushes `main`), a launchd plist template, logging + health check after the `calendars` precedent. **Files and instructions only — the worker does not load the agent.** | `scripts/refresh/*`, `docs/refresh.md` | Haiku → Sonnet review |

### Wave 3 — depends on Wave 2

| ID | What | Worker |
|---|---|---|
| T1 | Panel UI for S5: severity slider, importer/exporter toggle, second-scenario picker; URL params (`sev`, `scenario=a+b`); CSV + citation header follow. | Sonnet |
| T2 | Pipeline-gas trade + scenarios, as R3 recommends (skipped with a written reason if R3 says the data cannot carry it). | Opus |
| T3 | Tie-ins: EU gas-storage days-of-cover beside Hormuz-LNG results; "Recent imports" as an optional, clearly labelled, view-only baseline. | Sonnet |
| T4 | Query console at `/query` per R4 (downloadable files only; DuckDB stays off `/`). | Opus |
| T5 | Pipelines as PMTiles per R4 — **only if R4 shows a clear win**; needs `brew install tippecanoe` (maintainer's machine, so ask). | Sonnet |
| T6 | Announcement draft (`docs/announce/`), built on the example questions. Draft only; nothing is posted. | Sonnet |

## 2. Gates (orchestrator)

After each wave: merge worktrees one at a time → `pnpm lint && pnpm typecheck && pnpm test` → pytest → **Opus code review of the merged diff** (correctness first; conventions second) → fixes → full `pnpm test:e2e` → update this plan's status table. `build_all` rerun must be byte-identical whenever `public/data/` moved.

Merge order inside 2b (least → most shared-file contact): S5, S8, S6, S2, S4, S7, S3, S1.

## 3. Status

| ID | Status | Notes |
|---|---|---|
| F1–F4 | done 2026-09-19 | F1 incomplete importers: oil 37 → 28, gas 27 → 21 |
| R4 | done 2026-09-19 | PMTiles: **not now** — 8.11 MB raw is 1.25 MB brotli, paid once per data version; tiles would not beat it at world view, and the pip-only GDAL writer is not byte-identical on rerun. Console: go; duckdb module still passes its 24 tests; export gated on every FROM/JOIN table being downloadable; the core-version fallback can reach extensions.duckdb.org and needs its own network guard |
| R1 + RV | done 2026-09-19 | Verifier: 21 confirmed, 9 wrong, 6 misapplied, 4 unverifiable. **Ship** Malacca crude + QAT LNG (Gulf→East Asia implies 9.77 mb/d vs EIA 9.96), Suez crude at 1.00, Suez/Bab LNG (QAT), Bab crude with **SAU = 0** (Saudi crude to Europe loads at Yanbu, north of the strait), Turkish Straits as KAZ 0.80 + share-0 pairs BGR/ROU/CHN. **Hold** Danish Straits, every Russia wildcard, Panama. Headline flows must use 1H25/4Q25, not 2Q26 (Hormuz closure 28 Feb–7 Apr 2026 per EIA STEO/CRS) |
| R2 + RV | done 2026-09-19 | Verifier: 7 confirmed, 1 wrong, 4 misapplied, 2 unverifiable. **Ship** Keystone 0.14 (CER), Enbridge Mainline **0.60** (CER 58% of all exports → CAN→USA basis; CAPP's 0.74 was crude+NGL incl. Eastern Canada and exceeded BACI's total), ESPO Daqing spur only RUS→CHN 0.28. **Hold** Saudi East–West (a flat exporter share is wrong for every importer: Yanbu serves Europe, Asia loads in the Gulf), Kirkuk–Ceyhan (needs `activeYears`, and must move the shipped Hormuz IRQ 0.90 → 0.87 in the same commit — maintainer's call), ESPO 0.85 (a 2026 wartime figure spanning three routes). Sudan is in the data after all (P0537 Greater Nile) |
| R3 + RV | done 2026-09-19; verifier: 59 confirmed, 11 wrong, 13 misapplied. **T2 is HELD for the maintainer** — Eurostat has the same hub re-declaration defect as BACI (DEU 2023: NLD 17.65 + BEL 14.92 of 65.1 bcm), Austria reports 100% "not specified" (AT←RU = 0), MD←RU is 27× under the transit figure, PL←NO = 0; a Ukraine-transit scenario would show Slovakia and Italy but not Austria or Moldova. Defensible rows exist (SVK 1.00, CZE 2021 1.00, Medgaz 0.574 / MEG 0.426, Norway four-country split) but the feature needs year-aware shares + a `historical` pipeline status first. Licence: CC BY 4.0 holds via data.europa.eu tags; a derived file needs Eurostat's non-responsibility disclaimer. Original R3 summary follows. | BACI HS 271121 **unusable**: RUS→DEU and RUS→TUR are zero in every year, hub re-exports double count, quantities are value-imputed. **Eurostat `nrg_ti_gas`** (CC BY 4.0, bilateral, 1990–2024, DE←RU 2021 = 55.4 bcm) carries European scenarios; no free source for China or CAN→USA pairs. Prerequisites for T2: year-aware route shares, a `historical` pipeline status (Nord Stream, Yamal, Soyuz are filtered out of pipelines.geojson), entry-point vs destination basis. Recommends per-scenario `gasMode`, bcm native. Time-sensitive: archive Bruegel's legacy `route_data` zip to R2 |
| S8 | merged 2026-09-19 | Haiku draft, Sonnet rewrite (runs in a disposable worktree, never the maintainer's checkout), orchestrator fixed bash-3.2 `mapfile` + data/raw symlink tripping the change guard. **Not installed** — loading the plist is the maintainer's call; first real run is untested end to end (no ingests/push/PR were run) |
| S5 | merged 2026-09-19 | Combined scenarios report a **range**: max(a,b) ≤ cut ≤ min(1,a+b) (series vs parallel routes; headline = lower bound). Precedence: exact pair (incl. 0) > max(exporter-wide, importer-wide). Old results pinned by a regression fixture. T1 must also move `explain.ts` and `panel-model.ts` onto `resolveScenarioShare`; inbound rows need a nullable `exporter_iso3` in the parquet + loader |
| S0 | merged 2026-09-19 | API: `AppState.focus`, `useCamera().fitCountry/request`, `panelPadding`, `countryFromPick`, `buildFocusLayer`, `countryBounds`. Modes keep focus; a click selects but does not move the camera; cased (halo + line) outline because no single colour clears 3:1 on both Positron land and full-exposure red |
| S6 | merged 2026-09-19 — **shares await maintainer approval before `main`** | 7 scenarios from the verifiers' ship lists only: malacca (+lng), suez (+lng), bab_el_mandeb (+lng), turkish_straits, keystone, enbridge_mainline, espo_spur. disruption_route 72 → 525 rows, duplicate-key guard. BACI reconciliation: Malacca Gulf→East Asia 9.69 mb/d 2024 vs EIA 9.96; Suez 1.93; Bab 0.63. `routeKeyFor` generalised to `<id>_lng`. No shipped share changed |
| S7 | merged 2026-09-19; 3 of 8 e2e specs failing, fix in progress | `embed`/`controls` are view flags outside AppState, preserved across the store's URL rewrites; `frame-ancestors *` on `/` only |
| S1–S4 | in progress (workers may now run e2e on a private `E2E_PORT`) | |
| T5 | dropped | per R4 |
| T4 | done 2026-09-19 | `/query`: DuckDB-WASM lazy on that route only; tables generated from the catalog + a build-time schema sidecar; export gated on every FROM/JOIN/`read_parquet()` table being `downloadable`, decided from `json_serialize_sql()`'s parse tree; `?q=` base64url via `replaceState`; 6 verified example queries. Closed the `extensions.duckdb.org` fallback (the repository is now always same-origin, a version mismatch fails loudly) and self-hosted the `json` extension, without which the gate refused everything |
| T6 | done 2026-09-19 | drafts in `docs/announce/`; must acknowledge the 2026 Hormuz closure before publishing |
| T2 | held | see R3 + RV |
| T1, T3 | pending (after S1) | |
