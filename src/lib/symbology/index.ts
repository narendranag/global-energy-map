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
import { RESERVES_LATEST_YEAR } from "@/lib/data-catalog/years";
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

  // Trade flows (BACI arcs) — one two-tone gradient per commodity, light at
  // the exporter end darkening to the importer end (the same light→dark
  // convention as the LNG voyage arcs), so which way a flow runs is legible
  // without a legend. Oil stays in the warm family, close to the extraction
  // hue; gas stays cool, close to the voyage-arc hue.
  tradeFlowOilFrom: "#e3b46a", // pale gold (exporter end)
  tradeFlowOilTo: "#823f0e", // burnt umber (importer end)
  tradeFlowGasFrom: "#8ed3e2", // pale cyan (exporter end)
  tradeFlowGasTo: "#163f6e", // deep blue (importer end)

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

  // Gas storage fullness — cool sequential, staying in the gas family
  // (hue ≈ 200°) and distinct from the olive reserves ramp, since the two
  // choropleths can be on at once.
  gasStorageLow: "#e8f0f2",
  gasStorageHigh: "#1d5f78",

  // US shale regions (EIA) — production, one ramp per commodity, each in
  // its family: orange for crude, blue for marketed gas. Both tops are kept
  // light on purpose: the Permian is the darkest fill and the densest patch
  // of wells and pipes, so the marks over it must hold contrast
  // (symbology-contrast.test.ts: ≥ 2.5:1 oil marks, ≥ 2:1 gas lines).
  shaleOilLow: "#f6e8d8",
  shaleOilHigh: "#c98446",
  shaleGasLow: "#e4ebf6",
  shaleGasHigh: "#7f98cf",

  // Recent imports (UN Comtrade) — country choropleth, one ramp per
  // commodity in its family. Tops kept light for the pipes drawn over it.
  importsOilLow: "#f4e6d6",
  importsOilHigh: "#c98446",
  importsGasLow: "#e3ebf4",
  importsGasHigh: "#8ea4d4",

  // Focus (selected country) outline. Deliberately a near-black neutral: the
  // selection must read on the pale basemap, on every choropleth fill and
  // over the warm and cool mark families without claiming a hue any of them
  // owns, and without touching the red the scenario ramp reserves.
  focusOutline: "#101a24",
  focusHalo: "#ffffff",

  // Search result highlight (S4) — a violet ring, the one hue family nothing
  // else on the map owns (oil warm, gas cool, reserves olive, port slate,
  // scenario exposure red), so a found result never reads as any of them.
  searchHighlight: "#7c3aed",
  searchHighlightHalo: "#ffffff",

  // Scenario — red only.
  exposureLow: "#fcbba1",
  exposureHigh: "#99000d",
  atRiskLow: "#a3141c",
  atRiskHigh: "#650810",
  // The disruption mark (S1): where the scenario *happens* — a chokepoint
  // closure or the cut stretch of a pipeline. A vivid red, one step brighter
  // than the exposure ramp's dark end, so the cause reads apart from the
  // consequence it paints on the importers. It is drawn over water as often
  // as over land, hence its own contrast row in symbology-contrast.test.ts.
  disruptionMark: "#d21024",
  // Same mark in a year the scenario does not describe (`activeYears`): the
  // route is still shown, the claim is not. Desaturated far enough to fall
  // under the "red is scenario-only" chroma threshold.
  disruptionMuted: "#9c7a7e",
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
// Gas storage fullness (GIE AGSI)
// ---------------------------------------------------------------------------

const GAS_STORAGE_LOW = hex(PALETTE.gasStorageLow);
const GAS_STORAGE_HIGH = hex(PALETTE.gasStorageHigh);
const GAS_STORAGE_ALPHA = 215;

/** Countries GIE does not report — distinct from a country reporting 0 % full. */
export const GAS_STORAGE_NO_DATA_COLOR: Rgba = paletteRgba("noData", 90);

/**
 * Ramp position for a storage fullness percentage.
 *
 * Linear over 0–100, and **clamped above 100 rather than rescaled**: about
 * 2.8 % of GIE's readings exceed 100 % (Belgium reached 118 % during the 2022
 * gas crisis) because `gasInStorage / workingGasVolume` can exceed nominal
 * working volume. Rescaling the ramp to the observed maximum would make every
 * ordinary country paler to accommodate a handful of outliers; clamping keeps
 * "full" meaning full. The tooltip still reports the true figure.
 */
export function gasStorageRampT(pct: number): number {
  if (!Number.isFinite(pct) || pct <= 0) return 0;
  return Math.min(1, pct / 100);
}

/** Fill colour for a storage fullness percentage; null/undefined → no-data grey. */
export function gasStorageColor(pct: number | null | undefined): Rgba {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) {
    return GAS_STORAGE_NO_DATA_COLOR;
  }
  const [r, g, b] = lerpRgb(GAS_STORAGE_LOW, GAS_STORAGE_HIGH, gasStorageRampT(pct));
  return [Math.round(r), Math.round(g), Math.round(b), GAS_STORAGE_ALPHA];
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
// US shale regions (EIA STEO)
// ---------------------------------------------------------------------------

const SHALE_RAMP: Readonly<Record<"oil" | "gas", readonly [Rgb, Rgb]>> = {
  oil: [hex(PALETTE.shaleOilLow), hex(PALETTE.shaleOilHigh)],
  gas: [hex(PALETTE.shaleGasLow), hex(PALETTE.shaleGasHigh)],
};
const SHALE_ALPHA = 200;

/** A region-year EIA does not report (before 2009) — outline only, faint fill. */
export const SHALE_NO_DATA_COLOR: Rgba = paletteRgba("noData", 70);
export const SHALE_OUTLINE: Rgba = paletteRgba("basin", 220);
export const SHALE_OUTLINE_MIN_PX = 1;

/**
 * Ramp position for a region's output, square-root scaled against the largest
 * value of that commodity across all regions and years. A fixed anchor makes
 * growth visible across a pinned link's year (the Permian darkening 2010 →
 * 2024); square root keeps the smaller regions distinguishable beside the
 * Permian, which alone is about half of US crude.
 */
export function shaleRampT(value: number, max: number): number {
  if (!Number.isFinite(value) || value <= 0 || !(max > 0)) return 0;
  return Math.min(1, Math.sqrt(value / max));
}

export function shaleRampColor(t: number, commodity: "oil" | "gas"): Rgba {
  const [lo, hi] = SHALE_RAMP[commodity];
  const [r, g, b] = lerpRgb(lo, hi, t);
  return [Math.round(r), Math.round(g), Math.round(b), SHALE_ALPHA];
}

export function shaleRegionColor(value: number | null, max: number, commodity: "oil" | "gas"): Rgba {
  if (value === null || !Number.isFinite(value)) return SHALE_NO_DATA_COLOR;
  return shaleRampColor(shaleRampT(value, max), commodity);
}

// ---------------------------------------------------------------------------
// Recent imports (UN Comtrade, as reported)
// ---------------------------------------------------------------------------

const IMPORTS_RAMP: Readonly<Record<"oil" | "gas", readonly [Rgb, Rgb]>> = {
  oil: [hex(PALETTE.importsOilLow), hex(PALETTE.importsOilHigh)],
  gas: [hex(PALETTE.importsGasLow), hex(PALETTE.importsGasHigh)],
};
const IMPORTS_ALPHA = 215;
/** Fewer than 12 of 12 months reported: the lowest ramp step, faint, whatever the partial sum. */
const IMPORTS_INCOMPLETE_ALPHA = 110;

/** No monthly Comtrade reports (China, Taiwan …) — not the same as zero imports. */
export const IMPORTS_NO_DATA_COLOR: Rgba = paletteRgba("noData", 90);

export function recentImportsRampColor(t: number, commodity: "oil" | "gas", alpha = IMPORTS_ALPHA): Rgba {
  const [lo, hi] = IMPORTS_RAMP[commodity];
  const [r, g, b] = lerpRgb(lo, hi, Math.min(1, Math.max(0, t)));
  return [Math.round(r), Math.round(g), Math.round(b), alpha];
}

/**
 * Square-root ramp against the largest complete total. An incomplete window
 * is not placed on the ramp at all — a partial sum would read as a small
 * importer — and gets its own faint fill instead.
 */
export function recentImportsColor(
  mt: number | null,
  max: number,
  commodity: "oil" | "gas",
  complete: boolean,
): Rgba {
  if (mt === null || !Number.isFinite(mt)) return IMPORTS_NO_DATA_COLOR;
  if (!complete) return recentImportsRampColor(0.15, commodity, IMPORTS_INCOMPLETE_ALPHA);
  return recentImportsRampColor(max > 0 && mt > 0 ? Math.sqrt(mt / max) : 0, commodity);
}

// ---------------------------------------------------------------------------
// Focus (selected country)
// ---------------------------------------------------------------------------

/**
 * Outline of the focused country: a **cased** line — a white halo with a
 * near-black line on top — drawn above the choropleth fills and below the
 * point layers, so it frames the ground without hiding the marks on it.
 *
 * The casing is not decoration. One colour cannot clear 3:1 on both the pale
 * basemap and the darkest fill the map can paint (a fully exposed country
 * under a scenario is near-`#990000`): a dark line vanishes on the latter, a
 * light one on the former. With a casing, whichever of the two reads is the
 * one you see, and the pair reads against each other — which is what
 * `symbology-contrast.test.ts` checks.
 *
 * Both are heavier than the basemap's own 0.5 px country borders, so the
 * selection cannot be mistaken for another administrative line.
 */
export const FOCUS_OUTLINE_COLOR: Rgba = paletteRgba("focusOutline", 255);
export const FOCUS_OUTLINE_MIN_PX = 2.5;
export const FOCUS_HALO_COLOR: Rgba = paletteRgba("focusHalo", 235);
export const FOCUS_HALO_MIN_PX = 6;

// ---------------------------------------------------------------------------
// Transient hover highlight (S1: a ranked panel row ↔ the map)
// ---------------------------------------------------------------------------

/**
 * Hovering a ranked importer row lights its country up. Deliberately *not* a
 * second coloured outline: a white wash plus a thin dark edge reads as
 * "pointing at this" where the focus outline's heavy cased line reads as
 * "this is selected", and the two can be on screen at once without either
 * being mistaken for the other. The wash carries most of the signal over the
 * dark exposure fills (where a dark line would vanish); the edge carries it
 * on the pale basemap.
 */
export const HOVER_FILL: Rgba = paletteRgba("focusHalo", 86);
export const HOVER_OUTLINE_COLOR: Rgba = paletteRgba("focusOutline", 200);
export const HOVER_OUTLINE_MIN_PX = 1.5;
/** Ring drawn around a hovered refinery / LNG terminal row's asset. */
export const HOVER_RING_RADIUS_PX = 11;
export const HOVER_RING_WIDTH_PX = 2;

// ---------------------------------------------------------------------------
// Disruption mark + cut route (S1)
// ---------------------------------------------------------------------------

export const DISRUPTION_COLOR: Rgba = paletteRgba("disruptionMark", 255);
export const DISRUPTION_MUTED_COLOR: Rgba = paletteRgba("disruptionMuted", 235);
/** White casing under every part of the mark, so it reads over water too. */
export const DISRUPTION_HALO_COLOR: Rgba = paletteRgba("focusHalo", 235);
/** Translucent white inside the ring, so the ring is a ring and not a blob. */
export const DISRUPTION_FILL_COLOR: Rgba = paletteRgba("focusHalo", 170);

/** Closure glyph: halo disc, ring, centre dot — all in screen pixels. */
export const DISRUPTION_MARK = {
  haloRadiusPx: 14,
  ringRadiusPx: 10.5,
  ringWidthPx: 3.5,
  dotRadiusPx: 3.5,
} as const;

/** The cut stretch of a pipeline: a heavy white casing under a vivid red line. */
export const DISRUPTION_CUT_CASING_PX = 6;
export const DISRUPTION_CUT_LINE_PX = 2.5;

/** The mark's colour for a year the scenario describes (or does not). */
export function disruptionColor(active: boolean): Rgba {
  return active ? DISRUPTION_COLOR : DISRUPTION_MUTED_COLOR;
}

// ---------------------------------------------------------------------------
// Search result highlight (S4)
// ---------------------------------------------------------------------------

/**
 * A cased ring (white halo + violet line), same reasoning as the focus
 * outline: one colour cannot clear 3:1 on both the pale basemap and the
 * darkest scenario fill. Not part of `LEGEND` — it is transient UI, not a
 * data layer a reader toggles.
 */
export const SEARCH_HIGHLIGHT_COLOR: Rgba = paletteRgba("searchHighlight", 255);
export const SEARCH_HIGHLIGHT_HALO_COLOR: Rgba = paletteRgba("searchHighlightHalo", 235);
export const SEARCH_HIGHLIGHT_LINE_MIN_PX = 3;
export const SEARCH_HIGHLIGHT_HALO_LINE_MIN_PX = 6;
export const SEARCH_HIGHLIGHT_RADIUS = { minPixels: 14, maxPixels: 26 } as const;

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
// Trade flows (BACI arcs)
// ---------------------------------------------------------------------------

const TRADE_FLOW_RGB: Record<"oil" | "gas", { from: Rgb; to: Rgb }> = {
  oil: { from: hex(PALETTE.tradeFlowOilFrom), to: hex(PALETTE.tradeFlowOilTo) },
  gas: { from: hex(PALETTE.tradeFlowGasFrom), to: hex(PALETTE.tradeFlowGasTo) },
};

/**
 * Opacity of the arc. World view (many overlapping top-N pairs) stays
 * translucent so density itself reads as volume, the way the LNG voyage
 * arcs do; focus view (a handful of pairs for one country) is more opaque so
 * each one reads as a distinct flow.
 */
export const TRADE_FLOW_ALPHA = { world: 150, focus: 225 } as const;

export function tradeFlowSourceColor(
  commodity: "oil" | "gas",
  mode: "world" | "focus" = "world",
): Rgba {
  const [r, g, b] = TRADE_FLOW_RGB[commodity].from;
  return [r, g, b, TRADE_FLOW_ALPHA[mode]];
}
export function tradeFlowTargetColor(
  commodity: "oil" | "gas",
  mode: "world" | "focus" = "world",
): Rgba {
  const [r, g, b] = TRADE_FLOW_RGB[commodity].to;
  return [r, g, b, TRADE_FLOW_ALPHA[mode]];
}

export const TRADE_FLOW_WIDTH = { minPixels: 0.5, maxPixels: 6 } as const;

/**
 * Arc widths are in pixels, so they do not shrink as you zoom in — but the
 * arcs all converge on one country anchor, and by the time a focused country
 * fills the screen a hundred 6 px ribbons have fused into a solid wedge
 * (Wave 2 polish 1). The cap tapers from `maxPixels` at world zoom to
 * `closeMaxPixels` at street zoom, where the arcs are a bundle of threads
 * leaving the country rather than a shape.
 */
export const TRADE_FLOW_WIDTH_TAPER = { fromZoom: 3, toZoom: 6, closeMaxPixels: 2 } as const;

/** The width cap in pixels at `zoom`. */
export function tradeFlowMaxWidth(zoom: number): number {
  const { fromZoom, toZoom, closeMaxPixels } = TRADE_FLOW_WIDTH_TAPER;
  const wide = TRADE_FLOW_WIDTH.maxPixels;
  if (!Number.isFinite(zoom) || zoom <= fromZoom) return wide;
  if (zoom >= toZoom) return closeMaxPixels;
  const t = (zoom - fromZoom) / (toZoom - fromZoom);
  return wide + (closeMaxPixels - wide) * t;
}

/**
 * Square-root width against the largest pair drawn, so the top pair does not
 * swamp the rest, capped at `maxPixels` (zoom-dependent — see
 * {@link tradeFlowMaxWidth}).
 */
export function tradeFlowWidth(
  qty: number,
  maxQty: number,
  maxPixels: number = TRADE_FLOW_WIDTH.maxPixels,
): number {
  if (!(maxQty > 0) || !(qty > 0)) return TRADE_FLOW_WIDTH.minPixels;
  return Math.max(TRADE_FLOW_WIDTH.minPixels, Math.sqrt(qty / maxQty) * maxPixels);
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

/**
 * Mirrors `ScenarioDef["kind"]`. Declared here rather than imported so the
 * symbology module keeps no dependency on the scenario registry; the two are
 * tied together by `tests/unit/symbology.test.ts`.
 */
export type ScenarioKind = "chokepoint" | "pipeline";

const RESERVES_LEGEND_STOPS: readonly Rgba[] = [0, 0.25, 0.5, 0.75, 1].map((t) => reservesRampColor(t));
const SHALE_OIL_LEGEND_STOPS: readonly Rgba[] = [0, 0.25, 0.5, 0.75, 1].map((t) => shaleRampColor(t, "oil"));
const SHALE_GAS_LEGEND_STOPS: readonly Rgba[] = [0, 0.25, 0.5, 0.75, 1].map((t) => shaleRampColor(t, "gas"));
const IMPORTS_OIL_LEGEND_STOPS: readonly Rgba[] = [0, 0.25, 0.5, 0.75, 1].map((t) => recentImportsRampColor(t, "oil"));
const IMPORTS_GAS_LEGEND_STOPS: readonly Rgba[] = [0, 0.25, 0.5, 0.75, 1].map((t) => recentImportsRampColor(t, "gas"));
const GAS_STORAGE_LEGEND_STOPS: readonly Rgba[] = [0, 25, 50, 75, 100].map((p) => gasStorageColor(p));

/**
 * Legend rows per layer toggle. "size = capacity" is claimed only where
 * capacity drives size and is mostly populated (LNG 99 %); refineries say
 * "where known" (~15 %); ports/storage/extraction make no size claim.
 */
export const LEGEND: Readonly<Record<LayerKey, readonly LegendItem[]>> = {
  reserves: [
    {
      // The year is stated here because there is no year control any more: the
      // EI Statistical Review has not published reserves since 2020, so this
      // ramp is a 2020 reading whatever else on the map is newer.
      label: `Proved reserves to ${String(RESERVES_LATEST_YEAR)}, low → high (log)`,
      swatch: { kind: "gradient", stops: RESERVES_LEGEND_STOPS },
    },
    { label: "No reserves data in source", swatch: { kind: "fill", color: RESERVES_NO_DATA_COLOR } },
  ],
  gas_storage: [
    { label: "Gas storage 0 → 100 % full", swatch: { kind: "gradient", stops: GAS_STORAGE_LEGEND_STOPS } },
    { label: "Not reported to GIE", swatch: { kind: "fill", color: GAS_STORAGE_NO_DATA_COLOR } },
  ],
  shale_regions: [
    { label: "US shale region crude output (oil view)", swatch: { kind: "gradient", stops: SHALE_OIL_LEGEND_STOPS } },
    { label: "US shale region gas output (gas view)", swatch: { kind: "gradient", stops: SHALE_GAS_LEGEND_STOPS } },
    { label: "No EIA data for the year", swatch: { kind: "fill", color: SHALE_NO_DATA_COLOR, outline: SHALE_OUTLINE } },
  ],
  recent_imports: [
    { label: "Crude imports, latest 12 months (oil view)", swatch: { kind: "gradient", stops: IMPORTS_OIL_LEGEND_STOPS } },
    { label: "LNG imports, latest 12 months (gas view)", swatch: { kind: "gradient", stops: IMPORTS_GAS_LEGEND_STOPS } },
    { label: "Fewer than 12 months reported", swatch: { kind: "fill", color: recentImportsRampColor(0.15, "oil", 110) } },
    { label: "No monthly reports to UN Comtrade", swatch: { kind: "fill", color: IMPORTS_NO_DATA_COLOR } },
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
  trade_flows: [
    {
      label: "Crude trade (oil view), top 150 pairs by volume (typically ~85–90% of world crude)",
      swatch: { kind: "arc", from: tradeFlowSourceColor("oil"), to: tradeFlowTargetColor("oil") },
    },
    {
      label: "LNG trade (gas view), top 150 pairs by volume (typically ~95%+ of world LNG)",
      swatch: { kind: "arc", from: tradeFlowSourceColor("gas"), to: tradeFlowTargetColor("gas") },
    },
    {
      label: "With a country selected: every flow of its trade above 0.1%, exports and imports both",
      swatch: { kind: "arc", from: tradeFlowSourceColor("oil", "focus"), to: tradeFlowTargetColor("oil", "focus") },
    },
  ],
};

/** Legend sections, grouped by commodity (reserves first, then oil, gas, shared). */
export const LEGEND_GROUPS: readonly { readonly title: string; readonly keys: readonly LayerKey[] }[] = [
  { title: "Reserves & geology", keys: ["reserves", "basins", "shale_regions"] },
  { title: "Oil", keys: ["pipelines", "extraction", "refineries", "storage"] },
  { title: "Gas", keys: ["gas_pipelines", "lng_terminals", "lng_voyages", "gas_storage"] },
  { title: "Shipping", keys: ["ports"] },
  { title: "Trade", keys: ["recent_imports", "trade_flows"] },
];

/** Which side of a scenario's flows a panel is listing (T1's `view`). */
export type ScenarioSide = "importers" | "exporters";

/**
 * Extra rows shown while a scenario is active. With `layers`, asset rows are
 * limited to layers that can show them (refineries / LNG terminals).
 */
export function scenarioLegend(
  importsNoun: string,
  layers?: LayerState,
  /** The active scenario's kind — adds the row for the mark the map draws (S1). */
  kind?: ScenarioKind,
  /**
   * T1: which side the panel and the choropleth describe. The *asset* tint
   * never changes with it — refineries and LNG import terminals are
   * importer-side by construction — so in the exporter view the row says so
   * rather than letting the reader take it for part of the exporter ramp
   * (finding 9).
   */
  view?: ScenarioSide,
): readonly LegendItem[] {
  const assets = layers === undefined || layers.refineries || layers.lng_terminals;
  const lng = layers === undefined || layers.lng_terminals;
  return [
    ...(kind === undefined
      ? []
      : kind === "pipeline"
        ? [
            {
              label: "Cut route (the pipeline this scenario closes)",
              swatch: { kind: "line", color: DISRUPTION_COLOR, width: DISRUPTION_CUT_LINE_PX } as const,
            },
            {
              label: "Closure point on the route",
              swatch: { kind: "dot", color: DISRUPTION_COLOR, outline: DISRUPTION_HALO_COLOR, size: 10 } as const,
            },
          ]
        : [
            {
              label: "Closed chokepoint",
              swatch: { kind: "dot", color: DISRUPTION_COLOR, outline: DISRUPTION_HALO_COLOR, size: 10 } as const,
            },
          ]),
    {
      label: `Share of ${importsNoun} at risk (0 → 100 %)`,
      swatch: { kind: "gradient", stops: EXPOSURE_LEGEND_STOPS },
    },
    ...(assets
      ? [
          {
            label:
              view === "exporters"
                ? "Asset at risk — importer side (darker = larger share)"
                : "Asset at risk (darker = larger share)",
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
  scenarioKind?: ScenarioKind,
  /** T1: the side the scenario panel is listing (see `scenarioLegend`). */
  scenarioView?: ScenarioSide,
): LegendSection[] {
  const sections: LegendSection[] = LEGEND_GROUPS.map((g) => ({
    title: g.title,
    items: g.keys.filter((k) => layers[k]).flatMap((k) => rowsFor(k, zoom)),
  })).filter((s) => s.items.length > 0);
  if (scenarioNoun !== undefined) {
    sections.push({
      title: "Scenario",
      items: scenarioLegend(scenarioNoun, layers, scenarioKind, scenarioView),
    });
  }
  return sections;
}
