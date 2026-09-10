import type {
  Commodity,
  DisruptionRouteRow,
  ImporterImpact,
  LngImportRow,
  LngVoyageRow,
  RefineryRow,
  ScenarioId,
  ScenarioResult,
  TradeFlowRow,
} from "./types";
import { computeRefineryImpacts } from "./refinery";
import { computeLngImportImpacts } from "./lng";
import { computeLngImportImpactsFromVoyages } from "./lng-t3";

export * from "./types";

export interface ScenarioInput {
  readonly scenarioId: ScenarioId;
  readonly commodity: Commodity;
  readonly year: number;
  readonly tradeFlows: readonly TradeFlowRow[];
  readonly routes: readonly DisruptionRouteRow[];
  readonly refineries?: readonly RefineryRow[];
  readonly lngImports?: readonly LngImportRow[];
  /** Phase 6: LNG-T3 voyages, already pre-filtered by active year. */
  readonly lngVoyages?: readonly LngVoyageRow[];
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
  const flowsByImporter = new Map<string, { iso3: string; qty: number }[]>();
  for (const row of input.tradeFlows) {
    if (row.year !== input.year) continue;
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
  const byRefinery =
    input.refineries && input.refineries.length > 0
      ? computeRefineryImpacts({
          refineries: input.refineries,
          flowsByImporter,
          lookupShare,
        })
      : [];
  const rankedRefineries = [...byRefinery].sort((a, b) => b.atRiskQty - a.atRiskQty);

  // Phase 6: prefer LNG-T3 voyage-derived per-terminal attribution when
  // we have voyage data and the active year falls in the LNG-T3 range.
  const lngVoyages =
    input.year >= 2020 && input.year <= 2024 ? (input.lngVoyages ?? []) : [];

  const byLngImport =
    lngVoyages.length > 0
      ? computeLngImportImpactsFromVoyages({
          lngImports: input.lngImports ?? [],
          voyages: lngVoyages,
          flowsByImporter,
          lookupShare,
        })
      : input.lngImports && input.lngImports.length > 0
      ? computeLngImportImpacts({
          lngImports: input.lngImports,
          flowsByImporter,
          lookupShare,
        })
      : [];
  const rankedLngImports = [...byLngImport].sort((a, b) => b.atRiskQty - a.atRiskQty);

  return {
    scenarioId: input.scenarioId,
    commodity: input.commodity,
    year: input.year,
    byImporter,
    rankedImporters,
    byRefinery,
    rankedRefineries,
    byLngImport,
    rankedLngImports,
    // Back-compat shims for Phase 1's older ScenarioPanel:
    chokepoint_id: input.scenarioId,
    ranked: rankedImporters,
  };
}
