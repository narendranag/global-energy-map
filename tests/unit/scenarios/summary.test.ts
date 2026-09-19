import { describe, expect, it } from "vitest";
import { scenarioLabelOf, scenarioSummaryParts } from "@/lib/scenarios/summary";
import { getScenario } from "@/lib/scenarios/registry";

const HORMUZ = getScenario("hormuz").label;
const MALACCA = getScenario("malacca").label;

describe("scenarioLabelOf", () => {
  it("names both scenarios of a combination", () => {
    expect(scenarioLabelOf(null, null)).toBeNull();
    expect(scenarioLabelOf("hormuz", null)).toBe(HORMUZ);
    expect(scenarioLabelOf("hormuz", "malacca")).toBe(`${HORMUZ} + ${MALACCA}`);
  });

  it("ignores a second scenario without a primary, or equal to it (A1)", () => {
    expect(scenarioLabelOf(null, "malacca")).toBeNull();
    expect(scenarioLabelOf("hormuz", "hormuz")).toBe(HORMUZ);
  });
});

describe("scenarioSummaryParts", () => {
  const base = { scenario: "hormuz", scenario2: null, severity: 1, view: "importers" } as const;

  it("a plain full closure reads exactly as it did before T1", () => {
    expect(scenarioSummaryParts(base)).toEqual([HORMUZ]);
  });

  it("names the second scenario, the severity and the exporter view", () => {
    expect(
      scenarioSummaryParts({ ...base, scenario2: "malacca", severity: 0.5, view: "exporters" }),
    ).toEqual([`${HORMUZ} + ${MALACCA}`, "50% of the route cut", "exporter view"]);
  });

  it("uses the caller's word for no scenario, and drops the modifiers with it", () => {
    const none = { scenario: null, scenario2: null, severity: 0.5, view: "exporters" } as const;
    expect(scenarioSummaryParts(none)).toEqual(["no scenario"]);
    expect(scenarioSummaryParts(none, "Scenario")).toEqual(["Scenario"]);
  });
});
