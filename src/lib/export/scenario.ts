import type { Catalog } from "@/lib/data-catalog/types";
import { getScenario } from "@/lib/scenarios/registry";
import type { ScenarioResult } from "@/lib/scenarios/types";
import { LNG_T3_FIRST_YEAR, LNG_T3_LAST_YEAR } from "@/lib/data/voyages";
import { toCsv, type CsvValue } from "./csv";
import { apaCitation, sharesFor, UNSOURCED_TITLE, type ShareCitation } from "./citation";

/**
 * The active scenario as one tidy CSV — importer rows, then refinery (oil) or
 * LNG import-terminal (gas) rows — with a `#` header that states it is derived
 * analysis and cites the trade data and every route share it used.
 */

export const SCENARIO_COLUMNS = [
  "row_type",
  "iso3",
  "country",
  "asset_id",
  "name",
  "capacity",
  "capacity_unit",
  "total_qty",
  "at_risk_qty",
  "share_at_risk",
  "qty_unit",
  "attribution",
  "top_sources",
] as const;

type ScenarioRow = Record<(typeof SCENARIO_COLUMNS)[number], CsvValue>;

export interface ScenarioExportContext {
  readonly viewUrl: string;
  /** YYYY-MM-DD */
  readonly exported: string;
  readonly catalog: Catalog;
  /** iso3 → country name; unknown codes (BACI aggregates) keep an empty name. */
  readonly countryNames?: ReadonlyMap<string, string> | null;
  /** Route-share citations; defaults to the generated disruption_route rows. */
  readonly shares?: readonly ShareCitation[];
}

const round = (n: number, dp: number) => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

function topSources(list: readonly { iso3: string; qty: number }[]): string {
  return list.map((s) => `${s.iso3}:${String(round(s.qty, 1))}`).join(";");
}

export function shareCitationLine(r: ShareCitation): string {
  const to = r.importer_iso3 ?? "all importers";
  const src = r.source_title === UNSOURCED_TITLE ? UNSOURCED_TITLE : `${r.source_title} (${String(r.source_year)})`;
  const url = r.source_url ? ` ${r.source_url}` : "";
  return `${r.exporter_iso3} -> ${to}: ${String(r.share)} — ${src}${url}`;
}

export function scenarioRows(
  result: ScenarioResult,
  names?: ReadonlyMap<string, string> | null,
): ScenarioRow[] {
  const gas = result.commodity === "gas";
  const qtyUnit = "tonnes";
  const name = (iso3: string) => names?.get(iso3) ?? null;
  const importers: ScenarioRow[] = [...result.byImporter]
    .filter((i) => i.totalQty > 0)
    .sort((a, b) => b.shareAtRisk - a.shareAtRisk || b.atRiskQty - a.atRiskQty)
    .map((i) => ({
      row_type: "importer",
      iso3: i.iso3,
      country: name(i.iso3),
      asset_id: null,
      name: null,
      capacity: null,
      capacity_unit: null,
      total_qty: round(i.totalQty, 1),
      at_risk_qty: round(i.atRiskQty, 1),
      share_at_risk: round(i.shareAtRisk, 6),
      qty_unit: qtyUnit,
      attribution: "BACI bilateral imports x route share",
      top_sources: null,
    }));
  const assets: ScenarioRow[] = gas
    ? result.byLngImport
        .filter((t) => t.atRiskQty > 0 || t.coverage === "none")
        .sort((a, b) => b.atRiskQty - a.atRiskQty)
        .map((t) => ({
          row_type: "lng_import_terminal",
          iso3: t.iso3,
          country: name(t.iso3),
          asset_id: t.asset_id,
          name: t.name,
          capacity: t.capacity,
          capacity_unit: "mtpa",
          total_qty: null,
          at_risk_qty: round(t.atRiskQty, 1),
          share_at_risk: round(t.shareAtRisk, 6),
          qty_unit: qtyUnit,
          attribution:
            t.coverage === "measured"
              ? "LNG-T3 voyage shares of the BACI country total"
              : t.coverage === "none"
                ? "no qualifying LNG-T3 voyages (data gap, not zero risk)"
                : "BACI country total split by terminal capacity",
          top_sources: topSources(t.topSources),
        }))
    : result.byRefinery
        .filter((r) => r.atRiskQty > 0)
        .sort((a, b) => b.atRiskQty - a.atRiskQty)
        .map((r) => ({
          row_type: "refinery",
          iso3: r.iso3,
          country: name(r.iso3),
          asset_id: r.asset_id,
          name: r.name ?? null,
          capacity: r.capacity > 0 ? r.capacity : null,
          capacity_unit: r.capacity > 0 ? "kbpd" : null,
          total_qty: null,
          at_risk_qty: round(r.atRiskQty, 1),
          share_at_risk: round(r.shareAtRisk, 6),
          qty_unit: qtyUnit,
          attribution:
            r.capacity > 0
              ? "country imports split by refinery capacity"
              : "country imports split uniformly (capacity unknown)",
          top_sources: topSources(r.topSources),
        }));
  return [...importers, ...assets];
}

export function scenarioHeader(result: ScenarioResult, ctx: ScenarioExportContext): string[] {
  const def = getScenario(result.scenarioId);
  const gas = result.commodity === "gas";
  const hs = gas ? "HS 271111 (LNG)" : "HS 2709 (crude)";
  const baci = ctx.catalog.entries.find((e) => e.id === "baci_2709");
  const lngT3 = ctx.catalog.entries.find((e) => e.id === "lng_t3_voyages");
  const usesVoyages = gas && result.year >= LNG_T3_FIRST_YEAR && result.year <= LNG_T3_LAST_YEAR;
  const shares = sharesFor(result.scenarioId, ctx.shares);
  const lines = [
    `Global Energy Map — scenario table: ${def.label}, ${gas ? "LNG" : "crude oil"}, ${String(result.year)}`,
    "DERIVED ANALYSIS, not source data. Importer rows: BACI bilateral imports from each exporter x that exporter's route share;",
    `share_at_risk = at_risk_qty / total_qty. ${gas ? "LNG import-terminal" : "Refinery"} rows attribute a country's at-risk imports to its ${gas ? "terminals" : "refineries"}${usesVoyages ? " (LNG-T3 voyage shares where covered, else by capacity)" : " by capacity (uniformly when capacity is unknown)"}.`,
    `Quantities in metric tonnes (BACI ${hs}); capacity in the stated unit.`,
    baci
      ? `Trade data: ${baci.attribution ?? baci.source_name}, as of ${baci.as_of}. ${baci.license}. Cite: Gaulier, G., & Zignago, S. (2010). BACI: International Trade Database at the Product-Level. The 1994-2007 Version. CEPII Working Paper 2010-23. ${baci.source_url}`
      : "Trade data: CEPII BACI.",
  ];
  if (usesVoyages && lngT3) {
    lines.push(`Terminal shares: ${lngT3.attribution ?? lngT3.source_name}, as of ${lngT3.as_of}. ${lngT3.source_url}`);
  }
  lines.push(`Route shares (disruption_route.parquet, ${String(shares.length)} rows; static across years):`);
  for (const s of shares) lines.push(`  ${shareCitationLine(s)}`);
  lines.push(`View: ${ctx.viewUrl}`, `Exported: ${ctx.exported}`, `Cite this site: ${apaCitation(undefined, { viewUrl: ctx.viewUrl, accessed: ctx.exported })}`);
  return lines;
}

export function scenarioCsv(result: ScenarioResult, ctx: ScenarioExportContext): string {
  return toCsv(SCENARIO_COLUMNS, scenarioRows(result, ctx.countryNames), scenarioHeader(result, ctx));
}

export function scenarioFilename(result: ScenarioResult): string {
  return `global-energy-map_scenario-${result.scenarioId}_${result.commodity}_${String(result.year)}.csv`;
}
