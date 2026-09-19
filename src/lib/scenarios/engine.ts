import type {
  Commodity,
  DisruptionRouteRow,
  ExporterImpact,
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
import { lngTerminalsInService } from "./lng-in-service";
import { LNG_T3_FIRST_YEAR, LNG_T3_LAST_YEAR } from "./registry";

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
  /**
   * How much of the route is cut, 0–1. Default 1 = the full closure the
   * route shares describe. Values outside [0, 1] are clamped and a non-finite
   * value falls back to 1, so a bad URL parameter cannot invent exposure.
   */
  readonly severity?: number;
}

/** `severity` as the engine uses it: finite, in [0, 1], default 1. */
export function clampSeverity(severity: number | undefined): number {
  if (severity === undefined || !Number.isFinite(severity)) return 1;
  return Math.min(1, Math.max(0, severity));
}

export function computeScenarioImpact(input: ScenarioInput): ScenarioResult {
  /**
   * Severity multiplies the route share, not the flow: a half-closure cuts
   * half of the barrels that the route carries, and leaves the rest of the
   * importer's supply (its total, the denominator of `shareAtRisk`) alone.
   * Every downstream view — refineries, LNG terminals — reads the same
   * multiplied share, so they scale with it for free.
   */
  const severity = clampSeverity(input.severity);
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
    const share = sharePerPair.get(`${exporter}→${importer}`) ?? sharePerExporter.get(exporter) ?? 0;
    return share * severity;
  };

  // Per-importer and per-exporter pass + remember flow rows for refinery view.
  // Both sides read the same rows and the same `lookupShare`, so the two views
  // are two readings of one number: Σ importer at-risk ≡ Σ exporter at-risk.
  const totals = new Map<string, number>();
  const atRisk = new Map<string, number>();
  const exporterTotals = new Map<string, number>();
  const exporterAtRisk = new Map<string, number>();
  const flowsByImporter = new Map<string, { iso3: string; qty: number }[]>();
  for (const row of input.tradeFlows) {
    if (row.year !== input.year) continue;
    totals.set(row.importer_iso3, (totals.get(row.importer_iso3) ?? 0) + row.qty);
    exporterTotals.set(row.exporter_iso3, (exporterTotals.get(row.exporter_iso3) ?? 0) + row.qty);
    const share = lookupShare(row.exporter_iso3, row.importer_iso3);
    if (share > 0) {
      atRisk.set(row.importer_iso3, (atRisk.get(row.importer_iso3) ?? 0) + row.qty * share);
      exporterAtRisk.set(
        row.exporter_iso3,
        (exporterAtRisk.get(row.exporter_iso3) ?? 0) + row.qty * share,
      );
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

  const byExporter: ExporterImpact[] = [];
  for (const [iso3, totalQty] of exporterTotals) {
    const atRiskQty = exporterAtRisk.get(iso3) ?? 0;
    byExporter.push({
      iso3,
      totalQty,
      atRiskQty,
      shareAtRisk: totalQty > 0 ? atRiskQty / totalQty : 0,
    });
  }
  const rankedExporters = [...byExporter].sort((a, b) => b.atRiskQty - a.atRiskQty);

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
    input.year >= LNG_T3_FIRST_YEAR && input.year <= LNG_T3_LAST_YEAR ? (input.lngVoyages ?? []) : [];
  const lngImports = lngTerminalsInService(input.lngImports ?? [], input.year, lngVoyages);

  const byLngImport =
    lngVoyages.length > 0
      ? computeLngImportImpactsFromVoyages({
          lngImports,
          voyages: lngVoyages,
          flowsByImporter,
          lookupShare,
        })
      : lngImports.length > 0
      ? computeLngImportImpacts({
          lngImports,
          flowsByImporter,
          lookupShare,
        })
      : [];
  const rankedLngImports = [...byLngImport].sort((a, b) => b.atRiskQty - a.atRiskQty);

  return {
    scenarioId: input.scenarioId,
    commodity: input.commodity,
    year: input.year,
    severity,
    byImporter,
    rankedImporters,
    byExporter,
    rankedExporters,
    byRefinery,
    rankedRefineries,
    byLngImport,
    rankedLngImports,
  };
}
