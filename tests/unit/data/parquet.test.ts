import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { __resetParquetCacheForTests, normalizeParquetValue, readParquet } from "@/lib/data/parquet";
import { loadAssets } from "@/lib/data/assets";
import { loadReserves } from "@/lib/data/reserves";
import { loadVoyages } from "@/lib/data/voyages";
import { loadRoutes, loadTradeFlows } from "@/lib/data/scenario-inputs";

// The loaders read the real shipped parquet files (served from public/ by a
// fetch stub), so these tests pin that hyparquet decodes exactly what the
// DuckDB SQL they replaced returned. Expected values come from DuckDB
// (Python) over the same files.

const fetched: string[] = [];

beforeAll(() => {
  vi.stubGlobal("fetch", async (url: string) => {
    fetched.push(url);
    const { pathname } = new URL(url, "http://localhost");
    const bytes = await readFile(path.join(process.cwd(), "public", pathname));
    return new Response(bytes);
  });
  __resetParquetCacheForTests();
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("normalizeParquetValue", () => {
  it("turns BIGINT into number, DATE into an ISO date and missing into null", () => {
    expect(normalizeParquetValue(2023n)).toBe(2023);
    expect(normalizeParquetValue(new Date("2020-01-15T00:00:00Z"))).toBe("2020-01-15");
    expect(normalizeParquetValue("x")).toBe("x");
    expect(normalizeParquetValue(null)).toBeNull();
    expect(normalizeParquetValue(undefined)).toBeNull();
    expect(normalizeParquetValue(1.5)).toBe(1.5);
  });
});

describe("parquet loaders (real files)", () => {
  it("voyages: 2023 laden voyages with confidence >= 3, dates as strings, numbers not bigints", async () => {
    const rows = await loadVoyages(2023);
    expect(rows).toHaveLength(2030);
    expect(rows.reduce((s, v) => s + v.amount_cbm, 0)).toBe(333_464_355);
    const first = rows[0];
    expect(typeof first?.start_date).toBe("string");
    expect(first?.start_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(typeof first?.imo).toBe("number");
    expect(typeof first?.amount_cbm).toBe("number");
    expect(await loadVoyages(2019)).toEqual([]);
  });

  it("trade flows: one (year, HS) slice, null qty read as 0", async () => {
    const rows = await loadTradeFlows(2020, "oil");
    expect(rows).toHaveLength(1426);
    expect(Math.round(rows.reduce((s, r) => s + r.qty, 0))).toBe(2_177_212_662);
    expect(rows.every((r) => typeof r.year === "number" && Number.isFinite(r.qty))).toBe(true);
  });

  it("reserves: one (metric, year) lookup", async () => {
    const r = await loadReserves("oil", 2020);
    expect(r.values.size).toBe(49);
    expect(r.max).toBeCloseTo(303.806, 3);
  });

  it("routes: the LNG key on the gas axis, relabelled to the active scenario", async () => {
    const rows = await loadRoutes("hormuz", "gas");
    expect(rows).toHaveLength(14);
    expect(rows.every((r) => r.disruption_id === "hormuz")).toBe(true);
    expect(rows.filter((r) => r.importer_iso3 === null).map((r) => r.exporter_iso3)).toEqual(["QAT", "ARE"]);
    expect(rows.every((r) => typeof r.source_year === "number")).toBe(true);
  });

  it("assets: every kind, positioned, integer columns as numbers", async () => {
    const a = await loadAssets();
    for (const list of [a.extraction, a.refinery, a.lngExport, a.lngImport, a.storage, a.port]) {
      expect(list.length).toBeGreaterThan(0);
    }
    expect(a.lngImport).toHaveLength(239);
    expect(a.refinery).toHaveLength(1163);
    const dated = a.lngImport.find((t) => t.commissioned_year !== null);
    expect(typeof dated?.commissioned_year).toBe("number");
  });

  it("fetches each file once, through its versioned URL", async () => {
    await Promise.all([readParquet("/data/disruption_route.parquet", ["share"]), loadRoutes("cpc", "oil")]);
    const byFile = new Map<string, number>();
    for (const u of fetched) {
      const file = new URL(u, "http://localhost").pathname;
      byFile.set(file, (byFile.get(file) ?? 0) + 1);
      expect(u).toMatch(/\?v=[0-9a-f]{8}$/);
    }
    // Different column sets decode separately but share one download.
    for (const file of ["/data/lng_voyage.parquet", "/data/assets.parquet", "/data/disruption_route.parquet"]) {
      expect(byFile.get(file)).toBe(1);
    }
  });
});
