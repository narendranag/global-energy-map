import { ScatterplotLayer } from "@deck.gl/layers";
import type { RefineryAsset } from "@/lib/data/assets";
import { sourceLine } from "@/lib/data/sources";
import type { RefineryImpact } from "@/lib/scenarios/types";
import {
  REFINERY_LINE,
  REFINERY_RADIUS,
  refineryColor,
  refineryRadius,
} from "@/lib/symbology";
import { formatCapacity, joinLines, orNa, pct, type TooltipFormatter } from "./tooltip";

export const REFINERIES_LAYER_ID = "refineries";

/** Refineries; fill turns red with the active scenario's share at risk. */
export function buildRefineriesLayer(
  rows: readonly RefineryAsset[],
  impactByAssetId?: ReadonlyMap<string, RefineryImpact>,
): ScatterplotLayer<RefineryAsset> {
  return new ScatterplotLayer<RefineryAsset>({
    id: REFINERIES_LAYER_ID,
    data: rows,
    getPosition: (d) => [d.lon, d.lat],
    // Capacity in kbpd; ~85 % of rows have none and get the base radius.
    getRadius: (d) => refineryRadius(d.capacity),
    radiusUnits: "meters",
    radiusMinPixels: REFINERY_RADIUS.minPixels,
    radiusMaxPixels: REFINERY_RADIUS.maxPixels,
    getFillColor: (d) => [...refineryColor(impactByAssetId?.get(d.asset_id)?.shareAtRisk)],
    stroked: true,
    getLineColor: [...REFINERY_LINE],
    lineWidthMinPixels: 0.5,
    pickable: true,
    updateTriggers: { getFillColor: [impactByAssetId] },
  });
}

export const formatRefineryTooltip: TooltipFormatter<RefineryAsset> = (o, ctx) => {
  const impact = ctx.refineryImpacts?.get(o.asset_id);
  const scenarioLines: string[] = [];
  if (impact && impact.topSources.length > 0) {
    scenarioLines.push("", `Historical top sources, ${(ctx.scenario?.year ?? ctx.year).toString()} (capacity-weighted, t):`);
    for (const s of impact.topSources) scenarioLines.push(`  ${s.iso3}: ${s.qty.toFixed(1)}`);
    if (impact.shareAtRisk > 0) {
      scenarioLines.push("", `At-risk under scenario: ${pct(impact.shareAtRisk)}`);
    }
  } else if (impact) {
    scenarioLines.push("", "Country runs primarily domestic crude — feedstock model not informative.");
  }
  return joinLines(
    `Refinery: ${o.name}`,
    `Country: ${o.country_iso3}`,
    `Operator: ${orNa(o.operator)}`,
    `Capacity: ${formatCapacity(o.capacity, o.capacity_unit ?? "kbpd")}`,
    sourceLine("refineries", o.source),
    ...scenarioLines,
  );
};
