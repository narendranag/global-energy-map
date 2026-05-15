"use client";
import { useCallback, useMemo, useState } from "react";
import type { PickingInfo } from "@deck.gl/core";
import { MapShell } from "@/components/map/MapShell";
import { useReservesChoropleth } from "@/components/layers/ReservesChoropleth";
import { useExtractionPoints } from "@/components/layers/ExtractionPoints";
import { YearSlider } from "@/components/time-slider/YearSlider";
import { ScenarioPanel } from "@/components/scenarios/ScenarioPanel";
import { useHormuzScenario, hormuzOverlay } from "@/components/scenarios/useHormuzScenario";

export default function Home() {
  const [year, setYear] = useState(2020);
  const [hormuzOn, setHormuzOn] = useState(false);
  const scenario = useHormuzScenario(year, hormuzOn);
  const overlay = useMemo(() => hormuzOverlay(scenario), [scenario]);
  const reserves = useReservesChoropleth({
    year,
    ...(overlay !== undefined ? { overlayByIso3: overlay } : {}),
  });
  const extraction = useExtractionPoints();
  const layers = [reserves, extraction].filter((x) => x !== null);
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
    if (typeof info.layer?.id === "string" && info.layer.id.startsWith("reserves-")) {
      const props = (o as { properties?: { name?: string; iso3?: string } }).properties;
      return props ? `${props.name ?? ""} (${props.iso3 ?? ""})` : null;
    }
    return null;
  }, []);
  return (
    <main className="relative h-screen w-screen">
      <MapShell layers={layers} getTooltip={getTooltip} />
      <YearSlider min={1990} max={2020} value={year} onChange={setYear} />
      <ScenarioPanel enabled={hormuzOn} onToggle={setHormuzOn} result={scenario} />
    </main>
  );
}
