"use client";
import type { ReactNode } from "react";
import {
  ANCHOR_GLYPH,
  LEGEND,
  LNG_TRIANGLE_POINTS,
  LNG_TRIANGLE_STROKE,
  gradientCss,
  rgbaCss,
  scenarioLegend,
  type LayerKey,
  type LegendItem,
  type Swatch,
} from "@/lib/symbology";
import type { LayerState } from "./LayerPanel";

export interface LegendProps {
  readonly layers: LayerState;
  /** Imports noun ("crude imports" / "LNG imports") while a scenario is active. */
  readonly scenarioNoun?: string | undefined;
}

/** Swatch drawn with the layer's real colour and shape (from symbology). */
function SwatchIcon({ swatch }: { readonly swatch: Swatch }): ReactNode {
  switch (swatch.kind) {
    case "gradient":
      return (
        <span
          className="inline-block h-2 w-6 rounded-sm"
          style={{ background: gradientCss(swatch.stops) }}
        />
      );
    case "fill":
      return (
        <span
          className="inline-block h-2 w-6 rounded-sm"
          style={{
            background: rgbaCss(swatch.color),
            ...(swatch.outline ? { border: `1px solid ${rgbaCss(swatch.outline)}` } : {}),
          }}
        />
      );
    case "line":
      return <span className="inline-block h-0.5 w-6" style={{ background: rgbaCss(swatch.color) }} />;
    case "arc":
      return (
        <span
          className="inline-block h-0.5 w-6"
          style={{ background: gradientCss([swatch.from, swatch.to]) }}
        />
      );
    case "dot":
      return (
        <span className="inline-flex w-6 justify-center">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{
              background: rgbaCss(swatch.color),
              ...(swatch.outline ? { border: `0.5px solid ${rgbaCss(swatch.outline)}` } : {}),
            }}
          />
        </span>
      );
    case "triangle": {
      const color = rgbaCss(swatch.color);
      return (
        <svg className="inline-block w-6" height="12" viewBox="-8 0 48 32" aria-hidden="true">
          <polygon
            points={LNG_TRIANGLE_POINTS}
            fill={swatch.hollow ? "none" : color}
            stroke={swatch.hollow ? color : "none"}
            strokeWidth={LNG_TRIANGLE_STROKE}
          />
        </svg>
      );
    }
    case "anchor": {
      const color = rgbaCss(swatch.color);
      return (
        <svg className="inline-block w-6" height="12" viewBox="-8 0 48 32" aria-hidden="true">
          <path d={ANCHOR_GLYPH.path} stroke={color} strokeWidth={ANCHOR_GLYPH.strokeWidth} fill="none" />
          <circle cx={ANCHOR_GLYPH.ring.cx} cy={ANCHOR_GLYPH.ring.cy} r={ANCHOR_GLYPH.ring.r} fill={color} />
        </svg>
      );
    }
  }
}

/** Legend rows for the visible layers (+ the scenario ramp), in panel order. */
export function legendItems(layers: LayerState, scenarioNoun?: string): LegendItem[] {
  const items = (Object.keys(LEGEND) as LayerKey[]).filter((k) => layers[k]).flatMap((k) => LEGEND[k]);
  return scenarioNoun === undefined ? items : [...items, ...scenarioLegend(scenarioNoun)];
}

export function Legend({ layers, scenarioNoun }: LegendProps) {
  const items = legendItems(layers, scenarioNoun);
  if (items.length === 0) {
    return <div className="text-[10px] text-slate-500">No layers visible.</div>;
  }
  return (
    <div className="space-y-1 text-[10px] leading-tight text-slate-600" data-testid="legend">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-2">
          <SwatchIcon swatch={item.swatch} />
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}
