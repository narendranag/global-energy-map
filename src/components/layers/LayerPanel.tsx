"use client";
import { useId, useState } from "react";
import { TIME_AWARE, TIME_AWARE_NOTE, timeAwareLabel } from "@/lib/symbology/time-aware";
import { Chevron } from "@/components/ui/Chevron";
import { Legend } from "./Legend";

export interface LayerState {
  reserves: boolean;
  basins: boolean;
  extraction: boolean;
  pipelines: boolean;
  refineries: boolean;
  storage: boolean;
  ports: boolean;
  gas_pipelines: boolean;
  lng_terminals: boolean;
  lng_voyages: boolean;     // Phase 6
}

export interface LayerPanelProps {
  readonly state: LayerState;
  readonly onChange: (next: LayerState) => void;
  /** Imports noun while a scenario is active — adds the exposure ramp to the legend. */
  readonly scenarioNoun?: string | undefined;
  /**
   * Whether the "Layers" disclosure starts expanded (Infrastructure: yes;
   * Flows / Scenarios: no). Remount with a new `key` to re-apply on a mode
   * change.
   */
  readonly defaultOpen?: boolean;
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

const BADGE_CLASS: Record<"yes" | "partial" | "no", string> = {
  yes: "border-slate-400 bg-slate-100 text-slate-700",
  partial: "border-slate-300 bg-white text-slate-600",
  no: "border-transparent text-slate-500",
};

/**
 * Left panel: the "Layers" disclosure (toggles + time-aware badges) above the
 * Legend. Below 768 px the whole card collapses to its header until tapped.
 */
export function LayerPanel({ state, onChange, scenarioNoun, defaultOpen = true }: LayerPanelProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const uid = useId();
  const listId = `${uid}-layers`;
  const bodyId = `${uid}-body`;
  const activeCount = Object.values(state).filter(Boolean).length;

  return (
    <section
      aria-label="Layers and legend"
      className="pointer-events-auto absolute left-4 top-4 z-10 flex max-h-[calc(100%-9rem)] w-72 flex-col rounded-md border border-slate-200 bg-white/95 text-sm text-slate-800 shadow-lg backdrop-blur max-md:max-h-[calc(100%-16rem)] max-md:w-auto max-md:max-w-[calc(100%-2rem)]"
    >
      {/* Phone-only header: the whole card collapses to this. */}
      <button
        type="button"
        className="flex items-center gap-2 px-3 py-2 text-xs font-medium uppercase tracking-wide text-slate-700 md:hidden"
        aria-expanded={phoneOpen}
        aria-controls={bodyId}
        onClick={() => {
          setPhoneOpen((v) => !v);
        }}
      >
        <Chevron open={phoneOpen} />
        Layers &amp; legend
      </button>
      <div
        id={bodyId}
        className={
          "min-h-0 overflow-y-auto overscroll-contain p-3 max-md:pt-0 md:block " +
          (phoneOpen ? "block" : "hidden")
        }
      >
        <button
          type="button"
          className="flex w-full items-center gap-2 text-left text-xs font-medium uppercase tracking-wide text-slate-600 hover:text-slate-900"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => {
            setOpen((v) => !v);
          }}
        >
          <Chevron open={open} />
          <span>Layers</span>
          <span className="ml-auto text-[11px] font-normal normal-case tracking-normal text-slate-500">
            {activeCount} on
          </span>
        </button>
        <div id={listId} hidden={!open} className="mt-2 space-y-1.5">
          {ROWS.map((r, idx) =>
            r.kind === "group" ? (
              <div
                key={`group-${String(idx)}`}
                className="pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500"
              >
                {r.label}
              </div>
            ) : (
              <div key={r.key} className="flex items-center gap-2">
                <input
                  id={`${uid}-${r.key}`}
                  type="checkbox"
                  checked={state[r.key]}
                  onChange={(e) => {
                    onChange({ ...state, [r.key]: e.target.checked });
                  }}
                />
                <label htmlFor={`${uid}-${r.key}`} className="min-w-0 flex-1 truncate">
                  {r.label}
                </label>
                <span
                  title={TIME_AWARE_NOTE[r.key]}
                  data-testid={`time-badge-${r.key}`}
                  className={
                    "shrink-0 whitespace-nowrap rounded border px-1 text-[11px] leading-4 " +
                    BADGE_CLASS[TIME_AWARE[r.key]]
                  }
                >
                  {timeAwareLabel(r.key)}
                </span>
              </div>
            ),
          )}
        </div>
        <div className="mt-3 border-t border-slate-200 pt-2">
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-600">Legend</div>
          <Legend layers={state} scenarioNoun={scenarioNoun} />
        </div>
      </div>
    </section>
  );
}
