import Link from "next/link";

export interface TitleBarProps {
  /** Number of visible layers (and the scenario) still loading; 0 hides the pill. */
  readonly pending: number;
}

/**
 * Compact top-centre title bar. Sized (max 20rem) to fit between LayerPanel
 * (left-4, w-60) and ScenarioPanel (right-4, w-80) at >= 1024 px; the subtitle
 * hides below that width.
 */
export function TitleBar({ pending }: TitleBarProps) {
  return (
    <div className="pointer-events-none absolute left-1/2 top-4 z-10 flex w-80 max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-col items-center gap-2">
      <header className="pointer-events-auto w-full rounded-md bg-white/90 px-3 py-2 text-center text-slate-800 shadow-lg backdrop-blur">
        <h1 className="text-sm font-semibold tracking-tight text-slate-900">Global Energy Map</h1>
        <p className="hidden text-[11px] leading-snug text-slate-600 lg:block">
          Reserves, extraction, transport and refining of oil and gas — with disruption scenarios.
        </p>
        <nav className="mt-0.5 text-[11px]">
          <Link href="/about" className="text-sky-700 underline underline-offset-2 hover:text-sky-900">
            Methodology &amp; sources
          </Link>
        </nav>
      </header>
      {pending > 0 && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-auto rounded-full bg-slate-800/85 px-3 py-1 text-[11px] font-medium text-white shadow"
        >
          Loading {pending} {pending === 1 ? "layer" : "layers"}…
        </div>
      )}
    </div>
  );
}
