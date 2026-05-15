"use client";
import { useId } from "react";

export interface YearSliderProps {
  readonly min: number;
  readonly max: number;
  readonly value: number;
  readonly onChange: (year: number) => void;
}

export function YearSlider({ min, max, value, onChange }: YearSliderProps) {
  const id = useId();
  return (
    <div className="pointer-events-auto absolute bottom-6 left-1/2 z-10 w-[480px] -translate-x-1/2 rounded-md bg-white/90 p-3 shadow-lg backdrop-blur">
      <label htmlFor={id} className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">
        Year: <span className="font-mono text-slate-900">{value}</span>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => { onChange(Number(e.target.value)); }}
        className="w-full"
      />
    </div>
  );
}
