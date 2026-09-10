/**
 * Palette validation (Phase 9, D3). Computes — rather than eyeballs — how
 * every mark reads on the Positron basemap and against the marks it sits
 * next to: WCAG contrast for edges, OKLab ΔE (×100) for identity, under
 * normal vision and simulated protanopia / deuteranopia (Machado 2009).
 *
 * Run `PALETTE_REPORT=1 pnpm vitest run tests/unit/symbology-contrast.test.ts`
 * to print the full table.
 */
import { describe, expect, it } from "vitest";
import {
  BASIN_LINE,
  EXTRACTION_FILL,
  EXTRACTION_LINE,
  LNG_TERMINAL_COLOR,
  PALETTE,
  PORT_COLOR,
  REFINERY_FILL,
  REFINERY_LINE,
  STORAGE_FILL,
  STORAGE_LINE,
  VOYAGE_EXPORT_END,
  VOYAGE_IMPORT_END,
  atRiskColor,
  exposureColor,
  pipelineColor,
  reservesRampColor,
  type Rgb,
  type Rgba,
} from "@/lib/symbology";
import { contrast, deltaE, hexToRgb, oklch, over } from "@/lib/symbology/color-metrics";

const LAND = hexToRgb(PALETTE.basemapLand);
const WATER = hexToRgb(PALETTE.basemapWater);
/** Darkest reserves fill as seen on land — the busiest ground marks sit on. */
const RESERVES_TOP = over(reservesRampColor(1), LAND);
const RESERVES_MID = over(reservesRampColor(0.6), LAND);
const RESERVES_MUTED_TOP = over(reservesRampColor(1, true), LAND);

/** A mark as rendered on land (alpha composited). */
const onLand = (c: Rgba): Rgb => over(c, LAND);

const MARKS = {
  oilPipeline: onLand(pipelineColor("crude", "operating")),
  oilPipelineConstruction: onLand(pipelineColor("crude", null)),
  gasPipeline: onLand(pipelineColor("gas", "operating")),
  gasPipelineConstruction: onLand(pipelineColor("gas", null)),
  refinery: onLand(REFINERY_FILL),
  refineryOutline: onLand(REFINERY_LINE),
  extraction: onLand(EXTRACTION_FILL),
  extractionOutline: onLand(EXTRACTION_LINE),
  storage: onLand(STORAGE_FILL),
  storageOutline: onLand(STORAGE_LINE),
  lngTerminal: onLand(LNG_TERMINAL_COLOR),
  voyageExport: onLand(VOYAGE_EXPORT_END),
  voyageImport: onLand(VOYAGE_IMPORT_END),
  port: onLand(PORT_COLOR),
  basinLine: onLand(BASIN_LINE),
  atRiskLow: onLand(atRiskColor(0.05)),
  atRiskHigh: onLand(atRiskColor(1)),
} as const;
type Mark = keyof typeof MARKS;

const report: Record<string, string | number>[] = [];
function note(row: Record<string, string | number>) {
  report.push(row);
}
const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;

describe("marks vs the Positron basemap (WCAG contrast of the mark's edge)", () => {
  // Lines and outlined/filled glyphs whose own colour is their edge must clear
  // 3:1 on land (WCAG 1.4.11 non-text contrast). Amber refineries and burnt-
  // orange extraction dots carry a dark outline for this; the fill itself is
  // identity, not edge.
  const EDGE: readonly Mark[] = [
    "oilPipeline",
    "gasPipeline",
    "refineryOutline",
    "extractionOutline",
    "storageOutline",
    "lngTerminal",
    "port",
    "basinLine",
    "atRiskLow",
    "atRiskHigh",
  ];
  for (const m of Object.keys(MARKS) as Mark[]) {
    note({
      pair: `${m} / land`,
      contrast: r2(contrast(MARKS[m], LAND)),
      water: r2(contrast(MARKS[m], WATER)),
    });
  }
  it.each(EDGE)("%s ≥ 3:1 on land", (m) => {
    expect(contrast(MARKS[m], LAND)).toBeGreaterThanOrEqual(3);
  });

  it("in-construction pipelines stay visible (≥ 2:1) while reading lighter", () => {
    expect(contrast(MARKS.oilPipelineConstruction, LAND)).toBeGreaterThanOrEqual(2);
    expect(contrast(MARKS.gasPipelineConstruction, LAND)).toBeGreaterThanOrEqual(2);
  });

  it("coastal marks (LNG terminals, ports, pipelines) keep ≥ 2:1 over water", () => {
    for (const m of ["lngTerminal", "port", "oilPipeline", "gasPipeline"] as const) {
      expect(contrast(MARKS[m], WATER)).toBeGreaterThanOrEqual(2);
    }
  });

  it("outlines and oil lines keep ≥ 2.5:1 on the darkest reserves fill", () => {
    for (const m of ["refineryOutline", "extractionOutline", "oilPipeline"] as const) {
      const c = contrast(MARKS[m], RESERVES_TOP);
      note({ pair: `${m} / reserves top`, contrast: r2(c) });
      expect(c).toBeGreaterThanOrEqual(2.5);
    }
  });
});

/** [a, b, min ΔE normal, min ΔE protan/deutan, why]. */
const PAIRS: readonly (readonly [Mark | "reservesTop" | "reservesMid", Mark | "reservesTop" | "reservesMid", number, number, string])[] = [
  ["oilPipeline", "gasPipeline", 15, 12, "oil vs gas lines — hue is the only cue"],
  ["refinery", "lngTerminal", 15, 12, "oil vs gas point assets"],
  ["extraction", "lngTerminal", 15, 12, "oil vs gas point assets"],
  ["refinery", "extraction", 12, 8, "same family: lightness + size + outline separate them"],
  ["storage", "refinery", 10, 8, "same family: muted tan vs amber"],
  ["refinery", "atRiskLow", 15, 12, "baseline vs at-risk refinery"],
  ["extraction", "atRiskLow", 12, 10, "burnt orange must not read as exposure red"],
  ["lngTerminal", "atRiskLow", 15, 12, "baseline vs at-risk terminal"],
  // Blue vs cyan collapses under protan/deutan (both read "blue"); the arc end
  // and the triangle are told apart by shape, and the arc ends *at* the terminal.
  ["voyageImport", "lngTerminal", 8, 0, "arc end vs terminal glyph — shape carries identity"],
  ["oilPipeline", "reservesTop", 15, 12, "oil line on the darkest reserves"],
  ["gasPipeline", "reservesTop", 15, 12, "gas line on the darkest reserves"],
  ["lngTerminal", "reservesTop", 15, 12, "LNG glyph on the darkest reserves"],
  ["refinery", "reservesMid", 10, 8, "amber refinery on mid reserves (outline adds edge)"],
];

const GROUND: Partial<Record<string, Rgb>> = { ...MARKS, reservesTop: RESERVES_TOP, reservesMid: RESERVES_MID };

describe("identity: ΔE between key mark pairs (normal / protan / deutan)", () => {
  it.each(PAIRS)("%s vs %s", (a, b, minNormal, minCvd) => {
    const ca = GROUND[a];
    const cb = GROUND[b];
    if (!ca || !cb) throw new Error(`unknown mark ${a} / ${b}`);
    const n = deltaE(ca, cb);
    const p = deltaE(ca, cb, "protan");
    const d = deltaE(ca, cb, "deutan");
    note({ pair: `${a} / ${b}`, dE: r1(n), protan: r1(p), deutan: r1(d) });
    expect(n).toBeGreaterThanOrEqual(minNormal);
    expect(Math.min(p, d)).toBeGreaterThanOrEqual(minCvd);
  });
});

describe("hue families", () => {
  const hue = (hex: string) => oklch(hexToRgb(hex))[2];
  it("oil marks are warm, gas marks are cool, reserves sit between", () => {
    for (const k of ["oilPipeline", "refinery", "extraction", "storage"] as const) {
      expect(hue(PALETTE[k])).toBeGreaterThan(40);
      expect(hue(PALETTE[k])).toBeLessThan(90);
    }
    for (const k of ["gasPipeline", "lngTerminal", "voyageExport", "voyageImport"] as const) {
      expect(hue(PALETTE[k])).toBeGreaterThan(190);
      expect(hue(PALETTE[k])).toBeLessThan(275);
    }
    const reserves = hue(PALETTE.reservesHigh);
    expect(reserves).toBeGreaterThan(110);
    expect(reserves).toBeLessThan(160);
  });

  it("red (hue < 40°, chroma > 0.1) is used only by scenario colours", () => {
    const scenario = new Set(["exposureLow", "exposureHigh", "atRiskLow", "atRiskHigh"]);
    for (const [role, hex] of Object.entries(PALETTE)) {
      const [, c, h] = oklch(hexToRgb(hex));
      const red = c > 0.1 && (h < 40 || h > 350);
      if (!scenario.has(role)) expect({ role, red }).toEqual({ role, red: false });
    }
    for (const role of ["exposureHigh", "atRiskLow", "atRiskHigh"] as const) {
      const [, c, h] = oklch(hexToRgb(PALETTE[role]));
      expect(c > 0.1 && h < 40).toBe(true);
    }
  });

  it("while a scenario is active, exposure stands apart from the muted reserves", () => {
    // Low shares are a faint tint by design (the panel and tooltip carry the
    // number); from a quarter of imports up the tint must separate clearly.
    for (const [t, minNormal, minCvd] of [
      [0.25, 7, 5],
      [0.5, 15, 10],
    ] as const) {
      const c = exposureColor(t);
      if (!c) throw new Error("expected a colour");
      const exp = over(c, LAND);
      const n = deltaE(exp, RESERVES_MUTED_TOP);
      const p = deltaE(exp, RESERVES_MUTED_TOP, "protan");
      const d = deltaE(exp, RESERVES_MUTED_TOP, "deutan");
      note({ pair: `exposure ${(t * 100).toString()} % / muted reserves top`, dE: r1(n), protan: r1(p), deutan: r1(d) });
      expect(n).toBeGreaterThanOrEqual(minNormal);
      expect(Math.min(p, d)).toBeGreaterThanOrEqual(minCvd);
    }
  });
});

describe("UI text tokens", () => {
  it("panel text clears WCAG AA (4.5:1) on white", () => {
    const white: Rgb = [255, 255, 255];
    for (const hex of ["#1c1f23", "#4b5058", "#686d75"]) {
      const c = contrast(hexToRgb(hex), white);
      note({ pair: `${hex} / white`, contrast: r2(c) });
      expect(c).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("prints the report on request", () => {
    // eslint-disable-next-line no-console -- opt-in report for palette reviews
    if (process.env.PALETTE_REPORT) console.table(report);
    expect(report.length).toBeGreaterThan(0);
  });
});
