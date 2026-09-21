import { describe, it, expect } from "vitest";
import {
  coverageYears,
  entryYears,
  EI_ENTRY_ID,
  TRADE_ENTRY_ID,
  VOYAGES_ENTRY_ID,
  LNG_T3_FIRST_YEAR,
  LNG_T3_LAST_YEAR,
  RESERVES_LATEST_YEAR,
  TRADE_FIRST_YEAR,
  TRADE_LAST_YEAR,
  YEAR_MAX,
  YEAR_MIN,
} from "@/lib/data-catalog/years";
import { BUNDLED_CATALOG } from "@/lib/data-catalog/bundled";
import type { Catalog, CatalogEntry, CoverageSpan } from "@/lib/data-catalog/types";

function entry(id: string, coverage?: CoverageSpan[]): CatalogEntry {
  return {
    id,
    label: id,
    path: `/data/${id}.parquet`,
    format: "parquet",
    source_name: id,
    source_url: "https://example.org",
    license: "CC BY 4.0",
    as_of: "2026-07-01",
    layers: [],
    ...(coverage ? { coverage } : {}),
  };
}

const FIXTURE: Catalog = {
  version: 7,
  generated_at: "2026-09-17",
  entries: [
    // Per-metric coverage: one entry, two spans that end in different years.
    entry("ei", [
      { from: "1990", through: "2020", grain: "year", layers: ["reserves", "reserves:gas"] },
      { from: "1990", through: "2025", grain: "year", layers: ["production"] },
    ]),
    entry("baci", [{ from: "1995", through: "2024", grain: "year" }]),
    // Day grain: read down to the year.
    entry("voyages", [{ from: "2020-01-07", through: "2024-12-31", grain: "day" }]),
    entry("snapshot"),
  ],
};

describe("coverageYears", () => {
  it("reads a single-span entry", () => {
    expect(coverageYears(FIXTURE, "baci")).toEqual({ from: 1995, through: 2024 });
  });

  it("reads a day- or month-grained span down to whole years", () => {
    expect(coverageYears(FIXTURE, "voyages")).toEqual({ from: 2020, through: 2024 });
  });

  it("picks the span for one metric out of a per-metric entry", () => {
    expect(coverageYears(FIXTURE, "ei", "reserves")).toEqual({ from: 1990, through: 2020 });
    expect(coverageYears(FIXTURE, "ei", "production")).toEqual({ from: 1990, through: 2025 });
  });

  it("refuses a per-metric entry with no metric rather than blending the spans", () => {
    expect(() => coverageYears(FIXTURE, "ei")).toThrow(/per layer/);
  });

  it("throws on a missing entry, a missing span and an unknown metric", () => {
    expect(() => coverageYears(FIXTURE, "nope")).toThrow(/no entry "nope"/);
    expect(() => coverageYears(FIXTURE, "snapshot")).toThrow(/no coverage span/);
    expect(() => coverageYears(FIXTURE, "ei", "imports")).toThrow(/no coverage for layer/);
  });

  it("matches an untagged span for any metric asked of it", () => {
    expect(coverageYears(FIXTURE, "baci", "trade")).toEqual({ from: 1995, through: 2024 });
  });
});

describe("entryYears", () => {
  it("spans every metric of an entry", () => {
    expect(entryYears(FIXTURE, "ei")).toEqual({ from: 1990, through: 2025 });
  });
});

/**
 * The point of the module: no constant may be a literal that outlives the
 * data. Each is compared against the shipped catalog's own coverage, so a
 * refresh that moves the data and not the constant fails here.
 */
describe("the constants follow the bundled catalog", () => {
  it("freezes reserves at the end of EI's reserves coverage", () => {
    expect(RESERVES_LATEST_YEAR).toBe(
      coverageYears(BUNDLED_CATALOG, EI_ENTRY_ID, "reserves").through,
    );
  });

  it("takes the trade span from BACI", () => {
    const baci = coverageYears(BUNDLED_CATALOG, TRADE_ENTRY_ID);
    expect(TRADE_FIRST_YEAR).toBe(baci.from);
    expect(TRADE_LAST_YEAR).toBe(baci.through);
  });

  it("takes the voyage span from LNG-T3", () => {
    const t3 = coverageYears(BUNDLED_CATALOG, VOYAGES_ENTRY_ID);
    expect(LNG_T3_FIRST_YEAR).toBe(t3.from);
    expect(LNG_T3_LAST_YEAR).toBe(t3.through);
  });

  it("bounds the time axis by the EI floor and the latest trade year", () => {
    expect(YEAR_MIN).toBe(entryYears(BUNDLED_CATALOG, EI_ENTRY_ID).from);
    expect(YEAR_MAX).toBe(TRADE_LAST_YEAR);
  });

  it("keeps reserves inside the axis and production beyond the trade year", () => {
    expect(RESERVES_LATEST_YEAR).toBeLessThanOrEqual(YEAR_MAX);
    expect(YEAR_MIN).toBeLessThan(YEAR_MAX);
  });
});

/** The re-export homes hand back the same values, so importers need no edit. */
describe("re-exports", () => {
  it("time/range, modes, trade-flows, voyages and country-profile agree", async () => {
    const range = await import("@/lib/time/range");
    const modes = await import("@/lib/modes");
    const trade = await import("@/lib/data/trade-flows");
    const voyages = await import("@/lib/data/voyages");
    const profile = await import("@/lib/data/country-profile");

    expect(range.YEAR_MIN).toBe(YEAR_MIN);
    expect(range.YEAR_MAX).toBe(YEAR_MAX);
    expect(range.RESERVES_LATEST_YEAR).toBe(RESERVES_LATEST_YEAR);
    expect(modes.TRADE_FIRST_YEAR).toBe(TRADE_FIRST_YEAR);
    expect(modes.TRADE_LAST_YEAR).toBe(TRADE_LAST_YEAR);
    expect(modes.DEFAULT_YEAR).toBe(TRADE_LAST_YEAR);
    expect(modes.FLOWS_FIRST_YEAR).toBe(LNG_T3_FIRST_YEAR);
    expect(modes.FLOWS_LAST_YEAR).toBe(LNG_T3_LAST_YEAR);
    expect(trade.TRADE_FIRST_YEAR).toBe(TRADE_FIRST_YEAR);
    expect(trade.TRADE_LAST_YEAR).toBe(TRADE_LAST_YEAR);
    expect(voyages.LNG_T3_FIRST_YEAR).toBe(LNG_T3_FIRST_YEAR);
    expect(voyages.LNG_T3_LAST_YEAR).toBe(LNG_T3_LAST_YEAR);
    expect(profile.TRADE_FIRST_YEAR).toBe(TRADE_FIRST_YEAR);
  });
});
