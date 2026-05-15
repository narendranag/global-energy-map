import type {
  ChokepointRouteRow,
  ImporterImpact,
  ScenarioResult,
  TradeFlowRow,
} from "./types";

export interface HormuzInput {
  readonly year: number;
  readonly tradeFlows: readonly TradeFlowRow[];
  readonly routes: readonly ChokepointRouteRow[];
}

export function computeHormuzImpact(input: HormuzInput): ScenarioResult {
  const shareByExporter = new Map<string, number>();
  for (const r of input.routes) {
    if (r.chokepoint_id === "hormuz") shareByExporter.set(r.exporter_iso3, r.share);
  }

  const totals = new Map<string, number>();
  const atRisk = new Map<string, number>();
  for (const row of input.tradeFlows) {
    // Coerce via unknown to handle BigInt values that Arrow may return for BIGINT parquet columns.
    // The TypeScript type says `number` but Apache Arrow deserialises BIGINT as BigInt at runtime.
    if ((row.year as unknown as number | bigint) != input.year) continue; // == intentional: coerces BigInt
    totals.set(row.importer_iso3, (totals.get(row.importer_iso3) ?? 0) + row.qty);
    const share = shareByExporter.get(row.exporter_iso3) ?? 0;
    if (share > 0) {
      atRisk.set(row.importer_iso3, (atRisk.get(row.importer_iso3) ?? 0) + row.qty * share);
    }
  }

  const byImporter: ImporterImpact[] = [];
  for (const [iso3, totalQty] of totals) {
    const atRiskQty = atRisk.get(iso3) ?? 0;
    byImporter.push({
      iso3,
      totalQty,
      atRiskQty,
      shareAtRisk: totalQty > 0 ? atRiskQty / totalQty : 0,
    });
  }
  const ranked = [...byImporter].sort((a, b) => b.atRiskQty - a.atRiskQty);
  return { chokepoint_id: "hormuz", year: input.year, byImporter, ranked };
}
