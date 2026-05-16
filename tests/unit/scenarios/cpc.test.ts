import { describe, it, expect } from "vitest";
import { computeScenarioImpact } from "@/lib/scenarios/engine";

describe("CPC scenario", () => {
  it("hits Kazakhstan exports at 80% and partial Russia at 10%", () => {
    const r = computeScenarioImpact({
      scenarioId: "cpc",
      commodity: "oil",
      year: 2023,
      tradeFlows: [
        { year: 2023, importer_iso3: "ITA", exporter_iso3: "KAZ", qty: 100 },
        { year: 2023, importer_iso3: "ITA", exporter_iso3: "RUS", qty: 200 },
      ],
      routes: [
        { disruption_id: "cpc" as const, kind: "pipeline" as const, exporter_iso3: "KAZ", importer_iso3: null, share: 0.80 },
        { disruption_id: "cpc" as const, kind: "pipeline" as const, exporter_iso3: "RUS", importer_iso3: null, share: 0.10 },
      ],
    });
    const ita = r.byImporter.find((x) => x.iso3 === "ITA");
    if (!ita) throw new Error("ITA not found");
    // ITA at-risk = 100 * 0.8 + 200 * 0.1 = 80 + 20 = 100; total = 300; share = 1/3
    expect(ita.atRiskQty).toBeCloseTo(100, 6);
    expect(ita.shareAtRisk).toBeCloseTo(100 / 300, 6);
  });
});
