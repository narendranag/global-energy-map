import { describe, it, expect } from "vitest";
import { normalizeRows, normalizeValue } from "@/lib/duckdb/normalize";

describe("normalizeValue", () => {
  it("turns a BigInt into a plain number", () => {
    const v = normalizeValue(2023n);
    expect(v).toBe(2023);
    expect(typeof v).toBe("number");
  });

  it("passes numbers, strings, booleans and null through untouched", () => {
    expect(normalizeValue(1.5)).toBe(1.5);
    expect(normalizeValue("QAT")).toBe("QAT");
    expect(normalizeValue(true)).toBe(true);
    expect(normalizeValue(null)).toBeNull();
    expect(normalizeValue(undefined)).toBeUndefined();
  });

  it("handles negative and large-but-safe BigInts", () => {
    expect(normalizeValue(-7n)).toBe(-7);
    expect(normalizeValue(BigInt(Number.MAX_SAFE_INTEGER))).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe("normalizeRows", () => {
  it("copies each named field into a plain object with BigInts converted", () => {
    // Arrow StructRow proxies expose fields by name; a plain object stands in.
    const rows = [
      { year: 2020n, importer_iso3: "JPN", qty: 10.5, ignored: "x" },
      { year: 2021n, importer_iso3: "KOR", qty: null, ignored: "y" },
    ];
    const out = normalizeRows(rows, ["year", "importer_iso3", "qty"]);
    expect(out).toEqual([
      { year: 2020, importer_iso3: "JPN", qty: 10.5 },
      { year: 2021, importer_iso3: "KOR", qty: null },
    ]);
    expect(typeof out[0]?.year).toBe("number");
  });

  it("lets downstream arithmetic mix normalised BIGINT columns with numbers", () => {
    // The hazard this module exists for: `0 + 100n` throws
    // "Cannot mix BigInt and other types".
    const out = normalizeRows([{ amount_cbm: 100n }, { amount_cbm: 200n }], ["amount_cbm"]);
    const total = out.reduce((s, r) => s + (r.amount_cbm as number), 0);
    expect(total).toBe(300);
  });

  it("returns an empty array for no rows", () => {
    expect(normalizeRows([], ["a"])).toEqual([]);
  });
});
