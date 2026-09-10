import type {
  Commodity,
  ImporterImpact,
  LngImportImpact,
  RefineryImpact,
  ScenarioResult,
} from "@/lib/scenarios/types";
import { getScenario } from "@/lib/scenarios/registry";

export type Rgba = readonly [number, number, number, number];

export interface OverlayEntry {
  /** Undefined = no override; the country keeps its base (reserves) fill. */
  readonly color?: Rgba;
  readonly tooltip: string;
}

// Sequential red ramp (ColorBrewer "Reds" end-points): light salmon at low
// exposure → dark red at full exposure. Alpha rises with exposure so small
// shares read as a faint tint and large shares as a solid fill.
const LOW: readonly [number, number, number] = [252, 187, 161]; // #fcbba1
const HIGH: readonly [number, number, number] = [153, 0, 13]; // #99000d
const ALPHA_MIN = 40;
const ALPHA_MAX = 240;

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
  const lerp = (a: number, b: number) => a + (b - a) * u;
  return [
    lerp(LOW[0], HIGH[0]),
    lerp(LOW[1], HIGH[1]),
    lerp(LOW[2], HIGH[2]),
    lerp(ALPHA_MIN, ALPHA_MAX),
  ];
}

export function importsNoun(commodity: Commodity): string {
  return commodity === "gas" ? "LNG imports" : "crude imports";
}

export function importerOverlay(
  r: ScenarioResult | null,
  commodity: Commodity,
): ReadonlyMap<string, OverlayEntry> | undefined {
  if (!r) return undefined;
  const route = getScenario(r.scenarioId).routeName;
  const noun = importsNoun(commodity);
  const m = new Map<string, OverlayEntry>();
  for (const imp of r.byImporter) {
    const t = imp.shareAtRisk;
    const color = exposureColor(t);
    const tooltip = `Scenario: ${(t * 100).toFixed(1)}% of ${r.year.toString()} ${noun} routed through ${route}`;
    m.set(imp.iso3, color ? { color, tooltip } : { tooltip });
  }
  return m;
}

/**
 * Ranked importer list for the scenario panel, ordered by the number the panel
 * displays (shareAtRisk), with volume at risk as the tie-break.
 *
 *  - `isKnownCountry` drops pseudo-country codes (BACI aggregates such as
 *    `S19`) that are not real ISO3 countries.
 *  - `minShareOfWorld` is a materiality floor: importers whose total imports
 *    are below this fraction of all imports in the scenario year are omitted,
 *    so a 200-tonne importer at 70 % does not outrank Japan.
 *  - Zero-exposure importers are omitted.
 */
export function rankImportersByShare(
  importers: readonly ImporterImpact[],
  isKnownCountry: (iso3: string) => boolean,
  minShareOfWorld = 0.001,
): ImporterImpact[] {
  const world = importers.reduce((s, i) => s + i.totalQty, 0);
  const floor = world * minShareOfWorld;
  return importers
    .filter((i) => i.shareAtRisk > 0 && i.totalQty >= floor && isKnownCountry(i.iso3))
    .sort((a, b) => b.shareAtRisk - a.shareAtRisk || b.atRiskQty - a.atRiskQty);
}

/** Asset rows (refineries / LNG import terminals) ranked by displayed share. */
/**
 * Rank refineries / LNG import terminals by capacity at risk (share × capacity).
 * Assets without a known capacity are omitted: ranking them by share alone let
 * tiny or duplicated plants with no capacity data (e.g. three NETL rows for the
 * same Myanmar refinery) fill the list at 100%.
 */
export function rankAssetsByCapacityAtRisk<
  T extends { shareAtRisk: number; capacity: number | null | undefined },
>(assets: readonly T[]): T[] {
  const capAtRisk = (a: T) => a.shareAtRisk * (a.capacity ?? 0);
  return assets
    .filter((a) => a.shareAtRisk > 0 && (a.capacity ?? 0) > 0)
    .sort((a, b) => capAtRisk(b) - capAtRisk(a));
}

export function refineryImpactMap(r: ScenarioResult | null): ReadonlyMap<string, RefineryImpact> | undefined {
  if (!r) return undefined;
  const m = new Map<string, RefineryImpact>();
  for (const imp of r.byRefinery) m.set(imp.asset_id, imp);
  return m;
}

export function lngImportImpactMap(
  result: ScenarioResult | null,
): ReadonlyMap<string, LngImportImpact> | undefined {
  if (!result || result.byLngImport.length === 0) return undefined;
  return new Map(result.byLngImport.map((i) => [i.asset_id, i]));
}

/**
 * Phase 6: Builds a map keyed by terminal name → LngImportImpact,
 * for use by LngVoyagesLayer to colour arcs by scenario exposure.
 *
 * The layer joins on `to_terminal` (the raw LNG-T3 terminal name), so the
 * map must be keyed by that same name (LngImportImpact.name), not
 * asset_id. The arc's getSourceColor / getTargetColor callbacks look up
 * by d.to_terminal and fall back gracefully to no-tint.
 */
export function lngVoyageImpactByTerminalName(
  scenario: ScenarioResult | null,
): ReadonlyMap<string, LngImportImpact> | undefined {
  if (!scenario || scenario.byLngImport.length === 0) return undefined;
  const out = new Map<string, LngImportImpact>();
  for (const impact of scenario.byLngImport) {
    out.set(impact.name, impact);
  }
  return out;
}
