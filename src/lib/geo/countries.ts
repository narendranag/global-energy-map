import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";

export interface CountryProps {
  readonly iso3: string;
  readonly name: string;
}

let _cache: FeatureCollection<Polygon | MultiPolygon, CountryProps> | undefined;

export async function loadCountries(): Promise<
  FeatureCollection<Polygon | MultiPolygon, CountryProps>
> {
  if (_cache) return _cache;
  const res = await fetch("/data/countries.geojson");
  if (!res.ok) throw new Error("countries.geojson fetch failed");
  _cache = (await res.json()) as FeatureCollection<Polygon | MultiPolygon, CountryProps>;
  return _cache;
}
