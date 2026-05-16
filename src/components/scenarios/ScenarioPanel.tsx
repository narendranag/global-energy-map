"use client";
import type { Commodity, ScenarioId, ScenarioResult } from "@/lib/scenarios/types";
import { SCENARIOS, type ScenarioDef } from "@/lib/scenarios/registry";

export interface ScenarioPanelProps {
  readonly active: ScenarioId | null;
  readonly onChange: (id: ScenarioId | null) => void;
  readonly commodity: Commodity;
  readonly result: ScenarioResult | null;
}

function findScenario(id: ScenarioId): ScenarioDef | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

export function ScenarioPanel({ active, onChange, commodity, result }: ScenarioPanelProps) {
  const def = active ? findScenario(active) : undefined;
  // Filter the dropdown to scenarios applicable to the active commodity.
  const visibleScenarios = SCENARIOS.filter((s) => s.commodities.includes(commodity));
  const topImporters = result?.rankedImporters.slice(0, 6) ?? [];
  const showLng = commodity === "gas";
  const topAssets = showLng
    ? result?.rankedLngImports.slice(0, 6) ?? []
    : result?.rankedRefineries.slice(0, 6) ?? [];
  const assetLabel = showLng ? "Top LNG import terminals at risk" : "Top refineries at risk";
  const assetUnit = showLng ? "mtpa" : "kbpd";

  return (
    <div className="pointer-events-auto absolute right-4 top-4 z-10 w-80 rounded-md bg-white/90 p-3 text-sm shadow-lg backdrop-blur">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-600">Scenario</div>
      <select
        value={active ?? ""}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === "" ? null : (v as ScenarioId));
        }}
        className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm"
      >
        <option value="">None</option>
        {visibleScenarios.map((s) => (
          <option key={s.id} value={s.id}>{s.label}</option>
        ))}
      </select>
      {def && (
        <p className="mt-2 text-[10px] leading-tight text-slate-600">{def.description}</p>
      )}
      {def?.noteRecentYears && (
        <p className="mt-2 text-[10px] leading-tight text-amber-700">{def.noteRecentYears}</p>
      )}
      {result && (
        <>
          <div className="mt-3">
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-600">Top importers at risk</div>
            <ol className="space-y-0.5">
              {topImporters.map((r) => (
                <li key={r.iso3} className="flex justify-between font-mono text-xs">
                  <span>{r.iso3}</span>
                  <span>{(r.shareAtRisk * 100).toFixed(1)}%</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="mt-3">
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-600">{assetLabel}</div>
            <ol className="space-y-0.5">
              {topAssets.map((r) => {
                // Both RefineryImpact and LngImportImpact have asset_id, iso3, capacity, shareAtRisk
                const a = r as { asset_id: string; iso3: string; capacity: number; shareAtRisk: number };
                return (
                  <li key={a.asset_id} className="flex justify-between font-mono text-xs">
                    <span className="truncate pr-2">{a.iso3} · {a.capacity.toFixed(0)} {assetUnit}</span>
                    <span>{(a.shareAtRisk * 100).toFixed(1)}%</span>
                  </li>
                );
              })}
            </ol>
          </div>
        </>
      )}
    </div>
  );
}
