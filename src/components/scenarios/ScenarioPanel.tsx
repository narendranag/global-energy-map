"use client";
import type { Commodity, ScenarioId, ScenarioResult } from "@/lib/scenarios/types";
import { SCENARIOS, scenarioDescription, type ScenarioDef } from "@/lib/scenarios/registry";
import { useCountryNames } from "@/lib/geo/useCountryNames";
import { EXPOSURE_LEGEND_STOPS, gradientCss } from "@/lib/symbology";
import { importsNoun, rankAssetsByCapacityAtRisk, rankImportersByShare } from "./overlay";

export interface ScenarioPanelProps {
  readonly active: ScenarioId | null;
  readonly onChange: (id: ScenarioId | null) => void;
  readonly commodity: Commodity;
  readonly result: ScenarioResult | null;
}

function findScenario(id: ScenarioId): ScenarioDef | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

const LEGEND_GRADIENT = gradientCss(EXPOSURE_LEGEND_STOPS);

function pct(t: number): string {
  return `${(t * 100).toFixed(1)}%`;
}

export function ScenarioPanel({ active, onChange, commodity, result }: ScenarioPanelProps) {
  const def = active ? findScenario(active) : undefined;
  const names = useCountryNames();
  // Filter the dropdown to scenarios applicable to the active commodity.
  const visibleScenarios = SCENARIOS.filter((s) => s.commodities.includes(commodity));
  const noun = importsNoun(commodity);
  const topImporters =
    result && names
      ? rankImportersByShare(result.byImporter, (iso3) => names.has(iso3)).slice(0, 6)
      : [];
  const showLng = commodity === "gas";
  const topAssets = result
    ? rankAssetsByCapacityAtRisk<{
        asset_id: string;
        iso3: string;
        name?: string;
        shareAtRisk: number;
        capacity: number;
      }>(showLng ? result.byLngImport : result.byRefinery).slice(0, 6)
    : [];
  const assetLabel = showLng ? "Top LNG import terminals at risk" : "Top refineries at risk";
  const assetUnit = showLng ? "mtpa" : "kbpd";
  const showLngT3Footnote =
    showLng && (result?.byLngImport.some((i) => i.dataSource === "lng-t3") ?? false);
  const metricYear = result?.year;

  return (
    <div className="pointer-events-auto absolute right-4 top-4 z-10 w-80 rounded-md bg-white/90 p-3 text-sm text-slate-800 shadow-lg backdrop-blur">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-600">Scenario</div>
      <select
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
        <p className="mt-2 text-[10px] leading-tight text-slate-600">
          {scenarioDescription(def, commodity)}
        </p>
      )}
      {def?.noteRecentYears && commodity === "oil" && (
        <p className="mt-2 text-[10px] leading-tight text-amber-700">{def.noteRecentYears}</p>
      )}
      {def && (
        <div className="mt-3" data-testid="scenario-metric">
          <p className="text-[11px] leading-snug text-slate-700">
            <span className="font-medium">% at risk</span> = share of each importer&apos;s{" "}
            {metricYear !== undefined ? `${metricYear.toString()} ` : ""}
            {noun} (BACI, by volume) routed through {def.routeName}.
          </p>
          <div
            className="mt-1 h-2 w-full rounded border border-slate-200"
            style={{ background: LEGEND_GRADIENT }}
            aria-hidden="true"
          />
          <div className="flex justify-between text-[10px] text-slate-500">
            <span>0%</span>
            <span>100% of {noun}</span>
          </div>
        </div>
      )}
      {result && (
        <>
          <div className="mt-3">
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-600">Top importers at risk</div>
            <ol className="space-y-0.5" data-testid="ranked-importers">
              {topImporters.map((r) => (
                <li key={r.iso3} className="flex justify-between gap-2 text-xs">
                  <span className="truncate">
                    {names?.get(r.iso3) ?? r.iso3}{" "}
                    <span className="font-mono text-[10px] text-slate-400">{r.iso3}</span>
                  </span>
                  <span className="font-mono">{pct(r.shareAtRisk)}</span>
                </li>
              ))}
            </ol>
            <p className="mt-1 text-[10px] leading-tight text-slate-500">
              Ranked by share; importers under 0.1% of world {noun} omitted.
            </p>
          </div>
          <div className="mt-3">
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-600">{assetLabel}</div>
            <ol className="space-y-0.5" data-testid="ranked-assets">
              {topAssets.map((a) => (
                <li key={a.asset_id} className="flex justify-between gap-2 text-xs">
                  <span className="truncate" title={a.name ?? a.asset_id}>
                    {a.name ?? a.asset_id}{" "}
                    <span className="font-mono text-[10px] text-slate-400">{a.iso3}</span>
                  </span>
                  <span className="font-mono">{pct(a.shareAtRisk)}</span>
                </li>
              ))}
            </ol>
            <p className="mt-1 text-[10px] leading-tight text-slate-500">
              Ranked by capacity at risk (share × {assetUnit}); assets without capacity data in
              the source omitted.
            </p>
          </div>
          {showLngT3Footnote && (
            <p className="mt-2 text-[10px] leading-tight text-slate-500">
              2020–2024: terminal shares from LNG-T3 voyages (partial AIS coverage), scaled to
              BACI country totals.
            </p>
          )}
        </>
      )}
    </div>
  );
}
