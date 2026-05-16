"use client";
import { useCallback, useMemo, useState } from "react";
import type { PickingInfo } from "@deck.gl/core";
import { MapShell } from "@/components/map/MapShell";
import { useReservesChoropleth } from "@/components/layers/ReservesChoropleth";
import { useExtractionPoints } from "@/components/layers/ExtractionPoints";
import { usePipelinesLayer } from "@/components/layers/PipelinesLayer";
import { useRefineriesLayer } from "@/components/layers/RefineriesLayer";
import { LayerPanel, type LayerState } from "@/components/layers/LayerPanel";
import { YearSlider } from "@/components/time-slider/YearSlider";
import { ScenarioPanel } from "@/components/scenarios/ScenarioPanel";
import { useScenario } from "@/components/scenarios/useScenario";
import { importerOverlay, refineryImpactMap } from "@/components/scenarios/overlay";
import type { ScenarioId } from "@/lib/scenarios/types";

export default function Home() {
  const [year, setYear] = useState(2020);
  const [scenarioId, setScenarioId] = useState<ScenarioId | null>(null);
  const [layers, setLayers] = useState<LayerState>({
    reserves: true,
    extraction: true,
    pipelines: true,
    refineries: true,
  });

  const scenario = useScenario(scenarioId, year);
  const overlay = useMemo(() => importerOverlay(scenario), [scenario]);
  const refImpacts = useMemo(() => refineryImpactMap(scenario), [scenario]);

  const reserves = useReservesChoropleth({
    year,
    ...(overlay !== undefined ? { overlayByIso3: overlay } : {}),
  });
  const extraction = useExtractionPoints();
  const pipelines = usePipelinesLayer(layers.pipelines);
  const refineries = useRefineriesLayer({
    visible: layers.refineries,
    ...(refImpacts !== undefined ? { impactByAssetId: refImpacts } : {}),
  });

  const visibleLayers = [
    layers.reserves ? reserves : null,
    layers.extraction ? extraction : null,
    pipelines,    // already gated by visible prop
    refineries,   // already gated by visible prop
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
    if (info.layer?.id === "pipelines") {
      // GeoJsonLayer: info.object is a GeoJSON Feature; properties live under .properties
      const props = (o as { properties?: Record<string, unknown> }).properties ?? {};
      const cap = props.capacity_kbpd;
      const capStr = typeof cap === "number" ? `${cap.toFixed(0)} kbpd` : "n/a";
      return [
        `Pipeline: ${props.name as string}`,
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
  }, [refImpacts]);

  return (
    <main className="relative h-screen w-screen">
      <MapShell layers={visibleLayers} getTooltip={getTooltip} />
      <LayerPanel state={layers} onChange={setLayers} />
      <YearSlider min={1990} max={2020} value={year} onChange={setYear} />
      <ScenarioPanel active={scenarioId} onChange={setScenarioId} result={scenario} />
    </main>
  );
}
