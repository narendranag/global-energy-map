# Tanker AIS data sources — research memo

> Date: 2026-05-19. Author: research pass via Tavily + Exa + targeted Zenodo / WebFetch probes. Informs Phase 6+ brainstorming on the deferred "Tanker / LNG carrier AIS" slice.

## TL;DR

A Phase 6 "tanker AIS" slice can ship two real layers without paying for AIS data, by treating LNG carriers and US-coastal oil tankers as separate open-data problems:

1. **LNG carriers — globally, daily, 2020–2024 — solved.** The LNG-T3 dataset (Zhou 2026, Zenodo `10.5281/zenodo.19571058`, **CC BY 4.0**) gives us 406 LNG vessels, 545 LNG terminals, daily voyage and throughput records, and country-to-country flows. ~27 MB total across 7 CSVs/ZIPs. Validated against GIE, EIA, Eurostat, and GIIGNL. Strictly better than what we have now (GEM GGIT: 434 terminals, no voyage data).
2. **US-coastal oil tankers — historical, 2009–2024 — solved.** MarineCadastre.gov publishes the US Coast Guard NAIS feed as CSV/GeoPackage/GeoTIFF under public-domain US Government work, with per-record fields including MMSI, IMO, VesselType, BaseDateTime, lat/lon, SOG, COG. Filter to VesselType 80–89 for tankers.
3. **Global oil tanker positions — still paid territory.** No open dataset matches the LNG-T3 quality for oil tankers. The next-best free options (Global Fishing Watch aggregated presence, AISStream live WebSocket) come with material caveats — non-commercial license and no-SLA-beta respectively. Deferring "global oil tanker positions" is the honest call; the project is already coherent without it.

The recommended Phase 6 scope is therefore **LNG-T3 ingest (vertical slice)** as one phase, optionally with US-coastal-tankers as a follow-up. Global commercial AIS is a separate decision tied to whether the project ever takes a budget for paid data.

---

## What was searched

Six query passes across Tavily and Exa plus targeted WebFetch + Zenodo REST probes:

1. Free / open AIS APIs (general)
2. MarineCadastre / NOAA AIS archive
3. Commercial AIS providers (AISHub, AISStream, Spire, MarineTraffic, Datalastic)
4. Academic/research AIS datasets (Zenodo, Figshare, IEEE DataPort)
5. Global Fishing Watch and shipping-focused open data
6. Tanker analytics platforms (Vortexa, Kpler, ClipperData, TankerTrackers, FleetMon, TankerMap)

Plus follow-up drills on the Nature paper, EMSA / EMODnet, AISStream documentation, and the GFW API.

---

## Tier 1 — Authoritative open data we should adopt

### LNG-T3 (Global Marine LNG Terminals, Tankers & Trade)

- **DOI:** `10.5281/zenodo.19571058`
- **Paper:** Zhou et al. (2026), *Scientific Data* — `https://www.nature.com/articles/s41597-026-07454-2`
- **License:** **CC BY 4.0**
- **Published:** 2026-04-01 (Zenodo deposit); paper published 2026-05-19
- **Files (7, ~27 MB total):**
  - `LNG_tanker.csv` (128 KB) — 406-vessel global LNG tanker fleet inventory
  - `LNG_terminal.csv` (61 KB) — 545 LNG terminals (import + export), harmonized from open sources
  - `LNG_tanker_voyage.csv` (1944 KB) — AIS-derived voyage records 2020–2024
  - `LNG_trade_daily.csv` (932 KB) — country-to-country daily LNG trade flows
  - `LNG_terminal_daily.csv` (656 KB) — daily terminal-level throughput
  - `AIS_feed.zip` (226 KB) — underlying AIS feed
  - `code.zip` (23 MB) — reproducible ingest + voyage-detection pipeline (Python)
- **Validated against:** Gas Infrastructure Europe (GIE), U.S. EIA, Eurostat, GIIGNL
- **Coverage:** Global, daily resolution, 2020–2024
- **Captures structural events:** Europe's post-2022 LNG import surge, US export expansion, continued Russian LNG flows despite pipeline sanctions, diversification to Cameroon / Turkmenistan / Peru as smaller exporters

**Why it matters here.** Compared to our current GEM GGIT-derived LNG terminals (434 facilities, capacity in mtpa, no flow data), LNG-T3 adds:

- 26% more terminals (545 vs 434)
- A vessel-level fleet inventory we don't have today
- **Actual daily throughput** by terminal — first time we have non-capacity LNG flow data
- **Country-to-country daily trade flows** validated against the authoritative references
- A coherent voyage model linking exporter terminals → vessels → importer terminals

The Phase 3 Hormuz-LNG scenario currently uses BACI HS 271111 annual trade flows attributed to GEM terminals via capacity-weighted share. LNG-T3 replaces that "assumption stack" with measurements: the scenario engine can use actual 2020–2024 daily flows instead of annual BACI + capacity proxy.

**Caveats / open questions to confirm before ingest:**

- Schema details (column names, units) — not verified yet beyond filenames.
- Whether `LNG_tanker_voyage.csv` includes per-position geometry or just origin/destination/timestamps.
- Whether vessel identifiers are MMSI/IMO/both (matters for cross-linking with any future oil-tanker data).
- Single-author dataset (Zhou); validation references are strong but a second-source cross-check would be reassuring before relying on it for scenarios.

---

### MarineCadastre.gov (US Coast Guard NAIS)

- **URL:** `https://coast.noaa.gov/digitalcoast/data/vesseltraffic.html`
- **Publisher:** NOAA Office for Coastal Management + Bureau of Ocean Energy Management
- **License:** Free for public use (US Government work, public domain — the FAQ explicitly states the data are "free for public use" including for "commercial entities")
- **Coverage:** US coastal and EEZ waters, 2009–2024
- **Format:** CSV, OGC GeoPackages, GeoTIFFs, Esri web services
- **Granularity:** Per-broadcast point records (raw AIS positions)
- **Schema:** Per-record fields include MMSI, IMO, VesselType, BaseDateTime, LAT/LON, SOG, COG, Heading, Status, plus vessel particulars when broadcast (length, width, draft, cargo class)
- **Tanker filter:** AIS ShipType codes 80–89 (tanker class); 80 = Tanker (all ships of this type), 81–89 = subclasses including hazardous cargo categories

**Why it matters here.** The US is the world's #1 crude producer and a top LNG exporter. Real per-position tracks in US Gulf, USEC, USWC, and Alaska waters cover most of the chokepoints where Phase 2's refinery feedstock attribution and Phase 3's LNG scenario matter most — even though the coverage is geographically partial.

**Caveats:**

- Not global. Atlantic / Pacific transits beyond US EEZ aren't covered.
- Volume — 15 years × millions of points/year is large; per-year CSVs are typically multi-GB. Needs filtering at ingest (tanker-only) and probably grid aggregation for layer rendering.
- AIS ShipType codes are self-reported by vessel transponders and can be miscategorized.

---

### EMODnet Human Activities — Route Density Maps (EU-coastal)

- **URL:** `https://emodnet.ec.europa.eu/en/human-activities`
- **Underlying source:** EMSA SafeSeaNet T-AIS feed (1 position per 6 minutes)
- **License:** Generally CC BY (EMODnet default; verify per-product page)
- **Coverage:** European waters
- **Format:** GeoTIFF + WMS; route density by vessel type (tanker is a distinct category)

**Why it matters here.** Complements MarineCadastre with EU-coastal coverage for the second-largest tanker-traffic region (North Sea, Mediterranean, Baltic). Route density aggregates rather than raw positions — appropriate visual companion at low/medium zoom.

**Caveats:**

- Aggregated raster only; no per-vessel detail.
- License confirmation per-product is needed (EMODnet sub-products vary).
- SafeSeaNet itself is government-only — only the EMSA-derived density rasters are publicly redistributable.

---

## Tier 2 — Global open AIS with material caveats

### Global Fishing Watch — AIS Vessel Presence

- **URL:** `https://globalfishingwatch.org/platform-update/global-ais-vessel-presence-dataset`
- **API:** 4Wings API, JSON/CSV/PNG/MVT/TIFF outputs
- **License:** Non-commercial only — "APIs are only available for non-commercial purposes"
- **Coverage:** Global, 2012 to ~96 hours ago
- **Granularity:** 1 AIS position per vessel per hour (aggregated; not raw positions)
- **Tanker filter:** Filterable by `vessel_type` — supported values include `cargo`, `carrier`, `fishing`, `support`. "Carrier" likely includes tankers, but the documentation does not break down to "oil tanker" / "LNG carrier" sub-types — would need client-side IMO-based filtering against a tanker registry.

**Verdict:** Useful for a non-commercial academic-research project as long as the project stays non-commercial. The 1-position-per-hour cadence is fine for visualization at typical zoom levels. The license risk is real — if the project ever takes any commercial activity (sponsored research, paid hosting, monetized features), this data must be removed. Worth a closer look during Phase 6 brainstorming to decide whether the license is acceptable.

### AISStream.io

- **URL:** `wss://stream.aisstream.io/v0/stream`
- **License:** Not formally specified; service is in BETA with no SLA
- **Coverage:** Global real-time via WebSocket
- **Filters:** BoundingBox (required), MMSI (up to 50), MessageTypes
- **No server-side ShipType filter** — would need client-side filtering of every position

**Verdict:** Suitable only for a "live snapshot of tankers in the world right now" UI feature, not for any historical layer. The lack of clear commercial terms and beta status make it inappropriate as a primary data source.

---

## Tier 3 — Commercial AIS (priced from low to enterprise)

| Provider | Indicative price | Notes |
|---|---|---|
| **Datalastic** | €199–€849/month | Self-serve API, REST. Reasonable entry tier. |
| **VesselFinder** | Credit-based | Credit pricing competitive for moderate-volume use |
| **AISHub** | Contributor-only / paid | Free if you share your own receiver; otherwise paid |
| **MarineTraffic / Kpler** | Enterprise | Largest commercial dataset; Kpler acquired Spire (Q1 2026) |
| **Spire** | Enterprise / Defense | Satellite AIS; extensive vessel coverage |
| **VT Explorer** | Per-query | Vessel particulars (IMO master data) |
| **Vortexa** | Enterprise SaaS | Oil + LNG trade flow analytics |
| **Kpler** | Enterprise SaaS | Multi-commodity (crude oil, LNG, dry bulk); ~85% revenue from subs |
| **TankerTrackers.com** | Corporate plan only | Tanker-specific including sanctions / "dark fleet" tracking |
| **ClipperData** | Enterprise | Oil tanker tracking |

**Pattern:** The cheap tier (Datalastic, VesselFinder) is enough for "show ships moving" but generally lacks tanker-specific analytics. The tanker-analytics tier (Vortexa / Kpler / TankerTrackers) is priced for hedge funds and majors, not researchers.

If the project ever takes a commercial AIS budget, **Datalastic** is probably the right entry point — it's a real REST API with self-serve onboarding, and several writeups call it "best self-serve AIS API." TankerMap exposes a public-ish REST API surface that we noted in our deferred list; their data catalog page documents endpoints (`/api/vessels/live`, `/api/vessels/type/{slug}`) but has no formal open-data license.

---

## Tier 4 — Academic / regional datasets

Useful for testing or specific case studies, but too narrow to anchor the project:

- **Single Ground Based AIS Receiver Vessel Tracking Dataset** (Athens, Zenodo 3754481) — regional, single-receiver
- **AIS maritime traffic data from FNB-UPC** (Barcelona, doi:10.34810/data2026) — regional
- **rtavenar/ushant_ais** (GitHub) — Ushant region trajectories
- **2013 Tanker Vessel Density** (catalog.data.gov) — one-off historical snapshot
- **Statsat AS T-SAR datasets** (Zenodo) — restricted access despite being on Zenodo

---

## Recommended Phase 6 scope

A clean vertical slice that takes advantage of LNG-T3 and complies with scope discipline:

**Phase 6 (proposed name: "LNG carrier dynamics"):**

1. Ingest LNG-T3 (Zhou 2026) into `assets.parquet` (terminals — replacing GEM as primary), a new `lng_vessel.parquet` (the 406-vessel fleet), `lng_voyage.parquet` (daily voyage records), and `lng_terminal_daily.parquet` (daily throughput).
2. Update the LNG terminal layer to use LNG-T3 (better coverage + harmonized capacity).
3. Add an LNG carrier point/track layer with the active year/date filter.
4. Refactor the Hormuz-LNG scenario engine to use measured 2020–2024 daily flows from `LNG_trade_daily.csv` instead of annual BACI HS 271111 × capacity-weighted shares.
5. Document the new attribution math and dataset provenance.

**Phase 7+ candidates (deferred but cataloged):**

- MarineCadastre US-coastal oil tankers (2009–2024 CSVs, filter to ShipType 80–89, grid-aggregate for rendering)
- EMODnet EU route density rasters (tanker subcategory)
- Decision on GFW non-commercial license + how to box-fence "global tanker presence" if we take it
- Decision on whether to budget for Datalastic or similar for global oil tanker positions

---

## Open questions to resolve before committing to Phase 6

1. **LNG-T3 schema** — pull the actual CSVs (small, ~27 MB) and inspect column names + units before committing to a plan.
2. **Cross-link with current GEM GGIT terminals** — LNG-T3 has 545 terminals vs GEM's 434. Need a dedup / supplement strategy similar to the Phase 5 NETL/OSM refineries pattern (likely LNG-T3 as primary, GEM as supplement on the small set GEM-has-but-LNG-T3-doesn't).
3. **Validation comparison** — pick one or two countries where we have independent reserves/import data (e.g., Japan, South Korea) and spot-check LNG-T3's daily flows against EI / EIA monthly aggregates.
4. **Vessel layer rendering at scale** — 406 vessels × ~1,800 days × multiple positions per voyage could be hundreds of thousands of records. Need either grid aggregation or year-filtered query approach (the existing `useUrlState` year wiring + Phase 5 vintage filter pattern fits).
5. **Scenario engine math** — does shifting from "annual BACI × capacity-weighted attribution" to "measured daily flows" actually change scenario outputs materially, or do they converge? Worth checking before promising a fidelity uplift.
