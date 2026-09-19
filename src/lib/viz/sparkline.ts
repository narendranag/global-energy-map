/**
 * Inline sparklines, by hand (S3).
 *
 * No chart library: a sparkline is one polyline over a fixed box, and every
 * charting dependency we looked at costs more bytes on the load path than the
 * whole country panel. These are pure functions over `(number | null)[]` —
 * the nulls matter, because a country-year series with a gap must *break*
 * rather than draw a straight line across the missing years.
 *
 * Coordinates are in the caller's own viewBox units, y flipped (SVG's y grows
 * downward, values grow upward). The caller gives an `inset` so a round line
 * cap at the extremes is not clipped by the box.
 */

export interface SparklineScale {
  /** Lowest finite value in the series (the bottom of the box). */
  readonly min: number;
  /** Highest finite value (the top of the box). */
  readonly max: number;
  readonly width: number;
  readonly height: number;
  readonly inset: number;
  readonly count: number;
}

/** Default padding, in viewBox units, kept clear at the top and bottom. */
export const SPARKLINE_INSET = 1.5;

/**
 * The scale a series maps onto, or null when it holds no finite value.
 * A flat series (min === max) is drawn along the vertical middle rather than
 * pinned to the floor, which would read as "zero".
 */
export function sparklineScale(
  values: readonly (number | null | undefined)[],
  width: number,
  height: number,
  inset: number = SPARKLINE_INSET,
): SparklineScale | null {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v === null || v === undefined || !Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min)) return null;
  return { min, max, width, height, inset, count: values.length };
}

/** x of the i-th point. A one-point series sits at the left edge. */
export function sparklineX(scale: SparklineScale, index: number): number {
  if (scale.count <= 1) return 0;
  return (index / (scale.count - 1)) * scale.width;
}

/** y of `value` on `scale`; a flat series is centred. */
export function sparklineY(scale: SparklineScale, value: number): number {
  const usable = Math.max(0, scale.height - 2 * scale.inset);
  const t = scale.max === scale.min ? 0.5 : (value - scale.min) / (scale.max - scale.min);
  return scale.inset + (1 - t) * usable;
}

const round = (n: number): string => (Math.round(n * 100) / 100).toString();

/**
 * SVG path data for `values` over a `width` × `height` box.
 *
 * Gaps (null / non-finite) split the line into separate subpaths, and an
 * isolated point becomes a zero-length segment so a round cap still draws a
 * dot. Returns "" when nothing is finite — the caller renders no chart.
 */
export function sparklinePath(
  values: readonly (number | null | undefined)[],
  width: number,
  height: number,
  inset: number = SPARKLINE_INSET,
): string {
  const scale = sparklineScale(values, width, height, inset);
  if (scale === null) return "";
  const out: string[] = [];
  let open = false;
  let drewSegment = false;
  values.forEach((v, i) => {
    if (v === null || v === undefined || !Number.isFinite(v)) {
      if (open && !drewSegment) out.push("h0"); // lone point: keep a visible dot
      open = false;
      drewSegment = false;
      return;
    }
    const x = round(sparklineX(scale, i));
    const y = round(sparklineY(scale, v));
    if (!open) {
      out.push(`M${x} ${y}`);
      open = true;
      drewSegment = false;
    } else {
      out.push(`L${x} ${y}`);
      drewSegment = true;
    }
  });
  if (open && !drewSegment) out.push("h0");
  return out.join(" ");
}

export interface SparklineMarker {
  readonly x: number;
  readonly y: number;
}

/** Position of one point, for the "you are here" marker; null if not finite. */
export function sparklineMarker(
  values: readonly (number | null | undefined)[],
  index: number,
  width: number,
  height: number,
  inset: number = SPARKLINE_INSET,
): SparklineMarker | null {
  const scale = sparklineScale(values, width, height, inset);
  if (scale === null || index < 0 || index >= values.length) return null;
  const v = values[index];
  if (v === null || v === undefined || !Number.isFinite(v)) return null;
  return { x: sparklineX(scale, index), y: sparklineY(scale, v) };
}
