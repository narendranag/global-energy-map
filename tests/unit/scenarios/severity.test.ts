import { describe, it, expect } from "vitest";
import { computeScenarioImpact } from "@/lib/scenarios/engine";
import type { DisruptionRouteRow, LngImportRow, RefineryRow, TradeFlowRow } from "@/lib/scenarios/types";

const TRADE: readonly TradeFlowRow[] = [
  { year: 2024, importer_iso3: "IND", exporter_iso3: "SAU", qty: 100 },
  { year: 2024, importer_iso3: "IND", exporter_iso3: "USA", qty: 100 },
];
const ROUTES: readonly DisruptionRouteRow[] = [
  { disruption_id: "hormuz", kind: "chokepoint", exporter_iso3: "SAU", importer_iso3: null, share: 0.8 },
];
const REFINERIES: readonly RefineryRow[] = [{ asset_id: "r1", country_iso3: "IND", capacity: 100 }];
const TERMINALS: readonly LngImportRow[] = [
  { asset_id: "t1", country_iso3: "IND", capacity: 10, name: "t1" },
];

function oil(severity?: number) {
  return computeScenarioImpact({
    scenarioId: "hormuz",
    commodity: "oil",
    year: 2024,
    tradeFlows: TRADE,
    routes: ROUTES,
    refineries: REFINERIES,
    ...(severity === undefined ? {} : { severity }),
  });
}

describe("scenario severity", () => {
  it("defaults to 1 — a full closure, today's numbers", () => {
    const r = oil();
    expect(r.severity).toBe(1);
    expect(r.byImporter[0]?.atRiskQty).toBeCloseTo(80, 9);
    expect(r.byImporter[0]?.shareAtRisk).toBeCloseTo(0.4, 9);
  });

  it("scales volume at risk linearly", () => {
    const r = oil(0.5);
    expect(r.severity).toBe(0.5);
    expect(r.byImporter[0]?.totalQty).toBe(200); // the denominator does not move
    expect(r.byImporter[0]?.atRiskQty).toBeCloseTo(40, 9);
    expect(r.byImporter[0]?.shareAtRisk).toBeCloseTo(0.2, 9);
  });

  it("severity 0 means nothing is cut", () => {
    const r = oil(0);
    expect(r.severity).toBe(0);
    expect(r.byImporter[0]?.atRiskQty).toBe(0);
    expect(r.byImporter[0]?.shareAtRisk).toBe(0);
  });

  it("refinery attribution follows", () => {
    expect(oil(0.25).byRefinery[0]?.atRiskQty).toBeCloseTo(20, 9);
    expect(oil(0.25).byRefinery[0]?.shareAtRisk).toBeCloseTo(0.1, 9);
  });

  it("LNG terminal attribution follows", () => {
    const r = computeScenarioImpact({
      scenarioId: "hormuz",
      commodity: "gas",
      year: 2024,
      tradeFlows: TRADE,
      routes: ROUTES,
      lngImports: TERMINALS,
      severity: 0.25,
    });
    expect(r.byLngImport[0]?.atRiskQty).toBeCloseTo(20, 9);
    expect(r.byLngImport[0]?.shareAtRisk).toBeCloseTo(0.1, 9);
  });

  it("clamps out-of-range and non-finite values", () => {
    expect(oil(2).severity).toBe(1);
    expect(oil(2).byImporter[0]?.atRiskQty).toBeCloseTo(80, 9);
    expect(oil(-1).severity).toBe(0);
    expect(oil(Number.NaN).severity).toBe(1);
    expect(oil(Number.NaN).byImporter[0]?.atRiskQty).toBeCloseTo(80, 9);
  });
});
