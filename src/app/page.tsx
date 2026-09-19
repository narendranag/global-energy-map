"use client";
import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import type { PickingInfo } from "@deck.gl/core";
import { MapShell } from "@/components/map/MapShell";
import { LayerPanel, type LayerState } from "@/components/layers/LayerPanel";
import { countryFromPick } from "@/components/layers/CountryPickLayer";
import { formatTooltip } from "@/components/layers/tooltips";
import { needsAssets, useMapLayers } from "@/components/layers/useMapLayers";
import { Chevron } from "@/components/ui/Chevron";
import { CommoditySelector } from "@/components/ui/CommoditySelector";
import { Header } from "@/components/ui/Header";
import { IntroCard } from "@/components/ui/IntroCard";
import { MapFooter } from "@/components/ui/MapFooter";
import { PhoneBanner } from "@/components/ui/PhoneBanner";
import { YearSlider } from "@/components/time-slider/YearSlider";
import { ScenarioPanel } from "@/components/scenarios/ScenarioPanel";
import { useScenario } from "@/components/scenarios/useScenario";
import { importsNoun } from "@/components/scenarios/overlay";
import { ShareMenu } from "@/components/share/ShareMenu";
import { EmbedAttributionBar } from "@/components/ui/EmbedAttributionBar";
import { useAssets } from "@/lib/data/assets";
import {
  applyMode,
  DEFAULT_APP_STATE,
  layersOpenByDefault,
  type ExampleQuestion,
  type Mode,
} from "@/lib/modes";
import { getScenario } from "@/lib/scenarios/registry";
import type { Commodity, ScenarioId } from "@/lib/scenarios/types";
import { panelPadding, useCamera } from "@/lib/state";
import { embedControlsHidden, isEmbed } from "@/lib/url-state/embed";
import { useUrlState } from "@/lib/url-state/useUrlState";
import { RESERVES_LATEST_YEAR, YEAR_MAX, YEAR_MIN } from "@/lib/time/range";

/** First focusable control inside the scenario panel (its picker). */
const SCENARIO_PICKER = "select, input, button, [tabindex]:not([tabindex='-1'])";

function HomeInner() {
  const [state, setState] = useUrlState(DEFAULT_APP_STATE);
  const { mode, year, commodity, scenario: scenarioId, focus, layers } = state;

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

  // --- country selection --------------------------------------------------
  // Clicking a country selects it; clicking the selected country again, or
  // empty sea, or Escape, clears it. A click on a point or line above a
  // country is a click on *that* and leaves the selection alone —
  // `countryFromPick` decides by layer id, not by the object's shape.
  const setFocus = useCallback(
    (iso3: string | null) => { setState({ focus: iso3 }); },
    [setState],
  );
  const onPick = useCallback(
    (info: PickingInfo) => {
      const iso3 = countryFromPick(info);
      if (iso3 !== null) {
        setFocus(iso3 === focus ? null : iso3);
        return;
      }
      if (info.layer == null) setFocus(null);
    },
    [focus, setFocus],
  );

  useEffect(() => {
    if (focus === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      // Escape inside a popup (the share panel, the intro card) closes that one.
      if (document.activeElement?.closest('[role="dialog"]')) return;
      setFocus(null);
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); };
  }, [focus, setFocus]);

  // --- modes ------------------------------------------------------------------
  const scenarioSlotRef = useRef<HTMLDivElement>(null);
  /** Set by a Scenarios tab click; consumed once the panel has rendered. */
  const focusPickerRef = useRef(false);
  /** Phone (< 768 px) only: the scenario panel is collapsed to its header. */
  const [scenarioOpenOnPhone, setScenarioOpenOnPhone] = useState(false);

  const selectMode = useCallback(
    (next: Mode, via: "pointer" | "keyboard" = "pointer") => {
      // Re-selecting the current tab re-applies its preset (a "reset" gesture).
      setState(applyMode(state, next));
      if (next === "scenarios") {
        // Arrow keys keep focus in the tablist; a click hands it to the picker.
        focusPickerRef.current = via === "pointer";
        setScenarioOpenOnPhone(true);
      }
    },
    [setState, state],
  );

  const pickExample = useCallback(
    (q: ExampleQuestion) => {
      setState(q.state);
      if (q.state.mode === "scenarios") setScenarioOpenOnPhone(true);
    },
    [setState],
  );

  const showScenarioPanel = mode === "scenarios" || scenarioId !== null;

  useEffect(() => {
    if (!focusPickerRef.current || !showScenarioPanel) return;
    focusPickerRef.current = false;
    scenarioSlotRef.current?.querySelector<HTMLElement>(SCENARIO_PICKER)?.focus();
  }, [mode, showScenarioPanel]);

  // --- data -------------------------------------------------------------------
  // One assets.parquet read shared by every point layer and the scenario.
  const assets = useAssets(needsAssets(layers, scenarioId !== null));
  const scenario = useScenario(scenarioId, year, commodity, assets);
  const { deckLayers, pending: layersPending, tooltipContext } = useMapLayers({
    layers,
    year,
    commodity,
    scenario,
    assets,
    focus,
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

  // A shared `?focus=XXX` link frames its country — unless the link also
  // carries a camera (`lon`/`lat`/`z`), which always wins: an explicit view is
  // what the sharer chose to show. Load only; a later selection (a click, and
  // in S1–S4 a search hit or a ranked row) moves the camera only if it asks.
  const camera = useCamera();
  const searchParams = useSearchParams();
  const initialFitDone = useRef(false);
  useEffect(() => {
    if (initialFitDone.current) return;
    initialFitDone.current = true;
    if (focus === null || ["lon", "lat", "z"].some((k) => searchParams.has(k))) return;
    void camera.fitCountry(focus, { padding: panelPadding({ right: showScenarioPanel }) });
    // Mount only: the initial URL is read once, on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getTooltip = useCallback(
    (info: PickingInfo) => formatTooltip(info.layer?.id, info.object, tooltipContext),
    [tooltipContext],
  );

  // S7 embed mode: `embed`/`controls` are view flags read straight from the
  // URL (never AppState — see `src/lib/url-state/embed.ts`), reactive because
  // `useSearchParams()` tracks the store's own debounced `replaceState`.
  const embed = isEmbed(searchParams);
  const hideControls = embed && embedControlsHidden(searchParams);
  const activeScenarioLabel = scenarioId !== null ? getScenario(scenarioId).label : null;
  const scenarioChipSummary = `${activeScenarioLabel ?? "Scenario"} · ${year.toString()} · ${commodity}`;
  // Collapse the phone-only scenario toggle at every width in embed mode
  // (not just under 768 px): an embed frame is often narrower than desktop
  // but not a phone.
  const collapseScenario = embed;

  return (
    <main
      className="flex h-dvh w-full flex-col overflow-hidden bg-white"
      data-ready={pending === 0 ? "true" : "false"}
      data-mode={mode}
    >
      {!embed && (
        <Header
          mode={mode}
          onModeChange={selectMode}
          pending={pending}
          actions={<ShareMenu scenario={scenario} />}
        />
      )}
      {!embed && <PhoneBanner />}
      {/* Map area: every panel below is positioned against this box, so none
          can ride up under the header. */}
      <div className="relative min-h-0 flex-1">
        {/*
          DOM order is focus order (header → intro → layers → scenario →
          commodity → year → map): the map is
          last in the DOM and painted beneath the panels by its own z-0
          stacking context; every panel carries z-10 or higher.

          Embed rule (S7, `?embed=1`): this page renders inside a third-party
          <iframe> with none of its own chrome — no header, intro card, phone
          banner or full footer, just a compact attribution bar. Any *new* UI
          added here (by another task) must default to hidden or collapsed in
          embed mode unless it is essential to reading the map — check `embed`
          (and `hideControls` for the year slider / commodity toggle) before
          assuming a panel should render.
        */}
        {!embed && <IntroCard onPick={pickExample} />}
        <LayerPanel
          // Remount on mode change so the Layers disclosure re-applies its
          // per-mode default (open in Infrastructure, closed otherwise).
          key={mode}
          state={layers}
          onChange={setLayers}
          scenarioNoun={scenarioId !== null ? importsNoun(commodity) : undefined}
          defaultOpen={layersOpenByDefault(mode)}
          embedded={embed}
        />
        {showScenarioPanel && (
          <>
            <button
              type="button"
              className={
                "pointer-events-auto absolute right-4 top-4 z-10 flex items-center gap-2 rounded-md border border-slate-200 bg-white/95 px-3 py-2 text-xs font-medium uppercase tracking-wide text-slate-700 shadow-lg " +
                (collapseScenario ? "" : "md:hidden")
              }
              aria-expanded={scenarioOpenOnPhone}
              onClick={() => {
                setScenarioOpenOnPhone((v) => !v);
              }}
            >
              <Chevron open={scenarioOpenOnPhone} />
              {collapseScenario ? scenarioChipSummary : "Scenario"}
            </button>
            {/*
              The panel positions itself (absolute right-4 top-4); this slot
              is its containing block. It ends above the commodity toggle and the
              slider and scrolls, so a long result list never runs under them; on
              phones (and, in embed mode, at every width) it sits below the
              collapsed header button.
            */}
            <div
              ref={scenarioSlotRef}
              data-testid="scenario-slot"
              className={
                "pointer-events-none absolute bottom-40 right-0 top-0 z-20 w-[min(26rem,100%)] overflow-y-auto overscroll-contain " +
                (collapseScenario ? "" : "max-md:top-10 ") +
                (scenarioOpenOnPhone ? "" : collapseScenario ? "hidden" : "max-md:hidden")
              }
            >
              <ScenarioPanel
                active={scenarioId}
                onChange={setScenarioId}
                commodity={commodity}
                result={scenario}
              />
            </div>
          </>
        )}
        {!hideControls && (
          <div className="pointer-events-none absolute bottom-32 left-1/2 z-10 -translate-x-1/2">
            <CommoditySelector value={commodity} onChange={setCommodity} />
          </div>
        )}
        {!hideControls && (
          <YearSlider
            min={YEAR_MIN}
            max={YEAR_MAX}
            value={year}
            onChange={setYear}
            note={reservesNote}
          />
        )}
        {embed ? <EmbedAttributionBar state={state} /> : <MapFooter />}
        <div className="absolute inset-0 z-0">
          <MapShell layers={deckLayers} getTooltip={getTooltip} onPick={onPick} />
        </div>
      </div>
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
