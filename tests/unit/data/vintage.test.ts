import { describe, it, expect } from "vitest";
import {
  formatVintage,
  isStale,
  layerVintage,
  layerVintages,
  monthsOld,
  periodEnd,
  staleNote,
} from "@/lib/data/vintage";
import { LAYER_LABELS } from "@/lib/export/layers";
import type { Catalog, CatalogEntry, CoverageSpan } from "@/lib/data-catalog/types";

function entry(id: string, layers: string[], as_of: string, coverage?: CoverageSpan[]): CatalogEntry {
  return {
    id,
    label: id,
    path: "/data/x.parquet",
    format: "parquet",
    source_name: id,
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
    entry("ei", ["reserves", "production"], "2026-07-01", [
      { from: "1990", through: "2020", grain: "year", layers: ["reserves"] },
      { from: "1990", through: "2025", grain: "year", layers: ["production"] },
    ]),
    // Tagged "reserves" too, but a boundary snapshot must not date the layer.
    entry("countries", ["reserves"], "2024-10-01"),
    entry("netl", ["refineries"], "2026-05-17"),
    entry("osm", ["refineries"], "2026-09-17"),
    entry("gie", ["gas_storage"], "2026-09-17", [{ from: "2020-01-01", through: "2026-09-18", grain: "day" }]),
  ],
};

describe("periodEnd", () => {
  it("closes each grain on its last day", () => {
    expect(periodEnd("2020", "year")).toBe("2020-12-31");
    expect(periodEnd("2024-02", "month")).toBe("2024-02-29");
    expect(periodEnd("2026-05", "month")).toBe("2026-05-31");
    expect(periodEnd("2026-09-17", "day")).toBe("2026-09-17");
  });
});

describe("layerVintage", () => {
  it("dates a series by the span for its own layer, not the release date", () => {
    const v = layerVintage("reserves", "Reserves", FIXTURE);
    expect(v).toMatchObject({ kind: "series", through: "2020", dataEnd: "2020-12-31" });
    expect(v && formatVintage(v)).toBe("to 2020");
  });

  it("dates a multi-source snapshot layer by its newest source", () => {
    const v = layerVintage("refineries", "Refineries", FIXTURE);
    expect(v).toMatchObject({ kind: "snapshot", dataEnd: "2026-09-17" });
    // ICU spells September "Sep" or "Sept" depending on version.
    expect(v && formatVintage(v)).toMatch(/^as of 17 Sept? 2026$/);
  });

  it("returns null for an uncatalogued layer", () => {
    expect(layerVintage("ports", "Ports", FIXTURE)).toBeNull();
  });

  it("orders layers by most recent data", () => {
    const keys = layerVintages(LAYER_LABELS, FIXTURE).map((v) => v.key);
    expect(keys).toEqual(["gas_storage", "refineries", "reserves"]);
  });
});

describe("staleness", () => {
  it("counts whole months", () => {
    expect(monthsOld("2024-12-31", "2026-06-30")).toBe(17);
    expect(monthsOld("2024-12-31", "2026-07-01")).toBe(18);
    expect(monthsOld("2026-09-17", "2026-09-01")).toBe(0);
  });

  it("marks only data past the threshold", () => {
    const reserves = layerVintage("reserves", "Reserves", FIXTURE);
    const gas = layerVintage("gas_storage", "Gas storage", FIXTURE);
    if (!reserves || !gas) throw new Error("fixture");
    expect(isStale(reserves, "2026-09-18")).toBe(true);
    expect(isStale(gas, "2026-09-18")).toBe(false);
    expect(staleNote(reserves, "2026-09-18")).toMatch(/^Data ends 2020, 68 months ago/);
  });

  it("flags the shipped reserves layer and not the live one", () => {
    const shipped = layerVintages(LAYER_LABELS);
    const byKey = new Map(shipped.map((v) => [v.key, v]));
    const reserves = byKey.get("reserves");
    const gas = byKey.get("gas_storage");
    if (!reserves || !gas) throw new Error("missing from catalog");
    expect(reserves.through).toBe("2020");
    expect(isStale(reserves, gas.dataEnd)).toBe(true);
    expect(isStale(gas, gas.dataEnd)).toBe(false);
  });
});
