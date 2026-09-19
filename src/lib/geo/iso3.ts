/**
 * The ISO3 codes a `focus` selection may name.
 *
 * `decodeAppState` has to validate `focus=` synchronously — long before
 * `countries.geojson` has been fetched — so the polygon set is mirrored here
 * as a literal. `tests/unit/geo/iso3.test.ts` reads the shipped GeoJSON and
 * fails if the two drift; regenerate with
 *
 *     node -e "const fs=require('fs');console.log(JSON.parse(fs.readFileSync('public/data/countries.geojson','utf8')).features.map(f=>f.properties.iso3).sort().join(' '))"
 *
 * Codes in `EXTRA_COUNTRY_NAMES` (Singapore, Bahrain, Malta, … — real
 * countries that appear in trade data but have no 1:110m polygon) are
 * deliberately *not* focusable: a focus must be drawable, and `countryBounds`
 * would have no geometry to compute from.
 */
export const NATURAL_EARTH_ISO3: readonly string[] = [
  "AFG", "AGO", "ALB", "ARE", "ARG", "ARM", "ATA", "ATF", "AUS", "AUT", "AZE", "BDI", "BEL",
  "BEN", "BFA", "BGD", "BGR", "BHS", "BIH", "BLR", "BLZ", "BOL", "BRA", "BRN", "BTN", "BWA",
  "CAF", "CAN", "CHE", "CHL", "CHN", "CIV", "CMR", "COD", "COG", "COL", "CRI", "CUB", "CYN",
  "CYP", "CZE", "DEU", "DJI", "DNK", "DOM", "DZA", "ECU", "EGY", "ERI", "ESP", "EST", "ETH",
  "FIN", "FJI", "FLK", "FRA", "GAB", "GBR", "GEO", "GHA", "GIN", "GMB", "GNB", "GNQ", "GRC",
  "GRL", "GTM", "GUY", "HND", "HRV", "HTI", "HUN", "IDN", "IND", "IRL", "IRN", "IRQ", "ISL",
  "ISR", "ITA", "JAM", "JOR", "JPN", "KAZ", "KEN", "KGZ", "KHM", "KOR", "KOS", "KWT", "LAO",
  "LBN", "LBR", "LBY", "LKA", "LSO", "LTU", "LUX", "LVA", "MAR", "MDA", "MDG", "MEX", "MKD",
  "MLI", "MMR", "MNE", "MNG", "MOZ", "MRT", "MWI", "MYS", "NAM", "NCL", "NER", "NGA", "NIC",
  "NLD", "NOR", "NPL", "NZL", "OMN", "PAK", "PAN", "PER", "PHL", "PNG", "POL", "PRI", "PRK",
  "PRT", "PRY", "PSX", "QAT", "ROU", "RUS", "RWA", "SAH", "SAU", "SDN", "SDS", "SEN", "SLB",
  "SLE", "SLV", "SOL", "SOM", "SRB", "SUR", "SVK", "SVN", "SWE", "SWZ", "SYR", "TCD", "TGO",
  "THA", "TJK", "TKM", "TLS", "TTO", "TUN", "TUR", "TWN", "TZA", "UGA", "UKR", "URY", "USA",
  "UZB", "VEN", "VNM", "VUT", "YEM", "ZAF", "ZMB", "ZWE",
];

const KNOWN = new Set(NATURAL_EARTH_ISO3);

/** True when `iso3` names a country we hold a polygon for. */
export function isKnownCountry(iso3: string): boolean {
  return KNOWN.has(iso3);
}

/**
 * Normalise a URL- or user-supplied country code: trimmed and upper-cased, or
 * null when it is not three letters or names no country we hold. Accepting
 * lower case is a one-way convenience for hand-typed links — `encodeAppState`
 * only ever writes the canonical upper-case form.
 */
export function parseIso3(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const code = raw.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) && isKnownCountry(code) ? code : null;
}
