import { GeoJsonLayer, ScatterplotLayer } from "@deck.gl/layers";
import type { CountryCollection, CountryProps } from "@/lib/geo/countries";
import { countryAnchor } from "@/lib/geo/country-anchors";
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
/**
 * A focus on a country with no 1:110m polygon (Singapore, Bahrain, Hong Kong,
 * Curaçao, … — see `isFocusableCountry`) is drawn as a cased ring at the
 * country's anchor instead of an outline. Same two colours and the same
 * pixel widths, so the selection reads identically; a fixed pixel radius, so
 * it stays findable at world zoom and never pretends to be an extent.
 */
const ANCHOR_RING_RADIUS_PX = 14;

function anchorRingLayers(iso3: string): ScatterplotLayer<{ iso3: string }>[] {
  const anchor = countryAnchor(iso3);
  if (anchor === undefined) return [];
  const common = {
    data: [{ iso3 }],
    getPosition: () => [anchor[0], anchor[1]] as [number, number],
    radiusUnits: "pixels" as const,
    getRadius: ANCHOR_RING_RADIUS_PX,
    filled: false,
    stroked: true,
    pickable: false,
  };
  return [
    new ScatterplotLayer<{ iso3: string }>({
      ...common,
      id: FOCUS_HALO_LAYER_ID,
      getLineColor: [...FOCUS_HALO_COLOR],
      lineWidthUnits: "pixels",
      getLineWidth: FOCUS_HALO_MIN_PX,
    }),
    new ScatterplotLayer<{ iso3: string }>({
      ...common,
      id: FOCUS_LAYER_ID,
      getLineColor: [...FOCUS_OUTLINE_COLOR],
      lineWidthUnits: "pixels",
      getLineWidth: FOCUS_OUTLINE_MIN_PX,
    }),
  ];
}

export function buildFocusLayer(
  fc: CountryCollection,
  iso3: string | null,
): (GeoJsonLayer<CountryProps> | ScatterplotLayer<{ iso3: string }>)[] {
  const focused = focusFeatures(fc, iso3);
  if (focused === null) return iso3 === null ? [] : anchorRingLayers(iso3);
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
