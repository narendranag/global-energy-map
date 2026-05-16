import { describe, it, expect } from "vitest";
import { computeScenarioImpact } from "@/lib/scenarios/engine";

describe("Druzhba scenario", () => {
  it("hits Hungary at ~100%, Germany at ~60%", () => {
    const r = computeScenarioImpact({
      scenarioId: "druzhba",
      commodity: "oil",
      year: 2022,
      tradeFlows: [
        { year: 2022, importer_iso3: "HUN", exporter_iso3: "RUS", qty: 100 },
        { year: 2022, importer_iso3: "DEU", exporter_iso3: "RUS", qty: 100 },
        { year: 2022, importer_iso3: "DEU", exporter_iso3: "USA", qty: 100 },
        { year: 2022, importer_iso3: "DEU", exporter_iso3: "NOR", qty: 100 },
      ],
      routes: [
        { disruption_id: "druzhba" as const, kind: "pipeline" as const, exporter_iso3: "RUS", importer_iso3: "HUN", share: 1.0 },
        { disruption_id: "druzhba" as const, kind: "pipeline" as const, exporter_iso3: "RUS", importer_iso3: "DEU", share: 0.6 },
      ],
    });
    const hun = r.byImporter.find((x) => x.iso3 === "HUN");
    if (!hun) throw new Error("HUN not found");
    expect(hun.shareAtRisk).toBeCloseTo(1.0, 6);
    const deu = r.byImporter.find((x) => x.iso3 === "DEU");
    if (!deu) throw new Error("DEU not found");
    // DEU at-risk = 100 (RUS) * 0.6 = 60; total = 300; share = 60/300 = 0.2
    expect(deu.shareAtRisk).toBeCloseTo(60 / 300, 6);
  });

  it("ignores Hormuz-only routes when Druzhba is active", () => {
    const r = computeScenarioImpact({
      scenarioId: "druzhba",
      commodity: "oil",
      year: 2022,
      tradeFlows: [{ year: 2022, importer_iso3: "IND", exporter_iso3: "SAU", qty: 100 }],
      routes: [
        { disruption_id: "hormuz" as const, kind: "chokepoint" as const, exporter_iso3: "SAU", importer_iso3: null, share: 0.88 },
      ],
    });
    expect(r.byImporter.find((x) => x.iso3 === "IND")?.shareAtRisk).toBe(0);
  });
});
