import { describe, it, expect } from "vitest";
import type {
  Commodity,
  LngImportRow,
  LngImportImpact,
  ScenarioResult,
} from "@/lib/scenarios/types";
import type { ScenarioDef } from "@/lib/scenarios/registry";
import type { ScenarioInput } from "@/lib/scenarios/engine";

describe("Phase 3 type extensions", () => {
  it("Commodity is a literal union", () => {
    const oil: Commodity = "oil";
    const gas: Commodity = "gas";
    expect([oil, gas]).toEqual(["oil", "gas"]);
  });

  it("LngImportRow has expected shape", () => {
    const row: LngImportRow = { asset_id: "x", country_iso3: "JPN", capacity: 12.5 };
    expect(row.country_iso3).toBe("JPN");
  });

  it("LngImportImpact mirrors RefineryImpact shape", () => {
    const impact: LngImportImpact = {
      asset_id: "x",
      iso3: "JPN",
      capacity: 12.5,
      atRiskQty: 0,
      shareAtRisk: 0,
      topSources: [],
    };
    expect(impact.shareAtRisk).toBe(0);
  });

  it("ScenarioDef carries commodities array", () => {
    const def: ScenarioDef = {
      id: "hormuz",
      label: "test",
      kind: "chokepoint",
      commodities: ["oil", "gas"],
      description: "test",
    };
    expect(def.commodities).toContain("gas");
  });

  it("ScenarioInput carries commodity + optional lngImports", () => {
    const input: ScenarioInput = {
      scenarioId: "hormuz",
      commodity: "gas",
      year: 2022,
      tradeFlows: [],
      routes: [],
      lngImports: [{ asset_id: "x", country_iso3: "JPN", capacity: 12.5 }],
    };
    expect(input.commodity).toBe("gas");
  });

  it("ScenarioResult carries byLngImport + rankedLngImports", () => {
    const result: ScenarioResult = {
      scenarioId: "hormuz",
      commodity: "gas",
      year: 2022,
      byImporter: [],
      rankedImporters: [],
      byRefinery: [],
      rankedRefineries: [],
      byLngImport: [],
      rankedLngImports: [],
    };
    expect(result.byLngImport).toEqual([]);
  });
});
