import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { dataUrl } from "@/lib/data/urls";

export interface CountryProps {
  readonly iso3: string;
  readonly name: string;
}

export type CountryCollection = FeatureCollection<Polygon | MultiPolygon, CountryProps>;

// Cache the in-flight promise, not the resolved value: two callers mounting in
// the same tick must share one fetch. On failure the cache is cleared so a
// later call can retry.
let _promise: Promise<CountryCollection> | undefined;

export function loadCountries(): Promise<CountryCollection> {
  _promise ??= (async () => {
    const res = await fetch(dataUrl("/data/countries.geojson"));
    if (!res.ok) throw new Error("countries.geojson fetch failed");
    return (await res.json()) as CountryCollection;
  })().catch((err: unknown) => {
    _promise = undefined;
    throw err;
  });
  return _promise;
}

/**
 * Real ISO 3166-1 alpha-3 countries/territories (plus a few ISO 3166-3
 * historical codes BACI still uses) that appear in trade data but have no
 * polygon in Natural Earth admin-0 1:110m — mostly small islands and
 * city-states. Singapore and Bahrain are material crude importers, so a
 * "known country" check must not rely on the polygon set alone.
 *
 * BACI pseudo-codes (`S19`, `ZA1`, `PUS`, …) are deliberately absent.
 */
export const EXTRA_COUNTRY_NAMES: Readonly<Record<string, string>> = {
  ABW: "Aruba",
  AIA: "Anguilla",
  AND: "Andorra",
  ANT: "Netherlands Antilles",
  ASM: "American Samoa",
  ATG: "Antigua and Barbuda",
  BES: "Bonaire, Sint Eustatius and Saba",
  BHR: "Bahrain",
  BLM: "Saint Barthélemy",
  BMU: "Bermuda",
  BRB: "Barbados",
  CCK: "Cocos (Keeling) Islands",
  COK: "Cook Islands",
  COM: "Comoros",
  CPV: "Cabo Verde",
  CUW: "Curaçao",
  CXR: "Christmas Island",
  CYM: "Cayman Islands",
  DMA: "Dominica",
  FSM: "Micronesia",
  GIB: "Gibraltar",
  GRD: "Grenada",
  GUM: "Guam",
  HKG: "Hong Kong",
  IOT: "British Indian Ocean Territory",
  KIR: "Kiribati",
  KNA: "Saint Kitts and Nevis",
  LCA: "Saint Lucia",
  MAC: "Macao",
  MDV: "Maldives",
  MHL: "Marshall Islands",
  MLT: "Malta",
  MNP: "Northern Mariana Islands",
  MSR: "Montserrat",
  MUS: "Mauritius",
  MYT: "Mayotte",
  NFK: "Norfolk Island",
  NIU: "Niue",
  NRU: "Nauru",
  PCN: "Pitcairn",
  PLW: "Palau",
  PSE: "Palestine",
  PYF: "French Polynesia",
  SCG: "Serbia and Montenegro",
  SGP: "Singapore",
  SHN: "Saint Helena",
  SMR: "San Marino",
  SPM: "Saint Pierre and Miquelon",
  SSD: "South Sudan",
  STP: "São Tomé and Príncipe",
  SXM: "Sint Maarten",
  SYC: "Seychelles",
  TCA: "Turks and Caicos Islands",
  TKL: "Tokelau",
  TON: "Tonga",
  TUV: "Tuvalu",
  VCT: "Saint Vincent and the Grenadines",
  VGB: "British Virgin Islands",
  WLF: "Wallis and Futuna",
  WSM: "Samoa",
};

/** iso3 → display name: Natural Earth polygons plus EXTRA_COUNTRY_NAMES. */
export function countryNameMap(fc: CountryCollection): ReadonlyMap<string, string> {
  const m = new Map<string, string>(Object.entries(EXTRA_COUNTRY_NAMES));
  for (const f of fc.features) m.set(f.properties.iso3, f.properties.name);
  return m;
}
