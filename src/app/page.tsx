"use client";
import { useCallback, useMemo, Suspense } from "react";
import type { PickingInfo } from "@deck.gl/core";
import { MapShell } from "@/components/map/MapShell";
import {
  useReservesChoropleth,
  type ReservesProps,
} from "@/components/layers/ReservesChoropleth";
import { formatReserves } from "@/components/layers/reservesRamp";
import { useExtractionPoints } from "@/components/layers/ExtractionPoints";
import { usePipelinesLayer } from "@/components/layers/PipelinesLayer";
import { useRefineriesLayer } from "@/components/layers/RefineriesLayer";
import { useLngTerminalsLayer } from "@/components/layers/LngTerminalsLayer";
import { useBasinPolygonsLayer } from "@/components/layers/BasinPolygonsLayer";
import { useStorageLayer } from "@/components/layers/StorageLayer";
import { usePortsLayer } from "@/components/layers/PortsLayer";
import { useLngVoyagesLayer } from "@/components/layers/LngVoyagesLayer";
import { LayerPanel, type LayerState } from "@/components/layers/LayerPanel";
import { CommoditySelector } from "@/components/ui/CommoditySelector";
import { TitleBar } from "@/components/ui/TitleBar";
import { MapFooter } from "@/components/ui/MapFooter";
import { YearSlider } from "@/components/time-slider/YearSlider";
import { ScenarioPanel } from "@/components/scenarios/ScenarioPanel";
import { useScenario } from "@/components/scenarios/useScenario";
import {
  importerOverlay,
  importsNoun,
  refineryImpactMap,
  lngImportImpactMap,
  lngVoyageImpactByTerminalName,
} from "@/components/scenarios/overlay";
import type { Commodity, ScenarioId } from "@/lib/scenarios/types";
import { useUrlState } from "@/lib/url-state/useUrlState";
import type { AppState } from "@/lib/url-state/encode";
import { RESERVES_LATEST_YEAR, YEAR_MAX, YEAR_MIN } from "@/lib/time/range";

/** LNG-T3 voyage coverage; outside it the voyages layer has no rows. */
const LNG_T3_FIRST_YEAR = 2020;
const LNG_T3_LAST_YEAR = 2024;

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
  lng_voyages: false,   // Phase 6: opt-in only — high visual noise
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

  const scenario = useScenario(scenarioId, year, commodity);
  const overlay = useMemo(() => importerOverlay(scenario, commodity), [scenario, commodity]);
  const refImpacts = useMemo(() => refineryImpactMap(scenario), [scenario]);
  const lngImpacts = useMemo(() => lngImportImpactMap(scenario), [scenario]);
  const voyageImpacts = useMemo(
    () => lngVoyageImpactByTerminalName(scenario),
    [scenario],
  );

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
    year,
    ...(lngImpacts !== undefined ? { impactByAssetId: lngImpacts } : {}),
  });
  const lngVoyages = useLngVoyagesLayer({
    visible: layers.lng_voyages,
    year,
    ...(voyageImpacts !== undefined ? { impactByTerminalName: voyageImpacts } : {}),
  });

  // Z-order (bottom to top): basins, reserves, extraction, oil pipes, gas pipes,
  // lng voyages (arcs), refineries, storage, ports, lng terminals
  const visibleLayers = [
    layers.basins ? basins : null,
    layers.reserves ? reserves : null,
    layers.extraction ? extraction : null,
    oilPipes,
    gasPipes,
    lngVoyages,
    refineries,
    storage,
    ports,
    lngTerminals,
  ].filter((x) => x !== null);

  // Loading indicator + e2e ready signal: a visible layer whose hook has not
  // produced a layer yet is pending, as is a scenario whose result does not
  // yet match the requested (scenario, year, commodity).
  const scenarioPending =
    scenarioId !== null &&
    (scenario?.scenarioId !== scenarioId ||
      scenario.year !== year ||
      scenario.commodity !== commodity);
  const voyagesInRange = year >= LNG_T3_FIRST_YEAR && year <= LNG_T3_LAST_YEAR;
  const pending = [
    layers.basins && basins === null,
    layers.reserves && reserves === null,
    layers.extraction && extraction === null,
    layers.pipelines && oilPipes === null,
    layers.gas_pipelines && gasPipes === null,
    layers.refineries && refineries === null,
    layers.storage && storage === null,
    layers.ports && ports === null,
    layers.lng_terminals && lngTerminals === null,
    layers.lng_voyages && voyagesInRange && lngVoyages === null,
    scenarioPending,
  ].filter(Boolean).length;

  const reservesNote =
    layers.reserves && year > RESERVES_LATEST_YEAR
      ? `Reserves: ${RESERVES_LATEST_YEAR.toString()} value (latest in EI Statistical Review)`
      : undefined;

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
        const unitCount = o.unit_count;
        if (typeof unitCount === "number" && unitCount > 0) {
          lines.push(`Units: ${unitCount.toString()}`);
        }
        const totalProcessed = o.total_processed_bcm;
        if (typeof totalProcessed === "number" && totalProcessed > 0) {
          lines.push(`Total processed 2020–2024: ${totalProcessed.toFixed(0)} bcm`);
        }
        const unLocode = o.un_locode;
        if (typeof unLocode === "string" && unLocode.length > 0) {
          lines.push(`UN/LOCODE: ${unLocode}`);
        }
        const source = o.source;
        if (typeof source === "string" && source.length > 0) {
          lines.push(`Source: ${source.includes("LNG-T3") ? "LNG-T3" : "GEM"}`);
        }
        if (impact) {
          if (impact.coverage === "none") {
            lines.push("", `No measured voyages to this terminal in ${year.toString()}`);
          } else if (impact.topSources.length > 0) {
            lines.push("", "Historical top sources (t/yr):");
            for (const s of impact.topSources) {
              lines.push(`  ${s.iso3}: ${s.qty.toFixed(1)}`);
            }
            if (impact.shareAtRisk > 0) {
              lines.push("", `At-risk under scenario: ${(impact.shareAtRisk * 100).toFixed(1)}%`);
            }
          }
          if (impact.coverage === "measured") {
            lines.push("", "Attribution: measured voyages (LNG-T3), scaled to BACI country total");
          } else if (impact.coverage === "capacity-proxy") {
            lines.push("", "Attribution: BACI, capacity-weighted");
          }
        }
        return lines.join("\n");
      }
      if (info.layer?.id === "lng-voyages") {
        const cbm = typeof o.amount_cbm === "number" ? o.amount_cbm : 0;
        const mt = (cbm * 0.4245) / 1e6;
        return [
          `LNG voyage: ${o.from_terminal as string} → ${o.to_terminal as string}`,
          `From: ${o.from_country as string} (${o.from_country_iso3 as string})`,
          `To:   ${o.to_country as string} (${o.to_country_iso3 as string})`,
          `Dates: ${o.start_date as string} → ${o.end_date as string}`,
          `Cargo: ${cbm.toLocaleString()} cbm  (≈ ${mt.toFixed(3)} Mt)`,
          `Confidence: ${typeof o.confidence_score === "number" ? o.confidence_score.toString() : "n/a"}/5`,
        ].join("\n");
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
      if (info.layer?.id === "reserves") {
        const props = (o as { properties?: Partial<ReservesProps> }).properties;
        if (!props) return null;
        const c = props.commodity ?? commodity;
        const dataYear = (props.data_year ?? Math.min(year, RESERVES_LATEST_YEAR)).toString();
        const lines = [`${props.name ?? ""} (${props.iso3 ?? ""})`];
        lines.push(
          typeof props.value === "number"
            ? `Proved ${c} reserves: ${formatReserves(props.value, c)} (${dataYear})`
            : `Proved ${c} reserves: no data in source (${dataYear})`,
        );
        if (year > RESERVES_LATEST_YEAR) {
          lines.push(`(latest in source; year selected: ${year.toString()})`);
        }
        if (scenario !== null && props.iso3) {
          const entry = overlay?.get(props.iso3);
          lines.push(
            "",
            entry?.tooltip ??
              `Scenario: no ${scenario.year.toString()} ${importsNoun(commodity)} recorded in BACI`,
          );
        }
        return lines.join("\n");
      }
      return null;
    },
    [refImpacts, lngImpacts, year, commodity, scenario, overlay],
  );

  return (
    <main
      className="relative h-screen w-screen"
      data-ready={pending === 0 ? "true" : "false"}
    >
      <MapShell layers={visibleLayers} getTooltip={getTooltip} />
      <TitleBar pending={pending} />
      <LayerPanel state={layers} onChange={setLayers} />
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
