"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { EXAMPLE_QUESTIONS, type ExampleQuestion } from "@/lib/modes";
import { BUNDLED_CATALOG } from "@/lib/data-catalog/bundled";
import { coverageHorizon } from "@/lib/data/vintage";
import { YEAR_MAX, YEAR_MIN } from "@/lib/time/range";

export const INTRO_DISMISSED_KEY = "gem.intro.dismissed.v1";

/**
 * Computed once from the bundled catalog: a data refresh moves these dates
 * with no edit here, which is the point - the old copy hard-coded
 * "1990-2024" and so told a first-time reader the map stopped at 2024 when
 * four of its layers run past it.
 */
const HORIZON = coverageHorizon(BUNDLED_CATALOG, YEAR_MIN, YEAR_MAX);

/**
 * Returns true if the search string contains any explicit state parameters
 * that indicate the visitor arrived on a deep link (scenario, layers, year,
 * commodity, lon, lat, or z). A bare `/` or just `mode=` returns false
 * (the card should show).
 */
export function hasExplicitState(search: string): boolean {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const explicitParams = ["scenario", "layers", "year", "commodity", "lon", "lat", "z"];
  return explicitParams.some((key) => params.has(key));
}

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(INTRO_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

/** Dismissal is only ever changed by this component, so nothing to subscribe to. */
function subscribeNever(): () => void {
  return () => undefined;
}

function writeDismissed(): void {
  try {
    window.localStorage.setItem(INTRO_DISMISSED_KEY, "1");
  } catch {
    // Storage blocked (private mode, site-data settings): dismiss for this visit only.
  }
}

export interface IntroCardProps {
  /** Apply an example question's state. The card dismisses itself afterwards. */
  readonly onPick: (q: ExampleQuestion) => void;
}

/**
 * First-run card: three things the map does, and example questions that set
 * the whole view. Not server-rendered (localStorage is client-only); hidden for
 * good once dismissed (Escape, ×, "Got it", or picking a question).
 */
export function IntroCard({ onPick }: IntroCardProps) {
  // Server snapshot says "dismissed", so the server render and hydration
  // agree (no card); the client snapshot then reads localStorage.
  const stored = useSyncExternalStore(subscribeNever, readDismissed, () => true);
  const [dismissedNow, setDismissedNow] = useState(false);

  // Read the initial search once at mount to check if visitor arrived on a
  // deep link (explicit state params). If so, hide the card to uncover what
  // they came to see.
  const searchParams = useSearchParams();
  const [hasInitialState] = useState(() => hasExplicitState(searchParams.toString()));

  const visible = !stored && !dismissedNow && !hasInitialState;

  const cardRef = useRef<HTMLElement>(null);

  const dismiss = useCallback(() => {
    writeDismissed();
    // Focus would otherwise fall back to <body> with the card: hand it to the
    // selected mode tab, the start of the page's controls. Next frame, so an
    // example question's mode change has rendered first.
    const hadFocus = cardRef.current?.contains(document.activeElement) ?? false;
    setDismissedNow(true);
    if (hadFocus) {
      requestAnimationFrame(() => {
        document.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus();
      });
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Escape inside another popup (the share panel) closes that one only.
      if (document.activeElement?.closest('[role="dialog"]')) return;
      dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [visible, dismiss]);

  if (!visible) return null;

  return (
    <section
      ref={cardRef}
      aria-labelledby="intro-title"
      data-testid="intro-card"
      className="pointer-events-auto absolute z-30 rounded-md border border-slate-200 bg-white/95 p-4 text-sm text-slate-800 shadow-xl backdrop-blur max-lg:inset-x-4 max-lg:top-16 max-lg:mx-auto max-lg:max-w-xl max-md:top-14 lg:left-[20rem] lg:top-4 lg:w-[min(24rem,calc(100%-20rem-22rem))]"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 id="intro-title" className="text-sm font-semibold text-slate-900">
          What this map can answer
        </h2>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss introduction"
          className="-mr-1 -mt-1 rounded px-1.5 text-base leading-none text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        >
          ×
        </button>
      </div>
      <ul className="mt-2 list-disc space-y-1 pl-4 text-[13px] leading-snug text-slate-700">
        <li>
          <span className="font-medium text-slate-900">Hover</span> any country, pipeline or
          terminal for its value, year and source.
        </li>
        <li>
          <span className="font-medium text-slate-900">Slide through time</span>,{" "}
          {HORIZON.timeline.from}–{HORIZON.timeline.through} — the badges in the Layers panel say
          which layers respond.
        </li>
        <li>
          <span className="font-medium text-slate-900">Pick a disruption</span> in Scenarios to see
          which importers, refineries and LNG terminals are exposed.
        </li>
        <li>
          <span className="font-medium text-slate-900">Search</span> for a country, pipeline or
          terminal; select a country for its trade, suppliers and exposure — or write SQL against
          the same files on the Query page.
        </li>
      </ul>
      {HORIZON.beyond.length > 0 && (
        <div className="mt-3 rounded border border-slate-200 bg-slate-50 p-2" data-testid="intro-coverage">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
            How current the data is
          </p>
          <p className="mt-1 text-[12px] leading-snug text-slate-700">
            The timeline ends at {HORIZON.timeline.through}, the last year of reconciled bilateral
            trade (BACI) that the scenarios are built on. These layers are newer and ignore the
            slider:
          </p>
          <ul className="mt-1 space-y-0.5 text-[12px] leading-snug text-slate-700">
            {HORIZON.beyond.map((b) => (
              <li key={b.id} className="flex justify-between gap-2">
                <span className="min-w-0 truncate">{b.label}</span>
                <span className="shrink-0 tabular-nums font-medium text-slate-900">{b.through}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[11px] leading-snug text-slate-600">
            Full dates and update cadence on the{" "}
            <a className="underline hover:text-slate-900" href="/methodology#how-current-each-layer-is">
              Methodology
            </a>{" "}
            page.
          </p>
        </div>
      )}
      <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
        Try a question
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {EXAMPLE_QUESTIONS.map((q) => (
          <button
            key={q.id}
            type="button"
            data-testid={`example-${q.id}`}
            onClick={() => {
              onPick(q);
              dismiss();
            }}
            className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-left text-xs leading-snug text-slate-700 hover:border-slate-500 hover:bg-slate-50 hover:text-slate-900"
          >
            {q.label}
          </button>
        ))}
      </div>
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={dismiss}
          className="rounded bg-slate-800 px-3 py-1 text-xs font-medium text-white hover:bg-slate-900"
        >
          Got it
        </button>
      </div>
    </section>
  );
}
