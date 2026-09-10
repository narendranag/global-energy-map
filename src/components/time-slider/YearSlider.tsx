"use client";
import { useId } from "react";

export interface YearSliderProps {
  readonly min: number;
  readonly max: number;
  readonly value: number;
  readonly onChange: (year: number) => void;
  /** Optional amber note shown beside the year (e.g. reserves frozen at 2020). */
  readonly note?: string | undefined;
}

export function YearSlider({ min, max, value, onChange, note }: YearSliderProps) {
  const id = useId();
  return (
    <div className="pointer-events-auto absolute bottom-6 left-1/2 z-10 w-[480px] max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-md bg-white/90 p-3 text-slate-800 shadow-lg backdrop-blur">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="block text-xs font-medium uppercase tracking-wide text-slate-600">
          Year: <span className="font-mono text-slate-900">{value}</span>
        </label>
        {note && (
          <span
            data-testid="year-note"
            className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] leading-tight text-amber-800"
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
        onChange={(e) => { onChange(Number(e.target.value)); }}
        className="w-full"
      />
      <div className="flex justify-between font-mono text-[10px] text-slate-500" aria-hidden="true">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}
