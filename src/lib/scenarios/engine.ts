import type {
  Commodity,
  RouteRow,
  ExporterImpact,
  ImporterImpact,
  LngImportRow,
  LngVoyageRow,
  RefineryRow,
  ScenarioId,
  ScenarioResult,
  TradeFlowRow,
} from "./types";
import { combineShares, resolveScenarioShare, scenarioIdsOf, type ShareBounds } from "./shares";
import { computeRefineryImpacts } from "./refinery";
import { computeLngImportImpacts } from "./lng";
import { computeLngImportImpactsFromVoyages } from "./lng-t3";
import { lngTerminalsInService } from "./lng-in-service";
import { LNG_T3_FIRST_YEAR, LNG_T3_LAST_YEAR } from "./registry";

export * from "./types";

export interface ScenarioInput {
  /** The primary scenario; also the whole set unless `scenarioIds` is given. */
  readonly scenarioId: ScenarioId;
  /**
   * Two or more scenarios closed at once. The first is the primary (it names
   * the result); duplicates collapse. Shares combine as a range — see
   * `combineShares` in shares.ts — never by adding cargo twice.
   */
  readonly scenarioIds?: readonly ScenarioId[];
  readonly commodity: Commodity;
  readonly year: number;
  readonly tradeFlows: readonly TradeFlowRow[];
  readonly routes: readonly RouteRow[];
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
  // Resolve each scenario's own rows first — pair beats wildcards, including
  // share 0 — and only then combine across scenarios, so a flow one scenario
  // excludes cannot be re-admitted by another's wildcard.
  const scenarioIds = scenarioIdsOf(input);
  const resolved = scenarioIds.map((id) =>
    resolveScenarioShare(input.routes.filter((r) => r.disruption_id === id)),
  );
  const bounds = combineShares(resolved);
  const lookupBounds = (exporter: string, importer: string): ShareBounds => {
    const { lower, upper } = bounds(exporter, importer);
    return { lower: lower * severity, upper: upper * severity };
  };
  /** The headline share: the lower bound, which is what every asset view uses. */
  const lookupShare = (exporter: string, importer: string): number =>
    lookupBounds(exporter, importer).lower;

  // Per-importer and per-exporter pass + remember flow rows for refinery view.
  // Both sides read the same rows and the same `lookupShare`, so the two views
  // are two readings of one number: Σ importer at-risk ≡ Σ exporter at-risk.
  const totals = new Map<string, number>();
  const atRisk = new Map<string, number>();
  const atRiskUpper = new Map<string, number>();
  const exporterTotals = new Map<string, number>();
  const exporterAtRisk = new Map<string, number>();
  const exporterAtRiskUpper = new Map<string, number>();
  const flowsByImporter = new Map<string, { iso3: string; qty: number }[]>();
  const add = (m: Map<string, number>, key: string, value: number): void => {
    m.set(key, (m.get(key) ?? 0) + value);
  };
  for (const row of input.tradeFlows) {
    if (row.year !== input.year) continue;
    add(totals, row.importer_iso3, row.qty);
    add(exporterTotals, row.exporter_iso3, row.qty);
    const { lower, upper } = lookupBounds(row.exporter_iso3, row.importer_iso3);
    if (lower > 0) {
      add(atRisk, row.importer_iso3, row.qty * lower);
      add(exporterAtRisk, row.exporter_iso3, row.qty * lower);
    }
    if (upper > 0) {
      add(atRiskUpper, row.importer_iso3, row.qty * upper);
      add(exporterAtRiskUpper, row.exporter_iso3, row.qty * upper);
    }
    const list = flowsByImporter.get(row.importer_iso3) ?? [];
    list.push({ iso3: row.exporter_iso3, qty: row.qty });
    flowsByImporter.set(row.importer_iso3, list);
  }

  /** One country's row in either direction — the two views are symmetric. */
  const impact = (
    iso3: string,
    totalQty: number,
    lower: ReadonlyMap<string, number>,
    upper: ReadonlyMap<string, number>,
  ): ImporterImpact => {
    const atRiskQty = lower.get(iso3) ?? 0;
    const atRiskQtyUpper = upper.get(iso3) ?? 0;
    return {
      iso3,
      totalQty,
      atRiskQty,
      shareAtRisk: totalQty > 0 ? atRiskQty / totalQty : 0,
      atRiskQtyUpper,
      shareAtRiskUpper: totalQty > 0 ? atRiskQtyUpper / totalQty : 0,
    };
  };

  const byImporter: ImporterImpact[] = [];
  for (const [iso3, totalQty] of totals) {
    byImporter.push(impact(iso3, totalQty, atRisk, atRiskUpper));
  }
  const rankedImporters = [...byImporter].sort((a, b) => b.atRiskQty - a.atRiskQty);

  const byExporter: ExporterImpact[] = [];
  for (const [iso3, totalQty] of exporterTotals) {
    byExporter.push(impact(iso3, totalQty, exporterAtRisk, exporterAtRiskUpper));
  }
  const rankedExporters = [...byExporter].sort((a, b) => b.atRiskQty - a.atRiskQty);

  // Refinery view (only if refineries provided). Asset-level attribution
  // quotes the lower bound only: spreading a *range* across a country's
  // refineries by capacity would multiply an already-coarse proxy by an
  // interval, and the panel has nowhere honest to put the result. The range
  // stays a country-level statement.
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
    scenarioId: scenarioIds[0],
    scenarioIds,
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
