export type Rgba = readonly [number, number, number, number];

/** Countries with no reserves row in the source — distinct from a zero value. */
export const RESERVES_NO_DATA_COLOR: Rgba = [200, 200, 200, 110];

// Sequential green ramp (ColorBrewer "Greens" end-points #edf8e9 → #005a32).
const LOW: readonly [number, number, number] = [237, 248, 233];
const HIGH: readonly [number, number, number] = [0, 90, 50];
const ALPHA = 200;

// Scale-free log: value / max is spread over three decades, so a country with
// 1 % of the leader's reserves still lands a third of the way up the ramp
// instead of rounding to white (the linear ramp only showed VEN/SAU/CAN).
const DECADES = 1000;

/** Position on the ramp in [0, 1]. Non-positive values sit at 0. */
export function reservesRampT(value: number, max: number): number {
  if (!(max > 0) || !(value > 0)) return 0;
  const t = Math.log1p((DECADES * value) / max) / Math.log1p(DECADES);
  return Math.min(1, t);
}

/** Fill colour for a reserves value; `null`/`undefined` → no-data grey. */
export function reservesColor(value: number | null | undefined, max: number): Rgba {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return RESERVES_NO_DATA_COLOR;
  }
  const t = reservesRampT(value, max);
  const lerp = (a: number, b: number) => Math.round(a + (b - a) * t);
  return [lerp(LOW[0], HIGH[0]), lerp(LOW[1], HIGH[1]), lerp(LOW[2], HIGH[2]), ALPHA];
}

/** Tooltip value string, e.g. "297.5 bn bbl" or "6.02 tcm". */
export function formatReserves(value: number, commodity: "oil" | "gas"): string {
  const digits = value >= 10 ? 1 : value >= 1 ? 2 : 3;
  return `${value.toFixed(digits)} ${commodity === "oil" ? "bn bbl" : "tcm"}`;
}
