import { describe, expect, it } from "vitest";
import { isRouteValidAt, isWindowed, routeWindowLabel } from "@/lib/scenarios/route-window";
import { resolveScenarioShare } from "@/lib/scenarios/shares";
import { computeScenarioImpact } from "@/lib/scenarios/engine";
import { getScenario, isScenarioActive } from "@/lib/scenarios/registry";
import { bundledSharesFor, SCENARIO_SHARES } from "@/lib/export/citation";
import type { RouteRow } from "@/lib/scenarios/types";

describe("route year windows", () => {
  it("is inclusive at both ends, and open where an end is null or absent", () => {
    expect(isRouteValidAt({}, 1990)).toBe(true);
    expect(isRouteValidAt({ valid_from_year: null, valid_to_year: null }, 2024)).toBe(true);
    expect(isRouteValidAt({ valid_to_year: 2022 }, 2022)).toBe(true);
    expect(isRouteValidAt({ valid_to_year: 2022 }, 2023)).toBe(false);
    expect(isRouteValidAt({ valid_from_year: 2023, valid_to_year: 2025 }, 2023)).toBe(true);
    expect(isRouteValidAt({ valid_from_year: 2023, valid_to_year: 2025 }, 2025)).toBe(true);
    expect(isRouteValidAt({ valid_from_year: 2023, valid_to_year: 2025 }, 2026)).toBe(false);
    expect(isRouteValidAt({ valid_from_year: 2026 }, 2025)).toBe(false);
  });

  it("labels a window in words, and says nothing for an every-year row", () => {
    expect(routeWindowLabel({})).toBe("");
    expect(routeWindowLabel({ valid_to_year: 2022 })).toBe("through 2022");
    expect(routeWindowLabel({ valid_from_year: 2026 })).toBe("from 2026");
    expect(routeWindowLabel({ valid_from_year: 2023, valid_to_year: 2025 })).toBe("2023–2025");
    expect(routeWindowLabel({ valid_from_year: 2024, valid_to_year: 2024 })).toBe("2024");
    expect(isWindowed({})).toBe(false);
    expect(isWindowed({ valid_from_year: 2023 })).toBe(true);
  });
});

// The real Iraq shape: one key, three non-overlapping windows.
const IRQ_HORMUZ: RouteRow[] = [
  { disruption_id: "hormuz", kind: "chokepoint", exporter_iso3: "IRQ", importer_iso3: null, share: 0.87, valid_to_year: 2022 },
  { disruption_id: "hormuz", kind: "chokepoint", exporter_iso3: "IRQ", importer_iso3: null, share: 1, valid_from_year: 2023, valid_to_year: 2025 },
  { disruption_id: "hormuz", kind: "chokepoint", exporter_iso3: "IRQ", importer_iso3: null, share: 0.88, valid_from_year: 2026 },
];

describe("resolveScenarioShare with a year", () => {
  it("reads only the row valid in that year", () => {
    expect(resolveScenarioShare(IRQ_HORMUZ, 2022)("IRQ", "IND")).toBe(0.87);
    expect(resolveScenarioShare(IRQ_HORMUZ, 2024)("IRQ", "IND")).toBe(1);
    expect(resolveScenarioShare(IRQ_HORMUZ, 2026)("IRQ", "IND")).toBe(0.88);
  });

  it("falls back to the wildcard where a windowed pair does not hold (KAZ→DEU before 2023)", () => {
    const rows: RouteRow[] = [
      { disruption_id: "turkish_straits", kind: "chokepoint", exporter_iso3: "KAZ", importer_iso3: null, share: 0.8 },
      { disruption_id: "turkish_straits", kind: "chokepoint", exporter_iso3: "KAZ", importer_iso3: "DEU", share: 0.53, valid_from_year: 2023 },
    ];
    expect(resolveScenarioShare(rows, 2022)("KAZ", "DEU")).toBe(0.8);
    expect(resolveScenarioShare(rows, 2024)("KAZ", "DEU")).toBe(0.53);
  });

  it("is what the engine uses, so rows for other years never reach a result", () => {
    const result = computeScenarioImpact({
      scenarioId: "hormuz",
      commodity: "oil",
      year: 2022,
      tradeFlows: [{ year: 2022, exporter_iso3: "IRQ", importer_iso3: "IND", qty: 100 }],
      routes: IRQ_HORMUZ,
    });
    expect(result.byImporter.find((i) => i.iso3 === "IND")?.shareAtRisk).toBeCloseTo(0.87);
  });
});

describe("the shipped Kirkuk-Ceyhan and Hormuz Iraq rows", () => {
  const share = (id: string, year: number) =>
    resolveScenarioShare(
      SCENARIO_SHARES.filter((r) => r.disruption_id === id) as unknown as RouteRow[],
      year,
    )("IRQ", "IND");

  it("are complements in every year", () => {
    for (const year of [1995, 2022, 2023, 2024, 2025, 2026, 2030]) {
      expect(share("kirkuk_ceyhan", year) + share("hormuz", year), String(year)).toBeCloseTo(1);
    }
    expect(share("kirkuk_ceyhan", 2022)).toBe(0.13);
    expect(share("kirkuk_ceyhan", 2024)).toBe(0);
  });

  it("bundledSharesFor keeps only the rows valid in the year asked for", () => {
    const irq = (year: number) =>
      bundledSharesFor("hormuz", null, "oil", year).filter(
        (r) => r.exporter_iso3 === "IRQ" && r.importer_iso3 === null,
      );
    expect(irq(2024).map((r) => r.share)).toEqual([1]);
    expect(irq(2022).map((r) => r.share)).toEqual([0.87]);
    expect(bundledSharesFor("kirkuk_ceyhan", null, "oil", 2024)).toHaveLength(1);
  });

  it("the scenario is inactive in its shut years and active either side", () => {
    const def = getScenario("kirkuk_ceyhan");
    expect(isScenarioActive(def, 2022)).toBe(true);
    for (const y of [2023, 2024, 2025]) expect(isScenarioActive(def, y)).toBe(false);
    expect(isScenarioActive(def, 2026)).toBe(true);
    expect(def.inactiveNote).toMatch(/shut/);
    expect(def.pipelineIds).toEqual(["P0547"]);
  });
});
