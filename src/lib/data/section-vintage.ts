/**
 * One line that says where a number came from and when its data ends.
 *
 * Decision 2026-09-21 (with the year slider gone): **every** information
 * surface that shows a number states its own data vintage, and states it
 * from `public/data/catalog.json` — never a hand-typed year or date. This is
 * the one helper behind all of them: the country panel's sections, every
 * layer tooltip, the scenario panel's Context block and the country CSV
 * header. A refreshed source therefore moves every sentence at once, and two
 * surfaces showing the same data cannot date it differently.
 *
 * The vintage itself comes from `vintageForTag` (catalog `coverage` where a
 * source declares one, else its `as_of` snapshot date), so a release date is
 * never passed off as a data date: the EI 2026 edition still carries reserves
 * only to 2020.
 *
 * Pure. Unit-tested in tests/unit/data/section-vintage.test.ts.
 */
import type { Catalog, CatalogEntry } from "@/lib/data-catalog/types";
import { catalogEntriesFor, sourceEntry } from "./sources";
import {
  formatVintage,
  isStale,
  staleNote,
  vintageForTag,
  type DataVintage,
} from "./vintage";

/** One dated thing inside a section ("reserves" and "production" share one). */
export interface VintagePart {
  /**
   * What this part is, when a section shows more than one dated series
   * ("reserves", "production"). Omitted when the section shows one thing.
   */
  readonly label?: string;
  /** Catalog `layers` tag: "trade", "reserves:gas", "gas_storage", … */
  readonly tag: string;
}

export interface SectionVintagePart {
  readonly label: string | null;
  readonly tag: string;
  /** Publisher names from the catalog, deduplicated, in catalog order. */
  readonly sources: readonly string[];
  /** "to 2024" · "to May 2026" · "as of 17 May 2026". */
  readonly vintage: string;
  readonly dataEnd: string;
  readonly stale: boolean;
  /** Why it is marked old; null when it is not. */
  readonly note: string | null;
}

export interface SectionVintageInfo {
  readonly parts: readonly SectionVintagePart[];
  /** Every source named, deduplicated. */
  readonly sources: readonly string[];
  readonly stale: boolean;
  /** The year the section's numbers are shown for, when it differs from the data's end. */
  readonly shownFor: number | null;
  /** The whole line: "BACI (CEPII) · data to 2024". */
  readonly text: string;
  /** Hover text: the "old" notes, or null when nothing is old. */
  readonly title: string | null;
}

/**
 * Display form of a catalog `source_name`. Only a trailing " — …" qualifier
 * is dropped ("Gas Infrastructure Europe — AGSI + ALSI" → "Gas Infrastructure
 * Europe"): it names the sub-product, which the section heading already says,
 * and an 11px line has no room for it. Nothing is renamed — a shortened name
 * still resolves to the same catalog entry.
 */
export function shortSource(name: string): string {
  return (name.split(" — ")[0] ?? name).trim();
}

/** Whether this entry declares a coverage span that covers `tag`. */
function hasSpanFor(e: CatalogEntry, tag: string): boolean {
  return (e.coverage ?? []).some((s) => !s.layers || s.layers.includes(tag));
}

/**
 * The publishers the stated vintage actually belongs to.
 *
 * A series is dated by the entries that declare coverage, never by the ones
 * that merely carry the same tag: `countries.geojson` is tagged "reserves"
 * because it supplies the polygons, and naming Natural Earth beside a
 * reserves figure would credit it with data it does not hold. A snapshot is
 * the other way round — every undated contributor is a real source of those
 * rows (refineries = NETL topped up with OSM), so all of them are named.
 */
function sourcesOf(entries: readonly CatalogEntry[], tag: string, kind: DataVintage["kind"]): string[] {
  const dating = entries.filter((e) => hasSpanFor(e, tag) === (kind === "series"));
  return [...new Set((dating.length > 0 ? dating : entries).map((e) => shortSource(e.source_name)))];
}

function toPart(
  part: VintagePart,
  catalog: Catalog | undefined,
  today: string | null,
): SectionVintagePart | null {
  const entries = catalogEntriesFor(part.tag, catalog);
  const v = vintageForTag(part.tag, catalog, entries);
  if (v === null) return null;
  const stale = today !== null && isStale(v, today);
  return {
    label: part.label ?? null,
    tag: part.tag,
    sources: sourcesOf(entries, part.tag, v.kind),
    vintage: formatVintage(v),
    dataEnd: v.dataEnd,
    stale,
    // `stale` implies a non-null `today` (aliased narrowing).
    note: stale ? staleNote(v, today) : null,
  };
}

/** "reserves to 2020" · "data to 2024" · "as of 17 May 2026", plus "(old)". */
function phrase(p: SectionVintagePart): string {
  const body =
    p.label !== null
      ? `${p.label} ${p.vintage}`
      : p.vintage.startsWith("to ")
        ? `data ${p.vintage}`
        : p.vintage;
  return p.stale ? `${body} (old)` : body;
}

/** The same phrase where each part must name its own source: "storage: GIE to …". */
function phraseWithSource(p: SectionVintagePart): string {
  const head = p.label === null ? "" : `${p.label}: `;
  const body = `${head}${p.sources.join(", ")} ${p.vintage}`;
  return p.stale ? `${body} (old)` : body;
}

/** Whether `year` is worth stating beside the data's own end year. */
function differsFromYear(p: SectionVintagePart, year: number): boolean {
  // Only annual series are read "at" a year; a daily or monthly series is
  // always shown at its own latest reading, and a snapshot has no year at all.
  return p.vintage.startsWith("to ") && /^to \d{4}$/.test(p.vintage) && p.vintage !== `to ${year.toString()}`;
}

/**
 * The vintage line for one information surface.
 *
 * `parts` is a tag, or several (a section showing more than one dated
 * series labels each). `year` is the year the section's numbers are shown
 * for: when an annual series ends in a different year, the line says both
 * ("shown for 2024; reserves to 2020"), because a reader who is told only one
 * of the two will assume they are the same. `today` decides staleness and is
 * injected, never read from the clock, so the same inputs always render the
 * same line (the CSV header passes its export date).
 *
 * Returns null when no part is catalogued at all — the caller then shows no
 * line rather than an empty one.
 */
export function sectionVintage(
  parts: string | readonly (string | VintagePart)[],
  opts: {
    readonly year?: number | null;
    readonly today?: string | null;
    readonly catalog?: Catalog;
  } = {},
): SectionVintageInfo | null {
  const list = (typeof parts === "string" ? [parts] : parts).map((p) =>
    typeof p === "string" ? { tag: p } : p,
  );
  const today = opts.today ?? null;
  const built = list
    .map((p) => toPart(p, opts.catalog, today))
    .filter((p): p is SectionVintagePart => p !== null);
  if (built.length === 0) return null;

  const year = opts.year ?? null;
  const shownFor = year !== null && built.some((p) => differsFromYear(p, year)) ? year : null;
  const sources = [...new Set(built.flatMap((p) => p.sources))];
  // One source list for the whole section reads as one sentence; several need
  // each phrase to carry its own, or the reader cannot tell which is which.
  const oneVoice = built.every((p) => p.sources.join("|") === built[0]?.sources.join("|"));
  const prefix = shownFor === null ? "" : `shown for ${shownFor.toString()}; `;
  const text = oneVoice
    ? `${sources.join(", ")} · ${prefix}${built.map(phrase).join(", ")}`
    : `${prefix}${built.map(phraseWithSource).join(" · ")}`;
  const notes = built.map((p) => p.note).filter((n): n is string => n !== null);

  return {
    parts: built,
    sources,
    stale: built.some((p) => p.stale),
    shownFor,
    text,
    title: notes.length === 0 ? null : notes.join(" "),
  };
}

/**
 * The tooltip tail: source, then that row's own data vintage.
 *
 * Replaces the bare "Source: … (as of …)" every tooltip used to end with,
 * which printed the file's release date even where the catalog knows the
 * data stops years earlier (BACI's 2026 release covers trade to 2024). On a
 * multi-source layer `rowSource` picks the row's own entry, so an
 * OpenStreetMap refinery is dated by the OSM extract and a NETL one by GOGI.
 */
export function sourceVintageLine(
  tag: string,
  rowSource?: string | null,
  catalog?: Catalog,
): string | null {
  const e = sourceEntry(tag, rowSource, catalog);
  if (e === undefined) return null;
  const v: DataVintage | null = vintageForTag(tag, catalog, [e]);
  if (v === null) return `Source: ${e.source_name} (as of ${e.as_of})`;
  return v.kind === "series"
    ? `Source: ${e.source_name} · data ${formatVintage(v)} (released ${e.as_of})`
    : `Source: ${e.source_name} · snapshot ${formatVintage(v)}`;
}

/** The span of publication years across a set of cited rows. */
export interface YearSpan {
  readonly from: number;
  readonly through: number;
}

/**
 * When the documents behind a set of route shares were published, from the
 * rows' own `source_year` column — never from the `disruption_route` entry's
 * `as_of`, which is the day the table was rebuilt.
 *
 * The scenario panel states this per scenario (`src/lib/scenarios/vintage.ts`);
 * this is the country panel's own cheap derivation over the rows its exposure
 * loader already holds, deliberately independent of it. Worth unifying if a
 * third caller appears.
 */
export function routeSourceYearSpan(
  rows: readonly { readonly source_year: number | null }[],
): YearSpan | null {
  let from: number | null = null;
  let through: number | null = null;
  for (const r of rows) {
    const y = r.source_year;
    if (y === null || !Number.isFinite(y)) continue;
    if (from === null || y < from) from = y;
    if (through === null || y > through) through = y;
  }
  return from === null || through === null ? null : { from, through };
}

/** "2019" or "2013–2025". */
export function formatYearSpan(span: YearSpan): string {
  return span.from === span.through
    ? span.from.toString()
    : `${span.from.toString()}–${span.through.toString()}`;
}
