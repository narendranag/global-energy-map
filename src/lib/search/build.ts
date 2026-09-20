/**
 * Assemble a `SearchItem[]` from data already loaded elsewhere (countries,
 * assets, pipelines, basins, shale regions). Pure: takes the resolved
 * collections in, no fetching — `useSearchIndex.ts` is the only caller that
 * touches the network, and only once every source is in hand.
 */
import type { LineString, MultiLineString, MultiPolygon, Polygon, Position } from "geojson";
import type { AssetsByKind } from "@/lib/data/assets";
import type { ShaleRegionCollection } from "@/lib/data/shale-regions";
import type { CountryCollection } from "@/lib/geo/countries";
import { ringsBounds, withMinimumExtent } from "@/lib/geo/bounds";
import type { Bounds } from "@/lib/state/camera";
import type { LayerKey } from "@/lib/symbology";
import type { BasinCollection } from "@/components/layers/BasinPolygonsLayer";
import { pipelineLayerGroup, type PipelineCollection } from "@/components/layers/PipelinesLayer";
import { normalizeText } from "./normalize";
import type { SearchItem, SearchTarget } from "./types";

export interface SearchSources {
  readonly countries: CountryCollection;
  readonly assets: AssetsByKind;
  readonly pipelines: PipelineCollection;
  readonly basins: BasinCollection;
  readonly shaleRegions: ShaleRegionCollection;
}

/** Smallest a fitBounds target is allowed to shrink to (degrees) — smaller than a country fit. */
const MIN_FEATURE_SPAN_DEG = 0.4;
/** How close a pipeline/basin/shale-region fit is allowed to zoom in (vs. FIT_MAX_ZOOM=6 for countries). */
export const FEATURE_FIT_MAX_ZOOM = 8;

function boundsCenter(b: Bounds): { readonly lon: number; readonly lat: number } {
  return { lon: (b[0] + b[2]) / 2, lat: (b[1] + b[3]) / 2 };
}

/** Bounds of a LineString or MultiLineString, padded to a sane minimum. */
function lineBounds(geom: LineString | MultiLineString): Bounds | null {
  const lines: readonly Position[][] = geom.type === "LineString" ? [geom.coordinates] : geom.coordinates;
  const b = ringsBounds(lines);
  return b === null ? null : withMinimumExtent(b, MIN_FEATURE_SPAN_DEG);
}

/** Bounds of a Polygon or MultiPolygon (rings flattened one level), padded to a sane minimum. */
function polygonBounds(geom: Polygon | MultiPolygon): Bounds | null {
  const rings: readonly Position[][] = geom.type === "Polygon" ? geom.coordinates : geom.coordinates.flat();
  const b = ringsBounds(rings);
  return b === null ? null : withMinimumExtent(b, MIN_FEATURE_SPAN_DEG);
}

function fitTarget(bounds: Bounds, layerKey: LayerKey): SearchTarget {
  const { lon, lat } = boundsCenter(bounds);
  return { action: "fitBounds", bounds, lon, lat, layerKey };
}

function item(partial: {
  readonly id: string;
  readonly name: string;
  readonly kind: SearchItem["kind"];
  readonly countryIso3?: string | null;
  readonly operator?: string | null;
  readonly iso3?: string | null;
  readonly target: SearchTarget;
}): SearchItem {
  const iso3 = partial.iso3 ?? null;
  return {
    id: partial.id,
    name: partial.name,
    kind: partial.kind,
    countryIso3: partial.countryIso3 ?? null,
    operator: partial.operator ?? null,
    iso3,
    nameKey: normalizeText(partial.name),
    iso3Key: iso3 === null ? null : iso3.toLowerCase(),
    target: partial.target,
  };
}

export function buildSearchItems(sources: SearchSources): SearchItem[] {
  const items: SearchItem[] = [];

  for (const f of sources.countries.features) {
    const iso3 = f.properties.iso3;
    items.push(
      item({
        id: `country:${iso3}`,
        name: f.properties.name,
        kind: "country",
        iso3,
        target: { action: "country", iso3 },
      }),
    );
  }

  for (const a of sources.assets.refinery) {
    items.push(
      item({
        id: `refinery:${a.asset_id}`,
        name: a.name,
        kind: "refinery",
        countryIso3: a.country_iso3,
        operator: a.operator,
        target: { action: "flyTo", lon: a.lon, lat: a.lat, zoom: 8, layerKey: "refineries" },
      }),
    );
  }
  for (const a of sources.assets.extraction) {
    items.push(
      item({
        id: `extraction_site:${a.asset_id}`,
        name: a.name,
        kind: "extraction_site",
        countryIso3: a.country_iso3,
        operator: a.operator,
        target: { action: "flyTo", lon: a.lon, lat: a.lat, zoom: 8, layerKey: "extraction" },
      }),
    );
  }
  for (const a of sources.assets.lngExport) {
    items.push(
      item({
        id: `lng_export:${a.asset_id}`,
        name: a.name,
        kind: "lng_export",
        countryIso3: a.country_iso3,
        operator: a.operator,
        target: { action: "flyTo", lon: a.lon, lat: a.lat, zoom: 8, layerKey: "lng_terminals" },
      }),
    );
  }
  for (const a of sources.assets.lngImport) {
    items.push(
      item({
        id: `lng_import:${a.asset_id}`,
        name: a.name,
        kind: "lng_import",
        countryIso3: a.country_iso3,
        operator: a.operator,
        target: { action: "flyTo", lon: a.lon, lat: a.lat, zoom: 8, layerKey: "lng_terminals" },
      }),
    );
  }

  for (const f of sources.pipelines.features) {
    const name = f.properties.name.trim();
    if (name === "") continue;
    const bounds = lineBounds(f.geometry);
    if (bounds === null) continue;
    const group = pipelineLayerGroup(f.properties.commodity);
    items.push(
      item({
        id: `pipeline:${f.properties.pipeline_id}`,
        name,
        kind: group === "gas" ? "pipeline_gas" : "pipeline_oil",
        countryIso3: f.properties.start_country_iso3 ?? null,
        operator: f.properties.operator,
        target: fitTarget(bounds, group === "gas" ? "gas_pipelines" : "pipelines"),
      }),
    );
  }

  for (const f of sources.basins.features) {
    const name = f.properties.name?.trim();
    if (!name) continue; // basins with no name in the source are not searchable
    const bounds = polygonBounds(f.geometry);
    if (bounds === null) continue;
    items.push(
      item({
        id: `basin:${f.properties.basin_id || name}`,
        name,
        kind: "basin",
        countryIso3: f.properties.country_iso3,
        target: fitTarget(bounds, "basins"),
      }),
    );
  }

  for (const f of sources.shaleRegions.features) {
    const bounds = polygonBounds(f.geometry);
    if (bounds === null) continue;
    items.push(
      item({
        id: `shale_region:${f.properties.region_id}`,
        name: f.properties.name,
        kind: "shale_region",
        countryIso3: "USA",
        target: fitTarget(bounds, "shale_regions"),
      }),
    );
  }

  return items;
}
