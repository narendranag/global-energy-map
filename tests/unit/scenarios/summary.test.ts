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
    // Hormuz-like: 2026 documents that state the year of the flows they
    // describe (2025). The share year shown is the data year, never 2026.
    const hormuz = [
      { source_year: 2026, data_year: 2025 },
      { source_year: 2026, data_year: 2025 },
    ];
    expect(
      scenarioSummaryParts(base, "no scenario", { tradeYear: 2024, routes: hormuz }),
    ).toEqual([HORMUZ, "2024 trade, 2025 route shares"]);
    expect(
      scenarioSummaryParts({ ...base, severity: 0.5 }, "no scenario", {
        tradeYear: 2010,
        routes: hormuz,
      }),
    ).toEqual([HORMUZ, "2010 trade, 2025 route shares", "50% of the route cut"]);
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
  it("names the year of the flows the documents describe, not when they were published", () => {
    // The Hormuz shape: published 2026, describing 2025 routing. Printing
    // 2026 would claim a currency the data does not have.
    expect(
      dataYearsPhrase(2024, [
        { source_year: 2026, data_year: 2025 },
        { source_year: 2026, data_year: 2025 },
      ]),
    ).toBe("2024 trade, 2025 route shares");
  });

  it("spans the distinct data years, with full years and an en dash", () => {
    const rows = [
      { source_year: 2026, data_year: 2025 },
      { source_year: 2019, data_year: 2018 },
      { source_year: 2025, data_year: 2023 },
    ];
    expect(dataYearsPhrase(2024, rows)).toBe("2024 trade, 2018\u20132025 route shares");
    // Never abbreviated to "2018–25": a citation is read, not skimmed.
    expect(dataYearsPhrase(2024, rows)).not.toContain("\u201325 ");
  });

  it("says \"published\" when no document states which year's flows it describes", () => {
    // The Suez shape: structural rows cited to a 2019 article that never
    // says which year's routing its figures are.
    expect(
      dataYearsPhrase(2024, [
        { source_year: 2019, data_year: null },
        { source_year: 2019, data_year: null },
      ]),
    ).toBe("2024 trade, route shares published 2019");
  });

  it("names the data years of a mixed run, and never folds a publication year into them", () => {
    // Malacca: one dated share (2025 flows) among structural rows cited to a
    // 2017 article. "2017–2025" would print a publication year as a data year.
    expect(
      dataYearsPhrase(2024, [
        { source_year: 2017, data_year: null },
        { source_year: 2026, data_year: 2025 },
      ]),
    ).toBe("2024 trade, 2025 route shares");
  });

  it("spans both scenarios' rows when two are combined", () => {
    expect(
      dataYearsPhrase(2024, [
        { source_year: 2026, data_year: 2025 },
        { source_year: 2022, data_year: 2021 },
      ]),
    ).toBe("2024 trade, 2021\u20132025 route shares");
  });

  it("says so when the rows carry no year at all", () => {
    expect(dataYearsPhrase(2024, [{ source_year: null }, {}])).toBe(
      "2024 trade, undated route shares",
    );
  });

  it("ignores an unsourced analyst estimate: its 2026 default is not a publication date", () => {
    expect(
      dataYearsPhrase(2024, [
        { source_year: 2026, data_year: null, source_title: "Analyst estimate (unsourced)" },
        { source_year: 2025, data_year: 2023 },
      ]),
    ).toBe("2024 trade, 2023 route shares");
  });

  it("states the trade year alone when the rows are not loaded", () => {
    expect(dataYearsPhrase(2024, null)).toBe("2024 trade");
    expect(dataYearsPhrase(2024, [])).toBe("2024 trade");
  });
});
