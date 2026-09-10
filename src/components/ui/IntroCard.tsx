"use client";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { EXAMPLE_QUESTIONS, type ExampleQuestion } from "@/lib/modes";

export const INTRO_DISMISSED_KEY = "gem.intro.dismissed.v1";

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
  const visible = !stored && !dismissedNow;

  const dismiss = useCallback(() => {
    writeDismissed();
    setDismissedNow(true);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [visible, dismiss]);

  if (!visible) return null;

  return (
    <section
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
          className="-mr-1 -mt-1 rounded px-1.5 text-base leading-none text-slate-500 hover:bg-slate-100 hover:text-slate-900"
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
          <span className="font-medium text-slate-900">Slide through time</span>, 1990–2024 — the
          badges in the Layers panel say which layers respond.
        </li>
        <li>
          <span className="font-medium text-slate-900">Pick a disruption</span> in Scenarios to see
          which importers, refineries and LNG terminals are exposed.
        </li>
      </ul>
      <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
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
