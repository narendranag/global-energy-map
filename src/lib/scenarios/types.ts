export type ScenarioId = "hormuz" | "druzhba" | "btc" | "cpc";

export type Commodity = "oil" | "gas";

export interface TradeFlowRow {
  readonly year: number;
  readonly importer_iso3: string;
  readonly exporter_iso3: string;
  readonly qty: number;
}

/** Generalizes Phase 1's ChokepointRouteRow. */
export interface DisruptionRouteRow {
  readonly disruption_id: ScenarioId;
  readonly kind: "chokepoint" | "pipeline";
  readonly exporter_iso3: string;
  /** null = applies to all importers of this exporter */
  readonly importer_iso3: string | null;
  readonly share: number;
}

/** Back-compat alias used by Phase 1's hormuz.ts wrapper. */
export type ChokepointRouteRow = DisruptionRouteRow;

export interface RefineryRow {
  readonly asset_id: string;
  readonly country_iso3: string;
  /** kbpd. May be 0 when OSM doesn't tag capacity — engine falls back to uniform-within-country. */
  readonly capacity: number;
}

export interface LngImportRow {
  readonly asset_id: string;
  readonly country_iso3: string;
  /** Mtpa. May be 0 when GEM doesn't tag capacity — engine falls back to uniform-within-country. */
  readonly capacity: number;
  /** Terminal name — matched exactly against LngVoyageRow.to_terminal. */
  readonly name: string;
}

/** Phase 6: LNG-T3 voyage row used for per-terminal disaggregation. */
export interface LngVoyageRow {
  readonly start_date: string;  // ISO date (YYYY-MM-DD)
  readonly end_date: string;
  readonly imo: number;
  readonly voyage_type: "export" | "return";
  readonly from_terminal: string;
  readonly to_terminal: string;
  readonly from_country_iso3: string;
  readonly to_country_iso3: string;
  /**
   * `amount_cbm` is BIGINT in lng_voyage.parquet, and Apache Arrow
   * deserialises BIGINT as a JS BigInt — so at runtime this really can be a
   * bigint, not a number. The type says so on purpose: summing a bigint
   * against a number accumulator throws "Cannot mix BigInt and other types",
   * and every consumer must coerce with `Number()` first. (engine.ts works
   * around the same hazard for `TradeFlowRow.year` with its `!=` comparison.)
   */
  readonly amount_cbm: number | bigint;
  readonly confidence_score: number;  // 1-5
}

/** Phase 6: LNG-T3 daily country-pair trade row. */
export interface LngTradeDailyRow {
  readonly date: string;  // ISO date
  readonly type: "arrival" | "departure";
  readonly from_country_iso3: string;
  readonly to_country_iso3: string;
  readonly amount_cbm: number;
  readonly confidence_score: number;
}

export interface LngImportImpact {
  readonly asset_id: string;
  readonly iso3: string;
  readonly capacity: number;
  readonly name: string;
  readonly atRiskQty: number;
  readonly shareAtRisk: number;
  readonly topSources: readonly { iso3: string; qty: number }[];
  /** Phase 6: which engine path produced this impact. */
  readonly dataSource: "baci" | "lng-t3";
  /**
   * Phase 6: how this impact was derived.
   *  - "measured": voyage data covers this terminal directly (LNG-T3)
   *  - "capacity-proxy": BACI country total spread by terminal capacity (Phase 3 path)
   *  - "none": terminal's country has voyage coverage, but this specific
   *    terminal received zero qualifying voyages — quantities are zero, not
   *    a real reading.
   */
  readonly coverage: "measured" | "capacity-proxy" | "none";
}

export interface ImporterImpact {
  readonly iso3: string;
  readonly totalQty: number;
  readonly atRiskQty: number;
  readonly shareAtRisk: number;
}

export interface RefineryImpact {
  readonly asset_id: string;
  readonly iso3: string;
  /** Display name; attached by the useScenario hook from assets.parquet (the engine does not need it). */
  readonly name?: string;
  readonly capacity: number;
  readonly atRiskQty: number;
  readonly shareAtRisk: number;
  readonly topSources: readonly { iso3: string; qty: number }[];
}

export interface ScenarioResult {
  readonly scenarioId: ScenarioId;
  readonly commodity: Commodity;
  readonly year: number;
  readonly byImporter: readonly ImporterImpact[];
  readonly rankedImporters: readonly ImporterImpact[];
  readonly byRefinery: readonly RefineryImpact[];
  readonly rankedRefineries: readonly RefineryImpact[];
  readonly byLngImport: readonly LngImportImpact[];
  readonly rankedLngImports: readonly LngImportImpact[];
  /** Back-compat shims for Phase 1's ScenarioPanel — kept. */
  readonly chokepoint_id?: string;
  readonly ranked?: readonly ImporterImpact[];
}
