"use client";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { readChoice, setChoice, subscribeChoice, type Choice } from "./consent";

const BUTTON =
  "min-h-9 flex-1 rounded border border-ink px-3 py-1 text-sm font-medium text-ink hover:bg-ink hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:flex-none";

/**
 * Shown only on a measured visit (see `GoogleTagManager`) with no stored choice.
 * "denied" on the server and during hydration, so it never flashes into the HTML.
 */
export function ConsentBanner() {
  const choice = useSyncExternalStore<Choice>(subscribeChoice, readChoice, () => "denied");
  if (choice !== null) return null;
  // An embedded map (`?embed=1`) shows no overlay; it simply stays denied.
  if (new URLSearchParams(window.location.search).get("embed") === "1") return null;
  return (
    <div
      role="region"
      aria-label="Cookie consent"
      data-testid="consent-banner"
      className="fixed inset-x-2 bottom-2 z-50 mx-auto flex max-w-xl flex-col gap-2 rounded border border-panel-border bg-panel-solid p-3 text-sm leading-snug text-ink shadow-lg sm:flex-row sm:items-center sm:gap-4"
    >
      <p className="m-0">
        This site uses Google Analytics cookies to see which pages are read, only if you allow it.{" "}
        <Link href="/privacy" className="text-sky-800 underline underline-offset-2 hover:text-sky-950">
          Privacy
        </Link>
      </p>
      <div className="flex gap-2">
        <button type="button" className={BUTTON} onClick={() => {
            setChoice("granted");
          }}>
          Allow
        </button>
        <button type="button" className={BUTTON} onClick={() => {
            setChoice("denied");
          }}>
          Decline
        </button>
      </div>
    </div>
  );
}
