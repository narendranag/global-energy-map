import { normalizeText } from "./normalize";
import type { SearchItem, SearchKind } from "./types";

/** Default cap on results returned to the UI, grouped by kind. */
export const SEARCH_RESULT_LIMIT = 8;

/**
 * Kind priority when two results tie on match tier: countries first, then
 * everything else in a fixed, stable order (so "grouped by kind" reads the
 * same way every time).
 */
const KIND_ORDER: readonly SearchKind[] = [
  "country",
  "pipeline_oil",
  "pipeline_gas",
  "refinery",
  "lng_export",
  "lng_import",
  "extraction_site",
  "basin",
  "shale_region",
];
const KIND_RANK = new Map<SearchKind, number>(KIND_ORDER.map((k, i) => [k, i]));

/** Only a bare 3-letter code looks like an ISO3 query — "USA", not "USAF". */
const ISO3_PATTERN = /^[a-z]{3}$/;

/**
 * Best matches for `rawQuery`, cheapest to costliest: an exact ISO3 hit on a
 * country beats everything, then exact name, then prefix, then substring.
 * Ties break on kind (countries first), then name, then id — so the same
 * query always returns the same order. Capped at `limit`.
 *
 * O(n) over `items` per keystroke: every string compared here (`nameKey`,
 * `iso3Key`) was normalised once at index build, not on each call.
 */
export function searchItems(
  items: readonly SearchItem[],
  rawQuery: string,
  limit = SEARCH_RESULT_LIMIT,
): readonly SearchItem[] {
  const query = normalizeText(rawQuery.trim());
  if (query === "") return [];
  const iso3Query = ISO3_PATTERN.test(query) ? query : null;

  const matches: { item: SearchItem; tier: number }[] = [];
  for (const item of items) {
    let tier: number;
    if (iso3Query !== null && item.iso3Key === iso3Query) {
      tier = 0;
    } else if (item.nameKey === query) {
      tier = 1;
    } else if (item.nameKey.startsWith(query)) {
      tier = 2;
    } else if (item.nameKey.includes(query)) {
      tier = 3;
    } else {
      continue;
    }
    matches.push({ item, tier });
  }

  matches.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    const ra = KIND_RANK.get(a.item.kind) ?? KIND_ORDER.length;
    const rb = KIND_RANK.get(b.item.kind) ?? KIND_ORDER.length;
    if (ra !== rb) return ra - rb;
    if (a.item.name !== b.item.name) return a.item.name < b.item.name ? -1 : 1;
    return a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0;
  });

  return matches.slice(0, limit).map((m) => m.item);
}
