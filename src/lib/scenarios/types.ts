export interface TradeFlowRow {
  readonly year: number;
  readonly importer_iso3: string;
  readonly exporter_iso3: string;
  readonly qty: number;
}

export interface ChokepointRouteRow {
  readonly chokepoint_id: string;
  readonly exporter_iso3: string;
  readonly share: number;
}

export interface ImporterImpact {
  readonly iso3: string;
  readonly totalQty: number;
  readonly atRiskQty: number;
  readonly shareAtRisk: number;
}

export interface ScenarioResult {
  readonly chokepoint_id: string;
  readonly year: number;
  readonly byImporter: readonly ImporterImpact[];
  readonly ranked: readonly ImporterImpact[];
}
