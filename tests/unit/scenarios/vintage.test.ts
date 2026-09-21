import { describe, it, expect } from "vitest";
import {
  routeYears,
  routeYearsPhrase,
  scenarioVintage,
  shareGapNote,
  type RouteVintageRow,
  type ScenarioVintageResult,
} from "@/lib/scenarios/vintage";
import type { Catalog, CatalogEntry, CoverageSpan } from "@/lib/data-catalog/types";

/**
 * The fixture catalog is deliberately *not* the bundled one: every assertion
 * about dates is made against dates this file states, so a data refresh can
 * never make these tests lie. One test at the bottom runs against the real
 * catalog and asserts structure only.
 */
function entry(
  id: string,
  source_name: string,
  layers: string[],
  as_of: string,
  extra: { coverage?: CoverageSpan[]; cadence?: string } = {},
): CatalogEntry {
  return {
    id,
    label: id,
    path: `/data/${id}.parquet`,
    format: "parquet",
    source_name,
    source_url: "https://example.org",
    license: "CC BY 4.0",
    as_of,
    layers,
    ...(extra.coverage ? { coverage: extra.coverage } : {}),
    ...(extra.cadence ? { cadence: extra.cadence } : {}),
  };
}

const SCENARIO_TAGS = ["scenario:hormuz", "scenario:hormuz-lng"];

const FIXTURE: Catalog = {
  version: 7,
  generated_at: "2026-09-21",
  entries: [
    entry("trade", "Trade source", ["trade", ...SCENARIO_TAGS], "2026-01-01", {
      coverage: [{ from: "1995", through: "2024", grain: "year" }],
      cadence: "annual, January–February",
    }),
    entry("routes", "Routing source", SCENARIO_TAGS, "2026-09-19"),
    entry("netl", "Refinery source A", ["refineries"], "2026-05-17"),
    entry("osm", "Refinery source B", ["refineries"], "2026-09-17", {
      cadence: "quarterly",
    }),
    entry("t3_terminals", "Terminal source", ["lng_terminals"], "2026-04-01"),
    entry("voyages", "Voyage source", ["lng_voyages", ...SCENARIO_TAGS], "2026-04-01", {
      coverage: [{ from: "2020-01-07", through: "2024-12-31", grain: "day" }],
      cadence: "per Zenodo version",
    }),
  ],
};

const TODAY = "2026-09-21";

function route(
  source_year: number | null,
  source_title = "EIA report",
  data_year: number | null = null,
): RouteVintageRow {
  return { source_title, source_year, data_year };
}

const OIL_ROUTES: RouteVintageRow[] = [route(2023), route(2021), route(2023)];

function oilResult(year = 2024): ScenarioVintageResult {
  return {
    scenarioId: "hormuz",
    commodity: "oil",
    year,
    byRefinery: [{ asset_id: "r1" }],
    byLngImport: [],
  };
}

function gasResult(year = 2024): ScenarioVintageResult {
  return {
    scenarioId: "hormuz",
    commodity: "gas",
    year,
    byRefinery: [],
    byLngImport: [{ coverage: "measured" }],
  };
}

const opts = { catalog: FIXTURE, today: TODAY };

describe("scenarioVintage", () => {
  it("reports the trade year the result was run on", () => {
    const v = scenarioVintage(oilResult(2024), OIL_ROUTES, opts);
    expect(v.tradeYear).toBe(2024);
    const trade = v.rows.find((r) => r.role === "trade");
    expect(trade?.sources).toEqual(["Trade source"]);
    expect(trade?.dataEnd).toBe("2024-12-31");
    expect(trade?.through).toContain("2024");
  });

  it("dates route shares from the rows' own source_year, not the catalog entry", () => {
    const v = scenarioVintage(oilResult(), OIL_ROUTES, opts);
    const shares = v.rows.find((r) => r.role === "route_shares");
    expect(shares?.through).toContain("2021–2023");
    expect(shares?.dataEnd).toBe("2023-12-31");
    // The routing entry's as_of (2026-09-19) must not leak in.
    expect(shares?.dataEnd.startsWith("2026")).toBe(false);
    expect(shares?.sources).toEqual(["Routing source"]);
  });

  it("lists only the routing source behind route shares", () => {
    // The voyage entry is tagged on the scenario too (it feeds attribution),
    // but it is not where a share came from.
    const v = scenarioVintage(gasResult(), OIL_ROUTES, opts);
    expect(v.rows.find((r) => r.role === "route_shares")?.sources).toEqual(["Routing source"]);
  });

  it("collapses a single distinct source year", () => {
    const v = scenarioVintage(oilResult(), [route(2022), route(2022)], opts);
    const shares = v.rows.find((r) => r.role === "route_shares");
    expect(shares?.through).toContain("2022");
    expect(shares?.through).not.toContain("–");
  });

  it("names undated shares instead of inventing a date", () => {
    const v = scenarioVintage(oilResult(), [route(null, "Analyst estimate (unsourced)")], opts);
    const shares = v.rows.find((r) => r.role === "route_shares");
    expect(shares?.dataEnd).toBe("");
    expect(shares?.stale).toBe(false);
    expect(shares?.note).toContain("analyst estimate");
  });

  it("omits the route-share row when no rows are given", () => {
    const v = scenarioVintage(oilResult(), [], opts);
    expect(v.rows.some((r) => r.role === "route_shares")).toBe(false);
  });

  it("uses refineries for oil and LNG terminals for gas", () => {
    const oil = scenarioVintage(oilResult(), OIL_ROUTES, opts);
    const oilAssets = oil.rows.find((r) => r.role === "assets");
    expect(oilAssets?.sources).toEqual(["Refinery source A", "Refinery source B"]);
    expect(oilAssets?.dataEnd).toBe("2026-09-17");

    const gas = scenarioVintage(gasResult(), OIL_ROUTES, opts);
    const gasAssets = gas.rows.find((r) => r.role === "assets");
    expect(gasAssets?.sources).toEqual(["Terminal source"]);
    expect(gasAssets?.dataEnd).toBe("2026-04-01");
  });

  it("omits the asset row when the result attributed no assets", () => {
    const v = scenarioVintage(
      { ...oilResult(), byRefinery: [] },
      OIL_ROUTES,
      opts,
    );
    expect(v.rows.some((r) => r.role === "assets")).toBe(false);
  });

  it("adds a voyage-attribution row for gas only", () => {
    expect(scenarioVintage(oilResult(), OIL_ROUTES, opts).rows.some((r) => r.role === "attribution")).toBe(
      false,
    );
    const gas = scenarioVintage(gasResult(), OIL_ROUTES, opts);
    const att = gas.rows.find((r) => r.role === "attribution");
    expect(att?.sources).toEqual(["Voyage source"]);
    expect(att?.dataEnd).toBe("2024-12-31");
    expect(att?.note).not.toContain("capacity");
    // Voyage coverage ends 2024: old, but on the publisher's own schedule.
    expect(att?.stale).toBe(true);
    expect(att?.note).toContain("per Zenodo version");
  });

  it("notes the capacity-proxy fallback outside voyage coverage", () => {
    const gas = scenarioVintage(gasResult(2015), OIL_ROUTES, opts);
    const att = gas.rows.find((r) => r.role === "attribution");
    expect(att?.note).toContain("capacity");
    expect(att?.note).toContain("2015");
  });

  it("notes the capacity-proxy fallback when the result says some terminals used it", () => {
    const gas = scenarioVintage(
      { ...gasResult(), byLngImport: [{ coverage: "capacity-proxy" }] },
      OIL_ROUTES,
      opts,
    );
    expect(gas.rows.find((r) => r.role === "attribution")?.note).toContain("capacity");
  });

  it("cites the publisher's cadence on a stale row so 'old' does not read as neglect", () => {
    const trade = scenarioVintage(oilResult(), OIL_ROUTES, opts).rows.find((r) => r.role === "trade");
    // 2024-12-31 is more than 18 months before 2026-09-21.
    expect(trade?.stale).toBe(true);
    expect(trade?.note).toContain("annual, January–February");
  });

  it("does not mark a fresh row stale", () => {
    const v = scenarioVintage(oilResult(), OIL_ROUTES, { catalog: FIXTURE, today: "2026-01-15" });
    expect(v.rows.find((r) => r.role === "trade")?.stale).toBe(false);
    expect(v.rows.find((r) => r.role === "trade")?.note).toBeNull();
  });

  it("measures the spread across the dated rows and explains a wide one", () => {
    const v = scenarioVintage(oilResult(), OIL_ROUTES, opts);
    // shares end 2023, trade 2024, refineries 2026 → 3 years.
    expect(v.spreadYears).toBe(3);
    expect(v.mismatchNote).not.toBeNull();
    expect(v.mismatchNote).toContain("2026");
    expect(v.mismatchNote).toContain("2023");
    expect(v.mismatchNote).toContain("2024");
  });

  it("stays quiet when the spread is under three years", () => {
    const v = scenarioVintage(
      { ...oilResult(), byRefinery: [] },
      [route(2024)],
      opts,
    );
    expect(v.spreadYears).toBe(0);
    expect(v.mismatchNote).toBeNull();
  });

  it("summarises in one line", () => {
    expect(scenarioVintage(oilResult(), OIL_ROUTES, opts).summary).toBe(
      "Trade 2024 · shares 2021–23 · refineries 2026",
    );
    expect(scenarioVintage(gasResult(), OIL_ROUTES, opts).summary).toBe(
      "Trade 2024 · shares 2021–23 · LNG terminals 2026 · LNG voyages 2024",
    );
  });

  it("honours a pinned historical year and says newer trade exists", () => {
    const v = scenarioVintage(oilResult(2010), OIL_ROUTES, opts);
    expect(v.tradeYear).toBe(2010);
    const trade = v.rows.find((r) => r.role === "trade");
    expect(trade?.dataEnd).toBe("2010-12-31");
    expect(trade?.note).toContain("2024");
    expect(v.summary).toContain("Trade 2010");
  });

  it("carries no context-layer data (GIE, Comtrade) into the disclosure", () => {
    const v = scenarioVintage(gasResult(), OIL_ROUTES, opts);
    const text = JSON.stringify(v);
    for (const tag of ["gas_storage", "trade_monthly", "Comtrade", "AGSI"]) {
      expect(text).not.toContain(tag);
    }
  });

  it("covers both scenarios of a combined run", () => {
    const v = scenarioVintage(
      { ...oilResult(), scenarioIds: ["hormuz", "malacca"] },
      OIL_ROUTES,
      opts,
    );
    // Same catalog entries behind both, listed once.
    expect(v.rows.find((r) => r.role === "trade")?.sources).toEqual(["Trade source"]);
  });

  describe("against the real bundled catalog", () => {
    it("produces the structural rows for an oil scenario", () => {
      const v = scenarioVintage(oilResult(), OIL_ROUTES, { today: TODAY });
      expect(v.rows.map((r) => r.role)).toEqual(["trade", "route_shares", "assets"]);
      expect(v.tradeYear).toBe(2024);
      for (const r of v.rows) {
        expect(r.sources.length).toBeGreaterThan(0);
        expect(r.label.length).toBeGreaterThan(0);
        expect(r.through.length).toBeGreaterThan(0);
      }
      expect(v.summary.startsWith("Trade 2024")).toBe(true);
    });

    it("produces the structural rows for a gas scenario", () => {
      const v = scenarioVintage(gasResult(), OIL_ROUTES, { today: TODAY });
      expect(v.rows.map((r) => r.role)).toEqual([
        "trade",
        "route_shares",
        "assets",
        "attribution",
      ]);
      expect(v.rows.every((r) => r.dataEnd === "" || /^\d{4}-\d{2}-\d{2}$/.test(r.dataEnd))).toBe(true);
    });
  });
});

/**
 * The caveat that sits *under the headline*, because the headline number is
 * trade x route share: a share documented years away from the trade year
 * makes that number read more current than it is.
 *
 * The years here are the real shapes in `disruption_route.parquet` (Suez is
 * one 2019 document, Hormuz one 2026 document, Malacca a 2017-2026 span) but
 * the test states them itself, so a data refresh cannot make it lie.
 */
describe("shareGapNote", () => {
  const TRADE = 2024;

  it("fires for a Suez-like run, and says the 2019 is a publication year", () => {
    const note = shareGapNote(TRADE, [
      { source_year: 2019, data_year: null },
      { source_year: 2019, data_year: null },
    ]);
    expect(note).toContain("documents published 2019");
    expect(note).toContain("2024");
    expect(note).toContain("Routing that changed in between is not reflected.");
  });

  it("says a dated run describes flows, not documents", () => {
    const note = shareGapNote(TRADE, [
      { source_year: 2022, data_year: 2018 },
      { source_year: 2022, data_year: 2018 },
    ]);
    expect(note).toContain("Route shares describe 2018 flows");
    expect(note).not.toContain("published");
  });

  it("measures the gap on the data year, not on the newer document that states it", () => {
    // Published 2026, describing 2018 flows: dating it 2026 would hide an
    // eight-year gap behind a current-looking publication date.
    expect(shareGapNote(TRADE, [{ source_year: 2026, data_year: 2018 }])).toContain(
      "describe 2018 flows",
    );
    // ...and the other way: a 2019 document describing 2023 flows is close.
    expect(shareGapNote(TRADE, [{ source_year: 2025, data_year: 2023 }])).toBeNull();
  });

  it("says how many shares are dated only by publication, in a mixed run", () => {
    const note = shareGapNote(TRADE, [
      { source_year: 2026, data_year: 2025 },
      { source_year: 2017, data_year: null },
      { source_year: 2017, data_year: null },
    ]);
    expect(note).toContain("describe 2025 flows");
    expect(note).toContain("2 more are dated only by their document's publication year (2017)");
    // Druzhba's real shape is one such row, and "1 more are" is not English.
    expect(
      shareGapNote(TRADE, [
        { source_year: 2022, data_year: 2021 },
        { source_year: 2026, data_year: null },
      ]),
    ).toContain("1 more is dated only by their document's publication year (2026)");
  });

  it("stays quiet for a Hormuz-like run: a 2-year gap is not a mismatch", () => {
    expect(shareGapNote(TRADE, [{ source_year: 2026, data_year: 2025 }])).toBeNull();
    expect(shareGapNote(TRADE, [{ source_year: 2026 }])).toBeNull();
    expect(shareGapNote(TRADE, [{ source_year: 2022 }, { source_year: 2026 }])).toBeNull();
  });

  it("fires on the widest gap in a span, not the newest document in it", () => {
    // Malacca-like: one current document does not excuse a 2017 one that is
    // still setting shares the headline multiplies by.
    const note = shareGapNote(TRADE, [{ source_year: 2017 }, { source_year: 2026 }]);
    expect(note).toContain("documents published 2017\u20132026");
  });

  it("says nothing when nothing is dated, or when there are no rows", () => {
    expect(shareGapNote(TRADE, [{ source_year: null }])).toBeNull();
    expect(shareGapNote(TRADE, [])).toBeNull();
    expect(shareGapNote(TRADE, null)).toBeNull();
  });
});

describe("routeYears", () => {
  it("keeps the two years apart: flows described, and publication of the rest", () => {
    const y = routeYears([
      { source_year: 2026, data_year: 2025 },
      { source_year: 2025, data_year: 2023 },
      { source_year: 2026, data_year: 2025 },
      { source_year: 2017, data_year: null },
      { source_year: null, data_year: null },
    ]);
    expect(y.data).toEqual([2023, 2025]);
    expect(y.published).toEqual([2017]);
    expect(y.datedCount).toBe(3);
    expect(y.publishedOnlyCount).toBe(1);
    // Best available date per row: data year where there is one, else the
    // publication year. It is what a gap is measured on, never displayed.
    expect(y.effective).toEqual([2017, 2023, 2025]);
  });

  it("drops an unsourced estimate entirely: it has no document to date", () => {
    const y = routeYears([
      { source_year: 2026, data_year: null, source_title: "Analyst estimate (unsourced)" },
    ]);
    expect(y).toEqual({
      data: [],
      published: [],
      datedCount: 0,
      publishedOnlyCount: 0,
      effective: [],
    });
  });

  it("is empty for no rows at all", () => {
    expect(routeYears(null).effective).toEqual([]);
    expect(routeYears([]).data).toEqual([]);
  });
});

describe("routeYearsPhrase", () => {
  it("says which of the two years it is showing, or nothing", () => {
    expect(routeYearsPhrase(routeYears([{ source_year: 2026, data_year: 2025 }]))).toBe(
      "dated 2025",
    );
    expect(
      routeYearsPhrase(
        routeYears([
          { source_year: 2026, data_year: 2025 },
          { source_year: 2022, data_year: 2021 },
        ]),
      ),
    ).toBe("dated 2021\u20132025");
    expect(routeYearsPhrase(routeYears([{ source_year: 2019, data_year: null }]))).toBe(
      "published 2019",
    );
    expect(routeYearsPhrase(routeYears([]))).toBeNull();
  });
});
