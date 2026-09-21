/**
 * Which layers are dated at all, and how completely (D9). The layer panel
 * renders these as badges; `TIME_AWARE_COVERAGE`'s numbers are the share of
 * rows in the *runtime* artifact that carry a vintage (rows without one are
 * always shown) — surfaced only in the hover note now that there is no year
 * control for the badge itself to describe responsiveness to. Re-measure the
 * coverage numbers when a source is refreshed.
 *
 * `timeAwareLabel` states the layer's own DATA VINTAGE (decision 2026-09-21:
 * drop the year slider) — "to 2020", "as of 9 Apr 2025", "live" — derived
 * from the catalog via `src/lib/data/vintage.ts`'s `layerVintage`/
 * `formatVintage`, never a hand-kept date.
 */
import type { LayerState } from "@/components/layers/LayerPanel";
import { layerVintage, formatVintage } from "@/lib/data/vintage";

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
  // dated and deliberately always shows its own latest reading, which is a
  // different claim.
  gas_storage: "live",
  shale_regions: "yes",
  recent_imports: "live",
  trade_flows: "yes",
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
  trade_flows: null,
};

/**
 * One-line explanation for a badge tooltip — describes the data itself (what
 * fraction of rows carry a build/commission date, what period a series
 * covers), not a control the reader operates.
 */
export const TIME_AWARE_NOTE: Readonly<Record<LayerKey, string>> = {
  reserves: "Yearly values 1990–2020 (EI Statistical Review); no reserves data after 2020.",
  basins: "No dates in source.",
  extraction: "Start year known for 32 % of sites; undated sites carry no vintage.",
  pipelines: "Start year known for 64 % of oil pipelines; undated lines carry no vintage.",
  refineries: "No commissioning dates in source.",
  storage: "No dates in source.",
  ports: "No dates in source.",
  gas_pipelines: "Start year known for 74 % of gas pipelines; undated lines carry no vintage.",
  lng_terminals: "Start year known for 97 % of terminals; undated terminals carry no vintage.",
  lng_voyages: "Voyages observed 2020–2024 only (LNG-T3).",
  gas_storage: "GIE publishes daily; this layer always shows the latest gas day.",
  shale_regions: "Annual output 2009 onward (EIA STEO history; forecasts excluded).",
  recent_imports: "Each country's latest 12 reported months (UN Comtrade).",
  trade_flows: "Country-pair crude/LNG trade (BACI), 1995–2024 only.",
};

/**
 * Badge text: the layer's data vintage, e.g. "to 2020", "as of 9 Apr 2025",
 * "live". Derived from the catalog (`layerVintage`/`formatVintage`), so a
 * refreshed source moves the badge with no code change. `label` is passed as
 * the key itself — `layerVintage` only uses it to stamp the returned record,
 * never to format the badge text.
 */
export function timeAwareLabel(key: LayerKey): string {
  if (TIME_AWARE[key] === "live") return "live";
  const v = layerVintage(key, key);
  if (v !== null) return formatVintage(v);
  // No catalog coverage/as_of found for this layer — should not happen for a
  // shipped layer, but fail into something legible rather than "undefined".
  return "static";
}
