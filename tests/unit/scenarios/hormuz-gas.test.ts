import { describe, it, expect } from "vitest";
import { computeScenarioImpact } from "@/lib/scenarios/engine";
import type {
  DisruptionRouteRow,
  LngImportRow,
  TradeFlowRow,
} from "@/lib/scenarios/types";

const hormuzRoutes: DisruptionRouteRow[] = [
  // Phase 2 Hormuz: QAT → all importers, share=1.0
  { disruption_id: "hormuz", kind: "chokepoint", exporter_iso3: "QAT", importer_iso3: null, share: 1.0 },
];

const lngFlows2022: TradeFlowRow[] = [
  { year: 2022, importer_iso3: "JPN", exporter_iso3: "QAT", qty: 50 },
  { year: 2022, importer_iso3: "JPN", exporter_iso3: "AUS", qty: 30 },
  // KOR: 60 from QAT, 40 from USA → total 100, atRisk 60, shareAtRisk 0.6
  { year: 2022, importer_iso3: "KOR", exporter_iso3: "QAT", qty: 60 },
  { year: 2022, importer_iso3: "KOR", exporter_iso3: "USA", qty: 40 },
  { year: 2022, importer_iso3: "GBR", exporter_iso3: "QAT", qty: 70 },
  { year: 2022, importer_iso3: "GBR", exporter_iso3: "USA", qty: 30 },
];

const lngImports: LngImportRow[] = [
  { asset_id: "JPN-T1", country_iso3: "JPN", capacity: 75 },
  { asset_id: "JPN-T2", country_iso3: "JPN", capacity: 25 },
  { asset_id: "KOR-T1", country_iso3: "KOR", capacity: 100 },
  { asset_id: "GBR-T1", country_iso3: "GBR", capacity: 100 },
];

describe("computeScenarioImpact — hormuz under commodity=gas", () => {
  it("populates byLngImport and leaves byRefinery empty", () => {
    const result = computeScenarioImpact({
      scenarioId: "hormuz",
      commodity: "gas",
      year: 2022,
      tradeFlows: lngFlows2022,
      routes: hormuzRoutes,
      lngImports,
    });
    expect(result.commodity).toBe("gas");
    expect(result.byRefinery).toEqual([]);
    expect(result.byLngImport.length).toBe(4);
    // GBR-T1 has the highest atRiskQty (70) — sole terminal serving 100 total, 70 at risk
    expect(result.rankedLngImports[0].asset_id).toBe("GBR-T1");
    // KOR-T1: 60 from QAT out of 100 total → shareAtRisk = 0.6
    const kor = result.byLngImport.find((t) => t.asset_id === "KOR-T1");
    expect(kor).toBeDefined();
    if (!kor) throw new Error("KOR-T1 not found");
    expect(kor.shareAtRisk).toBeCloseTo(0.6, 5);
  });

  it("country-level ranked list reflects gas flows, not crude", () => {
    const result = computeScenarioImpact({
      scenarioId: "hormuz",
      commodity: "gas",
      year: 2022,
      tradeFlows: lngFlows2022,
      routes: hormuzRoutes,
      lngImports,
    });
    const gbr = result.byImporter.find((i) => i.iso3 === "GBR");
    expect(gbr).toBeDefined();
    if (!gbr) throw new Error("GBR not found");
    expect(gbr.totalQty).toBe(100);
    expect(gbr.atRiskQty).toBe(70);   // QAT portion
    expect(gbr.shareAtRisk).toBeCloseTo(0.7, 5);
  });

  it("under commodity=oil with no refineries, byLngImport stays empty", () => {
    const result = computeScenarioImpact({
      scenarioId: "hormuz",
      commodity: "oil",
      year: 2022,
      tradeFlows: lngFlows2022,
      routes: hormuzRoutes,
    });
    expect(result.commodity).toBe("oil");
    expect(result.byLngImport).toEqual([]);
  });
});
