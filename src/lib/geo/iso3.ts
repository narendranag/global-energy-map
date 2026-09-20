import { countryAnchor } from "./country-anchors";
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
 * countries that appear in trade data but have no 1:110m polygon) are *also*
 * focusable since B1: see `isFocusableCountry`. They have no geometry for
 * `countryBounds`, so their outline is a ring at the country anchor and their
 * fit is a flyTo — the list here stays the polygon set, nothing more.
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

/**
 * Natural Earth admin-0 uses two codes that are not ISO 3166-1 alpha-3:
 * **SDS** for South Sudan (ISO: SSD) and **PSX** for Palestine (ISO: PSE).
 * Every data file we ship — BACI, UN Comtrade, the EI series, the asset
 * table — uses the ISO codes, so a `focus` taken from a polygon and handed to
 * a data query used to match nothing: `?focus=SDS` reported zero trade for a
 * country that exported 620 kt of crude in 2024 (A2).
 *
 * The two directions are named for what they are used for, not for the
 * publishers: {@link dataIso3} takes a polygon/focus code to the code the
 * parquet files carry, {@link polygonIso3} takes a data row's code back to
 * the polygon (and therefore to a focusable selection). Both are the identity
 * for every other code, including those with no polygon at all (SGP, HKG, …).
 *
 * `tests/unit/geo/iso3-alias.test.ts` reads the shipped BACI file and fails
 * if any focusable code stops resolving.
 */
const NE_TO_DATA: Readonly<Record<string, string>> = { SDS: "SSD", PSX: "PSE" };
const DATA_TO_NE: Readonly<Record<string, string>> = { SSD: "SDS", PSE: "PSX" };

/** A polygon/focus code as the shipped data files spell it. */
export function dataIso3(iso3: string): string {
  return NE_TO_DATA[iso3] ?? iso3;
}

/** A data row's code as the polygon set spells it (identity when there is none). */
export function polygonIso3(iso3: string): string {
  return DATA_TO_NE[iso3] ?? iso3;
}

/**
 * Focusable codes that genuinely have no row in `trade_flow.parquet`, so the
 * alias test can tell a missing alias from an honest gap: Antarctica, Northern
 * Cyprus, Kosovo, Puerto Rico (reported inside the USA), Western Sahara and
 * Somaliland. None of them is a separate customs territory in BACI.
 */
export const KNOWN_ABSENT_FROM_TRADE: readonly string[] = [
  "ATA",
  "CYN",
  "KOS",
  "PRI",
  "SAH",
  "SOL",
];

const KNOWN = new Set(NATURAL_EARTH_ISO3);

/** True when `iso3` names a country we hold a polygon for. */
export function isKnownCountry(iso3: string): boolean {
  return KNOWN.has(iso3);
}

/**
 * True when `iso3` may be the `focus` selection (B1).
 *
 * Wider than {@link isKnownCountry}: the panel's partner rows routinely name
 * real countries with no 1:110m polygon — Singapore (the region's refining
 * hub), Bahrain (a Gulf exporter), Hong Kong, Curaçao, Mauritius, Barbados.
 * Selecting one used to open a panel with no outline, a "Zoom to" that did
 * nothing, and a `?focus=` the reload threw away. The test is a country
 * **anchor** instead, which `country-anchors.ts` holds for every Natural
 * Earth country *and* every BACI-only territory, and deliberately not for
 * BACI's pseudo-country aggregates (`S19`, `ZA1`, …). A polygon-less
 * selection outlines as a ring at its anchor and fits by flying to it.
 */
export function isFocusableCountry(iso3: string): boolean {
  return countryAnchor(iso3) !== undefined;
}

/**
 * Normalise a URL- or user-supplied country code: trimmed and upper-cased, or
 * null when it is not three letters or names no country we can select
 * (`isFocusableCountry`, which includes the polygon-less ones). Accepting
 * lower case is a one-way convenience for hand-typed links — `encodeAppState`
 * only ever writes the canonical upper-case form.
 */
export function parseIso3(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const raised = raw.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(raised)) return null;
  // `focus` is canonically the polygon code, so a hand-typed ISO code for one
  // of Natural Earth's two oddities (SSD, PSE) resolves to it rather than to
  // a phantom selection with no outline (A2).
  const code = polygonIso3(raised);
  return isFocusableCountry(code) ? code : null;
}
