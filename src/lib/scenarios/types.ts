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
}

export interface LngImportImpact {
  readonly asset_id: string;
  readonly iso3: string;
  readonly capacity: number;
  readonly atRiskQty: number;
  readonly shareAtRisk: number;
  readonly topSources: readonly { iso3: string; qty: number }[];
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
