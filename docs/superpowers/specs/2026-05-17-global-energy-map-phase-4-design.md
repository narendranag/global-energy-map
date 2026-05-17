# Phase 4 — USGS Basin Polygons + Shareable URL State

> Status: approved 2026-05-17 (rescoped same day after data-availability probe). Builds on Phase 3 (gas + LNG + Hormuz-LNG, shipped 2026-05-16).
>
> Phase 1 spec: `docs/superpowers/specs/2026-05-15-global-energy-map-design.md`
> Phase 2 spec: `docs/superpowers/specs/2026-05-15-global-energy-map-phase-2-design.md`
> Phase 3 spec: `docs/superpowers/specs/2026-05-16-global-energy-map-phase-3-design.md`

## Context

The original Phase 4 brainstorm targeted distribution (refined-product pipelines + storage hubs) plus URL state. A pre-plan data probe surfaced that two of those three axes lack the public data the spec assumed:

- **Refined-product pipelines**: GEM Oil Infrastructure Tracker only tags `Fuel ∈ {Oil, NGL, Oil+NGL, NGL+oil-products(8 rows), Oil+NGL+naphtha(1 row)}`. No clean refined-product layer to extract.
- **Storage hubs**: GEM has no dedicated Oil Storage Tracker. JODI Oil is country-level only; OSM coverage is wildly incomplete; site-level globally is paid (Vortexa/OilX).

Rather than ship a thin or speculative layer, Phase 4 was rescoped to swap distribution for **USGS World Petroleum Assessment basin polygons** — listed as the `basin` table in the project's original schema but never ingested. The data is public-domain (US government), reliably available, and analytically complementary to the existing reserves choropleth and extraction points (basins show *where the petroleum-bearing geology actually is*, not just where countries with reserves are).

Phase 4 thus ships:
1. **USGS basin polygons** — new GeoParquet layer, new map layer, populates the long-empty `basin` slot in the schema
2. **Shareable URL state** — year + commodity + scenario + visible layers in the querystring, with `router.replace` on every change so the URL bar always reflects the current view

Tanker tracking, LNG carriers, refined products, and storage are all deferred to a later phase (4.5 or absorbed into Phase 5) where each can be approached with a confirmed data source rather than an optimistic assumption.

## Locked Decisions

| Axis | Decision |
|---|---|
| Slice scope | USGS basin polygons + shareable URL state |
| Refined-product pipelines | **Deferred** — no clean public per-pipeline data source identified |
| Storage hubs | **Deferred** — no public site-level data; country-level JODI is a different shape (would be a `country_year_series` metric, not a map layer) |
| Tankers / AIS / LNG carriers | **Deferred** — separate slice with its own AIS-source decision |
| Basin source | USGS World Petroleum Assessment — public domain (US gov) |
| Basin geometry | Polygon (GeoParquet). Render as semi-transparent fill UNDER point/line layers. |
| Basin coloring | By basin type (oil-bearing / gas-bearing / mixed) if the source tags it; else single muted hue. Implementer probes during ingest. |
| Basin layer position in z-order | Above country choropleth, below extraction/refinery/pipeline/LNG layers |
| URL state scope | All UI state — year + commodity + scenario + visible layers (now including basins) |
| URL state sync | `router.replace` on every change — URL bar always reflects current view, no browser-history pollution |
| URL state defaults | Missing/invalid params fall back to current defaults and don't propagate back to the URL on first interaction |
| Scope of slice | One bundled PR — consistent with Phases 1–3 |
| Layer panel after Phase 4 | 7 toggles (6 existing + basins). No group headers yet; revisit when count exceeds 8. |

## Data Model Extensions

```
basins.parquet                       (NEW — GeoParquet, polygons)
  basin_id (str)         USGS-assigned identifier
  name (str)             human-readable basin name
  basin_type (str|null)  oil / gas / mixed / unknown (from USGS, normalized)
  region (str|null)      USGS-assigned region grouping
  geometry (Polygon | MultiPolygon)
  source (str)           "USGS World Petroleum Assessment"
  source_version (str)   filename of the downloaded shapefile/zip

catalog.json
  + usgs_basins entry (Public domain)
```

**No changes** to `country_year_series`, `trade_flow`, `disruption_route`, `assets.parquet`, `pipelines.parquet`, or any scenario engine code.

The `basin` table was always part of the project's original schema (`docs/superpowers/specs/2026-05-15-global-energy-map-design.md` lines 96-113); Phase 4 finally populates it.

## URL State Encoding

```
?year=2020
&commodity=gas
&scenario=hormuz
&layers=reserves,extraction,gas_pipelines,lng_terminals,basins
```

**Read:** on initial page load, parse `searchParams`; missing or invalid params fall back to current defaults (year=2020, commodity="oil", scenario=null, layers={all toggles on, including basins}).

**Write:** every state-changing handler calls `router.replace(buildQuerystring(state), { scroll: false })`. No browser history pollution; back-button still works at the page level.

**Encoders are pure functions** for trivial unit testing:

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

**Forward-compat note:** if Phase 5 adds a new layer toggle, URLs bookmarked from Phase 4 will load that new layer in its default-OFF state (since the bookmark's `layers=` list won't mention it). This is intentional — URL is authoritative; the alternative would be a hidden "anything you didn't mention defaults to on" rule, which makes share-link semantics unpredictable.

## Frontend Architecture

```
src/components/
├── layers/
│   ├── BasinPolygonsLayer.tsx      (NEW — GeoJsonLayer, semi-transparent fill,
│   │                                  basin-type-aware coloring, tooltip on pick)
│   ├── LayerPanel.tsx              (extend — 1 new toggle → 7 total)
│   └── Legend.tsx                  (extend — basin swatch)
└── (existing components unchanged)

src/lib/
└── url-state/
    ├── encode.ts                   (NEW — pure functions: encodeAppState, decodeAppState)
    └── useUrlState.ts              (NEW — React hook wrapping useSearchParams + router.replace)

src/app/
└── page.tsx                        (extend — replace useState with useUrlState; mount BasinPolygonsLayer)
```

### BasinPolygonsLayer

`GeoJsonLayer` from deck.gl, fed by a sidecar `public/data/basins.geojson` (mirrors the Phase 2 pipelines pattern — DuckDB-WASM's `spatial` extension is unreliable in current builds, so we ship a GeoJSON sidecar alongside the GeoParquet for the frontend).

Visual: semi-transparent fill (`getFillColor` with alpha ~80) colored by `basin_type`:
- oil → muted amber `[180, 130, 80, 80]`
- gas → muted cyan `[80, 140, 160, 80]`
- mixed → muted purple `[140, 100, 160, 80]`
- unknown / null → muted gray `[120, 120, 120, 60]`

Stroke: thin line same hue at higher alpha (`[..., 180]`).

Z-order: above the country choropleth, below all other deck.gl layers (extraction, pipelines, refineries, LNG terminals). Mounted in the `visibleLayers` array at the position immediately after `reserves`.

Tooltip on hover: basin name, type, region.

### LayerPanel after Phase 4 (7 toggles)

```
┌─────────────────────────────────────┐
│ Layers                              │
│ ☑ Reserves        ▓▓▓░░░  (active) │
│ ☑ Basins           ▒▒▒              │
│ ☑ Extraction       ●                │
│ ☑ Oil pipelines   ━━ ┄┄             │
│ ☑ Refineries       ◆                │
│ ☑ Gas pipelines   ━━ ┄┄  (cyan)     │
│ ☑ LNG terminals    ▲ ▽              │
└─────────────────────────────────────┘
```

No group headers yet — 7 rows is still readable. Revisit at 9+.

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
- `scripts/ingest/usgs_basins.py` (new) — download USGS World Petroleum Assessment basin shapefile(s) from their downloadable-data page; cache under `data/raw/usgs_wpa/`. Idempotent with `--force`.
- `scripts/transform/build_basins.py` (new) — read the shapefile via geopandas, normalize columns to the `basins.parquet` schema, emit both `public/data/basins.parquet` (GeoParquet) and `public/data/basins.geojson` (sidecar for the frontend)

### Frontend
- `src/components/layers/BasinPolygonsLayer.tsx` (new) — `GeoJsonLayer` with basin-type-aware fill colors and tooltip
- `src/components/layers/LayerPanel.tsx` (extend — `LayerState` gains `basins: boolean`, `ROWS` gains a basin entry near the top of the list)
- `src/components/layers/Legend.tsx` (extend — basin swatch)
- `src/lib/url-state/encode.ts` (new) — pure functions
- `src/lib/url-state/useUrlState.ts` (new) — React hook
- `src/app/page.tsx` (extend — replace local `useState` calls with `useUrlState`; mount BasinPolygonsLayer; add tooltip case for `basins` layer)

### Catalog updates (`public/data/catalog.json`)
- **New**: `usgs_basins` — single USGS source, `layers: ["basins"]`, Public domain

### Tests
- `tests/unit/url-state/encode.test.ts` — round-trip encode/decode; default fallbacks for missing params; invalid-input tolerance (bad year, unknown commodity, unknown scenario, unknown layer key — each falls back to default and isn't propagated back to the URL)
- `tests/e2e/phase-4.spec.ts` — URL round-trip (load with full querystring → page state matches; flip a toggle → URL updates), basin tooltip, basin layer visibility toggle

### Docs
- `docs/methodology.md` — Phase 4 section: USGS basin source + attribution, URL state semantics, forward-compat note about new layers defaulting OFF on old bookmarks
- `CLAUDE.md` — update phase status, schema table additions for `basin` row (which was previously listed in main spec but never populated)

## Phase 4 Definition of Done

1. Map renders 7 data layers. Basin polygons render as semi-transparent fills under all point/line layers, colored by basin type (or single muted hue if USGS doesn't tag type).
2. Basin tooltip on hover shows: name, basin_type, region.
3. URL state round-trips:
   - Load `/?year=2015&commodity=gas&scenario=hormuz&layers=reserves,basins,lng_terminals` → page state matches exactly.
   - Change any control → URL updates via `router.replace` (no history entry).
   - Bad/missing params → silently fall back to defaults and don't propagate back to the URL.
4. LayerPanel has 7 toggle rows; basin toggle works independently.
5. `pnpm test` passes; new URL-state encode tests cover round-trip + invalid-input + defaults (≥6 tests).
6. `pnpm test:e2e` — phase-4 spec covers URL round-trip + basin tooltip + basin layer visibility.
7. Lint, build, deploy all clean; Lighthouse LCP < 4s still holds; no console errors.
8. Methodology page lists USGS World Petroleum Assessment (public domain attribution), URL state semantics, forward-compat caveat.

## Non-Goals (Defer)

- **Refined-product pipelines** — no public per-pipeline data source identified. Possible future paths: PHMSA (US-only, partial), EU TYNDP (EU-only), aggregating from national regulators (high effort, low ROI). Deferred until a clean source is identified.
- **Site-level oil storage hubs** — no public global source. Deferred. If a future phase wants country-level storage, JODI Oil monthly stocks would fit as a new `country_year_series` metric (different shape from "storage hubs as map points").
- **Tanker tracking + LNG carriers** — needs an AIS-source decision (TankerMap / MarineTraffic / paid historical) that deserves its own brainstorm. Deferred.
- **Port-level throughput** — UNCTAD + EIA partial coverage; no clean global source. Deferred.
- **Basin-level reserves or production attribution** — would require joining USGS basin polygons against per-country reserves via spatial assumptions. Out of scope; basins ship as display-only context this slice.
- **Collapsible layer-panel groups** — defer until panel exceeds 8 toggles.

## Open Items I'd Flag for Your Eye

1. **USGS basin source format** — USGS publishes WPA data as ESRI shapefiles in a zip. Implementer's Task 1 (ingest) needs to discover the exact download URL (likely under https://www.usgs.gov/tools/world-oil-and-gas-assessments-downloadable-data); shapefile attribute names and basin-type tagging conventions probe during transform.
2. **Basin polygon count and file size** — USGS WPA has a few hundred to ~1500 basin assessments depending on which dataset. The full geometry could push `basins.geojson` toward the multi-megabyte range. If the sidecar gets large (~10MB+), consider simplifying geometries (`gpd.geometry.simplify`) since basins are big and don't need pipeline-grade precision.
3. **`pipelines.geojson` at 70 MB** (from Phase 3) is still above GitHub's 50 MB soft warning. Phase 4 doesn't make it worse, but the Vercel-Blob migration noted in Phase 3 carryover remains a Phase 5 candidate.
4. **Z-order of the basin layer** — proposing above country choropleth but below points/lines. Implementer should sanity-check this looks right at various zoom levels (basins shouldn't visually drown the choropleth, but should be visible enough to anchor extraction-site clusters).

## Phase 3 Cleanup Carryover

Phase 3 closed cleanly. The two minor carryover items (catalog id `baci_2709` and the 70MB `pipelines.geojson`) are noted in Phase 4's Open Items above but neither blocks this slice.
