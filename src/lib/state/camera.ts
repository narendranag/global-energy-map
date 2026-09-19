/**
 * The camera *command* seam (S0).
 *
 * `MapView` (lon/lat/zoom) is where the camera **is** — owned by the store,
 * written by MapLibre's `moveend`, serialised to the URL. A `CameraRequest`
 * is where a caller wants it to **go**: a one-shot command posted through the
 * store (`requestCamera`) and executed by MapShell, which is the only place
 * that holds the map handle.
 *
 * Keeping it a command rather than a second piece of state matters: a fit to a
 * country's bounds is a *shape*, not a lon/lat/zoom, and only the map knows
 * the viewport size it has to fit into. Nothing here is serialised — the URL
 * still carries only the resulting `lon`/`lat`/`z`.
 */

/** `[west, south, east, north]` in degrees, as MapLibre's `LngLatBoundsLike`. */
export type Bounds = readonly [west: number, south: number, east: number, north: number];

/** Viewport padding in CSS pixels, so a target can clear the panels. */
export interface CameraPadding {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export type CameraRequest =
  | {
      readonly kind: "fitBounds";
      readonly bounds: Bounds;
      readonly padding?: Partial<CameraPadding>;
      /** Never zoom in further than this while fitting (default `FIT_MAX_ZOOM`). */
      readonly maxZoom?: number;
    }
  | {
      readonly kind: "flyTo";
      readonly lon: number;
      readonly lat: number;
      readonly zoom?: number;
    };

/**
 * A country fit stops here. Past z6 the 1:110m polygons and the simplified
 * pipelines stop being worth the zoom, and a small state (Qatar, Brunei) would
 * otherwise fill the screen with a basemap nobody asked for.
 */
export const FIT_MAX_ZOOM = 6;

/** Padding applied when a caller passes none. */
export const DEFAULT_CAMERA_PADDING: CameraPadding = { top: 32, right: 32, bottom: 32, left: 32 };

/**
 * Panel-aware padding. The left layer panel is `w-72` (18rem) at `left-4`, the
 * scenario panel `min(26rem, 100%)` at `right-4`; the year slider and
 * commodity toggle occupy the bottom ~9rem. Callers say which panels are on
 * screen and get a padding that keeps the target clear of them.
 */
export function panelPadding(open: {
  readonly left?: boolean;
  readonly right?: boolean;
  readonly bottom?: boolean;
}): CameraPadding {
  const rem = 16;
  return {
    top: 2 * rem,
    right: open.right === true ? 27 * rem : 2 * rem,
    bottom: open.bottom === false ? 2 * rem : 9 * rem,
    left: open.left === false ? 2 * rem : 19 * rem,
  };
}

/** Fill in the sides a caller left out. */
export function resolvePadding(padding?: Partial<CameraPadding>): CameraPadding {
  return { ...DEFAULT_CAMERA_PADDING, ...padding };
}

/**
 * True when the viewer asked for less motion. Camera commands then jump
 * instead of flying (WCAG 2.3.3). Safe on the server and in jsdom, where
 * `matchMedia` may be missing.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}
