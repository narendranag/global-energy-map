import { describe, it, expect } from "vitest";
import { computeHormuzImpact } from "@/lib/scenarios/hormuz";

const tradeFlows = [
  // importer, exporter, qty
  { year: 2024, importer_iso3: "IND", exporter_iso3: "SAU", qty: 100 },
  { year: 2024, importer_iso3: "IND", exporter_iso3: "IRQ", qty: 50 },
  { year: 2024, importer_iso3: "IND", exporter_iso3: "USA", qty: 25 },
  { year: 2024, importer_iso3: "CHN", exporter_iso3: "SAU", qty: 200 },
  { year: 2024, importer_iso3: "CHN", exporter_iso3: "RUS", qty: 300 },
];
const routes = [
  { disruption_id: "hormuz" as const, kind: "chokepoint" as const, exporter_iso3: "SAU", importer_iso3: null, share: 0.88 },
  { disruption_id: "hormuz" as const, kind: "chokepoint" as const, exporter_iso3: "IRQ", importer_iso3: null, share: 1.0 },
  { disruption_id: "hormuz" as const, kind: "chokepoint" as const, exporter_iso3: "IRN", importer_iso3: null, share: 1.0 },
  { disruption_id: "hormuz" as const, kind: "chokepoint" as const, exporter_iso3: "KWT", importer_iso3: null, share: 1.0 },
  { disruption_id: "hormuz" as const, kind: "chokepoint" as const, exporter_iso3: "QAT", importer_iso3: null, share: 1.0 },
  { disruption_id: "hormuz" as const, kind: "chokepoint" as const, exporter_iso3: "ARE", importer_iso3: null, share: 0.65 },
  { disruption_id: "hormuz" as const, kind: "chokepoint" as const, exporter_iso3: "BHR", importer_iso3: null, share: 1.0 },
];

describe("computeHormuzImpact", () => {
  it("computes per-importer at-risk share for a given year", () => {
    const r = computeHormuzImpact({ year: 2024, tradeFlows, routes });
    // India: SAU 100*0.88 = 88; IRQ 50*1 = 50; sum at risk = 138 of total 175 → 0.788...
    const india = r.byImporter.find((x) => x.iso3 === "IND");
    expect(india).toBeDefined();
    if (!india) throw new Error("india not found");
    expect(india.totalQty).toBe(175);
    expect(india.atRiskQty).toBeCloseTo(138, 6);
    expect(india.shareAtRisk).toBeCloseTo(138 / 175, 6);
    // China: SAU 200*0.88 = 176; RUS not in chokepoint set → 0; share = 176 / 500 = 0.352
    const china = r.byImporter.find((x) => x.iso3 === "CHN");
    if (!china) throw new Error("china not found");
    expect(china.shareAtRisk).toBeCloseTo(176 / 500, 6);
  });

  it("returns zero impact for importers with no chokepoint exposure", () => {
    const r = computeHormuzImpact({
      year: 2024,
      tradeFlows: [{ year: 2024, importer_iso3: "MEX", exporter_iso3: "USA", qty: 10 }],
      routes,
    });
    expect(r.byImporter[0]?.shareAtRisk).toBe(0);
  });

  it("ranks importers by absolute at-risk qty descending", () => {
    const r = computeHormuzImpact({ year: 2024, tradeFlows, routes });
    expect(r.rankedImporters[0]?.iso3).toBe("CHN"); // 176 > 138
    expect(r.rankedImporters[1]?.iso3).toBe("IND");
  });
});
