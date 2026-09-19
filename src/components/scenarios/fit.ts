/**
 * What the camera should frame when a scenario is switched on (S1): the place
 * the disruption happens, plus the importers that lose the most by volume.
 *
 * Pure — no map handle, no React. `useScenarioCamera` decides *when* to move;
 * this decides *where*. Unit-tested in `tests/unit/scenarios/fit.test.ts`.
 */
import type { Bounds } from "@/lib/state";
import { MAX_LAT } from "@/lib/state/view";

/**
 * How many exposed importers the fit tries to hold. Eight is enough to frame
 * the story a chokepoint tells (Hormuz: Japan and Korea at one end, Europe at
 * the other) without letting a long tail of 0.2 % importers drag the view out
 * to the whole globe.
 */
export const TOP_EXPOSED_FOR_FIT = 8;

/**
 * Smallest longitude/latitude span a scenario fit may use. Without it, a
 * scenario whose result is one small importer next to the mark (or CAN → USA
 * and nothing else, once the tail is dropped) fits to a box a few degrees
 * wide and `FIT_MAX_ZOOM` alone would still hand back a street-level view of
 * an ocean. Twelve degrees is roughly "a large country and its neighbours".
 */
export const SCENARIO_MIN_SPAN_DEG = 12;

/**
 * A scenario fit stops further out than a country fit (`FIT_MAX_ZOOM` = 6):
 * what it frames is a relationship between places, not a place.
 */
export const SCENARIO_FIT_MAX_ZOOM = 5;

/** Box around a chokepoint marker, so the mark is never the only thing framed. */
export const MARK_SPAN_DEG = 6;

interface Exposed {
  readonly iso3: string;
  readonly atRiskQty: number;
}

/**
 * The `n` importers losing the most volume, most first. Volume — not share —
 * because a 100 %-exposed importer of 40 kt is not what the scenario is
 * about, and framing it would push the countries that matter off screen.
 */
export function topExposedIso3<T extends Exposed>(
  importers: readonly T[],
  n = TOP_EXPOSED_FOR_FIT,
): string[] {
  return [...importers]
    .filter((i) => i.atRiskQty > 0)
    .sort((a, b) => b.atRiskQty - a.atRiskQty)
    .slice(0, n)
    .map((i) => i.iso3);
}

function union(a: Bounds, b: Bounds): Bounds {
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
}

/**
 * Grow a box about its centre until both spans reach `min`. Unlike
 * `withMinimumExtent` in `lib/geo/bounds`, longitude is **not** clamped to
 * ±180: a wrapped union (see {@link unionBounds}) legitimately has an east
 * edge past 180, and MapLibre's `fitBounds` accepts it.
 */
export function growToMinimumSpan(bounds: Bounds, min = SCENARIO_MIN_SPAN_DEG): Bounds {
  const [w, s, e, n] = bounds;
  const padLon = Math.max(0, min - (e - w)) / 2;
  const padLat = Math.max(0, min - (n - s)) / 2;
  return [w - padLon, Math.max(-MAX_LAT, s - padLat), e + padLon, Math.min(MAX_LAT, n + padLat)];
}

/**
 * Union of country boxes, chosen so the antimeridian does not turn "Japan and
 * the US West Coast" into "the whole world".
 *
 * Two candidates are compared: the naive union, and the union after shifting
 * every wholly-western box (east edge < 0) by +360. Whichever is narrower
 * wins. For a normal Europe-to-Asia result the naive union is narrower and
 * nothing changes; for a Pacific-spanning one the shifted union wins and the
 * result may run past +180, which MapLibre handles by wrapping.
 *
 * A result that genuinely spans the globe still spans the globe — that is the
 * honest frame for Hormuz — and `SCENARIO_FIT_MAX_ZOOM` caps the other end.
 */
export function unionBounds(boxes: readonly Bounds[]): Bounds | null {
  const first = boxes[0];
  if (first === undefined) return null;
  const naive = boxes.reduce(union);
  const shifted = boxes
    .map((b): Bounds => (b[2] < 0 ? [b[0] + 360, b[1], b[2] + 360, b[3]] : b))
    .reduce(union);
  const chosen = shifted[2] - shifted[0] < naive[2] - naive[0] ? shifted : naive;
  return growToMinimumSpan(chosen);
}

/** A square-ish box centred on a point, for a chokepoint marker. */
export function markBounds(
  mark: { readonly lon: number; readonly lat: number },
  span = MARK_SPAN_DEG,
): Bounds {
  const half = span / 2;
  return [
    mark.lon - half,
    Math.max(-MAX_LAT, mark.lat - half),
    mark.lon + half,
    Math.min(MAX_LAT, mark.lat + half),
  ];
}

/**
 * The box the camera should fit for an active scenario: the disruption mark
 * plus the top exposed importers' boxes. Null when we have neither — the
 * camera then stays where the viewer left it rather than guessing.
 */
export function scenarioFitBounds(
  mark: { readonly lon: number; readonly lat: number } | null,
  importerBoxes: readonly Bounds[],
): Bounds | null {
  const boxes = [...(mark === null ? [] : [markBounds(mark)]), ...importerBoxes];
  return unionBounds(boxes);
}
