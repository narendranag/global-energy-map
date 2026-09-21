"use client";

export interface AsOfChipProps {
  /** The year the map is being read at (`AppState.year`). */
  readonly year: number;
  /** The latest year the app has reconciled trade for (`TRADE_LAST_YEAR`). */
  readonly latestYear: number;
  /** Patches `year` back to `latestYear` through the app store. */
  readonly onViewLatest: () => void;
}

/**
 * "As of {year} · View latest" — the only year affordance left after the year
 * slider was dropped (decision 4 of
 * `docs/superpowers/plans/2026-09-21-drop-year-slider.md`).
 *
 * Nobody *chooses* a year any more: the map reads at the latest reconciled
 * trade year. But `year=` is still decoded from a link, because a link is a
 * citation — a URL copied today must keep showing today's numbers when the
 * next BACI release lands. So a link pinned to an older year still renders
 * that year everywhere (vintage filter, engine, CSV), and this chip is what
 * says so, plus the one way back to the present.
 *
 * It renders only when the pinned year differs from the latest, and it is
 * shown under `?embed=1` (including `&controls=0`): it is not a control the
 * embedder may want hidden, it is the caption that makes the numbers on
 * screen readable.
 */
export function AsOfChip({ year, latestYear, onViewLatest }: AsOfChipProps) {
  if (year === latestYear) return null;
  const title =
    `This link was shared at ${year.toString()}: layers and scenario numbers are shown ` +
    `as of that year. The latest data the map holds is ${latestYear.toString()}.`;
  return (
    <div
      className="pointer-events-auto absolute bottom-16 left-1/2 z-10 -translate-x-1/2"
      data-testid="as-of-chip"
    >
      <div
        role="status"
        title={title}
        className="flex items-center gap-2 rounded-lg border border-amber-600 bg-amber-50/95 px-3 py-1.5 text-xs text-amber-900 shadow-md backdrop-blur"
      >
        <span>
          As of{" "}
          <span className="tabular font-mono font-semibold">{year}</span>
        </span>
        <button
          type="button"
          data-testid="as-of-view-latest"
          onClick={onViewLatest}
          className="rounded border border-amber-700 px-1.5 py-0.5 font-medium text-amber-900 transition-colors hover:bg-amber-100"
        >
          View latest
          <span className="sr-only"> data ({latestYear})</span>
        </button>
      </div>
    </div>
  );
}
