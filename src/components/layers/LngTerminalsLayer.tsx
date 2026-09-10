import { IconLayer } from "@deck.gl/layers";
import type { LngTerminalAsset } from "@/lib/data/assets";
import { sourceLine } from "@/lib/data/sources";
import type { LngImportImpact } from "@/lib/scenarios/types";
import { isVisibleAtYear } from "@/lib/vintage/filter";
import {
  LNG_TERMINAL_SIZE,
  LNG_TRIANGLE_POINTS,
  LNG_TRIANGLE_STROKE,
  lngTerminalColor,
  lngTerminalSize,
} from "@/lib/symbology";
import { formatCapacity, joinLines, orNa, type TooltipFormatter } from "./tooltip";

export const LNG_TERMINALS_LAYER_ID = "lng-terminals";

// Triangle glyphs rendered to a data URI (no sprite asset): filled = export,
// hollow = import. mask=true so getColor tints them.
const ICON_ATLAS =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="32" viewBox="0 0 64 32">
  <polygon points="${LNG_TRIANGLE_POINTS}" fill="white"/>
  <g transform="translate(32 0)"><polygon points="${LNG_TRIANGLE_POINTS}" fill="none" stroke="white" stroke-width="${LNG_TRIANGLE_STROKE.toString()}"/></g>
</svg>
`);

const ICON_MAPPING = {
  lng_export: { x: 0, y: 0, width: 32, height: 32, anchorX: 16, anchorY: 28, mask: true },
  lng_import: { x: 32, y: 0, width: 32, height: 32, anchorX: 16, anchorY: 28, mask: true },
} as const;

/** LNG terminals commissioned by `year` (undated always show), tinted by scenario impact. */
export function buildLngTerminalsLayer(
  rows: readonly LngTerminalAsset[],
  year: number,
  impactByAssetId?: ReadonlyMap<string, LngImportImpact>,
): IconLayer<LngTerminalAsset> {
  return new IconLayer<LngTerminalAsset>({
    id: LNG_TERMINALS_LAYER_ID,
    data: rows.filter((r) => isVisibleAtYear(r.commissioned_year, year)),
    iconAtlas: ICON_ATLAS,
    iconMapping: ICON_MAPPING,
    getIcon: (d) => d.kind,
    getPosition: (d) => [d.lon, d.lat],
    getSize: (d) => lngTerminalSize(d.capacity),
    sizeUnits: "pixels",
    sizeMinPixels: LNG_TERMINAL_SIZE.minPixels,
    sizeMaxPixels: LNG_TERMINAL_SIZE.maxPixels,
    getColor: (d) => [...lngTerminalColor(impactByAssetId?.get(d.asset_id))],
    pickable: true,
    updateTriggers: { getColor: [impactByAssetId] },
  });
}

export const formatLngTerminalTooltip: TooltipFormatter<LngTerminalAsset> = (o, ctx) => {
  const impact = ctx.lngImpacts?.get(o.asset_id);
  const kind = o.kind === "lng_export" ? "LNG export terminal" : "LNG import terminal";
  const scenarioLines: string[] = [];
  if (impact) {
    if (impact.coverage === "none") {
      scenarioLines.push("", `No measured voyages to this terminal in ${(ctx.scenario?.year ?? ctx.year).toString()}`);
    } else if (impact.topSources.length > 0) {
      scenarioLines.push("", "Historical top sources (t/yr):");
      for (const s of impact.topSources) scenarioLines.push(`  ${s.iso3}: ${s.qty.toFixed(1)}`);
      if (impact.shareAtRisk > 0) {
        scenarioLines.push("", `At-risk under scenario: ${(impact.shareAtRisk * 100).toFixed(1)}%`);
      }
    }
    if (impact.coverage === "measured") {
      scenarioLines.push("", "Attribution: measured voyages (LNG-T3), scaled to BACI country total");
    } else if (impact.coverage === "capacity-proxy") {
      scenarioLines.push("", "Attribution: BACI, capacity-weighted");
    }
  }
  return joinLines(
    `${kind}: ${o.name}`,
    `Country: ${o.country_iso3}`,
    `Operator: ${orNa(o.operator)}`,
    `Capacity: ${formatCapacity(o.capacity, o.capacity_unit ?? "mtpa", 1)}`,
    o.commissioned_year !== null && `Start year: ${o.commissioned_year.toString()}`,
    o.unit_count !== null && o.unit_count > 0 && `Units: ${o.unit_count.toString()}`,
    o.total_processed_bcm !== null &&
      o.total_processed_bcm > 0 &&
      `Total processed 2020–2024: ${o.total_processed_bcm.toFixed(0)} bcm`,
    o.un_locode !== null && o.un_locode.length > 0 && `UN/LOCODE: ${o.un_locode}`,
    sourceLine("lng_terminals", o.source),
    ...scenarioLines,
  );
};
