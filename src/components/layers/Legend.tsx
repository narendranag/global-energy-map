"use client";
import { useId, useSyncExternalStore, type ReactNode } from "react";
import { useMapView } from "@/lib/state";
import {
  ANCHOR_GLYPH,
  LNG_TRIANGLE_POINTS,
  LNG_TRIANGLE_STROKE,
  PIPELINE_LINE_MIN_PX,
  gradientCss,
  legendSections,
  rgbaCss,
  type LegendItem,
  type Rgba,
  type Swatch,
} from "@/lib/symbology";
import type { LayerState } from "./LayerPanel";

export interface LegendProps {
  readonly layers: LayerState;
  /** Imports noun ("crude imports" / "LNG imports") while a scenario is active. */
  readonly scenarioNoun?: string | undefined;
  /**
   * "inline" (default) renders bare rows for embedding in another panel;
   * "card" wraps them in their own quiet card for a free-standing placement.
   */
  readonly variant?: "inline" | "card";
}

/** Great-circle arc glyph with the voyage layer's end-to-end gradient. */
function ArcSwatch({ from, to }: { readonly from: Rgba; readonly to: Rgba }) {
  const id = useId();
  return (
    <svg className="inline-block w-7" height="12" viewBox="0 0 28 12" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor={rgbaCss(from)} />
          <stop offset="1" stopColor={rgbaCss(to)} />
        </linearGradient>
      </defs>
      <path d="M2 10 Q14 -2 26 10" fill="none" stroke={`url(#${id})`} strokeWidth="1.75" />
    </svg>
  );
}

/** Swatch drawn with the layer's real colour and shape (from symbology). */
function SwatchIcon({ swatch }: { readonly swatch: Swatch }): ReactNode {
  switch (swatch.kind) {
    case "gradient":
      return (
        <span
          className="inline-block h-2.5 w-7 rounded-[2px] ring-1 ring-black/5"
          style={{ background: gradientCss(swatch.stops) }}
        />
      );
    case "fill":
      return (
        <span
          className="inline-block h-2.5 w-7 rounded-[2px]"
          style={{
            background: rgbaCss(swatch.color),
            border: `1px solid ${rgbaCss(swatch.outline ?? [0, 0, 0, 20])}`,
          }}
        />
      );
    case "line":
      return (
        <span className="inline-flex w-7 items-center">
          <span
            className="block w-full rounded-full"
            style={{ height: `${(swatch.width ?? PIPELINE_LINE_MIN_PX + 0.5).toString()}px`, background: rgbaCss(swatch.color) }}
          />
        </span>
      );
    case "arc":
      return <ArcSwatch from={swatch.from} to={swatch.to} />;
    case "dot": {
      const size = swatch.size ?? 8;
      return (
        <span className="inline-flex w-7 justify-center">
          <span
            className="inline-block rounded-full"
            style={{
              width: size,
              height: size,
              background: rgbaCss(swatch.color),
              ...(swatch.outline ? { border: `1px solid ${rgbaCss(swatch.outline)}` } : {}),
            }}
          />
        </span>
      );
    }
    case "triangle": {
      const color = rgbaCss(swatch.color);
      return (
        <svg className="inline-block w-7" height="12" viewBox="-10 0 52 32" aria-hidden="true">
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
        <svg className="inline-block w-7" height="13" viewBox="-10 0 52 32" aria-hidden="true">
          <path d={ANCHOR_GLYPH.path} stroke={color} strokeWidth={ANCHOR_GLYPH.strokeWidth} fill="none" />
          <circle cx={ANCHOR_GLYPH.ring.cx} cy={ANCHOR_GLYPH.ring.cy} r={ANCHOR_GLYPH.ring.r} fill={color} />
        </svg>
      );
    }
  }
}

/** Legend rows for the visible layers (+ the scenario rows), flattened, in section order. */
export function legendItems(layers: LayerState, scenarioNoun?: string, zoom?: number): LegendItem[] {
  return legendSections(layers, scenarioNoun, zoom).flatMap((s) => s.items);
}

function Row({ item }: { readonly item: LegendItem }) {
  return (
    <li className="flex items-center gap-2">
      {/* Gated rows fade the swatch only; text keeps its contrast. */}
      <span className={`inline-flex shrink-0 ${item.note ? "opacity-40" : ""}`}>
        <SwatchIcon swatch={item.swatch} />
      </span>
      <span className="min-w-0">
        {item.label}
        {item.note && <span className="ml-1 text-2xs text-ink-subtle">· {item.note}</span>}
      </span>
    </li>
  );
}

const noopSubscribe = () => () => undefined;

/**
 * False while hydrating (and on the server), true after. The server renders
 * at the default zoom but the client store may already hold a URL zoom, so
 * zoom-gating notes are added only once hydration is done.
 */
function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

export function Legend({ layers, scenarioNoun, variant = "inline" }: LegendProps) {
  const { zoom } = useMapView();
  const hydrated = useHydrated();
  const sections = legendSections(layers, scenarioNoun, hydrated ? zoom : undefined);
  const card =
    variant === "card"
      ? "rounded-lg border border-panel-border bg-panel p-3 shadow-sm backdrop-blur"
      : "";

  if (sections.length === 0) {
    return (
      <div className={`text-xs text-ink-subtle ${card}`} data-testid="legend">
        No layers visible.
      </div>
    );
  }
  return (
    <div className={`space-y-2.5 text-xs leading-snug text-ink-muted ${card}`} data-testid="legend">
      {sections.map((s) => (
        <section key={s.title} aria-label={`${s.title} legend`}>
          <h3 className="mb-1 text-2xs font-medium uppercase tracking-wider text-ink-subtle">{s.title}</h3>
          <ul className="space-y-1">
            {s.items.map((item) => (
              <Row key={item.label} item={item} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
