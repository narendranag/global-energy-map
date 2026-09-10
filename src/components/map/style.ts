import type { StyleSpecification } from "maplibre-gl";

/**
 * OpenFreeMap "Positron" — a light, low-contrast vector basemap. Free, no API
 * key, no usage limits. CARTO `light_all` (the Phase 1–6 basemap) started
 * watermarking keyless tiles with "API KEY REQUIRED" in 2026.
 *
 * Attribution (OpenFreeMap © OpenMapTiles, data from OpenStreetMap) comes from
 * the style's TileJSON and is rendered by MapLibre's attribution control.
 * PMTiles for the basemap is deliberately deferred (see the Phase 7 review).
 */
export const basemapStyle = "https://tiles.openfreemap.org/styles/positron";

/**
 * Minimal style used only if the Positron style itself fails to load. Under
 * `MapboxOverlay` interleaved mode deck.gl draws *inside* MapLibre's style, so
 * without some style the data layers would not render at all.
 */
export const fallbackStyle: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: "background", type: "background", paint: { "background-color": "#f2f3f0" } }],
};

/**
 * Id of the first symbol (label) layer in the style, so deck.gl layers can be
 * inserted just beneath it: fills sit under country/city names, above roads
 * and boundaries. `undefined` means "no labels" → deck draws on top.
 */
export function firstSymbolLayerId(
  layers: readonly { readonly id: string; readonly type: string }[] | undefined,
): string | undefined {
  return layers?.find((l) => l.type === "symbol")?.id;
}
