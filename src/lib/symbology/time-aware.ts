/**
 * Which layers respond to the year slider, and how completely (D9). The
 * layer panel renders these as badges; the numbers are the share of rows in
 * the *runtime* artifact that carry a vintage (rows without one are always
 * shown). Re-measure when a source is refreshed.
 */
import type { LayerState } from "@/components/layers/LayerPanel";

type LayerKey = keyof LayerState;

export type TimeAwareLevel = "yes" | "partial" | "no" | "live";

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
  // Not "no": static means undated and shown in every year. This layer is
  // dated and deliberately ignores the slider, which is a different claim.
  gas_storage: "live",
  shale_regions: "yes",
  recent_imports: "live",
};

/**
 * Percent of rows that carry a vintage (start / commissioning year), or null
 * where the question does not apply (a year-keyed series, or no vintage at all).
 * Measured on public/data 2026-09-17: pipelines.geojson oil+NGL 760/1185,
 * gas 2058/2772; assets.parquet extraction 2279/7055, LNG terminals 306/314.
 */
export const TIME_AWARE_COVERAGE: Readonly<Record<LayerKey, number | null>> = {
  reserves: null,
  basins: null,
  extraction: 32,
  pipelines: 64,
  refineries: null,
  storage: null,
  ports: null,
  gas_pipelines: 74,
  lng_terminals: 97,
  lng_voyages: null,
  gas_storage: null,
  shale_regions: null,
  recent_imports: null,
};

/** One-line explanation for a badge tooltip. */
export const TIME_AWARE_NOTE: Readonly<Record<LayerKey, string>> = {
  reserves: "Yearly values 1990–2020 (EI Statistical Review); 2021–2024 show the 2020 value.",
  basins: "No dates in source — shown for every year.",
  extraction: "Start year known for 32 % of sites; undated sites show in every year.",
  pipelines: "Start year known for 64 % of oil pipelines; undated lines show in every year.",
  refineries: "No commissioning dates in source — shown for every year.",
  storage: "No dates in source — shown for every year.",
  ports: "No dates in source — shown for every year.",
  gas_pipelines: "Start year known for 74 % of gas pipelines; undated lines show in every year.",
  lng_terminals: "Start year known for 97 % of terminals; undated terminals show in every year.",
  lng_voyages: "Voyages observed 2020–2024 only (LNG-T3); hidden outside that range.",
  gas_storage:
    "GIE publishes daily; this layer always shows the latest gas day and ignores the year slider.",
  shale_regions: "Annual output 2009 onward (EIA STEO history; forecasts excluded); no data before 2009.",
  recent_imports: "Each country's latest 12 reported months (UN Comtrade); ignores the year slider.",
};

/** Short badge text, e.g. "time: 64 %", "time: yes", "static". */
export function timeAwareLabel(key: LayerKey): string {
  const level = TIME_AWARE[key];
  if (level === "live") return "live";
  if (level === "no") return "static";
  const cov = TIME_AWARE_COVERAGE[key];
  if (level === "partial" && cov !== null) return `time: ${cov.toString()} %`;
  if (key === "lng_voyages") return "time: 2020–24";
  if (key === "reserves") return "time: to 2020";
  return "time: yes";
}
