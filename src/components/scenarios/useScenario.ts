"use client";
import { useMemo } from "react";
import { computeScenarioImpact } from "@/lib/scenarios/engine";
import type {
  Commodity,
  LngImportRow,
  RefineryImpact,
  RefineryRow,
  ScenarioId,
  ScenarioResult,
} from "@/lib/scenarios/types";
import type { AssetsByKind } from "@/lib/data/assets";
import { loadScenarioInputs, type ScenarioInputs } from "@/lib/data/scenario-inputs";
import { useAsync } from "@/lib/data/useAsync";

/** Engine rows from shared asset rows; unknown capacity → 0 (engine spreads uniformly). */
function refineryRows(assets: AssetsByKind): RefineryRow[] {
  return assets.refinery.map((r) => ({
    asset_id: r.asset_id,
    country_iso3: r.country_iso3,
    capacity: r.capacity ?? 0,
  }));
}

function lngImportRows(assets: AssetsByKind): LngImportRow[] {
  return assets.lngImport.map((t) => ({
    asset_id: t.asset_id,
    country_iso3: t.country_iso3,
    capacity: t.capacity ?? 0,
    name: t.name,
  }));
}

/**
 * Run the pure engine on loaded inputs + shared asset rows, and attach
 * refinery names (the engine's RefineryImpact carries none) so the panel can
 * show "Ruwais Refinery" rather than "ARE · 0 kbpd".
 */
export function scenarioFromInputs(inputs: ScenarioInputs, assets: AssetsByKind): ScenarioResult {
  const isOil = inputs.commodity === "oil";
  const raw = computeScenarioImpact({
    scenarioId: inputs.scenarioId,
    commodity: inputs.commodity,
    year: inputs.year,
    tradeFlows: inputs.tradeFlows,
    routes: inputs.routes,
    ...(isOil ? { refineries: refineryRows(assets) } : { lngImports: lngImportRows(assets) }),
    ...(inputs.lngVoyages.length > 0 ? { lngVoyages: inputs.lngVoyages } : {}),
  });
  if (!isOil) return raw;

  const nameById = new Map(assets.refinery.map((r) => [r.asset_id, r.name]));
  const withName = (i: RefineryImpact): RefineryImpact => {
    const name = nameById.get(i.asset_id);
    return name !== undefined && name.length > 0 ? { ...i, name } : i;
  };
  const byRefinery = raw.byRefinery.map(withName);
  const byId = new Map(byRefinery.map((i) => [i.asset_id, i]));
  return {
    ...raw,
    byRefinery,
    rankedRefineries: raw.rankedRefineries.map((i) => byId.get(i.asset_id) ?? i),
  };
}

/**
 * Scenario result for (scenario, year, commodity), or null while inputs or
 * asset rows load. The trade / route / voyage queries run in parallel and are
 * cached; refinery and LNG terminal rows come from `useAssets()` rather than
 * a second scan of assets.parquet. The result may briefly lag the request —
 * compare its scenarioId/year/commodity to know whether it is current.
 */
export function useScenario(
  scenarioId: ScenarioId | null,
  year: number,
  commodity: Commodity,
  assets: AssetsByKind | null,
): ScenarioResult | null {
  const { data: inputs } = useAsync(
    loadScenarioInputs,
    scenarioId === null ? null : [scenarioId, year, commodity],
  );
  return useMemo(() => {
    if (scenarioId === null || inputs === null || assets === null) return null;
    return scenarioFromInputs(inputs, assets);
  }, [scenarioId, inputs, assets]);
}
