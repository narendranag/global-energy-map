"use client";
import { Legend } from "./Legend";

export interface LayerState {
  reserves: boolean;
  basins: boolean;          // NEW
  extraction: boolean;
  pipelines: boolean;
  refineries: boolean;
  storage: boolean;         // NEW
  ports: boolean;           // NEW
  gas_pipelines: boolean;
  lng_terminals: boolean;
  lng_voyages: boolean;     // Phase 6
}

export interface LayerPanelProps {
  readonly state: LayerState;
  readonly onChange: (next: LayerState) => void;
}

type Row =
  | { kind: "toggle"; key: keyof LayerState; label: string }
  | { kind: "group"; label: string };

const ROWS: readonly Row[] = [
  { kind: "group", label: "Geology" },
  { kind: "toggle", key: "reserves", label: "Reserves (country)" },
  { kind: "toggle", key: "basins", label: "Basins" },
  { kind: "group", label: "Oil" },
  { kind: "toggle", key: "extraction", label: "Extraction sites" },
  { kind: "toggle", key: "pipelines", label: "Oil pipelines" },
  { kind: "toggle", key: "refineries", label: "Refineries" },
  { kind: "toggle", key: "storage", label: "Storage hubs" },
  { kind: "toggle", key: "ports", label: "Ports" },
  { kind: "group", label: "Gas" },
  { kind: "toggle", key: "gas_pipelines", label: "Gas pipelines" },
  { kind: "toggle", key: "lng_terminals", label: "LNG terminals" },
  { kind: "toggle", key: "lng_voyages", label: "LNG voyages (2020–2024)" },
];

export function LayerPanel({ state, onChange }: LayerPanelProps) {
  return (
    <div className="pointer-events-auto absolute left-4 top-4 z-10 w-60 rounded-md bg-white/90 p-3 text-sm shadow-lg backdrop-blur">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-600">Layers</div>
      <div className="space-y-1.5">
        {ROWS.map((r, idx) =>
          r.kind === "group" ? (
            <div
              key={`group-${String(idx)}`}
              className="pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400"
            >
              {r.label}
            </div>
          ) : (
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
          ),
        )}
      </div>
      <div className="mt-3 border-t border-slate-200 pt-2">
        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-600">Legend</div>
        <Legend />
      </div>
    </div>
  );
}
