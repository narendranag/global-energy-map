import type {
  DisruptionRouteRow,
  ImporterImpact,
  RefineryImpact,
  RefineryRow,
  ScenarioId,
  ScenarioResult,
  TradeFlowRow,
} from "./types";

export * from "./types";

export interface ScenarioInput {
  readonly scenarioId: ScenarioId;
  readonly year: number;
  readonly tradeFlows: readonly TradeFlowRow[];
  readonly routes: readonly DisruptionRouteRow[];
  readonly refineries?: readonly RefineryRow[];
}

interface SrcQty {
  readonly iso3: string;
  readonly qty: number;
}

export function computeScenarioImpact(input: ScenarioInput): ScenarioResult {
  // Filter routes to this scenario only
  const scenarioRoutes = input.routes.filter((r) => r.disruption_id === input.scenarioId);

  // Two share lookups: per-pair (exporter, importer) and per-exporter (importer=null wildcard)
  const sharePerPair = new Map<string, number>();
  const sharePerExporter = new Map<string, number>();
  for (const r of scenarioRoutes) {
    if (r.importer_iso3 === null) {
      sharePerExporter.set(r.exporter_iso3, r.share);
    } else {
      sharePerPair.set(`${r.exporter_iso3}→${r.importer_iso3}`, r.share);
    }
  }
  const lookupShare = (exporter: string, importer: string): number => {
    return sharePerPair.get(`${exporter}→${importer}`) ?? sharePerExporter.get(exporter) ?? 0;
  };

  // Per-importer pass + remember flow rows for refinery view
  const totals = new Map<string, number>();
  const atRisk = new Map<string, number>();
  const flowsByImporter = new Map<string, SrcQty[]>();
  for (const row of input.tradeFlows) {
    // Coerce via unknown to handle BigInt values that Arrow may return for BIGINT parquet columns.
    // The TypeScript type says `number` but Apache Arrow deserialises BIGINT as BigInt at runtime.
    if ((row.year as unknown as number | bigint) != input.year) continue; // == intentional: coerces BigInt
    totals.set(row.importer_iso3, (totals.get(row.importer_iso3) ?? 0) + row.qty);
    const share = lookupShare(row.exporter_iso3, row.importer_iso3);
    if (share > 0) {
      atRisk.set(row.importer_iso3, (atRisk.get(row.importer_iso3) ?? 0) + row.qty * share);
    }
    const list = flowsByImporter.get(row.importer_iso3) ?? [];
    list.push({ iso3: row.exporter_iso3, qty: row.qty });
    flowsByImporter.set(row.importer_iso3, list);
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
  const rankedImporters = [...byImporter].sort((a, b) => b.atRiskQty - a.atRiskQty);

  // Refinery view (only if refineries provided)
  const byRefinery: RefineryImpact[] = [];
  if (input.refineries && input.refineries.length > 0) {
    // Aggregate per country: total capacity + refinery count (for uniform fallback)
    const countryCap = new Map<string, number>();
    const countryCount = new Map<string, number>();
    for (const r of input.refineries) {
      countryCap.set(r.country_iso3, (countryCap.get(r.country_iso3) ?? 0) + r.capacity);
      countryCount.set(r.country_iso3, (countryCount.get(r.country_iso3) ?? 0) + 1);
    }

    for (const r of input.refineries) {
      const totalCap = countryCap.get(r.country_iso3) ?? 0;
      const count = countryCount.get(r.country_iso3) ?? 0;
      // Capacity-weighted when capacity data exists; uniform-within-country fallback when all zero.
      const refShare = totalCap > 0
        ? r.capacity / totalCap
        : (count > 0 ? 1 / count : 0);

      const flows = flowsByImporter.get(r.country_iso3) ?? [];
      const sources = flows.map((f) => ({ iso3: f.iso3, qty: f.qty * refShare }));
      const totalFeedstock = sources.reduce((s, x) => s + x.qty, 0);

      let refAtRisk = 0;
      for (const src of sources) {
        const share = lookupShare(src.iso3, r.country_iso3);
        if (share > 0) refAtRisk += src.qty * share;
      }
      const topSources = [...sources].sort((a, b) => b.qty - a.qty).slice(0, 5);

      byRefinery.push({
        asset_id: r.asset_id,
        iso3: r.country_iso3,
        capacity: r.capacity,
        atRiskQty: refAtRisk,
        shareAtRisk: totalFeedstock > 0 ? refAtRisk / totalFeedstock : 0,
        topSources,
      });
    }
  }
  const rankedRefineries = [...byRefinery].sort((a, b) => b.atRiskQty - a.atRiskQty);

  return {
    scenarioId: input.scenarioId,
    year: input.year,
    byImporter,
    rankedImporters,
    byRefinery,
    rankedRefineries,
    // Back-compat shims for Phase 1's ScenarioPanel:
    chokepoint_id: input.scenarioId,
    ranked: rankedImporters,
  };
}
