# Phase 2 — Crude Transport + Refining

> Status: approved 2026-05-15. Builds on Phase 1 (live at https://global-energy-map-one.vercel.app).
>
> Phase 1 spec: `docs/superpowers/specs/2026-05-15-global-energy-map-design.md`.

## Context

Phase 1 shipped the foundation — reserves, extraction sites, time-scrub, Strait of Hormuz scenario. Phase 2 adds the midstream layer (oil pipelines + refineries) and generalizes the scenario engine from "Hormuz one-off" to "registry of disruptions." Three new scenarios ship: Druzhba cut, BTC cut, CPC cut. With any scenario active, refineries restyle by feedstock-at-risk using a capacity-weighted attribution of country-level BACI imports.

## Locked Decisions

| Axis | Decision |
|---|---|
| Pipeline status scope | Operating + in-construction (solid vs dashed) |
| Scenarios shipped | Hormuz (refactored) + Druzhba + BTC + CPC |
| Refinery feedstock model | Country-proxy weighted by refinery capacity share |
| Layer controls | Top-left panel: per-layer checkbox + small legend |
| Scope of slice | All 5 components in one PR (consistent with Phase 1's bundled-slice pattern) |
| Default scenario after migration | Hormuz (Phase 1's anchor); "None" disables overlay |

## Data Model Extensions

```
asset.parquet
  + kind="refinery" rows (currently only kind="extraction_site")
    same schema; capacity in kbpd, capacity_unit="kbpd"

pipelines.parquet (new — GeoParquet)
  pipeline_id (str)          GEM Unit ID
  name (str)
  status (str)               operating | in-construction (others filtered)
  commodity (str)            crude | products (Phase 2: crude only)
  capacity_kbpd (float|null)
  start_country_iso3 (str3|null)
  end_country_iso3 (str3|null)
  operator (str|null)
  length_km (float|null)
  geom (LineString)
  source, source_version

disruption_route.parquet (replaces chokepoint_route.parquet)
  disruption_id (str)        "hormuz" | "druzhba" | "btc" | "cpc"
  kind (str)                 "chokepoint" | "pipeline"
  exporter_iso3 (str3)
  importer_iso3 (str3|null)  null = applies to all importers of this exporter
  share (float)              fraction of exporter→importer flow lost if disrupted
  source (str)
```

`chokepoint_route` → `disruption_route` so chokepoint and pipeline disruptions speak the same shape. Existing Hormuz routes become rows where `disruption_id="hormuz"`, `kind="chokepoint"`. Druzhba/BTC/CPC routes are added per public knowledge:

- **Druzhba** (RUS → BLR/POL/DEU/SVK/HUN/CZE): historical northern branch carries ~100% of Russian crude to Belarus, Poland (until 2023), Germany (until 2023), and remains the sole route to Slovakia/Hungary/Czech via the southern branch.
- **BTC** (AZE → TUR via GEO): ~100% of Azerbaijani seaborne crude exports.
- **CPC** (KAZ + RUS → Black Sea / global markets): ~80% of Kazakh crude exports; small RUS share.

Exact share values land in `scripts/transform/build_disruption_routing.py` with citations to EIA / IEA pipeline reports.

## Scenario Engine Generalization

`src/lib/scenarios/` evolves from a Hormuz-specific module to a registry-driven engine. All existing types stay; the function signature widens.

```ts
// src/lib/scenarios/registry.ts
export type ScenarioId = "hormuz" | "druzhba" | "btc" | "cpc";

export interface ScenarioDef {
  readonly id: ScenarioId;
  readonly label: string;            // "Close Strait of Hormuz"
  readonly kind: "chokepoint" | "pipeline";
  readonly description: string;      // shown in panel
  readonly noteRecentYears?: string; // e.g., Iran-suppression caveat
}

export const SCENARIOS: readonly ScenarioDef[];
```

```ts
// src/lib/scenarios/engine.ts
export interface ScenarioInput {
  readonly scenarioId: ScenarioId;
  readonly year: number;
  readonly tradeFlows: readonly TradeFlowRow[];
  readonly routes: readonly DisruptionRouteRow[];  // already filtered to this scenarioId
  readonly refineries: readonly RefineryRow[];     // optional: enables refinery impact
}

export interface ImporterImpact { iso3; totalQty; atRiskQty; shareAtRisk; }
export interface RefineryImpact { asset_id; iso3; capacity; atRiskQty; shareAtRisk; topSources; }

export interface ScenarioResult {
  readonly scenarioId: ScenarioId;
  readonly year: number;
  readonly byImporter: readonly ImporterImpact[];
  readonly rankedImporters: readonly ImporterImpact[];
  readonly byRefinery: readonly RefineryImpact[];   // new
  readonly rankedRefineries: readonly RefineryImpact[]; // new
}

export function computeScenarioImpact(input: ScenarioInput): ScenarioResult;
```

`computeHormuzImpact` is preserved as a thin wrapper around `computeScenarioImpact({scenarioId: "hormuz", ...})` so the existing 3 unit tests still apply. 3 new tests added for Druzhba/BTC/CPC fixtures.

## Refinery Feedstock Math

For each refinery `R` in country `C`, year `Y`:

```
country_total_refining = Σ(capacity of refineries in C)
refinery_capacity_share = R.capacity / country_total_refining
country_imports_from_X = BACI[Y].importer=C, exporter=X
historical_feedstock_from_X(R) = refinery_capacity_share × country_imports_from_X
```

With scenario `S` active (route_share(S, X, C) is the disrupted fraction):

```
refinery_at_risk = Σ over X: historical_feedstock_from_X(R) × route_share(S, X, C)
refinery_share_at_risk = refinery_at_risk / Σ_X historical_feedstock_from_X(R)
```

`refinery_share_at_risk` ∈ [0,1]; drives the dot color. `topSources` is the top-5 exporters by `historical_feedstock_from_X(R)`, shown in the tooltip.

Edge cases:
- Refinery whose country has zero / negligible historical crude imports (e.g., Saudi Arabia — domestic crude only) → `historical_feedstock ≈ 0`; share_at_risk = 0. Dot renders at base color. Tooltip notes "Country runs primarily domestic crude — feedstock model not informative."
  (Net-exporter heuristic: country's crude *imports* < 5% of country's refining capacity in qty terms. This catches the genuine self-suppliers; doesn't misclassify USA, which is a large *importer* of crude despite being a net product exporter.)
- Refinery in a country missing from BACI in the selected year → tooltip notes "No trade data for {year}."
- Iran-suppression caveat (BACI 2023+) — propagated to any refinery whose historical top sources include IRN.

## Frontend Architecture

```
src/components/
├── layers/
│   ├── ReservesChoropleth.tsx     (existing — overlayByIso3 already supports any scenarioId)
│   ├── ExtractionPoints.tsx       (existing)
│   ├── PipelinesLayer.tsx         (new — Deck.gl PathLayer, status-aware styling)
│   ├── RefineriesLayer.tsx        (new — ScatterplotLayer, capacity-sized, feedstock-aware coloring)
│   ├── LayerPanel.tsx             (new — top-left chrome, checkbox per layer)
│   └── Legend.tsx                 (new — small per-layer key)
└── scenarios/
    ├── ScenarioPanel.tsx          (existing — converted to scenario select + ranked panel)
    ├── useScenario.ts             (renamed from useHormuzScenario; takes scenarioId)
    └── overlay.ts                 (extracted overlay logic, now multi-result-type)

src/lib/scenarios/
├── types.ts        (extends — adds RefineryImpact, DisruptionRouteRow)
├── engine.ts       (computeScenarioImpact — generic)
├── hormuz.ts       (preserved as a thin wrapper around the generic engine, for test continuity)
├── registry.ts     (new — 4 ScenarioDef entries)
└── routes.ts       (new — DuckDB query for disruption_route filtered by scenarioId)
```

### Layer panel UX

Top-left card (mirrors scenario panel chrome): vertical stack of 4 checkboxes plus a small legend block.

```
┌───────────────────────────┐
│ Layers                    │
│ ☑ Reserves       ▓▓▓░░░  │  (color ramp swatch)
│ ☑ Extraction      ●       │  (red dot)
│ ☑ Pipelines      ━━ ┄┄    │  (operating vs in-construction)
│ ☑ Refineries      ◆       │  (blue diamond)
└───────────────────────────┘
```

State management: each layer toggle is a local boolean in `page.tsx`. No URL state in Phase 2 (defer to Phase 4 once we have shareable views).

### Scenario panel UX update

Becomes a `<select>` with `None | Close Strait of Hormuz | Cut Druzhba | Cut BTC | Cut CPC`. When non-`None`, shows two ranked lists (top importers, top refineries) plus the per-scenario caveat note.

## Files to Create / Modify

**Python ingestion + transform:**
- `scripts/ingest/gem_oil_infra.py` — downloads GEM Oil Infrastructure Tracker (pipelines + refineries)
- `scripts/transform/build_pipelines.py` — builds `public/data/pipelines.parquet`
- `scripts/transform/build_refineries.py` — appends refinery rows to `public/data/assets.parquet`
- `scripts/transform/build_disruption_routing.py` — replaces `build_chokepoint_routing.py`; emits all 4 scenarios
- `scripts/common/iso3.py` (new — extract the duplicated NAME_TO_ISO3 dicts from Phase 1's `build_country_year.py` and `build_assets.py`)

**Frontend:**
- `src/components/layers/PipelinesLayer.tsx`
- `src/components/layers/RefineriesLayer.tsx`
- `src/components/layers/LayerPanel.tsx`
- `src/components/layers/Legend.tsx`
- `src/components/scenarios/ScenarioPanel.tsx` — extend to dropdown
- `src/components/scenarios/useScenario.ts` — rename + generalize
- `src/components/scenarios/overlay.ts` — extract overlay logic
- `src/app/page.tsx` — wire all four layers, scenario select, layer panel

**Lib:**
- `src/lib/scenarios/registry.ts`
- `src/lib/scenarios/routes.ts`
- `src/lib/scenarios/types.ts` — extend
- `src/lib/scenarios/engine.ts` — extend / rename function
- `src/lib/scenarios/hormuz.ts` — keep as thin wrapper for back-compat tests

**Tests:**
- `tests/unit/scenarios/druzhba.test.ts`, `btc.test.ts`, `cpc.test.ts`
- `tests/unit/scenarios/refinery-impact.test.ts` — TDD the capacity-weighted feedstock math with a small synthetic fixture
- `tests/e2e/phase-2.spec.ts` — exercise scenario dropdown, layer toggles, pipeline visibility, refinery tooltip

**Catalog updates:**
- One new entry `gem_oil_infrastructure` covering both pipelines and refineries (single GEM XLSX source, one license, one as-of). Two `layers` entries: `["pipelines", "refineries"]`.
- Rename `chokepoint_route` entry → `disruption_route`

**Docs:**
- `docs/methodology.md` — add pipelines + refineries + refinery feedstock caveat
- `CLAUDE.md` — update phase status, add Phase 2 conventions, refresh schema table

## Phase 2 DoD

1. Map renders all 4 data layers; pipelines styled operating-solid vs in-construction-dashed; refineries distinct color, sized by capacity
2. Layer panel toggles each layer independently; legends visible and accurate
3. Scenario `<select>` shows 5 options (None + 4 scenarios); each restyles the choropleth AND refineries; ranked panels populate (top importers + top refineries)
4. Refinery tooltip shows historical top-5 sources and at-risk share (when scenario active)
5. Net-exporter refineries (USA, RUS, SAU) tooltip says "self-supplied" instead of showing zero
6. `pnpm test` — 6+ scenario unit tests pass (3 Hormuz + 3 new); refinery-impact math test passes
7. `pnpm test:e2e` — scenario select + layer toggles + refinery tooltip covered
8. Lint, build, deploy all clean
9. Methodology page lists pipelines + refineries sources, refinery feedstock caveat, and updated source list

## Open Items / Phase 2 Cleanup Carryover

Picked up from Phase 1's final review notes:

- **Extract** `NAME_TO_ISO3` into `scripts/common/iso3.py` — done as part of Phase 2 since we're adding a third ingestion script
- **Document** that catalog manifest is metadata-only — already fixed in CLAUDE.md
- **No new** lint suppressions or `as any` casts permitted; new code maintains Phase 1's TS strictness

## Non-Goals (Defer to Phase 3+)

- Natural gas pipelines + LNG terminals → Phase 3
- Refined-product pipelines and storage hubs → Phase 4
- Per-refinery actual feedstock (API gravity / contracts) — beyond the country-proxy approximation
- Shareable URL state (year + scenario + layers in querystring) → Phase 4
- Live AIS / tanker positions → Phase 4
