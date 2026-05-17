"use client";
import { useCallback, useMemo, Suspense } from "react";
import type { PickingInfo } from "@deck.gl/core";
import { MapShell } from "@/components/map/MapShell";
import { useReservesChoropleth } from "@/components/layers/ReservesChoropleth";
import { useExtractionPoints } from "@/components/layers/ExtractionPoints";
import { usePipelinesLayer } from "@/components/layers/PipelinesLayer";
import { useRefineriesLayer } from "@/components/layers/RefineriesLayer";
import { useLngTerminalsLayer } from "@/components/layers/LngTerminalsLayer";
import { useBasinPolygonsLayer } from "@/components/layers/BasinPolygonsLayer";
import { useStorageLayer } from "@/components/layers/StorageLayer";
import { usePortsLayer } from "@/components/layers/PortsLayer";
import { LayerPanel, type LayerState } from "@/components/layers/LayerPanel";
import { CommoditySelector } from "@/components/ui/CommoditySelector";
import { YearSlider } from "@/components/time-slider/YearSlider";
import { ScenarioPanel } from "@/components/scenarios/ScenarioPanel";
import { useScenario } from "@/components/scenarios/useScenario";
import {
  importerOverlay,
  refineryImpactMap,
  lngImportImpactMap,
} from "@/components/scenarios/overlay";
import type { Commodity, ScenarioId } from "@/lib/scenarios/types";
import { useUrlState } from "@/lib/url-state/useUrlState";
import type { AppState } from "@/lib/url-state/encode";

const ALL_LAYERS_ON: LayerState = {
  reserves: true,
  basins: true,
  extraction: true,
  pipelines: true,
  refineries: true,
  storage: true,
  ports: true,
  gas_pipelines: true,
  lng_terminals: true,
};

const DEFAULTS: AppState = {
  year: 2020,
  commodity: "oil",
  scenario: null,
  layers: ALL_LAYERS_ON,
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

  const scenario = useScenario(scenarioId, year, commodity);
  const overlay = useMemo(() => importerOverlay(scenario), [scenario]);
  const refImpacts = useMemo(() => refineryImpactMap(scenario), [scenario]);
  const lngImpacts = useMemo(() => lngImportImpactMap(scenario), [scenario]);

  const basins = useBasinPolygonsLayer(layers.basins);
  const reserves = useReservesChoropleth({
    year,
    commodity,
    ...(overlay !== undefined ? { overlayByIso3: overlay } : {}),
  });
  const extraction = useExtractionPoints({ year });
  const oilPipes = usePipelinesLayer({
    visible: layers.pipelines,
    commodityFilter: "crude",
    id: "pipelines-crude",
    year,
  });
  const gasPipes = usePipelinesLayer({
    visible: layers.gas_pipelines,
    commodityFilter: "gas",
    id: "pipelines-gas",
    year,
  });
  const refineries = useRefineriesLayer({
    visible: layers.refineries,
    ...(refImpacts !== undefined ? { impactByAssetId: refImpacts } : {}),
  });
  const storage = useStorageLayer(layers.storage);
  const ports = usePortsLayer(layers.ports);
  const lngTerminals = useLngTerminalsLayer({
    visible: layers.lng_terminals,
    ...(lngImpacts !== undefined ? { impactByAssetId: lngImpacts } : {}),
  });

  // Z-order (bottom to top): basins, reserves, extraction, oil pipes, gas pipes,
  // refineries, storage, ports, lng terminals
  const visibleLayers = [
    layers.basins ? basins : null,
    layers.reserves ? reserves : null,
    layers.extraction ? extraction : null,
    oilPipes,
    gasPipes,
    refineries,
    storage,
    ports,
    lngTerminals,
  ].filter((x) => x !== null);

  const getTooltip = useCallback(
    (info: PickingInfo) => {
      const o = info.object as Record<string, unknown> | undefined;
      if (!o) return null;

      if (info.layer?.id === "basins") {
        const props = (o as { properties?: Record<string, string | number | null> }).properties ?? {};
        const area = props.area_km2;
        const areaStr = typeof area === "number" ? `${area.toFixed(0)} km²` : "n/a";
        return [
          `Basin: ${(props.name ?? props.basin_id ?? "unknown") as string}`,
          `Country: ${(props.country_iso3 ?? "n/a") as string}`,
          `Area: ${areaStr}`,
          `Region: ${(props.region ?? "n/a") as string}`,
        ].join("\n");
      }

      if (info.layer?.id === "storage") {
        const s = o as { name: string; country_iso3: string; operator?: string | null; status?: string | null; capacity?: number };
        const capStr = typeof s.capacity === "number" && s.capacity > 0 ? `${s.capacity.toFixed(0)} bbl` : "n/a";
        return [
          `Storage: ${s.name}`,
          `Country: ${s.country_iso3}`,
          `Operator: ${s.operator ?? "n/a"}`,
          `Status: ${s.status ?? "n/a"}`,
          `Capacity: ${capStr}`,
        ].join("\n");
      }

      if (info.layer?.id === "ports") {
        const p = o as { name: string; country_iso3: string; operator?: string | null; status?: string | null };
        return [
          `Port: ${p.name}`,
          `Country: ${p.country_iso3}`,
          `Operator: ${p.operator ?? "n/a"}`,
          `Status: ${p.status ?? "n/a"}`,
        ].join("\n");
      }

      if (info.layer?.id === "extraction") {
        const cap = o.capacity;
        const capStr = typeof cap === "number" ? `${cap.toFixed(1)} kboe/d` : "n/a";
        return [
          o.name as string,
          `Country: ${o.country_iso3 as string}`,
          `Operator: ${(o.operator as string | null) ?? "n/a"}`,
          `Status: ${(o.status as string | null) ?? "n/a"}`,
          `Capacity: ${capStr}`,
        ].join("\n");
      }
      if (info.layer?.id === "refineries") {
        const cap = o.capacity;
        const capStr = typeof cap === "number" && cap > 0 ? `${cap.toFixed(0)} kbpd` : "n/a";
        const impact = refImpacts?.get(o.asset_id as string);
        const lines = [
          `Refinery: ${o.name as string}`,
          `Country: ${o.country_iso3 as string}`,
          `Operator: ${(o.operator as string | null) ?? "n/a"}`,
          `Capacity: ${capStr}`,
        ];
        if (impact && impact.topSources.length > 0) {
          lines.push("", "Historical top sources (capacity-weighted):");
          for (const s of impact.topSources) {
            lines.push(`  ${s.iso3}: ${s.qty.toFixed(1)}`);
          }
          if (impact.shareAtRisk > 0) {
            lines.push("", `At-risk under scenario: ${(impact.shareAtRisk * 100).toFixed(1)}%`);
          }
        } else if (impact) {
          lines.push("", "Country runs primarily domestic crude — feedstock model not informative.");
        }
        return lines.join("\n");
      }
      if (info.layer?.id === "lng-terminals") {
        const cap = o.capacity;
        const capStr = typeof cap === "number" && cap > 0 ? `${cap.toFixed(1)} mtpa` : "n/a";
        const kind = o.kind === "lng_export" ? "LNG export terminal" : "LNG import terminal";
        const impact = lngImpacts?.get(o.asset_id as string);
        const lines = [
          `${kind}: ${o.name as string}`,
          `Country: ${o.country_iso3 as string}`,
          `Operator: ${(o.operator as string | null) ?? "n/a"}`,
          `Capacity: ${capStr}`,
        ];
        if (impact && impact.topSources.length > 0) {
          lines.push("", "Historical top sources (capacity-weighted):");
          for (const s of impact.topSources) {
            lines.push(`  ${s.iso3}: ${s.qty.toFixed(1)}`);
          }
          if (impact.shareAtRisk > 0) {
            lines.push("", `At-risk under scenario: ${(impact.shareAtRisk * 100).toFixed(1)}%`);
          }
        }
        return lines.join("\n");
      }
      if ((info.layer?.id ?? "").startsWith("pipelines-")) {
        const props = (o as { properties?: Record<string, unknown> }).properties ?? {};
        const cap = props.capacity_kbpd;
        const unit = (props.capacity_unit as string | undefined) ?? "kbpd";
        const capStr = typeof cap === "number" ? `${cap.toFixed(0)} ${unit}` : "n/a";
        return [
          `Pipeline: ${props.name as string}`,
          `Commodity: ${props.commodity as string}`,
          `Status: ${props.status as string}`,
          `Operator: ${(props.operator as string | null) ?? "n/a"}`,
          `Capacity: ${capStr}`,
        ].join("\n");
      }
      if (typeof info.layer?.id === "string" && info.layer.id.startsWith("reserves-")) {
        const props = (o as { properties?: { name?: string; iso3?: string } }).properties;
        return props ? `${props.name ?? ""} (${props.iso3 ?? ""})` : null;
      }
      return null;
    },
    [refImpacts, lngImpacts],
  );

  return (
    <main className="relative h-screen w-screen">
      <MapShell layers={visibleLayers} getTooltip={getTooltip} />
      <LayerPanel state={layers} onChange={setLayers} />
      <div className="pointer-events-none absolute bottom-20 left-1/2 z-10 -translate-x-1/2">
        <CommoditySelector value={commodity} onChange={setCommodity} />
      </div>
      <YearSlider min={1990} max={2020} value={year} onChange={setYear} />
      <ScenarioPanel
        active={scenarioId}
        onChange={setScenarioId}
        commodity={commodity}
        result={scenario}
      />
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
