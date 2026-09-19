"use client";
import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import type { PickingInfo } from "@deck.gl/core";
import { MapShell } from "@/components/map/MapShell";
import { LayerPanel, type LayerState } from "@/components/layers/LayerPanel";
import { countryFromPick } from "@/components/layers/CountryPickLayer";
import { CountryPanel } from "@/components/country/CountryPanel";
import { setFocusIntent } from "@/components/country/focus-intent";
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
import { useScenarioMapLayers } from "@/components/scenarios/useScenarioMapLayers";
import { useScenarioCamera } from "@/components/scenarios/useScenarioCamera";
import { scenarioCameraPadding } from "@/components/scenarios/fit";
import { setMapHoverCountry } from "@/components/scenarios/hover";
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
import { getScenario, scenarioForCommodity } from "@/lib/scenarios/registry";
import type { Commodity, ScenarioId } from "@/lib/scenarios/types";
import { panelPadding, requestInitialFit } from "@/lib/state";
import { embedControlsHidden, isEmbed } from "@/lib/url-state/embed";
import { useUrlState } from "@/lib/url-state/useUrlState";
import { RESERVES_LATEST_YEAR, YEAR_MAX, YEAR_MIN } from "@/lib/time/range";

/** First focusable control inside the scenario panel (its picker). */
const SCENARIO_PICKER = "select, input, button, [tabindex]:not([tabindex='-1'])";

function HomeInner() {
  const [state, setState] = useUrlState(DEFAULT_APP_STATE);
  const { mode, year, commodity, scenario: scenarioId, focus, layers } = state;

  const setYear = useCallback((y: number) => { setState({ year: y }); }, [setState]);
  // Flipping the axis clears a scenario the new commodity does not model: it
  // has no route rows there and would render a confident 0 % (A1).
  const setCommodity = useCallback(
    (c: Commodity) => {
      setState({ commodity: c, scenario: scenarioForCommodity(scenarioId, c) });
    },
    [setState, scenarioId],
  );
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
      // Declare the intent even though "pointer" is the default: it clears an
      // earlier keyboard declaration that no `[iso3]` effect consumed (B6).
      setFocusIntent("pointer");
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
  /**
   * The country panel is collapsed to its header button. Below 768 px always;
   * below 1100 px when a scenario panel shares the right-hand side (B4).
   * Opens with the selection.
   */
  const [countryOpenOnPhone, setCountryOpenOnPhone] = useState(true);

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
  // S1: the disruption mark / cut route and the panel-hover highlight. Not
  // layer-toggle layers, so they are built beside `useMapLayers` and appended
  // on top of its stack.
  const scenarioDef = scenarioId === null ? null : getScenario(scenarioId);
  const scenarioMap = useScenarioMapLayers({ def: scenarioDef, year, commodity, assets });
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
  const pending = layersPending + scenarioMap.pending + (scenarioPending ? 1 : 0);
  const mapLayers = useMemo(
    () => [...deckLayers, ...scenarioMap.layers],
    [deckLayers, scenarioMap.layers],
  );

  const reservesNote =
    layers.reserves && year > RESERVES_LATEST_YEAR
      ? `Reserves: ${RESERVES_LATEST_YEAR.toString()} value (latest in EI Statistical Review)`
      : undefined;

  // A shared `?focus=XXX` link frames its country — unless the link also
  // carries a camera (`lon`/`lat`/`z`), which always wins: an explicit view is
  // what the sharer chose to show. Load only; a later selection (a click, and
  // in S1–S4 a search hit or a ranked row) moves the camera only if it asks.
  const searchParams = useSearchParams();
  const initialFitDone = useRef(false);
  useEffect(() => {
    if (initialFitDone.current) return;
    initialFitDone.current = true;
    if (focus === null || ["lon", "lat", "z"].some((k) => searchParams.has(k))) return;
    // With the trade-flow layer on, the fit takes in the country's largest
    // partners too — a focus in Flows is a question about the arcs, and
    // framing the country alone pushes all of them off screen (polish 1).
    void requestInitialFit({
      focus,
      year,
      commodity,
      tradeFlows: layers.trade_flows,
      padding: panelPadding({ right: showScenarioPanel }),
    });
    // Mount only: the initial URL is read once, on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // S1: picking a scenario frames the disruption and the importers that lose
  // most, clear of the panels (including S3's country panel when one is
  // selected). Never on load — the link's view wins.
  const scenarioPadding = useMemo(() => scenarioCameraPadding(focus !== null), [focus]);
  useScenarioCamera({
    scenarioId,
    mark: scenarioMap.mark,
    markPending: scenarioMap.pending > 0,
    result: scenario,
    padding: scenarioPadding,
  });

  const getTooltip = useCallback(
    (info: PickingInfo) => {
      // The other half of the panel ↔ map link (S1): hovering an exposed
      // country lights up its row. The hover store compares before it
      // notifies, so this costs nothing until the country changes.
      setMapHoverCountry(countryFromPick(info));
      return formatTooltip(info.layer?.id, info.object, tooltipContext);
    },
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
          country → commodity → year → map): the map is
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
          scenarioKind={scenarioDef?.kind}
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
        {/*
          Embed rule (S7): the country panel does not render under `?embed=1`
          at all. It is a deep-read surface — five sections, two lists of
          buttons and a download — and an embed frame is where a reader looks
          at *the map*; the focused country is still outlined, and "open full
          map" leads to the panel.
        */}
        {focus !== null && !embed && (
          <>
            <button
              type="button"
              className={
                // z-30: above both panel slots (z-20). Under 1100 px the
                // scenario panel is open behind the country panel, and a
                // toggle the scenario panel covers is a toggle nobody can
                // press (B4).
                "pointer-events-auto absolute right-4 z-30 flex items-center gap-2 rounded-md border border-slate-200 bg-white/95 px-3 py-2 text-xs font-medium uppercase tracking-wide text-slate-700 shadow-lg " +
                (showScenarioPanel ? "top-16 min-[1100px]:hidden " : "top-4 md:hidden ")
              }
              aria-expanded={countryOpenOnPhone}
              onClick={() => {
                setCountryOpenOnPhone((v) => !v);
              }}
            >
              <Chevron open={countryOpenOnPhone} />
              Country
            </button>
            {/*
              The country panel's slot. Side by side with the scenario panel's
              26rem column — so a researcher can read a country and the
              scenario that threatens it at the same time — but only from
              1100 px, because the three columns need 1080 px of room
              (layer panel to 304 px, country slot starting at width - 768)
              and below that the country panel rode straight over the layer
              panel (B4). Under 1100 px with a scenario open it takes the right
              edge in front of the scenario panel and the reader toggles
              between them with the collapsed "Country"/"Scenario" buttons,
              which is exactly what phones have always done. With no scenario
              panel there is room at every width from 768 px, so the old `md`
              breakpoint stands. Either way the slot ends above the commodity
              toggle and the year slider and scrolls.
            */}
            <div
              data-testid="country-slot"
              className={
                "pointer-events-none absolute bottom-40 top-0 z-20 w-[min(22rem,100%)] overflow-y-auto overscroll-contain " +
                (showScenarioPanel
                  ? "max-[1099px]:right-0 max-[1099px]:top-24 min-[1100px]:right-[26rem] "
                  : "right-0 max-md:top-10 ") +
                (countryOpenOnPhone
                  ? ""
                  : showScenarioPanel
                    ? "max-[1099px]:hidden"
                    : "max-md:hidden")
              }
            >
              <CountryPanel
                iso3={focus}
                year={year}
                commodity={commodity}
                onClose={() => { setFocus(null); }}
                onFocus={setFocus}
                onScenario={setScenarioId}
                scenarioOpen={showScenarioPanel}
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
          <MapShell layers={mapLayers} getTooltip={getTooltip} onPick={onPick} />
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
