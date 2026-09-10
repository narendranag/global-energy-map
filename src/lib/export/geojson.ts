import type { Feature, FeatureCollection, Geometry, LineString, Point } from "geojson";

/**
 * GeoJSON (RFC 7946) builders for exports. Coordinates are WGS84 lon/lat.
 * Provenance travels as a `metadata` foreign member on the collection
 * (RFC 7946 §6.1 permits foreign members; GIS tools ignore it).
 */

export interface ExportMetadata {
  readonly title: string;
  readonly view_url: string;
  readonly exported: string;
  readonly cite: string;
  readonly sources: readonly {
    readonly name: string;
    readonly dataset: string;
    readonly license: string;
    readonly as_of: string;
    readonly url: string;
    readonly attribution?: string;
  }[];
  readonly note?: string;
}

function finite(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

/** Pick `keys` from `row` in order; undefined → null (GeoJSON properties are JSON). */
export function pickProps<R extends Record<string, unknown>>(
  row: R,
  keys: readonly (keyof R & string)[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = row[k] ?? null;
  return out;
}

/** Rows with finite lon/lat → Point features; rows without coordinates are dropped. */
export function pointFeatures<R extends Record<string, unknown>>(
  rows: readonly R[],
  props: readonly (keyof R & string)[],
  lonKey: keyof R & string = "lon",
  latKey: keyof R & string = "lat",
): Feature<Point>[] {
  const out: Feature<Point>[] = [];
  for (const r of rows) {
    const lon = r[lonKey];
    const lat = r[latKey];
    if (!finite(lon) || !finite(lat)) continue;
    out.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [lon, lat] },
      properties: pickProps(r, props),
    });
  }
  return out;
}

/** Straight from→to LineStrings (e.g. voyages between terminals). */
export function lineFeatures<R extends Record<string, unknown>>(
  rows: readonly R[],
  props: readonly (keyof R & string)[],
  ends: {
    readonly fromLon: keyof R & string;
    readonly fromLat: keyof R & string;
    readonly toLon: keyof R & string;
    readonly toLat: keyof R & string;
  },
): Feature<LineString>[] {
  const out: Feature<LineString>[] = [];
  for (const r of rows) {
    const a = [r[ends.fromLon], r[ends.fromLat]];
    const b = [r[ends.toLon], r[ends.toLat]];
    if (![...a, ...b].every(finite)) continue;
    out.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates: [a as number[], b as number[]] },
      properties: pickProps(r, props),
    });
  }
  return out;
}

/** Existing features with their properties narrowed to `props`. */
export function reprojectProps<G extends Geometry, P extends Record<string, unknown>>(
  features: readonly Feature<G, P>[],
  props: readonly (keyof P & string)[],
): Feature<G>[] {
  return features.map((f) => ({
    type: "Feature",
    geometry: f.geometry,
    properties: pickProps(f.properties, props),
  }));
}

export function featureCollection<G extends Geometry>(
  features: readonly Feature<G>[],
  metadata: ExportMetadata,
): FeatureCollection<G> & { readonly metadata: ExportMetadata } {
  return { type: "FeatureCollection", metadata, features: [...features] };
}
