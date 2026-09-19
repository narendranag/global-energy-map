/**
 * The sentence that reconciles two numbers for the same country on the same
 * screen: the country panel's exposure rows (one scenario each, fully closed
 * — the comparable baseline) and the scenario panel's headline, which may be
 * partial, combined, or both.
 *
 * It used to say the scenario panel's figure "will be lower or wider" in
 * every case, which is wrong for a combination (finding 12). With two
 * scenarios the headline is the **lower bound of the range, which is the MAX
 * of the two routes' shares** — so at full severity it is greater than or
 * equal to each single-scenario row here, never lower. Only severity pushes
 * it down, and when both are in play the two effects pull opposite ways and
 * the honest answer is that it can land either side.
 *
 * Pure. Unit-tested in `tests/unit/country/exposure-note.test.ts`.
 */

export interface ScenarioAdjustment {
  /** Two scenarios are closed at once. */
  readonly combined: boolean;
  /** Less than the whole route is cut (severity < 1). */
  readonly partial: boolean;
}

/**
 * The note for the exposure section, or null when the scenario panel is
 * showing a plain single full closure and the two numbers simply agree.
 *
 * `country` is the focused country's display name.
 */
export function exposureBaselineNote(
  adj: ScenarioAdjustment,
  country: string,
): string | null {
  const lead = `One route at a time, fully closed — the comparable baseline.`;
  if (adj.combined && adj.partial) {
    return (
      `${lead} The scenario panel is showing two routes closed at once, and only part of each: ` +
      `combining raises its headline for ${country} to the larger of the two routes' shares, while the ` +
      `partial closure scales it down, so it may land either side of the matching row here.`
    );
  }
  if (adj.combined) {
    return (
      `${lead} The scenario panel is showing two routes closed at once; its headline for ${country} is the ` +
      `low end of a range — the larger of the two routes' shares — so it is at least as high as the ` +
      `matching row here, and the high end higher still.`
    );
  }
  if (adj.partial) {
    return (
      `${lead} The scenario panel is cutting only part of the route, so its figure for ${country} is ` +
      `lower than the matching row here, in proportion to the severity.`
    );
  }
  return null;
}
