import { describe, expect, it } from "vitest";
import {
  TWH_PER_MT_LNG,
  buildRecentImportsContextRows,
  buildStorageContextRows,
  isLngStorageScenario,
  mtToTwh,
  showsStorageContext,
} from "@/components/scenarios/context-model";
import type { GasStorageByCountry } from "@/lib/data/gas-storage";
import type { RecentImportsData } from "@/lib/data/recent-imports";
import type { ImporterImpact, ScenarioId } from "@/lib/scenarios/types";

const imp = (iso3: string, totalQty: number, atRiskQty: number): ImporterImpact => ({
  iso3,
  totalQty,
  atRiskQty,
  shareAtRisk: totalQty > 0 ? atRiskQty / totalQty : 0,
});

describe("isLngStorageScenario / showsStorageContext", () => {
  it("accepts the four LNG-axis chokepoints", () => {
    for (const id of ["hormuz", "malacca", "suez", "bab_el_mandeb"] as ScenarioId[]) {
      expect(isLngStorageScenario(id)).toBe(true);
    }
  });

  it("rejects pipeline scenarios (no gas commodity)", () => {
    for (const id of ["druzhba", "btc", "cpc", "keystone"] as ScenarioId[]) {
      expect(isLngStorageScenario(id)).toBe(false);
    }
  });

  it("only shows on the gas axis with an LNG scenario", () => {
    expect(showsStorageContext({ commodity: "gas", scenarioId: "hormuz" })).toBe(true);
    expect(showsStorageContext({ commodity: "oil", scenarioId: "hormuz" })).toBe(false);
    expect(showsStorageContext({ commodity: "gas", scenarioId: "druzhba" })).toBe(false);
  });
});

describe("mtToTwh", () => {
  it("uses the stated 14.447 TWh/Mt factor", () => {
    expect(mtToTwh(1)).toBeCloseTo(TWH_PER_MT_LNG, 6);
    expect(mtToTwh(10)).toBeCloseTo(144.47, 2);
  });
});

describe("buildStorageContextRows", () => {
  const base = { commodity: "gas" as const, scenarioId: "hormuz" as ScenarioId, year: 2024 };

  it("pairs an exposed importer with its storage reading and computes days of cover", () => {
    const result = { ...base, byImporter: [imp("ITA", 10_000_000, 4_752_920)] };
    const storage: GasStorageByCountry = new Map([
      ["ITA", { gasDay: "2026-09-17", twh: 173.14, pctFull: 85.11 }],
    ]);
    const rows = buildStorageContextRows(result, storage);
    expect(rows).toHaveLength(1);
    const [r] = rows;
    expect(r?.iso3).toBe("ITA");
    expect(r?.atRiskMt).toBeCloseTo(4.75292, 4);
    expect(r?.atRiskTwhPerYear).toBeCloseTo(mtToTwh(4.75292), 3);
    expect(r?.storageTwh).toBe(173.14);
    expect(r?.storagePctFull).toBe(85.11);
    expect(r?.gasDay).toBe("2026-09-17");
    expect(r?.baciYear).toBe(2024);
    // days = 173.14 / (mtToTwh(4.75292) / 365)
    expect(r?.daysOfCover).toBeCloseTo(173.14 / (mtToTwh(4.75292) / 365), 3);
    expect(r?.daysOfCover).toBeGreaterThan(0);
  });

  it("skips a country present in the result but absent from GIE coverage", () => {
    const result = { ...base, byImporter: [imp("CHN", 76_000_000, 18_890_000)] };
    const storage: GasStorageByCountry = new Map();
    expect(buildStorageContextRows(result, storage)).toEqual([]);
  });

  it("skips a country GIE covers but with zero at-risk exposure (landlocked-with-storage case)", () => {
    const result = { ...base, byImporter: [imp("AUT", 1000, 0)] };
    const storage: GasStorageByCountry = new Map([
      ["AUT", { gasDay: "2026-09-17", twh: 50, pctFull: 90 }],
    ]);
    expect(buildStorageContextRows(result, storage)).toEqual([]);
  });

  it("does not clamp fullness above 100% (legitimate per CLAUDE.md)", () => {
    const result = { ...base, byImporter: [imp("BEL", 3_000_000, 1_884_080)] };
    const storage: GasStorageByCountry = new Map([
      ["BEL", { gasDay: "2026-09-17", twh: 4.52, pctFull: 103.7 }],
    ]);
    const rows = buildStorageContextRows(result, storage);
    expect(rows[0]?.storagePctFull).toBe(103.7);
  });

  it("is empty on the oil axis even with a formally-LNG scenario id", () => {
    const result = {
      commodity: "oil" as const,
      scenarioId: "hormuz" as ScenarioId,
      year: 2024,
      byImporter: [imp("ITA", 10_000_000, 4_000_000)],
    };
    const storage: GasStorageByCountry = new Map([
      ["ITA", { gasDay: "2026-09-17", twh: 173.14, pctFull: 85.11 }],
    ]);
    expect(buildStorageContextRows(result, storage)).toEqual([]);
  });

  it("sorts by at-risk volume, largest first", () => {
    const result = {
      ...base,
      byImporter: [imp("BEL", 3_000_000, 1_000_000), imp("ITA", 10_000_000, 4_000_000)],
    };
    const storage: GasStorageByCountry = new Map([
      ["BEL", { gasDay: "2026-09-17", twh: 4.5, pctFull: 60 }],
      ["ITA", { gasDay: "2026-09-17", twh: 173.1, pctFull: 85 }],
    ]);
    expect(buildStorageContextRows(result, storage).map((r) => r.iso3)).toEqual(["ITA", "BEL"]);
  });
});

describe("buildRecentImportsContextRows", () => {
  const recentImportsData = (byIso3: RecentImportsData["byIso3"]): RecentImportsData => ({
    commodity: "oil",
    byIso3,
    baciYear: 2024,
    max: 100,
  });

  it("shows both figures for a reporting country, using the scenario's own BACI total", () => {
    const result = {
      commodity: "oil" as const,
      year: 2024,
      byImporter: [imp("JPN", 65_931_670, 3_501_059)],
    };
    const recent = recentImportsData(
      new Map([
        [
          "JPN",
          {
            mt: 40,
            from: "2025-06",
            through: "2026-05",
            monthsReported: 12,
            monthsWithImports: 12,
            baciMt: 65.93167,
          },
        ],
      ]),
    );
    const rows = buildRecentImportsContextRows(result, recent, 6);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      iso3: "JPN",
      baciYear: 2024,
      comtradeMt: 40,
      from: "2025-06",
      through: "2026-05",
      complete: true,
    });
    expect(rows[0]?.baciMt).toBeCloseTo(65.93167, 3);
  });

  it("shows null / 'no monthly reports' for a non-reporter (China, Taiwan)", () => {
    const result = { commodity: "oil" as const, year: 2024, byImporter: [imp("CHN", 76_000_000, 18_890_000)] };
    const recent = recentImportsData(new Map());
    const rows = buildRecentImportsContextRows(result, recent, 6);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.comtradeMt).toBeNull();
    expect(rows[0]?.from).toBeNull();
    expect(rows[0]?.complete).toBe(false);
  });

  it("flags a >2x divergence from BACI", () => {
    const result = { commodity: "oil" as const, year: 2024, byImporter: [imp("THA", 49_000_000, 20_000_000)] };
    const recent = recentImportsData(
      new Map([
        [
          "THA",
          {
            mt: 117,
            from: "2025-06",
            through: "2026-05",
            monthsReported: 12,
            monthsWithImports: 12,
            baciMt: 49,
          },
        ],
      ]),
    );
    const rows = buildRecentImportsContextRows(result, recent, 6);
    expect(rows[0]?.diverges).toBe(true);
  });

  it("caps at topN, ranked by at-risk volume", () => {
    const result = {
      commodity: "oil" as const,
      year: 2024,
      byImporter: [
        imp("A", 100, 10),
        imp("B", 100, 30),
        imp("C", 100, 20),
      ],
    };
    const recent = recentImportsData(new Map());
    const rows = buildRecentImportsContextRows(result, recent, 2);
    expect(rows.map((r) => r.iso3)).toEqual(["B", "C"]);
  });
});
