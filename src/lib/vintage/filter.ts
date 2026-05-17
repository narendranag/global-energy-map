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
