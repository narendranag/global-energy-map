"use client";
import { useRef, type KeyboardEvent } from "react";
import { MODE_DEFS, MODES, type Mode } from "@/lib/modes";

export interface ModeTabsProps {
  readonly value: Mode;
  /** `via` lets the page move focus on a click but leave it on the tab for arrow keys. */
  readonly onChange: (mode: Mode, via: "pointer" | "keyboard") => void;
}

/**
 * The three modes as a tablist (roving tabindex; ←/→/Home/End move and
 * select). Selecting a tab applies that mode's preset — see `applyMode`.
 */
export function ModeTabs({ value, onChange }: ModeTabsProps) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = MODES.indexOf(value);
    let next: number | null = null;
    if (e.key === "ArrowRight") next = (i + 1) % MODES.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + MODES.length) % MODES.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = MODES.length - 1;
    if (next === null) return;
    e.preventDefault();
    const mode = MODES[next];
    if (mode === undefined) return;
    onChange(mode, "keyboard");
    refs.current[next]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label="Mode"
      onKeyDown={onKeyDown}
      className="inline-flex shrink-0 rounded-md border border-slate-300 bg-slate-100 p-0.5 text-xs font-medium text-slate-700"
    >
      {MODES.map((m, idx) => {
        const selected = m === value;
        return (
          <button
            key={m}
            ref={(el) => {
              refs.current[idx] = el;
            }}
            type="button"
            role="tab"
            id={`mode-tab-${m}`}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            title={MODE_DEFS[m].blurb}
            data-testid={`mode-${m}`}
            onClick={() => {
              onChange(m, "pointer");
            }}
            className={
              "rounded px-3 py-1 transition-colors " +
              (selected
                ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-300"
                : "text-slate-600 hover:bg-white/70 hover:text-slate-900")
            }
          >
            {MODE_DEFS[m].label}
          </button>
        );
      })}
    </div>
  );
}
