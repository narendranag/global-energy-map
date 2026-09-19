import { GeoJsonLayer } from "@deck.gl/layers";
import type { CountryCollection, CountryProps } from "@/lib/geo/countries";
import {
  FOCUS_HALO_COLOR,
  FOCUS_HALO_MIN_PX,
  FOCUS_OUTLINE_COLOR,
  FOCUS_OUTLINE_MIN_PX,
} from "@/lib/symbology";

/** The dark line. Stable: e2e and the deck stack key on it. */
export const FOCUS_LAYER_ID = "focus-outline";
/** The white casing drawn immediately beneath it. */
export const FOCUS_HALO_LAYER_ID = "focus-outline-halo";

/** The focused country's feature, or null when `iso3` is null / not in `fc`. */
export function focusFeatures(
  fc: CountryCollection,
  iso3: string | null,
): CountryCollection | null {
  if (iso3 === null) return null;
  const features = fc.features.filter((f) => f.properties.iso3 === iso3);
  return features.length > 0 ? { type: "FeatureCollection", features } : null;
}

/**
 * Outline of the focused country, as a cased line: `[halo, line]`, bottom
 * first — the caller splices both into the deck stack above the choropleth
 * fills and below the point layers, so the selection frames the ground
 * without covering the marks on it. Returns `[]` when nothing is focused.
 *
 * Not pickable: the country beneath it stays clickable (clicking the focused
 * country again is how you clear the selection), and it must never take a
 * tooltip from the layer it is drawn over.
 */
export function buildFocusLayer(
  fc: CountryCollection,
  iso3: string | null,
): GeoJsonLayer<CountryProps>[] {
  const focused = focusFeatures(fc, iso3);
  if (focused === null) return [];
  const common = {
    data: focused,
    filled: false,
    stroked: true,
    // The selection is UI state, not data: it may not bleed into hit testing
    // or the tooltip dispatch.
    pickable: false,
  } as const;
  return [
    new GeoJsonLayer<CountryProps>({
      ...common,
      id: FOCUS_HALO_LAYER_ID,
      getLineColor: [...FOCUS_HALO_COLOR],
      lineWidthMinPixels: FOCUS_HALO_MIN_PX,
      lineWidthMaxPixels: FOCUS_HALO_MIN_PX,
    }),
    new GeoJsonLayer<CountryProps>({
      ...common,
      id: FOCUS_LAYER_ID,
      getLineColor: [...FOCUS_OUTLINE_COLOR],
      lineWidthMinPixels: FOCUS_OUTLINE_MIN_PX,
      lineWidthMaxPixels: FOCUS_OUTLINE_MIN_PX,
    }),
  ];
}
