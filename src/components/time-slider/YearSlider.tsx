"use client";
import { useEffect, useId, useMemo, useState } from "react";
import {
  PLAY_STEP_MS,
  nextPlayYear,
  playStartYear,
  stepYear,
  tickLeft,
  yearTicks,
} from "./timeline";

export interface YearSliderProps {
  readonly min: number;
  readonly max: number;
  readonly value: number;
  readonly onChange: (year: number) => void;
  /** Optional amber note shown beside the year (e.g. reserves frozen at 2020). */
  readonly note?: string | undefined;
}

const BUTTON =
  "inline-flex h-7 w-7 items-center justify-center rounded-md border border-panel-border bg-panel-solid text-ink-muted transition-colors hover:bg-slate-50 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40";

/**
 * Year control: range input (native ←/→, PageUp/PageDown, Home/End), ±1
 * buttons, and play/pause — one year per 700 ms, stopping at `max`; any
 * manual change pauses playback.
 */
export function YearSlider({ min, max, value, onChange, note }: YearSliderProps) {
  const id = useId();
  const noteId = useId();
  const [playing, setPlaying] = useState(false);
  const ticks = useMemo(() => yearTicks(min, max), [min, max]);

  // Playback: one step per PLAY_STEP_MS, re-armed by each new value so a slow
  // render never queues a burst of steps. At `max` the next tick stops it.
  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => {
      const next = nextPlayYear(value, max);
      if (next === null) setPlaying(false);
      else onChange(next);
    }, PLAY_STEP_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [playing, value, max, onChange]);

  const manual = (year: number) => {
    setPlaying(false);
    onChange(year);
  };

  const togglePlay = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    const start = playStartYear(value, min, max);
    if (start !== value) onChange(start);
    setPlaying(true);
  };

  return (
    <div
      className="pointer-events-auto absolute bottom-6 left-1/2 z-10 w-[480px] max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-lg border border-panel-border bg-panel px-3 pb-1.5 pt-2 text-ink shadow-md backdrop-blur"
      data-testid="year-slider"
    >
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={BUTTON}
            aria-label="Previous year"
            disabled={value <= min}
            onClick={() => {
              manual(stepYear(value, -1, min, max));
            }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <path d="M6.5 1.5 3 5l3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
            </svg>
          </button>
          <button
            type="button"
            className={BUTTON}
            aria-label={playing ? "Pause" : "Play through years"}
            aria-pressed={playing}
            data-testid="year-play"
            onClick={togglePlay}
          >
            {playing ? (
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                <rect x="2" y="1.5" width="2.2" height="7" fill="currentColor" />
                <rect x="5.8" y="1.5" width="2.2" height="7" fill="currentColor" />
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                <path d="M2.5 1.2v7.6L8.8 5z" fill="currentColor" />
              </svg>
            )}
          </button>
          <button
            type="button"
            className={BUTTON}
            aria-label="Next year"
            disabled={value >= max}
            onClick={() => {
              manual(stepYear(value, 1, min, max));
            }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <path d="M3.5 1.5 7 5 3.5 8.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
            </svg>
          </button>
        </div>
        <label htmlFor={id} className="flex items-baseline gap-1.5">
          <span className="text-2xs font-medium uppercase tracking-wider text-ink-subtle">Year</span>
          <span className="tabular font-mono text-base font-semibold text-ink" data-testid="year-value">
            {value}
          </span>
        </label>
        {note && (
          <span
            id={noteId}
            data-testid="year-note"
            className="ml-auto rounded bg-amber-100 px-1.5 py-0.5 text-right text-2xs leading-tight text-amber-900"
          >
            {note}
          </span>
        )}
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        aria-describedby={note ? noteId : undefined}
        onChange={(e) => {
          manual(Number(e.target.value));
        }}
        className="year-range mt-1 block w-full"
      />
      <div className="relative h-5" aria-hidden="true">
        {ticks.map((t) => (
          <span
            key={t.year}
            className="absolute top-0 -translate-x-1/2"
            style={{ left: tickLeft(t.at) }}
          >
            <span
              className={`mx-auto block w-px ${t.label ? "h-1.5 bg-ink-subtle" : "h-1 bg-panel-border"}`}
            />
            {t.label && (
              <span className="tabular mt-0.5 block font-mono text-2xs leading-none text-ink-subtle">
                {t.label}
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}
