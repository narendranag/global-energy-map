/** Pure helpers behind the year slider (ticks, stepping, playback). */

/** Milliseconds per year while playing. */
export const PLAY_STEP_MS = 700;

/** Thumb diameter of the native range input (px) — ticks are inset by half of it. */
export const THUMB_PX = 16;

export interface Tick {
  readonly year: number;
  /** Fraction along the track, 0–1. */
  readonly at: number;
  /** Label text, or null for an unlabelled minor tick. */
  readonly label: string | null;
}

/**
 * One tick per year; decades (and both ends) are labelled and drawn tall.
 * The last decade label is dropped if it would crowd the end label.
 */
export function yearTicks(min: number, max: number): Tick[] {
  const span = Math.max(1, max - min);
  const ticks: Tick[] = [];
  for (let y = min; y <= max; y++) {
    const isEnd = y === min || y === max;
    const isDecade = y % 10 === 0;
    const crowdsEnd = isDecade && !isEnd && max - y < 3;
    ticks.push({
      year: y,
      at: (y - min) / span,
      label: isEnd || (isDecade && !crowdsEnd) ? y.toString() : null,
    });
  }
  return ticks;
}

/** CSS `left` for a fraction along the track, compensating for the thumb inset. */
export function tickLeft(at: number): string {
  const half = THUMB_PX / 2;
  return `calc(${half.toString()}px + (100% - ${THUMB_PX.toString()}px) * ${at.toString()})`;
}

/** `value + delta`, clamped to [min, max]. */
export function stepYear(value: number, delta: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value + delta));
}

/** Where playback starts: the current year, or back at `min` if already at the end. */
export function playStartYear(value: number, min: number, max: number): number {
  return value >= max ? min : value;
}

/** Next year during playback, or null when playback should stop (reached `max`). */
export function nextPlayYear(value: number, max: number): number | null {
  return value >= max ? null : value + 1;
}
