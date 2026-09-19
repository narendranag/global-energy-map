import { describe, expect, it } from "vitest";
import { normalizeText } from "@/lib/search/normalize";
import { searchItems } from "@/lib/search/match";
import type { SearchItem, SearchKind } from "@/lib/search/types";

let seq = 0;

function fakeItem(
  name: string,
  kind: SearchKind,
  overrides: Partial<SearchItem> = {},
): SearchItem {
  seq += 1;
  const iso3 = overrides.iso3 ?? null;
  return {
    id: overrides.id ?? `item-${seq.toString()}`,
    name,
    kind,
    countryIso3: overrides.countryIso3 ?? null,
    operator: overrides.operator ?? null,
    iso3,
    nameKey: normalizeText(name),
    iso3Key: iso3 === null ? null : iso3.toLowerCase(),
    target: overrides.target ?? { action: "country", iso3: iso3 ?? "ZZZ" },
  };
}

describe("searchItems", () => {
  it("returns nothing for an empty or whitespace query", () => {
    const items = [fakeItem("Japan", "country", { iso3: "JPN" })];
    expect(searchItems(items, "")).toEqual([]);
    expect(searchItems(items, "   ")).toEqual([]);
  });

  it("is case- and diacritic-insensitive", () => {
    const items = [fakeItem("Türkiye", "country", { iso3: "TUR" })];
    expect(searchItems(items, "turkiye")).toHaveLength(1);
    expect(searchItems(items, "TURKIYE")).toHaveLength(1);
    expect(searchItems(items, "türkiye")).toHaveLength(1);
  });

  it("ranks a prefix match above a substring match", () => {
    const items = [
      fakeItem("East Japan Pipeline", "pipeline_oil"),
      fakeItem("Japan Sea Gas Field", "extraction_site"),
    ];
    const [first, second] = searchItems(items, "japan");
    expect(first?.name).toBe("Japan Sea Gas Field");
    expect(second?.name).toBe("East Japan Pipeline");
  });

  it("ranks an exact name match above a prefix match", () => {
    const items = [
      fakeItem("Japan Sea Terminal", "lng_import"),
      fakeItem("Japan", "country", { iso3: "JPN" }),
    ];
    const [first] = searchItems(items, "japan");
    expect(first?.kind).toBe("country");
  });

  it("puts countries first among equal-tier matches", () => {
    const items = [
      fakeItem("Congo Basin", "basin"),
      fakeItem("Congo", "country", { iso3: "COG" }),
    ];
    const [first, second] = searchItems(items, "congo");
    expect(first?.kind).toBe("country");
    expect(second?.kind).toBe("basin");
  });

  it("an exact ISO3 code wins outright, even over an exact name match elsewhere", () => {
    const items = [
      fakeItem("Jpn Pipeline Co", "pipeline_oil"), // would substring-match "jpn"? no — but keep distinct
      fakeItem("Japan", "country", { iso3: "JPN" }),
    ];
    const [first] = searchItems(items, "JPN");
    expect(first?.kind).toBe("country");
    expect(first?.name).toBe("Japan");
  });

  it("does not let a non-country item's iso3-shaped name jump the tier without a real iso3", () => {
    const items = [
      fakeItem("Jpn Gas Field", "extraction_site"), // nameKey starts with "jpn" (prefix), tier 2
      fakeItem("Japan", "country", { iso3: "JPN" }), // iso3 exact, tier 0
    ];
    const [first] = searchItems(items, "jpn");
    expect(first?.name).toBe("Japan");
  });

  it("orders ties stably by name then id", () => {
    const items = [
      fakeItem("Zeta Refinery", "refinery", { id: "b" }),
      fakeItem("Alpha Refinery", "refinery", { id: "a" }),
    ];
    const names = searchItems(items, "refinery").map((i) => i.name);
    expect(names).toEqual(["Alpha Refinery", "Zeta Refinery"]);
  });

  it("handles duplicate names by keeping both — disambiguation is a display concern", () => {
    const items = [
      fakeItem("Refinery", "refinery", { id: "r1", countryIso3: "SAU", operator: "Saudi Aramco" }),
      fakeItem("Refinery", "refinery", { id: "r2", countryIso3: "USA", operator: "ExxonMobil" }),
    ];
    expect(searchItems(items, "refinery")).toHaveLength(2);
  });

  it("caps results at the given limit", () => {
    const items = Array.from({ length: 20 }, (_, i) => fakeItem(`Refinery ${i.toString()}`, "refinery"));
    expect(searchItems(items, "refinery", 8)).toHaveLength(8);
  });

  it("matches nothing when the query appears nowhere", () => {
    const items = [fakeItem("Japan", "country", { iso3: "JPN" })];
    expect(searchItems(items, "xyzxyz")).toEqual([]);
  });
});

describe("searchItems performance", () => {
  it("stays comfortably under budget on a synthetic 30k index", () => {
    const items: SearchItem[] = [];
    const kinds: SearchKind[] = [
      "country",
      "pipeline_oil",
      "pipeline_gas",
      "refinery",
      "extraction_site",
      "lng_export",
      "lng_import",
      "basin",
      "shale_region",
    ];
    for (let i = 0; i < 30_000; i++) {
      const kind = kinds[i % kinds.length] ?? "refinery";
      items.push(fakeItem(`Facility Number ${i.toString()} Alpha`, kind));
    }
    // A handful of keystrokes of a realistic query, timed together.
    const keystrokes = ["f", "fa", "fac", "faci", "facility number 1"];
    // Best of five: a wall-clock bound on one run fails whenever the machine
    // is busy (it did, under a parallel e2e run); the fastest run measures the
    // code rather than the scheduler.
    let elapsed = Infinity;
    for (let run = 0; run < 5; run++) {
      const start = performance.now();
      for (const q of keystrokes) searchItems(items, q);
      elapsed = Math.min(elapsed, performance.now() - start);
    }
    // Generous: real hardware should be well under 10 ms per keystroke: this
    // budgets 5x that across all keystrokes combined to absorb CI jitter.
    expect(elapsed).toBeLessThan(250);
  });
});
