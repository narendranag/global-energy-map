"use client";
import { useId, useMemo, useState } from "react";
import type { Commodity, ScenarioId, ScenarioResult } from "@/lib/scenarios/types";
import {
  SCENARIOS,
  getScenario,
  howComputed,
  isScenarioActive,
  scenarioDescription,
  severityPct,
  sourceGapNote,
  type ScenarioDef,
} from "@/lib/scenarios/registry";
import { isCurrentScenarioResult } from "@/lib/scenarios/current";
import { scenarioVintage } from "@/lib/scenarios/vintage";
import { EXAMPLE_QUESTIONS, TRADE_LAST_YEAR } from "@/lib/modes";
import { useToday } from "@/components/layers/useToday";
import { useAssets } from "@/lib/data/assets";
import { useCountryNames } from "@/lib/geo/useCountryNames";
import { EXPOSURE_LEGEND_STOPS, gradientCss } from "@/lib/symbology";
import {
  SEVERITY_MIN_PCT,
  SEVERITY_STEP_PCT,
  type ScenarioView,
} from "@/lib/url-state/encode";
import { scenarioCameraPadding } from "./fit";
import { hoveredAssetId, hoveredIso3, useScenarioHover } from "./hover";
import { RankedRow } from "./RankedRow";
import { applyExample, goToAsset, goToCountry } from "./row-actions";
import { ScenarioContext } from "./ScenarioContext";
import { rankAssetsByCapacityAtRisk, rankImportersByShare, routeNamesOf, sideNoun } from "./overlay";
import { useScenarioInputsFor } from "./useScenario";
import { describeExposure, explainZeroExposure } from "./explain";
import {
  TOP_N,
  capacityAtRisk,
  coverageLabel,
  distinctRouteDocuments,
  formatCapacity,
  formatVolume,
  hasRange,
  howComputedOptionsFor,
  pct,
  pctRange,
  routeRowsForDisplay,
  scenarioAnnouncement,
  sharePct,
  showsStaleBadge,
  sortImporters,
  volumeRange,
  type ImporterSort,
  type RouteDisplayRow,
} from "./panel-model";

export interface ScenarioPanelProps {
  readonly active: ScenarioId | null;
  readonly onChange: (id: ScenarioId | null) => void;
  readonly commodity: Commodity;
  readonly result: ScenarioResult | null;
  /** T1: a second scenario closed at the same time, or null. */
  readonly second: ScenarioId | null;
  readonly onSecondChange: (id: ScenarioId | null) => void;
  /** T1: fraction of the route(s) cut, 0.05–1. */
  readonly severity: number;
  readonly onSeverityChange: (severity: number) => void;
  /** T1: which side of the cut the lists and the map describe. */
  readonly view: ScenarioView;
  readonly onViewChange: (view: ScenarioView) => void;
  /**
   * S7: `?embed=1`. The panel keeps everything needed to *read* the numbers
   * and drops what only makes sense with the whole site around it — the
   * empty state's example questions, which would navigate an embedded frame
   * somewhere its host never asked for.
   */
  readonly embedded?: boolean;
}

interface AssetRow {
  readonly asset_id: string;
  readonly iso3: string;
  readonly name?: string;
  readonly shareAtRisk: number;
  readonly capacity: number;
  readonly coverage?: "measured" | "capacity-proxy" | "none";
}

function findScenario(id: ScenarioId): ScenarioDef | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

const LEGEND_GRADIENT = gradientCss(EXPOSURE_LEGEND_STOPS);

const HEADING = "text-xs font-medium uppercase tracking-wide text-slate-600";
const NOTE = "text-[11px] leading-snug text-slate-600";
const SEGMENT =
  "border border-slate-300 px-1.5 py-0.5 first:rounded-l last:rounded-r focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-700";
const SEGMENT_ON = "bg-slate-700 text-white";
const SEGMENT_OFF = "bg-white text-slate-700 hover:bg-slate-100";

function ShowAllButton({
  expanded,
  total,
  onToggle,
  controls,
  noun,
}: {
  expanded: boolean;
  total: number;
  onToggle: () => void;
  controls: string;
  noun: string;
}) {
  if (total <= TOP_N) return null;
  return (
    <button
      type="button"
      aria-expanded={expanded}
      aria-controls={controls}
      onClick={onToggle}
      className="mt-1 rounded text-[11px] font-medium text-sky-800 underline decoration-dotted underline-offset-2 hover:text-sky-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-700"
    >
      {expanded ? `Show top ${TOP_N.toString()} only` : `Show all ${total.toString()} ${noun}`}
    </button>
  );
}

function RouteShareItem({
  row,
  nameOf,
  showScenario,
}: {
  row: RouteDisplayRow;
  nameOf: (iso3: string) => string;
  /** True when two scenarios are combined: say which one a row belongs to. */
  showScenario: boolean;
}) {
  // A null side is a wildcard, not a missing country: "all importers" for an
  // exporter-wide row, "all exporters" for the inbound (importer-wide) one.
  const importer = row.importer === null ? "all importers" : nameOf(row.importer);
  const exporter = row.exporter === null ? "all exporters" : nameOf(row.exporter);
  return (
    <li className="border-t border-slate-200 pt-1 first:border-t-0 first:pt-0">
      <div className="flex justify-between gap-2 text-xs">
        <span className="min-w-0 truncate">
          {showScenario && (
            <span className="mr-1 rounded bg-slate-100 px-1 text-[11px] text-slate-700">
              {getScenario(row.scenarioId).label}
            </span>
          )}
          {row.pairs
            ? `${row.pairs.length.toString()} exporter → importer pairs`
            : `${exporter} → ${importer}`}
        </span>
        <span className="font-mono">{sharePct(row.share)}</span>
      </div>
      {row.unsourced ? (
        <>
          <span className="mt-0.5 inline-block rounded bg-amber-100 px-1 text-[11px] font-medium text-amber-900">
            Analyst estimate (unsourced)
          </span>
          {row.note && <p className={`mt-0.5 ${NOTE}`}>{row.note}</p>}
        </>
      ) : (
        <>
          <p className="mt-0.5 text-[11px] leading-snug text-slate-700">
            {row.url ? (
              <a
                href={row.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-800 underline decoration-dotted underline-offset-2 hover:text-sky-950"
              >
                {row.title}
              </a>
            ) : (
              row.title
            )}
            {row.year !== null ? ` (${row.year.toString()})` : ""}
          </p>
          {row.note && (
            <details className="mt-0.5">
              <summary className="cursor-pointer text-[11px] text-slate-600 hover:text-slate-800">
                How this share follows from the source
              </summary>
              <p className={`mt-0.5 ${NOTE}`}>{row.note}</p>
              {row.pairs && <p className={`mt-0.5 font-mono ${NOTE}`}>{row.pairs.join(", ")}</p>}
            </details>
          )}
        </>
      )}
    </li>
  );
}

export function ScenarioPanel({
  active,
  onChange,
  commodity,
  result,
  second,
  onSecondChange,
  severity,
  onSeverityChange,
  view,
  onViewChange,
  embedded = false,
}: ScenarioPanelProps) {
  const uid = useId();
  const selectId = `${uid}-scenario`;
  const secondId = `${uid}-scenario2`;
  const severityId = `${uid}-severity`;
  const lookupId = `${uid}-lookup`;
  const datalistId = `${uid}-countries`;
  const importersId = `${uid}-importers`;
  const assetsId = `${uid}-assets`;
  const headingId = `${uid}-heading`;

  const def = active ? findScenario(active) : undefined;
  const names = useCountryNames();
  // Only render a result that belongs to the selected scenario + commodity
  // (the page may hand us the previous one while the next loads).
  // T1: the second scenario and the severity are part of "belongs to what the
  // controls say", or the panel would quote single-scenario, full-closure
  // numbers under a combined, half-severity heading while the next result
  // computes.
  const current =
    isCurrentScenarioResult(result, {
      scenario: active,
      scenario2: second,
      // The year is the result's own: the panel reads whatever year the
      // result describes (it prints it), and the page already counts a
      // year change into `pending`.
      year: result?.year ?? 0,
      commodity,
      severity,
    })
      ? result
      : null;
  const inputs = useScenarioInputsFor(current);

  // S1: the panel ↔ map link. `hover` is shared transient state, not app
  // state; the coordinates come from the assets read the scenario already
  // needed, so a ranked asset row can fly the map to the plant itself.
  const hover = useScenarioHover();
  const hoverIso3 = hoveredIso3(hover);
  const hoverAssetId = hoveredAssetId(hover);
  const assets = useAssets(active !== null);
  const assetPosition = useMemo(() => {
    if (assets === null) return null;
    const m = new Map<string, { lon: number; lat: number }>();
    for (const a of [...assets.refinery, ...assets.lngImport, ...assets.lngExport]) {
      m.set(a.asset_id, { lon: a.lon, lat: a.lat });
    }
    return m;
  }, [assets]);

  const [sortBy, setSortBy] = useState<ImporterSort>("volume");
  const [allImporters, setAllImporters] = useState(false);
  const [allAssets, setAllAssets] = useState(false);
  const [lookup, setLookup] = useState("");

  const visibleScenarios = SCENARIOS.filter((s) => s.commodities.includes(commodity));
  // Anything else this commodity axis models: combining a scenario with
  // itself is not a combination, and a scenario with no rows for the axis
  // could only add a confident zero (A1).
  const combinable = visibleScenarios.filter((s) => s.id !== active);
  const exporterView = view === "exporters";
  const noun = sideNoun(commodity, view);
  const side = exporterView ? "exporter" : "importer";
  // Every sentence that names the closed route: one scenario names itself,
  // two name both, and the phrase is built from the *result* so it cannot
  // describe a combination the numbers do not include.
  const routesLabel = current ? routeNamesOf(current) : (def?.routeName ?? "");
  const nameOf = (iso3: string): string => names?.get(iso3) ?? iso3;
  const volume = (t: number): string => formatVolume(t, commodity);

  // One list, two readings: `byExporter` has the same shape as `byImporter`
  // (Σ at-risk is identical either way), so the ranking, the floor and the
  // sort are shared and only the noun changes.
  const rankedImporters = useMemo(
    () =>
      current && names
        ? sortImporters(
            rankImportersByShare(
              exporterView ? (current.byExporter ?? []) : current.byImporter,
              (iso3) => names.has(iso3),
            ),
            sortBy,
          )
        : [],
    [current, names, sortBy, exporterView],
  );
  /** True when two scenarios actually bracket a country's exposure. */
  const showsRange = hasRange(rankedImporters, commodity);
  /** True when the result really covers more than one scenario. */
  const combined = (current?.scenarioIds?.length ?? 1) > 1;
  const showLng = commodity === "gas";
  const rankedAssets = useMemo<AssetRow[]>(
    () =>
      current
        ? rankAssetsByCapacityAtRisk<AssetRow>(showLng ? current.byLngImport : current.byRefinery)
        : [],
    [current, showLng],
  );
  const importerRows = allImporters ? rankedImporters : rankedImporters.slice(0, TOP_N);
  const assetRows = allAssets ? rankedAssets : rankedAssets.slice(0, TOP_N);
  const assetLabel = showLng ? "Top LNG import terminals at risk" : "Top refineries at risk";
  const assetUnit = showLng ? "Mtpa" : "kb/d";
  const showLngT3Footnote =
    showLng && (current?.byLngImport.some((i) => i.dataSource === "lng-t3") ?? false);
  const measuredCount = showLng ? rankedAssets.filter((a) => a.coverage === "measured").length : 0;

  // Both scenarios' rows when two are combined (each tagged with its own id):
  // a panel quoting one scenario's shares under a two-scenario number would
  // not say where that number came from.
  const routeRows = useMemo(
    () => (inputs && current ? routeRowsForDisplay(inputs.routes, current.scenarioIds ?? [current.scenarioId]) : []),
    [inputs, current],
  );
  const unsourcedCount = routeRows.filter((r) => r.unsourced).length;
  // The documents behind those rows, deduplicated — what the vintage
  // disclosure lists under "Route shares".
  const routeDocuments = useMemo(() => distinctRouteDocuments(routeRows), [routeRows]);

  // Most exposed by share, whichever sort the list uses.
  const top = rankedImporters.reduce<(typeof rankedImporters)[number] | undefined>(
    (best, r) => (best === undefined || r.shareAtRisk > best.shareAtRisk ? r : best),
    undefined,
  );
  const scenarioLabel =
    def === undefined
      ? ""
      : second === null
        ? def.label
        : `${def.label} + ${findScenario(second)?.label ?? second}`;
  // The panel's headline *and* its live-region announcement, in one string:
  // what was asked, which trade year it is answered on, and the answer. Pure
  // (`scenarioAnnouncement`), so the wording is unit-tested rather than
  // asserted through the DOM.
  const announcement = scenarioAnnouncement({
    scenarioLabel,
    severity,
    side,
    noun,
    routeName: routesLabel,
    result:
      current === null
        ? null
        : {
            year: current.year,
            // Null while the citations load: the headline waits on
            // "Computing exposure…" rather than printing a trade-only
            // phrase that is about to gain a second vintage.
            routes: inputs?.routes ?? null,
            exposedCount: rankedImporters.length,
            top: top === undefined ? null : { name: nameOf(top.iso3), share: pctRange(top) },
          },
  });

  // What the numbers are built on, and how current each part of it is. Same
  // two inputs as `howComputedOptionsFor` — the result on screen and the rows
  // behind it — so the disclosure cannot describe a run the panel is not
  // showing. `today` is the reader's, null until mounted (see `useToday`).
  const today = useToday();
  const vintage = useMemo(
    () =>
      current === null || today === null
        ? null
        : scenarioVintage(current, inputs?.routes ?? null, { today }),
    [current, inputs, today],
  );

  /** Scenario mode's example questions, from the one list `IntroCard` reads. */
  const examples = useMemo(
    () => EXAMPLE_QUESTIONS.filter((q) => q.state.mode === "scenarios"),
    [],
  );

  // "Check a country": accept a country name (case-insensitive) or an ISO3 code.
  const countryOptions = useMemo(
    () => (names ? [...names].sort((a, b) => a[1].localeCompare(b[1])) : []),
    [names],
  );
  const lookupIso3 = useMemo(() => {
    const q = lookup.trim();
    if (q === "" || !names) return null;
    const upper = q.toUpperCase();
    if (names.has(upper)) return upper;
    const lower = q.toLowerCase();
    return countryOptions.find(([, n]) => n.toLowerCase() === lower)?.[0] ?? null;
  }, [lookup, names, countryOptions]);
  const explanation =
    lookupIso3 && current && inputs && def
      ? describeExposure(explainZeroExposure(lookupIso3, current, inputs), {
          commodity,
          routeName: routesLabel,
          nameOf,
          formatVolume: volume,
          view,
        })
      : null;

  return (
    <section
      aria-labelledby={headingId}
      className="pointer-events-auto absolute right-4 top-4 z-10 w-80 rounded-md bg-white/95 p-3 text-sm text-slate-800 shadow-lg backdrop-blur"
    >
      <h2 id={headingId} className="sr-only">
        Disruption scenario
      </h2>
      {/*
        One short, always-mounted line per result — the panel's headline and
        its announcement at once. It used to be `sr-only`, with the finding
        available only by reading the ranked list: a scenario that computes an
        answer should say the answer. Mounted whether or not a scenario is
        picked, so the live region is there before the result it announces;
        with nothing to say it takes no space.
      */}
      <p
        aria-live="polite"
        data-testid="scenario-announcement"
        className={
          announcement.text === "" ? "sr-only" : "mb-2 text-sm leading-snug text-slate-800"
        }
      >
        {announcement.lead !== "" && (
          <strong className="font-semibold">{announcement.lead}</strong>
        )}
        {announcement.lead === "" ? announcement.detail : ` ${announcement.detail}`}
      </p>
      {/*
        The one vintage caveat that belongs above the fold, because it is
        about the headline number itself: that number is trade x route share,
        and a share documented years away from the trade year makes the
        headline read more current than it is. Derived in `shareGapNote` from
        the rows themselves — no scenario is named, no year is typed here. The
        asset/attribution spread stays inside the disclosure below: it moves
        no headline figure.
      */}
      {vintage?.shareGapNote != null && (
        <p
          data-testid="scenario-vintage-caveat"
          className="mb-2 text-[11px] leading-snug text-amber-900"
        >
          {vintage.shareGapNote}
        </p>
      )}
      {/*
        With nothing picked the panel used to be a bare "None" dropdown: the
        one mode whose whole point is a question showed no question. The
        example questions are the same `EXAMPLE_QUESTIONS` the intro card
        offers — one list, two readers — applied through the store, so
        picking one here does exactly what picking it there does (including
        the scenario camera fit, which keys on what is closed).
      */}
      {def === undefined && !embedded && (
        <div className="mb-3" data-testid="scenario-empty">
          <p className="text-sm font-medium leading-snug text-slate-800">
            Who loses supply if a route closes?
          </p>
          <p className={`mt-1 ${NOTE}`}>Start with a question, or pick a route below.</p>
          <ul className="mt-1.5 space-y-1">
            {examples.map((q) => (
              <li key={q.id}>
                <button
                  type="button"
                  onClick={() => { applyExample(q); }}
                  className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-left text-xs leading-snug text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-700"
                >
                  {q.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <label htmlFor={selectId} className={`mb-2 block ${HEADING}`}>
        Scenario
      </label>
      <select
        id={selectId}
        value={active ?? ""}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === "" ? null : (v as ScenarioId));
        }}
        className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800"
      >
        <option value="">None</option>
        {visibleScenarios.map((s) => (
          <option key={s.id} value={s.id}>{s.label}</option>
        ))}
      </select>
      {def && (
        <p className="mt-2 text-xs leading-snug text-slate-700">
          {scenarioDescription(def, commodity)}
        </p>
      )}
      {/*
        T1 controls. All three are only meaningful once a scenario is picked,
        so they mount with it; each writes one URL parameter and nothing else,
        and every default (no second scenario, severity 100 %, importers) is
        the state every link shared before T1 already described.
      */}
      {def && combinable.length > 0 && (
        <div className="mt-2">
          <label htmlFor={secondId} className={`mb-1 block ${HEADING}`}>
            Combine with
          </label>
          <select
            id={secondId}
            value={second ?? ""}
            data-testid="scenario-2"
            onChange={(e) => {
              const v = e.target.value;
              onSecondChange(v === "" ? null : (v as ScenarioId));
            }}
            className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800"
          >
            <option value="">None (one route)</option>
            {combinable.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </div>
      )}
      {def && (
        <div className="mt-2">
          <label htmlFor={severityId} className={`mb-1 block ${HEADING}`}>
            Share of the route&apos;s flow that is cut
          </label>
          <div className="flex items-center gap-2">
            <input
              id={severityId}
              type="range"
              min={SEVERITY_MIN_PCT}
              max={100}
              step={SEVERITY_STEP_PCT}
              value={Math.round(severity * 100)}
              data-testid="severity-slider"
              aria-valuetext={`${severityPct(severity)} of the route cut`}
              onChange={(e) => { onSeverityChange(Number(e.target.value) / 100); }}
              className="min-w-0 flex-1 accent-slate-700"
            />
            <output
              htmlFor={severityId}
              aria-live="off"
              data-testid="severity-value"
              className="w-12 shrink-0 text-right font-mono text-xs text-slate-700"
            >
              {severityPct(severity)}
            </output>
          </div>
          <p className={`mt-0.5 ${NOTE}`}>
            {severity < 1
              ? `Every route share is multiplied by ${severityPct(severity)}; each country's total ${noun} is unchanged.`
              : "Full closure: everything the route carries is cut."}
          </p>
        </div>
      )}
      {/* A year the scenario does not describe (`activeYears`): say so rather
          than quote numbers for it. The map mutes the mark to match. */}
      {def && current && !isScenarioActive(def, current.year) && def.inactiveNote !== undefined && (
        <p className="mt-2 text-[11px] leading-snug text-amber-800" data-testid="scenario-inactive">
          {def.inactiveNote}
        </p>
      )}
      {def && current && sourceGapNote(def, commodity, current.year) && (
        <p className="mt-2 text-[11px] leading-snug text-amber-800" data-testid="source-gap">
          {sourceGapNote(def, commodity, current.year)}
        </p>
      )}
      {def && (
        <div className="mt-3" data-testid="scenario-metric">
          <p className="text-xs leading-snug text-slate-700">
            <span className="font-medium">% at risk</span> = share of each {side}&apos;s{" "}
            {current ? `${current.year.toString()} ` : ""}
            {noun} (BACI, by volume) routed through {routesLabel}
            {severity < 1 ? `, ${severityPct(severity)} of it cut` : ""}.
          </p>
          <div
            className="mt-1 h-2 w-full rounded border border-slate-200"
            style={{ background: LEGEND_GRADIENT }}
            aria-hidden="true"
          />
          <div className="flex justify-between text-[11px] text-slate-600">
            <span>0%</span>
            <span>100% of {noun}</span>
          </div>
          <details className="mt-1" data-testid="how-computed">
            <summary className="cursor-pointer text-[11px] font-medium text-slate-700 hover:text-slate-900">
              How this is computed
            </summary>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {howComputed(
                def,
                commodity,
                current?.year ?? result?.year ?? 2020,
                // Derived from the result and its rows, never from the
                // controls (review finding 2): the disclosure describes the
                // numbers on screen.
                howComputedOptionsFor(current, inputs?.routes ?? null, view),
              ).map((s) => (
                <li key={s} className={NOTE}>{s}</li>
              ))}
            </ul>
          </details>
          {/*
            What the answer is built on. Every date is derived (catalog
            `coverage`/`as_of` and the route rows' own `source_year`), so a
            data refresh moves this with no code change. Only ever rendered
            for the result on screen — `current`, the same gate the numbers
            above use.
          */}
          {/*
            Open by default: maximum transparency was the decision, and the
            vintages of the data behind a number are not a footnote to it. It
            is still a `<details>`, so a reader who has seen it can collapse
            it.
          */}
          {vintage && (
            <details className="mt-1" data-testid="scenario-vintage" open>
              <summary className="cursor-pointer text-[11px] font-medium text-slate-700 hover:text-slate-900">
                Data behind this result — {vintage.summary}
              </summary>
              <ul className="mt-1 space-y-1">
                {vintage.rows.map((r) => (
                  <li key={r.role}>
                    <div className="flex items-baseline justify-between gap-2 text-[11px] leading-snug text-slate-700">
                      <span className="min-w-0">
                        {r.label}
                        {r.sources.length > 0 && (
                          <span className="text-slate-600"> — {r.sources.join(", ")}</span>
                        )}
                      </span>
                      <span className="flex shrink-0 items-baseline gap-1">
                        <span className="tabular-nums">{r.through}</span>
                        {showsStaleBadge(r, {
                          tradeYear: vintage.tradeYear,
                          latestTradeYear: TRADE_LAST_YEAR,
                        }) && (
                          <span className="whitespace-nowrap rounded border border-amber-600 bg-amber-50 px-1 text-[11px] leading-4 text-amber-900">
                            old
                          </span>
                        )}
                      </span>
                    </div>
                    {r.note !== null && <p className={`mt-0.5 ${NOTE}`}>{r.note}</p>}
                    {/*
                      Which documents, not just how many years: the route
                      shares are the half of the headline number that is not
                      trade, and "dated 2017–2026" alone names nothing a
                      reader could go and check. The list is derived from the
                      same grouped rows the "Route shares used" section
                      renders, so the two cannot cite different documents.
                    */}
                    {r.role === "route_shares" && routeDocuments.length > 0 && (
                      <ul className="mt-0.5 space-y-0.5" data-testid="route-share-documents">
                        {routeDocuments.map((d) => (
                          <li key={`${d.title}-${(d.year ?? 0).toString()}`} className={NOTE}>
                            {d.url ? (
                              <a
                                href={d.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sky-800 underline decoration-dotted underline-offset-2 hover:text-sky-950"
                              >
                                {d.title}
                              </a>
                            ) : (
                              d.title
                            )}
                            {d.year !== null ? ` (${d.year.toString()})` : " (undated)"}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
              {vintage.mismatchNote !== null && (
                <p className={`mt-1 ${NOTE}`}>{vintage.mismatchNote}</p>
              )}
            </details>
          )}
        </div>
      )}

      {def && (
        <section
          aria-busy={current === null}
          aria-label="Scenario results"
          className="mt-3"
          data-testid="scenario-results"
        >
          {current === null ? (
            <p className={NOTE}>Computing exposure…</p>
          ) : (
            <>
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <h3 className={HEADING}>
                  {exporterView ? "Top exporters at risk" : "Top importers at risk"}
                </h3>
                <div className="flex gap-2 text-[11px]">
                  {/* Which side of the cut — who loses supply, or who loses
                      the outlet. Two readings of the same rows. */}
                  <div role="group" aria-label="Show" className="flex" data-testid="view-toggle">
                    {(["importers", "exporters"] as const).map((k) => (
                      <button
                        key={k}
                        type="button"
                        aria-pressed={view === k}
                        onClick={() => { onViewChange(k); }}
                        className={`${SEGMENT} ${
                          view === k ? SEGMENT_ON : SEGMENT_OFF
                        }`}
                      >
                        {k === "importers" ? "Importers" : "Exporters"}
                      </button>
                    ))}
                  </div>
                  <div
                    role="group"
                    aria-label={`Sort ${side}s by`}
                    className="flex"
                  >
                    {(["share", "volume"] as const).map((k) => (
                      <button
                        key={k}
                        type="button"
                        aria-pressed={sortBy === k}
                        onClick={() => { setSortBy(k); }}
                        className={`${SEGMENT} ${
                          sortBy === k ? SEGMENT_ON : SEGMENT_OFF
                        }`}
                      >
                        {k === "share" ? "Share" : "Volume"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {rankedImporters.length === 0 ? (
                <p className={NOTE}>
                  No {side} has {noun} routed through {routesLabel} in {current.year.toString()}.
                </p>
              ) : (
                <ol id={importersId} className="space-y-0.5" data-testid="ranked-importers">
                  {importerRows.map((r) => (
                    <li key={r.iso3}>
                      <RankedRow
                        hover={{ kind: "country", iso3: r.iso3 }}
                        active={hoverIso3 === r.iso3}
                        title={`Select ${nameOf(r.iso3)} and show it on the map`}
                        // Activating the row also selects the country, which opens the
                        // country panel beside this one — so the fit clears both.
                        onActivate={() => { void goToCountry(r.iso3, scenarioCameraPadding(true)); }}
                      >
                        <span className="flex justify-between gap-2">
                          <span className="min-w-0 truncate">
                            {nameOf(r.iso3)}{" "}
                            <span className="font-mono text-[11px] text-slate-600">{r.iso3}</span>
                          </span>
                          <span className="shrink-0 text-right">
                            <span className="font-mono">{pctRange(r)}</span>{" "}
                            <span className="ml-1.5 inline-block min-w-[4.5rem] font-mono text-[11px] text-slate-600">
                              {volumeRange(r, commodity)}
                            </span>
                          </span>
                        </span>
                      </RankedRow>
                    </li>
                  ))}
                </ol>
              )}
              <ShowAllButton
                expanded={allImporters}
                total={rankedImporters.length}
                onToggle={() => { setAllImporters((v) => !v); }}
                controls={importersId}
                noun={`${side}s`}
              />
              <p className={`mt-1 ${NOTE}`}>
                {sortBy === "share"
                  ? "Ranked by share"
                  : `Ranked by volume at risk (${commodity === "gas" ? "Mt per year" : "kb/d, annual average"})`};
                {" "}{side}s under 0.1% of world {noun} omitted.
              </p>
              {/* The one sentence that makes a two-number row readable. It is
                  shown only when a row really spans a range. */}
              {showsRange && (
                <p className={`mt-1 ${NOTE}`} data-testid="range-note">
                  Two routes are closed, and we know what fraction of a flow each
                  carries but not which cargoes. Figures quote the low end — the
                  routes may be in series, the same barrels crossing both, so the
                  cargo is cut once. The high end is the two shares added: the
                  routes may be in parallel, carrying different barrels.
                </p>
              )}

              <div className="mt-3">
                <h3 className={`mb-1 ${HEADING}`}>{assetLabel}</h3>
                {/* These rows (and the tint the map gives the same assets)
                    are importer-side by construction: they split an
                    *importer's* at-risk imports across its own plants. The
                    exporter view has no counterpart for them, so they are
                    captioned rather than silently left looking like part of
                    the exporter ranking (finding 9). */}
                {exporterView && (
                  <p className={`mb-1 ${NOTE}`} data-testid="asset-side-note">
                    Importer side: the {showLng ? "terminals" : "refineries"} that lose supply,
                    from the importers&apos; exposure. These rows — and the shaded{" "}
                    {showLng ? "terminals" : "refineries"} on the map — do not change with the
                    exporter view.
                  </p>
                )}
                {rankedAssets.length === 0 ? (
                  <p className={NOTE}>No {showLng ? "terminal" : "refinery"} with capacity data is exposed.</p>
                ) : (
                  <ol id={assetsId} className="space-y-0.5" data-testid="ranked-assets">
                    {assetRows.map((a) => {
                      const cov = showLng && a.coverage ? coverageLabel(a.coverage) : null;
                      const at = assetPosition?.get(a.asset_id);
                      return (
                        <li key={a.asset_id}>
                          <RankedRow
                            hover={{ kind: "asset", assetId: a.asset_id }}
                            active={hoverAssetId === a.asset_id}
                            title={
                              at
                                ? `Show ${a.name ?? a.asset_id} on the map`
                                : "No coordinates for this asset"
                            }
                            onActivate={() => { if (at) goToAsset(at.lon, at.lat); }}
                          >
                            <span className="flex justify-between gap-2">
                              <span className="min-w-0 truncate">
                                {a.name ?? a.asset_id}{" "}
                                <span className="font-mono text-[11px] text-slate-600">{a.iso3}</span>
                              </span>
                              <span className="shrink-0 font-mono">{pct(a.shareAtRisk)}</span>
                            </span>
                            <span className="flex justify-between gap-2 text-[11px] text-slate-600">
                              <span>
                                {cov && (
                                  <span
                                    title={cov.title}
                                    className={`rounded px-1 ${
                                      a.coverage === "measured"
                                        ? "bg-sky-100 text-sky-900"
                                        : "bg-slate-100 text-slate-700"
                                    }`}
                                  >
                                    {cov.text}
                                  </span>
                                )}
                              </span>
                              <span className="font-mono">
                                {formatCapacity(capacityAtRisk(a))} of {formatCapacity(a.capacity)} {assetUnit}
                              </span>
                            </span>
                          </RankedRow>
                        </li>
                      );
                    })}
                  </ol>
                )}
                <ShowAllButton
                  expanded={allAssets}
                  total={rankedAssets.length}
                  onToggle={() => { setAllAssets((v) => !v); }}
                  controls={assetsId}
                  noun={showLng ? "terminals" : "refineries"}
                />
                <p className={`mt-1 ${NOTE}`}>
                  Ranked by capacity at risk (share × {assetUnit}); assets without capacity data in
                  the source omitted.
                  {showLng &&
                    ` ${measuredCount.toString()} of ${rankedAssets.length.toString()} measured from voyages; the rest are capacity proxies.`}
                  {/* Asset attribution spreads a country figure across its
                      plants by capacity; spreading a *range* would multiply a
                      coarse proxy by an interval, so these rows quote the low
                      end and say so. */}
                  {combined &&
                    ` With two routes closed these use the low end of the range (see above).`}
                </p>
              </div>
              {showLngT3Footnote && (
                <p className={`mt-2 ${NOTE}`}>
                  2020–2024: terminal shares from LNG-T3 voyages (partial AIS coverage), scaled to
                  BACI country totals.
                </p>
              )}
            </>
          )}
        </section>
      )}

      {def && current && (
        <section className="mt-3" aria-label="Route shares used" data-testid="route-shares">
          <h3 className={`mb-1 ${HEADING}`}>
            Route shares used{routeRows.length > 0 ? ` (${routeRows.length.toString()})` : ""}
          </h3>
          {inputs === null ? (
            <p className={NOTE}>Loading citations…</p>
          ) : (
            <>
              <p className={`mb-1 ${NOTE}`}>
                Hand-set shares of each exporter&apos;s trade that uses {routesLabel}, with the
                document behind each.{combined ? " Both scenarios' rows are listed." : ""}
                {unsourcedCount > 0 &&
                  ` ${unsourcedCount.toString()} ${unsourcedCount === 1 ? "is an analyst estimate" : "are analyst estimates"} with no single supporting document.`}
              </p>
              <ul className="space-y-1">
                {routeRows.map((r) => (
                  <RouteShareItem key={r.key} row={r} nameOf={nameOf} showScenario={combined} />
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {def && current && (
        <section className="mt-3" aria-label="Why 0 %?" data-testid="why-zero">
          <label htmlFor={lookupId} className={`mb-1 block ${HEADING}`}>
            Check a country (why 0%?)
          </label>
          {/* The lookup reads a country's *imports*, whichever side the list
              above ranks — say so rather than let it read as the exporter
              figure it sits under (finding 9). */}
          {exporterView && (
            <p className={`mb-1 ${NOTE}`} data-testid="lookup-side-note">
              Importer side: this explains a country&apos;s exposure as a buyer — the share of its
              imports at risk — not the share of {noun} ranked above.
            </p>
          )}
          <input
            id={lookupId}
            type="text"
            list={datalistId}
            value={lookup}
            onChange={(e) => { setLookup(e.target.value); }}
            placeholder="Country name or ISO3, e.g. France"
            autoComplete="off"
            className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 placeholder:text-slate-500"
          />
          <datalist id={datalistId}>
            {countryOptions.map(([iso3, n]) => (
              <option key={iso3} value={n} />
            ))}
          </datalist>
          <p aria-live="polite" className="mt-1 text-xs leading-snug text-slate-700">
            {lookup.trim() === ""
              ? ""
              : lookupIso3 === null
                ? "No matching country."
                : explanation ?? "Loading…"}
          </p>
        </section>
      )}

      {def && current && <ScenarioContext result={current} view={view} />}
    </section>
  );
}
