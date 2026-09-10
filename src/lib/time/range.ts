/**
 * The app's time axis. Production, BACI trade and LNG-T3 voyages all run to
 * 2024; the EI Statistical Review stopped publishing proved reserves after
 * 2020, so the reserves choropleth freezes at that year.
 */
export const YEAR_MIN = 1990;
export const YEAR_MAX = 2024;
export const RESERVES_LATEST_YEAR = 2020;

/** Round to an integer year and clamp into [YEAR_MIN, YEAR_MAX]. */
export function clampYear(n: number): number {
  return Math.min(YEAR_MAX, Math.max(YEAR_MIN, Math.round(n)));
}

/** The year whose reserves value is shown for a selected year. */
export function reservesDataYear(year: number): number {
  return Math.min(year, RESERVES_LATEST_YEAR);
}
