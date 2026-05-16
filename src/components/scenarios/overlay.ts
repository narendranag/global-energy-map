import type { LngImportImpact, RefineryImpact, ScenarioResult } from "@/lib/scenarios/types";

export function importerOverlay(r: ScenarioResult | null) {
  if (!r) return undefined;
  const m = new Map<string, { color: readonly [number, number, number, number]; tooltip: string }>();
  for (const imp of r.byImporter) {
    const t = imp.shareAtRisk;
    const red = Math.round(80 + 175 * t);
    m.set(imp.iso3, {
      color: [red, 30, 30, 220] as const,
      tooltip: `${imp.iso3}: ${(t * 100).toFixed(1)}% of crude imports at risk`,
    });
  }
  return m;
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
