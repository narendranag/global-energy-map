import { describe, it, expect } from "vitest";
import { countryAnchor } from "@/lib/geo/country-anchors";
import {
  FLOWS_FIT_MAX_SPAN_DEG,
  flowsFitBounds,
} from "@/lib/geo/flows-bounds";
import type { Bounds } from "@/lib/state/camera";

const JAPAN: Bounds = [129, 31, 146, 45.5];

describe("flowsFitBounds (Wave 2 polish 1)", () => {
  it("grows the box to take in the partners' anchors", () => {
    const out = flowsFitBounds(JAPAN, ["SAU", "ARE"]);
    const sau = countryAnchor("SAU");
    const are = countryAnchor("ARE");
    if (!sau || !are) throw new Error("anchors");
    expect(out[0]).toBeLessThanOrEqual(Math.min(sau[0], are[0]));
    expect(out[2]).toBeGreaterThanOrEqual(JAPAN[2]);
  });

  it("uses only the first `limit` partners", () => {
    const near = flowsFitBounds(JAPAN, ["KOR", "SAU"], 1);
    const far = flowsFitBounds(JAPAN, ["KOR", "SAU"], 2);
    expect(near[0]).toBeGreaterThan(far[0]);
  });

  it("keeps the country alone when the partners span too much of the globe", () => {
    // The USA anchor is on the Gulf Coast; Japan plus it is already over 200°
    // the short way round, which frames the Pacific and nothing else.
    const out = flowsFitBounds(JAPAN, ["USA", "BRA", "GBR", "AUS", "SAU"]);
    expect(out).toEqual(JAPAN);
    expect(out[2] - out[0]).toBeLessThanOrEqual(FLOWS_FIT_MAX_SPAN_DEG);
  });

  it("is the country's own box when no partner has an anchor", () => {
    expect(flowsFitBounds(JAPAN, [])).toEqual(JAPAN);
    expect(flowsFitBounds(JAPAN, ["S19", "ZA1"])).toEqual(JAPAN);
  });
});
