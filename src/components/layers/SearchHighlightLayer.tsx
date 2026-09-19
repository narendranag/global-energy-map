import { ScatterplotLayer } from "@deck.gl/layers";
import type { Layer } from "@deck.gl/core";
import type { SearchHighlightTarget } from "@/lib/search/highlight";
import {
  SEARCH_HIGHLIGHT_COLOR,
  SEARCH_HIGHLIGHT_HALO_COLOR,
  SEARCH_HIGHLIGHT_HALO_LINE_MIN_PX,
  SEARCH_HIGHLIGHT_LINE_MIN_PX,
  SEARCH_HIGHLIGHT_RADIUS,
} from "@/lib/symbology";

/** The violet ring. Stable id: e2e keys on it. */
export const SEARCH_HIGHLIGHT_LAYER_ID = "search-highlight";
/** The white casing drawn immediately beneath it. */
export const SEARCH_HIGHLIGHT_HALO_LAYER_ID = "search-highlight-halo";

/**
 * A transient ring around a search result, so a result found by name is
 * still findable once the camera lands (S4). Cleared on the next search or
 * Escape (`setSearchHighlight(null)`). Not pickable: it is a UI marker, not
 * data, and must never take a tooltip or a click from the layer beneath it.
 */
export function buildSearchHighlightLayer(target: SearchHighlightTarget | null): Layer[] {
  if (target === null) return [];
  const common = {
    data: [target],
    getPosition: (d: SearchHighlightTarget): [number, number] => [d.lon, d.lat],
    filled: false,
    stroked: true,
    pickable: false,
    radiusUnits: "pixels" as const,
    getRadius: 18,
    radiusMinPixels: SEARCH_HIGHLIGHT_RADIUS.minPixels,
    radiusMaxPixels: SEARCH_HIGHLIGHT_RADIUS.maxPixels,
    updateTriggers: { getPosition: [target.id] },
  };
  return [
    new ScatterplotLayer<SearchHighlightTarget>({
      ...common,
      id: SEARCH_HIGHLIGHT_HALO_LAYER_ID,
      getLineColor: [...SEARCH_HIGHLIGHT_HALO_COLOR],
      lineWidthMinPixels: SEARCH_HIGHLIGHT_HALO_LINE_MIN_PX,
    }),
    new ScatterplotLayer<SearchHighlightTarget>({
      ...common,
      id: SEARCH_HIGHLIGHT_LAYER_ID,
      getLineColor: [...SEARCH_HIGHLIGHT_COLOR],
      lineWidthMinPixels: SEARCH_HIGHLIGHT_LINE_MIN_PX,
    }),
  ];
}
