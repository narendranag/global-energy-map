import type { StyleSpecification } from "maplibre-gl";

/**
 * Attribution required by CARTO's basemap terms (CARTO + OpenStreetMap
 * contributors). Rendered by MapLibre's attribution control; exported so tests
 * and other chrome can reference the same string.
 */
export const BASEMAP_ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors ' +
  '© <a href="https://carto.com/attributions" target="_blank" rel="noopener noreferrer">CARTO</a>';

// CARTO `light_all` raster tiles — free with attribution, no API key.
// PMTiles for the basemap is deliberately deferred (see the Phase 7 review).
export const basemapStyle: StyleSpecification = {
  version: 8,
  sources: {
    "carto-light": {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
        "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
        "https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
        "https://d.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      maxzoom: 20,
      attribution: BASEMAP_ATTRIBUTION,
    },
  },
  layers: [{ id: "carto-light", type: "raster", source: "carto-light" }],
};
