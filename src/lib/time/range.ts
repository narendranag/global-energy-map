import { RESERVES_LATEST_YEAR, YEAR_MAX, YEAR_MIN } from "@/lib/data-catalog/years";

/**
 * The app's time axis, derived from catalog `coverage` in
 * `src/lib/data-catalog/years.ts` — never typed here. `YEAR_MIN` is the first
 * EI country-year, `YEAR_MAX` the last reconciled BACI year, and
 * `RESERVES_LATEST_YEAR` the last year EI publishes proved reserves for (it
 * stopped in 2020 while production ran on), so the reserves choropleth
 * freezes there.
 *
 * Re-exported from here so the ~dozen importers of this module are unchanged.
 */
export { YEAR_MIN, YEAR_MAX, RESERVES_LATEST_YEAR };

/** Round to an integer year and clamp into [YEAR_MIN, YEAR_MAX]. */
export function clampYear(n: number): number {
  return Math.min(YEAR_MAX, Math.max(YEAR_MIN, Math.round(n)));
}

/** The year whose reserves value is shown for a selected year. */
export function reservesDataYear(year: number): number {
  return Math.min(year, RESERVES_LATEST_YEAR);
}
