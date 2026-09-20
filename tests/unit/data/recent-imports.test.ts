import { describe, it, expect } from "vitest";
import { divergesFromBaci, isComplete, toRecentImports } from "@/lib/data/recent-imports";

const ct = (month: string, iso: string, kg: number, hs = "2709") => ({
  month: `${month}-01`,
  importer_iso3: iso,
  hs_code: hs,
  qty: kg,
});

const months = (from: number, to: number, year = 2025) =>
  Array.from({ length: to - from + 1 }, (_, i) => `${year.toString()}-${String(from + i).padStart(2, "0")}`);

describe("toRecentImports", () => {
  it("windows each country on its own latest month, summing every partner", () => {
    const rows = [
      // JPN reports Jun 2025 – May 2026: two partners a month.
      ...[...months(6, 12), ...months(1, 5, 2026)].flatMap((m) => [ct(m, "JPN", 5e9), ct(m, "JPN", 5e9)]),
      // KOR lags: Jan – Dec 2025 only.
      ...months(1, 12).map((m) => ct(m, "KOR", 7e9)),
      // An earlier month outside JPN's window must not count.
      ct("2025-01", "JPN", 999e9),
    ];
    const baci = [
      { year: 2023, importer_iso3: "JPN", hs_code: "2709", qty: 1 },
      { year: 2024, importer_iso3: "JPN", hs_code: "2709", qty: 110e6 },
      { year: 2024, importer_iso3: "KOR", hs_code: "2709", qty: 20e6 },
    ];
    const d = toRecentImports("oil", rows, baci);
    expect(d.baciYear).toBe(2024);
    const jpn = d.byIso3.get("JPN");
    expect(jpn).toMatchObject({ mt: 120, from: "2025-06", through: "2026-05", monthsReported: 12, baciMt: 110 });
    const kor = d.byIso3.get("KOR");
    expect(kor).toMatchObject({ mt: 84, from: "2025-01", through: "2025-12", monthsReported: 12 });
    expect(d.max).toBe(120);
    // KOR is 4.2× its BACI figure: flagged, not hidden.
    expect(kor && divergesFromBaci(kor)).toBe(true);
    expect(jpn && divergesFromBaci(jpn)).toBe(false);
  });

  it("marks gappy reporters incomplete and keeps them out of the ramp anchor", () => {
    const rows = [ct("2025-03", "PAK", 9e12), ct("2025-09", "PAK", 1e9)];
    const d = toRecentImports("oil", rows, []);
    const pak = d.byIso3.get("PAK");
    expect(pak?.monthsReported).toBe(2);
    expect(pak && isComplete(pak)).toBe(false);
    expect(d.max).toBe(0);
  });

  it("reads only the selected commodity", () => {
    const d = toRecentImports("gas", [ct("2025-01", "JPN", 1e9), ct("2025-01", "ESP", 2e9, "271111")], []);
    expect([...d.byIso3.keys()]).toEqual(["ESP"]);
  });

  it("counts a month as reported if the country filed either HS code, not just the selected one", () => {
    // USA: files LNG (271111) 11 of 12 months, but files crude (2709) every
    // month including the one month it took no LNG cargo — proving it
    // reported that month, just with no LNG cargo.
    const lngMonths = [...months(6, 12), ...months(1, 4, 2026)]; // 11 months, skips 2026-05
    const rows = [
      ...lngMonths.map((m) => ct(m, "USA", 3e9, "271111")),
      ...[...months(6, 12), ...months(1, 5, 2026)].map((m) => ct(m, "USA", 8e9, "2709")),
    ];
    const d = toRecentImports("gas", rows, []);
    const usa = d.byIso3.get("USA");
    expect(usa?.monthsReported).toBe(12);
    expect(usa?.monthsWithImports).toBe(11);
    expect(usa && isComplete(usa)).toBe(true);
    // Complete, so it counts toward the ramp's max anchor.
    expect(d.max).toBeGreaterThan(0);
  });

  it("anchors the window on the reporter's last filed month across both codes, not the last cargo month", () => {
    // KAZ took its last LNG cargo in month 11 of the run, but filed crude
    // (proving it was live) through month 12 — the window should still end
    // at month 12, not fall back a month because the LNG side went quiet.
    const rows = [
      ...months(1, 11).map((m) => ct(m, "KAZ", 4e9, "271111")),
      ct("2025-12", "KAZ", 6e9, "2709"),
    ];
    const d = toRecentImports("gas", rows, []);
    const kaz = d.byIso3.get("KAZ");
    expect(kaz?.through).toBe("2025-12");
    expect(kaz?.from).toBe("2025-01");
    expect(kaz?.monthsReported).toBe(12);
    expect(kaz?.monthsWithImports).toBe(11);
  });

  it("leaves single-code filers unchanged: monthsReported equals monthsWithImports", () => {
    const rows = [ct("2025-03", "PAK", 9e12), ct("2025-09", "PAK", 1e9)];
    const d = toRecentImports("oil", rows, []);
    const pak = d.byIso3.get("PAK");
    expect(pak?.monthsReported).toBe(pak?.monthsWithImports);
    expect(pak?.monthsReported).toBe(2);
  });
});
