/**
 * Search (S4): a pure index + matcher over names already loaded elsewhere
 * (countries, assets, pipelines, basins, shale regions). No I/O here — see
 * `build.ts` for assembling a `SearchItem[]` from loaded data and
 * `useSearchIndex.ts` for the lazy loader.
 */
import type { LayerKey } from "@/lib/symbology";
import type { Bounds } from "@/lib/state/camera";

export type SearchKind =
  | "country"
  | "pipeline_oil"
  | "pipeline_gas"
  | "refinery"
  | "extraction_site"
  | "lng_export"
  | "lng_import"
  | "basin"
  | "shale_region";

/** What Enter/click on a result does to the map. */
export type SearchTarget =
  | { readonly action: "country"; readonly iso3: string }
  | {
      readonly action: "flyTo";
      readonly lon: number;
      readonly lat: number;
      readonly zoom: number;
      readonly layerKey: LayerKey;
    }
  | {
      readonly action: "fitBounds";
      readonly bounds: Bounds;
      /** Bounds centre, so the caller can drop a highlight marker there too. */
      readonly lon: number;
      readonly lat: number;
      readonly layerKey: LayerKey;
    };

export interface SearchItem {
  readonly id: string;
  readonly name: string;
  readonly kind: SearchKind;
  /** ISO3 of the country the item sits in/starts in; null when not applicable. */
  readonly countryIso3: string | null;
  readonly operator: string | null;
  /** The country's own code, for country items only — drives the ISO3-exact tier. */
  readonly iso3: string | null;
  /** Precomputed once at index build: case- and diacritic-folded `name`. */
  readonly nameKey: string;
  /** Precomputed, lower-cased `iso3` — avoids re-folding it on every keystroke. */
  readonly iso3Key: string | null;
  readonly target: SearchTarget;
}
