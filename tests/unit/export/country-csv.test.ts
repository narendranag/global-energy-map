import { describe, expect, it } from "vitest";
import catalogJson from "../../../public/data/catalog.json";
import type { Catalog } from "@/lib/data-catalog/types";
import {
  countryCsv,
  countryCsvFilename,
  countryCsvPlan,
  countryCsvRows,
  sectionLicence,
} from "@/lib/export/country";
import {
  buildCountryProfile,
  type CountryProfileInputs,
  type CountrySeriesRow,
  type CountryTradeRow,
} from "@/lib/data/country-profile";
import type { ScenarioId, ScenarioResult } from "@/lib/scenarios/types";

const CATALOG = catalogJson as unknown as Catalog;

const series: CountrySeriesRow[] = [
  { iso3: "JPN", year: 2020, metric: "production_crude_kbpd", value: 4 },
  { iso3: "JPN", year: 2020, metric: "proved_reserves_oil_bbn_bbl", value: 0.04 },
];

const trade: CountryTradeRow[] = [
  { year: 2023, hs_code: "2709", importer_iso3: "JPN", exporter_iso3: "ARE", qty: 40 },
  { year: 2024, hs_code: "2709", importer_iso3: "JPN", exporter_iso3: "ARE", qty: 49 },
  { year: 2024, hs_code: "2709", importer_iso3: "JPN", exporter_iso3: "SAU", qty: 46 },
];

const hormuz: ScenarioResult = {
  scenarioId: "hormuz",
  commodity: "oil",
  year: 2024,
  byImporter: [{ iso3: "JPN", totalQty: 95, atRiskQty: 90, shareAtRisk: 90 / 95 }],
  rankedImporters: [],
  byRefinery: [],
  rankedRefineries: [],
  byLngImport: [],
  rankedLngImports: [],
};

const assets = {
  extraction: [],
  refinery: [
    {
      asset_id: "r1",
      kind: "refinery" as const,
      name: "R",
      country_iso3: "JPN",
      lon: 0,
      lat: 0,
      capacity: 100,
      capacity_unit: "kbpd",
      operator: null,
      status: null,
      commissioned_year: null,
      source: null,
    },
  ],
  lngExport: [],
  lngImport: [
    {
      asset_id: "t1",
      kind: "lng_import" as const,
      name: "T",
      country_iso3: "JPN",
      lon: 0,
      lat: 0,
      capacity: 7.5,
      capacity_unit: "mtpa",
      operator: null,
      status: null,
      commissioned_year: null,
      source: null,
      unit_count: null,
      total_processed_bcm: null,
      un_locode: null,
    },
  ],
  storage: [],
  port: [],
};

const inputs: CountryProfileInputs = {
  names: new Map([["JPN", "Japan"], ["ARE", "United Arab Emirates"], ["SAU", "Saudi Arabia"]]),
  series,
  trade,
  exposure: new Map<ScenarioId, ScenarioResult>([["hormuz", hormuz]]),
  gasStorage: { gasDay: "2026-09-17", values: new Map([["JPN", 50]]) },
  recentImports: {
    commodity: "oil",
    baciYear: 2024,
    max: 10,
    byIso3: new Map([
      ["JPN", { mt: 9, from: "2025-06", through: "2026-05", monthsReported: 12, monthsWithImports: 12, baciMt: 9.5 }],
    ]),
  },
  assets,
};

const profile = buildCountryProfile(inputs, "JPN", 2024, "oil");
const ctx = { viewUrl: "https://energymap.marain.space/?focus=JPN", exported: "2026-09-19", catalog: CATALOG };

describe("sectionLicence (the shipped catalog)", () => {
  it("lets through the openly licensed sources", () => {
    for (const s of ["trade", "exposure", "LNG terminals", "extraction sites"]) {
      expect(sectionLicence(s, CATALOG), s).toMatchObject({ included: true, reason: null });
    }
  });

  it("blocks the view-only ones and says which source blocked them", () => {
    expect(sectionLicence("reserves", CATALOG).included).toBe(false);
    expect(sectionLicence("reserves", CATALOG).reason).toMatch(/Energy Institute/);
    expect(sectionLicence("production", CATALOG).reason).toMatch(/Energy Institute/);
    expect(sectionLicence("gas storage", CATALOG).reason).toMatch(/Gas Infrastructure Europe/);
    expect(sectionLicence("recent imports", CATALOG).reason).toMatch(/Comtrade/);
    // Refineries carry 88 ODbL OpenStreetMap rows, so the whole section is view-only.
    expect(sectionLicence("refineries", CATALOG).reason).toMatch(/OpenStreetMap/);
  });

  it("leaves out a section with no catalogued source", () => {
    expect(sectionLicence("made up", CATALOG)).toMatchObject({ included: false });
  });
});

describe("countryCsvPlan", () => {
  it("splits the country's own sections, and never lists one it has no data for", () => {
    const plan = countryCsvPlan(profile, CATALOG);
    expect(plan.included.map((s) => s.section).sort()).toEqual([
      "LNG terminals",
      "exposure",
      "trade",
    ]);
    expect(plan.excluded.map((s) => s.section).sort()).toEqual([
      "gas storage",
      "production",
      "recent imports",
      "refineries",
      "reserves",
    ]);
    // No extraction sites in the fixture, so it is in neither list.
    expect([...plan.included, ...plan.excluded].some((s) => s.section === "extraction sites")).toBe(false);
  });

  it("drops the exposure section when no scenario produced a row", () => {
    const bare = buildCountryProfile({ ...inputs, exposure: null }, "JPN", 2024, "oil");
    const plan = countryCsvPlan(bare, CATALOG);
    expect(plan.included.some((s) => s.section === "exposure")).toBe(false);
  });
});

describe("countryCsvRows", () => {
  const rows = countryCsvRows(profile, CATALOG);

  it("carries the trade series, the partners and the exposure", () => {
    expect(rows.filter((r) => r.metric === "crude_imports").map((r) => [r.year, r.value])).toEqual([
      [2023, 40],
      [2024, 95],
    ]);
    const top = rows.find((r) => r.metric === "top_supplier");
    expect(top).toMatchObject({ partner_iso3: "ARE", partner_name: "United Arab Emirates", value: 49 });
    const exposure = rows.find((r) => r.section === "exposure");
    expect(exposure).toMatchObject({ metric: "hormuz", value: 90 });
    expect(exposure?.share).toBeCloseTo(90 / 95, 5);
  });

  it("carries LNG terminal counts but not refineries or the EI series", () => {
    expect(rows.find((r) => r.metric === "lng_import_count")?.value).toBe(1);
    expect(rows.find((r) => r.metric === "lng_import_capacity")).toMatchObject({ value: 7.5, unit: "mtpa" });
    expect(rows.some((r) => r.section === "refineries")).toBe(false);
    expect(rows.some((r) => r.section === "reserves" || r.section === "production")).toBe(false);
    expect(rows.some((r) => r.section === "gas storage" || r.section === "recent imports")).toBe(false);
  });
});

describe("countryCsv", () => {
  const csv = countryCsv(profile, ctx);

  it("opens with a citation header that names what was left out and why", () => {
    const header = csv.split("\n").filter((l) => l.startsWith("#"));
    expect(header[0]).toContain("country profile: Japan (JPN), 2024, crude oil");
    expect(csv).toContain("DERIVED ANALYSIS");
    expect(csv).toContain("Left out — shown in the app but not redistributable");
    expect(csv).toMatch(/#\s+reserves: Energy Institute/);
    expect(csv).toMatch(/#\s+refineries: .*OpenStreetMap/);
    // …and cites what it does ship.
    expect(csv).toContain("Sources in this file:");
    expect(csv).toMatch(/CEPII/);
    expect(csv).toContain("Cite this site:");
    expect(csv).toContain(ctx.viewUrl);
  });

  it("puts the column header after the comments and before the rows", () => {
    const lines = csv.split("\n");
    const head = lines.findIndex((l) => !l.startsWith("#"));
    expect(lines[head]).toBe("section,metric,year,partner_iso3,partner_name,value,unit,share,note");
    expect(lines[head + 1]).toMatch(/^trade,crude_imports,2023,/);
  });

  it("names the file after the country, commodity and year", () => {
    expect(countryCsvFilename(profile)).toBe("global-energy-map_country-JPN_oil_2024.csv");
  });
});
