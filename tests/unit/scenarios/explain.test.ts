import { describe, it, expect } from "vitest";
import { computeScenarioImpact } from "@/lib/scenarios/engine";
import type { DisruptionRouteRow, ScenarioId, TradeFlowRow } from "@/lib/scenarios/types";
import { describeExposure, explainZeroExposure } from "@/components/scenarios/explain";

const flow = (exporter: string, importer: string, qty: number, year = 2021): TradeFlowRow => ({
  year,
  exporter_iso3: exporter,
  importer_iso3: importer,
  qty,
});

const route = (
  id: ScenarioId,
  exporter: string,
  importer: string | null,
  share: number,
): DisruptionRouteRow => ({
  disruption_id: id,
  kind: importer === null ? "chokepoint" : "pipeline",
  exporter_iso3: exporter,
  importer_iso3: importer,
  share,
});

const DRUZHBA = [route("druzhba", "RUS", "DEU", 0.5), route("druzhba", "RUS", "HUN", 1)];
const HORMUZ = [route("hormuz", "SAU", null, 0.88), route("hormuz", "IRN", null, 1)];

const FLOWS = [
  flow("RUS", "DEU", 1000),
  flow("NOR", "DEU", 1000),
  flow("RUS", "HUN", 400),
  flow("RUS", "FRA", 300), // Russian crude, but not along Druzhba
  flow("USA", "FRA", 700),
  flow("NOR", "GBR", 500),
  flow("SAU", "IND", 800),
  flow("USA", "IND", 200),
  flow("SAU", "JPN", 50, 2020), // other year: must be ignored
];

function run(id: ScenarioId, routes: DisruptionRouteRow[]) {
  const result = computeScenarioImpact({
    scenarioId: id,
    commodity: "oil",
    year: 2021,
    tradeFlows: FLOWS,
    routes,
  });
  return (iso3: string) => explainZeroExposure(iso3, result, { tradeFlows: FLOWS, routes });
}

describe("explainZeroExposure", () => {
  it("exposed: agrees with the engine and lists the suppliers carrying the risk", () => {
    const e = run("druzhba", DRUZHBA)("DEU");
    expect(e.kind).toBe("exposed");
    if (e.kind !== "exposed") return;
    expect(e.shareAtRisk).toBeCloseTo(0.25);
    expect(e.atRiskQty).toBeCloseTo(500);
    expect(e.totalQty).toBe(2000);
    expect(e.suppliers).toEqual([{ iso3: "RUS", qty: 1000, share: 0.5, atRiskQty: 500 }]);
  });

  it("not-on-route: buys from the route's exporter, but no pair share for this importer", () => {
    const e = run("druzhba", DRUZHBA)("FRA");
    expect(e).toMatchObject({ kind: "not-on-route", totalQty: 1000 });
    if (e.kind !== "not-on-route") return;
    expect(e.routeExporters).toEqual([{ iso3: "RUS", qty: 300 }]);
  });

  it("not-on-route with explicit share-0 pairs says so (trade that stays inside the Gulf)", () => {
    const routes = [route("hormuz", "SAU", null, 0.88), route("hormuz", "SAU", "BHR", 0)];
    const flows = [flow("SAU", "BHR", 900)];
    const result = computeScenarioImpact({ scenarioId: "hormuz", commodity: "oil", year: 2021, tradeFlows: flows, routes });
    const e = explainZeroExposure("BHR", result, { tradeFlows: flows, routes });
    expect(e).toMatchObject({ kind: "not-on-route", zeroPairs: true });
    const text = describeExposure(e, {
      commodity: "oil",
      routeName: "the Strait of Hormuz",
      nameOf: (c) => c,
      formatVolume: (t) => `${t.toString()} t`,
    });
    expect(text).toContain("sets a 0% route share for these pairs");
    expect(run("druzhba", DRUZHBA)("FRA")).toMatchObject({ zeroPairs: false });
  });

  it("no-route-suppliers: imports exist, none from the route's exporters", () => {
    const e = run("druzhba", DRUZHBA)("GBR");
    expect(e).toMatchObject({ kind: "no-route-suppliers", totalQty: 500 });
    if (e.kind !== "no-route-suppliers") return;
    expect(e.topSuppliers.map((s) => s.iso3)).toEqual(["NOR"]);
  });

  it("no-imports: no BACI rows for the country in the scenario year", () => {
    // JPN only has a 2020 row; the scenario year is 2021.
    expect(run("hormuz", HORMUZ)("JPN")).toEqual({ kind: "no-imports", iso3: "JPN", year: 2021 });
  });

  it("exporter: the country supplies the route (exporter-wide share)", () => {
    const e = run("hormuz", HORMUZ)("SAU");
    expect(e).toMatchObject({ kind: "exporter", routeShare: 0.88, routeImporters: [], importShareAtRisk: 0 });
  });

  it("exporter wins over the exporter's own small exposed imports", () => {
    const flows = [...FLOWS, flow("IRN", "SAU", 10), flow("USA", "SAU", 90)];
    const result = computeScenarioImpact({
      scenarioId: "hormuz",
      commodity: "oil",
      year: 2021,
      tradeFlows: flows,
      routes: HORMUZ,
    });
    const e = explainZeroExposure("SAU", result, { tradeFlows: flows, routes: HORMUZ });
    expect(e).toMatchObject({ kind: "exporter", routeShare: 0.88, importAtRiskQty: 10 });
    if (e.kind !== "exporter") return;
    expect(e.importShareAtRisk).toBeCloseTo(0.1);
    const s = describeExposure(e, {
      commodity: "oil",
      routeName: "the Strait of Hormuz",
      nameOf: (x) => x,
      formatVolume: (t) => `${t.toString()} t`,
    });
    expect(s).toMatch(/^SAU is an exporter on this route \(88% of its exports use/);
    expect(s).toMatch(/Its own crude imports show 10\.0% at risk \(10 t\)/);
  });

  it("exporter: pair-only shares report the importers served", () => {
    const e = run("druzhba", DRUZHBA)("RUS");
    expect(e).toMatchObject({ kind: "exporter", routeShare: null, routeImporters: ["DEU", "HUN"] });
  });

  it("ignores routes from other scenarios", () => {
    const e = run("hormuz", [...HORMUZ, ...DRUZHBA])("FRA");
    expect(e.kind).toBe("no-route-suppliers");
  });
});

describe("describeExposure", () => {
  const ctx = {
    commodity: "oil" as const,
    routeName: "the Druzhba pipeline",
    nameOf: (iso3: string) => ({ DEU: "Germany", FRA: "France", RUS: "Russia", GBR: "United Kingdom", NOR: "Norway", HUN: "Hungary" })[iso3] ?? iso3,
    formatVolume: (t: number) => `${t.toString()} t`,
  };
  const explain = run("druzhba", DRUZHBA);

  it("exposed: share, volumes and supplier", () => {
    const s = describeExposure(explain("DEU"), ctx);
    expect(s).toMatch(/Germany: 25\.0% of its 2021 crude imports/);
    expect(s).toMatch(/500 t of 2000 t/);
    expect(s).toMatch(/Russia/);
  });

  it("zero cases start with 0% and name the reason", () => {
    expect(describeExposure(explain("FRA"), ctx)).toMatch(/^0%: France imports from Russia \(300 t\), but/);
    expect(describeExposure(explain("GBR"), ctx)).toMatch(/none of it from exporters.*Largest suppliers: Norway/);
    expect(describeExposure(explain("RUS"), ctx)).toMatch(/exporter on this route.*Germany and Hungary/);
    expect(describeExposure(explain("JPN"), ctx)).toMatch(/BACI records no crude imports into JPN in 2021/);
  });

  it("gas wording says LNG", () => {
    expect(describeExposure(explain("GBR"), { ...ctx, commodity: "gas" })).toMatch(/of LNG in 2021/);
  });
});
