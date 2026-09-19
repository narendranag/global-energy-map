import { describe, expect, it } from "vitest";
import { exposureBaselineNote } from "@/components/country/exposure-note";

/**
 * Finding 12: the note said the scenario panel's figure "will be lower or
 * wider" in every case. For a combination that is backwards — the headline is
 * the low end of the range, which is the MAX of the two routes' shares, so it
 * is at least as high as each single-scenario row in this panel.
 */
describe("exposureBaselineNote", () => {
  const note = (combined: boolean, partial: boolean) =>
    exposureBaselineNote({ combined, partial }, "Japan") ?? "";

  it("says nothing when the scenario panel is a plain full closure", () => {
    expect(exposureBaselineNote({ combined: false, partial: false }, "Japan")).toBeNull();
  });

  it("a combination is at least as high as the row here, never lower", () => {
    const text = note(true, false);
    expect(text).toContain("at least as high");
    expect(text).toContain("larger of the two routes' shares");
    expect(text).not.toMatch(/\blower\b/);
  });

  it("a partial closure is lower, in proportion to the severity", () => {
    const text = note(false, true);
    expect(text).toContain("lower than the matching row");
    expect(text).toContain("severity");
    expect(text).not.toContain("at least as high");
  });

  it("both together pull opposite ways, so it may land either side", () => {
    const text = note(true, true);
    expect(text).toContain("either side");
    expect(text).toContain("raises");
    expect(text).toContain("scales it down");
  });

  it("names the country in every case", () => {
    for (const [c, p] of [
      [true, false],
      [false, true],
      [true, true],
    ] as const) {
      expect(note(c, p)).toContain("Japan");
      expect(note(c, p)).toContain("comparable baseline");
    }
  });
});
