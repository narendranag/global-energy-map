"use client";
import { useCallback, useMemo, useState } from "react";
import type { PickingInfo } from "@deck.gl/core";
import { MapShell } from "@/components/map/MapShell";
import { useReservesChoropleth } from "@/components/layers/ReservesChoropleth";
import { useExtractionPoints } from "@/components/layers/ExtractionPoints";
import { usePipelinesLayer } from "@/components/layers/PipelinesLayer";
import { useRefineriesLayer } from "@/components/layers/RefineriesLayer";
import { useLngTerminalsLayer } from "@/components/layers/LngTerminalsLayer";
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

export default function Home() {
  const [year, setYear] = useState(2020);
  const [commodity, setCommodity] = useState<Commodity>("oil");
  const [scenarioId, setScenarioId] = useState<ScenarioId | null>(null);
  const [layers, setLayers] = useState<LayerState>({
    reserves: true,
    extraction: true,
    pipelines: true,
    refineries: true,
    gas_pipelines: true,
    lng_terminals: true,
  });

  const scenario = useScenario(scenarioId, year, commodity);
  const overlay = useMemo(() => importerOverlay(scenario), [scenario]);
  const refImpacts = useMemo(() => refineryImpactMap(scenario), [scenario]);
  const lngImpacts = useMemo(() => lngImportImpactMap(scenario), [scenario]);

  const reserves = useReservesChoropleth({
    year,
    commodity,
    ...(overlay !== undefined ? { overlayByIso3: overlay } : {}),
  });
  const extraction = useExtractionPoints();
  const oilPipes = usePipelinesLayer({
    visible: layers.pipelines,
    commodityFilter: "crude",
    id: "pipelines-crude",
  });
  const gasPipes = usePipelinesLayer({
    visible: layers.gas_pipelines,
    commodityFilter: "gas",
    id: "pipelines-gas",
  });
  const refineries = useRefineriesLayer({
    visible: layers.refineries,
    ...(refImpacts !== undefined ? { impactByAssetId: refImpacts } : {}),
  });
  const lngTerminals = useLngTerminalsLayer({
    visible: layers.lng_terminals,
    ...(lngImpacts !== undefined ? { impactByAssetId: lngImpacts } : {}),
  });

  const visibleLayers = [
    layers.reserves ? reserves : null,
    layers.extraction ? extraction : null,
    oilPipes,       // already gated by visible prop
    gasPipes,       // already gated by visible prop
    refineries,     // already gated by visible prop
    lngTerminals,   // already gated by visible prop
  ].filter((x) => x !== null);

  const getTooltip = useCallback((info: PickingInfo) => {
    const o = info.object as Record<string, unknown> | undefined;
    if (!o) return null;
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
        lines.push("");
        lines.push("Historical top sources (capacity-weighted):");
        for (const s of impact.topSources) {
          lines.push(`  ${s.iso3}: ${s.qty.toFixed(1)}`);
        }
        if (impact.shareAtRisk > 0) {
          lines.push("");
          lines.push(`At-risk under scenario: ${(impact.shareAtRisk * 100).toFixed(1)}%`);
        }
      } else if (impact) {
        lines.push("");
        lines.push("Country runs primarily domestic crude — feedstock model not informative.");
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
        lines.push("");
        lines.push("Historical top sources (capacity-weighted):");
        for (const s of impact.topSources) {
          lines.push(`  ${s.iso3}: ${s.qty.toFixed(1)}`);
        }
        if (impact.shareAtRisk > 0) {
          lines.push("");
          lines.push(`At-risk under scenario: ${(impact.shareAtRisk * 100).toFixed(1)}%`);
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
  }, [refImpacts, lngImpacts]);

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
