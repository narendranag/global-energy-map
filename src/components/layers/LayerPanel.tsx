"use client";
import { useId, useState } from "react";
import { TIME_AWARE, TIME_AWARE_NOTE, timeAwareLabel } from "@/lib/symbology/time-aware";
import { Chevron } from "@/components/ui/Chevron";
import { LAYER_LABELS } from "@/lib/export/layers";
import { STALE_AFTER_MONTHS, formatVintage, isStale, layerVintages, staleNote } from "@/lib/data/vintage";
import { useToday } from "./useToday";
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
  gas_storage: boolean;     // GIE AGSI — live, slider-independent
  shale_regions: boolean;   // EIA STEO — US shale-region production, annual
  recent_imports: boolean;  // UN Comtrade — latest 12 reported months, slider-independent
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
  /**
   * Embed mode (S7): collapse the whole card to a small "Legend" toggle at
   * every viewport width, not just under 768 px. `defaultOpen` still governs
   * the inner "Layers" disclosure once expanded.
   */
  readonly embedded?: boolean;
}

type Row =
  | { kind: "toggle"; key: keyof LayerState; label: string }
  | { kind: "group"; label: string };

const ROWS: readonly Row[] = [
  { kind: "group", label: "Geology" },
  { kind: "toggle", key: "reserves", label: "Reserves (country)" },
  { kind: "toggle", key: "basins", label: "Basins" },
  { kind: "toggle", key: "shale_regions", label: "US shale regions" },
  { kind: "group", label: "Oil" },
  { kind: "toggle", key: "extraction", label: "Extraction sites" },
  { kind: "toggle", key: "pipelines", label: "Oil pipelines" },
  { kind: "toggle", key: "refineries", label: "Refineries" },
  { kind: "toggle", key: "storage", label: "Storage hubs" },
  { kind: "toggle", key: "ports", label: "Ports" },
  { kind: "group", label: "Gas" },
  { kind: "toggle", key: "gas_pipelines", label: "Gas pipelines" },
  { kind: "toggle", key: "lng_terminals", label: "LNG terminals" },
  { kind: "toggle", key: "lng_voyages", label: "LNG voyages" },
  { kind: "toggle", key: "gas_storage", label: "Gas storage (EU)" },
  { kind: "group", label: "Trade" },
  { kind: "toggle", key: "recent_imports", label: "Recent imports (Comtrade)" },
];

const BADGE_CLASS: Record<"yes" | "partial" | "no" | "live", string> = {
  yes: "border-slate-400 bg-slate-100 text-slate-700",
  partial: "border-slate-300 bg-white text-slate-600",
  no: "border-transparent text-slate-600",
  // Cool tint, matching the layer's own ramp, to read as "this is current".
  live: "border-sky-600 bg-sky-50 text-sky-900",
};

// Static: the catalog is bundled at build, so this never changes at runtime.
const VINTAGES = layerVintages(LAYER_LABELS);
const VINTAGE_BY_KEY = new Map(VINTAGES.map((v) => [v.key, v]));

/** "old" beside a layer whose data ended more than STALE_AFTER_MONTHS ago. */
function StaleBadge({ layer, today }: { layer: keyof LayerState; today: string | null }) {
  const v = VINTAGE_BY_KEY.get(layer);
  if (today === null || v === undefined || !isStale(v, today)) return null;
  const note = staleNote(v, today);
  return (
    <span
      title={note}
      data-testid={`stale-badge-${layer}`}
      className="shrink-0 whitespace-nowrap rounded border border-amber-600 bg-amber-50 px-1 text-[11px] leading-4 text-amber-900"
    >
      old<span className="sr-only">: {note}</span>
    </span>
  );
}

/**
 * Left panel: the "Layers" disclosure (toggles + time-aware badges) above the
 * Legend. Below 768 px the whole card collapses to its header until tapped.
 */
export function LayerPanel({
  state,
  onChange,
  scenarioNoun,
  defaultOpen = true,
  embedded = false,
}: LayerPanelProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [vintageOpen, setVintageOpen] = useState(false);
  const uid = useId();
  const listId = `${uid}-layers`;
  const bodyId = `${uid}-body`;
  const vintageId = `${uid}-vintage`;
  const activeCount = Object.values(state).filter(Boolean).length;
  // Null until mounted: staleness is judged against the reader's today.
  const today = useToday();

  return (
    <section
      aria-label="Layers and legend"
      className="pointer-events-auto absolute left-4 top-4 z-10 flex max-h-[calc(100%-9rem)] w-72 flex-col rounded-md border border-slate-200 bg-white/95 text-sm text-slate-800 shadow-lg backdrop-blur max-md:max-h-[calc(100%-16rem)] max-md:w-auto max-md:max-w-[calc(100%-2rem)]"
    >
      {/* Phone-only header (or always, in embed mode): the whole card collapses to this. */}
      <button
        type="button"
        className={
          "flex items-center gap-2 px-3 py-2 text-xs font-medium uppercase tracking-wide text-slate-700 " +
          (embedded ? "" : "md:hidden")
        }
        aria-expanded={phoneOpen}
        aria-controls={bodyId}
        onClick={() => {
          setPhoneOpen((v) => !v);
        }}
      >
        <Chevron open={phoneOpen} />
        {embedded ? "Legend" : "Layers & legend"}
      </button>
      <div
        id={bodyId}
        className={
          "min-h-0 overflow-y-auto overscroll-contain p-3 max-md:pt-0 " +
          (embedded ? "" : "md:block ") +
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
          <span className="ml-auto text-[11px] font-normal normal-case tracking-normal text-slate-600">
            {activeCount} on
          </span>
        </button>
        <div id={listId} hidden={!open} className="mt-2 space-y-1.5">
          {ROWS.map((r, idx) =>
            r.kind === "group" ? (
              <div
                key={`group-${String(idx)}`}
                className="pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-600"
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
                <StaleBadge layer={r.key} today={today} />
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
          <h2 className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-600">Legend</h2>
          <Legend layers={state} scenarioNoun={scenarioNoun} />
        </div>
        <div className="mt-3 border-t border-slate-200 pt-2">
          <button
            type="button"
            className="flex w-full items-center gap-2 text-left text-xs font-medium uppercase tracking-wide text-slate-600 hover:text-slate-900"
            aria-expanded={vintageOpen}
            aria-controls={vintageId}
            onClick={() => {
              setVintageOpen((v) => !v);
            }}
          >
            <Chevron open={vintageOpen} />
            <span>Data vintage</span>
          </button>
          {/* Generated from catalog.json, so it cannot drift from the data. */}
          <div id={vintageId} hidden={!vintageOpen} className="mt-2" data-testid="data-vintage">
            <p className="mb-1.5 text-[11px] leading-4 text-slate-600">
              When each layer&apos;s data ends (&ldquo;as of&rdquo; for snapshots). Older than{" "}
              {STALE_AFTER_MONTHS} months is marked old.
            </p>
            <dl className="space-y-1">
              {VINTAGES.map((v) => {
                const stale = today !== null && isStale(v, today);
                return (
                  <div key={v.key} className="flex items-baseline gap-2 text-[11px] leading-4">
                    <dt className="min-w-0 flex-1 truncate text-slate-700">{v.label}</dt>
                    <dd
                      className={"shrink-0 tabular-nums " + (stale ? "font-medium text-amber-900" : "text-slate-600")}
                      title={stale ? staleNote(v, today) : undefined}
                    >
                      {formatVintage(v)}
                      {stale && " · old"}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </div>
        </div>
      </div>
    </section>
  );
}
