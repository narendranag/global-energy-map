"use client";
import { useMemo } from "react";
import type { Layer } from "@deck.gl/core";
import type { AssetsByKind } from "@/lib/data/assets";
import { loadGasStorage } from "@/lib/data/gas-storage";
import { loadRecentImports } from "@/lib/data/recent-imports";
import { loadReserves } from "@/lib/data/reserves";
import { loadTradeFlows, tradeFlowsInRange } from "@/lib/data/trade-flows";
import { SHALE_METRIC, loadShaleRegionData, loadShaleRegionShapes } from "@/lib/data/shale-regions";
import { useAsync } from "@/lib/data/useAsync";
import {
  loadVoyages,
  positionVoyages,
  terminalCoordinates,
  voyagesInRange,
} from "@/lib/data/voyages";
import { loadCountries } from "@/lib/geo/countries";
import { useSearchHighlight } from "@/lib/search/highlight";
import type { Commodity, ScenarioResult } from "@/lib/scenarios/types";
import { reservesDataYear } from "@/lib/time/range";
import { useMapView } from "@/lib/state";
import { extractionOpacity, glyphScale, isZoomGated } from "@/lib/symbology";
import {
  importerOverlay,
  lngImportImpactMap,
  lngVoyageImpactByTerminalName,
  refineryImpactMap,
} from "@/components/scenarios/overlay";
import { buildBasinsLayer, loadBasins } from "./BasinPolygonsLayer";
import { buildCountryPickLayer } from "./CountryPickLayer";
import { buildFocusLayer } from "./FocusOutlineLayer";
import { buildExtractionLayer } from "./ExtractionPoints";
import type { LayerState } from "./LayerPanel";
import { buildLngTerminalsLayer } from "./LngTerminalsLayer";
import { buildLngVoyagesLayer } from "./LngVoyagesLayer";
import { buildPipelinesLayer, loadPipelines } from "./PipelinesLayer";
import { buildPortsLayer } from "./PortsLayer";
import { buildRefineriesLayer } from "./RefineriesLayer";
import { buildGasStorageLayer, gasStorageFeatures } from "./GasStorageChoropleth";
import { buildReservesLayer, reservesFeatures } from "./ReservesChoropleth";
import { buildShaleRegionsLayer, shaleRegionFeatures } from "./ShaleRegionsLayer";
import { buildRecentImportsLayer, recentImportsFeatures } from "./RecentImportsChoropleth";
import { buildSearchHighlightLayer } from "./SearchHighlightLayer";
import { buildTradeFlowsLayer } from "./TradeFlowsLayer";
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
  /** Selected country (ISO3), outlined above the fills. */
  readonly focus: string | null;
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
export function useMapLayers({
  layers,
  year,
  commodity,
  scenario,
  assets,
  focus,
}: MapLayersInput): MapLayers {
  // --- zoom (settled camera; quantised so a pan does not rebuild layers) -----
  const { zoom } = useMapView();
  const scale = glyphScale(zoom);
  const extractionAlpha = extractionOpacity(zoom);
  const storageVisible = !isZoomGated("storage", zoom);
  const portsVisible = !isZoomGated("ports", zoom);

  // --- data -----------------------------------------------------------------
  // Always loaded: besides the choropleths, the country polygons are the
  // click target for selecting a country (`buildCountryPickLayer`) and the
  // geometry of the focus outline, both of which exist in every mode.
  const countries = useAsync(loadCountries, []);
  const recentImports = useAsync(loadRecentImports, layers.recent_imports ? [commodity] : null);
  const gasStorage = useAsync(loadGasStorage, layers.gas_storage ? [] : null);
  const reserves = useAsync(loadReserves, layers.reserves ? [commodity, reservesDataYear(year)] : null);
  const basins = useAsync(loadBasins, layers.basins ? [] : null);
  const shaleShapes = useAsync(loadShaleRegionShapes, layers.shale_regions ? [] : null);
  const shaleData = useAsync(loadShaleRegionData, layers.shale_regions ? [] : null);
  const pipelines = useAsync(loadPipelines, layers.pipelines || layers.gas_pipelines ? [] : null);
  const showVoyages = layers.lng_voyages && voyagesInRange(year);
  const voyages = useAsync(loadVoyages, showVoyages ? [year] : null);
  const showTradeFlows = layers.trade_flows && tradeFlowsInRange(year);
  const tradeFlows = useAsync(loadTradeFlows, showTradeFlows ? [year, commodity] : null);

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

  // No year in the deps: this layer is deliberately slider-independent.
  const gasStorageFc = useMemo(
    () =>
      countries.data && gasStorage.data
        ? gasStorageFeatures(countries.data, gasStorage.data)
        : null,
    [countries.data, gasStorage.data],
  );
  const gasStorageLayer = useMemo(
    () => (layers.gas_storage && gasStorageFc ? buildGasStorageLayer(gasStorageFc) : null),
    [layers.gas_storage, gasStorageFc],
  );
  // No year in the deps: the latest reported months, whatever the slider says.
  const recentImportsFc = useMemo(
    () =>
      countries.data && recentImports.data ? recentImportsFeatures(countries.data, recentImports.data) : null,
    [countries.data, recentImports.data],
  );
  const recentImportsMax = recentImports.data?.max ?? 0;
  const recentImportsLayer = useMemo(
    () =>
      layers.recent_imports && recentImportsFc ? buildRecentImportsLayer(recentImportsFc, recentImportsMax) : null,
    [layers.recent_imports, recentImportsFc, recentImportsMax],
  );
  const countryPickLayer = useMemo(
    () => (countries.data ? buildCountryPickLayer(countries.data) : null),
    [countries.data],
  );
  const focusLayers = useMemo(
    () => (countries.data ? buildFocusLayer(countries.data, focus) : []),
    [countries.data, focus],
  );
  const basinsLayer = useMemo(
    () => (layers.basins && basins.data ? buildBasinsLayer(basins.data) : null),
    [layers.basins, basins.data],
  );
  const shaleFc = useMemo(
    () =>
      shaleShapes.data && shaleData.data ? shaleRegionFeatures(shaleShapes.data, shaleData.data, year) : null,
    [shaleShapes.data, shaleData.data, year],
  );
  const shaleMax = shaleData.data?.max.get(SHALE_METRIC[commodity]) ?? 0;
  const shaleLayer = useMemo(
    () => (layers.shale_regions && shaleFc ? buildShaleRegionsLayer(shaleFc, commodity, shaleMax) : null),
    [layers.shale_regions, shaleFc, commodity, shaleMax],
  );
  const extractionLayer = useMemo(
    () =>
      layers.extraction && assets
        ? buildExtractionLayer(assets.extraction, year, { scale, opacity: extractionAlpha })
        : null,
    [layers.extraction, assets, year, scale, extractionAlpha],
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
    () => (layers.refineries && assets ? buildRefineriesLayer(assets.refinery, refineryImpacts, scale) : null),
    [layers.refineries, assets, refineryImpacts, scale],
  );
  const storageLayer = useMemo(
    // Below the minimum zoom the layer stays built but `visible: false`, so
    // zooming in shows it without a rebuild.
    () =>
      layers.storage && assets
        ? buildStorageLayer(assets.storage, { scale, visible: storageVisible })
        : null,
    [layers.storage, assets, scale, storageVisible],
  );
  const portsLayer = useMemo(
    () =>
      layers.ports && assets
        ? buildPortsLayer(assets.port, { scale, visible: portsVisible })
        : null,
    [layers.ports, assets, scale, portsVisible],
  );
  const lngTerminalRows = useMemo(
    () => (assets ? [...assets.lngExport, ...assets.lngImport] : null),
    [assets],
  );
  const lngTerminalsLayer = useMemo(
    () =>
      layers.lng_terminals && lngTerminalRows
        ? buildLngTerminalsLayer(lngTerminalRows, year, lngImpacts, scale)
        : null,
    [layers.lng_terminals, lngTerminalRows, year, lngImpacts, scale],
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
  const tradeFlowsLayer = useMemo(
    () =>
      showTradeFlows && tradeFlows.data
        ? buildTradeFlowsLayer(tradeFlows.data, { commodity, focus, zoom })
        : null,
    [showTradeFlows, tradeFlows.data, commodity, focus, zoom],
  );

  // A search result (S4): drawn last (topmost) so it is never hidden by a mark.
  const searchHighlight = useSearchHighlight();
  const searchHighlightLayers = useMemo(
    () => buildSearchHighlightLayer(searchHighlight),
    [searchHighlight],
  );

  // Z-order (bottom to top): the invisible country pick target, basins, shale
  // regions, recent imports, gas storage, reserves, the focus outline,
  // extraction, oil pipes, gas pipes, BACI trade-flow arcs, LNG voyage arcs,
  // refineries, storage, ports, LNG terminals, the search highlight ring. Gas storage sits under
  // reserves so that with both on, the reserves ramp — the one the year
  // slider drives — stays legible on top. The pick layer is bottom-most so
  // every real layer wins the tooltip and the click above it; the focus
  // outline sits above the fills it frames and below the marks it must not
  // hide. Trade flows sit just under the LNG voyage arcs (coarser
  // country-pair lines under the finer terminal-to-terminal ones), both
  // below the point layers so a country/terminal glyph always wins the
  // tooltip over a passing arc.
  const deckLayers = useMemo(
    () =>
      [
        countryPickLayer,
        basinsLayer,
        shaleLayer,
        recentImportsLayer,
        gasStorageLayer,
        reservesLayer,
        ...focusLayers,
        extractionLayer,
        oilPipesLayer,
        gasPipesLayer,
        tradeFlowsLayer,
        voyagesLayer,
        refineriesLayer,
        storageLayer,
        portsLayer,
        lngTerminalsLayer,
        ...searchHighlightLayers,
      ].filter((l): l is NonNullable<typeof l> => l !== null) as Layer[],
    [
      countryPickLayer,
      focusLayers,
      basinsLayer,
      shaleLayer,
      recentImportsLayer,
      gasStorageLayer,
      reservesLayer,
      extractionLayer,
      oilPipesLayer,
      gasPipesLayer,
      tradeFlowsLayer,
      voyagesLayer,
      refineriesLayer,
      storageLayer,
      portsLayer,
      lngTerminalsLayer,
      searchHighlightLayers,
    ],
  );

  const assetsPending = assets === null;
  // countries.geojson is always *loaded* (the pick layer and the focus outline
  // are built from it), but it only counts towards `data-ready` when something
  // the reader can see depends on it: a choropleth fill — which is also where
  // the scenario exposure overlay paints — or a focus outline to draw. Gating
  // readiness on it unconditionally (A4) made every mode wait on a 464 KB
  // fetch that an infrastructure-only view never shows.
  const countriesVisible =
    layers.reserves || layers.gas_storage || layers.recent_imports || focus !== null;
  const pending = [
    layers.basins && !basins.ready,
    layers.shale_regions && (!shaleShapes.ready || !shaleData.ready),
    countriesVisible && !countries.ready,
    layers.reserves && !reserves.ready,
    layers.gas_storage && !gasStorage.ready,
    layers.recent_imports && !recentImports.ready,
    layers.extraction && assetsPending,
    layers.pipelines && !pipelines.ready,
    layers.gas_pipelines && !pipelines.ready,
    layers.refineries && assetsPending,
    layers.storage && assetsPending,
    layers.ports && assetsPending,
    layers.lng_terminals && assetsPending,
    showVoyages && (!voyages.ready || assetsPending),
    showTradeFlows && !tradeFlows.ready,
  ].filter(Boolean).length;

  const tooltipContext = useMemo<TooltipContext>(
    () => ({ year, commodity, scenario, overlay, refineryImpacts, lngImpacts }),
    [year, commodity, scenario, overlay, refineryImpacts, lngImpacts],
  );

  return { deckLayers, pending, tooltipContext };
}
