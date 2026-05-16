"use client";
import type { ScenarioId } from "@/lib/scenarios/types";
import type { ScenarioResult } from "@/lib/scenarios/types";
import { SCENARIOS, type ScenarioDef } from "@/lib/scenarios/registry";

export interface ScenarioPanelProps {
  readonly active: ScenarioId | null;
  readonly onChange: (id: ScenarioId | null) => void;
  readonly result: ScenarioResult | null;
}

function findScenario(id: ScenarioId): ScenarioDef | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

export function ScenarioPanel({ active, onChange, result }: ScenarioPanelProps) {
  const def = active ? findScenario(active) : undefined;
  const topImporters = result?.rankedImporters.slice(0, 6) ?? [];
  const topRefineries = result?.rankedRefineries.slice(0, 6) ?? [];
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
        {SCENARIOS.map((s) => (
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
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-600">Top refineries at risk</div>
            <ol className="space-y-0.5">
              {topRefineries.map((r) => (
                <li key={r.asset_id} className="flex justify-between font-mono text-xs">
                  <span className="truncate pr-2">{r.iso3} · {r.capacity.toFixed(0)} kbpd</span>
                  <span>{(r.shareAtRisk * 100).toFixed(1)}%</span>
                </li>
              ))}
            </ol>
          </div>
        </>
      )}
    </div>
  );
}
