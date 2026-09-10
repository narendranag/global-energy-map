/**
 * Zoom-aware sizing and gating (D1). Pure functions of the map zoom (read by
 * callers from `useMapView()`), quantised so a settled pan at the same zoom
 * never changes a layer prop.
 */
import type { LayerState } from "@/components/layers/LayerPanel";

type LayerKey = keyof LayerState;

/**
 * Layers hidden below a zoom: 26 k storage hubs and 3.7 k port anchors turn
 * every coastline into a smudge at world scale.
 */
export const MIN_ZOOM: Readonly<Partial<Record<LayerKey, number>>> = {
  storage: 4,
  ports: 4,
};

/** Smallest zoom at which `key` draws (0 = always). */
export function minZoomFor(key: LayerKey): number {
  return MIN_ZOOM[key] ?? 0;
}

/** True when `key` is switched on but hidden because the map is zoomed out too far. */
export function isZoomGated(key: LayerKey, zoom: number): boolean {
  return zoom < minZoomFor(key);
}

/** Round to the nearest 0.05 so tiny zoom jitter does not rebuild layers. */
function quantise(x: number): number {
  return Math.round(x * 20) / 20;
}

/** Piecewise-linear interpolation through (zoom, value) stops, clamped at both ends. */
function ramp(zoom: number, stops: readonly (readonly [number, number])[]): number {
  const first = stops[0];
  const last = stops[stops.length - 1];
  if (!first || !last) return 1;
  if (!Number.isFinite(zoom) || zoom <= first[0]) return first[1];
  if (zoom >= last[0]) return last[1];
  for (let i = 1; i < stops.length; i++) {
    const [z1, v1] = stops[i] ?? last;
    const [z0, v0] = stops[i - 1] ?? first;
    if (zoom <= z1) return v0 + ((zoom - z0) / (z1 - z0)) * (v1 - v0);
  }
  return last[1];
}

/**
 * Multiplier on glyph pixel sizes: 0.7 at world view (z ≤ 2), full size from
 * z 5. Applied to icon `sizeScale` and scatter min/max pixel clamps.
 */
export function glyphScale(zoom: number): number {
  return quantise(ramp(zoom, [[2, 0.7], [3, 0.8], [4, 0.9], [5, 1]]));
}

/** Extraction sites (5 k dots) stay faint at world view and fade in from z 3. */
export function extractionOpacity(zoom: number): number {
  return quantise(ramp(zoom, [[2.5, 0.5], [4, 1]]));
}
