import type { SearchItem, SearchKind } from "./types";

/** One line per kind, shown beside every result so duplicate names (many "Refinery") disambiguate. */
export const SEARCH_KIND_LABEL: Readonly<Record<SearchKind, string>> = {
  country: "Country",
  pipeline_oil: "Oil pipeline",
  pipeline_gas: "Gas pipeline",
  refinery: "Refinery",
  extraction_site: "Extraction site",
  lng_export: "LNG export terminal",
  lng_import: "LNG import terminal",
  basin: "Basin",
  shale_region: "US shale region",
};

/** "Refinery · SAU · Saudi Aramco" — kind, then country, then operator, whatever the item has. */
export function searchResultSubtitle(item: SearchItem): string {
  const parts = [SEARCH_KIND_LABEL[item.kind]];
  if (item.countryIso3 !== null) parts.push(item.countryIso3);
  if (item.operator !== null) parts.push(item.operator);
  return parts.join(" · ");
}
