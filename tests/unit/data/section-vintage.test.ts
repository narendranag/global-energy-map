import { describe, it, expect } from "vitest";
import {
  formatYearSpan,
  routeSourceYearSpan,
  sectionVintage,
  shortSource,
  sourceVintageLine,
} from "@/lib/data/section-vintage";
import type { Catalog, CatalogEntry, CoverageSpan } from "@/lib/data-catalog/types";

function entry(
  id: string,
  source_name: string,
  layers: string[],
  as_of: string,
  coverage?: CoverageSpan[],
): CatalogEntry {
  return {
    id,
    label: id,
    path: "/data/x.parquet",
    format: "parquet",
    source_name,
    source_url: "https://example.org",
    license: "CC BY 4.0",
    as_of,
    layers,
    ...(coverage ? { coverage } : {}),
  };
}

const FIXTURE: Catalog = {
  version: 7,
  generated_at: "2026-09-17",
  entries: [
    entry("ei", "Energy Institute Statistical Review", ["reserves", "production"], "2026-07-01", [
      { from: "1990", through: "2020", grain: "year", layers: ["reserves"] },
      { from: "1990", through: "2025", grain: "year", layers: ["production"] },
    ]),
    entry("baci", "BACI (CEPII)", ["trade"], "2026-01-01", [
      { from: "1995", through: "2024", grain: "year" },
    ]),
    entry("gie", "Gas Infrastructure Europe — AGSI + ALSI", ["gas_storage"], "2026-09-17", [
      { from: "2020-01-01", through: "2026-09-17", grain: "day" },
    ]),
    entry("comtrade", "UN Comtrade", ["trade_monthly"], "2026-09-17", [
      { from: "2025-01", through: "2026-05", grain: "month" },
    ]),
    entry("netl", "National Energy Technology Laboratory (US DOE)", ["refineries"], "2026-05-17"),
    entry("osm", "OpenStreetMap", ["refineries"], "2026-09-17"),
  ],
};

const OPTS = { catalog: FIXTURE, today: "2026-09-21" } as const;

describe("shortSource", () => {
  it("drops only a trailing sub-product qualifier", () => {
    expect(shortSource("Gas Infrastructure Europe — AGSI + ALSI")).toBe("Gas Infrastructure Europe");
    expect(shortSource("BACI (CEPII)")).toBe("BACI (CEPII)");
  });
});

describe("sectionVintage", () => {
  it("dates a single-source section by its coverage, not its release date", () => {
    // Released 2026-01-01, but the rows stop at 2024 — and 2024 is already
    // past the 18-month mark on this `today`, so the line says so too.
    const v = sectionVintage("trade", { ...OPTS, year: 2024 });
    expect(v?.text).toBe("BACI (CEPII) · data to 2024 (old)");
    expect(v?.shownFor).toBeNull();
    expect(sectionVintage("trade", { catalog: FIXTURE, today: "2025-06-01" })?.stale).toBe(false);
  });

  it("states the shown year and the data's own end when they differ", () => {
    const v = sectionVintage("trade", { ...OPTS, year: 2020 });
    expect(v?.text).toBe("BACI (CEPII) · shown for 2020; data to 2024 (old)");
    expect(v?.shownFor).toBe(2020);
  });

  it("labels each series of a section that shows more than one", () => {
    const v = sectionVintage(
      [
        { label: "reserves", tag: "reserves" },
        { label: "production", tag: "production" },
      ],
      { ...OPTS, year: 2024 },
    );
    expect(v?.text).toBe(
      "Energy Institute Statistical Review · shown for 2024; reserves to 2020 (old), production to 2025",
    );
    expect(v?.stale).toBe(true);
    expect(v?.title).toMatch(/^Data ends 2020, \d+ months ago/);
  });

  it("gives each part its own source when a section mixes publishers", () => {
    const v = sectionVintage(
      [
        { label: "at-risk volume", tag: "trade" },
        { label: "gas in storage", tag: "gas_storage" },
      ],
      { ...OPTS, year: 2024 },
    );
    expect(v?.text).toBe(
      "at-risk volume: BACI (CEPII) to 2024 (old) · gas in storage: Gas Infrastructure Europe to 17 Sept 2026",
    );
  });

  it("dates an undated snapshot section by its as_of, and names every source", () => {
    const v = sectionVintage("refineries", OPTS);
    expect(v?.text).toBe(
      "National Energy Technology Laboratory (US DOE), OpenStreetMap · as of 17 Sept 2026",
    );
  });

  it("never states a shown year for a daily or monthly series", () => {
    expect(sectionVintage("gas_storage", { ...OPTS, year: 2024 })?.shownFor).toBeNull();
    expect(sectionVintage("trade_monthly", { ...OPTS, year: 2024 })?.shownFor).toBeNull();
    expect(sectionVintage("trade_monthly", { ...OPTS, year: 2024 })?.text).toBe(
      "UN Comtrade · data to May 2026",
    );
  });

  it("marks nothing old without a today, so a prerender and its hydrate agree", () => {
    const v = sectionVintage("reserves", { catalog: FIXTURE, year: 2024 });
    expect(v?.stale).toBe(false);
    expect(v?.text).toBe("Energy Institute Statistical Review · shown for 2024; data to 2020");
  });

  it("returns null when nothing in the catalog carries the tag", () => {
    expect(sectionVintage("no_such_layer", OPTS)).toBeNull();
  });
});

describe("sourceVintageLine", () => {
  it("ends a tooltip with the row's own source and data vintage", () => {
    expect(sourceVintageLine("trade", null, FIXTURE)).toBe(
      "Source: BACI (CEPII) · data to 2024 (released 2026-01-01)",
    );
  });

  it("dates a multi-source layer's row by that row's source", () => {
    expect(sourceVintageLine("refineries", "OpenStreetMap (Overpass)", FIXTURE)).toBe(
      "Source: OpenStreetMap · snapshot as of 17 Sept 2026",
    );
    expect(
      sourceVintageLine("refineries", "National Energy Technology Laboratory (US DOE)", FIXTURE),
    ).toBe("Source: National Energy Technology Laboratory (US DOE) · snapshot as of 17 May 2026");
  });

  it("is null for an uncatalogued layer", () => {
    expect(sourceVintageLine("no_such_layer", null, FIXTURE)).toBeNull();
  });
});

describe("routeSourceYearSpan", () => {
  it("spans the publication years of the cited rows, ignoring undated ones", () => {
    expect(
      routeSourceYearSpan([{ source_year: 2023 }, { source_year: null }, { source_year: 2019 }]),
    ).toEqual({ from: 2019, through: 2023 });
    expect(routeSourceYearSpan([{ source_year: null }])).toBeNull();
    expect(routeSourceYearSpan([])).toBeNull();
    expect(formatYearSpan({ from: 2019, through: 2019 })).toBe("2019");
    expect(formatYearSpan({ from: 2019, through: 2023 })).toBe("2019–2023");
  });
});

/**
 * Against the real bundled catalog: structure only, never a date — a refresh
 * must move these lines without touching this file.
 */
describe("the shipped catalog", () => {
  const SECTION_TAGS = [
    "reserves",
    "reserves:gas",
    "production",
    "trade",
    "trade_monthly",
    "gas_storage",
    "lng_terminals",
    "refineries",
    "extraction",
  ] as const;

  it("dates every section the country panel can show", () => {
    for (const tag of SECTION_TAGS) {
      const v = sectionVintage(tag, { year: 2024, today: "2026-09-21" });
      expect(v, tag).not.toBeNull();
      expect(v?.text, tag).toMatch(/·/);
      expect(v?.text, tag).toMatch(/(to \d{4}|to \w{3,4} \d{4}|(to|as of) \d{1,2} \w{3,4} \d{4})/);
      expect(v?.sources.length, tag).toBeGreaterThan(0);
    }
  });

  it("ends every layer tooltip with a source and a vintage", () => {
    for (const tag of [
      "reserves",
      "basins",
      "extraction",
      "pipelines",
      "refineries",
      "storage",
      "ports",
      "gas_pipelines",
      "lng_terminals",
      "lng_voyages",
      "gas_storage",
      "shale_regions",
      "trade_monthly",
      "trade",
    ]) {
      const line = sourceVintageLine(tag);
      expect(line, tag).not.toBeNull();
      expect(line, tag).toMatch(/^Source: .+ · (data to .+ \(released \d{4}-\d{2}-\d{2}\)|snapshot as of .+)$/);
    }
  });

  it("marks the frozen reserves series old and current trade not", () => {
    const today = "2030-01-01";
    expect(sectionVintage("reserves", { today })?.stale).toBe(true);
    expect(sectionVintage("gas_storage", { today: "2026-09-21" })?.stale).toBe(false);
  });
});
