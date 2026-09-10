import { describe, it, expect } from "vitest";
import { DECK_LAYER_IDS, formatTooltip } from "@/components/layers/tooltips";
import { formatCapacity, joinLines, type TooltipContext } from "@/components/layers/tooltip";
import { formatBasinTooltip } from "@/components/layers/BasinPolygonsLayer";
import { formatExtractionTooltip } from "@/components/layers/ExtractionPoints";
import { formatLngTerminalTooltip } from "@/components/layers/LngTerminalsLayer";
import { formatLngVoyageTooltip } from "@/components/layers/LngVoyagesLayer";
import { formatPipelineTooltip } from "@/components/layers/PipelinesLayer";
import { formatPortTooltip } from "@/components/layers/PortsLayer";
import { formatRefineryTooltip } from "@/components/layers/RefineriesLayer";
import { formatReservesTooltip, reservesFeatures } from "@/components/layers/ReservesChoropleth";
import { formatStorageTooltip } from "@/components/layers/StorageLayer";
import { toReservesData } from "@/lib/data/reserves";
import type { ScenarioResult } from "@/lib/scenarios/types";
import { COUNTRIES, extraction, lngTerminal, pipeline, port, refinery, storage, voyage } from "./fixtures";

const CTX: TooltipContext = { year: 2020, commodity: "oil", scenario: null };

/** Every tooltip names its source and the source's as-of date. */
const SOURCE_LINE = /^Source: .+ \(as of \d{4}-\d{2}-\d{2}\)$/m;

describe("formatCapacity", () => {
  it("formats value + unit and says 'not in source' when missing", () => {
    expect(formatCapacity(450, "kbpd")).toBe("450 kbpd");
    expect(formatCapacity(7.25, "mtpa", 1)).toBe("7.3 mtpa");
    expect(formatCapacity(null, "kbpd")).toBe("not in source");
    expect(formatCapacity(0, "kbpd")).toBe("not in source");
    expect(formatCapacity(Number.NaN, "kbpd")).toBe("not in source");
  });
});

describe("joinLines", () => {
  it("drops null/false parts but keeps empty spacer lines", () => {
    expect(joinLines("a", null, false, "", undefined, "b")).toBe("a\n\nb");
  });
});

describe("layer tooltips", () => {
  it("refinery: capacity not in source, source matched from the row", () => {
    const t = formatRefineryTooltip(refinery("Chauk", { source: "OpenStreetMap (Overpass)" }), CTX) ?? "";
    expect(t).toContain("Refinery: Chauk");
    expect(t).toContain("Capacity: not in source");
    expect(t).toMatch(/^Source: OpenStreetMap \(as of /m);
  });

  it("refinery: capacity with unit", () => {
    const t = formatRefineryTooltip(refinery("Ruwais", { capacity: 837, source: null }), CTX) ?? "";
    expect(t).toContain("Capacity: 837 kbpd");
    expect(t).toMatch(SOURCE_LINE);
  });

  it("refinery: scenario exposure lines", () => {
    const r = refinery("r1");
    const ctx: TooltipContext = {
      ...CTX,
      refineryImpacts: new Map([
        [
          "r1",
          {
            asset_id: "r1",
            iso3: "USA",
            capacity: 0,
            atRiskQty: 2,
            shareAtRisk: 0.25,
            topSources: [{ iso3: "SAU", qty: 8 }],
          },
        ],
      ]),
    };
    const t = formatRefineryTooltip(r, ctx) ?? "";
    expect(t).toContain("SAU: 8.0");
    expect(t).toContain("At-risk under scenario: 25.0%");
  });

  it("extraction: start year when known", () => {
    const t = formatExtractionTooltip(extraction("Ghawar", 1951), CTX) ?? "";
    expect(t).toContain("Extraction site: Ghawar");
    expect(t).toContain("Start year: 1951");
    expect(t).toContain("Capacity: not in source");
    expect(t).toMatch(SOURCE_LINE);
  });

  it("storage and ports", () => {
    expect(formatStorageTooltip(storage("Cushing", { capacity: 1e6, capacity_unit: "bbl" }), CTX)).toContain(
      "Capacity: 1000000 bbl",
    );
    const p = formatPortTooltip(port("Rotterdam"), CTX) ?? "";
    expect(p).toContain("Port: Rotterdam");
    expect(p).not.toContain("Capacity");
    expect(p).toMatch(SOURCE_LINE);
  });

  it("LNG terminal: capacity in mtpa, start year, source", () => {
    const t =
      formatLngTerminalTooltip(
        lngTerminal("Futtsu", "lng_import", {
          capacity: 19.96,
          commissioned_year: 1985,
          source: "Zhou et al. 2026, LNG-T3 (Zenodo 10.5281/zenodo.19571058)",
        }),
        CTX,
      ) ?? "";
    expect(t).toContain("LNG import terminal: Futtsu");
    expect(t).toContain("Capacity: 20.0 mtpa");
    expect(t).toContain("Start year: 1985");
    expect(t).toMatch(/^Source: Zhou et al\. 2026, LNG-T3/m);
  });

  it("LNG voyage: cargo, dates, confidence, source", () => {
    const t = formatLngVoyageTooltip(voyage(), CTX) ?? "";
    expect(t).toContain("Ras Laffan → Futtsu");
    expect(t).toContain("Cargo: 150,000 cbm");
    expect(t).toContain("Confidence: 4/5");
    expect(t).toMatch(SOURCE_LINE);
  });

  it("pipelines: gas capacity in bcm/y, oil in kbpd", () => {
    const gas = formatPipelineTooltip(pipeline("Nord", "gas", 2011, { capacity_kbpd: 55 }), CTX) ?? "";
    expect(gas).toContain("Capacity: 55 bcm/y");
    expect(gas).toContain("Start year: 2011");
    expect(gas).toMatch(SOURCE_LINE);
    const oil = formatPipelineTooltip(pipeline("Druzhba", "crude", null), CTX) ?? "";
    expect(oil).toContain("Capacity: not in source");
  });

  it("basins", () => {
    const t =
      formatBasinTooltip(
        {
          type: "Feature",
          geometry: { type: "Polygon", coordinates: [] },
          properties: { basin_id: "B1", name: "Permian", country_iso3: "USA", area_km2: 250000, region: null },
        },
        CTX,
      ) ?? "";
    expect(t).toContain("Basin: Permian");
    expect(t).toContain("Area: 250000 km²");
    expect(t).toMatch(SOURCE_LINE);
  });

  describe("reserves", () => {
    const fc = reservesFeatures(COUNTRIES, toReservesData("oil", 2020, [{ iso3: "SAU", value: 297.53 }]));
    const [sau, ata] = fc.features;
    if (!sau || !ata) throw new Error("fixture");

    it("value + unit + year + source", () => {
      const t = formatReservesTooltip(sau, CTX) ?? "";
      expect(t).toContain("Saudi Arabia (SAU)");
      expect(t).toContain("Proved oil reserves: 297.5 bn bbl (2020)");
      expect(t).toMatch(/^Source: Energy Institute/m);
    });

    it("no data in source; frozen-year note", () => {
      const t = formatReservesTooltip(ata, { ...CTX, year: 2023 }) ?? "";
      expect(t).toContain("no data in source (2020)");
      expect(t).toContain("year selected: 2023");
    });

    it("scenario line with the BACI source", () => {
      const scenario = { scenarioId: "hormuz", year: 2020 } as ScenarioResult;
      const t =
        formatReservesTooltip(sau, {
          ...CTX,
          scenario,
          overlay: new Map([["SAU", { tooltip: "Scenario: 12.0% of 2020 crude imports" }]]),
        }) ?? "";
      expect(t).toContain("Scenario: 12.0% of 2020 crude imports");
      expect(t).toMatch(/^Source: BACI/m);
      const none = formatReservesTooltip(ata, { ...CTX, scenario }) ?? "";
      expect(none).toContain("no 2020 crude imports recorded in BACI");
    });
  });
});

describe("formatTooltip dispatch", () => {
  it("routes by deck layer id and ignores unknown ids / empty picks", () => {
    expect(formatTooltip("refineries", refinery("X"), CTX)).toContain("Refinery: X");
    expect(formatTooltip("pipelines-gas", pipeline("G", "gas", null), CTX)).toContain("Pipeline: G");
    expect(formatTooltip("mystery", refinery("X"), CTX)).toBeNull();
    expect(formatTooltip("refineries", null, CTX)).toBeNull();
    expect(formatTooltip(undefined, refinery("X"), CTX)).toBeNull();
  });

  it("has a formatter for every deck layer id, and ids are unique", () => {
    const ids = Object.values(DECK_LAYER_IDS);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(
      expect.arrayContaining([
        "reserves",
        "basins",
        "extraction",
        "pipelines-crude",
        "pipelines-gas",
        "refineries",
        "storage",
        "ports",
        "lng-terminals",
        "lng-voyages",
      ]),
    );
  });
});
