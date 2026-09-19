import { describe, expect, it } from "vitest";
import { isCurrentScenarioResult, requestedIdsOf } from "@/lib/scenarios/current";
import type { ScenarioId, ScenarioResult } from "@/lib/scenarios/types";

function result(over: Partial<ScenarioResult> = {}): ScenarioResult {
  return {
    scenarioId: "hormuz",
    scenarioIds: ["hormuz"],
    requestedScenarioIds: ["hormuz"],
    commodity: "oil",
    year: 2024,
    severity: 1,
    byImporter: [],
    rankedImporters: [],
    byRefinery: [],
    rankedRefineries: [],
    byLngImport: [],
    rankedLngImports: [],
    ...over,
  };
}

/** A result without `requestedScenarioIds`, as a pre-T1 result would be. */
function withoutRequested(r: ScenarioResult): ScenarioResult {
  const copy = { ...r };
  delete copy.requestedScenarioIds;
  return copy;
}

/** …and without `scenarioIds` either, as a pre-S5 one would be. */
function withoutIds(r: ScenarioResult): ScenarioResult {
  const copy = { ...r };
  delete copy.scenarioIds;
  return copy;
}

const req = {
  scenario: "hormuz" as ScenarioId | null,
  scenario2: null as ScenarioId | null,
  year: 2024,
  commodity: "oil" as const,
  severity: 1,
};

describe("isCurrentScenarioResult", () => {
  it("matches the result the controls describe", () => {
    expect(isCurrentScenarioResult(result(), req)).toBe(true);
  });

  it("rejects a null result, and any request with no scenario", () => {
    expect(isCurrentScenarioResult(null, req)).toBe(false);
    expect(isCurrentScenarioResult(result(), { ...req, scenario: null })).toBe(false);
  });

  it("rejects a stale year, commodity, severity or primary", () => {
    expect(isCurrentScenarioResult(result(), { ...req, year: 2023 })).toBe(false);
    expect(isCurrentScenarioResult(result(), { ...req, commodity: "gas" })).toBe(false);
    expect(isCurrentScenarioResult(result(), { ...req, severity: 0.5 })).toBe(false);
    expect(isCurrentScenarioResult(result(), { ...req, scenario: "malacca" })).toBe(false);
  });

  it("rejects a single-scenario result while a combination is requested", () => {
    expect(isCurrentScenarioResult(result(), { ...req, scenario2: "malacca" })).toBe(false);
  });

  /**
   * Finding 20: `loadScenarioInputs` drops a secondary with no route rows, so
   * `scenarioIds` reports one scenario while the URL still says two. Comparing
   * against `scenarioIds` left `pending` stuck at 1 for ever — `data-ready`
   * never true, the panel on "Computing exposure…", the CSV button disabled.
   */
  it("accepts a result whose secondary the loader dropped for want of route rows", () => {
    const dropped = result({
      scenarioIds: ["hormuz"],
      requestedScenarioIds: ["hormuz", "malacca"],
    });
    expect(isCurrentScenarioResult(dropped, { ...req, scenario2: "malacca" })).toBe(true);
    // …and it is still not the answer to a single-scenario request.
    expect(isCurrentScenarioResult(dropped, req)).toBe(false);
  });

  it("treats a secondary equal to the primary as no secondary (A1)", () => {
    expect(isCurrentScenarioResult(result(), { ...req, scenario2: "hormuz" })).toBe(true);
  });

  it("matches a combination in order", () => {
    const combined = result({
      scenarioIds: ["hormuz", "malacca"],
      requestedScenarioIds: ["hormuz", "malacca"],
    });
    expect(isCurrentScenarioResult(combined, { ...req, scenario2: "malacca" })).toBe(true);
    expect(isCurrentScenarioResult(combined, { ...req, scenario2: "suez" })).toBe(false);
  });
});

describe("requestedIdsOf", () => {
  it("falls back to scenarioIds, then to the primary alone", () => {
    expect(requestedIdsOf(result())).toEqual(["hormuz"]);
    const noRequested = withoutRequested(result({ scenarioIds: ["hormuz", "suez"] }));
    expect(requestedIdsOf(noRequested)).toEqual(["hormuz", "suez"]);
    expect(requestedIdsOf(withoutIds(noRequested))).toEqual(["hormuz"]);
  });
});
