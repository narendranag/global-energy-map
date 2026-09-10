"use client";
import { useId, useMemo, useState } from "react";
import type { Commodity, ScenarioId, ScenarioResult } from "@/lib/scenarios/types";
import {
  SCENARIOS,
  howComputed,
  scenarioDescription,
  type ScenarioDef,
} from "@/lib/scenarios/registry";
import { useCountryNames } from "@/lib/geo/useCountryNames";
import { EXPOSURE_LEGEND_STOPS, gradientCss } from "@/lib/symbology";
import { importsNoun, rankAssetsByCapacityAtRisk, rankImportersByShare } from "./overlay";
import { useScenarioInputsFor } from "./useScenario";
import { describeExposure, explainZeroExposure } from "./explain";
import {
  TOP_N,
  capacityAtRisk,
  coverageLabel,
  formatCapacity,
  formatVolume,
  pct,
  routeRowsForDisplay,
  sharePct,
  sortImporters,
  type ImporterSort,
  type RouteDisplayRow,
} from "./panel-model";

export interface ScenarioPanelProps {
  readonly active: ScenarioId | null;
  readonly onChange: (id: ScenarioId | null) => void;
  readonly commodity: Commodity;
  readonly result: ScenarioResult | null;
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
}: {
  row: RouteDisplayRow;
  nameOf: (iso3: string) => string;
}) {
  const importer = row.importer === null ? "all importers" : nameOf(row.importer);
  return (
    <li className="border-t border-slate-200 pt-1 first:border-t-0 first:pt-0">
      <div className="flex justify-between gap-2 text-xs">
        <span className="min-w-0 truncate">
          {nameOf(row.exporter)} → {importer}
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
            </details>
          )}
        </>
      )}
    </li>
  );
}

export function ScenarioPanel({ active, onChange, commodity, result }: ScenarioPanelProps) {
  const uid = useId();
  const selectId = `${uid}-scenario`;
  const lookupId = `${uid}-lookup`;
  const datalistId = `${uid}-countries`;
  const importersId = `${uid}-importers`;
  const assetsId = `${uid}-assets`;

  const def = active ? findScenario(active) : undefined;
  const names = useCountryNames();
  // Only render a result that belongs to the selected scenario + commodity
  // (the page may hand us the previous one while the next loads).
  const current =
    result !== null && result.scenarioId === active && result.commodity === commodity
      ? result
      : null;
  const inputs = useScenarioInputsFor(current);

  const [sortBy, setSortBy] = useState<ImporterSort>("share");
  const [allImporters, setAllImporters] = useState(false);
  const [allAssets, setAllAssets] = useState(false);
  const [lookup, setLookup] = useState("");

  const visibleScenarios = SCENARIOS.filter((s) => s.commodities.includes(commodity));
  const noun = importsNoun(commodity);
  const nameOf = (iso3: string): string => names?.get(iso3) ?? iso3;
  const volume = (t: number): string => formatVolume(t, commodity);

  const rankedImporters = useMemo(
    () =>
      current && names
        ? sortImporters(
            rankImportersByShare(current.byImporter, (iso3) => names.has(iso3)),
            sortBy,
          )
        : [],
    [current, names, sortBy],
  );
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

  const routeRows = useMemo(
    () => (inputs && active ? routeRowsForDisplay(inputs.routes, active) : []),
    [inputs, active],
  );
  const unsourcedCount = routeRows.filter((r) => r.unsourced).length;

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
          routeName: def.routeName,
          nameOf,
          formatVolume: volume,
        })
      : null;

  return (
    <div className="pointer-events-auto absolute right-4 top-4 z-10 w-80 rounded-md bg-white/95 p-3 text-sm text-slate-800 shadow-lg backdrop-blur">
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
      {def?.noteRecentYears && commodity === "oil" && (
        <p className="mt-2 text-[11px] leading-snug text-amber-800">{def.noteRecentYears}</p>
      )}
      {def && (
        <div className="mt-3" data-testid="scenario-metric">
          <p className="text-xs leading-snug text-slate-700">
            <span className="font-medium">% at risk</span> = share of each importer&apos;s{" "}
            {current ? `${current.year.toString()} ` : ""}
            {noun} (BACI, by volume) routed through {def.routeName}.
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
              {howComputed(def, commodity, current?.year ?? result?.year ?? 2020).map((s) => (
                <li key={s} className={NOTE}>{s}</li>
              ))}
            </ul>
          </details>
        </div>
      )}

      {def && (
        <section
          aria-live="polite"
          aria-busy={current === null}
          aria-label="Scenario results"
          className="mt-3"
          data-testid="scenario-results"
        >
          {current === null ? (
            <p className={NOTE}>Computing exposure…</p>
          ) : (
            <>
              <div className="mb-1 flex items-center justify-between gap-2">
                <h3 className={HEADING}>Top importers at risk</h3>
                <div role="group" aria-label="Sort importers by" className="flex text-[11px]">
                  {(["share", "volume"] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={sortBy === k}
                      onClick={() => { setSortBy(k); }}
                      className={`border border-slate-300 px-1.5 py-0.5 first:rounded-l last:rounded-r focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-700 ${
                        sortBy === k ? "bg-slate-700 text-white" : "bg-white text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      {k === "share" ? "Share" : "Volume"}
                    </button>
                  ))}
                </div>
              </div>
              {rankedImporters.length === 0 ? (
                <p className={NOTE}>No importer has {noun} routed through {def.routeName} in {current.year.toString()}.</p>
              ) : (
                <ol id={importersId} className="space-y-0.5" data-testid="ranked-importers">
                  {importerRows.map((r) => (
                    <li key={r.iso3} className="flex justify-between gap-2 text-xs">
                      <span className="min-w-0 truncate">
                        {nameOf(r.iso3)}{" "}
                        <span className="font-mono text-[11px] text-slate-500">{r.iso3}</span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="font-mono">{pct(r.shareAtRisk)}</span>{" "}
                        <span className="ml-1.5 inline-block min-w-[4.5rem] font-mono text-[11px] text-slate-600">
                          {volume(r.atRiskQty)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
              <ShowAllButton
                expanded={allImporters}
                total={rankedImporters.length}
                onToggle={() => { setAllImporters((v) => !v); }}
                controls={importersId}
                noun="importers"
              />
              <p className={`mt-1 ${NOTE}`}>
                {sortBy === "share"
                  ? "Ranked by share"
                  : `Ranked by volume at risk (${commodity === "gas" ? "Mt per year" : "kb/d, annual average"})`};
                importers under 0.1% of world {noun} omitted.
              </p>

              <div className="mt-3">
                <h3 className={`mb-1 ${HEADING}`}>{assetLabel}</h3>
                {rankedAssets.length === 0 ? (
                  <p className={NOTE}>No {showLng ? "terminal" : "refinery"} with capacity data is exposed.</p>
                ) : (
                  <ol id={assetsId} className="space-y-0.5" data-testid="ranked-assets">
                    {assetRows.map((a) => {
                      const cov = showLng && a.coverage ? coverageLabel(a.coverage) : null;
                      return (
                        <li key={a.asset_id} className="text-xs">
                          <div className="flex justify-between gap-2">
                            <span className="min-w-0 truncate" title={a.name ?? a.asset_id}>
                              {a.name ?? a.asset_id}{" "}
                              <span className="font-mono text-[11px] text-slate-500">{a.iso3}</span>
                            </span>
                            <span className="shrink-0 font-mono">{pct(a.shareAtRisk)}</span>
                          </div>
                          <div className="flex justify-between gap-2 text-[11px] text-slate-600">
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
                          </div>
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
                Hand-set shares of each exporter&apos;s trade that uses {def.routeName}, with the
                document behind each.
                {unsourcedCount > 0 &&
                  ` ${unsourcedCount.toString()} ${unsourcedCount === 1 ? "is an analyst estimate" : "are analyst estimates"} with no single supporting document.`}
              </p>
              {commodity === "gas" && (
                <p className="mb-1 text-[11px] leading-snug text-amber-800">
                  These shares were derived for crude and are applied unchanged to LNG. Where a
                  crude bypass exists (the UAE&apos;s Fujairah pipeline) LNG has none, so LNG
                  exposure to those exporters is understated.
                </p>
              )}
              <ul className="space-y-1">
                {routeRows.map((r) => (
                  <RouteShareItem key={r.key} row={r} nameOf={nameOf} />
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
    </div>
  );
}
