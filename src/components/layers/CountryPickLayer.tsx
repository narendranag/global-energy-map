import { GeoJsonLayer } from "@deck.gl/layers";
import type { PickingInfo } from "@deck.gl/core";
import type { CountryCollection, CountryProps } from "@/lib/geo/countries";
import { isKnownCountry } from "@/lib/geo/iso3";
import { GAS_STORAGE_LAYER_ID } from "./GasStorageChoropleth";
import { RECENT_IMPORTS_LAYER_ID } from "./RecentImportsChoropleth";
import { RESERVES_LAYER_ID } from "./ReservesChoropleth";

export const COUNTRY_PICK_LAYER_ID = "country-pick";

/**
 * Layers whose picked object is a *country*. A click on any of these selects
 * the country under the cursor; a click on anything else (a pipeline, a
 * refinery, an LNG terminal) is a click on that thing, and must not
 * re-select the country it happens to sit in — several asset row types carry
 * an `iso3` of their own, so the id, not the shape of the object, decides.
 */
export const COUNTRY_LAYER_IDS: ReadonlySet<string> = new Set([
  COUNTRY_PICK_LAYER_ID,
  RESERVES_LAYER_ID,
  RECENT_IMPORTS_LAYER_ID,
  GAS_STORAGE_LAYER_ID,
]);

/**
 * An invisible, always-present country hit target at the very bottom of the
 * deck stack.
 *
 * Country polygons are only pickable today when a choropleth happens to be
 * on (reserves, recent imports, gas storage), but clicking a country to focus
 * it has to work in every mode — including Flows, which shows no choropleth
 * at all. deck.gl's picking pass renders each pickable layer's picking colour
 * regardless of what the layer draws, so an alpha-0 fill is invisible and
 * still hittable.
 *
 * Two things keep it out of the way:
 *  - it sits at the bottom, so any layer above wins both the tooltip and the
 *    click (deck reports the topmost pick);
 *  - it has no tooltip formatter registered in `tooltips.ts`, so when it *is*
 *    the topmost pick the tooltip dispatch returns null and nothing shows.
 *
 * Cost: 177 Natural Earth 1:110m polygons with no stroke — the cheapest
 * geometry the app draws, well under the gas-pipeline frame cost that drove
 * the Linux e2e timeouts (CLAUDE.md, Phase 10).
 */
export function buildCountryPickLayer(fc: CountryCollection): GeoJsonLayer<CountryProps> {
  return new GeoJsonLayer<CountryProps>({
    id: COUNTRY_PICK_LAYER_ID,
    data: fc,
    filled: true,
    stroked: false,
    getFillColor: [0, 0, 0, 0],
    pickable: true,
    // Nothing to recolour; keeps deck from re-uploading attributes.
    updateTriggers: {},
  });
}

/**
 * The ISO3 a click selected, or null when the click was not on a country
 * (empty sea, or a point/line layer drawn above one).
 *
 * `info.layer === null` means nothing at all was picked — the caller reads
 * that as "clicked the sea" and clears the focus.
 */
export function countryFromPick(info: PickingInfo): string | null {
  const layerId = info.layer?.id;
  if (layerId === undefined || !COUNTRY_LAYER_IDS.has(layerId)) return null;
  const props = (info.object as { properties?: { iso3?: unknown } } | null | undefined)?.properties;
  const iso3 = props?.iso3;
  return typeof iso3 === "string" && isKnownCountry(iso3) ? iso3 : null;
}
