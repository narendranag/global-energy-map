"use client";
import { useCallback, Suspense } from "react";
import type { PickingInfo } from "@deck.gl/core";
import { MapShell } from "@/components/map/MapShell";
import { LayerPanel, type LayerState } from "@/components/layers/LayerPanel";
import { formatTooltip } from "@/components/layers/tooltips";
import { needsAssets, useMapLayers } from "@/components/layers/useMapLayers";
import { CommoditySelector } from "@/components/ui/CommoditySelector";
import { TitleBar } from "@/components/ui/TitleBar";
import { MapFooter } from "@/components/ui/MapFooter";
import { YearSlider } from "@/components/time-slider/YearSlider";
import { ScenarioPanel } from "@/components/scenarios/ScenarioPanel";
import { useScenario } from "@/components/scenarios/useScenario";
import { importsNoun } from "@/components/scenarios/overlay";
import { useAssets } from "@/lib/data/assets";
import type { Commodity, ScenarioId } from "@/lib/scenarios/types";
import { useUrlState } from "@/lib/url-state/useUrlState";
import type { AppState } from "@/lib/url-state/encode";
import { RESERVES_LATEST_YEAR, YEAR_MAX, YEAR_MIN } from "@/lib/time/range";

const DEFAULT_LAYERS: LayerState = {
  reserves: true,
  basins: true,
  extraction: true,
  pipelines: true,
  refineries: true,
  storage: true,
  ports: true,
  gas_pipelines: true,
  lng_terminals: true,
  lng_voyages: false, // Phase 6: opt-in only — high visual noise
};

// Default 2020 = RESERVES_LATEST_YEAR, so first load shows a live (not
// frozen) reserves value.
const DEFAULTS: AppState = {
  year: RESERVES_LATEST_YEAR,
  commodity: "oil",
  scenario: null,
  layers: DEFAULT_LAYERS,
};

function HomeInner() {
  const [state, setState] = useUrlState(DEFAULTS);
  const { year, commodity, scenario: scenarioId, layers } = state;

  const setYear = useCallback((y: number) => { setState({ year: y }); }, [setState]);
  const setCommodity = useCallback((c: Commodity) => { setState({ commodity: c }); }, [setState]);
  const setScenarioId = useCallback(
    (id: ScenarioId | null) => { setState({ scenario: id }); },
    [setState],
  );
  const setLayers = useCallback(
    (next: LayerState) => { setState({ layers: next }); },
    [setState],
  );

  // One assets.parquet read shared by every point layer and the scenario.
  const assets = useAssets(needsAssets(layers, scenarioId !== null));
  const scenario = useScenario(scenarioId, year, commodity, assets);
  const { deckLayers, pending: layersPending, tooltipContext } = useMapLayers({
    layers,
    year,
    commodity,
    scenario,
    assets,
  });

  // Loading indicator + e2e ready signal: visible layers still loading, plus
  // a scenario whose result does not yet match (scenario, year, commodity).
  const scenarioPending =
    scenarioId !== null &&
    (scenario?.scenarioId !== scenarioId ||
      scenario.year !== year ||
      scenario.commodity !== commodity);
  const pending = layersPending + (scenarioPending ? 1 : 0);

  const reservesNote =
    layers.reserves && year > RESERVES_LATEST_YEAR
      ? `Reserves: ${RESERVES_LATEST_YEAR.toString()} value (latest in EI Statistical Review)`
      : undefined;

  const getTooltip = useCallback(
    (info: PickingInfo) => formatTooltip(info.layer?.id, info.object, tooltipContext),
    [tooltipContext],
  );

  return (
    <main
      className="relative h-screen w-screen"
      data-ready={pending === 0 ? "true" : "false"}
    >
      <MapShell layers={deckLayers} getTooltip={getTooltip} />
      <TitleBar pending={pending} />
      <LayerPanel
        state={layers}
        onChange={setLayers}
        scenarioNoun={scenarioId !== null ? importsNoun(commodity) : undefined}
      />
      <div className="pointer-events-none absolute bottom-28 left-1/2 z-10 -translate-x-1/2">
        <CommoditySelector value={commodity} onChange={setCommodity} />
      </div>
      <YearSlider
        min={YEAR_MIN}
        max={YEAR_MAX}
        value={year}
        onChange={setYear}
        note={reservesNote}
      />
      <ScenarioPanel
        active={scenarioId}
        onChange={setScenarioId}
        commodity={commodity}
        result={scenario}
      />
      <MapFooter />
    </main>
  );
}

export default function Home() {
  return (
    <Suspense>
      <HomeInner />
    </Suspense>
  );
}
