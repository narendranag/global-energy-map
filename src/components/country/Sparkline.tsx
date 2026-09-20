"use client";
import { describeSeries, type CountryTimeSeries } from "@/lib/data/country-profile";
import { sparklineMarker, sparklinePath } from "@/lib/viz/sparkline";

/** viewBox units. The SVG scales to its container; only the ratio matters. */
const WIDTH = 240;
const HEIGHT = 32;

export interface SparklineProps {
  readonly series: CountryTimeSeries;
  /** Shown under the chart; defaults to the series' own span. */
  readonly caption?: string;
}

/**
 * One inline SVG sparkline over the full series, with the selected year
 * marked. `role="img"` plus a text alternative that states the span, the
 * ends and the extremes: a screen-reader user gets the shape in words, which
 * is all a sparkline ever conveys.
 */
export function Sparkline({ series, caption }: SparklineProps) {
  const values = series.points.map((p) => p.value);
  const d = sparklinePath(values, WIDTH, HEIGHT);
  if (d === "") return null;
  const marker = sparklineMarker(values, series.markerIndex, WIDTH, HEIGHT);
  const span =
    series.first && series.last
      ? `${String(series.first.year)}–${String(series.last.year)}`
      : "";
  return (
    <div className="mt-1">
      <svg
        role="img"
        aria-label={describeSeries(series)}
        viewBox={`0 0 ${String(WIDTH)} ${String(HEIGHT)}`}
        preserveAspectRatio="none"
        className="block h-8 w-full text-slate-700"
        data-testid="sparkline"
      >
        <path
          d={d}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {/* The selected year: a guide line plus a dot. A square, not a circle
            — `preserveAspectRatio="none"` stretches x, and an ellipse reads
            as a rendering bug. */}
        {marker !== null && (
          <>
            <line
              x1={marker.x}
              x2={marker.x}
              y1={0}
              y2={HEIGHT}
              stroke="currentColor"
              strokeWidth={1}
              strokeOpacity={0.35}
              vectorEffect="non-scaling-stroke"
            />
            <rect x={marker.x - 1.75} y={marker.y - 1.75} width={3.5} height={3.5} className="fill-sky-800" />
          </>
        )}
      </svg>
      <p className="text-[11px] leading-snug text-slate-600">{caption ?? span}</p>
    </div>
  );
}
