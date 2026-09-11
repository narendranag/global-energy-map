import { describe, it, expect, vi } from "vitest";
import { cachedLoader } from "@/lib/data/cache";
import { groupAssets, type Asset, type LngTerminalAsset } from "@/lib/data/assets";
import { toReservesData } from "@/lib/data/reserves";
import {
  positionVoyages,
  terminalCoordinates,
  voyagesInRange,
  type VoyageRow,
} from "@/lib/data/voyages";

describe("cachedLoader", () => {
  it("shares one in-flight promise per argument list", async () => {
    const load = vi.fn((y: number) => Promise.resolve(y * 2));
    const cached = cachedLoader(load);
    const [a, b] = await Promise.all([cached(2020), cached(2020)]);
    expect(a).toBe(4040);
    expect(b).toBe(4040);
    expect(load).toHaveBeenCalledTimes(1);
    await cached(2021);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("evicts a rejected load so the next call retries", async () => {
    let calls = 0;
    const cached = cachedLoader(() => {
      calls += 1;
      return calls === 1 ? Promise.reject(new Error("boom")) : Promise.resolve("ok");
    });
    await expect(cached()).rejects.toThrow("boom");
    await expect(cached()).resolves.toBe("ok");
    expect(calls).toBe(2);
  });
});

function asset(kind: Asset["kind"], id: string, extra: Partial<Asset> = {}): Asset {
  return {
    asset_id: id,
    kind,
    name: id,
    country_iso3: "USA",
    lon: 0,
    lat: 0,
    capacity: null,
    capacity_unit: null,
    operator: null,
    status: null,
    commissioned_year: null,
    source: null,
    ...(kind === "lng_export" || kind === "lng_import"
      ? { unit_count: null, total_processed_bcm: null, un_locode: null }
      : {}),
    ...extra,
  } as Asset;
}

describe("groupAssets", () => {
  it("splits rows by kind and preserves order", () => {
    const g = groupAssets([
      asset("refinery", "r1"),
      asset("extraction_site", "e1"),
      asset("lng_import", "li1"),
      asset("refinery", "r2"),
      asset("lng_export", "le1"),
      asset("storage", "s1"),
      asset("port", "p1"),
    ]);
    expect(g.refinery.map((r) => r.asset_id)).toEqual(["r1", "r2"]);
    expect(g.extraction).toHaveLength(1);
    expect(g.lngImport.map((r) => r.asset_id)).toEqual(["li1"]);
    expect(g.lngExport.map((r) => r.asset_id)).toEqual(["le1"]);
    expect(g.storage).toHaveLength(1);
    expect(g.port).toHaveLength(1);
  });

  it("drops unknown kinds", () => {
    const g = groupAssets([asset("mine" as Asset["kind"], "x")]);
    expect(Object.values(g).every((rows: readonly unknown[]) => rows.length === 0)).toBe(true);
  });
});

describe("toReservesData", () => {
  it("indexes values by iso3, tracks the max and skips nulls", () => {
    const d = toReservesData("oil", 2020, [
      { iso3: "SAU", value: 297.5 },
      { iso3: "VEN", value: 303.8 },
      { iso3: "XXX", value: null },
    ]);
    expect(d.values.get("SAU")).toBe(297.5);
    expect(d.values.has("XXX")).toBe(false);
    expect(d.max).toBe(303.8);
    expect(d.commodity).toBe("oil");
    expect(d.dataYear).toBe(2020);
  });

  it("has max 0 with no rows", () => {
    expect(toReservesData("gas", 2020, []).max).toBe(0);
  });
});

describe("voyages", () => {
  const term = (name: string, lon: number, source: string | null): LngTerminalAsset =>
    ({ ...asset("lng_import", name), name, lon, lat: lon, source }) as LngTerminalAsset;

  it("voyagesInRange covers LNG-T3's 2020–2024", () => {
    expect(voyagesInRange(2019)).toBe(false);
    expect(voyagesInRange(2020)).toBe(true);
    expect(voyagesInRange(2024)).toBe(true);
    expect(voyagesInRange(2025)).toBe(false);
  });

  it("terminalCoordinates prefers LNG-T3 coordinates for a duplicated name", () => {
    const coords = terminalCoordinates([
      term("Gate", 1, "Global Energy Monitor — GGIT"),
      term("Gate", 2, "Zhou, C. 2026, LNG-T3 (Zenodo)"),
      term("Gate", 3, "Zhou, C. 2026, LNG-T3 (Zenodo)"),
      term("Other", 9, null),
    ]);
    expect(coords.get("Gate")).toEqual([2, 2]);
    expect(coords.get("Other")).toEqual([9, 9]);
  });

  it("positionVoyages attaches both ends and drops unresolved voyages", () => {
    const v = (from: string, to: string): VoyageRow => ({
      voyage_id: `${from}-${to}`,
      start_date: "2023-01-01",
      end_date: "2023-01-10",
      imo: 1,
      voyage_type: "export",
      from_terminal: from,
      to_terminal: to,
      from_country: "Qatar",
      to_country: "Japan",
      from_country_iso3: "QAT",
      to_country_iso3: "JPN",
      amount_cbm: 150_000,
      confidence_score: 4,
    });
    const coords = new Map<string, readonly [number, number]>([
      ["A", [51, 25]],
      ["B", [140, 35]],
    ]);
    const out = positionVoyages([v("A", "B"), v("A", "Missing")], coords);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ from_lon: 51, from_lat: 25, to_lon: 140, to_lat: 35 });
  });
});
