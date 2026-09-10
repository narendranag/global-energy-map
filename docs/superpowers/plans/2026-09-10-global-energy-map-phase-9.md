# Phase 9 — Product redesign (implementation plan)

> **Spec:** `docs/superpowers/specs/2026-09-10-refactor-redesign-review.md` §4 and §5 Phase 9 (items 9.1–9.8), plus user decisions in §6 (light-only; phones get a banner; go public after Phase 9 with downloads limited to CC BY / public-domain subsets; keep DuckDB).
> **Branch:** `phase-9-product` → PR to `main`.
> **Goal:** a researcher who lands cold understands what the map can answer within ten seconds, gets a number out of it, knows where the number came from, and can cite or export what they see.
> **Design direction (decided):** light, editorial, restrained. One hue family per commodity (oil warm, gas cool), lightness/shape per asset kind, a sequential reserves ramp that collides with neither, red reserved for scenario exposure. Type ≥ 11 px everywhere; Geist; panels as quiet cards.

## Execution model

Wave 1 = four parallel implementer agents on **disjoint file sets** (no commits, no staging; orchestrator commits per item). Wave 2 = accessibility + e2e (sequential). Then integration.

| Wave | Track | Items | Owner files (exclusive) |
|---|---|---|---|
| 1 | **A — IA & shell** | 9.1, 9.7 | `src/app/page.tsx`, `src/components/ui/**` (except `ShareMenu`), `src/components/layers/LayerPanel.tsx`, `src/lib/state/**`, `src/lib/url-state/**`, new `src/lib/modes/**`, their unit tests |
| 1 | **B — Visual system & time** | 9.2, 9.3 | `src/lib/symbology/**`, `src/components/layers/*Layer*.tsx` + `ExtractionPoints.tsx` + `ReservesChoropleth.tsx` + `useMapLayers.ts` + `tooltip(s).ts`, `src/components/layers/Legend.tsx`, `src/components/time-slider/**`, `src/app/globals.css`, `src/app/layout.tsx`, their unit tests |
| 1 | **C — Methodology, Data, cite, export** | 9.4, 9.5 | `src/app/about/**` → `src/app/methodology/**`, new `src/app/data/**`, `next.config.ts` (redirect `/about` → `/methodology`), new `src/lib/export/**`, new `src/components/share/**`, `docs/methodology.md`, new `docs/history.md`, `docs/data-sources.md`, `CITATION.cff`, `scripts/transform/build_catalog.py` + `public/data/catalog.json` (only to add a `downloadable` flag), their tests |
| 1 | **D — Scenario panel v2** | 9.6 | `src/components/scenarios/**`, `src/lib/scenarios/registry.ts`, `src/lib/data/scenario-inputs.ts`, their tests |
| 2 | **E — Accessibility + e2e** | 9.8 + e2e | all UI files for a11y fixes (sequential, after wave 1 lands), `tests/e2e/**`, `@axe-core/playwright` dev dep |
| — | **Integration** | — | orchestrator |

### Contracts between wave-1 tracks

- **Modes (A) → layers (B):** A owns `AppState.mode` (`"infrastructure" | "flows" | "scenarios"`, URL param `mode`) and the per-mode default `LayerState`. B does not read `mode`; B reads `layers`, `year`, `commodity`, and the map **zoom** from the store (`useMapView()` exported by A from `src/lib/state/` — A must export it; B may import it).
- **Header slot (A) ← ShareMenu (C):** C exports `<ShareMenu scenario={ScenarioResult | null} />` from `src/components/share/ShareMenu.tsx`; it reads everything else (layers, year, commodity, view, URL) from the store itself. A mounts it in the header. Until C lands, A mounts nothing there (render conditionally behind an import that exists — coordinate by C creating a stub file first thing).
- **Scenario panel (D) placement (A):** A decides where `<ScenarioPanel>` sits and when it shows (Scenarios mode, or any mode when `scenario !== null`); D owns its contents. Props stay `{ active, onChange, commodity, result }`.
- **Legend (B) placement (A):** A decides where `<Legend>` mounts (currently inside LayerPanel); B owns its contents and props.
- **Time-aware badges:** B exports `TIME_AWARE: Record<keyof LayerState, "yes" | "partial" | "no">` (+ coverage %) from symbology; A renders the badges in LayerPanel.

---

## Track A — IA & shell (9.1, 9.7)

**A1. Modes.** Header gets three tabs: **Infrastructure** (what exists, when), **Flows** (LNG voyages, 2020–2024), **Scenarios** (disruptions). Selecting a mode applies its preset (layers, commodity where relevant, year where relevant — e.g. Flows → gas, 2023, voyages + LNG terminals + gas pipelines; Scenarios → opens the scenario panel with the picker focused) and records `mode` in the URL. Presets are a starting point: the user can still toggle any layer under a **"Layers"** disclosure (collapsed by default in Flows/Scenarios, expanded in Infrastructure). Unknown/missing `mode` → Infrastructure. Old URLs without `mode` keep working exactly as encoded (layers from URL win over presets).
- **Default view (D1):** Infrastructure with ≤ 5 layers: reserves, oil pipelines, gas pipelines, refineries, LNG terminals. Extraction, basins, storage, ports off by default.
- Pure preset logic in `src/lib/modes/` with unit tests (preset application, URL precedence).

**A2. Header + intro.** Replace TitleBar with a compact header bar across the top (name, one-line subtitle, mode tabs, `ShareMenu` slot, "Methodology" and "Data" links). Panels move below it — no overlap at ≥ 1024 px. A dismissible first-run **IntroCard** (3 bullets: hover for sources; slide through time; pick a disruption) with 3–4 **example questions** as chips that set URL state, e.g. "How exposed is Central Europe to a Druzhba cut? (2022)", "Who loses most if Hormuz closes? (2024, crude)", "Where did Qatar's LNG go in 2023?", "Which pipelines existed in 1995?". Dismissal remembered in `localStorage` (try/catch). Loading pill moves into the header.

**A3. Phone banner (9.7).** < 768 px: a slim "Best viewed on a desktop — the map is pannable, panels are collapsed" banner; panels collapse to their headers; slider fits the width; no horizontal scroll at 400 px.

**Done:** lint/typecheck/unit pass; manual browser check at 1440, 1024, 768, 400 px.

---

## Track B — Visual system & time (9.2, 9.3)

**B1. Palette + glyphs (symbology).** Oil = warm family (pipelines deep amber/brown; refineries amber; extraction burnt orange; storage muted tan), gas = cool family (pipelines teal; LNG terminals cyan triangles; voyages cool gradient), reserves = neutral-to-olive/green sequential (log, already) that collides with neither, basins = hatch-like low-alpha outline, ports = slate; red only for scenario exposure. Validate contrast of every mark on the Positron basemap and against each other (write a tiny script or unit test computing ΔE / contrast between key pairs). In-construction = same hue, lighter + dashed where deck supports (`PathStyleExtension`) else lower alpha.

**B2. Zoom-aware sizing and gating.** Glyph radii scale with zoom (smaller at z≤3). Storage and ports render only at z ≥ 4 (layer `visible` from `useMapView().zoom`), with the Legend row showing "visible from zoom 4" when gated. Extraction sites fade in at z ≥ 3 if still noisy.

**B3. Legend + type.** Legend restyled as a quiet card; ≥ 11 px text; swatches match marks exactly; grouped by commodity. `globals.css`: type scale + tokens (panel bg, border, text, muted), Geist applied; remove any remaining 10 px text in B-owned files.

**B4. Time controls (9.3).** YearSlider: decade ticks + labels, ±1 buttons, keyboard (←/→, Home/End), a play/pause control (1 year per ~700 ms, stops at 2024, pauses on interaction). Show "Reserves: 2020 value" note (exists). Export `TIME_AWARE` for A's badges (pipelines partial 71 %, extraction partial 22 %, LNG terminals 98 %, voyages yes 2020–2024, reserves yes to 2020, refineries/storage/ports/basins no).

**Done:** lint/typecheck/unit pass; symbology tests updated; browser screenshots of default, gas, scenario views.

---

## Track C — Methodology, Data, cite, export (9.4, 9.5)

**C1. `/methodology` (was `/about`).** Rewrite `docs/methodology.md` as a **current-state** document: one section per layer and per scenario (source, as-of, coverage %, units, known gaps, how the scenario uses it, the frozen-2020 reserves note, LNG-T3 partial-coverage finding, refinery dedup rule, scenario share citations table generated from `disruption_route.parquet` at build time). Move the phase-by-phase narrative verbatim to `docs/history.md` (linked). `/about` redirects to `/methodology` (permanent) in `next.config.ts`. Proper document typography, table of contents, back-to-map link, "How to cite" block (APA + BibTeX generated from `CITATION.cff`), required attribution lines verbatim (GEM CC BY 4.0, LNG-T3 CC BY 4.0, OSM ODbL, CARTO no longer — OpenFreeMap/OpenMapTiles).

**C2. `/data`.** One row per catalog entry: label, source + link, licence, as-of, rows, size, sha256 (truncated, copyable), layers, and a **Download** link only for entries with `downloadable: true` (add the flag in `build_catalog.py`: true for CC BY 4.0 and public-domain sources — GEM, LNG-T3, NETL, Natural Earth, disruption_route (our own); false for EI (redistribution restricted) and BACI (academic-use terms) and anything containing OSM rows — i.e. `assets.parquet` is **not** downloadable as-is because it mixes 88 ODbL rows; note it and offer nothing rather than a mislabeled file). Explain each non-downloadable entry in one line.

**C3. Share / cite / export (9.5).** `ShareMenu` in the header:
- **Copy link** (current URL incl. view) with confirmation.
- **Cite this view**: APA + BibTeX for the site (from CITATION.cff) plus the view URL and the as-of dates of the sources behind the visible layers; copy buttons.
- **Download**: scenario table CSV when a scenario is active (derived analysis; header lines cite BACI/EIA/IEA sources and the share citations); visible-layer rows as CSV/GeoJSON **only** for downloadable sources (disable with a reason otherwise — e.g. reserves (EI) and refineries (mixed NETL+OSM) are view-only). Serialise client-side from rows already in memory (no new network calls); `src/lib/export/` pure functions with unit tests (CSV quoting, GeoJSON shape, citation text).
- C creates `src/components/share/ShareMenu.tsx` as a stub **first**, so A can mount it.

**Done:** lint/typecheck/unit pass; `/methodology`, `/data` render; `/about` redirects; downloads work in the browser.

---

## Track D — Scenario panel v2 (9.6)

- Metric definition stays inline at the top; add a one-line "How this is computed" disclosure (BACI bilateral imports × route share; refinery/terminal attribution rule; LNG-T3 scaling for 2020–2024).
- **Per-row provenance:** expose `source_title`, `source_url`, `source_year`, `source_note` from `disruption_route.parquet` through `scenario-inputs.ts`; the panel lists the route shares used by the active scenario (exporter → importer, share, source link, note on hover/expand), flags "Analyst estimate (unsourced)" rows visibly.
- Importer rows: name, share, and volume at risk (kb/d or Mt) — sort by share (exists) with a toggle to sort by volume.
- **"Why 0 %?"**: when the user hovers/clicks a country with no exposure, the country tooltip / panel explains (no imports in BACI for that year / imports exist but none via this route / country is the exporter).
- Asset rows keep names + capacity at risk (Phase 7); add a "show all" expander (top 6 by default).
- Gas scenario: LNG-T3 coverage note per terminal (measured vs capacity-proxy) is visible in the list.
- Keep engine untouched.

**Done:** lint/typecheck/unit pass; browser check of Hormuz (oil, gas), Druzhba, BTC, CPC.

---

## Wave 2 — Track E (accessibility + e2e)

- **a11y (9.8):** every control has an accessible name (checkbox labels via `htmlFor`/`id`), logical focus order (header → panels → map), visible focus rings, Escape closes menus/intro, `aria-live="polite"` on scenario results and the loading pill, contrast ≥ 4.5:1 for text (check panel text on `bg-white/90` over dark map areas), map region labelled. Add `@axe-core/playwright` and an axe scan of `/`, `/methodology`, `/data` with zero serious/critical violations.
- **e2e:** new `modes.spec.ts` (tabs apply presets; URL `mode`; old URLs still work), `share.spec.ts` (copy link, cite text, CSV download event for scenario table), `data.spec.ts` (`/data` downloads only for downloadable entries; `/about` → `/methodology` redirect), update existing specs for the new default layer set and header; phone banner at 400 px.

## Integration

Full suite + build + e2e; browser check at 1440/1024/400 px of every mode, a scenario, share/cite/export, methodology/data; update `CLAUDE.md` (modes, header, share/export conventions, downloadable flag, routes) and README; PR; merge on user OK.

## Risks / open questions to surface, not decide silently

- **Scenario CSV and BACI terms:** the scenario table is derived analysis over BACI; plan treats it as downloadable with citations. If the user reads CEPII's terms more strictly, gate it.
- **`assets.parquet` is not downloadable** because of the 88 ODbL OSM refinery rows; a separate CC-BY/PD extract (GEM + NETL + LNG-T3 subsets) could be added in Phase 10 if wanted.
- **Mode presets vs. URL precedence** must never silently change what a shared URL shows.
