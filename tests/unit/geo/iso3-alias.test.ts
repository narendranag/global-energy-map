import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it, expect } from "vitest";
import {
  KNOWN_ABSENT_FROM_TRADE,
  NATURAL_EARTH_ISO3,
  dataIso3,
  parseIso3,
  polygonIso3,
} from "@/lib/geo/iso3";
import { decodeParquet } from "@/lib/data/parquet";
import { aggregateTradeFlows, focusPairs } from "@/lib/data/trade-flows";

/**
 * A2. Natural Earth admin-0 names South Sudan **SDS** and Palestine **PSX**;
 * every data file in `public/data` (BACI, Comtrade, EI, the asset table) uses
 * the ISO 3166-1 codes **SSD** and **PSE**. `?focus=SDS` therefore reported
 * zero trade for a country that exported 620 kt of crude in 2024.
 *
 * The check below is over the shipped parquet, not a hand-written list: every
 * focusable code must have BACI rows under its alias, or be one of the six
 * that genuinely have none.
 */

interface RawRow {
  readonly year: number;
  readonly hs_code: string;
  readonly exporter_iso3: string;
  readonly importer_iso3: string;
  readonly qty: number | null;
}

/** Every exporter/importer code in the shipped BACI file — read, not listed. */
async function tradeCodes(): Promise<Set<string>> {
  const bytes = await readFile(path.join(process.cwd(), "public/data/trade_flow.parquet"));
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const rows = await decodeParquet(buffer, ["exporter_iso3", "importer_iso3"]);
  const codes = new Set<string>();
  for (const r of rows) {
    codes.add(r.exporter_iso3 as string);
    codes.add(r.importer_iso3 as string);
  }
  return codes;
}

describe("NE ↔ data ISO3 aliases (A2)", () => {
  it("maps Natural Earth's non-standard codes to the codes the data files use", () => {
    expect(dataIso3("SDS")).toBe("SSD");
    expect(dataIso3("PSX")).toBe("PSE");
    expect(dataIso3("JPN")).toBe("JPN");
  });

  it("maps back, so a data row can name the polygon it belongs to", () => {
    expect(polygonIso3("SSD")).toBe("SDS");
    expect(polygonIso3("PSE")).toBe("PSX");
    expect(polygonIso3("JPN")).toBe("JPN");
    // A code with no polygon is returned unchanged — the caller decides.
    expect(polygonIso3("SGP")).toBe("SGP");
  });

  it("canonicalises a hand-typed ISO code to the polygon code", () => {
    expect(parseIso3("SSD")).toBe("SDS");
    expect(parseIso3("pse")).toBe("PSX");
  });

  it("every focusable code has trade rows under its alias, or is knowingly absent", async () => {
    const codes = await tradeCodes();
    const absent = NATURAL_EARTH_ISO3.filter((c) => !codes.has(dataIso3(c)));
    expect([...absent].sort()).toEqual([...KNOWN_ABSENT_FROM_TRADE].sort());
  });
});

describe("focusPairs resolves the alias (A2)", () => {
  const rows: RawRow[] = [
    { year: 2024, hs_code: "2709", exporter_iso3: "SSD", importer_iso3: "CHN", qty: 462716 },
    { year: 2024, hs_code: "2709", exporter_iso3: "SAU", importer_iso3: "CHN", qty: 1_000_000 },
  ];
  const data = aggregateTradeFlows(rows, 2024, "oil");

  it("finds South Sudan's pairs when focused by its Natural Earth code", () => {
    const pairs = focusPairs(data, "SDS");
    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.direction).toBe("export");
    expect(pairs[0]?.partner_iso3).toBe("CHN");
  });

  it("still works when focused by the ISO code", () => {
    expect(focusPairs(data, "SSD")).toHaveLength(1);
  });
});
