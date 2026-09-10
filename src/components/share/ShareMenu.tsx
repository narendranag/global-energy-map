"use client";
import Link from "next/link";
import { createPortal } from "react-dom";
import { type KeyboardEvent as ReactKeyboardEvent, type Ref, useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { BUNDLED_CATALOG } from "@/lib/data-catalog/bundled";
import { loadCountries, countryNameMap } from "@/lib/geo/countries";
import { voyagesInRange, LNG_T3_FIRST_YEAR, LNG_T3_LAST_YEAR } from "@/lib/data/voyages";
import { getScenario } from "@/lib/scenarios/registry";
import type { ScenarioResult } from "@/lib/scenarios/types";
import { peekAppStore } from "@/lib/state/store";
import { encodeUrlState, type AppState } from "@/lib/url-state/encode";
import type { MapView } from "@/lib/state/view";
import { downloadText, todayIso } from "@/lib/export/browser";
import {
  apaCitation,
  bibtexCitation,
  entriesForTags,
  viewCitationText,
} from "@/lib/export/citation";
import { layerCsv, layerFilename, layerGeoJson } from "@/lib/export/files";
import {
  enabledLayers,
  LAYER_LABELS,
  layerExportStatus,
  layerTags,
  scenarioTags,
  type LayerKey,
} from "@/lib/export/layers";
import { scenarioCsv, scenarioFilename } from "@/lib/export/scenario";
import { CopyButton } from "./CopyButton";
import { loadLayerTable } from "./layer-data";

// ---------------------------------------------------------------------------
// Store snapshot (read-only; the store is owned by src/lib/state)
// ---------------------------------------------------------------------------

const noop = () => undefined;
const subscribe = (listener: () => void) => peekAppStore()?.subscribe(listener) ?? noop;
const getApp = (): AppState | null => peekAppStore()?.getApp() ?? null;
const getView = (): MapView | null => peekAppStore()?.getView() ?? null;
const getNull = () => null;

function useStoreSnapshot(): { app: AppState | null; view: MapView | null } {
  const app = useSyncExternalStore(subscribe, getApp, getNull);
  const view = useSyncExternalStore(subscribe, getView, getNull);
  return { app, view };
}

/** Absolute URL of the current view, built from the store (not the debounced address bar). */
function viewUrlFor(app: AppState, view: MapView): string {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}?${encodeUrlState(app, view)}`;
}

const btn =
  "rounded border border-slate-300 bg-white px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-700 disabled:cursor-not-allowed disabled:opacity-50";

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------

export function ShareMenu({ scenario }: { scenario: ScenarioResult | null }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  // The panel is portalled to <body> (fixed, anchored under the button): the
  // header is its own stacking context, so an in-header popover would sit
  // beneath the map's floating panels.
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);

  const close = useCallback((focusButton: boolean) => {
    setOpen(false);
    if (focusButton) buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(true);
    };
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      close(false);
    };
    const place = () => {
      const r = buttonRef.current?.getBoundingClientRect();
      if (r) setAnchor({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) });
    };
    place();
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("resize", place);
    };
  }, [open, close]);

  // Focus moves into the panel when it opens (it is portalled to the end of
  // <body>, so Tab from the button would otherwise skip it).
  useEffect(() => {
    if (!open || anchor === null) return;
    focusables(panelRef.current)[0]?.focus();
  }, [open, anchor]);

  /**
   * Keep the panel in the header's tab sequence as if it sat right after the
   * button: Shift+Tab off its first control returns to the button; Tab off its
   * last control closes it and continues to whatever follows the button.
   */
  const onPanelKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      if (e.key !== "Tab") return;
      const items = focusables(panelRef.current);
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        buttonRef.current?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        const button = buttonRef.current;
        if (!button) return;
        const after = focusables(document.body).find(
          (el) =>
            !panelRef.current?.contains(el) &&
            (button.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
        );
        e.preventDefault();
        close(false);
        (after ?? button).focus();
      }
    },
    [close],
  );

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => {
          setOpen((o) => !o);
        }}
        className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-ink shadow-sm hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-700 aria-expanded:bg-slate-100"
        data-testid="share-button"
      >
        Share / cite
      </button>
      {open &&
        anchor !== null &&
        createPortal(
          <SharePanel
            ref={panelRef}
            id={panelId}
            scenario={scenario}
            anchor={anchor}
            onKeyDown={onPanelKeyDown}
          />,
          document.body,
        )}
    </div>
  );
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Tabbable elements under `root`, in DOM order (visible ones only). */
function focusables(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => el.getClientRects().length > 0 && el.tabIndex >= 0,
  );
}

type CiteFormat = "apa" | "bibtex" | "view";

interface SharePanelProps {
  readonly ref: Ref<HTMLDivElement>;
  readonly id: string;
  readonly scenario: ScenarioResult | null;
  readonly anchor: { readonly top: number; readonly right: number };
  readonly onKeyDown: (e: ReactKeyboardEvent<HTMLDivElement>) => void;
}

function SharePanel({ ref, id, scenario, anchor, onKeyDown }: SharePanelProps) {
  const { app, view } = useStoreSnapshot();
  const [format, setFormat] = useState<CiteFormat>("view");
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);
  const headingId = `${id}-title`;

  const accessed = todayIso();
  const viewUrl = app && view ? viewUrlFor(app, view) : typeof window !== "undefined" ? window.location.href : "";

  const layers = useMemo(() => (app ? enabledLayers(app.layers) : []), [app]);
  const commodity = app?.commodity ?? "oil";
  const year = app?.year ?? 0;

  const sources = useMemo(() => {
    if (!app) return [];
    const tags = layers.flatMap((k) => layerTags(k, commodity));
    if (app.scenario) tags.push(...scenarioTags(app.scenario, commodity));
    return entriesForTags(tags, BUNDLED_CATALOG);
  }, [app, layers, commodity]);

  const scenarioLabel = app?.scenario ? getScenario(app.scenario).label : null;
  const summary = [
    String(year),
    commodity === "gas" ? "gas" : "oil",
    scenarioLabel ?? "no scenario",
  ].join(" · ");

  const citeText =
    format === "apa"
      ? apaCitation(undefined, { viewUrl, accessed })
      : format === "bibtex"
        ? bibtexCitation(undefined, { viewUrl, accessed })
        : viewCitationText({
            viewUrl,
            accessed,
            summary,
            layerLabels: layers.map((k) => LAYER_LABELS[k]),
            sources,
          });

  // The scenario prop can lag the store while the new result computes.
  const scenarioReady =
    scenario !== null &&
    app?.scenario === scenario.scenarioId &&
    app.year === scenario.year &&
    app.commodity === scenario.commodity;

  const onScenarioCsv = async () => {
    if (!scenario) return;
    setBusy("scenario");
    try {
      const names = await loadCountries().then(countryNameMap).catch(() => null);
      const csv = scenarioCsv(scenario, {
        viewUrl,
        exported: accessed,
        catalog: BUNDLED_CATALOG,
        countryNames: names,
      });
      downloadText(scenarioFilename(scenario), csv, "text/csv");
      setStatus("Scenario table downloaded.");
    } finally {
      setBusy(null);
    }
  };

  const onLayer = async (key: LayerKey, ext: "csv" | "geojson") => {
    const st = layerExportStatus(key, commodity, BUNDLED_CATALOG);
    if (!st.exportable) return;
    setBusy(`${key}:${ext}`);
    try {
      const table = await loadLayerTable(key, year);
      if (!table) {
        setStatus(`${st.label}: nothing to export.`);
        return;
      }
      const ctx = { viewUrl, exported: accessed };
      if (ext === "csv") {
        downloadText(layerFilename(key, year, "csv"), layerCsv(st, table, ctx), "text/csv");
      } else {
        downloadText(layerFilename(key, year, "geojson"), layerGeoJson(st, table, ctx), "application/geo+json");
      }
      setStatus(`${st.label}: ${String(table.rows.length)} rows downloaded (${ext.toUpperCase()}).`);
    } catch (err: unknown) {
      console.error("export failed:", err);
      setStatus(`${st.label}: export failed.`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      ref={ref}
      id={id}
      role="dialog"
      onKeyDown={onKeyDown}
      style={{ top: anchor.top, right: anchor.right, maxHeight: `calc(100vh - ${String(anchor.top + 16)}px)` }}
      aria-labelledby={headingId}
      className="fixed z-[1000] w-[28rem] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border border-panel-border bg-white p-4 text-left text-ink shadow-xl"
      data-testid="share-panel"
    >
      <h2 id={headingId} className="sr-only">
        Share, cite and export this view
      </h2>

      {/* ---- Link ---- */}
      <section aria-label="Link to this view">
        <div className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Link to this view</div>
        <div className="mt-1.5 flex items-center gap-2">
          <input
            readOnly
            value={viewUrl}
            aria-label="URL of this view"
            onFocus={(e) => {
              e.currentTarget.select();
            }}
            className="min-w-0 flex-1 rounded border border-slate-300 bg-slate-50 px-2 py-1 font-mono text-2xs text-slate-700"
          />
          <CopyButton
            text={() => viewUrl}
            label="Copy link"
            onCopied={() => {
              setStatus("Link copied.");
            }}
          />
        </div>
        <p className="mt-1 text-2xs text-ink-subtle">
          Includes mode, year, commodity, scenario, layers and map position.
        </p>
      </section>

      {/* ---- Cite ---- */}
      <section aria-label="Cite this view" className="mt-4 border-t border-panel-border pt-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Cite this view</div>
          <div role="group" aria-label="Citation format" className="flex overflow-hidden rounded border border-slate-300 text-2xs">
            {(
              [
                ["view", "View + sources"],
                ["apa", "APA"],
                ["bibtex", "BibTeX"],
              ] as const
            ).map(([f, label]) => (
              <button
                key={f}
                type="button"
                aria-pressed={format === f}
                onClick={() => {
                  setFormat(f);
                }}
                className={`px-2 py-0.5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sky-700 ${
                  format === f ? "bg-slate-800 text-white" : "bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <pre
          // Scrollable, so it must be reachable by keyboard (WCAG 2.1.1).
          tabIndex={0}
          aria-label="Citation text"
          className="mt-1.5 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded border border-panel-border bg-slate-50 p-2 font-mono text-2xs leading-snug text-ink"
          data-testid="cite-text"
        >
          {citeText}
        </pre>
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span className="text-2xs text-ink-subtle">
            {sources.length} {sources.length === 1 ? "source" : "sources"} behind the visible layers
            {app?.scenario ? " and scenario" : ""}.
          </span>
          <CopyButton
            text={() => citeText}
            label="Copy citation"
            onCopied={() => {
              setStatus("Citation copied.");
            }}
          />
        </div>
      </section>

      {/* ---- Download ---- */}
      <section aria-label="Download" className="mt-4 border-t border-panel-border pt-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Download</div>
        <ul className="mt-1.5 space-y-2 text-xs">
          <li>
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-ink">Scenario table</span>
              <button
                type="button"
                className={btn}
                disabled={!scenarioReady || busy !== null}
                onClick={() => {
                  void onScenarioCsv();
                }}
                data-testid="download-scenario-csv"
              >
                CSV
              </button>
            </div>
            <p className="mt-0.5 text-2xs leading-snug text-ink-subtle">
              {app?.scenario == null
                ? "Pick a disruption scenario to export its importer and asset table."
                : !scenarioReady
                  ? "Computing the scenario…"
                  : "Derived analysis (BACI imports × cited route shares); the file header cites every input."}
            </p>
          </li>
          {layers.length === 0 && <li className="text-2xs text-ink-subtle">No layers are switched on.</li>}
          {layers.map((key) => {
            const st = layerExportStatus(key, commodity, BUNDLED_CATALOG);
            const outOfRange = key === "lng_voyages" && !voyagesInRange(year);
            const enabled = st.exportable && !outOfRange && busy === null;
            const reason = !st.exportable
              ? st.reason
              : outOfRange
                ? `LNG-T3 voyages cover ${String(LNG_T3_FIRST_YEAR)}–${String(LNG_T3_LAST_YEAR)} only.`
                : null;
            return (
              <li key={key}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-ink">{st.label}</span>
                  <span className="flex gap-1.5">
                    <button
                      type="button"
                      className={btn}
                      disabled={!enabled}
                      aria-label={`Download ${st.label} as CSV`}
                      onClick={() => {
                        void onLayer(key, "csv");
                      }}
                    >
                      {busy === `${key}:csv` ? "…" : "CSV"}
                    </button>
                    <button
                      type="button"
                      className={btn}
                      disabled={!enabled}
                      aria-label={`Download ${st.label} as GeoJSON`}
                      onClick={() => {
                        void onLayer(key, "geojson");
                      }}
                    >
                      {busy === `${key}:geojson` ? "…" : "GeoJSON"}
                    </button>
                  </span>
                </div>
                {reason && <p className="mt-0.5 text-2xs leading-snug text-ink-subtle">{reason}</p>}
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-2xs leading-snug text-ink-subtle">
          Exports include only CC BY 4.0, public-domain and project-derived rows, each with its source,
          licence and as-of date.{" "}
          <Link href="/data" className="text-sky-800 underline underline-offset-2 hover:text-sky-950">
            All datasets and licences
          </Link>
        </p>
      </section>

      <p className="mt-2 min-h-4 text-2xs text-emerald-800" aria-live="polite" role="status">
        {status}
      </p>
    </div>
  );
}
