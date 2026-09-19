import type { LayerKey } from "@/lib/symbology";
import {
  DISRUPTION_MARK_LAYER_ID,
  formatDisruptionTooltip,
} from "@/components/scenarios/disruption-layers";
import { BASINS_LAYER_ID, formatBasinTooltip } from "./BasinPolygonsLayer";
import { EXTRACTION_LAYER_ID, formatExtractionTooltip } from "./ExtractionPoints";
import { GAS_STORAGE_LAYER_ID, formatGasStorageTooltip } from "./GasStorageChoropleth";
import { SHALE_REGIONS_LAYER_ID, formatShaleRegionTooltip } from "./ShaleRegionsLayer";
import { RECENT_IMPORTS_LAYER_ID, formatRecentImportsTooltip } from "./RecentImportsChoropleth";
import { LNG_TERMINALS_LAYER_ID, formatLngTerminalTooltip } from "./LngTerminalsLayer";
import { LNG_VOYAGES_LAYER_ID, formatLngVoyageTooltip } from "./LngVoyagesLayer";
import { PIPELINE_LAYER_IDS, formatPipelineTooltip } from "./PipelinesLayer";
import { PORTS_LAYER_ID, formatPortTooltip } from "./PortsLayer";
import { REFINERIES_LAYER_ID, formatRefineryTooltip } from "./RefineriesLayer";
import { RESERVES_LAYER_ID, formatReservesTooltip } from "./ReservesChoropleth";
import { STORAGE_LAYER_ID, formatStorageTooltip } from "./StorageLayer";
import type { TooltipContext, TooltipFormatter } from "./tooltip";

/** deck.gl layer id per layer toggle. Stable: e2e and tooltip dispatch rely on them. */
export const DECK_LAYER_IDS: Readonly<Record<LayerKey, string>> = {
  reserves: RESERVES_LAYER_ID,
  basins: BASINS_LAYER_ID,
  extraction: EXTRACTION_LAYER_ID,
  pipelines: PIPELINE_LAYER_IDS.crude,
  refineries: REFINERIES_LAYER_ID,
  storage: STORAGE_LAYER_ID,
  ports: PORTS_LAYER_ID,
  gas_pipelines: PIPELINE_LAYER_IDS.gas,
  lng_terminals: LNG_TERMINALS_LAYER_ID,
  lng_voyages: LNG_VOYAGES_LAYER_ID,
  gas_storage: GAS_STORAGE_LAYER_ID,
  shale_regions: SHALE_REGIONS_LAYER_ID,
  recent_imports: RECENT_IMPORTS_LAYER_ID,
};

// `never` parameter: each formatter takes its own row type; dispatch by layer
// id guarantees the hovered object is that layer's row.
const FORMATTERS: Readonly<Record<LayerKey, TooltipFormatter<never>>> = {
  reserves: formatReservesTooltip,
  basins: formatBasinTooltip,
  extraction: formatExtractionTooltip,
  pipelines: formatPipelineTooltip,
  refineries: formatRefineryTooltip,
  storage: formatStorageTooltip,
  ports: formatPortTooltip,
  gas_pipelines: formatPipelineTooltip,
  lng_terminals: formatLngTerminalTooltip,
  lng_voyages: formatLngVoyageTooltip,
  gas_storage: formatGasStorageTooltip,
  shale_regions: formatShaleRegionTooltip,
  recent_imports: formatRecentImportsTooltip,
};

const BY_DECK_ID: ReadonlyMap<string, TooltipFormatter<never>> = new Map<
  string,
  TooltipFormatter<never>
>([
  ...(Object.keys(DECK_LAYER_IDS) as LayerKey[]).map(
    (k) => [DECK_LAYER_IDS[k], FORMATTERS[k]] as const,
  ),
  // Not a layer toggle: the disruption mark exists because a scenario is
  // active (S1), so it has no `LayerKey` and is registered on its own id.
  [DISRUPTION_MARK_LAYER_ID, formatDisruptionTooltip],
]);

/** Tooltip text for a hovered object on deck layer `layerId`, or null. */
export function formatTooltip(
  layerId: string | undefined,
  object: unknown,
  ctx: TooltipContext,
): string | null {
  if (layerId === undefined || object === null || object === undefined) return null;
  const format = BY_DECK_ID.get(layerId);
  return format ? format(object as never, ctx) : null;
}
