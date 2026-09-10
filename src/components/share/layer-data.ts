import { loadAssets } from "@/lib/data/assets";
import {
  loadVoyages,
  positionVoyages,
  terminalCoordinates,
  voyagesInRange,
} from "@/lib/data/voyages";
import { loadBasins } from "@/components/layers/BasinPolygonsLayer";
import { loadPipelines } from "@/components/layers/PipelinesLayer";
import {
  assetTable,
  basinTable,
  lngTerminalRows,
  pipelineTable,
  voyageTable,
  type ExportTable,
  type LayerKey,
} from "@/lib/export/layers";

/**
 * Rows for an exportable layer, from the same cached loaders the map uses. The
 * menu only offers layers that are switched on, so these resolve from memory
 * (the loaders cache the in-flight promise) — no new network request.
 * Returns null for layers that are never exported (view-only by licence).
 */
export async function loadLayerTable(key: LayerKey, year: number): Promise<ExportTable | null> {
  switch (key) {
    case "extraction":
      return assetTable((await loadAssets()).extraction, { year, timeAware: true });
    case "storage":
      return assetTable((await loadAssets()).storage, { year, timeAware: false });
    case "ports":
      return assetTable((await loadAssets()).port, { year, timeAware: false });
    case "lng_terminals": {
      const a = await loadAssets();
      return assetTable(lngTerminalRows(a.lngExport, a.lngImport), { year, timeAware: true, lng: true });
    }
    case "pipelines":
      return pipelineTable((await loadPipelines()).features, "crude", year);
    case "gas_pipelines":
      return pipelineTable((await loadPipelines()).features, "gas", year);
    case "basins":
      return basinTable((await loadBasins()).features);
    case "lng_voyages": {
      if (!voyagesInRange(year)) return null;
      const [voyages, a] = await Promise.all([loadVoyages(year), loadAssets()]);
      const coords = terminalCoordinates(lngTerminalRows(a.lngExport, a.lngImport));
      return voyageTable(positionVoyages(voyages, coords), year);
    }
    case "reserves":
    case "refineries":
      return null;
  }
}
