import { describe, it, expect } from "vitest";
import {
  capacityAtRisk,
  coverageLabel,
  formatVolume,
  hasRange,
  pctRange,
  routeRowsForDisplay,
  sharePct,
  sortImporters,
  tonnesToKbd,
  volumeRange,
} from "@/components/scenarios/panel-model";
import { UNSOURCED_TITLE } from "@/lib/data/scenario-inputs";
import type { ImporterImpact } from "@/lib/scenarios/types";

const imp = (iso3: string, totalQty: number, shareAtRisk: number): ImporterImpact => ({
  iso3,
  totalQty,
  atRiskQty: totalQty * shareAtRisk,
  shareAtRisk,
});

describe("sortImporters", () => {
  const rows = [imp("CHN", 5000, 0.4), imp("JPN", 1000, 0.7), imp("IND", 3000, 0.5)];

  it("share: by displayed %", () => {
    expect(sortImporters(rows, "share").map((r) => r.iso3)).toEqual(["JPN", "IND", "CHN"]);
  });

  it("volume: by volume at risk", () => {
    expect(sortImporters(rows, "volume").map((r) => r.iso3)).toEqual(["CHN", "IND", "JPN"]);
  });

  it("does not mutate its input", () => {
    sortImporters(rows, "volume");
    expect(rows.map((r) => r.iso3)).toEqual(["CHN", "JPN", "IND"]);
  });
});

describe("volumes", () => {
  it("converts crude tonnes/yr to kb/d at 7.33 bbl/t", () => {
    // 1 Mt/yr ≈ 20.08 kb/d
    expect(tonnesToKbd(1e6)).toBeCloseTo(20.08, 2);
    expect(formatVolume(1e6, "oil")).toBe("20 kb/d");
    expect(formatVolume(1e5, "oil")).toBe("2.0 kb/d");
    expect(formatVolume(5e7, "oil")).toBe("1,004 kb/d");
  });

  it("shows LNG in Mt", () => {
    expect(formatVolume(12_345_678, "gas")).toBe("12.3 Mt");
    expect(formatVolume(250_000, "gas")).toBe("0.25 Mt");
  });
});

describe("sharePct / capacityAtRisk / coverageLabel", () => {
  it("formats hand-set shares without spurious decimals", () => {
    expect(sharePct(0.88)).toBe("88%");
    expect(sharePct(1)).toBe("100%");
    expect(sharePct(0.035)).toBe("3.5%");
  });

  it("capacity at risk = share × capacity, unknown capacity → 0", () => {
    expect(capacityAtRisk({ shareAtRisk: 0.5, capacity: 400 })).toBe(200);
    expect(capacityAtRisk({ shareAtRisk: 0.5, capacity: null })).toBe(0);
  });

  it("labels every LNG coverage kind", () => {
    expect(coverageLabel("measured").text).toBe("measured");
    expect(coverageLabel("capacity-proxy").text).toBe("capacity proxy");
    expect(coverageLabel("none").text).toBe("no voyages");
  });
});

describe("routeRowsForDisplay", () => {
  const routes = [
    {
      disruption_id: "cpc" as const,
      kind: "pipeline" as const,
      exporter_iso3: "RUS",
      importer_iso3: null,
      share: 0.035,
      source_title: UNSOURCED_TITLE,
      source_url: "",
      source_year: 2026,
      source_note: "Derived, no single document",
    },
    {
      disruption_id: "cpc" as const,
      kind: "pipeline" as const,
      exporter_iso3: "KAZ",
      importer_iso3: null,
      share: 0.8,
      source_title: "EIA, Regional Analysis Brief: Caspian Sea",
      source_url: "https://www.eia.gov/",
      source_year: 2025,
      source_note: "EIA: about 80%",
    },
    {
      disruption_id: "btc" as const,
      kind: "pipeline" as const,
      exporter_iso3: "AZE",
      importer_iso3: null,
      share: 0.83,
    },
  ];

  it("keeps only the active scenario, highest share first, with citations", () => {
    const rows = routeRowsForDisplay(routes, "cpc");
    expect(rows.map((r) => r.exporter)).toEqual(["KAZ", "RUS"]);
    expect(rows[0]).toMatchObject({
      title: "EIA, Regional Analysis Brief: Caspian Sea",
      url: "https://www.eia.gov/",
      year: 2025,
      unsourced: false,
    });
  });

  it("flags the UNSOURCED marker and rows with no citation at all", () => {
    expect(routeRowsForDisplay(routes, "cpc")[1]?.unsourced).toBe(true);
    expect(routeRowsForDisplay(routes, "btc")[0]).toMatchObject({ unsourced: true, url: "", year: null });
  });

  it("lists identical share-0 pair rows (intra-Gulf) as one entry after the real shares", () => {
    const cite = { source_title: "IEA", source_url: "https://iea.org", source_year: 2026, source_note: "inside" };
    const hormuz = [
      { disruption_id: "hormuz" as const, kind: "chokepoint" as const, exporter_iso3: "QAT", importer_iso3: "KWT", share: 0, ...cite },
      { disruption_id: "hormuz" as const, kind: "chokepoint" as const, exporter_iso3: "QAT", importer_iso3: null, share: 1, ...cite },
      { disruption_id: "hormuz" as const, kind: "chokepoint" as const, exporter_iso3: "QAT", importer_iso3: "BHR", share: 0, ...cite },
    ];
    const rows = routeRowsForDisplay(hormuz, "hormuz");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ exporter: "QAT", importer: null, share: 1, pairs: null });
    expect(rows[1]).toMatchObject({ share: 0, pairs: ["QAT→KWT", "QAT→BHR"], note: "inside" });
  });
});

/**
 * Finding 21: the range note followed the printed *share* only, so a row
 * whose percentages collapsed to one figure while its volumes still spanned
 * a range showed an unexplained dash.
 */
describe("hasRange", () => {
  const row = (
    shareAtRisk: number,
    shareAtRiskUpper: number,
    atRiskQty: number,
    atRiskQtyUpper: number,
  ) => ({ shareAtRisk, shareAtRiskUpper, atRiskQty, atRiskQtyUpper });

  it("is false when a single scenario gives one figure", () => {
    expect(hasRange([{ shareAtRisk: 0.5, atRiskQty: 50 }], "oil")).toBe(false);
  });

  it("is true when the printed share spans a range", () => {
    const r = row(0.2, 0.35, 2e6, 3.5e6);
    expect(pctRange(r)).toContain("–");
    expect(hasRange([r], "gas")).toBe(true);
  });

  it("is true when only the printed VOLUME spans a range", () => {
    // 22.04 % and 22.02 % both print as "22.0%", while 1.24 Mt and 1.91 Mt do
    // not collapse: the row shows a dash, so the note must appear.
    const r = row(0.2204, 0.2202, 1.24e6, 1.91e6);
    expect(pctRange(r)).not.toContain("–");
    expect(volumeRange(r, "gas")).toContain("–");
    expect(hasRange([r], "gas")).toBe(true);
  });

  it("is false when neither printed figure spans a range", () => {
    // Differences too small to print in either unit.
    const r = row(0.2204, 0.22041, 1.2400e6, 1.2401e6);
    expect(hasRange([r], "gas")).toBe(false);
  });

  it("is true when any row in the list spans one", () => {
    const flat = { shareAtRisk: 0.5, atRiskQty: 50 };
    expect(hasRange([flat, row(0.2, 0.35, 2e6, 3.5e6)], "gas")).toBe(true);
  });
});
