import { describe, it, expect } from "vitest";
import { computeScenarioImpact } from "@/lib/scenarios/engine";

// Synthetic fixture: one refinery in Germany (250 of 2000 capacity = 12.5% share),
// Germany imports 100 from Russia, with Druzhba route share 0.6.
const tradeFlows = [
  { year: 2022, importer_iso3: "DEU", exporter_iso3: "RUS", qty: 100 },
  { year: 2022, importer_iso3: "DEU", exporter_iso3: "USA", qty: 50 },
];
const routes = [
  { disruption_id: "druzhba" as const, kind: "pipeline" as const, exporter_iso3: "RUS", importer_iso3: "DEU", share: 0.6 },
];
const refineries = [
  { asset_id: "DEU-1", country_iso3: "DEU", capacity: 250 },
  { asset_id: "DEU-2", country_iso3: "DEU", capacity: 1750 },
];

describe("computeScenarioImpact refinery view", () => {
  it("attributes feedstock by refinery capacity share within country", () => {
    const r = computeScenarioImpact({
      scenarioId: "druzhba",
      commodity: "oil",
      year: 2022,
      tradeFlows,
      routes,
      refineries,
    });
    const small = r.byRefinery.find((x) => x.asset_id === "DEU-1");
    expect(small).toBeDefined();
    if (!small) throw new Error("DEU-1 not found");
    expect(small.capacity).toBe(250);
    // Refinery share = 250/2000 = 0.125
    // Total historical feedstock for DEU-1 = 0.125 * (100 + 50) = 18.75
    // At risk: 0.125 * 100 (RUS imports) * 0.6 (druzhba share) = 7.5
    expect(small.atRiskQty).toBeCloseTo(7.5, 6);
    expect(small.shareAtRisk).toBeCloseTo(7.5 / 18.75, 6);
  });

  it("ranks refineries by atRiskQty descending", () => {
    const r = computeScenarioImpact({
      scenarioId: "druzhba",
      commodity: "oil",
      year: 2022,
      tradeFlows,
      routes,
      refineries,
    });
    expect(r.rankedRefineries[0]?.asset_id).toBe("DEU-2"); // larger refinery → larger absolute at-risk
  });

  it("returns empty topSources when refinery has no historical imports", () => {
    const r = computeScenarioImpact({
      scenarioId: "druzhba",
      commodity: "oil",
      year: 2022,
      tradeFlows: [],
      routes,
      refineries: [{ asset_id: "SAU-1", country_iso3: "SAU", capacity: 500 }],
    });
    expect(r.byRefinery[0]?.topSources).toEqual([]);
    expect(r.byRefinery[0]?.shareAtRisk).toBe(0);
  });

  it("falls back to uniform-within-country when all refineries have capacity=0 (OSM coverage gap)", () => {
    const r = computeScenarioImpact({
      scenarioId: "druzhba",
      commodity: "oil",
      year: 2022,
      tradeFlows: [
        { year: 2022, importer_iso3: "DEU", exporter_iso3: "RUS", qty: 100 },
      ],
      routes: [
        { disruption_id: "druzhba" as const, kind: "pipeline" as const, exporter_iso3: "RUS", importer_iso3: "DEU", share: 0.6 },
      ],
      refineries: [
        { asset_id: "X1", country_iso3: "DEU", capacity: 0 },
        { asset_id: "X2", country_iso3: "DEU", capacity: 0 },
        { asset_id: "X3", country_iso3: "DEU", capacity: 0 },
      ],
    });
    // Each refinery gets 1/3 of DEU's imports as historical feedstock
    const x1 = r.byRefinery.find((x) => x.asset_id === "X1");
    expect(x1).toBeDefined();
    if (!x1) throw new Error("X1 not found");
    // historical = 100/3 = 33.33; at-risk = 33.33 * 0.6 = 20
    expect(x1.atRiskQty).toBeCloseTo(20, 4);
    expect(x1.shareAtRisk).toBeCloseTo(0.6, 6);
  });
});
