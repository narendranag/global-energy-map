"use client";
import type { Commodity } from "@/lib/scenarios/types";

export interface CommoditySelectorProps {
  readonly value: Commodity;
  readonly onChange: (next: Commodity) => void;
}

export function CommoditySelector({ value, onChange }: CommoditySelectorProps) {
  return (
    <div
      role="group"
      aria-label="Commodity"
      className="pointer-events-auto inline-flex overflow-hidden rounded-md border border-slate-300 bg-white/90 text-xs font-medium shadow-sm backdrop-blur"
    >
      {(["oil", "gas"] as const).map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => {
            onChange(c);
          }}
          aria-pressed={value === c}
          className={
            "px-3 py-1.5 " +
            (value === c
              ? "bg-slate-800 text-white"
              : "bg-transparent text-slate-700 hover:bg-slate-100")
          }
        >
          {c === "oil" ? "Oil" : "Gas"}
        </button>
      ))}
    </div>
  );
}
