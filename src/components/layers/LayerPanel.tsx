"use client";
import { Legend } from "./Legend";

export interface LayerState {
  reserves: boolean;
  extraction: boolean;
  pipelines: boolean;
  refineries: boolean;
}

export interface LayerPanelProps {
  readonly state: LayerState;
  readonly onChange: (next: LayerState) => void;
}

const ROWS: readonly { key: keyof LayerState; label: string }[] = [
  { key: "reserves", label: "Reserves (country)" },
  { key: "extraction", label: "Extraction sites" },
  { key: "pipelines", label: "Pipelines" },
  { key: "refineries", label: "Refineries" },
];

export function LayerPanel({ state, onChange }: LayerPanelProps) {
  return (
    <div className="pointer-events-auto absolute left-4 top-4 z-10 w-60 rounded-md bg-white/90 p-3 text-sm shadow-lg backdrop-blur">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-600">Layers</div>
      <div className="space-y-1.5">
        {ROWS.map((r) => (
          <label key={r.key} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={state[r.key]}
              onChange={(e) => {
                onChange({ ...state, [r.key]: e.target.checked });
              }}
            />
            <span>{r.label}</span>
          </label>
        ))}
      </div>
      <div className="mt-3 border-t border-slate-200 pt-2">
        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-600">Legend</div>
        <Legend />
      </div>
    </div>
  );
}
