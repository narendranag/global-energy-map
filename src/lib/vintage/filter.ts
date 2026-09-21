/**
 * Vintage filter for time-aware infrastructure layers.
 *
 * Returns true if a feature should be visible in the active year:
 *   - vintage is null/undefined → always visible (preserves current
 *     behavior for features without a known build year, ~29% of pipelines
 *     and ~78% of extraction sites in the current dataset).
 *   - vintage <= year → visible (feature existed by the active year).
 *   - vintage  > year → hidden (feature is from the future).
 */
export function isVisibleAtYear(
  vintage: number | null | undefined,
  year: number,
): boolean {
  if (vintage == null) return true;
  return vintage <= year;
}

/**
 * Vintage filter for a world with no year control (decision 5 of
 * `docs/superpowers/plans/2026-09-21-drop-year-slider.md`).
 *
 * With no slider to scrub forward, a row dated after the latest year would
 * vanish for good the moment the source is refreshed and a newer vintage
 * appears — there is no way for a reader to reach the year that would show
 * it again. So at the latest year (`year === latestYear`), nothing is hidden
 * by vintage: every row shows regardless of how recent its start/commission
 * date is. A pinned historical link (`year < latestYear`, e.g. from a shared
 * URL's explicit `year=`) keeps exactly `isVisibleAtYear`'s semantics — that
 * is still "what existed by this year", which is what a citation of a past
 * year means.
 */
export function isVisibleAsOf(
  vintage: number | null | undefined,
  year: number,
  latestYear: number,
): boolean {
  if (year >= latestYear) return true;
  return isVisibleAtYear(vintage, year);
}
