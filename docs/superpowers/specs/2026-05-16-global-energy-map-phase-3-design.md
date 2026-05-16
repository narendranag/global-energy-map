# Phase 3 — Natural gas + LNG

> Status: approved 2026-05-16. Builds on Phase 2 (oil pipelines + refineries + 4-scenario registry) on top of Phase 1's foundation. Live: https://global-energy-map-one.vercel.app
>
> Phase 1 spec: `docs/superpowers/specs/2026-05-15-global-energy-map-design.md`
> Phase 2 spec: `docs/superpowers/specs/2026-05-15-global-energy-map-phase-2-design.md`

## Context

Phase 1 shipped the foundation (reserves + extraction + time-scrub + Hormuz). Phase 2 added the oil midstream (pipelines + refineries) and generalized the scenario engine from a Hormuz one-off into a 4-scenario registry, with refinery feedstock attribution turning refineries into first-class scenario participants.

Phase 3 brings the gas system online — gas pipelines, LNG export and import terminals, gas trade flows — and pushes the engine one more axis: from single-commodity to multi-commodity. The anchor scenario is **Hormuz extended to LNG**: the same chokepoint, now interrogated against HS 271111 (LNG) trade flows, with LNG import terminals ranked by exposure to Qatari supply the way Phase 2 ranked European refineries against Russian crude.

This is a deliberate scope choice: gas-pipeline cuts (Nord Stream, TurkStream) are mechanically similar to Druzhba/BTC/CPC and add layer rows but not new analytical shape. Hormuz-LNG forces the engine to handle a commodity parameter and the LNG terminal to grow a feedstock model — both new shapes. Pipeline-cut gas scenarios become trivial to add once the commodity-aware engine lands.

LNG carriers (the ships) are deferred to Phase 4 alongside the oil tanker re-evaluation, consistent with the Phase 1 "AIS deferred" decision.

## Locked Decisions

| Axis | Decision |
|---|---|
| LNG carriers | Deferred to Phase 4 (joins oil tanker work) |
| Scenarios shipped | **Hormuz extended to LNG** only. Gas-pipeline cuts (Nord Stream, TurkStream) deferred. |
| Choropleth scope | Add **Oil/Gas commodity toggle** (reserves only — no metric toggle yet) |
| LNG terminal impact | LNG **import** terminals get supply-share attribution. Export-side modeling deferred. |
| Scope of slice | All components in one PR — consistent with Phase 1/2 bundled-slice pattern |
| Gas trade flow source | BACI HS 271111 (LNG specifically). Overrides the main spec's older "Comtrade" hint to match the BACI 2709 precedent. |
| Pipeline capacity units | Per-row `capacity_unit` column (gas in `bcm/y` or `mcfd`, oil stays `kbpd`) — preserves precision rather than normalizing to BOE |
| LNG export/import in panel | Single "LNG terminals" toggle with two symbols (filled = export, hollow = import) |
| Gas pipeline color | Cyan/teal, contrasting with oil's amber/red — palette tuned for color-blind safety in implementation |

## Data Model Extensions

```
assets.parquet
  + kind="lng_export" rows                  (Mtpa capacity)
  + kind="lng_import" rows                  (Mtpa capacity)
  same schema as Phase 2's refinery rows; capacity_unit="mtpa"

pipelines.parquet
  + commodity="gas" rows                    (column already declared in Phase 2)
  + capacity_unit (str) column added        ("kbpd" for crude/products; "bcm/y" or "mcfd" for gas)
  status (operating | in-construction) and dashed-stroke convention unchanged

country_year_series.parquet
  no schema change
  newly surfaced:
    metric="proved_reserves_gas"            (Tcm)
    metric="production_gas"                 (bcm/y) — emitted but not required by Phase 3 UI
  Both already produced by Phase 1's ei_statistical_review.py — verify and route to the choropleth.

trade_flow.parquet
  + hs_code="271111" rows from BACI         (LNG specifically)
  hs_code column already supports multi-HS

disruption_route.parquet
  no schema change — Hormuz rows are commodity-agnostic
  ScenarioDef.commodities controls which HS codes the engine pulls
```

The disruption-route shape was already commodity-free in Phase 2; we keep it that way. Multi-commodity is expressed at the scenario-definition level (which HS codes a scenario consumes), not at the route level. Adding TurkStream later would just be more rows with `kind="pipeline"` and a new `ScenarioDef` entry.

## Scenario Engine: Commodity-Aware

```ts
// src/lib/scenarios/types.ts
export type Commodity = "oil" | "gas";

export interface ScenarioDef {
  readonly id: ScenarioId;
  readonly label: string;
  readonly kind: "chokepoint" | "pipeline";
  readonly commodities: readonly Commodity[];  // NEW — Hormuz: ["oil","gas"], others: ["oil"]
  readonly description: string;
  readonly noteRecentYears?: string;
}

export interface LngImportRow {
  readonly asset_id: string;
  readonly country_iso3: string;
  readonly capacity: number;                   // Mtpa; 0 → uniform-within-country fallback
}

export interface LngImportImpact {
  readonly asset_id: string;
  readonly iso3: string;
  readonly capacity: number;                   // Mtpa
  readonly atRiskQty: number;
  readonly shareAtRisk: number;
  readonly topSources: readonly { iso3: string; qty: number }[];
}

export interface ScenarioInput {
  readonly scenarioId: ScenarioId;
  readonly commodity: Commodity;               // NEW
  readonly year: number;
  readonly tradeFlows: readonly TradeFlowRow[]; // pre-filtered to (year, commodity HS code)
  readonly routes: readonly DisruptionRouteRow[];
  readonly refineries?: readonly RefineryRow[];    // populated when commodity="oil"
  readonly lngImports?: readonly LngImportRow[];   // populated when commodity="gas"
}

export interface ScenarioResult {
  readonly scenarioId: ScenarioId;
  readonly commodity: Commodity;
  readonly year: number;
  readonly byImporter: readonly ImporterImpact[];
  readonly rankedImporters: readonly ImporterImpact[];
  readonly byRefinery: readonly RefineryImpact[];          // empty when commodity="gas"
  readonly rankedRefineries: readonly RefineryImpact[];
  readonly byLngImport: readonly LngImportImpact[];        // empty when commodity="oil"
  readonly rankedLngImports: readonly LngImportImpact[];
}

export function computeScenarioImpact(input: ScenarioInput): ScenarioResult;
```

`computeHormuzImpact` (Phase 1) and the existing Phase 2 wrappers stay as back-compat shims that call `computeScenarioImpact({commodity: "oil", ...})` — all existing unit tests continue to pass untouched.

### LNG import math

Mirrors Phase 2's refinery feedstock math. For each LNG import terminal `T` in country `C`, year `Y`:

```
country_total_regas         = Σ(capacity of LNG import terminals in C)
terminal_capacity_share     = T.capacity / country_total_regas
country_lng_imports_from_X  = BACI[271111, Y].importer=C, exporter=X
historical_lng_from_X(T)    = terminal_capacity_share × country_lng_imports_from_X
```

With Hormuz active under commodity=gas (`route_share(hormuz, X, C)` from the same disruption_route rows used by oil):

```
terminal_at_risk            = Σ over X: historical_lng_from_X(T) × route_share(hormuz, X, C)
terminal_share_at_risk      = terminal_at_risk / Σ_X historical_lng_from_X(T)
```

`terminal_share_at_risk ∈ [0,1]`; drives the symbol color. `topSources` is the top-5 exporters by `historical_lng_from_X(T)`, shown in the tooltip when commodity=gas and scenario active.

### Edge cases

- **Country with no LNG terminals** (pipeline-gas-only — most of CEE pre-2022): no terminal-level row; country still appears in the country-level ranked list against HS 271111 (will often be near zero).
- **Terminal with no capacity tagged in GEM**: fallback to uniform-within-country share, identical to the Phase 2 refinery fallback. Tooltip flags this as "capacity unknown, estimated by country share."
- **Country with negligible LNG imports** (e.g., the US is a net LNG exporter): `historical_lng ≈ 0`; `share_at_risk = 0`. Tooltip notes "Country has minimal LNG imports — terminal exposure not informative."
- **Iran-suppression caveat (BACI 2023+)**: Iran does negligible LNG export, so this caveat barely applies to HS 271111 in practice. Noted in `/about` for completeness; no per-terminal annotation needed.

## Frontend Architecture

```
src/components/
├── layers/
│   ├── ReservesChoropleth.tsx        (extend — commodity prop drives metric selection)
│   ├── ExtractionPoints.tsx          (existing — unchanged)
│   ├── PipelinesLayer.tsx            (extend — filter by commodity; gas rows get distinct color)
│   ├── RefineriesLayer.tsx           (existing — unchanged)
│   ├── LngTerminalsLayer.tsx         (NEW — ScatterplotLayer/IconLayer;
│   │                                  filled triangle = export, hollow = import; capacity-sized)
│   ├── LayerPanel.tsx                (extend — add Gas Pipelines + LNG Terminals toggles)
│   └── Legend.tsx                    (extend — commodity-aware swatches and units)
├── ui/
│   └── CommoditySelector.tsx         (NEW — Oil | Gas pill toggle, top chrome near year slider)
└── scenarios/
    ├── ScenarioPanel.tsx             (extend — under (commodity=gas, scenario=hormuz)
    │                                  render LNG import ranked list in place of refineries)
    ├── useScenario.ts                (extend — takes commodity, threads through engine call)
    └── overlay.ts                    (extend — choropleth restyling already commodity-agnostic
                                       at the byImporter level; verify)
```

### Layer panel after Phase 3 (6 toggles)

```
┌─────────────────────────────────────┐
│ Layers                              │
│ ☑ Reserves        ▓▓▓░░░  (active) │
│ ☑ Extraction       ●                │
│ ☑ Oil pipelines   ━━ ┄┄             │
│ ☑ Refineries       ◆                │
│ ☑ Gas pipelines   ━━ ┄┄  (cyan)     │
│ ☑ LNG terminals    ▲ ▽   (exp/imp)  │
└─────────────────────────────────────┘
```

### Commodity selector

A compact two-button group (Oil | Gas) placed in the top chrome near the year slider. When commodity changes:
- `ReservesChoropleth` re-queries with `metric="proved_reserves_oil"` vs `"proved_reserves_gas"`
- `Legend` swatch updates with units (Bbbl → Tcm)
- Scenario engine input is rebuilt with the new commodity → trade flows refiltered → ranked panel re-renders
- Layer toggles are unaffected (gas pipelines stay visible if you want gas infra on while looking at the oil choropleth — they're independent axes)

### State management

Local `useState` in `page.tsx` adds:
- `commodity: Commodity` (default `"oil"` to preserve current first-load behavior)
- Two new layer-toggle booleans (`gasPipelinesOn`, `lngTerminalsOn`)

No URL state in Phase 3 — still deferred to Phase 4 per Phase 2's decision.

## Files to Create / Modify

### Python ingestion + transform
- `scripts/ingest/gem_gas_infra.py` (new) — GEM Global Gas Infrastructure Tracker (single XLSX, covers gas pipelines + LNG terminals); attribution noted in catalog
- `scripts/ingest/baci_2711.py` (new) — fetch HS 271111 from BACI; could be implemented as an extension of `baci_2709.py` to multi-HS instead — implementer's choice during plan stage
- `scripts/transform/build_gas_pipelines.py` (new) — appends gas LineString rows to `pipelines.parquet` with `commodity="gas"` and `capacity_unit` populated
- `scripts/transform/build_lng_terminals.py` (new) — appends `kind="lng_export"` and `kind="lng_import"` rows to `assets.parquet`
- `scripts/transform/build_trade_flow.py` (extend) — multi-HS support; emit HS 271111 rows alongside HS 2709
- `scripts/transform/build_country_year.py` (verify) — `proved_reserves_gas` should already be emitted by Phase 1's EI ingestion; if not, add it
- `scripts/transform/build_disruption_routing.py` (no change) — Hormuz rows stay commodity-agnostic
- `scripts/transform/build_pipelines.py` (extend) — add `capacity_unit` column on existing oil rows during the next rebuild (set `"kbpd"`)

### Frontend
- `src/components/layers/LngTerminalsLayer.tsx` (new)
- `src/components/ui/CommoditySelector.tsx` (new)
- `src/components/layers/PipelinesLayer.tsx` (extend — commodity prop + filter + color)
- `src/components/layers/ReservesChoropleth.tsx` (extend — commodity-aware metric query)
- `src/components/layers/LayerPanel.tsx` (extend — 2 new toggles)
- `src/components/layers/Legend.tsx` (extend — commodity-aware swatch + units)
- `src/components/scenarios/ScenarioPanel.tsx` (extend — LNG ranked list under gas+hormuz)
- `src/components/scenarios/useScenario.ts` (extend — commodity param)
- `src/app/page.tsx` (wire commodity state, 2 new layer toggles)

### Lib
- `src/lib/scenarios/types.ts` — add `Commodity`, `LngImportRow`, `LngImportImpact`; extend `ScenarioDef` (`commodities`), `ScenarioInput` (`commodity`, `lngImports?`), `ScenarioResult` (`byLngImport`, `rankedLngImports`)
- `src/lib/scenarios/engine.ts` — commodity-aware filtering and dispatch to refinery vs LNG impact math
- `src/lib/scenarios/registry.ts` — Hormuz gains `commodities: ["oil","gas"]`; others `["oil"]`
- `src/lib/scenarios/lng.ts` (new) — LNG-specific impact math (mirrors structure of refinery.ts)
- `src/lib/scenarios/hormuz.ts` (no change) — back-compat shim continues to work

### Tests
- `tests/unit/scenarios/lng-impact.test.ts` — TDD: capacity-weighted LNG import math with a small synthetic fixture (uniform fallback, top-sources ordering, share_at_risk = 0 for net-exporter case)
- `tests/unit/scenarios/hormuz-gas.test.ts` — Hormuz under commodity=gas, validates country-level and terminal-level ranking against fixture trade flows
- `tests/e2e/phase-3.spec.ts` — commodity toggle visible, gas pipeline layer renders, LNG terminal tooltip populates, Hormuz-LNG ranked panel shows LNG terminals when commodity=gas
- All existing 6+ scenario tests should pass untouched (Phase 1 Hormuz + Phase 2 Druzhba/BTC/CPC + refinery-impact)

### Catalog updates (`public/data/catalog.json`)
- **New**: `gem_gas_infrastructure` — single GEM source; `layers: ["gas_pipelines", "lng_terminals"]`; CC BY 4.0; as_of from the tracker release
- **Extend**: `baci_2709` — relabel to "BACI crude + LNG bilateral trade (HS 2709 + 271111)"; `layers` gains `"scenario:hormuz-lng"`
- **Extend**: `ei_country_year` — `layers` gains `"reserves:gas"`

### Docs
- `docs/methodology.md` — new section for gas pipelines + LNG terminals; BACI HS-code clarification (271111 = LNG, 271121 = pipeline gas, why we use 271111 specifically for Hormuz-LNG); LNG terminal attribution caveat (mirrors refinery caveat language); GEM gas tracker attribution
- `CLAUDE.md` — bump Phase 3 to in-progress at start; flip to shipped + update Phase status table on merge; refresh schema table to include `lng_export`/`lng_import` kinds and `commodity="gas"` pipeline rows

## Phase 3 Definition of Done

1. Map renders 6 data layers. Gas pipelines styled distinctly from oil pipelines (different color, same operating/in-construction dash convention). LNG terminals distinguish export vs import via symbol.
2. Oil/Gas commodity toggle restyles the reserves choropleth between oil and gas; legend updates with correct units (Bbbl for oil, Tcm for gas).
3. Hormuz scenario, when active with commodity=Gas, ranks LNG import terminals by exposure to Qatari (and other Gulf) supply; country-level ranked list also updates against HS 271111.
4. LNG terminal tooltip: always shows name, country, capacity, kind (export/import). When scenario active and commodity=gas, also shows top-5 supply origins and at-risk share.
5. Layer panel toggles each layer independently; legends accurate for the active commodity.
6. `pnpm test` — 8+ scenario unit tests pass (existing 6 + LNG-impact + Hormuz-gas).
7. `pnpm test:e2e` — commodity toggle + gas pipeline visibility + LNG tooltip + Hormuz-LNG ranked panel covered.
8. Lint, build, deploy all clean; Lighthouse LCP < 4s on broadband; no console errors in production.
9. Methodology page lists GEM gas tracker, BACI 271111, LNG attribution caveat, gas reserves units, and the HS-code rationale.

## Non-Goals (Defer)

- **LNG carriers / live AIS** — Phase 4 (joins oil tanker re-evaluation)
- **Nord Stream, TurkStream, Power of Siberia pipeline-cut scenarios** — engine becomes commodity-aware here; the rows are a small Phase 3.5 once we're confident; explicitly out of this slice
- **Pipeline gas cuts via HS 271121 attribution** — defer with the pipeline-cut scenarios above
- **Per-terminal contracted offtake data** (e.g., GIIGNL contract-level data) — beyond the country-proxy approximation
- **LNG export terminal supply-share attribution** (export-side scenario participation) — deferred until a scenario actually exercises the export side
- **Production metric toggle** (oil/gas × reserves/production) — Phase 4 alongside shareable URL state
- **Bivariate or stacked choropleth** showing oil + gas simultaneously — rejected; reads poorly at country scale

## Phase 2 Cleanup Carryover (none expected)

Phase 2 closed cleanly per its own DoD. Phase 3 should not need to revisit Phase 2 code beyond the listed extensions. If implementation surfaces lingering issues (e.g., duplicated query helpers between refineries and LNG terminals), fold the cleanup into the relevant Phase 3 file rather than deferring.
