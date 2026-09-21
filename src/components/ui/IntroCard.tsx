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
      <p className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
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
      <ul className="mt-3 list-disc space-y-1 pl-4 text-[13px] leading-snug text-slate-700">
        <li>
          <span className="font-medium text-slate-900">Ask a disruption question</span> — close
          Hormuz, cut Druzhba, throttle a route to 40%: see which importers, exporters, refineries
          and LNG terminals are exposed, and by how much.
        </li>
        <li>
          <span className="font-medium text-slate-900">Every number says what year it is from</span>{" "}
          — each layer shows its latest data, and a scenario lists the vintage of everything behind
          its result.
        </li>
        <li>
          <span className="font-medium text-slate-900">Hover</span> any country, pipeline or
          terminal for its value, year and source.
        </li>
        <li>
          <span className="font-medium text-slate-900">Search</span> for a country, pipeline or
          terminal; select a country for its trade, suppliers and exposure — or write SQL against
          the same files on the Query page.
        </li>
      </ul>
      {HORIZON.beyond.length > 0 && (
        <p className="mt-2 text-[12px] leading-snug text-slate-600" data-testid="intro-coverage">
          Scenarios run on reconciled trade through {HORIZON.timeline.through};{" "}
          {HORIZON.beyond.length} {HORIZON.beyond.length === 1 ? "layer carries" : "layers carry"}{" "}
          newer data, to {HORIZON.beyond[0]?.through}.{" "}
          <a className="underline hover:text-slate-900" href="/methodology#how-current-each-layer-is">
            How current each layer is →
          </a>
        </p>
      )}
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
