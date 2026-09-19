import { describe, expect, it } from "vitest";
import {
  buildCountryProfile,
  buildExposure,
  describeSeries,
  toTimeSeries,
  type CountryProfileInputs,
  type CountrySeriesRow,
  type CountryTradeRow,
} from "@/lib/data/country-profile";
import type { ScenarioDef } from "@/lib/scenarios/registry";
import type { ScenarioId, ScenarioResult } from "@/lib/scenarios/types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NAMES = new Map([
  ["JPN", "Japan"],
  ["ARE", "United Arab Emirates"],
  ["SAU", "Saudi Arabia"],
  ["KWT", "Kuwait"],
  ["NOR", "Norway"],
]);

const series: CountrySeriesRow[] = [
  { iso3: "NOR", year: 2018, metric: "proved_reserves_oil_bbn_bbl", value: 8.6 },
  { iso3: "NOR", year: 2019, metric: "proved_reserves_oil_bbn_bbl", value: 8.5 },
  { iso3: "NOR", year: 2020, metric: "proved_reserves_oil_bbn_bbl", value: 7.9 },
  { iso3: "NOR", year: 2018, metric: "production_crude_kbpd", value: 1844 },
  { iso3: "NOR", year: 2020, metric: "production_crude_kbpd", value: 2001 },
  { iso3: "NOR", year: 2023, metric: "production_crude_kbpd", value: 1839 },
  // another country, which must never leak into NOR's profile
  { iso3: "SAU", year: 2020, metric: "production_crude_kbpd", value: 11039 },
];

const trade: CountryTradeRow[] = [
  { year: 2024, hs_code: "2709", importer_iso3: "JPN", exporter_iso3: "ARE", qty: 49 },
  { year: 2024, hs_code: "2709", importer_iso3: "JPN", exporter_iso3: "SAU", qty: 46 },
  { year: 2024, hs_code: "2709", importer_iso3: "JPN", exporter_iso3: "KWT", qty: 5 },
  { year: 2023, hs_code: "2709", importer_iso3: "JPN", exporter_iso3: "SAU", qty: 60 },
  // a different commodity in the same year: must not be counted on the oil axis
  { year: 2024, hs_code: "271111", importer_iso3: "JPN", exporter_iso3: "AUS", qty: 30 },
  // Norway sells; Japan does not
  { year: 2024, hs_code: "2709", importer_iso3: "JPN", exporter_iso3: "NOR", qty: 1 },
  { year: 2024, hs_code: "2709", importer_iso3: "DEU", exporter_iso3: "NOR", qty: 9 },
];

function result(
  id: ScenarioId,
  rows: readonly { iso3: string; totalQty: number; atRiskQty: number }[],
): ScenarioResult {
  const byImporter = rows.map((r) => ({
    ...r,
    shareAtRisk: r.totalQty > 0 ? r.atRiskQty / r.totalQty : 0,
  }));
  return {
    scenarioId: id,
    commodity: "oil",
    year: 2024,
    byImporter,
    rankedImporters: byImporter,
    byRefinery: [],
    rankedRefineries: [],
    byLngImport: [],
    rankedLngImports: [],
  };
}

const EMPTY: CountryProfileInputs = {
  names: null,
  series: null,
  trade: null,
  exposure: null,
  gasStorage: null,
  recentImports: null,
  assets: null,
};

// ---------------------------------------------------------------------------

describe("toTimeSeries", () => {
  const byYear = new Map([
    [1998, 4],
    [2000, 10],
    [2001, 6],
  ]);
  const opts = { label: "Thing", unit: "kb/d", from: 1996, through: 2002, year: 2001, source: null };

  it("is dense over the span, with gaps as nulls", () => {
    const s = toTimeSeries(byYear, opts);
    expect(s?.points.map((p) => p.value)).toEqual([null, null, 4, null, 10, 6, null]);
    expect(s?.points[0]?.year).toBe(1996);
  });

  it("reports the headline value, extremes and ends", () => {
    const s = toTimeSeries(byYear, opts);
    expect(s).toMatchObject({
      value: 6,
      valueYear: 2001,
      markerIndex: 5,
      min: { year: 1998, value: 4 },
      max: { year: 2000, value: 10 },
      staleNote: null,
    });
    expect(s?.first).toEqual({ year: 1998, value: 4 });
    expect(s?.last).toEqual({ year: 2001, value: 6 });
  });

  it("falls back to the latest earlier year and says the value is stale", () => {
    const s = toTimeSeries(byYear, { ...opts, year: 2002, staleLabel: "the source stops at" });
    expect(s?.value).toBe(6);
    expect(s?.valueYear).toBe(2001);
    expect(s?.staleNote).toBe("2001 value — the source stops at");
  });

  it("has no headline value before the series starts", () => {
    const s = toTimeSeries(byYear, { ...opts, year: 1996 });
    expect(s?.value).toBeNull();
    expect(s?.markerIndex).toBe(-1);
  });

  it("is null for an empty series", () => {
    expect(toTimeSeries(new Map(), opts)).toBeNull();
  });
});

describe("describeSeries", () => {
  it("names the span, the ends and the extremes", () => {
    const s = toTimeSeries(new Map([[2000, 10], [2001, 4]]), {
      label: "Oil production",
      unit: "kb/d",
      from: 2000,
      through: 2001,
      year: 2001,
      source: null,
    });
    if (s === null) throw new Error("series");
    expect(describeSeries(s)).toBe(
      "Oil production, 2000–2001: 10.0 to 4.00 kb/d; low 4.00 in 2001, high 10.0 in 2000.",
    );
  });

  it("says so when the series is flat", () => {
    const s = toTimeSeries(new Map([[2000, 3], [2001, 3]]), {
      label: "X",
      unit: "t",
      from: 2000,
      through: 2001,
      year: 2001,
      source: null,
    });
    if (s === null) throw new Error("series");
    expect(describeSeries(s)).toContain("flat at 3.00 t");
  });
});

describe("buildExposure", () => {
  const defs: ScenarioDef[] = [
    { id: "hormuz", label: "Close Hormuz", kind: "chokepoint", commodities: ["oil", "gas"], description: "", routeName: "the Strait of Hormuz" },
    { id: "druzhba", label: "Cut Druzhba", kind: "pipeline", commodities: ["oil"], description: "", routeName: "the Druzhba pipeline" },
    { id: "btc", label: "Cut BTC", kind: "pipeline", commodities: ["gas"], description: "", routeName: "BTC" },
  ];

  it("ranks the country's rows by share and skips scenarios off this commodity", () => {
    const results = new Map<ScenarioId, ScenarioResult>([
      ["hormuz", result("hormuz", [{ iso3: "JPN", totalQty: 100, atRiskQty: 80 }])],
      ["druzhba", result("druzhba", [{ iso3: "JPN", totalQty: 100, atRiskQty: 1 }])],
      ["btc", result("btc", [{ iso3: "JPN", totalQty: 100, atRiskQty: 99 }])],
    ]);
    const rows = buildExposure(results, "JPN", "oil", 2024, defs);
    expect(rows.map((r) => r.scenarioId)).toEqual(["hormuz", "druzhba"]);
    expect(rows[0]?.shareAtRisk).toBeCloseTo(0.8);
    expect(rows[0]?.atRiskQty).toBe(80);
  });

  it("omits a country with no trade rather than claiming a confident 0%", () => {
    const results = new Map<ScenarioId, ScenarioResult>([
      ["hormuz", result("hormuz", [{ iso3: "JPN", totalQty: 0, atRiskQty: 0 }])],
    ]);
    expect(buildExposure(results, "JPN", "oil", 2024, defs)).toEqual([]);
    expect(buildExposure(results, "ZZZ", "oil", 2024, defs)).toEqual([]);
  });

  it("skips a scenario whose activeYears exclude the year", () => {
    const windowed: ScenarioDef[] = defs
      .filter((d) => d.id !== 'btc')
      .map((d) =>
        d.id === 'hormuz'
          ? { ...d, activeYears: { from: 2023, to: 2025 } }
          : { ...d, activeYears: { to: 2021 } },
      );
    const results = new Map<ScenarioId, ScenarioResult>([
      ["hormuz", result("hormuz", [{ iso3: "JPN", totalQty: 100, atRiskQty: 50 }])],
      ["druzhba", result("druzhba", [{ iso3: "JPN", totalQty: 100, atRiskQty: 50 }])],
    ]);
    expect(buildExposure(results, "JPN", "oil", 2024, windowed).map((r) => r.scenarioId)).toEqual([
      "hormuz",
    ]);
    expect(buildExposure(results, "JPN", "oil", 2020, windowed).map((r) => r.scenarioId)).toEqual([
      "druzhba",
    ]);
  });

  it("ignores a result computed for the other commodity", () => {
    const gas = { ...result("hormuz", [{ iso3: "JPN", totalQty: 10, atRiskQty: 10 }]), commodity: "gas" as const };
    expect(buildExposure(new Map([["hormuz", gas]]), "JPN", "oil", 2024, defs)).toEqual([]);
  });
});

describe("buildCountryProfile", () => {
  it("is empty, but not broken, with nothing loaded", () => {
    const p = buildCountryProfile(EMPTY, "JPN", 2024, "oil");
    expect(p).toMatchObject({ iso3: "JPN", name: "JPN", empty: true, exposure: [], infrastructure: [] });
    expect(p.reserves).toBeNull();
    expect(p.trade).toBeNull();
  });

  it("slices one country's reserves and production", () => {
    const p = buildCountryProfile({ ...EMPTY, names: NAMES, series }, "NOR", 2020, "oil");
    expect(p.name).toBe("Norway");
    expect(p.reserves?.value).toBe(7.9);
    expect(p.reserves?.unit).toBe("bn bbl");
    expect(p.production?.value).toBe(2001);
    // Saudi Arabia's row is in the same table and must not appear.
    expect(p.production?.points.some((q) => q.value === 11039)).toBe(false);
    // The catalog supplies the source line; it is never typed in.
    expect(p.reserves?.source).toMatch(/^Source: Energy Institute/);
  });

  // B9: the EI sheet behind `production_crude_kbpd` is "Oil Production -
  // barrels", which is total liquids (crude + shale + oil sands + condensate
  // + NGLs), not crude. The label has to say so, and the row has no business
  // on the gas axis, where EI publishes no production series at all.
  it("labels production as total liquids and shows it on the oil axis only", () => {
    const oil = buildCountryProfile({ ...EMPTY, names: NAMES, series }, "NOR", 2020, "oil");
    expect(oil.production?.label).toBe("Oil production (total liquids)");
    expect(oil.production?.label).not.toContain("Crude");

    const gas = buildCountryProfile({ ...EMPTY, names: NAMES, series }, "NOR", 2020, "gas");
    expect(gas.production).toBeNull();
  });

  it("marks a reserves value as stale past the last published year", () => {
    const p = buildCountryProfile({ ...EMPTY, series }, "NOR", 2024, "oil");
    expect(p.reserves?.valueYear).toBe(2020);
    expect(p.reserves?.staleNote).toContain("2020 value");
    // Production runs later, so it is not stale at 2023.
    expect(buildCountryProfile({ ...EMPTY, series }, "NOR", 2023, "oil").production?.staleNote).toBeNull();
  });

  it("reads gas reserves off the gas commodity", () => {
    const gasSeries: CountrySeriesRow[] = [
      { iso3: "NOR", year: 2020, metric: "proved_reserves_gas_tcm", value: 1.4 },
    ];
    const p = buildCountryProfile({ ...EMPTY, series: gasSeries }, "NOR", 2020, "gas");
    expect(p.reserves?.value).toBe(1.4);
    expect(p.reserves?.unit).toBe("tcm");
    // Oil has no rows in this fixture, so the section is omitted entirely.
    expect(buildCountryProfile({ ...EMPTY, series: gasSeries }, "NOR", 2020, "oil").reserves).toBeNull();
  });

  it("ranks suppliers and customers for the selected year and commodity", () => {
    const p = buildCountryProfile({ ...EMPTY, names: NAMES, trade }, "JPN", 2024, "oil");
    expect(p.trade?.importsQty).toBe(101);
    expect(p.trade?.exportsQty).toBe(0);
    expect(p.trade?.suppliers.map((s) => s.iso3)).toEqual(["ARE", "SAU", "KWT", "NOR"]);
    expect(p.trade?.suppliers[0]).toMatchObject({ name: "United Arab Emirates", qty: 49 });
    expect(p.trade?.suppliers[0]?.share).toBeCloseTo(49 / 101);
    expect(p.trade?.customers).toEqual([]);
    // The LNG row in the fixture is not on the oil axis.
    expect(p.trade?.suppliers.some((s) => s.iso3 === "AUS")).toBe(false);
    expect(p.trade?.hsCode).toBe("2709");
  });

  it("gives an exporter its customers and an imports series with gaps", () => {
    const p = buildCountryProfile({ ...EMPTY, names: NAMES, trade }, "NOR", 2024, "oil");
    expect(p.trade?.customers.map((c) => c.iso3)).toEqual(["DEU", "JPN"]);
    expect(p.trade?.exportsQty).toBe(10);
    expect(p.trade?.importsSeries).toBeNull();
    expect(p.trade?.exportsSeries?.points.at(-1)).toEqual({ year: 2024, value: 10 });
  });

  it("returns no trade section for a country BACI never mentions", () => {
    expect(buildCountryProfile({ ...EMPTY, trade }, "ZZZ", 2024, "oil").trade).toBeNull();
  });

  it("flags a year in which the country traded nothing", () => {
    const p = buildCountryProfile({ ...EMPTY, trade }, "JPN", 2010, "oil");
    expect(p.trade?.emptyYear).toBe(true);
    expect(p.trade?.suppliers).toEqual([]);
  });

  // B11: 1,317 BACI rows carry no quantity. They must not be silently folded
  // into the total (which would stop the shares reconciling) and they must
  // not be invisible either: a partner nobody can see is a partner the
  // reader will assume does not exist.
  describe("rows with no recorded quantity (B11)", () => {
    const withNulls: CountryTradeRow[] = [
      { year: 2024, hs_code: "2709", importer_iso3: "JPN", exporter_iso3: "ARE", qty: 90 },
      { year: 2024, hs_code: "2709", importer_iso3: "JPN", exporter_iso3: "SAU", qty: 10 },
      { year: 2024, hs_code: "2709", importer_iso3: "JPN", exporter_iso3: "KWT", qty: null },
      { year: 2024, hs_code: "2709", importer_iso3: "NOR", exporter_iso3: "JPN", qty: null },
    ];

    it("keeps the listed shares reconciling against the stated total", () => {
      const t = buildCountryProfile({ ...EMPTY, names: NAMES, trade: withNulls }, "JPN", 2024, "oil")
        .trade;
      expect(t?.importsQty).toBe(100);
      expect(t?.suppliers.map((s) => s.iso3)).toEqual(["ARE", "SAU"]);
      expect(t?.suppliers.reduce((sum, s) => sum + s.share, 0)).toBeCloseTo(1);
      expect(t?.suppliers.reduce((sum, s) => sum + s.qty, 0)).toBe(t?.importsQty);
    });

    it("counts the partners it had to leave out, per side", () => {
      const t = buildCountryProfile({ ...EMPTY, names: NAMES, trade: withNulls }, "JPN", 2024, "oil")
        .trade;
      expect(t?.unquantifiedSuppliers).toBe(1);
      expect(t?.unquantifiedCustomers).toBe(1);
    });

    it("does not call a year empty when BACI has rows but no quantities", () => {
      const onlyNulls: CountryTradeRow[] = [
        { year: 2024, hs_code: "2709", importer_iso3: "KAZ", exporter_iso3: "ARE", qty: null },
      ];
      const t = buildCountryProfile({ ...EMPTY, trade: onlyNulls }, "KAZ", 2024, "oil").trade;
      expect(t?.importsQty).toBe(0);
      expect(t?.emptyYear).toBe(false);
      expect(t?.unquantifiedSuppliers).toBe(1);
    });
  });

  it("counts assets and sums only the capacities the source carries", () => {
    const asset = (country_iso3: string, capacity: number | null) => ({
      asset_id: `a${String(capacity ?? 0)}${country_iso3}`,
      name: "x",
      country_iso3,
      lon: 0,
      lat: 0,
      capacity,
      capacity_unit: capacity === null ? null : "mtpa",
      operator: null,
      status: null,
      commissioned_year: null,
      source: null,
      kind: "lng_import" as const,
      unit_count: null,
      total_processed_bcm: null,
      un_locode: null,
    });
    const assets = {
      extraction: [],
      refinery: [],
      lngExport: [],
      lngImport: [asset("JPN", 5), asset("JPN", null), asset("KOR", 9)],
      storage: [],
      port: [],
    };
    const p = buildCountryProfile({ ...EMPTY, assets }, "JPN", 2024, "oil");
    expect(p.infrastructure).toHaveLength(1);
    expect(p.infrastructure[0]).toMatchObject({
      kind: "lng_import",
      count: 2,
      withCapacity: 1,
      capacity: 5,
      capacityUnit: "mtpa",
    });
    expect(p.infrastructure[0]?.source).toMatch(/^Source: /);
    expect(buildCountryProfile({ ...EMPTY, assets }, "ZZZ", 2024, "oil").infrastructure).toEqual([]);
  });

  it("carries EU gas storage and the Comtrade window only where they exist", () => {
    const gasStorage = { gasDay: "2026-09-17", values: new Map([["DEU", 93.1]]) };
    const recentImports = {
      commodity: "oil" as const,
      baciYear: 2024,
      max: 100,
      byIso3: new Map([
        ["DEU", { mt: 80, from: "2025-06", through: "2026-05", monthsReported: 12, monthsWithImports: 12, baciMt: 79 }],
      ]),
    };
    const p = buildCountryProfile({ ...EMPTY, gasStorage, recentImports }, "DEU", 2024, "oil");
    expect(p.gasStorage).toMatchObject({ gasDay: "2026-09-17", percentFull: 93.1 });
    expect(p.recentImports).toMatchObject({ mt: 80, through: "2026-05" });
    const jpn = buildCountryProfile({ ...EMPTY, gasStorage, recentImports }, "JPN", 2024, "oil");
    expect(jpn.gasStorage).toBeNull();
    expect(jpn.recentImports).toBeNull();
  });
});
