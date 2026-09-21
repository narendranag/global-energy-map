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
      /**
       * Keep the point clear of the panels, exactly as a `fitBounds` does.
       * A fly-to from a panel used to drop its target dead centre, which on a
       * desktop is behind the scenario panel that sent it there (finding 14).
       *
       * It is applied as a pixel *offset* rather than MapLibre's camera
       * `padding`: `padding` in a `flyTo`/`jumpTo` is sticky — it becomes the
       * map's padding for every later interaction — while an offset shifts
       * this one move and nothing else.
       */
      readonly padding?: Partial<CameraPadding>;
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
 * Panel-aware padding, and the **only** place a panel's width turns into a
 * camera inset — three features now fit the map around these panels (S0's
 * focus fit, S1's scenario fit and its ranked rows, S3's country panel), and
 * a second copy of the arithmetic would go stale the first time a panel is
 * resized.
 *
 * The left layer panel is `w-72` (18rem) at `left-4`; the scenario panel
 * `min(26rem, 100%)` at `right-4`; the country panel 21rem, at `right-4`
 * alone or at `right-[26rem]` beside the scenario panel; the commodity
 * toggle (and, for a pinned-year link, the "as of" chip above it) occupy the
 * bottom ~9rem. Callers say which panels are on screen and get a padding
 * that keeps the target clear of them.
 */
export function panelPadding(open: {
  readonly left?: boolean;
  readonly right?: boolean;
  readonly bottom?: boolean;
  /** The country panel (S3), which stacks to the left of the scenario panel. */
  readonly country?: boolean;
}): CameraPadding {
  const rem = 16;
  const scenario = open.right === true;
  const right = open.country === true ? (scenario ? 49 : 23) : scenario ? 27 : 2;
  return {
    top: 2 * rem,
    right: right * rem,
    bottom: open.bottom === false ? 2 * rem : 9 * rem,
    left: open.left === false ? 2 * rem : 19 * rem,
  };
}

/** Fill in the sides a caller left out. */
export function resolvePadding(padding?: Partial<CameraPadding>): CameraPadding {
  return { ...DEFAULT_CAMERA_PADDING, ...padding };
}

/**
 * The screen offset that centres a point inside a padded viewport — how a
 * `flyTo` honours `padding` without setting the map's sticky camera padding.
 *
 * A point centred in the box left over after the insets sits
 * `(left - right) / 2` to the right of the viewport centre and
 * `(top - bottom) / 2` below it; MapLibre's `offset` moves the target by
 * that many pixels, so the sign is exactly that. Oversized padding (a phone
 * with two panels) is clamped to the same 80 % of the extent `fitPadding`
 * allows, so a fly-to can never push its subject off screen.
 */
export function paddingOffset(
  padding: CameraPadding,
  width: number,
  height: number,
): [x: number, y: number] {
  const clamp = (n: number, extent: number) =>
    Math.max(-extent * 0.4, Math.min(extent * 0.4, n));
  return [
    clamp((padding.left - padding.right) / 2, width),
    clamp((padding.top - padding.bottom) / 2, height),
  ];
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
