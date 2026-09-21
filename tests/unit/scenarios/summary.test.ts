import { describe, expect, it } from "vitest";
import { dataYearsPhrase, scenarioLabelOf, scenarioSummaryParts } from "@/lib/scenarios/summary";
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

  it("states both vintages right after the scenario, when the year is given", () => {
    const suez = [{ source_year: 2019 }, { source_year: 2019 }];
    expect(
      scenarioSummaryParts(base, "no scenario", { tradeYear: 2024, routes: suez }),
    ).toEqual([HORMUZ, "2024 trade, 2019 route shares"]);
    expect(
      scenarioSummaryParts({ ...base, severity: 0.5 }, "no scenario", {
        tradeYear: 2010,
        routes: suez,
      }),
    ).toEqual([HORMUZ, "2010 trade, 2019 route shares", "50% of the route cut"]);
  });

  it("falls back to the trade year alone when the route rows are not loaded", () => {
    expect(scenarioSummaryParts(base, "no scenario", { tradeYear: 2024 })).toEqual([
      HORMUZ,
      "2024 trade",
    ]);
  });

  it("omits the trade year with every other modifier when no scenario is active", () => {
    const none = { scenario: null, scenario2: null, severity: 1, view: "importers" } as const;
    expect(scenarioSummaryParts(none, "Scenario", { tradeYear: 2024 })).toEqual(["Scenario"]);
  });
});

describe("dataYearsPhrase", () => {
  it("names both vintages: the trade year and the route shares' document year", () => {
    expect(dataYearsPhrase(2024, [{ source_year: 2019 }, { source_year: 2019 }])).toBe(
      "2024 trade, 2019 route shares",
    );
  });

  it("spans the distinct document years, with full years and an en dash", () => {
    const malacca = [{ source_year: 2026 }, { source_year: 2017 }, { source_year: 2019 }];
    expect(dataYearsPhrase(2024, malacca)).toBe("2024 trade, 2017\u20132026 route shares");
    // Never abbreviated to "2017–26": a citation is read, not skimmed.
    expect(dataYearsPhrase(2024, malacca)).not.toContain("\u201326 ");
  });

  it("spans both scenarios' rows when two are combined", () => {
    // hormuz (2026) + malacca (2017–2026) is one number from all the rows.
    expect(
      dataYearsPhrase(2024, [{ source_year: 2026 }, { source_year: 2017 }]),
    ).toBe("2024 trade, 2017\u20132026 route shares");
  });

  it("says so when the rows carry no publication year at all", () => {
    expect(dataYearsPhrase(2024, [{ source_year: null }, {}])).toBe(
      "2024 trade, undated route shares",
    );
  });

  it("states the trade year alone when the rows are not loaded", () => {
    expect(dataYearsPhrase(2024, null)).toBe("2024 trade");
    expect(dataYearsPhrase(2024, [])).toBe("2024 trade");
  });
});
