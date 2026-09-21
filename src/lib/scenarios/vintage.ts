import type { Catalog, CatalogEntry } from "@/lib/data-catalog/types";
import { catalogEntriesFor } from "@/lib/data/sources";
import {
  STALE_AFTER_MONTHS,
  formatVintage,
  layerVintage,
  monthsOld,
  periodEnd,
  staleNote,
} from "@/lib/data/vintage";
import { LAYER_LABELS, scenarioTags, type LayerKey } from "@/lib/export/layers";
import { scenarioIdsOf } from "./shares";
import type { Commodity, LngImportImpact, ScenarioId, ScenarioResult } from "./types";

/**
 * What a scenario result was computed from, and how current each part of it
 * is — the "Data behind this result" disclosure.
 *
 * Everything here is derived: the catalog entries come from the scenario's own
 * `scenario:<id>` layer tags (the same mapping the CSV citation header uses),
 * their dates from catalog `coverage`/`as_of` through the shared `layerVintage`
 * helpers, and the route-share dates from the rows' own `source_year` columns —
 * never from the `disruption_route` entry's `as_of`, which is the day the
 * *table* was rebuilt and says nothing about how old the cited documents are.
 * No year, date or source name is written down in this file; a data refresh
 * moves every sentence with no code change.
 *
 * Only the four things the engine actually reads appear. The panel's context
 * block (GIE storage, Comtrade recent imports) is a second, independent
 * reading and is structurally excluded: this function is handed a
 * `ScenarioResult` and route rows, and neither can carry them.
 */

export type VintageRole = "trade" | "route_shares" | "assets" | "attribution";

export interface ScenarioDataRow {
  readonly role: VintageRole;
  /** What this row is, in the site's own words ("Refineries", "Route shares"). */
  readonly label: string;
  /** Publisher names, from the catalog, in catalog order. */
  readonly sources: readonly string[];
  /** Display phrase: "run on 2024", "dated 2021–2023", "as of 17 Sep 2026". */
  readonly through: string;
  /** ISO date the data ends; "" when the row carries no date at all. */
  readonly dataEnd: string;
  readonly stale: boolean;
  /** Why it is old, what it falls back to — null when there is nothing to say. */
  readonly note: string | null;
}

export interface ScenarioVintage {
  /** The trade year the result was run on (a pinned link may be historical). */
  readonly tradeYear: number;
  readonly rows: readonly ScenarioDataRow[];
  /** Years between the oldest and newest dated row. */
  readonly spreadYears: number;
  /** Set only when the spread is wide enough to change how a number reads. */
  readonly mismatchNote: string | null;
  /** One line: "Trade 2024 · shares 2021–23 · refineries 2026". */
  readonly summary: string;
}

/**
 * The part of a `ScenarioResult` this needs: the identity of the run, and
 * whether it actually attributed assets. `byRefinery`/`byLngImport` are
 * widened to the one field each that is read, so a caller with a trimmed
 * result (the country panel runs the engine without asset rows) still fits.
 * A real `ScenarioResult` is assignable to it.
 */
export type ScenarioVintageResult = Pick<ScenarioResult, "scenarioId" | "commodity" | "year"> & {
  readonly scenarioIds?: readonly ScenarioId[];
  readonly byRefinery?: readonly { readonly asset_id: string }[];
  readonly byLngImport?: readonly { readonly coverage: LngImportImpact["coverage"] }[];
};

/** The two `disruption_route` citation columns that date a share. */
export interface RouteVintageRow {
  readonly source_title: string;
  readonly source_year: number | null;
}

/** Spread at which the gap between two vintages changes how a number reads. */
export const MISMATCH_SPREAD_YEARS = 3;

/** The asset layer a commodity's attribution is drawn from. */
function assetLayer(commodity: Commodity): LayerKey {
  // scenarioTags returns [share tag, asset tag]; the asset tag is a layer key.
  return (scenarioTags("hormuz", commodity)[1] ?? "refineries") as LayerKey;
}

/** Catalog entries behind every scenario in the run, deduplicated, in order. */
function scenarioEntries(
  result: ScenarioVintageResult,
  catalog: Catalog | undefined,
): CatalogEntry[] {
  const seen = new Map<string, CatalogEntry>();
  for (const id of scenarioIdsOf(result)) {
    const [shareTag] = scenarioTags(id, result.commodity);
    if (shareTag === undefined) continue;
    for (const e of catalogEntriesFor(shareTag, catalog)) seen.set(e.id, e);
  }
  return [...seen.values()];
}

function sourceNames(entries: readonly CatalogEntry[]): string[] {
  return [...new Set(entries.map((e) => e.source_name))];
}

/** The first cadence any of these entries declares ("annual, January–February"). */
function cadenceOf(entries: readonly CatalogEntry[]): { name: string; cadence: string } | null {
  for (const e of entries) {
    if (e.cadence !== undefined && e.cadence !== "") return { name: e.source_name, cadence: e.cadence };
  }
  return null;
}

/** "Published annual, January–February." — so "old" does not read as neglect. */
function cadenceSentence(entries: readonly CatalogEntry[]): string | null {
  const c = cadenceOf(entries);
  return c === null ? null : `${c.name} publishes ${c.cadence}.`;
}

function joinNotes(parts: readonly (string | null)[]): string | null {
  const kept = parts.filter((p): p is string => p !== null && p !== "");
  return kept.length === 0 ? null : kept.join(" ");
}

function yearOf(isoDate: string): number | null {
  const y = Number(isoDate.slice(0, 4));
  return Number.isFinite(y) && isoDate !== "" ? y : null;
}

/** 2021 + 2023 → "2021–23"; same years → "2021". */
function shortYearRange(from: number, through: number): string {
  if (from === through) return through.toString();
  const sameCentury = Math.floor(from / 100) === Math.floor(through / 100);
  return `${from.toString()}–${sameCentury ? through.toString().slice(2) : through.toString()}`;
}

/** "Refineries" → "refineries", but "LNG terminals" is left alone. */
function lowerFirst(label: string): string {
  const first = label[0];
  const second = label[1];
  if (first === undefined || second === undefined) return label;
  // A second capital means an acronym ("LNG terminals"): leave it alone.
  if (second !== second.toLowerCase()) return label;
  return first.toLowerCase() + label.slice(1);
}

/** Catalog labels carry a trailing parenthetical naming the release. */
function shortLabel(label: string): string {
  return label.replace(/\s*\([^()]*\)\s*$/, "").trim();
}

function staleFor(dataEnd: string, today: string): boolean {
  return dataEnd !== "" && monthsOld(dataEnd, today) > STALE_AFTER_MONTHS;
}

export function scenarioVintage(
  result: ScenarioVintageResult,
  routes: readonly RouteVintageRow[] | null,
  opts: { readonly catalog?: Catalog; readonly today: string },
): ScenarioVintage {
  const { catalog, today } = opts;
  const rows: ScenarioDataRow[] = [];
  const summaryParts: string[] = [];
  const tradeYear = result.year;

  // --- trade -------------------------------------------------------------
  const entries = scenarioEntries(result, catalog);
  const tradeEntries = entries.filter((e) => e.layers.includes("trade"));
  const tradeLabel = shortLabel(LAYER_LABELS.trade_flows);
  const tradeEnd = periodEnd(tradeYear.toString(), "year");
  const published = layerVintage("trade_flows", tradeLabel, catalog);
  const publishedYear = published === null ? null : yearOf(published.dataEnd);
  const behind =
    published !== null && publishedYear !== null && publishedYear > tradeYear
      ? `Newer reconciled trade is available (${formatVintage(published).replace(/^to /, "")}); this result is pinned to ${tradeYear.toString()}.`
      : null;
  const tradeStale = staleFor(tradeEnd, today);
  rows.push({
    role: "trade",
    label: tradeLabel,
    sources: sourceNames(tradeEntries),
    through: `run on ${tradeYear.toString()}`,
    dataEnd: tradeEnd,
    stale: tradeStale,
    note: joinNotes([
      behind,
      tradeStale
        ? `Bilateral trade ends ${tradeYear.toString()}, ${monthsOld(tradeEnd, today).toString()} months ago — older than the ${STALE_AFTER_MONTHS.toString()}-month mark.`
        : null,
      tradeStale ? cadenceSentence(tradeEntries) : null,
    ]),
  });
  summaryParts.push(`Trade ${tradeYear.toString()}`);

  // --- route shares ------------------------------------------------------
  const routeRows = routes ?? [];
  if (routeRows.length > 0) {
    // An entry that feeds scenarios and nothing else is a routing table. The
    // trade table and the voyage table are tagged on the scenario too, but a
    // share never came from either of them.
    const routeEntries = entries.filter((e) => e.layers.every((l) => l.startsWith("scenario:")));
    const years = [...new Set(routeRows.map((r) => r.source_year).filter((y): y is number => y !== null))].sort(
      (a, b) => a - b,
    );
    const first = years[0];
    const last = years[years.length - 1];
    const dated = first !== undefined && last !== undefined;
    const dataEnd = dated ? periodEnd(last.toString(), "year") : "";
    const undatedCount = routeRows.filter((r) => r.source_year === null).length;
    const stale = staleFor(dataEnd, today);
    rows.push({
      role: "route_shares",
      label: "Route shares",
      sources: sourceNames(routeEntries),
      through: dated
        ? `dated ${first === last ? last.toString() : `${first.toString()}–${last.toString()}`}`
        : "no publication date recorded",
      dataEnd,
      stale,
      note: joinNotes([
        undatedCount > 0
          ? `${undatedCount.toString()} of ${routeRows.length.toString()} shares are an analyst estimate with no published document behind them.`
          : null,
        stale && dated
          ? `The most recent supporting document is from ${last.toString()}; route shares change with sanctions, new bypass capacity and rerouting.`
          : null,
      ]),
    });
    if (dated) summaryParts.push(`shares ${shortYearRange(first, last)}`);
  }

  // --- attributed assets --------------------------------------------------
  const gas = result.commodity === "gas";
  const assetCount = gas ? (result.byLngImport?.length ?? 0) : (result.byRefinery?.length ?? 0);
  const assetKey = assetLayer(result.commodity);
  if (assetCount > 0) {
    const assetEntries = catalogEntriesFor(assetKey, catalog);
    const label = shortLabel(LAYER_LABELS[assetKey]);
    const v = layerVintage(assetKey, label, catalog);
    const dataEnd = v?.dataEnd ?? "";
    const stale = v !== null && staleFor(dataEnd, today);
    rows.push({
      role: "assets",
      label,
      sources: sourceNames(assetEntries),
      through: v === null ? "undated" : formatVintage(v),
      dataEnd,
      stale,
      note: joinNotes([
        v !== null && stale ? staleNote(v, today) : null,
        v !== null && stale ? cadenceSentence(assetEntries) : null,
      ]),
    });
    const y = yearOf(dataEnd);
    if (y !== null) summaryParts.push(`${lowerFirst(label)} ${y.toString()}`);

    // --- per-terminal attribution (gas only) -----------------------------
    if (gas) {
      const voyageEntries = catalogEntriesFor("lng_voyages", catalog);
      const vv = layerVintage("lng_voyages", shortLabel(LAYER_LABELS.lng_voyages), catalog);
      const span = voyageEntries.flatMap((e) => e.coverage ?? [])[0];
      const covers =
        span === undefined
          ? true
          : tradeYear >= Number(span.from.slice(0, 4)) && tradeYear <= Number(span.through.slice(0, 4));
      const proxied = result.byLngImport?.some((i) => i.coverage === "capacity-proxy") ?? false;
      const voyageEnd = vv?.dataEnd ?? "";
      const voyageLabel = shortLabel(LAYER_LABELS.lng_voyages);
      rows.push({
        role: "attribution",
        label: voyageLabel,
        sources: sourceNames(voyageEntries),
        through: vv === null ? "undated" : formatVintage(vv),
        dataEnd: voyageEnd,
        stale: vv !== null && staleFor(voyageEnd, today),
        note: joinNotes([
          covers
            ? null
            : `Voyage data does not cover ${tradeYear.toString()}: each country's total is split across its terminals by capacity instead (a capacity proxy).`,
          covers && proxied
            ? "Terminals in countries with no voyage coverage are split by capacity instead (a capacity proxy)."
            : null,
          vv !== null && staleFor(voyageEnd, today) ? staleNote(vv, today) : null,
          vv !== null && staleFor(voyageEnd, today) ? cadenceSentence(voyageEntries) : null,
        ]),
      });
      const y2 = yearOf(voyageEnd);
      if (y2 !== null) summaryParts.push(`${lowerFirst(voyageLabel)} ${y2.toString()}`);
    }
  }

  // --- spread + mismatch --------------------------------------------------
  const datedRows = rows.filter((r) => r.dataEnd !== "");
  const years = datedRows.map((r) => yearOf(r.dataEnd) ?? 0);
  const oldestYear = Math.min(...years);
  const newestYear = Math.max(...years);
  const spreadYears = datedRows.length === 0 ? 0 : newestYear - oldestYear;
  let mismatchNote: string | null = null;
  if (spreadYears >= MISMATCH_SPREAD_YEARS) {
    const newest = datedRows.find((r) => yearOf(r.dataEnd) === newestYear);
    const oldest = datedRows.find((r) => yearOf(r.dataEnd) === oldestYear);
    mismatchNote =
      `${newest?.label ?? ""} data runs to ${newestYear.toString()} while ${lowerFirst(oldest?.label ?? "")} only reaches ${oldestYear.toString()}. ` +
      `The result is matched on ${tradeYear.toString()} trade, so anything newer is on the map but carries no volume.`;
  }

  return { tradeYear, rows, spreadYears, mismatchNote, summary: summaryParts.join(" · ") };
}
