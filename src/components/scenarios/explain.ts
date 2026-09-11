/**
 * "Why is this country at 0 %?" — a pure explanation of one country's
 * scenario exposure from the same inputs the engine used. Mirrors the share
 * lookup in engine.ts (pair share, else exporter-wide share, else 0).
 *
 * Exported for the country tooltip (Track B / later pass) as well as the
 * scenario panel's "Check a country" lookup.
 */
import type { Commodity, DisruptionRouteRow, ScenarioResult, TradeFlowRow } from "@/lib/scenarios/types";

export interface SupplierQty {
  readonly iso3: string;
  /** BACI tonnes in the scenario year. */
  readonly qty: number;
}

export interface ExposedSupplier extends SupplierQty {
  /** Route share applied to this exporter → importer pair. */
  readonly share: number;
  /** qty × share (tonnes). */
  readonly atRiskQty: number;
}

export type ExposureExplanation =
  /** Non-zero exposure; `suppliers` are the exporters that carry it, largest first. */
  | {
      readonly kind: "exposed";
      readonly iso3: string;
      readonly year: number;
      readonly shareAtRisk: number;
      readonly atRiskQty: number;
      readonly totalQty: number;
      readonly suppliers: readonly ExposedSupplier[];
    }
  /** The country is an exporter on this route: the scenario measures importers, not lost exports. */
  | {
      readonly kind: "exporter";
      readonly iso3: string;
      readonly year: number;
      /** Exporter-wide route share; null when shares are set per importer only. */
      readonly routeShare: number | null;
      /** Importers with a pair-specific share (pipeline scenarios). */
      readonly routeImporters: readonly string[];
      /** Exposure of its own imports (usually 0; engine value in `byImporter`). */
      readonly importShareAtRisk: number;
      readonly importAtRiskQty: number;
    }
  /** No BACI import rows for this country, commodity and year. */
  | { readonly kind: "no-imports"; readonly iso3: string; readonly year: number }
  /**
   * It buys from exporters on the route, but not along it: pipeline shares
   * are per importer, so e.g. France's Russian crude does not ride Druzhba.
   */
  | {
      readonly kind: "not-on-route";
      readonly iso3: string;
      readonly year: number;
      readonly totalQty: number;
      readonly routeExporters: readonly SupplierQty[];
      /** Every such supplier has an explicit share-0 pair row (e.g. intra-Gulf trade). */
      readonly zeroPairs: boolean;
    }
  /** It imports, but none of it from exporters on the route. */
  | {
      readonly kind: "no-route-suppliers";
      readonly iso3: string;
      readonly year: number;
      readonly totalQty: number;
      /** Largest suppliers (up to 3). */
      readonly topSuppliers: readonly SupplierQty[];
    };

export interface ExplainInputs {
  readonly tradeFlows: readonly TradeFlowRow[];
  readonly routes: readonly DisruptionRouteRow[];
}

/**
 * Explain `iso3`'s exposure in `result` using the trade flows and route
 * shares the engine saw (`ScenarioInputs` satisfies `ExplainInputs`).
 * Despite the name it also explains non-zero exposure (`kind: "exposed"`),
 * so a tooltip can call it for any country.
 */
export function explainZeroExposure(
  iso3: string,
  result: ScenarioResult,
  inputs: ExplainInputs,
): ExposureExplanation {
  const year = result.year;
  const routes = inputs.routes.filter((r) => r.disruption_id === result.scenarioId);
  const pair = new Map<string, number>();
  const wide = new Map<string, number>();
  for (const r of routes) {
    if (r.importer_iso3 === null) wide.set(r.exporter_iso3, r.share);
    else pair.set(`${r.exporter_iso3}→${r.importer_iso3}`, r.share);
  }
  const lookup = (exp: string): number => pair.get(`${exp}→${iso3}`) ?? wide.get(exp) ?? 0;

  const bySupplier = new Map<string, number>();
  for (const f of inputs.tradeFlows) {
    if (f.year !== year || f.importer_iso3 !== iso3) continue;
    bySupplier.set(f.exporter_iso3, (bySupplier.get(f.exporter_iso3) ?? 0) + f.qty);
  }
  const suppliers = [...bySupplier].map(([s, qty]) => ({ iso3: s, qty }));
  suppliers.sort((a, b) => b.qty - a.qty);
  const totalQty = suppliers.reduce((s, x) => s + x.qty, 0);

  const exposed = suppliers
    .map((s) => {
      const share = lookup(s.iso3);
      return { ...s, share, atRiskQty: s.qty * share };
    })
    .filter((s) => s.share > 0 && s.qty > 0)
    .sort((a, b) => b.atRiskQty - a.atRiskQty);
  const atRiskQty = exposed.reduce((s, x) => s + x.atRiskQty, 0);
  const impact = result.byImporter.find((i) => i.iso3 === iso3);
  const shareAtRisk = impact?.shareAtRisk ?? (totalQty > 0 ? atRiskQty / totalQty : 0);

  // Route exporters first: a supplier's own (often tiny) imports can carry a
  // non-zero share (Kazakhstan buying Russian crude that rides CPC), which
  // would read as "Kazakhstan is exposed" when the real story is lost exports.
  const asExporter = routes.filter((r) => r.exporter_iso3 === iso3);
  if (asExporter.length > 0) {
    return {
      kind: "exporter",
      iso3,
      year,
      routeShare: asExporter.find((r) => r.importer_iso3 === null)?.share ?? null,
      routeImporters: asExporter.flatMap((r) => (r.importer_iso3 === null ? [] : [r.importer_iso3])),
      importShareAtRisk: atRiskQty > 0 ? shareAtRisk : 0,
      importAtRiskQty: atRiskQty,
    };
  }

  if (atRiskQty > 0 && shareAtRisk > 0) {
    return { kind: "exposed", iso3, year, shareAtRisk, atRiskQty, totalQty, suppliers: exposed };
  }

  if (totalQty <= 0) return { kind: "no-imports", iso3, year };

  const routeExporterSet = new Set(routes.map((r) => r.exporter_iso3));
  const routeExporters = suppliers.filter((s) => routeExporterSet.has(s.iso3) && s.qty > 0);
  if (routeExporters.length > 0) {
    const zeroPairs = routeExporters.every((s) => pair.get(`${s.iso3}→${iso3}`) === 0);
    return { kind: "not-on-route", iso3, year, totalQty, routeExporters, zeroPairs };
  }
  return { kind: "no-route-suppliers", iso3, year, totalQty, topSuppliers: suppliers.slice(0, 3) };
}

export interface DescribeContext {
  readonly commodity: Commodity;
  /** "the Strait of Hormuz" */
  readonly routeName: string;
  /** iso3 → display name; falls back to the code. */
  readonly nameOf: (iso3: string) => string;
  /** BACI tonnes → display string ("123 kb/d"). */
  readonly formatVolume: (tonnes: number) => string;
}

function list(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1] ?? ""}`;
}

/** One or two plain sentences for a tooltip or the panel. */
export function describeExposure(e: ExposureExplanation, ctx: DescribeContext): string {
  const name = ctx.nameOf(e.iso3);
  const noun = ctx.commodity === "gas" ? "LNG imports" : "crude imports";
  const y = e.year.toString();
  switch (e.kind) {
    case "exposed": {
      // Name only suppliers carrying ≥ 1 % of the at-risk volume (max 3).
      const top = e.suppliers
        .filter((s) => s.atRiskQty >= e.atRiskQty * 0.01)
        .slice(0, 3)
        .map((s) => `${ctx.nameOf(s.iso3)} (${ctx.formatVolume(s.atRiskQty)})`);
      return (
        `${name}: ${(e.shareAtRisk * 100).toFixed(1)}% of its ${y} ${noun} ` +
        `(${ctx.formatVolume(e.atRiskQty)} of ${ctx.formatVolume(e.totalQty)}) is routed through ` +
        `${ctx.routeName}. At-risk volume comes from ${list(top)}.`
      );
    }
    case "exporter": {
      const how =
        e.routeShare !== null
          ? `${(e.routeShare * 100).toFixed(e.routeShare < 0.1 ? 1 : 0)}% of its exports use ${ctx.routeName}`
          : `${ctx.routeName} carries its exports to ${list(e.routeImporters.map(ctx.nameOf))}`;
      const own =
        e.importShareAtRisk > 0
          ? ` Its own ${noun} show ${(e.importShareAtRisk * 100).toFixed(1)}% at risk (${ctx.formatVolume(e.importAtRiskQty)}).`
          : "";
      return (
        `${e.importShareAtRisk > 0 ? "" : "0%: "}${name} is an exporter on this route (${how}). ` +
        `The scenario measures importers' exposure, not an exporter's lost sales.${own}`
      );
    }
    case "no-imports":
      return `0%: BACI records no ${noun} into ${name} in ${y}, so there is nothing to put at risk.`;
    case "not-on-route":
      return (
        `0%: ${name} imports from ${list(e.routeExporters.map((s) => `${ctx.nameOf(s.iso3)} (${ctx.formatVolume(s.qty)})`))}, ` +
        (e.zeroPairs
          ? `but that trade never reaches ${ctx.routeName}: the scenario sets a 0% route share for these pairs (cargoes that stay inside the Gulf).`
          : `but the scenario routes none of that trade through ${ctx.routeName} — the route share is set only for the importers it serves.`)
      );
    case "no-route-suppliers":
      return (
        `0%: ${name} imported ${ctx.formatVolume(e.totalQty)} of ${ctx.commodity === "gas" ? "LNG" : "crude"} ` +
        `in ${y}, none of it from exporters that use ${ctx.routeName}. Largest suppliers: ` +
        `${list(e.topSuppliers.map((s) => ctx.nameOf(s.iso3)))}.`
      );
  }
}
