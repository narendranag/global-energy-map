/**
 * Country bounding boxes for the camera seam: `[west, south, east, north]`
 * computed from the shipped `countries.geojson` (Natural Earth admin-0,
 * 1:110m — the same polygons the choropleths and the focus outline draw).
 */
import type { Position } from "geojson";
import type { CountryCollection } from "./countries";
import { loadCountries } from "./countries";
import type { Bounds } from "@/lib/state/camera";
import { MAX_LAT } from "@/lib/state/view";

/**
 * A country whose polygons span more than this much longitude has almost
 * certainly been cut by the antimeridian (Russia's Chukotka, the USA's
 * Aleutians, Fiji, New Zealand's Chathams): the naive union of its parts
 * would be "the whole world". Half the globe is well past any real country's
 * own extent — Russia, the widest, spans ~170°.
 */
const ANTIMERIDIAN_SPAN_DEG = 180;

/**
 * Countries fitted to their largest polygon even though their parts do not
 * cross ±180°. Only one so far: the USA's Alaska polygon stops just short of
 * the antimeridian, so the span rule below never fires, yet the union of the
 * lower 48 and Alaska is a 101°-wide box centred on the north Pacific. "Focus
 * the USA" means the contiguous states; Alaska is a pan away.
 */
const MAINLAND_ONLY = new Set(["USA"]);

/**
 * Smallest box a fit is allowed to use, in degrees. Below this a
 * single-island state (Singapore has no polygon here, but Bahrain-sized
 * countries do) would fit to a few hundred metres of basemap. `FIT_MAX_ZOOM`
 * also caps the result; this keeps the *shape* sane as well.
 */
export const MIN_BOUNDS_SPAN_DEG = 1.5;

function isFinitePosition(p: Position): boolean {
  return Number.isFinite(p[0]) && Number.isFinite(p[1]);
}

/**
 * `[west, south, east, north]` of a ring set, or null when it has no usable
 * point. Generic over any array-of-position-arrays: a polygon's rings, a
 * MultiPolygon's rings flattened one level, a LineString wrapped in a single
 * outer array, or a MultiLineString's lines as-is — `src/lib/search/build.ts`
 * reuses it for pipeline/basin/shale-region bounds.
 */
export function ringsBounds(rings: readonly Position[][]): Bounds | null {
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const ring of rings) {
    for (const p of ring) {
      if (!isFinitePosition(p)) continue;
      const [lon, lat] = p as [number, number];
      if (lon < w) w = lon;
      if (lon > e) e = lon;
      if (lat < s) s = lat;
      if (lat > n) n = lat;
    }
  }
  return Number.isFinite(w) && Number.isFinite(s) ? [w, s, e, n] : null;
}

/** Rough size of a box, latitude-weighted so polar slivers do not win. */
function boxArea([w, s, e, n]: Bounds): number {
  const midLat = ((s + n) / 2) * (Math.PI / 180);
  return (e - w) * Math.cos(midLat) * (n - s);
}

function union(a: Bounds, b: Bounds): Bounds {
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
}

/** Grow a box about its centre until both spans reach `MIN_BOUNDS_SPAN_DEG`. */
export function withMinimumExtent(bounds: Bounds, min = MIN_BOUNDS_SPAN_DEG): Bounds {
  const [w, s, e, n] = bounds;
  const padLon = Math.max(0, min - (e - w)) / 2;
  const padLat = Math.max(0, min - (n - s)) / 2;
  return [
    Math.max(-180, w - padLon),
    Math.max(-MAX_LAT, s - padLat),
    Math.min(180, e + padLon),
    Math.min(MAX_LAT, n + padLat),
  ];
}

/**
 * Bounds of the country `iso3` in `fc`, or null when it has no polygon.
 *
 * **Antimeridian.** Russia, the USA, Fiji and New Zealand all have parts on
 * both sides of ±180°, and their naive union is the entire globe. Rather than
 * carry a hand-maintained override table, a country whose parts span more than
 * {@link ANTIMERIDIAN_SPAN_DEG} falls back to the bounds of its **largest**
 * polygon, which is also the useful answer: Russia fits to the mainland, the
 * USA to the lower 48, Fiji to Viti Levu, New Zealand to the South Island.
 * (Shifting the eastern parts by +360 and fitting across the seam is possible,
 * but MapLibre would then frame a mostly-empty Pacific.)
 */
export function countryBoundsFrom(fc: CountryCollection, iso3: string): Bounds | null {
  const feature = fc.features.find((f) => f.properties.iso3 === iso3);
  if (!feature) return null;
  const geom = feature.geometry;
  const parts: Position[][][] =
    geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;

  const partBounds = parts
    .map(ringsBounds)
    .filter((b): b is Bounds => b !== null);
  if (partBounds.length === 0) return null;

  const all = partBounds.reduce(union);
  const mainlandOnly = MAINLAND_ONLY.has(iso3) || all[2] - all[0] > ANTIMERIDIAN_SPAN_DEG;
  const chosen = mainlandOnly
    ? partBounds.reduce((a, b) => (boxArea(b) > boxArea(a) ? b : a))
    : all;
  return withMinimumExtent(chosen);
}

/**
 * Bounds of `iso3` from the shared (cached) countries load, or null when we
 * have no polygon for it. Async because `countries.geojson` is fetched, not
 * bundled; callers that already hold the collection use
 * {@link countryBoundsFrom}.
 */
export async function countryBounds(iso3: string): Promise<Bounds | null> {
  return countryBoundsFrom(await loadCountries(), iso3);
}
