"use client";
/**
 * Header search (S4): a WAI-ARIA 1.2 combobox over countries, pipelines, LNG
 * terminals, refineries, extraction sites, named basins and shale regions.
 * Nothing is fetched until the box is focused or typed into
 * (`useSearchIndex`); the matcher (`searchItems`) and index build
 * (`buildSearchItems`) are pure and live in `src/lib/search/`.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { selectSearchItem } from "@/lib/search/apply";
import { searchResultSubtitle } from "@/lib/search/format";
import { setSearchHighlight } from "@/lib/search/highlight";
import { searchItems } from "@/lib/search/match";
import type { SearchItem } from "@/lib/search/types";
import { useSearchIndex } from "@/lib/search/useSearchIndex";
import { useCamera } from "@/lib/state";
import { peekAppStore } from "@/lib/state/store";

const RESULT_LIMIT = 8;

function isTypingElsewhere(el: Element | null): boolean {
  if (el === null) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return (el as HTMLElement).isContentEditable;
}

/** Magnifying-glass icon for the phone-collapsed toggle. */
function SearchIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4">
      <circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M13.5 13.5 L18 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function SearchBox() {
  const camera = useCamera();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  // The index a user has explicitly navigated to (arrow keys); clamped below
  // against the *current* result list, so a fresh query (or the index
  // finishing its lazy load) always shows the top match highlighted without
  // a dedicated effect to "reset" it on every list change.
  const [rawActiveIndex, setRawActiveIndex] = useState(0);
  const [expandedOnPhone, setExpandedOnPhone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const uid = useId();
  const listboxId = `${uid}-listbox`;
  const inputId = `${uid}-input`;

  // Lazy: the loaders behind the index are not touched until the box has
  // been focused or typed into at least once (persists after that, so
  // re-focusing never re-triggers the "loading" state).
  const [everFocused, setEverFocused] = useState(false);
  const { items, loading } = useSearchIndex(everFocused);

  const results = useMemo<readonly SearchItem[]>(() => {
    if (items === null || query.trim() === "") return [];
    return searchItems(items, query, RESULT_LIMIT);
  }, [items, query]);

  const activeIndex = results.length === 0 ? -1 : Math.min(rawActiveIndex, results.length - 1);

  // "/" focuses the search box from anywhere else on the page.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      if (isTypingElsewhere(document.activeElement)) return;
      e.preventDefault();
      setExpandedOnPhone(true);
      setEverFocused(true);
      inputRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  // A5: the highlight ring is a leftover marker for a search result — it must
  // not survive past the moment it stops describing "where you are":
  // - a country picked by ANY means (not just through this search box — a
  //   map click on a different country goes through page.tsx/CountryPickLayer,
  //   never through `selectSearchItem`) makes any point-marker ring stale.
  // - unmounting the box (should not happen today, since it lives in the
  //   header for the app's lifetime, but a leaked module-level marker outliving
  //   its component would be a real bug if that ever changes).
  useEffect(() => {
    const store = peekAppStore();
    if (!store) return;
    let lastFocus = store.getApp().focus;
    const unsubscribe = store.subscribe(() => {
      const focus = store.getApp().focus;
      if (focus !== lastFocus) {
        lastFocus = focus;
        setSearchHighlight(null);
      }
    });
    return () => {
      unsubscribe();
      setSearchHighlight(null);
    };
  }, []);

  const commit = useCallback(
    (item: SearchItem) => {
      selectSearchItem(item, camera);
      setQuery(item.name);
      setOpen(false);
      setRawActiveIndex(0);
    },
    [camera],
  );

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      if (results.length > 0) setRawActiveIndex((activeIndex + 1) % results.length);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      if (results.length > 0) setRawActiveIndex((activeIndex - 1 + results.length) % results.length);
      return;
    }
    if (e.key === "Home" && open) {
      e.preventDefault();
      setRawActiveIndex(0);
      return;
    }
    if (e.key === "End" && open) {
      e.preventDefault();
      if (results.length > 0) setRawActiveIndex(results.length - 1);
      return;
    }
    if (e.key === "Enter") {
      const item = (activeIndex >= 0 ? results[activeIndex] : undefined) ?? results[0];
      if (item) {
        e.preventDefault();
        commit(item);
      }
      return;
    }
    if (e.key === "Escape") {
      // Closes the list first; a second Escape clears the text. Only past
      // both does the key fall through to the page (which clears `focus`).
      if (open) {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (query !== "") {
        e.preventDefault();
        setQuery("");
        setSearchHighlight(null);
      }
    }
  };

  const activeOptionId =
    activeIndex >= 0 && results[activeIndex] ? `${listboxId}-opt-${activeIndex.toString()}` : undefined;
  const showList = open && query.trim() !== "";
  const resultCountLabel =
    items === null
      ? loading
        ? "Loading names…"
        : ""
      : `${results.length.toString()} result${results.length === 1 ? "" : "s"}`;

  return (
    <div className="flex items-center">
      <button
        type="button"
        aria-label="Search"
        aria-expanded={expandedOnPhone}
        className="rounded p-1.5 text-slate-700 hover:bg-slate-100 md:hidden"
        onClick={() => {
          setExpandedOnPhone(true);
          setEverFocused(true);
          // The input mounts visible (`hidden` → shown) in the same tick.
          requestAnimationFrame(() => {
            inputRef.current?.focus();
          });
        }}
      >
        <SearchIcon />
      </button>
      <div className={"relative " + (expandedOnPhone ? "block" : "hidden") + " md:block"}>
        <label htmlFor={inputId} className="sr-only">
          Search the map
        </label>
        <input
          id={inputId}
          ref={inputRef}
          role="combobox"
          type="text"
          autoComplete="off"
          spellCheck={false}
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={activeOptionId}
          placeholder="Search countries, pipelines, terminals…"
          value={query}
          onFocus={() => {
            setEverFocused(true);
            if (results.length > 0) setOpen(true);
          }}
          onBlur={() => {
            setOpen(false);
            if (query.trim() === "") setExpandedOnPhone(false);
          }}
          onChange={(e) => {
            const next = e.target.value;
            setQuery(next);
            setRawActiveIndex(0);
            setOpen(true);
            // Cleared "by any means" (A5): Escape already handles that path;
            // backspacing to empty, cut/paste-to-empty and a programmatic
            // clear of the input all funnel through this one handler.
            if (next.trim() === "") setSearchHighlight(null);
          }}
          onKeyDown={onKeyDown}
          className="w-44 rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 placeholder:text-slate-500 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-700 sm:w-56 md:w-64"
        />
        {/*
          Portalled to <body>, not left inside <header>: the a11y focus-order
          test expects exactly one aria-live region in the header (the
          loading pill's), and screen readers announce a live region
          regardless of where it sits in the DOM. Gated on `everFocused`
          (starts false on both server and first client render, flips only
          from a user event), so this never runs during SSR.
        */}
        {everFocused &&
          createPortal(
            <div aria-live="polite" className="sr-only">
              {showList ? resultCountLabel : ""}
            </div>,
            document.body,
          )}
        {/*
          Always mounted (never conditionally unmounted) so `aria-controls`
          never names an id that does not exist — `hidden` keeps it out of
          the render and accessibility trees while closed.
        */}
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Search results"
          hidden={!showList}
          className="absolute left-0 top-full z-30 mt-1 max-h-72 w-64 overflow-y-auto rounded border border-slate-200 bg-white text-xs shadow-lg sm:w-72"
        >
          {showList &&
            (items === null ? (
              // role="option" (disabled) keeps the listbox's required-children
              // structure valid even while it holds only a status message.
              <li role="option" aria-selected={false} aria-disabled="true" className="px-2 py-1.5 text-slate-600">
                Loading names…
              </li>
            ) : results.length === 0 ? (
              <li role="option" aria-selected={false} aria-disabled="true" className="px-2 py-1.5 text-slate-600">
                No matches
              </li>
            ) : (
              results.map((item, idx) => (
                <li
                  key={item.id}
                  id={`${listboxId}-opt-${idx.toString()}`}
                  role="option"
                  aria-selected={idx === activeIndex}
                  className={
                    "cursor-pointer px-2 py-1.5 " + (idx === activeIndex ? "bg-sky-100" : "hover:bg-slate-50")
                  }
                  onMouseDown={(e) => {
                    // Keeps focus (and the list) in the input through the click.
                    e.preventDefault();
                  }}
                  onMouseEnter={() => {
                    setRawActiveIndex(idx);
                  }}
                  onClick={() => {
                    commit(item);
                  }}
                >
                  <div className="truncate font-medium text-slate-800">{item.name}</div>
                  <div className="truncate text-slate-600">{searchResultSubtitle(item)}</div>
                </li>
              ))
            ))}
        </ul>
      </div>
    </div>
  );
}
