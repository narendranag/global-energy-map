import type { Catalog } from "@/lib/data-catalog/types";
import { getScenario, routeKeyFor, severityPct } from "@/lib/scenarios/registry";
import { groupIdenticalPairShares, pairLabel } from "@/lib/scenarios/share-groups";
import { scenarioIdsOf } from "@/lib/scenarios/shares";
import { scenarioVintage, type ScenarioVintageResult } from "@/lib/scenarios/vintage";
import type { ScenarioResult } from "@/lib/scenarios/types";
import { LNG_T3_FIRST_YEAR, LNG_T3_LAST_YEAR } from "@/lib/data/voyages";
import type { ScenarioView } from "@/lib/url-state/encode";
import { toCsv, type CsvValue } from "./csv";
import { apaCitation, sharesFor, UNSOURCED_TITLE, type ShareCitation } from "./citation";

/**
 * The active scenario as one tidy CSV — importer rows, then refinery (oil) or
 * LNG import-terminal (gas) rows — with a `#` header that states it is derived
 * analysis and cites the trade data and every route share it used.
 *
 * T1 added an exporter view to the panel and the map, and the export ignored
 * it: a researcher reading a ranking of *exporters* on screen downloaded a
 * table of importers (finding 3). `view` now selects which side is written.
 *
 * The importer file is unchanged, byte for byte — pinned by a test, because
 * every scenario CSV shared so far is an importer file and a column or a
 * header line that moved would break a script someone already wrote.
 *
 * The exporter file carries **no asset rows**. Refineries and LNG import
 * terminals are importer-side by construction: they answer "which plants lose
 * feedstock", by splitting an *importer's* at-risk imports across its own
 * capacity. There is no exporter-side counterpart in the data — we hold no
 * export terminals or loading berths for crude, and attributing an exporter's
 * lost sales to the refineries of the countries that were going to buy it
 * would silently mix the two sides in one file. So the exporter file says, in
 * its header, that those rows exist in the importer view and why they are not
 * here, and a reader who wants them switches the panel back.
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
  /**
   * T1: which side of the cut the file describes — the side the panel was
   * listing when the viewer pressed the button. Defaults to importers, which
   * is what every file exported before T1 was.
   */
  readonly view?: ScenarioView;
  /**
   * The date staleness is judged against, ISO. Injectable so a test's output
   * is deterministic; defaults to the export date, which is today by
   * construction (the file is written now).
   */
  readonly today?: string;
}

const round = (n: number, dp: number) => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

function topSources(list: readonly { iso3: string; qty: number }[]): string {
  return list.map((s) => `${s.iso3}:${String(round(s.qty, 1))}`).join(";");
}

export function shareCitationLine(r: ShareCitation, pairs: readonly ShareCitation[] = [r]): string {
  // Review finding 1: an inbound row has no exporter, and "null -> KWT" in a
  // citation line is worse than useless. `pairLabel` is the canonical
  // wildcard spelling; the CSV keeps its ASCII arrow (a header line that is
  // read in a terminal and a spreadsheet alike).
  const ascii = (p: ShareCitation) => pairLabel(p).replace("→", " -> ");
  const route =
    pairs.length > 1
      ? `${String(pairs.length)} pairs (${pairs.map(ascii).join(", ")})`
      : r.exporter_iso3 === null
        ? `all exporters -> ${r.importer_iso3 ?? "*"}`
        : `${r.exporter_iso3} -> ${r.importer_iso3 ?? "all importers"}`;
  const src = r.source_title === UNSOURCED_TITLE ? UNSOURCED_TITLE : `${r.source_title} (${String(r.source_year)})`;
  const url = r.source_url ? ` ${r.source_url}` : "";
  return `${route}: ${String(r.share)} — ${src}${url}`;
}

export function scenarioRows(
  result: ScenarioResult,
  names?: ReadonlyMap<string, string> | null,
  view: ScenarioView = "importers",
): ScenarioRow[] {
  const gas = result.commodity === "gas";
  const qtyUnit = "tonnes";
  const name = (iso3: string) => names?.get(iso3) ?? null;
  if (view === "exporters") {
    // The same impact shape read from the other end: `total_qty` is what the
    // country exported, `at_risk_qty` the part that moves on the cut route,
    // `share_at_risk` its share of that country's EXPORTS. Asset rows are
    // importer-side and deliberately absent (see the file comment).
    return [...(result.byExporter ?? [])]
      .filter((e) => e.totalQty > 0)
      .sort((a, b) => b.shareAtRisk - a.shareAtRisk || b.atRiskQty - a.atRiskQty)
      .map((e) => ({
        row_type: "exporter",
        iso3: e.iso3,
        country: name(e.iso3),
        asset_id: null,
        name: null,
        capacity: null,
        capacity_unit: null,
        total_qty: round(e.totalQty, 1),
        at_risk_qty: round(e.atRiskQty, 1),
        share_at_risk: round(e.shareAtRisk, 6),
        qty_unit: qtyUnit,
        attribution: "BACI bilateral exports x route share",
        top_sources: null,
      }));
  }
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
  const gas = result.commodity === "gas";
  const hs = gas ? "HS 271111 (LNG)" : "HS 2709 (crude)";
  const baci = ctx.catalog.entries.find((e) => e.id === "baci_2709");
  const lngT3 = ctx.catalog.entries.find((e) => e.id === "lng_t3_voyages");
  const usesVoyages = gas && result.year >= LNG_T3_FIRST_YEAR && result.year <= LNG_T3_LAST_YEAR;
  const ids = scenarioIdsOf(result);
  const severity = result.severity ?? 1;
  // One entry per scenario: its label and its own route-share rows. A CSV
  // quoting one scenario's shares under a two-scenario number would not say
  // where that number came from.
  const perScenario = ids.map((id) => ({
    def: getScenario(id),
    // routeKeyFor is null when the scenario does not model this commodity
    // (only reachable from a hand-typed URL). Cite the scenario's own rows
    // rather than a `_lng` id that has none (A1).
    shares: sharesFor(routeKeyFor(id, result.commodity) ?? id, ctx.shares),
  }));
  const shares = perScenario.flatMap((s) => s.shares);
  const exporterView = (ctx.view ?? "importers") === "exporters";
  const assetNoun = gas ? "LNG import-terminal" : "Refinery";
  const lines = [
    `Global Energy Map — scenario table: ${perScenario.map((s) => s.def.label).join(" + ")}, ${gas ? "LNG" : "crude oil"}, ${String(result.year)}${exporterView ? ", EXPORTER VIEW" : ""}`,
    ...(exporterView
      ? [
          "DERIVED ANALYSIS, not source data. EXPORTER VIEW: every row is an exporter — who loses the outlet, not who loses the supply.",
          "total_qty is everything the country exported of this commodity in the year; at_risk_qty is the part that moves on the cut route;",
          "share_at_risk = at_risk_qty / total_qty, i.e. the share of that EXPORTER'S EXPORTS at risk (not of anyone's imports).",
          `${assetNoun} rows are omitted: they are importer-side by construction (an importer's at-risk imports split across its own ${gas ? "terminals" : "refineries"}) and have no exporter-side counterpart. Export the importer view for them.`,
        ]
      : [
          "DERIVED ANALYSIS, not source data. Importer rows: BACI bilateral imports from each exporter x that exporter's route share;",
          `share_at_risk = at_risk_qty / total_qty. ${assetNoun} rows attribute a country's at-risk imports to its ${gas ? "terminals" : "refineries"}${usesVoyages ? " (LNG-T3 voyage shares where covered, else by capacity)" : " by capacity (uniformly when capacity is unknown)"}.`,
        ]),
    `Quantities in metric tonnes (BACI ${hs}); capacity in the stated unit.`,
    baci
      ? `Trade data: ${baci.attribution ?? baci.source_name}, as of ${baci.as_of}. ${baci.license}. Cite: Gaulier, G., & Zignago, S. (2010). BACI: International Trade Database at the Product-Level. The 1994-2007 Version. CEPII Working Paper 2010-23. ${baci.source_url}`
      : "Trade data: CEPII BACI.",
  ];
  // What the numbers are built on, and how current each part of it is — the
  // same derivation as the panel's "Data behind this result" disclosure, from
  // the same two inputs (the result and its route rows). It is structurally
  // unable to carry the panel's context block (GIE storage, UN Comtrade): a
  // `ScenarioResult` and a list of route citations cannot hold either.
  const vintage = scenarioVintage(
    // The exporter file has no asset rows (see the file comment), so it does
    // not cite the asset sources either.
    exporterView
      ? ({
          scenarioId: result.scenarioId,
          commodity: result.commodity,
          year: result.year,
          ...(result.scenarioIds === undefined ? {} : { scenarioIds: result.scenarioIds }),
        } satisfies ScenarioVintageResult)
      : result,
    shares,
    { catalog: ctx.catalog, today: ctx.today ?? ctx.exported },
  );
  lines.push(
    `Trade year: ${String(result.year)} — every figure below is that year's reconciled bilateral trade. There is no year control on the site; a link pinned to an earlier year keeps showing that year.`,
    `Data vintages: ${vintage.summary}`,
  );
  for (const row of vintage.rows) {
    const sources = row.sources.length > 0 ? ` (${row.sources.join(", ")})` : "";
    lines.push(`  ${row.label}${sources}: ${row.through}.${row.note === null ? "" : ` ${row.note}`}`);
  }
  if (vintage.mismatchNote !== null) lines.push(`  ${vintage.mismatchNote}`);
  if (usesVoyages && lngT3 && !exporterView) {
    lines.push(`Terminal shares: ${lngT3.attribution ?? lngT3.source_name}, as of ${lngT3.as_of}. ${lngT3.source_url}`);
  }
  if (severity < 1) {
    lines.push(
      `Severity: ${severityPct(severity)} of what the route carries is cut — every route share below is multiplied by ${severityPct(severity)} before it is applied. Total imports (total_qty) are untouched.`,
    );
  }
  if (ids.length > 1) {
    lines.push(
      `${String(ids.length)} routes closed at once (${perScenario.map((s) => s.def.routeName).join(" and ")}). Each route's shares are resolved on their own, then combined. Because we know what fraction of a flow each route carries but not which cargoes, a country's exposure is a range: low = the largest single share (routes in series, the same barrels cut once), high = the shares added and capped at 100% (routes in parallel, different barrels). EVERY at_risk_qty AND share_at_risk BELOW IS THE LOW END OF THAT RANGE${exporterView ? "." : `, including the ${gas ? "terminal" : "refinery"} rows.`}`,
    );
  } else if (!exporterView) {
    lines.push(
      `${assetNoun} rows quote the same single-scenario figure as their country.`,
    );
  }
  lines.push(
    `Route shares (disruption_route.parquet, ${String(shares.length)} rows; static across years):`,
  );
  for (const { def: sdef, shares: rows } of perScenario) {
    if (ids.length > 1) lines.push(`  ${sdef.label}:`);
    for (const g of groupIdenticalPairShares(rows)) {
      lines.push(`  ${ids.length > 1 ? "  " : ""}${shareCitationLine(g.rows[0], g.rows)}`);
    }
  }
  lines.push(`View: ${ctx.viewUrl}`, `Exported: ${ctx.exported}`, `Cite this site: ${apaCitation(undefined, { viewUrl: ctx.viewUrl, accessed: ctx.exported })}`);
  return lines;
}

export function scenarioCsv(result: ScenarioResult, ctx: ScenarioExportContext): string {
  return toCsv(
    SCENARIO_COLUMNS,
    scenarioRows(result, ctx.countryNames, ctx.view ?? "importers"),
    scenarioHeader(result, ctx),
  );
}

export function scenarioFilename(
  result: ScenarioResult,
  view: ScenarioView = "importers",
): string {
  const ids = scenarioIdsOf(result).join("+");
  const sev = (result.severity ?? 1) < 1 ? `_sev${String(Math.round((result.severity ?? 1) * 100))}` : "";
  // Appended last, so an importer file's name is unchanged and two files for
  // the same view cannot land in a downloads folder as "table (1).csv".
  const side = view === "exporters" ? "_exporters" : "";
  return `global-energy-map_scenario-${ids}_${result.commodity}_${String(result.year)}${sev}${side}.csv`;
}
