/**
 * Single source of truth for how every map layer is drawn: colours, size
 * rules, ramps, glyph shapes, and the legend rows built from them. Layer
 * builders and `Legend.tsx` both import from here, so the legend cannot drift
 * from the map (D2).
 *
 * Palette (Phase 9, D3): one hue family per commodity — oil warm (brown →
 * amber → burnt orange → tan), gas cool (teal → cyan → blue) — with lightness
 * and shape separating asset kinds; reserves on a neutral → olive sequential
 * ramp that collides with neither; slate for ports; red reserved for scenario
 * exposure. `PALETTE` holds the hexes; `tests/unit/symbology-contrast.test.ts`
 * checks contrast against the Positron basemap and ΔE between key pairs
 * (normal vision + protan/deutan simulation).
 */
import type { LayerState } from "@/components/layers/LayerPanel";
import { isZoomGated, minZoomFor } from "./zoom";

export type Rgb = readonly [number, number, number];
export type Rgba = readonly [number, number, number, number];

export { TIME_AWARE, TIME_AWARE_COVERAGE, TIME_AWARE_NOTE, timeAwareLabel, type TimeAwareLevel } from "./time-aware";
export { MIN_ZOOM, extractionOpacity, glyphScale, isZoomGated, minZoomFor } from "./zoom";

/** Every hex the map uses, by role. Alpha is applied per mark below. */
export const PALETTE = {
  // Basemap (OpenFreeMap Positron) — for validation only; not drawn by us.
  basemapLand: "#f2f3f0",
  basemapWater: "#c2c8ca",

  // Oil — warm family.
  oilPipeline: "#6f360b", // deep amber-brown
  refinery: "#df9a1a", // amber
  refineryOutline: "#5c3207",
  extraction: "#b85a14", // burnt orange
  extractionOutline: "#4a2206",
  storage: "#8f7a58", // muted tan
  storageOutline: "#4f412c",

  // Gas — cool family.
  gasPipeline: "#08727c", // teal
  lngTerminal: "#0987ad", // cyan
  voyageExport: "#2aa5c4", // light cyan (export end)
  voyageImport: "#2f4fa6", // blue (import end)

  // Neutral / shared.
  port: "#5f6670", // slate
  basin: "#6e5c48", // brown-grey outline
  countryOutline: "#9a9a94",
  noData: "#c8c8c4",
  lngNoCoverage: "#8c8c8c",

  // Reserves — neutral → olive-green sequential (hue ≈ 130°, between the
  // warm oil family ≈ 50–70° and the cool gas family ≈ 205–230°).
  reservesLow: "#efeee4",
  reservesHigh: "#6e9a46",
  // Reserves while a scenario is active: same lightness steps, no hue, so
  // red is the only hue on the choropleth.
  reservesMutedHigh: "#d0d0cb",

  // Scenario — red only.
  exposureLow: "#fcbba1",
  exposureHigh: "#99000d",
  atRiskLow: "#a3141c",
  atRiskHigh: "#650810",
} as const;

export type PaletteRole = keyof typeof PALETTE;

function hex(h: string): Rgb {
  const s = h.replace(/^#/, "");
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}

/** RGBA for a palette role at alpha 0–255. */
export function paletteRgba(role: PaletteRole, alpha = 255): Rgba {
  const [r, g, b] = hex(PALETTE[role]);
  return [r, g, b, alpha];
}

/** Linear interpolation between two RGB anchors; t is clamped to [0, 1]. */
function lerpRgb(lo: Rgb, hi: Rgb, t: number): Rgb {
  const u = Math.min(1, Math.max(0, t));
  return [lo[0] + (hi[0] - lo[0]) * u, lo[1] + (hi[1] - lo[1]) * u, lo[2] + (hi[2] - lo[2]) * u];
}

/** Same hue, lighter: mix `amount` of white in (in-construction variants). */
function tint(c: Rgb, amount: number): Rgb {
  return lerpRgb(c, [255, 255, 255], amount).map(Math.round) as unknown as Rgb;
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
export const RESERVES_NO_DATA_COLOR: Rgba = paletteRgba("noData", 120);
/** Country outline on the reserves layer. */
export const COUNTRY_OUTLINE_COLOR: Rgba = paletteRgba("countryOutline", 170);
export const COUNTRY_OUTLINE_MIN_PX = 0.5;

const RESERVES_LOW = hex(PALETTE.reservesLow);
const RESERVES_HIGH = hex(PALETTE.reservesHigh);
const RESERVES_MUTED_HIGH = hex(PALETTE.reservesMutedHigh);
const RESERVES_ALPHA = 215;
const RESERVES_MUTED_ALPHA = 100;

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

/** Ramp colour at position t in [0, 1]. `muted` = the hue-free scenario variant. */
export function reservesRampColor(t: number, muted = false): Rgba {
  const [r, g, b] = lerpRgb(RESERVES_LOW, muted ? RESERVES_MUTED_HIGH : RESERVES_HIGH, t);
  return [Math.round(r), Math.round(g), Math.round(b), muted ? RESERVES_MUTED_ALPHA : RESERVES_ALPHA];
}

/** Fill colour for a reserves value; `null`/`undefined` → no-data grey. */
export function reservesColor(value: number | null | undefined, max: number, muted = false): Rgba {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return RESERVES_NO_DATA_COLOR;
  }
  return reservesRampColor(reservesRampT(value, max), muted);
}

// ---------------------------------------------------------------------------
// Scenario exposure (importer countries) + assets at risk
// ---------------------------------------------------------------------------

// Sequential red ramp (ColorBrewer "Reds" end-points): light salmon at low
// exposure → dark red at full exposure. Alpha rises with exposure so small
// shares read as a faint tint and large shares as a solid fill.
const EXPOSURE_LOW = hex(PALETTE.exposureLow);
const EXPOSURE_HIGH = hex(PALETTE.exposureHigh);
const EXPOSURE_ALPHA_MIN = 60;
const EXPOSURE_ALPHA_MAX = 250;

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

const AT_RISK_LOW = hex(PALETTE.atRiskLow);
const AT_RISK_HIGH = hex(PALETTE.atRiskHigh);

/**
 * Red for an asset (refinery, LNG terminal, voyage import end) at risk: crimson
 * at a small share, deepening to dark red at 100 %. Its lightness (OKLCH L
 * 0.46 → 0.33) sits well below amber refineries and burnt-orange extraction
 * sites, so it stays separable under red–green colour-vision deficiency.
 */
export function atRiskColor(shareAtRisk: number): Rgba {
  const [r, g, b] = lerpRgb(AT_RISK_LOW, AT_RISK_HIGH, shareAtRisk);
  return [Math.round(r), Math.round(g), Math.round(b), 240];
}

// ---------------------------------------------------------------------------
// Basins
// ---------------------------------------------------------------------------

/** Near-transparent fill + thin outline: an extent, not a mass. */
export const BASIN_FILL: Rgba = paletteRgba("basin", 18);
export const BASIN_LINE: Rgba = paletteRgba("basin", 200);
export const BASIN_LINE_MIN_PX = 0.75;

// ---------------------------------------------------------------------------
// Extraction sites
// ---------------------------------------------------------------------------

export const EXTRACTION_FILL: Rgba = paletteRgba("extraction", 230);
export const EXTRACTION_LINE: Rgba = paletteRgba("extractionOutline", 200);
export const EXTRACTION_RADIUS = { minPixels: 2, maxPixels: 7 } as const;
/** Metres. GEM extraction rows carry no capacity today, so this is the base radius. */
export function extractionRadius(capacity: number | null): number {
  return 2_500 + Math.sqrt(Math.max(0, capacity ?? 0)) * 1_500;
}

// ---------------------------------------------------------------------------
// Pipelines
// ---------------------------------------------------------------------------

export type PipelineCommodity = "crude" | "gas";

const PIPELINE_RGB: Record<PipelineCommodity, Rgb> = {
  crude: hex(PALETTE.oilPipeline),
  gas: hex(PALETTE.gasPipeline),
};
const PIPELINE_ALPHA_OPERATING = 230;
const PIPELINE_ALPHA_OTHER = 190;
/** White mixed into an in-construction line: same hue, lighter. */
const PIPELINE_CONSTRUCTION_TINT = 0.3;
export const PIPELINE_LINE_MIN_PX = 1.25;

/**
 * Hue = commodity; operating lines are the full colour, anything else (GEM's
 * only other status is in-construction) the same hue lighter and more
 * transparent. Dashes would need `@deck.gl/extensions` (not a dependency).
 */
export function pipelineColor(commodity: PipelineCommodity, status: string | null): Rgba {
  const base = PIPELINE_RGB[commodity];
  if (status === "operating") return [...base, PIPELINE_ALPHA_OPERATING];
  return [...tint(base, PIPELINE_CONSTRUCTION_TINT), PIPELINE_ALPHA_OTHER];
}

// ---------------------------------------------------------------------------
// Refineries
// ---------------------------------------------------------------------------

export const REFINERY_FILL: Rgba = paletteRgba("refinery", 230);
export const REFINERY_LINE: Rgba = paletteRgba("refineryOutline", 230);
export const REFINERY_RADIUS = { minPixels: 3.5, maxPixels: 12 } as const;
/** Metres; capacity in kbpd. Rows without capacity (~85 %) get the base radius. */
export function refineryRadius(capacity: number | null): number {
  return 3_000 + Math.sqrt(Math.max(0, capacity ?? 0)) * 400;
}
/** Refinery fill under a scenario: amber at 0 %, crimson → dark red with share at risk. */
export function refineryColor(shareAtRisk: number | undefined): Rgba {
  if (shareAtRisk === undefined || !(shareAtRisk > 0)) return REFINERY_FILL;
  return atRiskColor(shareAtRisk);
}

// ---------------------------------------------------------------------------
// Storage + ports
// ---------------------------------------------------------------------------

export const STORAGE_FILL: Rgba = paletteRgba("storage", 200);
export const STORAGE_LINE: Rgba = paletteRgba("storageOutline", 150);
export const STORAGE_RADIUS = { metres: 3_000, minPixels: 2, maxPixels: 5 } as const;

export const PORT_COLOR: Rgba = paletteRgba("port", 200);
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

export const LNG_TERMINAL_COLOR: Rgba = paletteRgba("lngTerminal", 235);
/** Import terminal with no measured voyages in the scenario year — a data gap, not "safe". */
export const LNG_NO_COVERAGE_COLOR: Rgba = paletteRgba("lngNoCoverage", 210);
export const LNG_TERMINAL_SIZE = { minPixels: 5, maxPixels: 18 } as const;
/** Pixels; capacity in mtpa (sqrt for area perception). */
export function lngTerminalSize(capacity: number | null): number {
  return 7 + Math.sqrt(Math.max(0, capacity ?? 0)) * 1.2;
}

export function lngTerminalColor(
  impact: { shareAtRisk: number; coverage: string } | undefined,
): Rgba {
  if (impact?.coverage === "none") return LNG_NO_COVERAGE_COLOR;
  if (impact && impact.shareAtRisk > 0) return atRiskColor(impact.shareAtRisk);
  return LNG_TERMINAL_COLOR;
}

/** Triangle glyphs (32×32 cells): filled = export, hollow = import. */
export const LNG_TRIANGLE_POINTS = "16,4 28,28 4,28";
export const LNG_TRIANGLE_STROKE = 4;

// ---------------------------------------------------------------------------
// LNG voyages (arcs)
// ---------------------------------------------------------------------------

export const VOYAGE_EXPORT_END: Rgba = paletteRgba("voyageExport", 100);
/** Export end of a voyage whose destination is exposed: still cool, but opaque. */
export const VOYAGE_EXPORT_END_AT_RISK: Rgba = paletteRgba("voyageExport", 220);
// Translucent on purpose: a year is ~3–4 k overlapping arcs; density reads as volume.
export const VOYAGE_IMPORT_END: Rgba = paletteRgba("voyageImport", 160);
export const VOYAGE_WIDTH = { minPixels: 0.5, maxPixels: 3 } as const;

export function voyageSourceColor(shareAtRisk: number | undefined): Rgba {
  return shareAtRisk !== undefined && shareAtRisk > 0 ? VOYAGE_EXPORT_END_AT_RISK : VOYAGE_EXPORT_END;
}
export function voyageTargetColor(shareAtRisk: number | undefined): Rgba {
  return shareAtRisk !== undefined && shareAtRisk > 0 ? atRiskColor(shareAtRisk) : VOYAGE_IMPORT_END;
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
  | { readonly kind: "line"; readonly color: Rgba; readonly width?: number }
  | { readonly kind: "dot"; readonly color: Rgba; readonly outline?: Rgba; readonly size?: number }
  | { readonly kind: "triangle"; readonly color: Rgba; readonly hollow: boolean }
  | { readonly kind: "anchor"; readonly color: Rgba }
  | { readonly kind: "arc"; readonly from: Rgba; readonly to: Rgba };

export interface LegendItem {
  readonly label: string;
  readonly swatch: Swatch;
  /** Secondary text, e.g. "visible from zoom 4". */
  readonly note?: string;
}

export type LayerKey = keyof LayerState;

const RESERVES_LEGEND_STOPS: readonly Rgba[] = [0, 0.25, 0.5, 0.75, 1].map((t) => reservesRampColor(t));

/**
 * Legend rows per layer toggle. "size = capacity" is claimed only where
 * capacity drives size and is mostly populated (LNG 99 %); refineries say
 * "where known" (~15 %); ports/storage/extraction make no size claim.
 */
export const LEGEND: Readonly<Record<LayerKey, readonly LegendItem[]>> = {
  reserves: [
    { label: "Proved reserves, low → high (log)", swatch: { kind: "gradient", stops: RESERVES_LEGEND_STOPS } },
    { label: "No reserves data in source", swatch: { kind: "fill", color: RESERVES_NO_DATA_COLOR } },
  ],
  basins: [{ label: "Sedimentary basin", swatch: { kind: "fill", color: BASIN_FILL, outline: BASIN_LINE } }],
  extraction: [
    {
      label: "Extraction site",
      swatch: { kind: "dot", color: EXTRACTION_FILL, outline: EXTRACTION_LINE, size: 7 },
    },
  ],
  pipelines: [
    { label: "Oil pipeline", swatch: { kind: "line", color: pipelineColor("crude", "operating") } },
    { label: "Oil pipeline, in construction", swatch: { kind: "line", color: pipelineColor("crude", null) } },
  ],
  refineries: [
    {
      label: "Refinery (size = capacity where known)",
      swatch: { kind: "dot", color: REFINERY_FILL, outline: REFINERY_LINE, size: 10 },
    },
  ],
  storage: [{ label: "Storage hub", swatch: { kind: "dot", color: STORAGE_FILL, outline: STORAGE_LINE, size: 6 } }],
  ports: [{ label: "Port", swatch: { kind: "anchor", color: PORT_COLOR } }],
  gas_pipelines: [
    { label: "Gas pipeline", swatch: { kind: "line", color: pipelineColor("gas", "operating") } },
    { label: "Gas pipeline, in construction", swatch: { kind: "line", color: pipelineColor("gas", null) } },
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
    { label: "LNG voyage, export → import", swatch: { kind: "arc", from: VOYAGE_EXPORT_END, to: VOYAGE_IMPORT_END } },
  ],
};

/** Legend sections, grouped by commodity (reserves first, then oil, gas, shared). */
export const LEGEND_GROUPS: readonly { readonly title: string; readonly keys: readonly LayerKey[] }[] = [
  { title: "Reserves & geology", keys: ["reserves", "basins"] },
  { title: "Oil", keys: ["pipelines", "extraction", "refineries", "storage"] },
  { title: "Gas", keys: ["gas_pipelines", "lng_terminals", "lng_voyages"] },
  { title: "Shipping", keys: ["ports"] },
];

/**
 * Extra rows shown while a scenario is active. With `layers`, asset rows are
 * limited to layers that can show them (refineries / LNG terminals).
 */
export function scenarioLegend(importsNoun: string, layers?: LayerState): readonly LegendItem[] {
  const assets = layers === undefined || layers.refineries || layers.lng_terminals;
  const lng = layers === undefined || layers.lng_terminals;
  return [
    {
      label: `Share of ${importsNoun} at risk (0 → 100 %)`,
      swatch: { kind: "gradient", stops: EXPOSURE_LEGEND_STOPS },
    },
    ...(assets
      ? [
          {
            label: "Asset at risk (darker = larger share)",
            swatch: { kind: "dot", color: atRiskColor(0.5), size: 9 } as const,
          },
        ]
      : []),
    ...(lng
      ? [
          {
            label: "LNG terminal, no measured voyages that year",
            swatch: { kind: "triangle", color: LNG_NO_COVERAGE_COLOR, hollow: true } as const,
          },
        ]
      : []),
  ];
}

/** Legend rows for one layer, with a zoom-gating note when it is hidden at `zoom`. */
function rowsFor(key: LayerKey, zoom: number | undefined): readonly LegendItem[] {
  if (zoom === undefined || !isZoomGated(key, zoom)) return LEGEND[key];
  const note = `visible from zoom ${minZoomFor(key).toString()}`;
  return LEGEND[key].map((item) => ({ ...item, note }));
}

export interface LegendSection {
  readonly title: string;
  readonly items: readonly LegendItem[];
}

/** Legend sections for the visible layers (+ a "Scenario" section), empty sections dropped. */
export function legendSections(
  layers: LayerState,
  scenarioNoun?: string,
  zoom?: number,
): LegendSection[] {
  const sections: LegendSection[] = LEGEND_GROUPS.map((g) => ({
    title: g.title,
    items: g.keys.filter((k) => layers[k]).flatMap((k) => rowsFor(k, zoom)),
  })).filter((s) => s.items.length > 0);
  if (scenarioNoun !== undefined) {
    sections.push({ title: "Scenario", items: scenarioLegend(scenarioNoun, layers) });
  }
  return sections;
}
