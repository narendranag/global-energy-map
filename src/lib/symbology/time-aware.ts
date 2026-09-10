/**
 * Which layers respond to the year slider, and how completely (D9). The
 * layer panel renders these as badges; the numbers are the share of rows in
 * the *runtime* artifact that carry a vintage (rows without one are always
 * shown). Re-measure when a source is refreshed.
 */
import type { LayerState } from "@/components/layers/LayerPanel";

type LayerKey = keyof LayerState;

export type TimeAwareLevel = "yes" | "partial" | "no";

/** Per-layer time-awareness: "yes" (fully year-keyed), "partial" (some rows dated), "no". */
export const TIME_AWARE: Readonly<Record<LayerKey, TimeAwareLevel>> = {
  reserves: "yes",
  basins: "no",
  extraction: "partial",
  pipelines: "partial",
  refineries: "no",
  storage: "no",
  ports: "no",
  gas_pipelines: "partial",
  lng_terminals: "partial",
  lng_voyages: "yes",
};

/**
 * Percent of rows that carry a vintage (start / commissioning year), or null
 * where the question does not apply (a year-keyed series, or no vintage at all).
 * Measured on public/data 2026-09-10: pipelines.geojson oil+NGL 760/1185,
 * gas 2058/2772; assets.parquet extraction 22 %, LNG terminals 305/312.
 */
export const TIME_AWARE_COVERAGE: Readonly<Record<LayerKey, number | null>> = {
  reserves: null,
  basins: null,
  extraction: 22,
  pipelines: 64,
  refineries: null,
  storage: null,
  ports: null,
  gas_pipelines: 74,
  lng_terminals: 98,
  lng_voyages: null,
};

/** One-line explanation for a badge tooltip. */
export const TIME_AWARE_NOTE: Readonly<Record<LayerKey, string>> = {
  reserves: "Yearly values 1990–2020 (EI Statistical Review); 2021–2024 show the 2020 value.",
  basins: "No dates in source — shown for every year.",
  extraction: "Start year known for 22 % of sites; undated sites show in every year.",
  pipelines: "Start year known for 64 % of oil pipelines; undated lines show in every year.",
  refineries: "No commissioning dates in source — shown for every year.",
  storage: "No dates in source — shown for every year.",
  ports: "No dates in source — shown for every year.",
  gas_pipelines: "Start year known for 74 % of gas pipelines; undated lines show in every year.",
  lng_terminals: "Start year known for 98 % of terminals; undated terminals show in every year.",
  lng_voyages: "Voyages observed 2020–2024 only (LNG-T3); hidden outside that range.",
};

/** Short badge text, e.g. "time: 64 %", "time: yes", "static". */
export function timeAwareLabel(key: LayerKey): string {
  const level = TIME_AWARE[key];
  if (level === "no") return "static";
  const cov = TIME_AWARE_COVERAGE[key];
  if (level === "partial" && cov !== null) return `time: ${cov.toString()} %`;
  if (key === "lng_voyages") return "time: 2020–24";
  if (key === "reserves") return "time: to 2020";
  return "time: yes";
}
