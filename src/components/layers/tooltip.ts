import type {
  Commodity,
  LngImportImpact,
  RefineryImpact,
  ScenarioResult,
} from "@/lib/scenarios/types";
import type { OverlayEntry } from "@/components/scenarios/overlay";

/** Everything a layer's tooltip formatter may need beyond the hovered object. */
export interface TooltipContext {
  readonly year: number;
  readonly commodity: Commodity;
  readonly scenario: ScenarioResult | null;
  readonly overlay?: ReadonlyMap<string, OverlayEntry> | undefined;
  readonly refineryImpacts?: ReadonlyMap<string, RefineryImpact> | undefined;
  readonly lngImpacts?: ReadonlyMap<string, LngImportImpact> | undefined;
}

export type TooltipFormatter<T> = (object: T, ctx: TooltipContext) => string | null;

export const NOT_IN_SOURCE = "not in source";

/** "450 kbpd", or "not in source" for a null / non-positive / non-finite capacity. */
export function formatCapacity(
  value: number | null | undefined,
  unit: string | null | undefined,
  digits = 0,
): string {
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) {
    return NOT_IN_SOURCE;
  }
  return unit ? `${value.toFixed(digits)} ${unit}` : value.toFixed(digits);
}

/** Display a nullable text field, "n/a" when absent. */
export function orNa(v: string | null | undefined): string {
  return v === null || v === undefined || v.trim() === "" ? "n/a" : v;
}

/** Join tooltip lines, dropping null/undefined/false (empty strings stay as spacers). */
export function joinLines(...parts: readonly (string | null | undefined | false)[]): string {
  return parts.filter((p): p is string => typeof p === "string").join("\n");
}

export function pct(t: number): string {
  return `${(t * 100).toFixed(1)}%`;
}
