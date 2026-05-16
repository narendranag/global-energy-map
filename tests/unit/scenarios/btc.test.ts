import { describe, it, expect } from "vitest";
import { computeScenarioImpact } from "@/lib/scenarios/engine";

describe("BTC scenario", () => {
  it("hits 90% of Azerbaijani exports regardless of destination", () => {
    const r = computeScenarioImpact({
      scenarioId: "btc",
      year: 2023,
      tradeFlows: [
        { year: 2023, importer_iso3: "ITA", exporter_iso3: "AZE", qty: 60 },
        { year: 2023, importer_iso3: "ISR", exporter_iso3: "AZE", qty: 40 },
      ],
      routes: [
        { disruption_id: "btc" as const, kind: "pipeline" as const, exporter_iso3: "AZE", importer_iso3: null, share: 0.90 },
      ],
    });
    const ita = r.byImporter.find((x) => x.iso3 === "ITA");
    if (!ita) throw new Error("ITA not found");
    expect(ita.shareAtRisk).toBeCloseTo(0.9, 6);
    const isr = r.byImporter.find((x) => x.iso3 === "ISR");
    if (!isr) throw new Error("ISR not found");
    expect(isr.shareAtRisk).toBeCloseTo(0.9, 6);
  });
});
