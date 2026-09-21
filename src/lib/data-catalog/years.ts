import { BUNDLED_CATALOG } from "./bundled";
import type { Catalog, CoverageSpan } from "./types";

/**
 * The year constants the UI states, read from catalog `coverage` instead of
 * being typed by hand.
 *
 * Every one of these used to be a literal (`YEAR_MAX = 2024`,
 * `RESERVES_LATEST_YEAR = 2020`, `TRADE_FIRST_YEAR` written out three times),
 * which meant a data refresh could leave the map telling a reader a vintage
 * the rows no longer have. `catalog.json` already records what each file
 * actually covers — `build_catalog.py` measures it from the parquet — so it is
 * the one place these can come from.
 *
 * This module is deliberately a **leaf**: it imports the bundled catalog and
 * its types, nothing else. `symbology`, `time/range`, `modes`, `trade-flows`
 * and `country-profile` all need these numbers, and several of them are
 * already on each other's import paths (`data/vintage.ts` → `symbology`), so
 * anything heavier here would close a cycle.
 *
 * Nothing here falls back to a literal. A missing entry or coverage span
 * throws at module load, because a silent default is exactly the stale number
 * this replaces.
 */

/** An inclusive span of whole years. */
export interface YearSpan {
  readonly from: number;
  readonly through: number;
}

function yearOf(period: string, entryId: string): number {
  const year = Number(period.slice(0, 4));
  if (!Number.isInteger(year) || year < 1000) {
    throw new Error(`catalog entry "${entryId}": coverage period "${period}" has no year`);
  }
  return year;
}

function spansOf(catalog: Catalog, entryId: string): readonly CoverageSpan[] {
  const entry = catalog.entries.find((e) => e.id === entryId);
  if (!entry) {
    throw new Error(`catalog has no entry "${entryId}" — the app's year constants read it`);
  }
  const spans = entry.coverage ?? [];
  if (spans.length === 0) {
    throw new Error(`catalog entry "${entryId}" has no coverage span — cannot derive its years`);
  }
  return spans;
}

function union(spans: readonly CoverageSpan[], entryId: string): YearSpan {
  const from = Math.min(...spans.map((s) => yearOf(s.from, entryId)));
  const through = Math.max(...spans.map((s) => yearOf(s.through, entryId)));
  return { from, through };
}

/**
 * The years a catalog entry covers, at year grain (a day- or month-grained
 * span is read down to its year, which is what a year-keyed UI wants).
 *
 * `tag` picks one metric out of an entry that records coverage per layer —
 * the EI entry carries reserves through 2020 and production through 2025, and
 * `vintageForTag` in `src/lib/data/vintage.ts` already reads it that way.
 * Omitting `tag` on such an entry **throws** rather than quietly unioning the
 * two: "the EI years" is not a well-formed question.
 */
export function coverageYears(catalog: Catalog, entryId: string, tag?: string): YearSpan {
  const spans = spansOf(catalog, entryId);
  if (tag === undefined) {
    if (spans.length > 1) {
      const metrics = spans.map((s) => (s.layers ?? []).join("/")).join(", ");
      throw new Error(
        `catalog entry "${entryId}" records coverage per layer — pass one of ${metrics}`,
      );
    }
    return union(spans, entryId);
  }
  const matching = spans.filter((s) => !s.layers || s.layers.includes(tag));
  if (matching.length === 0) {
    throw new Error(`catalog entry "${entryId}" has no coverage for layer "${tag}"`);
  }
  return union(matching, entryId);
}

/** Every year the entry covers, across all its metrics — the outer bounds. */
export function entryYears(catalog: Catalog, entryId: string): YearSpan {
  return union(spansOf(catalog, entryId), entryId);
}

// ── The constants, evaluated once against the bundled catalog ───────────────

/** Catalog entry ids these constants are derived from. */
export const EI_ENTRY_ID = "ei_country_year";
export const TRADE_ENTRY_ID = "baci_2709";
export const VOYAGES_ENTRY_ID = "lng_t3_voyages";

const EI = entryYears(BUNDLED_CATALOG, EI_ENTRY_ID);
const RESERVES = coverageYears(BUNDLED_CATALOG, EI_ENTRY_ID, "reserves");
const TRADE = coverageYears(BUNDLED_CATALOG, TRADE_ENTRY_ID);
const VOYAGES = coverageYears(BUNDLED_CATALOG, VOYAGES_ENTRY_ID);

/**
 * Last year the EI Statistical Review publishes proved reserves for. EI has
 * not refreshed reserves since 2020 while production runs on, so the reserves
 * choropleth freezes here however recent the selected year is.
 */
export const RESERVES_LATEST_YEAR = RESERVES.through;

/** BACI's reconciled bilateral trade coverage — the scenario engine's anchor. */
export const TRADE_FIRST_YEAR = TRADE.from;
export const TRADE_LAST_YEAR = TRADE.through;

/** LNG-T3 voyage coverage; outside it there are no voyage rows. */
export const LNG_T3_FIRST_YEAR = VOYAGES.from;
export const LNG_T3_LAST_YEAR = VOYAGES.through;

/**
 * The app's time axis. The floor is the first EI country-year (the longest
 * series the app holds); the ceiling is the last reconciled BACI year, which
 * is both the default reading year and the bound `clampYear` applies to a
 * `year=` in a link.
 */
export const YEAR_MIN = EI.from;
export const YEAR_MAX = TRADE_LAST_YEAR;
