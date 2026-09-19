import type {
  Commodity,
  ImporterImpact,
  LngImportImpact,
  RefineryImpact,
  ScenarioResult,
} from "@/lib/scenarios/types";
import { polygonIso3 } from "@/lib/geo/iso3";
import { getScenario } from "@/lib/scenarios/registry";
import { scenarioIdsOf } from "@/lib/scenarios/shares";
import { exposureColor, type Rgba } from "@/lib/symbology";
import type { ScenarioView } from "@/lib/url-state/encode";

export interface OverlayEntry {
  /** Undefined = no override; the country keeps its base (reserves) fill. */
  readonly color?: Rgba;
  readonly tooltip: string;
}

export function importsNoun(commodity: Commodity): string {
  return commodity === "gas" ? "LNG imports" : "crude imports";
}

/** Importers below this fraction of world imports are neither ranked nor shaded. */
export const MIN_SHARE_OF_WORLD = 0.001;

export function exportsNoun(commodity: Commodity): string {
  return commodity === "gas" ? "LNG exports" : "crude exports";
}

/** T1: the noun for the side the panel and overlay are describing. */
export function sideNoun(commodity: Commodity, view: ScenarioView): string {
  return view === "exporters" ? exportsNoun(commodity) : importsNoun(commodity);
}

/**
 * The routes a result covers, as one phrase: "the Strait of Hormuz" or
 * "the Strait of Hormuz and the Strait of Malacca".
 */
export function routeNamesOf(r: ScenarioResult): string {
  const names = scenarioIdsOf(r).map((id) => getScenario(id).routeName);
  return names.length <= 1
    ? names[0] ?? ""
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1] ?? ""}`;
}

/**
 * The country fills a scenario paints.
 *
 * T1 makes the *side* an argument. In the exporter view the same ramp shades
 * the countries that lose the outlet rather than the ones that lose the
 * supply — the same numbers read the other way round, from the same rows
 * (Σ exporter at-risk ≡ Σ importer at-risk), so the legend only has to change
 * its noun.
 */
export function scenarioOverlay(
  r: ScenarioResult | null,
  commodity: Commodity,
  view: ScenarioView = "importers",
): ReadonlyMap<string, OverlayEntry> | undefined {
  if (!r) return undefined;
  const route = routeNamesOf(r);
  const exporters = view === "exporters";
  const noun = sideNoun(commodity, view);
  const rows = exporters ? r.byExporter ?? [] : r.byImporter;
  // Same materiality floor as the ranked list: a country importing a few
  // hundred tonnes at 100 % would otherwise paint as dark as Pakistan.
  const world = rows.reduce((sum, i) => sum + i.totalQty, 0);
  const floor = world * MIN_SHARE_OF_WORLD;
  // Keyed by the *polygon* code: the choropleth looks entries up by
  // `feature.properties.iso3`, and Natural Earth spells South Sudan SDS and
  // Palestine PSX where the trade data says SSD / PSE (A2).
  const m = new Map<string, OverlayEntry>();
  const severity = r.severity ?? 1;
  const cut = severity < 1 ? `, ${(severity * 100).toFixed(0)}% cut` : "";
  for (const imp of rows) {
    const iso3 = polygonIso3(imp.iso3);
    const t = imp.shareAtRisk;
    const base = `Scenario: ${(t * 100).toFixed(1)}% of ${r.year.toString()} ${noun} routed through ${route}${cut}`;
    if (imp.totalQty < floor) {
      m.set(iso3, { tooltip: `${base} (negligible volume, under 0.1% of world ${noun}; not shaded)` });
      continue;
    }
    const color = exposureColor(t);
    m.set(iso3, color ? { color, tooltip: base } : { tooltip: base });
  }
  return m;
}

/** Back-compat name: the importer-side overlay. */
export function importerOverlay(
  r: ScenarioResult | null,
  commodity: Commodity,
): ReadonlyMap<string, OverlayEntry> | undefined {
  return scenarioOverlay(r, commodity, "importers");
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
export function rankImportersByShare<T extends ImporterImpact>(
  importers: readonly T[],
  isKnownCountry: (iso3: string) => boolean,
  minShareOfWorld = MIN_SHARE_OF_WORLD,
): T[] {
  const world = importers.reduce((s, i) => s + i.totalQty, 0);
  const floor = world * minShareOfWorld;
  return importers
    // `isKnownCountry` speaks polygon codes; the impact rows speak the data's
    // (A2), so South Sudan used to be filtered out of the ranking entirely.
    .filter((i) => i.shareAtRisk > 0 && i.totalQty >= floor && isKnownCountry(polygonIso3(i.iso3)))
    .sort((a, b) => b.shareAtRisk - a.shareAtRisk || b.atRiskQty - a.atRiskQty);
}

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
