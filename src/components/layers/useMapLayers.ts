"use client";
import { useMemo } from "react";
import type { Layer } from "@deck.gl/core";
import type { AssetsByKind } from "@/lib/data/assets";
import { loadReserves } from "@/lib/data/reserves";
import { useAsync } from "@/lib/data/useAsync";
import {
  loadVoyages,
  positionVoyages,
  terminalCoordinates,
  voyagesInRange,
} from "@/lib/data/voyages";
import { loadCountries } from "@/lib/geo/countries";
import type { Commodity, ScenarioResult } from "@/lib/scenarios/types";
import { reservesDataYear } from "@/lib/time/range";
import {
  importerOverlay,
  lngImportImpactMap,
  lngVoyageImpactByTerminalName,
  refineryImpactMap,
} from "@/components/scenarios/overlay";
import { buildBasinsLayer, loadBasins } from "./BasinPolygonsLayer";
import { buildExtractionLayer } from "./ExtractionPoints";
import type { LayerState } from "./LayerPanel";
import { buildLngTerminalsLayer } from "./LngTerminalsLayer";
import { buildLngVoyagesLayer } from "./LngVoyagesLayer";
import { buildPipelinesLayer, loadPipelines } from "./PipelinesLayer";
import { buildPortsLayer } from "./PortsLayer";
import { buildRefineriesLayer } from "./RefineriesLayer";
import { buildReservesLayer, reservesFeatures } from "./ReservesChoropleth";
import { buildStorageLayer } from "./StorageLayer";
import type { TooltipContext } from "./tooltip";

/** True when any visible layer (or an active scenario) reads assets.parquet. */
export function needsAssets(layers: LayerState, scenarioActive: boolean): boolean {
  return (
    scenarioActive ||
    layers.extraction ||
    layers.refineries ||
    layers.storage ||
    layers.ports ||
    layers.lng_terminals ||
    layers.lng_voyages
  );
}

export interface MapLayersInput {
  readonly layers: LayerState;
  readonly year: number;
  readonly commodity: Commodity;
  readonly scenario: ScenarioResult | null;
  readonly assets: AssetsByKind | null;
}

export interface MapLayers {
  /** Visible deck layers, bottom to top. */
  readonly deckLayers: readonly Layer[];
  /** Visible layers whose data for the current inputs has not loaded yet. */
  readonly pending: number;
  readonly tooltipContext: TooltipContext;
}

/**
 * Data → deck layers for the whole map. Each source loads once (cached
 * loaders); every layer is a pure builder memoised on exactly the inputs it
 * reads, so a slider tick rebuilds only the time-aware layers and a scenario
 * change only recolours. Hidden layers are not built, and their data is not
 * fetched until first shown.
 */
export function useMapLayers({ layers, year, commodity, scenario, assets }: MapLayersInput): MapLayers {
  // --- data -----------------------------------------------------------------
  const countries = useAsync(loadCountries, layers.reserves ? [] : null);
  const reserves = useAsync(loadReserves, layers.reserves ? [commodity, reservesDataYear(year)] : null);
  const basins = useAsync(loadBasins, layers.basins ? [] : null);
  const pipelines = useAsync(loadPipelines, layers.pipelines || layers.gas_pipelines ? [] : null);
  const showVoyages = layers.lng_voyages && voyagesInRange(year);
  const voyages = useAsync(loadVoyages, showVoyages ? [year] : null);

  // --- scenario styling -----------------------------------------------------
  const overlay = useMemo(() => importerOverlay(scenario, commodity), [scenario, commodity]);
  const refineryImpacts = useMemo(() => refineryImpactMap(scenario), [scenario]);
  const lngImpacts = useMemo(() => lngImportImpactMap(scenario), [scenario]);
  const voyageImpacts = useMemo(() => lngVoyageImpactByTerminalName(scenario), [scenario]);

  // --- layers (null = hidden or not loaded) ---------------------------------
  const reservesFc = useMemo(
    () => (countries.data && reserves.data ? reservesFeatures(countries.data, reserves.data) : null),
    [countries.data, reserves.data],
  );
  const reservesMax = reserves.data?.max ?? 0;
  const reservesLayer = useMemo(
    () => (layers.reserves && reservesFc ? buildReservesLayer(reservesFc, reservesMax, overlay) : null),
    [layers.reserves, reservesFc, reservesMax, overlay],
  );
  const basinsLayer = useMemo(
    () => (layers.basins && basins.data ? buildBasinsLayer(basins.data) : null),
    [layers.basins, basins.data],
  );
  const extractionLayer = useMemo(
    () => (layers.extraction && assets ? buildExtractionLayer(assets.extraction, year) : null),
    [layers.extraction, assets, year],
  );
  const oilPipesLayer = useMemo(
    () => (layers.pipelines && pipelines.data ? buildPipelinesLayer(pipelines.data, "crude", year) : null),
    [layers.pipelines, pipelines.data, year],
  );
  const gasPipesLayer = useMemo(
    () => (layers.gas_pipelines && pipelines.data ? buildPipelinesLayer(pipelines.data, "gas", year) : null),
    [layers.gas_pipelines, pipelines.data, year],
  );
  const refineriesLayer = useMemo(
    () => (layers.refineries && assets ? buildRefineriesLayer(assets.refinery, refineryImpacts) : null),
    [layers.refineries, assets, refineryImpacts],
  );
  const storageLayer = useMemo(
    () => (layers.storage && assets ? buildStorageLayer(assets.storage) : null),
    [layers.storage, assets],
  );
  const portsLayer = useMemo(
    () => (layers.ports && assets ? buildPortsLayer(assets.port) : null),
    [layers.ports, assets],
  );
  const lngTerminalRows = useMemo(
    () => (assets ? [...assets.lngExport, ...assets.lngImport] : null),
    [assets],
  );
  const lngTerminalsLayer = useMemo(
    () =>
      layers.lng_terminals && lngTerminalRows
        ? buildLngTerminalsLayer(lngTerminalRows, year, lngImpacts)
        : null,
    [layers.lng_terminals, lngTerminalRows, year, lngImpacts],
  );
  const terminalCoords = useMemo(
    () => (lngTerminalRows ? terminalCoordinates(lngTerminalRows) : null),
    [lngTerminalRows],
  );
  const positionedVoyages = useMemo(
    () => (voyages.data && terminalCoords ? positionVoyages(voyages.data, terminalCoords) : null),
    [voyages.data, terminalCoords],
  );
  const voyagesLayer = useMemo(
    () =>
      showVoyages && positionedVoyages
        ? buildLngVoyagesLayer(positionedVoyages, voyageImpacts)
        : null,
    [showVoyages, positionedVoyages, voyageImpacts],
  );

  // Z-order (bottom to top): basins, reserves, extraction, oil pipes, gas
  // pipes, LNG voyage arcs, refineries, storage, ports, LNG terminals.
  const deckLayers = useMemo(
    () =>
      [
        basinsLayer,
        reservesLayer,
        extractionLayer,
        oilPipesLayer,
        gasPipesLayer,
        voyagesLayer,
        refineriesLayer,
        storageLayer,
        portsLayer,
        lngTerminalsLayer,
      ].filter((l): l is NonNullable<typeof l> => l !== null) as Layer[],
    [
      basinsLayer,
      reservesLayer,
      extractionLayer,
      oilPipesLayer,
      gasPipesLayer,
      voyagesLayer,
      refineriesLayer,
      storageLayer,
      portsLayer,
      lngTerminalsLayer,
    ],
  );

  const assetsPending = assets === null;
  const pending = [
    layers.basins && !basins.ready,
    layers.reserves && (!countries.ready || !reserves.ready),
    layers.extraction && assetsPending,
    layers.pipelines && !pipelines.ready,
    layers.gas_pipelines && !pipelines.ready,
    layers.refineries && assetsPending,
    layers.storage && assetsPending,
    layers.ports && assetsPending,
    layers.lng_terminals && assetsPending,
    showVoyages && (!voyages.ready || assetsPending),
  ].filter(Boolean).length;

  const tooltipContext = useMemo<TooltipContext>(
    () => ({ year, commodity, scenario, overlay, refineryImpacts, lngImpacts }),
    [year, commodity, scenario, overlay, refineryImpacts, lngImpacts],
  );

  return { deckLayers, pending, tooltipContext };
}
