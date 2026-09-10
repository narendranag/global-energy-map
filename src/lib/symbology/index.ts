/**
 * Single source of truth for how every map layer is drawn: colours, size
 * rules, ramps, glyph shapes, and the legend rows built from them. Layer
 * builders and `Legend.tsx` both import from here, so the legend cannot drift
 * from the map (D2). Phase 9 redesigns the palette (D3) — change it here.
 */
import type { LayerState } from "@/components/layers/LayerPanel";

export type Rgb = readonly [number, number, number];
export type Rgba = readonly [number, number, number, number];

/** Linear interpolation between two RGB anchors; t is clamped to [0, 1]. */
function lerpRgb(lo: Rgb, hi: Rgb, t: number): Rgb {
  const u = Math.min(1, Math.max(0, t));
  return [lo[0] + (hi[0] - lo[0]) * u, lo[1] + (hi[1] - lo[1]) * u, lo[2] + (hi[2] - lo[2]) * u];
}

/** CSS `rgba()` for an Rgba (alpha 0–255). */
export function rgbaCss(c: Rgba): string {
  const [r, g, b, a] = c;
  return `rgba(${Math.round(r).toString()},${Math.round(g).toString()},${Math.round(b).toString()},${(a / 255).toFixed(3)})`;
}

/** CSS left-to-right linear gradient through `stops`. */
export function gradientCss(stops: readonly Rgba[]): string {
  return `linear-gradient(to right, ${stops.map(rgbaCss).join(", ")})`;
}

// ---------------------------------------------------------------------------
// Reserves choropleth
// ---------------------------------------------------------------------------

/** Countries with no reserves row in the source — distinct from a zero value. */
export const RESERVES_NO_DATA_COLOR: Rgba = [200, 200, 200, 110];
/** Country outline on the reserves layer. */
export const COUNTRY_OUTLINE_COLOR: Rgba = [120, 120, 120, 180];
export const COUNTRY_OUTLINE_MIN_PX = 0.5;

// Sequential green ramp (ColorBrewer "Greens" end-points #edf8e9 → #005a32).
const RESERVES_LOW: Rgb = [237, 248, 233];
const RESERVES_HIGH: Rgb = [0, 90, 50];
const RESERVES_ALPHA = 200;

// Scale-free log: value / max is spread over three decades, so a country with
// 1 % of the leader's reserves still lands a third of the way up the ramp
// instead of rounding to white (the linear ramp only showed VEN/SAU/CAN).
const RESERVES_DECADES = 1000;

/** Position on the reserves ramp in [0, 1]. Non-positive values sit at 0. */
export function reservesRampT(value: number, max: number): number {
  if (!(max > 0) || !(value > 0)) return 0;
  const t = Math.log1p((RESERVES_DECADES * value) / max) / Math.log1p(RESERVES_DECADES);
  return Math.min(1, t);
}

/** Ramp colour at position t in [0, 1]. */
export function reservesRampColor(t: number): Rgba {
  const [r, g, b] = lerpRgb(RESERVES_LOW, RESERVES_HIGH, t);
  return [Math.round(r), Math.round(g), Math.round(b), RESERVES_ALPHA];
}

/** Fill colour for a reserves value; `null`/`undefined` → no-data grey. */
export function reservesColor(value: number | null | undefined, max: number): Rgba {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return RESERVES_NO_DATA_COLOR;
  }
  return reservesRampColor(reservesRampT(value, max));
}

// ---------------------------------------------------------------------------
// Scenario exposure (importer countries)
// ---------------------------------------------------------------------------

// Sequential red ramp (ColorBrewer "Reds" end-points): light salmon at low
// exposure → dark red at full exposure. Alpha rises with exposure so small
// shares read as a faint tint and large shares as a solid fill.
const EXPOSURE_LOW: Rgb = [252, 187, 161]; // #fcbba1
const EXPOSURE_HIGH: Rgb = [153, 0, 13]; // #99000d
const EXPOSURE_ALPHA_MIN = 40;
const EXPOSURE_ALPHA_MAX = 240;

/**
 * Colour for a country whose `t` share of imports is at risk under the active
 * scenario. `t <= 0` (or non-finite) → undefined: no override, so a country
 * with zero exposure is not painted as if it were exposed.
 */
export function exposureColor(t: number): Rgba | undefined {
  if (!Number.isFinite(t) || t <= 0) return undefined;
  const u = Math.min(1, t);
  // Unrounded on purpose: deck.gl quantises to Uint8 itself, and rounding
  // here would flatten small differences between nearby shares.
  const [r, g, b] = lerpRgb(EXPOSURE_LOW, EXPOSURE_HIGH, u);
  return [r, g, b, EXPOSURE_ALPHA_MIN + (EXPOSURE_ALPHA_MAX - EXPOSURE_ALPHA_MIN) * u];
}

/** Legend / panel gradient stops for the exposure ramp (1 % → 100 %). */
export const EXPOSURE_LEGEND_STOPS: readonly Rgba[] = [0.01, 0.25, 0.5, 0.75, 1].map(
  (t) => exposureColor(t) ?? [0, 0, 0, 0],
);

// ---------------------------------------------------------------------------
// Basins
// ---------------------------------------------------------------------------

export const BASIN_FILL: Rgba = [120, 100, 80, 50];
export const BASIN_LINE: Rgba = [120, 100, 80, 200];
export const BASIN_LINE_MIN_PX = 0.5;

// ---------------------------------------------------------------------------
// Extraction sites
// ---------------------------------------------------------------------------

export const EXTRACTION_FILL: Rgba = [220, 60, 40, 180];
export const EXTRACTION_LINE: Rgba = [40, 20, 10, 220];
export const EXTRACTION_RADIUS = { minPixels: 1.5, maxPixels: 8 } as const;
/** Metres. GEM extraction rows carry no capacity today, so this is the base radius. */
export function extractionRadius(capacity: number | null): number {
  return 2_500 + Math.sqrt(Math.max(0, capacity ?? 0)) * 1_500;
}

// ---------------------------------------------------------------------------
// Pipelines
// ---------------------------------------------------------------------------

export type PipelineCommodity = "crude" | "gas";

const PIPELINE_RGB: Record<PipelineCommodity, Rgb> = {
  crude: [40, 60, 120], // navy
  gas: [20, 140, 160], // teal
};
const PIPELINE_ALPHA_OPERATING = 220;
const PIPELINE_ALPHA_OTHER = 140;
export const PIPELINE_LINE_MIN_PX = 1.2;
/** Invisible hover band so thin lines are pickable at low zoom (D5). */
export const PIPELINE_HIT_WIDTH_PX = 8;

/** Opacity (not hue) separates operating from in-construction (the only other status). */
export function pipelineColor(commodity: PipelineCommodity, status: string | null): Rgba {
  const [r, g, b] = PIPELINE_RGB[commodity];
  return [r, g, b, status === "operating" ? PIPELINE_ALPHA_OPERATING : PIPELINE_ALPHA_OTHER];
}

// ---------------------------------------------------------------------------
// Refineries
// ---------------------------------------------------------------------------

export const REFINERY_FILL: Rgba = [30, 80, 160, 200];
export const REFINERY_LINE: Rgba = [20, 20, 40, 220];
export const REFINERY_RADIUS = { minPixels: 3, maxPixels: 14 } as const;
/** Metres; capacity in kbpd. Rows without capacity (~85 %) get the base radius. */
export function refineryRadius(capacity: number | null): number {
  return 3_000 + Math.sqrt(Math.max(0, capacity ?? 0)) * 400;
}
/** Refinery fill under a scenario: base colour at 0 %, redder with share at risk. */
export function refineryColor(shareAtRisk: number | undefined): Rgba {
  if (shareAtRisk === undefined || !(shareAtRisk > 0)) return REFINERY_FILL;
  return [Math.round(60 + 180 * shareAtRisk), 30, 30, 230];
}

// ---------------------------------------------------------------------------
// Storage + ports
// ---------------------------------------------------------------------------

export const STORAGE_FILL: Rgba = [170, 100, 40, 180]; // amber-brown
export const STORAGE_RADIUS = { metres: 3_000, minPixels: 2, maxPixels: 6 } as const;

export const PORT_COLOR: Rgba = [60, 80, 100, 170]; // slate, softened: 3.7k glyphs line every coast
// Halved in Phase 8 once interleaved rendering made the icons reliably visible; zoom-gating is Phase 9.
export const PORT_SIZE = { minPixels: 6, maxPixels: 14 } as const;
/** Pixels. Capacity is known for <1 % of ports, so nearly all get the default. */
export function portSize(capacity: number | null): number {
  return capacity !== null && capacity > 0 ? 7 + Math.sqrt(capacity) * 0.25 : 8;
}

/** Anchor glyph (32×32 viewBox), shared by the port icon atlas and the legend. */
export const ANCHOR_GLYPH = {
  path: "M16 4 L16 28 M10 10 L22 10 M6 22 Q16 32 26 22",
  ring: { cx: 16, cy: 7, r: 2.5 },
  strokeWidth: 3,
} as const;

// ---------------------------------------------------------------------------
// LNG terminals
// ---------------------------------------------------------------------------

export const LNG_TERMINAL_COLOR: Rgba = [20, 130, 160, 230]; // cyan/teal
/** Import terminal with no measured voyages in the scenario year — a data gap, not "safe". */
export const LNG_NO_COVERAGE_COLOR: Rgba = [140, 140, 140, 200];
export const LNG_TERMINAL_SIZE = { minPixels: 6, maxPixels: 20 } as const;
/** Pixels; capacity in mtpa (sqrt for area perception). */
export function lngTerminalSize(capacity: number | null): number {
  return 7 + Math.sqrt(Math.max(0, capacity ?? 0)) * 1.2;
}

/** Red for an LNG asset / voyage end at risk, by share (shared by terminals and arcs). */
function lngAtRiskColor(shareAtRisk: number): Rgba {
  return [Math.round(80 + 175 * shareAtRisk), 30, 30, 230];
}

export function lngTerminalColor(
  impact: { shareAtRisk: number; coverage: string } | undefined,
): Rgba {
  if (impact?.coverage === "none") return LNG_NO_COVERAGE_COLOR;
  if (impact && impact.shareAtRisk > 0) return lngAtRiskColor(impact.shareAtRisk);
  return LNG_TERMINAL_COLOR;
}

/** Triangle glyphs (32×32 cells): filled = export, hollow = import. */
export const LNG_TRIANGLE_POINTS = "16,4 28,28 4,28";
export const LNG_TRIANGLE_STROKE = 3;

// ---------------------------------------------------------------------------
// LNG voyages (arcs)
// ---------------------------------------------------------------------------

export const VOYAGE_EXPORT_END: Rgba = [220, 140, 60, 160]; // orange
export const VOYAGE_EXPORT_END_AT_RISK: Rgba = [220, 80, 60, 200];
export const VOYAGE_IMPORT_END: Rgba = [20, 140, 200, 200]; // blue
export const VOYAGE_WIDTH = { minPixels: 0.5, maxPixels: 4 } as const;

export function voyageSourceColor(shareAtRisk: number | undefined): Rgba {
  return shareAtRisk !== undefined && shareAtRisk > 0 ? VOYAGE_EXPORT_END_AT_RISK : VOYAGE_EXPORT_END;
}
export function voyageTargetColor(shareAtRisk: number | undefined): Rgba {
  return shareAtRisk !== undefined && shareAtRisk > 0 ? lngAtRiskColor(shareAtRisk) : VOYAGE_IMPORT_END;
}
/** Pixels; log of cargo size in cbm. */
export function voyageWidth(amountCbm: number): number {
  return Math.max(0.5, Math.log10(Math.max(1, amountCbm)) - 3);
}

// ---------------------------------------------------------------------------
// Legend
// ---------------------------------------------------------------------------

export type Swatch =
  | { readonly kind: "gradient"; readonly stops: readonly Rgba[] }
  | { readonly kind: "fill"; readonly color: Rgba; readonly outline?: Rgba }
  | { readonly kind: "line"; readonly color: Rgba }
  | { readonly kind: "dot"; readonly color: Rgba; readonly outline?: Rgba }
  | { readonly kind: "triangle"; readonly color: Rgba; readonly hollow: boolean }
  | { readonly kind: "anchor"; readonly color: Rgba }
  | { readonly kind: "arc"; readonly from: Rgba; readonly to: Rgba };

export interface LegendItem {
  readonly label: string;
  readonly swatch: Swatch;
}

export type LayerKey = keyof LayerState;

const RESERVES_LEGEND_STOPS: readonly Rgba[] = [0, 0.25, 0.5, 0.75, 1].map(reservesRampColor);

/**
 * Legend rows per layer toggle, in LayerPanel order. "size = capacity" is
 * claimed only where capacity drives size and is mostly populated (LNG
 * 99 %); refineries say "where known" (~15 %); ports/storage/extraction make
 * no size claim.
 */
export const LEGEND: Readonly<Record<LayerKey, readonly LegendItem[]>> = {
  reserves: [
    { label: "Reserves: low → high (log scale)", swatch: { kind: "gradient", stops: RESERVES_LEGEND_STOPS } },
    { label: "Reserves: no data in source", swatch: { kind: "fill", color: RESERVES_NO_DATA_COLOR } },
  ],
  basins: [{ label: "Basins", swatch: { kind: "fill", color: BASIN_FILL, outline: BASIN_LINE } }],
  extraction: [
    { label: "Extraction site", swatch: { kind: "dot", color: EXTRACTION_FILL, outline: EXTRACTION_LINE } },
  ],
  pipelines: [
    { label: "Oil pipeline (operating)", swatch: { kind: "line", color: pipelineColor("crude", "operating") } },
    { label: "Oil pipeline (in construction)", swatch: { kind: "line", color: pipelineColor("crude", null) } },
  ],
  refineries: [
    {
      label: "Refinery (size = capacity where known)",
      swatch: { kind: "dot", color: REFINERY_FILL, outline: REFINERY_LINE },
    },
  ],
  storage: [{ label: "Storage hub", swatch: { kind: "dot", color: STORAGE_FILL } }],
  ports: [{ label: "Port", swatch: { kind: "anchor", color: PORT_COLOR } }],
  gas_pipelines: [
    { label: "Gas pipeline (operating)", swatch: { kind: "line", color: pipelineColor("gas", "operating") } },
    { label: "Gas pipeline (in construction)", swatch: { kind: "line", color: pipelineColor("gas", null) } },
  ],
  lng_terminals: [
    {
      label: "LNG export terminal (size = capacity)",
      swatch: { kind: "triangle", color: LNG_TERMINAL_COLOR, hollow: false },
    },
    {
      label: "LNG import terminal (size = capacity)",
      swatch: { kind: "triangle", color: LNG_TERMINAL_COLOR, hollow: true },
    },
  ],
  lng_voyages: [
    { label: "LNG voyage: export → import end", swatch: { kind: "arc", from: VOYAGE_EXPORT_END, to: VOYAGE_IMPORT_END } },
  ],
};

/** Extra rows shown while a scenario is active. */
export function scenarioLegend(importsNoun: string): readonly LegendItem[] {
  return [
    {
      label: `Scenario: share of ${importsNoun} at risk (0 → 100 %)`,
      swatch: { kind: "gradient", stops: EXPOSURE_LEGEND_STOPS },
    },
    {
      label: "Assets at risk (redder = larger share)",
      swatch: { kind: "dot", color: refineryColor(1) },
    },
  ];
}
