# Phase 4 — Distribution + Storage + URL State

> Status: approved 2026-05-17. Builds on Phase 3 (gas + LNG + Hormuz-LNG, shipped 2026-05-16).
>
> Phase 1 spec: `docs/superpowers/specs/2026-05-15-global-energy-map-design.md`
> Phase 2 spec: `docs/superpowers/specs/2026-05-15-global-energy-map-phase-2-design.md`
> Phase 3 spec: `docs/superpowers/specs/2026-05-16-global-energy-map-phase-3-design.md`

## Context

Phase 3 completed the upstream + midstream picture for gas and brought the scenario engine to multi-commodity. Phase 4 fills in the downstream and adds the first major UI-affordance the project has needed since Phase 1: shareable URL state so analysts can link to a specific view.

The original Phase 4 sketch in the main spec (`Phase 4 — Distribution + storage + tankers (re-evaluate AIS)`) bundled six candidate axes once Phase 2 + 3 carryovers were folded in (refined products, storage, ports, tankers, LNG carriers, URL state). That was materially larger than Phases 2 or 3. Phase 4 deliberately narrows to a **tight three-axis distribution slice** and pushes tanker/AIS work to a separate later slice (4.5 or absorbed into Phase 5) where the AIS-source decision can land independently.

The new layers ride on top of the existing engine without extending it — products live in `pipelines.parquet` alongside crude and gas, storage hubs live in `assets.parquet` alongside refineries and LNG terminals. The scenario engine is untouched.

## Locked Decisions

| Axis | Decision |
|---|---|
| Slice scope | Refined-product pipelines + crude/product storage hubs + shareable URL state |
| Tankers/AIS | **Deferred to Phase 4.5 or Phase 5** — needs an AIS-source decision (TankerMap / MarineTraffic / paid historical) that shouldn't block distribution work |
| LNG carriers | Deferred with tankers (same AIS pipeline) |
| Product pipeline granularity | Single `commodity="products"` value — no gasoline/diesel/jet split |
| Storage participation | **Display-only**: capacity tooltip, no scenario coloring. No provenance data exists to attribute "which barrels in this tank came from where." |
| URL state scope | All UI state — year + commodity + scenario + visible layers |
| URL state sync | `router.replace` on every change — URL bar always reflects current view, no browser-history pollution |
| Scope of slice | One bundled PR — consistent with Phases 1–3 |
| Product pipeline color | Amber `[200, 130, 30]` — distinct from oil's navy and gas's cyan |
| Storage hub glyph | Square (filled), capacity-sized |
| LayerPanel UX at 8 toggles | Add subdued group headers (Oil / Gas) — no collapse, no scroll |

## Data Model Extensions

```
pipelines.parquet
  + commodity="products" rows from GEM Oil Infrastructure Tracker
  (same XLSX/GeoJSON already downloaded for Phase 2)
  capacity_unit = "kbpd" (same as crude)
  Extraction strategy: extend the existing _load_oil_pipelines() commodity
  classification to recognize refined-product fuel labels in the GEM data
  (gasoline, diesel, jet, products, refined). Anything not crude/NGL and
  not gas → "products". Multi-product pipelines also → "products".

assets.parquet
  + kind="storage" rows from GEM Global Oil Storage Tracker
  capacity_unit = "mmbbl" (million barrels — GEM-native unit for storage)
  Filter: operating + in-construction (mirror Phase 2 refinery convention)
  Columns reused from existing schema: asset_id, kind, name, country_iso3,
  lon, lat, capacity, capacity_unit, operator, status, commissioned_year,
  decommissioned_year, source, source_version

catalog.json
  + gem_oil_storage entry (CC BY 4.0)
  Modify gem_oil_infrastructure entry: layers list gains "products_pipelines"
```

**No changes** to `country_year_series`, `trade_flow`, `disruption_route`. Scenario engine (`src/lib/scenarios/`) is untouched.

## URL State Encoding

```
?year=2020
&commodity=gas
&scenario=hormuz
&layers=reserves,extraction,gas_pipelines,lng_terminals,storage
```

**Read:** on initial page load, parse `searchParams`; missing or invalid params fall back to current defaults (year=2020, commodity="oil", scenario=null, layers={all toggles on}).

**Write:** every state-changing handler calls `router.replace(buildQuerystring(state), { scroll: false })`. No browser history pollution; back-button still works at the page level.

**Encoders are pure functions** so they're trivially unit-testable:

```ts
// src/lib/url-state/encode.ts
export interface AppState {
  readonly year: number;
  readonly commodity: Commodity;
  readonly scenario: ScenarioId | null;
  readonly layers: LayerState;
}

export function encodeAppState(s: AppState): string;
export function decodeAppState(params: URLSearchParams, defaults: AppState): AppState;
```

**Defaults policy:** any invalid value falls back to default and is dropped from the URL (so a malformed share-link self-cleans on first interaction).

**Forward-compat note:** if Phase 5 adds a 9th layer toggle, URLs bookmarked from Phase 4 will load that 9th layer in its default-OFF state (since the bookmark's `layers=` list won't mention it). This is intentional — URL is authoritative; the alternative would be a hidden "anything you didn't mention defaults to on" rule which makes share-link semantics unpredictable.

## Frontend Architecture

```
src/components/
├── layers/
│   ├── PipelinesLayer.tsx          (extend — accept commodityFilter="products"; amber color)
│   ├── StorageLayer.tsx            (NEW — ScatterplotLayer, square markers, capacity-sized)
│   ├── LayerPanel.tsx              (extend — 2 new toggles + Oil/Gas group headers)
│   └── Legend.tsx                  (extend — amber line + storage square swatches)
└── (existing components unchanged)

src/lib/
└── url-state/
    ├── encode.ts                   (NEW — pure functions: encodeAppState, decodeAppState)
    └── useUrlState.ts              (NEW — React hook wrapping useSearchParams + router.replace)

src/app/
└── page.tsx                        (extend — replace useState with useUrlState; mount StorageLayer)
```

### LayerPanel after Phase 4 (8 toggles)

```
┌─────────────────────────────────────┐
│ Layers                              │
│ ☑ Reserves        ▓▓▓░░░  (active) │
│ ☑ Extraction       ●                │
│ ── Oil ─────────────────────────── │
│ ☑ Oil pipelines   ━━ ┄┄             │
│ ☑ Refineries       ◆                │
│ ☑ Storage hubs     ■                │
│ ☑ Product pipelines ━━ ┄┄ (amber)   │
│ ── Gas ─────────────────────────── │
│ ☑ Gas pipelines   ━━ ┄┄  (cyan)     │
│ ☑ LNG terminals    ▲ ▽              │
└─────────────────────────────────────┘
```

Group headers are subdued (small uppercase divider rows with no checkbox). No collapse; no scroll at 8 rows.

### StorageLayer

Mirrors `LngTerminalsLayer.tsx` pattern (IconLayer with inline SVG atlas) since deck.gl's ScatterplotLayer renders circles only and we want a distinct square glyph for storage. Single filled-square icon in the atlas, sized by `sqrt(capacity_mmbbl)`, tinted amber-brown `[170, 100, 40]` to associate with the oil family but distinct from refineries (blue diamond) and product pipelines (amber line). `mask: true` on the icon mapping so `getColor` controls the tint at runtime.

### URL state hook contract

```ts
// src/lib/url-state/useUrlState.ts
export function useUrlState(defaults: AppState): [
  AppState,
  (next: Partial<AppState>) => void,
];
```

The setter takes a partial state and merges with current. Internally:
1. Compute next full state
2. Encode to querystring
3. Call `router.replace(`?${qs}`, { scroll: false })`
4. Local React state is derived from `useSearchParams()` so no manual state mirror is needed

## Files to Create / Modify

### Python ingestion + transform
- `scripts/ingest/gem_oil_storage.py` (new) — mirror `scripts/ingest/gem_gas_infra.py` pattern; first probe the GEM landing page, then try the maps-config.js CDN trick that worked for GGIT, then fall back to Wayback CDX
- `scripts/transform/build_pipelines.py` (extend) — `_load_oil_pipelines()` recognizes refined-product fuel labels and emits them with `commodity="products"`. Probe the actual `fuel`/`commodity` column values in the raw data to enumerate which labels to classify as products vs crude vs NGL.
- `scripts/transform/build_storage.py` (new) — append `kind="storage"` rows to `assets.parquet`. Idempotent (drop prior `kind="storage"` rows before appending).

### Frontend
- `src/components/layers/StorageLayer.tsx` (new)
- `src/components/layers/PipelinesLayer.tsx` (extend — amber color branch for `commodityFilter === "products"`)
- `src/components/layers/LayerPanel.tsx` (extend — 2 new toggles + group headers)
- `src/components/layers/Legend.tsx` (extend — 2 new swatches)
- `src/lib/url-state/encode.ts` (new)
- `src/lib/url-state/useUrlState.ts` (new)
- `src/app/page.tsx` (extend — wire useUrlState, add storage layer + products pipeline layer, extend getTooltip for storage)

### Catalog updates (`public/data/catalog.json`)
- **New**: `gem_oil_storage` — single GEM source, `layers: ["storage"]`, CC BY 4.0
- **Extend**: `gem_oil_infrastructure` — `layers` gains `"products_pipelines"`

### Tests
- `tests/unit/url-state/encode.test.ts` — round-trip encode/decode; default fallbacks for missing params; invalid-input tolerance (bad year, unknown commodity, unknown scenario, unknown layer key — each falls back to default and isn't propagated)
- `tests/e2e/phase-4.spec.ts` — URL round-trip (load with full querystring → page state matches; flip a toggle → URL updates), storage tooltip, product pipeline visibility, layer panel group headers render

### Docs
- `docs/methodology.md` — Phase 4 section: GEM oil storage source + attribution, refined-products extraction note (single commodity), URL state semantics
- `CLAUDE.md` — update phase status; schema table additions for `kind="storage"` and pipeline `commodity="products"`

## Phase 4 Definition of Done

1. Map renders 8 data layers. Product pipelines styled in amber (distinct from oil's navy and gas's cyan). Storage hubs rendered as capacity-sized squares.
2. LayerPanel has 8 toggle rows with two subdued group headers ("Oil" / "Gas"). All toggles work independently.
3. URL state round-trips:
   - Load `?year=2015&commodity=gas&scenario=hormuz&layers=reserves,lng_terminals` → page state matches exactly.
   - Change any control → URL updates via `router.replace` (no history entry).
   - Bad/missing params → silently fall back to defaults and don't propagate to the URL.
4. Storage tooltip shows: name, country, capacity (mmbbl), operator, status.
5. `pnpm test` passes; new URL-state encode tests cover round-trip + invalid-input + defaults (≥6 tests).
6. `pnpm test:e2e` — phase-4 spec covers URL round-trip + storage tooltip + product pipeline visibility + group header presence.
7. Lint, build, deploy all clean; Lighthouse LCP < 4s still holds; no console errors.
8. Methodology page lists GEM Oil Storage Tracker (CC BY 4.0 attribution), refined-products extraction note, URL state semantics.

## Non-Goals (Defer)

- **Tanker tracking + LNG carriers** — Phase 4.5 (or merged with Phase 5). The decision blocking this slice is AIS sourcing: TankerMap free vs MarineTraffic free tier vs paid historical. Each has different cost, latency, and coverage tradeoffs that deserve their own brainstorm.
- **Port-level throughput** — deferred until a clean public data source is identified. EIA + UNCTAD have partial coverage but inconsistent. Possible Phase 5 add or absorbed into the tanker slice.
- **Storage participating in scenarios** (days-of-cover overlay; importer-dependence highlight) — analytical depth would require provenance data we don't have.
- **Refined-product trade scenarios** (e.g., a refining-bottleneck scenario) — out of scope; would need product trade flows (BACI HS 27.10) and a different impact model.
- **Collapsible layer-panel groups** — held until Phase 5 if the panel grows past ~10 toggles.

## Open Items I'd Flag for Your Eye

1. **Storage tracker URL discovery** — implementer's Task 1 (Phase 4 ingest) will need to probe whether GEM ships an oil-storage CDN URL via a maps-config.js similar to GGIT. If the storage tracker is gated behind the Supabase token form, fallback is Wayback CDX (same pattern as Phase 2 oil-infra). Either path should work; the probe is fast.
2. **Refined-product fuel labels in GEM** — the implementer needs to probe what fuel values actually appear in the GEM Oil Infrastructure Tracker rows beyond `crude` / `ngl` / `crude+ngl`. The build_pipelines.py extension should be data-driven (read what's there), not hardcoded to my guesses (`gasoline`, `diesel`, `jet`, `products`).
3. **8-toggle LayerPanel density** — group headers help, but if it visually crowds the panel chrome too much, the implementer should flag it and we can revisit (e.g., reduce row spacing or fold reserves+extraction under an "Upstream" header).
4. **URL state and bookmark forward-compat** — Phase 5 layer additions will load OFF on Phase 4 bookmarks. Intentional, but worth a one-line caveat in the methodology page so analysts aren't surprised.

## Phase 3 Cleanup Carryover

Phase 3 closed cleanly. Two minor items noted in PR #3's review that don't need fixing here but worth surfacing:

- **Catalog id `baci_2709`** still has its 4-digit name despite now holding both HS 2709 + 271111 rows. Harmless static key; rename would just churn the catalog without functional benefit. Leave.
- **`pipelines.geojson` is 70 MB** (above GitHub's 50 MB soft warning) after Phase 3 added gas pipelines. Adding refined products in Phase 4 will push it further. Recommended Phase 4 follow-up: investigate moving the GeoJSON sidecar to Vercel Blob per CLAUDE.md's hosting note. Tracked as Phase 4 open item — but not a blocker for shipping the layer work itself.
