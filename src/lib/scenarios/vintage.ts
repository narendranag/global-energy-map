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
 * helpers, and the route-share dates from the rows' own `data_year` column
 * (the year of the flows the document describes), falling back to
 * `source_year` (when it was published) only where a row states none —
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
  /**
   * The one caveat that belongs *above* the fold: the headline number is
   * trade × route share, so a wide gap between the trade year and the years
   * of the documents the shares come from changes how the headline reads.
   * See `shareGapNote`. The asset/attribution spread stays in `mismatchNote`
   * inside the disclosure — it moves no headline figure.
   */
  readonly shareGapNote: string | null;
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

/** The `disruption_route` citation columns that date a share. */
export interface RouteVintageRow {
  readonly source_title: string;
  readonly source_year: number | null;
  readonly data_year?: number | null;
}

/** Spread at which the gap between two vintages changes how a number reads. */
export const MISMATCH_SPREAD_YEARS = 3;

/** Anything carrying a route share's two years — the rows, or less. */
export interface DatedRouteRow {
  /** The year the cited document was **published**. */
  readonly source_year?: number | null;
  /** The year of the flows or routing it **describes**; null where unstated. */
  readonly data_year?: number | null;
  /** Present so an unsourced estimate can be told apart from a dated row. */
  readonly source_title?: string | null;
}

/** `source_title` of a row no document supports (build_disruption_routing.py). */
const UNSOURCED_TITLE = "Analyst estimate (unsourced)";

/**
 * The two ways a route share can be dated, counted and listed.
 *
 * `disruption_route` carries both years: `data_year` is the year of the flows
 * the document describes, `source_year` the year it was published. The second
 * is not a substitute for the first — a 2026 document describing 2025 flows
 * is not 2026 routing — so they are kept apart here, and every surface says
 * which one it is showing.
 *
 * A row with no document behind it (an analyst estimate) contributes neither:
 * its `source_year` is a 2026 default the pipeline keeps for compatibility,
 * not a publication date, and quoting it as one would invent provenance.
 *
 * With two scenarios combined the caller passes both scenarios' rows: the
 * headline is one number built from all of them.
 */
export interface RouteYears {
  /** Distinct years of the flows the shares describe, oldest first. */
  readonly data: readonly number[];
  /** Distinct publication years of rows that state no data year. */
  readonly published: readonly number[];
  /** How many rows state the year of the flows they describe. */
  readonly datedCount: number;
  /** How many are dated only by their document's publication year. */
  readonly publishedOnlyCount: number;
  /**
   * Data year where the row has one, else its publication year — the best
   * available date per row, and what a gap against the trade year is
   * measured on. Never shown as "the route-share years": it mixes the two.
   */
  readonly effective: readonly number[];
}

const sortedUnique = (ys: readonly number[]): number[] => [...new Set(ys)].sort((a, b) => a - b);

export function routeYears(routes: readonly DatedRouteRow[] | null): RouteYears {
  const data: number[] = [];
  const published: number[] = [];
  const effective: number[] = [];
  for (const r of routes ?? []) {
    if (r.source_title === UNSOURCED_TITLE) continue;
    const dy = typeof r.data_year === "number" ? r.data_year : null;
    const py = typeof r.source_year === "number" ? r.source_year : null;
    if (dy !== null) {
      data.push(dy);
      effective.push(dy);
    } else if (py !== null) {
      published.push(py);
      effective.push(py);
    }
  }
  return {
    data: sortedUnique(data),
    published: sortedUnique(published),
    datedCount: data.length,
    publishedOnlyCount: published.length,
    effective: sortedUnique(effective),
  };
}

/** "2025" or "2018–2025"; "" for an empty list. */
export function yearSpan(years: readonly number[]): string {
  const first = years[0];
  const last = years[years.length - 1];
  if (first === undefined || last === undefined) return "";
  return first === last ? first.toString() : `${first.toString()}–${last.toString()}`;
}

/**
 * How a set of route shares is dated, in two words: "dated 2025" where the
 * documents say which year's flows they describe, "published 2019" where all
 * we know is when they were written. Null when neither is known.
 *
 * A mixed run reads as "dated …": the rows that state no data year state
 * nothing, and folding a publication year into a data-year span would quietly
 * present one as the other. Those rows are disclosed by count instead.
 */
export function routeYearsPhrase(y: RouteYears): string | null {
  if (y.data.length > 0) return `dated ${yearSpan(y.data)}`;
  if (y.published.length > 0) return `published ${yearSpan(y.published)}`;
  return null;
}

/**
 * The caveat shown *under the headline* when the route shares are from a
 * different era than the trade they are applied to.
 *
 * The headline number is (trade in year Y) × (a routing share documented in
 * year D). When |Y − D| is wide enough, saying only "2024 trade" makes a
 * 2019 routing read as current — which is the thing this note exists to
 * stop. The test is the **widest** gap in the run, so a span that reaches
 * back (Malacca's 2017–2026) trips it even though its newest document is
 * current: one stale document in the mix is enough to move the number.
 *
 * Returns null when nothing is dated (the disclosure already says so) or
 * when every document sits within `MISMATCH_SPREAD_YEARS` of the trade year.
 */
export function shareGapNote(
  tradeYear: number,
  routes: readonly DatedRouteRow[] | null,
): string | null {
  const y = routeYears(routes);
  const first = y.effective[0];
  const last = y.effective[y.effective.length - 1];
  if (first === undefined || last === undefined) return null;
  const gap = Math.max(Math.abs(tradeYear - first), Math.abs(tradeYear - last));
  if (gap < MISMATCH_SPREAD_YEARS) return null;
  const tail = `trade is ${tradeYear.toString()}. Routing that changed in between is not reflected.`;
  // Which year is being compared with the trade year is the whole point: a
  // document's publication year is not the year of the flows it describes,
  // and a note that blurred the two would be the thing it exists to prevent.
  if (y.data.length === 0) {
    return `Route shares come from documents published ${yearSpan(y.published)}; ${tail}`;
  }
  if (y.publishedOnlyCount === 0) {
    return `Route shares describe ${yearSpan(y.data)} flows; ${tail}`;
  }
  const n = y.publishedOnlyCount;
  return (
    `Route shares describe ${yearSpan(y.data)} flows, and ${n.toString()} more ` +
    `${n === 1 ? "is" : "are"} dated only by their document's publication year ` +
    `(${yearSpan(y.published)}); ${tail}`
  );
}

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
    const years = routeYears(routeRows);
    // The row is dated by the flows its documents describe where they say so,
    // and only falls back to publication years when none of them does.
    const dating = years.data.length > 0 ? years.data : years.published;
    const last = dating[dating.length - 1];
    const dated = last !== undefined;
    const dataEnd = dated ? periodEnd(last.toString(), "year") : "";
    const undatedCount = routeRows.filter(
      (r) => r.source_year === null || r.source_title === UNSOURCED_TITLE,
    ).length;
    const stale = staleFor(dataEnd, today);
    rows.push({
      role: "route_shares",
      label: "Route shares",
      sources: sourceNames(routeEntries),
      through: routeYearsPhrase(years) ?? "no date recorded",
      dataEnd,
      stale,
      note: joinNotes([
        // What the year on a share actually is. Where the documents say which
        // year's flows they describe, that is the year shown; where they do
        // not, all that is left is when they were published, and the routing
        // is usually a year or more older than that.
        years.data.length > 0
          ? "Each year is the year of the flows the document describes, not when it was published."
          : years.published.length > 0
            ? "These are publication years: the documents do not say which year's flows they describe, and the routing is usually a year or more older."
            : null,
        years.data.length > 0 && years.publishedOnlyCount > 0
          ? `${years.publishedOnlyCount.toString()} of ${routeRows.length.toString()} shares state only when their document was published: either the document never says which year's flows its figure is, or the share is structural — a route a cargo must physically take, which has no year at all.`
          : null,
        undatedCount > 0
          ? `${undatedCount.toString()} of ${routeRows.length.toString()} shares are an analyst estimate with no published document behind them.`
          : null,
        stale && dated
          ? `${years.data.length > 0 ? `The newest routing any of these documents describes is ${last.toString()}` : `The most recent supporting document is from ${last.toString()}`}; route shares change with sanctions, new bypass capacity and rerouting.`
          : null,
      ]),
    });
    if (dated) summaryParts.push(`shares ${shortYearRange(dating[0] ?? last, last)}`);
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

  return {
    tradeYear,
    rows,
    spreadYears,
    mismatchNote,
    shareGapNote: shareGapNote(tradeYear, routeRows),
    summary: summaryParts.join(" · "),
  };
}
