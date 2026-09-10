import { describe, it, expect } from "vitest";
import { exposureColor } from "@/lib/symbology";
import {
  importerOverlay,
  lngVoyageImpactByTerminalName,
  rankAssetsByCapacityAtRisk,
  rankImportersByShare,
} from "@/components/scenarios/overlay";
import type { ImporterImpact, LngImportImpact, ScenarioResult } from "@/lib/scenarios/types";

function makeImpact(overrides: Partial<LngImportImpact> = {}): LngImportImpact {
  return {
    asset_id: "asset-1",
    iso3: "JPN",
    capacity: 10,
    name: "Sodegaura LNG Terminal",
    atRiskQty: 5,
    shareAtRisk: 0.5,
    topSources: [],
    dataSource: "lng-t3",
    coverage: "measured",
    ...overrides,
  };
}

function makeResult(byLngImport: readonly LngImportImpact[]): ScenarioResult {
  return {
    scenarioId: "hormuz",
    commodity: "gas",
    year: 2023,
    byImporter: [],
    rankedImporters: [],
    byRefinery: [],
    rankedRefineries: [],
    byLngImport,
    rankedLngImports: [...byLngImport],
  };
}

describe("lngVoyageImpactByTerminalName", () => {
  it("keys the map by terminal name (matching LngVoyageRow.to_terminal), not asset_id", () => {
    const impact = makeImpact();
    const map = lngVoyageImpactByTerminalName(makeResult([impact]));
    expect(map).toBeDefined();
    expect(map?.get(impact.name)).toBe(impact);
    expect(map?.get(impact.asset_id)).toBeUndefined();
  });

  it("returns undefined for a null scenario", () => {
    expect(lngVoyageImpactByTerminalName(null)).toBeUndefined();
  });

  it("returns undefined for a scenario with an empty byLngImport", () => {
    expect(lngVoyageImpactByTerminalName(makeResult([]))).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Phase 7 (C3): honest scenario overlay
// ---------------------------------------------------------------------------

function makeImporter(iso3: string, totalQty: number, shareAtRisk: number): ImporterImpact {
  return { iso3, totalQty, atRiskQty: totalQty * shareAtRisk, shareAtRisk };
}

function makeOilResult(byImporter: readonly ImporterImpact[]): ScenarioResult {
  return {
    ...makeResult([]),
    commodity: "oil",
    year: 2020,
    byImporter,
    rankedImporters: [...byImporter],
  };
}

describe("exposureColor", () => {
  it("returns undefined (no override) at t = 0", () => {
    expect(exposureColor(0)).toBeUndefined();
  });

  it("returns undefined for negative or non-finite t", () => {
    expect(exposureColor(-0.2)).toBeUndefined();
    expect(exposureColor(Number.NaN)).toBeUndefined();
  });

  it("returns an RGBA colour for any t > 0", () => {
    const c = exposureColor(0.01);
    expect(c).toBeDefined();
    expect(c).toHaveLength(4);
  });

  it("alpha rises monotonically with t", () => {
    const ts = [0.01, 0.05, 0.1, 0.25, 0.5, 0.75, 1];
    const alphas = ts.map((t) => exposureColor(t)?.[3] ?? -1);
    for (let i = 1; i < alphas.length; i++) {
      expect(alphas[i]).toBeGreaterThan(alphas[i - 1] ?? Infinity);
    }
  });

  it("redness (r minus mean of g,b) rises monotonically with t and lightness falls", () => {
    const ts = [0.01, 0.05, 0.1, 0.25, 0.5, 0.75, 1];
    const cs = ts.map((t) => {
      const c = exposureColor(t);
      if (!c) throw new Error("expected a colour");
      return c;
    });
    for (let i = 1; i < cs.length; i++) {
      const [r0, g0, b0] = cs[i - 1] ?? [0, 0, 0];
      const [r1, g1, b1] = cs[i] ?? [0, 0, 0];
      expect(r1 - (g1 + b1) / 2).toBeGreaterThan(r0 - (g0 + b0) / 2);
      expect(r1 + g1 + b1).toBeLessThan(r0 + g0 + b0);
    }
  });

  it("t = 0.05 is visibly distinct from t = 0.6 (alpha gap >= 100)", () => {
    const low = exposureColor(0.05)?.[3] ?? 0;
    const high = exposureColor(0.6)?.[3] ?? 0;
    expect(high - low).toBeGreaterThanOrEqual(100);
  });

  it("clamps t > 1 to the t = 1 colour", () => {
    expect(exposureColor(1.7)).toEqual(exposureColor(1));
  });
});

describe("importerOverlay", () => {
  it("returns undefined without a scenario", () => {
    expect(importerOverlay(null, "oil")).toBeUndefined();
  });

  it("gives zero-exposure importers no colour override but keeps a tooltip", () => {
    const m = importerOverlay(makeOilResult([makeImporter("USA", 100, 0)]), "oil");
    const e = m?.get("USA");
    expect(e).toBeDefined();
    expect(e?.color).toBeUndefined();
    expect(e?.tooltip).toMatch(/0\.0%/);
  });

  it("colours exposed importers with exposureColor(shareAtRisk)", () => {
    const m = importerOverlay(makeOilResult([makeImporter("JPN", 100, 0.4)]), "oil");
    expect(m?.get("JPN")?.color).toEqual(exposureColor(0.4));
  });

  it("says 'crude imports' for oil and 'LNG imports' for gas", () => {
    const r = makeOilResult([makeImporter("JPN", 100, 0.4)]);
    expect(importerOverlay(r, "oil")?.get("JPN")?.tooltip).toMatch(/crude imports/);
    expect(importerOverlay(r, "oil")?.get("JPN")?.tooltip).not.toMatch(/LNG/);
    expect(importerOverlay(r, "gas")?.get("JPN")?.tooltip).toMatch(/LNG imports/);
  });

  it("puts the percentage and year in the tooltip", () => {
    const m = importerOverlay(makeOilResult([makeImporter("JPN", 100, 0.4)]), "oil");
    expect(m?.get("JPN")?.tooltip).toMatch(/40\.0%/);
    expect(m?.get("JPN")?.tooltip).toMatch(/2020/);
  });
});

describe("rankImportersByShare", () => {
  const known = (iso3: string) => iso3 !== "S19" && iso3 !== "ZA1";

  it("drops importers whose ISO3 is not a known country", () => {
    const ranked = rankImportersByShare(
      [makeImporter("S19", 1000, 0.9), makeImporter("JPN", 1000, 0.5)],
      known,
    );
    expect(ranked.map((r) => r.iso3)).toEqual(["JPN"]);
  });

  it("sorts by the displayed shareAtRisk, descending", () => {
    const ranked = rankImportersByShare(
      [
        makeImporter("CHN", 5000, 0.4),
        makeImporter("JPN", 1000, 0.7),
        makeImporter("IND", 3000, 0.5),
      ],
      known,
    );
    expect(ranked.map((r) => r.iso3)).toEqual(["JPN", "IND", "CHN"]);
  });

  it("breaks ties on volume at risk", () => {
    const ranked = rankImportersByShare(
      [makeImporter("AAA", 100, 0.65), makeImporter("BBB", 900, 0.65)],
      () => true,
      0,
    );
    expect(ranked.map((r) => r.iso3)).toEqual(["BBB", "AAA"]);
  });

  it("omits zero-exposure importers", () => {
    const ranked = rankImportersByShare(
      [makeImporter("USA", 5000, 0), makeImporter("JPN", 1000, 0.7)],
      known,
    );
    expect(ranked.map((r) => r.iso3)).toEqual(["JPN"]);
  });

  it("omits importers below the materiality floor (share of world imports)", () => {
    // LBR: 221 of ~10,000 total = 2.2% -> kept at a 1% floor; XXX 5 = 0.05% -> dropped.
    const ranked = rankImportersByShare(
      [
        makeImporter("JPN", 9774, 0.7),
        makeImporter("LBR", 221, 0.71),
        makeImporter("XXX", 5, 1),
      ],
      () => true,
      0.01,
    );
    expect(ranked.map((r) => r.iso3)).toEqual(["LBR", "JPN"]);
  });
});

describe("rankAssetsByCapacityAtRisk", () => {
  it("ranks by share × capacity and omits assets with unknown or zero capacity", () => {
    const assets = [
      { id: "tiny-100pct", shareAtRisk: 1, atRiskQty: 1, capacity: 20 },
      { id: "unknown-cap", shareAtRisk: 1, atRiskQty: 5, capacity: null },
      { id: "zero-cap", shareAtRisk: 1, atRiskQty: 5, capacity: 0 },
      { id: "big-40pct", shareAtRisk: 0.4, atRiskQty: 3, capacity: 500 },
      { id: "unexposed", shareAtRisk: 0, atRiskQty: 0, capacity: 900 },
    ];
    const ranked = rankAssetsByCapacityAtRisk(assets);
    expect(ranked.map((a) => a.id)).toEqual(["big-40pct", "tiny-100pct"]);
  });
});
