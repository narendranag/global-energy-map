import { describe, it, expect } from "vitest";
import { catalogEntriesFor, sourceEntry, sourceLine } from "@/lib/data/sources";
import type { Catalog, CatalogEntry } from "@/lib/data-catalog/types";

function entry(id: string, source_name: string, layers: string[], as_of = "2026-01-01"): CatalogEntry {
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
  };
}

const FIXTURE: Catalog = {
  version: 6,
  generated_at: "2026-09-10",
  entries: [
    entry("netl_refineries", "National Energy Technology Laboratory (US DOE)", ["refineries"], "2026-05-17"),
    entry("osm_refineries", "OpenStreetMap", ["refineries"], "2026-05-15"),
    entry("lng_t3", "Zhou, C. 2026, LNG-T3 (Zenodo)", ["lng_terminals"]),
    entry("gem_lng", "Global Energy Monitor", ["lng_terminals"]),
  ],
};

describe("sourceEntry", () => {
  it("matches a row's source column to the right catalog entry", () => {
    expect(sourceEntry("refineries", "OpenStreetMap (Overpass)", FIXTURE)?.id).toBe("osm_refineries");
    expect(
      sourceEntry("refineries", "National Energy Technology Laboratory (US DOE) — GOGI Refineries", FIXTURE)
        ?.id,
    ).toBe("netl_refineries");
    expect(
      sourceEntry("lng_terminals", "Zhou, C. 2026, LNG-T3 (Zenodo 10.5281/zenodo.19571058)", FIXTURE)?.id,
    ).toBe("lng_t3");
    expect(
      sourceEntry("lng_terminals", "Global Energy Monitor — Global Gas Infrastructure Tracker", FIXTURE)?.id,
    ).toBe("gem_lng");
  });

  it("falls back to the layer's first entry, and to undefined for an unknown layer", () => {
    expect(sourceEntry("refineries", null, FIXTURE)?.id).toBe("netl_refineries");
    expect(sourceEntry("refineries", "Unknown source", FIXTURE)?.id).toBe("netl_refineries");
    expect(sourceEntry("nope", null, FIXTURE)).toBeUndefined();
  });
});

describe("sourceLine", () => {
  it("names the source and its as-of date", () => {
    expect(sourceLine("refineries", "OpenStreetMap (Overpass)", FIXTURE)).toBe(
      "Source: OpenStreetMap (as of 2026-05-15)",
    );
    expect(sourceLine("nope", null, FIXTURE)).toBeNull();
  });
});

describe("shipped catalog.json", () => {
  // Every catalog tag a tooltip cites must resolve, or tooltips lose their source line.
  const TAGS = [
    "reserves",
    "basins",
    "extraction",
    "pipelines",
    "gas_pipelines",
    "refineries",
    "storage",
    "ports",
    "lng_terminals",
    "lng_voyages",
    "trade",
  ];
  it.each(TAGS)("has an entry tagged %s", (tag) => {
    expect(catalogEntriesFor(tag).length).toBeGreaterThan(0);
  });
});
