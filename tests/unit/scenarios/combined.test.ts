import { describe, it, expect } from "vitest";
import { computeScenarioImpact } from "@/lib/scenarios/engine";
import { combineShares } from "@/lib/scenarios/shares";
import type { RouteRow, TradeFlowRow } from "@/lib/scenarios/types";

const TRADE: readonly TradeFlowRow[] = [
  { year: 2024, importer_iso3: "JPN", exporter_iso3: "QAT", qty: 100 },
  { year: 2024, importer_iso3: "DEU", exporter_iso3: "RUS", qty: 100 },
];

/** Hormuz and a second chokepoint both claim part of QAT→JPN. */
const ROUTES: readonly RouteRow[] = [
  { disruption_id: "hormuz", kind: "chokepoint", exporter_iso3: "QAT", importer_iso3: null, share: 1 },
  { disruption_id: "hormuz", kind: "chokepoint", exporter_iso3: "QAT", importer_iso3: "ARE", share: 0 },
  { disruption_id: "druzhba", kind: "pipeline", exporter_iso3: "RUS", importer_iso3: "DEU", share: 0.4 },
  { disruption_id: "btc", kind: "pipeline", exporter_iso3: "RUS", importer_iso3: "DEU", share: 0.3 },
  { disruption_id: "btc", kind: "pipeline", exporter_iso3: "QAT", importer_iso3: null, share: 0.6 },
];

function run(scenarioIds: readonly ("hormuz" | "druzhba" | "btc")[]) {
  return computeScenarioImpact({
    scenarioId: scenarioIds[0] ?? "hormuz",
    scenarioIds,
    commodity: "oil",
    year: 2024,
    tradeFlows: TRADE,
    routes: ROUTES,
  });
}

describe("combineShares", () => {
  it("a single scenario has no range: lower === upper === its share", () => {
    const bounds = combineShares([() => 0.7])("QAT", "JPN");
    expect(bounds).toEqual({ lower: 0.7, upper: 0.7 });
  });

  it("bounds two closures by max (same barrels) and the capped sum (different barrels)", () => {
    expect(combineShares([() => 0.6, () => 0.5])("QAT", "JPN")).toEqual({ lower: 0.6, upper: 1 });
    expect(combineShares([() => 0.4, () => 0.3])("RUS", "DEU")).toEqual({
      lower: 0.4,
      upper: 0.7,
    });
  });

  it("never double counts: a cargo cut by both closures is cut once", () => {
    // Two closures at 1.0 each: the union is still 1.0, not 2.
    expect(combineShares([() => 1, () => 1])("QAT", "JPN")).toEqual({ lower: 1, upper: 1 });
  });
});

describe("combined scenarios through the engine", () => {
  it("headlines the lower bound and carries the upper alongside", () => {
    const r = run(["druzhba", "btc"]);
    const deu = r.byImporter.find((i) => i.iso3 === "DEU");
    expect(deu?.atRiskQty).toBeCloseTo(40, 9); // max(0.4, 0.3) × 100
    expect(deu?.atRiskQtyUpper).toBeCloseTo(70, 9); // min(1, 0.7) × 100
    expect(deu?.shareAtRisk).toBeCloseTo(0.4, 9);
    expect(deu?.shareAtRiskUpper).toBeCloseTo(0.7, 9);
  });

  it("caps the upper bound at the whole flow", () => {
    const jpn = run(["hormuz", "btc"]).byImporter.find((i) => i.iso3 === "JPN");
    expect(jpn?.atRiskQty).toBeCloseTo(100, 9); // max(1, 0.6)
    expect(jpn?.atRiskQtyUpper).toBeCloseTo(100, 9); // min(1, 1.6) — not 160
  });

  it("resolves pair-over-wildcard inside each scenario before combining", () => {
    // QAT→ARE is 0 under Hormuz, but BTC's exporter-wide 0.6 still applies.
    const r = computeScenarioImpact({
      scenarioId: "hormuz",
      scenarioIds: ["hormuz", "btc"],
      commodity: "oil",
      year: 2024,
      tradeFlows: [{ year: 2024, importer_iso3: "ARE", exporter_iso3: "QAT", qty: 100 }],
      routes: ROUTES,
    });
    const are = r.byImporter.find((i) => i.iso3 === "ARE");
    expect(are?.atRiskQty).toBeCloseTo(60, 9);
    expect(are?.atRiskQtyUpper).toBeCloseTo(60, 9);
  });

  it("reports the scenarios it combined, primary first", () => {
    const r = run(["druzhba", "btc"]);
    expect(r.scenarioIds).toEqual(["druzhba", "btc"]);
    expect(r.scenarioId).toBe("druzhba");
  });

  it("exporter impacts carry the same bounds", () => {
    const rus = run(["druzhba", "btc"]).byExporter?.find((e) => e.iso3 === "RUS");
    expect(rus?.atRiskQty).toBeCloseTo(40, 9);
    expect(rus?.atRiskQtyUpper).toBeCloseTo(70, 9);
  });

  it("severity scales both bounds", () => {
    const r = computeScenarioImpact({
      scenarioId: "druzhba",
      scenarioIds: ["druzhba", "btc"],
      commodity: "oil",
      year: 2024,
      tradeFlows: TRADE,
      routes: ROUTES,
      severity: 0.5,
    });
    const deu = r.byImporter.find((i) => i.iso3 === "DEU");
    expect(deu?.atRiskQty).toBeCloseTo(20, 9);
    expect(deu?.atRiskQtyUpper).toBeCloseTo(35, 9);
  });

  it("a single-scenario run has upper === lower and matches the plain call", () => {
    const combined = run(["druzhba"]);
    const plain = computeScenarioImpact({
      scenarioId: "druzhba",
      commodity: "oil",
      year: 2024,
      tradeFlows: TRADE,
      routes: ROUTES,
    });
    expect(combined.byImporter).toEqual(plain.byImporter);
    const deu = combined.byImporter.find((i) => i.iso3 === "DEU");
    expect(deu?.atRiskQtyUpper).toBe(deu?.atRiskQty);
    expect(plain.scenarioIds).toEqual(["druzhba"]);
  });
});
