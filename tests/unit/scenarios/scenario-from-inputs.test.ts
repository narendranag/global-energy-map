import { describe, it, expect } from "vitest";
import { scenarioFromInputs } from "@/components/scenarios/useScenario";
import { groupAssets } from "@/lib/data/assets";
import type { ScenarioInputs } from "@/lib/data/scenario-inputs";
import { lngTerminal, refinery } from "../layers/fixtures";

const assets = groupAssets([
  refinery("r1", { name: "Ruwais Refinery", country_iso3: "JPN", capacity: 100 }),
  refinery("r2", { name: "Other", country_iso3: "JPN", capacity: null }),
  lngTerminal("t1", "lng_import", { name: "Futtsu", country_iso3: "JPN", capacity: 10 }),
]);

function inputs(commodity: "oil" | "gas"): ScenarioInputs {
  return {
    scenarioId: "hormuz",
    year: 2019,
    commodity,
    tradeFlows: [{ year: 2019, importer_iso3: "JPN", exporter_iso3: "SAU", qty: 1000 }],
    routes: [{ disruption_id: "hormuz", kind: "chokepoint", exporter_iso3: "SAU", importer_iso3: null, share: 0.5 }],
    lngVoyages: [],
  };
}

describe("scenarioFromInputs", () => {
  it("oil: attributes to shared refinery rows and attaches their names", () => {
    const r = scenarioFromInputs(inputs("oil"), assets);
    expect(r.byImporter[0]).toMatchObject({ iso3: "JPN", shareAtRisk: 0.5 });
    expect(r.byRefinery.map((i) => i.name)).toEqual(["Ruwais Refinery", "Other"]);
    // Unknown capacity is 0 for the engine: all JPN feedstock goes to r1.
    expect(r.byRefinery.find((i) => i.asset_id === "r1")?.atRiskQty).toBeCloseTo(500);
    expect(r.rankedRefineries[0]?.name).toBe("Ruwais Refinery");
    expect(r.byLngImport).toHaveLength(0);
  });

  it("gas: uses LNG import terminal rows, not refineries", () => {
    const r = scenarioFromInputs(inputs("gas"), assets);
    expect(r.byRefinery).toHaveLength(0);
    expect(r.byLngImport.map((i) => i.name)).toEqual(["Futtsu"]);
    expect(r.byLngImport[0]?.coverage).toBe("capacity-proxy");
  });
});
