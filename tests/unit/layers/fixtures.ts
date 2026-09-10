import type {
  ExtractionAsset,
  LngTerminalAsset,
  PortAsset,
  RefineryAsset,
  StorageAsset,
} from "@/lib/data/assets";
import type { PositionedVoyage } from "@/lib/data/voyages";
import type { PipelineCollection, PipelineFeature } from "@/components/layers/PipelinesLayer";
import type { CountryCollection } from "@/lib/geo/countries";

const base = {
  country_iso3: "USA",
  lon: -95,
  lat: 30,
  capacity: null,
  capacity_unit: null,
  operator: null,
  status: null,
  commissioned_year: null,
  source: null,
};

export function extraction(id: string, commissioned_year: number | null = null): ExtractionAsset {
  return { ...base, kind: "extraction_site", asset_id: id, name: id, commissioned_year, capacity_unit: "kboe/d" };
}

export function refinery(id: string, extra: Partial<RefineryAsset> = {}): RefineryAsset {
  return { ...base, kind: "refinery", asset_id: id, name: id, capacity_unit: "kbpd", ...extra };
}

export function storage(id: string, extra: Partial<StorageAsset> = {}): StorageAsset {
  return { ...base, kind: "storage", asset_id: id, name: id, ...extra };
}

export function port(id: string, extra: Partial<PortAsset> = {}): PortAsset {
  return { ...base, kind: "port", asset_id: id, name: id, ...extra };
}

export function lngTerminal(
  id: string,
  kind: "lng_export" | "lng_import" = "lng_import",
  extra: Partial<LngTerminalAsset> = {},
): LngTerminalAsset {
  return {
    ...base,
    kind,
    asset_id: id,
    name: id,
    capacity_unit: "mtpa",
    unit_count: null,
    total_processed_bcm: null,
    un_locode: null,
    ...extra,
  };
}

export function voyage(extra: Partial<PositionedVoyage> = {}): PositionedVoyage {
  return {
    voyage_id: "v1",
    start_date: "2023-03-01",
    end_date: "2023-03-15",
    imo: 9000001,
    voyage_type: "export",
    from_terminal: "Ras Laffan",
    to_terminal: "Futtsu",
    from_country: "Qatar",
    to_country: "Japan",
    from_country_iso3: "QAT",
    to_country_iso3: "JPN",
    amount_cbm: 150_000,
    confidence_score: 4,
    from_lon: 51.5,
    from_lat: 25.9,
    to_lon: 139.8,
    to_lat: 35.3,
    ...extra,
  };
}

export function pipeline(
  id: string,
  commodity: string,
  start_year: number | null,
  extra: Partial<PipelineFeature["properties"]> = {},
): PipelineFeature {
  return {
    type: "Feature",
    geometry: { type: "LineString", coordinates: [[0, 0], [1, 1]] },
    properties: {
      pipeline_id: id,
      name: id,
      status: "operating",
      commodity,
      capacity_kbpd: null,
      capacity_unit: commodity === "gas" ? "bcm/y" : "kbpd",
      operator: null,
      start_year,
      ...extra,
    },
  };
}

export function pipelines(...features: PipelineFeature[]): PipelineCollection {
  return { type: "FeatureCollection", features };
}

export const COUNTRIES: CountryCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [[[40, 20], [50, 20], [50, 30], [40, 20]]] },
      properties: { iso3: "SAU", name: "Saudi Arabia" },
    },
    {
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
      properties: { iso3: "ATA", name: "Antarctica" },
    },
  ],
};
