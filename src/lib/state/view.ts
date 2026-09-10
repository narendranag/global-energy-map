/**
 * Map camera state shared by the app store, the URL serialiser and MapShell.
 *
 * MapLibre owns the camera (deck.gl renders through `MapboxOverlay`), so these
 * bounds are applied once, as MapLibre's `minZoom`/`maxZoom`. The data layers
 * (simplified pipelines, 1:110m countries) stop being useful past z8.
 */
export interface MapView {
  readonly lon: number;
  readonly lat: number;
  readonly zoom: number;
}

export const MIN_ZOOM = 0;
export const MAX_ZOOM = 8;

/** Web-Mercator latitude limit (MapLibre clamps to the same value). */
export const MAX_LAT = 85.0511;

export const DEFAULT_VIEW: MapView = { lon: 40, lat: 25, zoom: 2 };

/** Decimal places kept in the URL and store: ~1 km of lon/lat, 1/100 zoom. */
const VIEW_DECIMALS = 2;

function round(n: number): number {
  const f = 10 ** VIEW_DECIMALS;
  // `+ 0` turns -0 into 0 so it serialises as "0".
  return Math.round(n * f) / f + 0;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Wrap a longitude into [-180, 180). */
function wrapLon(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

/** Wrap lon, clamp lat/zoom to the map's limits, and round to URL precision. */
export function normalizeView(view: MapView): MapView {
  return {
    lon: round(wrapLon(view.lon)),
    lat: round(clamp(view.lat, -MAX_LAT, MAX_LAT)),
    zoom: round(clamp(view.zoom, MIN_ZOOM, MAX_ZOOM)),
  };
}

export function sameView(a: MapView, b: MapView): boolean {
  return a.lon === b.lon && a.lat === b.lat && a.zoom === b.zoom;
}
