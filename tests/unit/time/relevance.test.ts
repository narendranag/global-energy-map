import { describe, expect, it } from "vitest";
import type { LayerState } from "@/components/layers/LayerPanel";
import { yearRelevance } from "@/lib/time/relevance";

const NONE: LayerState = {
  reserves: false,
  basins: false,
  extraction: false,
  pipelines: false,
  refineries: false,
  storage: false,
  ports: false,
  gas_pipelines: false,
  lng_terminals: false,
  lng_voyages: false,
  gas_storage: false,
  shale_regions: false,
  recent_imports: false,
  trade_flows: false,
};

const on = (...keys: readonly (keyof LayerState)[]): LayerState =>
  keys.reduce<LayerState>((s, k) => ({ ...s, [k]: true }), { ...NONE });

describe("yearRelevance", () => {
  it("is idle when nothing is on", () => {
    expect(yearRelevance(NONE, false)).toBe("idle");
  });

  it("is idle when every visible layer is undated", () => {
    expect(yearRelevance(on("refineries", "storage", "ports", "basins"), false)).toBe("idle");
  });

  it("is active for a fully year-keyed layer", () => {
    expect(yearRelevance(on("trade_flows"), false)).toBe("active");
    expect(yearRelevance(on("reserves"), false)).toBe("active");
    expect(yearRelevance(on("shale_regions"), false)).toBe("active");
  });

  it("is active for a partially dated layer", () => {
    expect(yearRelevance(on("pipelines"), false)).toBe("active");
    expect(yearRelevance(on("extraction"), false)).toBe("active");
  });

  // "live" layers are dated but deliberately ignore the slider, which is
  // exactly the case the old "static"/"no" split could not express.
  it("is idle for live layers, which ignore the slider by design", () => {
    expect(yearRelevance(on("gas_storage", "recent_imports"), false)).toBe("idle");
  });

  // The engine is year-parameterised (engine.ts filters trade rows by year),
  // so a running scenario makes the year meaningful whatever the layers say.
  it("is active whenever a scenario is running, even with only static layers", () => {
    expect(yearRelevance(on("refineries", "ports"), true)).toBe("active");
    expect(yearRelevance(NONE, true)).toBe("active");
  });

  it("stays active when one dated layer sits among undated ones", () => {
    expect(yearRelevance(on("refineries", "ports", "lng_voyages"), false)).toBe("active");
  });
});
