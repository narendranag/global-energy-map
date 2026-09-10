"""ISO 3166-1 alpha-3 lookups for source-specific country name spellings.

The single ISO3 API for the pipeline. Each source spells country names its own
way, so there is one dict per source (EI, GEM, NETL, LNG-T3) plus:

    lookup(name, source)       exact lookup in one source's dict
    lookup_iso3(name)          lookup across all dicts merged (LNG-T3 mixes styles)
    netl_country_iso3(value)   NETL ``md_country`` field (may list several countries)
    gem_first_iso3(areas)      first resolvable country in a GEM ``areas`` list
    gem_endpoints_iso3(areas)  (first, last) countries of a GEM ``areas`` list
"""

from __future__ import annotations

# Energy Institute Statistical Review (panel + wide sheets)
EI_NAME_TO_ISO3: dict[str, str] = {
    # North America
    "Canada": "CAN",
    "Mexico": "MEX",
    "US": "USA",
    # South & Central America
    "Argentina": "ARG",
    "Brazil": "BRA",
    "Colombia": "COL",
    "Ecuador": "ECU",
    "Guyana": "GUY",
    "Peru": "PER",
    "Bolivia": "BOL",
    "Trinidad & Tobago": "TTO",
    "Venezuela": "VEN",
    # Europe
    "Denmark": "DNK",
    "Italy": "ITA",
    "Norway": "NOR",
    "Romania": "ROU",
    "United Kingdom": "GBR",
    # Gas-reserves sheet only (holders without an oil-reserves row)
    "Germany": "DEU",
    "Netherlands": "NLD",
    "Poland": "POL",
    "Ukraine": "UKR",
    # CIS / Former USSR
    "Azerbaijan": "AZE",
    "Kazakhstan": "KAZ",
    "Russian Federation": "RUS",
    "Turkmenistan": "TKM",
    "Uzbekistan": "UZB",
    # Middle East
    "Iran": "IRN",
    "Iraq": "IRQ",
    "Kuwait": "KWT",
    "Oman": "OMN",
    "Qatar": "QAT",
    "Saudi Arabia": "SAU",
    "Syria": "SYR",
    "United Arab Emirates": "ARE",
    "Yemen": "YEM",
    "Bahrain": "BHR",
    "Israel": "ISR",
    # Africa
    "Algeria": "DZA",
    "Angola": "AGO",
    "Chad": "TCD",
    "Republic of Congo": "COG",
    "Republic of Congo ": "COG",  # trailing-space variant in production sheet
    "Egypt": "EGY",
    "Equatorial Guinea": "GNQ",
    "Gabon": "GAB",
    "Libya": "LBY",
    "Nigeria": "NGA",
    "South Sudan": "SSD",
    "Sudan": "SDN",
    "Tunisia": "TUN",
    # Asia Pacific
    "Australia": "AUS",
    "Brunei": "BRN",
    "China": "CHN",
    "India": "IND",
    "Indonesia": "IDN",
    "Malaysia": "MYS",
    "Thailand": "THA",
    "Vietnam": "VNM",
    "Bangladesh": "BGD",
    "Myanmar": "MMR",
    "Pakistan": "PAK",
    "Papua New Guinea": "PNG",
}

# Global Energy Monitor (extraction tracker, oil infrastructure tracker)
GEM_NAME_TO_ISO3: dict[str, str] = {
    # Single-country entries
    "Algeria": "DZA",
    "Angola": "AGO",
    "Argentina": "ARG",
    "Australia": "AUS",
    "Austria": "AUT",
    "Azerbaijan": "AZE",
    "Bangladesh": "BGD",
    "Bolivia": "BOL",
    "Brazil": "BRA",
    "Brunei": "BRN",
    "Canada": "CAN",
    "Chad": "TCD",
    "China": "CHN",
    "Colombia": "COL",
    "Cuba": "CUB",
    "Cyprus": "CYP",
    "Côte d'Ivoire": "CIV",
    "Denmark": "DNK",
    "Ecuador": "ECU",
    "Egypt": "EGY",
    "Ethiopia": "ETH",
    "France": "FRA",
    "Germany": "DEU",
    "Ghana": "GHA",
    "Guatemala": "GTM",
    "Guyana": "GUY",
    "Hungary": "HUN",
    "India": "IND",
    "Indonesia": "IDN",
    "Iran": "IRN",
    "Iraq": "IRQ",
    "Ireland": "IRL",
    "Israel": "ISR",
    "Italy": "ITA",
    "Jamaica": "JAM",
    "Kazakhstan": "KAZ",
    "Kenya": "KEN",
    "Kuwait": "KWT",
    "Libya": "LBY",
    "Malaysia": "MYS",
    "Mauritania": "MRT",
    "Mexico": "MEX",
    "Morocco": "MAR",
    "Mozambique": "MOZ",
    "Myanmar": "MMR",
    "Namibia": "NAM",
    "Netherlands": "NLD",
    "Nigeria": "NGA",
    "Norway": "NOR",
    "Oman": "OMN",
    "Pakistan": "PAK",
    "Papua New Guinea": "PNG",
    "Peru": "PER",
    "Poland": "POL",
    "Qatar": "QAT",
    "Romania": "ROU",
    "Russia": "RUS",
    "Saudi Arabia": "SAU",
    "Senegal": "SEN",
    "South Africa": "ZAF",
    "South Sudan": "SSD",
    "Tanzania": "TZA",
    "Thailand": "THA",
    "Timor-Leste": "TLS",
    "Trinidad and Tobago": "TTO",
    "Türkiye": "TUR",
    "Uganda": "UGA",
    "United Arab Emirates": "ARE",
    "United Kingdom": "GBR",
    "United States": "USA",
    "Venezuela": "VEN",
    "Vietnam": "VNM",
    # Additional countries (primarily needed for gas pipeline coverage)
    "Afghanistan": "AFG",
    "Albania": "ALB",
    "Armenia": "ARM",
    "Belarus": "BLR",
    "Belgium": "BEL",
    "Benin": "BEN",
    "Bulgaria": "BGR",
    "Chile": "CHL",
    "Croatia": "HRV",
    "Czech Republic": "CZE",
    "Dominican Republic": "DOM",
    "Estonia": "EST",
    "Finland": "FIN",
    "Georgia": "GEO",
    "Greece": "GRC",
    "Hong Kong": "HKG",
    "Japan": "JPN",
    "Jordan": "JOR",
    "Kyrgyzstan": "KGZ",
    "Latvia": "LVA",
    "Lithuania": "LTU",
    "Luxembourg": "LUX",
    "Moldova": "MDA",
    "New Zealand": "NZL",
    "North Macedonia": "MKD",
    "Philippines": "PHL",
    "Portugal": "PRT",
    "Serbia": "SRB",
    "Singapore": "SGP",
    "Slovakia": "SVK",
    "Slovenia": "SVN",
    "Spain": "ESP",
    "Sweden": "SWE",
    "Switzerland": "CHE",
    "Syria": "SYR",
    "Taiwan": "TWN",
    "Tajikistan": "TJK",
    "Togo": "TGO",
    "Tunisia": "TUN",
    "Turkey": "TUR",
    "Turkmenistan": "TKM",
    "Ukraine": "UKR",
    "Uruguay": "URY",
    "Uzbekistan": "UZB",
    # Multi-country / disputed fields — assign to the geographically dominant
    # or first-named country for the purpose of heat-map aggregation.
    "Iran-Iraq": "IRN",
    "Iran-Saudi Arabia": "IRN",
    "Iran-United Arab Emirates": "IRN",
    "Kuwait-Saudi Arabia": "KWT",
    "Russia-Kazakhstan": "RUS",
    "Saudi Arabia-Iran": "SAU",
    "Senegal-Mauritania": "SEN",
    "Thailand-Malaysia": "THA",
    # Typo variants observed in GEM data
    "Kazkahstan": "KAZ",
    "Equatorial Guinea": "GNQ",
}


# NETL GOGI uses UN-style country names (ISO 3166-1 long form)
NETL_NAME_TO_ISO3: dict[str, str] = {
    "Afghanistan": "AFG",
    "Albania": "ALB",
    "Algeria": "DZA",
    "Angola": "AGO",
    "Antigua and Barbuda": "ATG",
    "Argentina": "ARG",
    "Armenia": "ARM",
    "Australia": "AUS",
    "Austria": "AUT",
    "Azerbaijan": "AZE",
    "Bahamas": "BHS",
    "Bahrain": "BHR",
    "Bangladesh": "BGD",
    "Barbados": "BRB",
    "Belarus": "BLR",
    "Belgium": "BEL",
    "Belize": "BLZ",
    "Benin": "BEN",
    "Bolivia (Plurinational State of)": "BOL",
    "Botswana": "BWA",
    "Brazil": "BRA",
    "Brunei Darussalam": "BRN",
    "Bulgaria": "BGR",
    "Burundi": "BDI",
    "Cabo Verde": "CPV",
    "Cambodia": "KHM",
    "Cameroon": "CMR",
    "Canada": "CAN",
    "Central African Republic": "CAF",
    "Chad": "TCD",
    "Chile": "CHL",
    "China": "CHN",
    "Colombia": "COL",
    "Comoros": "COM",
    "Costa Rica": "CRI",
    "Congo": "COG",
    "Cote D'Ivoire": "CIV",
    "Cote D''Ivoire": "CIV",  # double-apostrophe variant in NETL GeoJSON
    "Croatia": "HRV",
    "Cuba": "CUB",
    "Cyprus": "CYP",
    "Czech Republic": "CZE",
    "Democratic People's Republic of Korea": "PRK",
    "Democratic People''s Republic of Korea": "PRK",  # double-apostrophe variant
    "Democratic Republic of the Congo": "COD",
    "Denmark": "DNK",
    "Djibouti": "DJI",
    "Dominica": "DMA",
    "Dominican Republic": "DOM",
    "Ecuador": "ECU",
    "Egypt": "EGY",
    "El Salvador": "SLV",
    "Equatorial Guinea": "GNQ",
    "Eritrea": "ERI",
    "Estonia": "EST",
    "Ethiopia": "ETH",
    "Fiji": "FJI",
    "Finland": "FIN",
    "France": "FRA",
    "Gabon": "GAB",
    "Gambia (Republic of The)": "GMB",
    "Georgia": "GEO",
    "Germany": "DEU",
    "Ghana": "GHA",
    "Greece": "GRC",
    "Guatemala": "GTM",
    "Guinea": "GIN",
    "Guyana": "GUY",
    "Haiti": "HTI",
    "Honduras": "HND",
    "Hungary": "HUN",
    "Iceland": "ISL",
    "India": "IND",
    "Indonesia": "IDN",
    "Iran (Islamic Republic of)": "IRN",
    "Iraq": "IRQ",
    "Ireland": "IRL",
    "Israel": "ISR",
    "Italy": "ITA",
    "Jamaica": "JAM",
    "Japan": "JPN",
    "Jordan": "JOR",
    "Kazakhstan": "KAZ",
    "Kenya": "KEN",
    "Kuwait": "KWT",
    "Kyrgyzstan": "KGZ",
    "Lao People's Democratic Republic": "LAO",
    "Latvia": "LVA",
    "Lebanon": "LBN",
    "Lesotho": "LSO",
    "Libya": "LBY",
    "Lithuania": "LTU",
    "Luxembourg": "LUX",
    "Madagascar": "MDG",
    "Malawi": "MWI",
    "Malaysia": "MYS",
    "Malta": "MLT",
    "Mauritius": "MUS",
    "Mexico": "MEX",
    "Mongolia": "MNG",
    "Montenegro": "MNE",
    "Morocco": "MAR",
    "Mozambique": "MOZ",
    "Myanmar": "MMR",
    "Namibia": "NAM",
    "Nepal": "NPL",
    "Netherlands": "NLD",
    "New Zealand": "NZL",
    "Nicaragua": "NIC",
    "Niger": "NER",
    "Nigeria": "NGA",
    "Norway": "NOR",
    "Oman": "OMN",
    "Pakistan": "PAK",
    "Panama": "PAN",
    "Papua New Guinea": "PNG",
    "Paraguay": "PRY",
    "Peru": "PER",
    "Philippines": "PHL",
    "Poland": "POL",
    "Portugal": "PRT",
    "Qatar": "QAT",
    "Republic of Korea": "KOR",
    "Republic of Moldova": "MDA",
    "Romania": "ROU",
    "Russian Federation": "RUS",
    "Saint Kitts and Nevis": "KNA",
    "Sao Tome and Principe": "STP",
    "Saudi Arabia": "SAU",
    "Senegal": "SEN",
    "Serbia": "SRB",
    "Seychelles": "SYC",
    "Sierra Leone": "SLE",
    "Singapore": "SGP",
    "Slovakia": "SVK",
    "Slovenia": "SVN",
    "Solomon Islands": "SLB",
    "Somalia": "SOM",
    "South Africa": "ZAF",
    "South Sudan": "SSD",
    "Spain": "ESP",
    "Sri Lanka": "LKA",
    "Sudan": "SDN",
    "Sweden": "SWE",
    "Switzerland": "CHE",
    "Syrian Arab Republic": "SYR",
    "Thailand": "THA",
    "The Former Yugoslav Republic of Macedonia": "MKD",
    "Togo": "TGO",
    "Trinidad and Tobago": "TTO",
    "Tunisia": "TUN",
    "Turkey": "TUR",
    "Turkmenistan": "TKM",
    "Uganda": "UGA",
    "Ukraine": "UKR",
    "United Arab Emirates": "ARE",
    "United Kingdom": "GBR",
    "United Republic of Tanzania": "TZA",
    "United States of America": "USA",
    "Uruguay": "URY",
    "Uzbekistan": "UZB",
    "Vanuatu": "VUT",
    "Venezuela": "VEN",  # short form when comma-split tokenizes the full name
    "Venezuela, Bolivarian Republic of": "VEN",
    "Viet Nam": "VNM",
    "Yemen": "YEM",
    "Zambia": "ZMB",
    # Added in Task 8 (ports coverage)
    "Bosnia and Herzegovina": "BIH",
    "Grenada": "GRD",
    "Guinea Bissau": "GNB",
    "Kiribati": "KIR",
    "Liberia": "LBR",
    "Maldives": "MDV",
    "Marshall Islands": "MHL",
    "Mauritania": "MRT",
    "Micronesia (Federated States of)": "FSM",
    "Monaco": "MCO",
    "Nauru": "NRU",
    "Palau": "PLW",
    "Saint Lucia": "LCA",
    "Saint Vincent and the Grenadines": "VCT",
    "Samoa": "WSM",
    "Suriname": "SUR",
    "Timor-Leste": "TLS",
    "Tonga": "TON",
    "Tuvalu": "TUV",
}


# LNG-T3 country-name → ISO3 mapping (Phase 6).
# LNG-T3 uses a mix of UN-style and short English names. Most overlap with
# GEM/NETL/EI dicts; this covers Phase 6 deltas.
LNG_T3_NAME_TO_ISO3: dict[str, str] = {
    "Gibraltar": "GIB",
    "Republic of the Congo": "COG",
    "South Korea": "KOR",
}


# Real ISO 3166-1 alpha-3 codes that appear in BACI trade data but have no
# polygon in Natural Earth admin-0 1:110m (public/data/countries.geojson) —
# small island states and territories, city-states, and codes NE spells
# differently (NE uses SDS for South Sudan, PSX for Palestine). Derived on
# 2026-09-10 by listing every trade_flow code absent from countries.geojson.
#
# ANT (Netherlands Antilles, dissolved 2010) and SCG (Serbia and Montenegro,
# dissolved 2006) are withdrawn-but-genuine ISO 3166-1 codes for real
# territories; BACI uses them for pre-dissolution years, so they stay.
#
# Deliberately EXCLUDED (BACI pseudo-codes, not territories):
#   S19  "Other Asia, nes"  — never reaches the filter: build_trade_flow remaps
#        it to TWN first (BACI reports Taiwan under this code)
#   ZA1  "Southern African Customs Union (...1999)" (customs-union aggregate)
#   PUS  "US Misc. Pacific Isds"                    (BACI code; ISO is UMI)
TRADE_ISO3_ALLOWLIST: frozenset[str] = frozenset(
    {
        "ABW",
        "AIA",
        "AND",
        "ANT",
        "ASM",
        "ATG",
        "BES",
        "BHR",
        "BLM",
        "BMU",
        "BRB",
        "CCK",
        "COK",
        "COM",
        "CPV",
        "CUW",
        "CXR",
        "CYM",
        "DMA",
        "FSM",
        "GIB",
        "GRD",
        "GUM",
        "HKG",
        "IOT",
        "KIR",
        "KNA",
        "LCA",
        "MAC",
        "MDV",
        "MHL",
        "MLT",
        "MNP",
        "MSR",
        "MUS",
        "MYT",
        "NFK",
        "NIU",
        "NRU",
        "PCN",
        "PLW",
        "PSE",
        "PYF",
        "SCG",
        "SGP",
        "SHN",
        "SMR",
        "SPM",
        "SSD",
        "STP",
        "SXM",
        "SYC",
        "TCA",
        "TKL",
        "TON",
        "TUV",
        "VCT",
        "VGB",
        "WLF",
        "WSM",
    }
)


_BY_SOURCE: dict[str, dict[str, str]] = {
    "ei": EI_NAME_TO_ISO3,
    "gem": GEM_NAME_TO_ISO3,
    "netl": NETL_NAME_TO_ISO3,
    "lng_t3": LNG_T3_NAME_TO_ISO3,
}

# All source dicts merged. No name maps to two different codes across the dicts
# (asserted in tests/python/test_iso3.py), so merge order does not matter.
_MERGED: dict[str, str] = {
    **GEM_NAME_TO_ISO3,
    **NETL_NAME_TO_ISO3,
    **EI_NAME_TO_ISO3,
    **LNG_T3_NAME_TO_ISO3,
}


def lookup(name: str, source: str) -> str | None:
    """Return iso3 for a name; source in {'ei', 'gem', 'netl', 'lng_t3'}."""
    table = _BY_SOURCE[source]
    return table.get(name) or table.get(name.strip())


def lookup_iso3(name: str | None) -> str | None:
    """Return the ISO3 code for a country name in any source's spelling, or None."""
    if not name:
        return None
    return _MERGED.get(name.strip())


def netl_country_iso3(md_country: object) -> str | None:
    """Resolve NETL's ``md_country`` field to ISO3 (first country when several).

    NETL separates multiple countries with ``;``. Without a ``;`` the whole
    string is tried first (``"Venezuela, Bolivarian Republic of"`` contains a
    comma), then the part before the first comma. GeoJSON-escaped quotes
    (``"Cote D''Ivoire"``) are unescaped.
    """
    if not isinstance(md_country, str) or not md_country.strip():
        return None
    val = md_country.strip().replace("''", "'")
    if ";" in val:
        return NETL_NAME_TO_ISO3.get(val.split(";")[0].strip())
    return NETL_NAME_TO_ISO3.get(val) or NETL_NAME_TO_ISO3.get(val.split(",")[0].strip())


def gem_first_iso3(areas: object) -> str | None:
    """First country in a GEM ``;``-separated ``areas`` string that resolves to ISO3."""
    if not isinstance(areas, str):
        return None
    for part in areas.split(";"):
        iso3 = GEM_NAME_TO_ISO3.get(part.strip())
        if iso3:
            return iso3
    return None


def gem_endpoints_iso3(areas: object) -> tuple[str | None, str | None]:
    """``(start, end)`` ISO3 of a GEM ``areas`` string (a pipeline's first/last country).

    ``end`` is None for a single-country string; either side is None when its
    name does not resolve.
    """
    if not isinstance(areas, str) or not areas.strip():
        return None, None
    parts = [p.strip() for p in areas.split(";") if p.strip()]
    start = GEM_NAME_TO_ISO3.get(parts[0]) if parts else None
    end = GEM_NAME_TO_ISO3.get(parts[-1]) if len(parts) > 1 else None
    return start, end
