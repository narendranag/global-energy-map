"use client";
import type { ScenarioResult } from "@/lib/scenarios/engine";

export interface ScenarioPanelProps {
  readonly enabled: boolean;
  readonly onToggle: (v: boolean) => void;
  readonly result: ScenarioResult | null;
}

export function ScenarioPanel({ enabled, onToggle, result }: ScenarioPanelProps) {
  const top = result?.ranked?.slice(0, 8) ?? [];
  return (
    <div className="pointer-events-auto absolute right-4 top-4 z-10 w-80 rounded-md bg-white/90 p-3 text-sm shadow-lg backdrop-blur">
      <label className="flex items-center gap-2 font-medium">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => {
            onToggle(e.target.checked);
          }}
        />
        Close Strait of Hormuz
      </label>
      {enabled && result && (
        <div className="mt-3">
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-600">
            Top importers at risk
          </div>
          <ol className="space-y-0.5">
            {top.map((r) => (
              <li key={r.iso3} className="flex justify-between font-mono text-xs">
                <span>{r.iso3}</span>
                <span>{(r.shareAtRisk * 100).toFixed(1)}%</span>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-[10px] leading-tight text-slate-500">
            Note: Iran (IRN) exports are suppressed in BACI 2023+. Recent-year
            impact for partners who relied on Iranian crude may be understated.
          </p>
        </div>
      )}
    </div>
  );
}
