import Link from "next/link";
import type { ReactNode } from "react";
import type { Mode } from "@/lib/modes";
import { ModeTabs } from "./ModeTabs";

export interface HeaderProps {
  readonly mode: Mode;
  readonly onModeChange: (mode: Mode, via: "pointer" | "keyboard") => void;
  /** Number of visible layers (and the scenario) still loading; 0 hides the pill. */
  readonly pending: number;
  /** Share / cite / export menu (Track C's `ShareMenu`). */
  readonly actions?: ReactNode;
}

/**
 * Full-width header bar: name + subtitle, mode tabs + loading pill, and (right)
 * the share slot and the Methodology / Data links. It sits *above* the map area
 * (not over it), so panels below never collide with it. Wraps to two rows
 * under 768 px.
 */
export function Header({ mode, onModeChange, pending, actions }: HeaderProps) {
  return (
    <header className="relative z-20 flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-slate-200 bg-white px-4 py-2 text-slate-800 shadow-sm">
      <div className="min-w-0">
        <h1 className="text-[15px] font-semibold leading-tight tracking-tight text-slate-900">
          Global Energy Map
        </h1>
        <p className="hidden text-xs leading-snug text-slate-600 xl:block">
          Oil &amp; gas reserves, infrastructure, LNG flows and disruption scenarios, 1990–2024.
        </p>
      </div>
      <div className="flex min-w-0 items-center gap-3 max-md:order-last max-md:w-full">
        <ModeTabs value={mode} onChange={onModeChange} />
        <div className="min-w-0" aria-live="polite">
          {pending > 0 && (
            <span
              role="status"
              className="inline-block whitespace-nowrap rounded-full bg-slate-800 px-2.5 py-0.5 text-[11px] font-medium text-white"
            >
              Loading {pending} {pending === 1 ? "layer" : "layers"}…
            </span>
          )}
        </div>
      </div>
      <nav aria-label="Site" className="ml-auto flex items-center gap-3 text-xs">
        {actions}
        <Link
          href="/methodology"
          className="text-sky-800 underline-offset-2 hover:text-sky-950 hover:underline"
        >
          Methodology
        </Link>
        <Link
          href="/data"
          className="text-sky-800 underline-offset-2 hover:text-sky-950 hover:underline"
        >
          Data
        </Link>
      </nav>
    </header>
  );
}
