import { describe, it, expect } from "vitest";
import { computeScenarioImpact } from "@/lib/scenarios/engine";
import type { DisruptionRouteRow, TradeFlowRow } from "@/lib/scenarios/types";

const TRADE: readonly TradeFlowRow[] = [
  { year: 2024, importer_iso3: "IND", exporter_iso3: "SAU", qty: 100 },
  { year: 2024, importer_iso3: "CHN", exporter_iso3: "SAU", qty: 300 },
  { year: 2024, importer_iso3: "BHR", exporter_iso3: "SAU", qty: 100 }, // intra-Gulf, share 0
  { year: 2024, importer_iso3: "IND", exporter_iso3: "USA", qty: 50 },
  { year: 2023, importer_iso3: "IND", exporter_iso3: "SAU", qty: 999 }, // other year
];

const ROUTES: readonly DisruptionRouteRow[] = [
  { disruption_id: "hormuz", kind: "chokepoint", exporter_iso3: "SAU", importer_iso3: null, share: 0.5 },
  { disruption_id: "hormuz", kind: "chokepoint", exporter_iso3: "SAU", importer_iso3: "BHR", share: 0 },
];

function run(severity?: number) {
  return computeScenarioImpact({
    scenarioId: "hormuz",
    commodity: "oil",
    year: 2024,
    tradeFlows: TRADE,
    routes: ROUTES,
    ...(severity === undefined ? {} : { severity }),
  });
}

describe("exporter-side impact", () => {
  it("reports each exporter's exports, volume cut and share at risk", () => {
    const sau = run().byExporter?.find((e) => e.iso3 === "SAU");
    expect(sau).toBeDefined();
    // 500 t exported in 2024; the BHR pair row is 0, so 400 t × 0.5 = 200 cut.
    expect(sau?.totalQty).toBe(500);
    expect(sau?.atRiskQty).toBeCloseTo(200, 9);
    expect(sau?.shareAtRisk).toBeCloseTo(0.4, 9);
  });

  it("lists exporters with no exposure at zero", () => {
    const usa = run().byExporter?.find((e) => e.iso3 === "USA");
    expect(usa?.totalQty).toBe(50);
    expect(usa?.atRiskQty).toBe(0);
    expect(usa?.shareAtRisk).toBe(0);
  });

  it("ranks exporters by volume at risk, descending", () => {
    expect(run().rankedExporters?.map((e) => e.iso3)).toEqual(["SAU", "USA"]);
  });

  it("uses the same year filter and share lookup as the importer view", () => {
    const r = run();
    const exporterTotal = (r.byExporter ?? []).reduce((s, e) => s + e.totalQty, 0);
    const importerTotal = r.byImporter.reduce((s, i) => s + i.totalQty, 0);
    expect(exporterTotal).toBe(importerTotal);
    const exporterRisk = (r.byExporter ?? []).reduce((s, e) => s + e.atRiskQty, 0);
    const importerRisk = r.byImporter.reduce((s, i) => s + i.atRiskQty, 0);
    // Relative, not absolute (review finding 7): `toBeCloseTo(x, 9)` asks for
    // agreement to 5e-10 in *absolute* tonnes, which these two-figure
    // fixtures pass and real BACI totals (1e8 t, where a double's own ulp is
    // ~1e-8) could not. The identity is exact in exact arithmetic, so the
    // only slack it needs is floating-point noise proportional to the sum.
    expect(Math.abs(exporterRisk - importerRisk)).toBeLessThanOrEqual(
      Math.max(Math.abs(exporterRisk), 1) * 1e-12,
    );
  });

  it("holds the two-sided identity at BACI-sized quantities", () => {
    // Same rows, realistic magnitudes: ~1.2e8 tonnes across many pairs, where
    // an absolute tolerance of 5e-10 would be smaller than one ulp.
    const big: TradeFlowRow[] = [];
    for (let i = 0; i < 200; i++) {
      big.push({ year: 2024, importer_iso3: `I${String(i)}`, exporter_iso3: "SAU", qty: 613_457.31 + i });
      big.push({ year: 2024, importer_iso3: `I${String(i)}`, exporter_iso3: "USA", qty: 91_233.07 + i });
    }
    const r = computeScenarioImpact({
      scenarioId: "hormuz",
      commodity: "oil",
      year: 2024,
      tradeFlows: big,
      routes: ROUTES,
    });
    const exporterRisk = (r.byExporter ?? []).reduce((s, e) => s + e.atRiskQty, 0);
    const importerRisk = r.byImporter.reduce((s, i) => s + i.atRiskQty, 0);
    expect(exporterRisk).toBeGreaterThan(1e7);
    expect(Math.abs(exporterRisk - importerRisk) / exporterRisk).toBeLessThan(1e-12);
  });

  it("scales with severity", () => {
    expect(run(0.5).byExporter?.find((e) => e.iso3 === "SAU")?.atRiskQty).toBeCloseTo(100, 9);
  });
});
