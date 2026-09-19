# New chokepoint scenarios — research (R1)

Researched 2026-09-19 for `scripts/transform/build_disruption_routing.py` / `src/lib/scenarios/engine.ts`.
Candidates: Bab el-Mandeb, Suez Canal + SUMED, Strait of Malacca, Turkish Straits (Bosporus/Dardanelles),
Danish Straits, Panama Canal.

**Caveat up front:** the live web in September 2026 is full of coverage of the Iran–Israel war that closed
Hormuz for much of 2026 and pushed Saudi Yanbu volumes to record highs headed *south* through Bab el-Mandeb
to Asia — the reverse of the structural, peacetime direction of that flow. Wherever a figure comes from
2026 reporting I flag whether it describes the war-distorted state or the pre-war structural baseline. The
existing `hormuz` scenario shares (SAU 0.88, ARE 0.65) are themselves baseline/structural numbers from 2025
data, not the current war state, and I've matched that convention here: these are "what fraction of trade
transits this route in normal times," used to size a disruption's blast radius, not "what is happening this
month."

## 1. Summary and modelling approach

Chokepoint shares in this engine are still `(exporter_iso3, importer_iso3|null, share)` rows layered onto
BACI trade flows exactly as `hormuz`/`druzhba`/`btc`/`cpc` are today (`computeScenarioImpact` in
`src/lib/scenarios/engine.ts` looks up a per-pair share, falling back to the exporter-wide wildcard, and a
pair row can be 0 to carve out an exception). Nothing in the schema needs to change.

What's different about these six chokepoints versus Hormuz is that **the wildcard is nearly useless**: an
exporter's share of a chokepoint depends on *where the cargo is going*, not just who loaded it. Hormuz works
as an exporter-wide wildcard because every Gulf cargo, regardless of destination, must first cross the
strait to leave the Gulf at all (with the carved-out intra-Gulf exception already in the codebase). Bab
el-Mandeb/Suez, Malacca, the Turkish/Danish Straits and Panama are different: they sit on one leg of a
route, and cargo to a different-facing destination skips them entirely. So for these six, **almost every
row needs an explicit importer**, either as a per-country pair row or, more practically, as one row per
**importer region** (an explicit ISO3 list) with `importer_iso3` looped over the region's members. I did
not find a clean way to keep the wildcard useful here beyond the "1.0, no bypass" cases (e.g. Iran/Kuwait
already have that from Hormuz).

Three geographic principles apply across all six:

1. **Direction is the whole model.** A chokepoint's share for `(exporter, importer)` is close to 1.0 if
   that leg has no other water route, and close to 0 if the leg doesn't need to pass the chokepoint at all
   (e.g. Gulf crude to India never goes near Malacca; Gulf crude to Japan almost always does).
2. **A physical bypass (pipeline landing cargo on the other side of the chokepoint) reduces share below
   1.0; the option to reroute around a *different, longer* sea lane (the Cape of Good Hope, Cape Horn) does
   not.** The existing SAU/ARE Hormuz rows already draw this line: the Habshan–Fujairah pipeline and the
   Petroline/East-West pipeline physically move oil to a terminal that doesn't sit behind the strait, so
   they lower the share; "ships could go around Africa instead" is the disruption's *consequence*
   (higher freight, longer transit), not a pre-existing bypass, so it is **not** subtracted from the share.
   I apply the same rule to Suez/SUMED (the SUMED pipeline is a real bypass of the *canal*, but not of
   the *Bab el-Mandeb–to-Mediterranean corridor* — see §3.2) and to the Danish/Turkish Straits (no bypass
   pipeline exists for Baltic or Black Sea crude; the whole point of Russia's 2005+ Baltic-port buildout was
   to *reach* the sea, not skip a strait it still has to sail through).
3. **A pipeline that lands cargo on the far side of one strait can still leave it exposed to a second one.**
   Saudi Yanbu crude (moved there by the East-West Pipeline, which bypasses **both** Hormuz and Bab
   el-Mandeb) still needs the Suez Canal or SUMED to reach the Mediterranean/Europe — it is not exposed to
   Bab el-Mandeb but is fully exposed to Suez. I split this out explicitly in the Bab el-Mandeb table (§3.1)
   rather than reusing the SAU Hormuz share.

**Limits of this approach:** BACI is an annual, country-level, HS-code trade table; it cannot see which
port a cargo loaded from within a country (Yanbu vs. Ras Tanura; Primorsk vs. Novorossiysk), so a
region/wildcard share is necessarily a blend across all of a country's export terminals, weighted by
whatever mix the cited source used (usually a specific year's tanker-tracking sample, not BACI itself).
Every row below says what that blend was and how current it is. BACI also can't see sanctions-driven
relabeling or ship-to-ship transfers, which matters most for Russian crude (§3.5/§3.6 gaps).

## 2. Region definitions (ISO3)

Built from a 2024 exporter/importer scan of `public/data/trade_flow.parquet` (HS 2709 crude, HS 271111 LNG)
to keep each table to the flows that actually move real tonnage, plus the structural logic in §1.

- **EUROPE_MED** (Bab el-Mandeb/Suez-facing Persian Gulf destinations; also the Danish/Turkish Straits
  destination set minus intra-Baltic/Black Sea neighbours): `NLD, GBR, FRA, ESP, ITA, GRC, BEL, DEU, POL,
  LTU, DNK, SWE, IRL, PRT, TUR, BGR, HRV, ROU, FIN, EST, LVA, CYP, MLT`
- **EAST_ASIA** (Malacca-facing; also the Panama-facing Pacific-Asia destination set for US Gulf exports):
  `CHN, JPN, KOR, TWN, HKG, SGP, MYS, IDN, THA, PHL, VNM`
- **SOUTH_ASIA** (reached from the Gulf via the Arabian Sea directly — no Malacca, no Bab el-Mandeb/Suez):
  `IND, PAK, BGD, LKA`
- **GULF_COASTAL** (already defined in `build_disruption_routing.py` for the Hormuz intra-Gulf carve-out):
  `IRN, IRQ, KWT, QAT, SAU, ARE, BHR`
- **BALTIC_NEIGHBOURS** (reached from Russia's Baltic ports without leaving the Baltic Sea, i.e. no Danish
  Straits transit): none among material BACI importers — Baltic-state and Nordic buyers of Russian crude
  have both fallen to near zero since 2022 sanctions; kept as an empty set with a note rather than omitted,
  so a future importer can be added without re-deriving the logic.
- **BLACKSEA_NEIGHBOURS** (reached from Russia's Black Sea ports without the Turkish Straits): `GEO`
  (Georgia; residual pipeline/road trade, not sea) — negligible in BACI, treated as 0 rather than folded
  into a wildcard.

## 3. Per-chokepoint tables

All six sit under one EIA primary source for *total* current flow — the *Short-Term Energy Outlook*
"Global Energy Security Data" page (`https://www.eia.gov/outlooks/steo/report/energysecurity/article.php`,
August 2026 release, Tables 2–10), which publishes quarterly crude+products (mb/d) **and LNG (bcf/d)**
transit volumes for Malacca, Hormuz, Suez+SUMED, Bab el-Mandeb, Danish Straits, Turkish Straits (Dardanelles)
and Panama, methodology: Vortexa AIS tanker tracking, EIA analysis; Panama previously sourced from the
Panama Canal Authority. I use this table's 2Q26 (or, where 2Q26 is war-distorted, the 1H25 average) figure
as each chokepoint's headline flow citation. Directional shares below come from EIA's per-chokepoint
"Today in Energy" narratives and reputable tanker-tracking secondary sources (Kpler, Vortexa, CREA/energy
and clean air, Bernama-via-EIA) where BACI-blind port-level detail is needed; each row states which.

### 3.1 Bab el-Mandeb Strait

**Description (for the panel):** The Bab el-Mandeb Strait, between Yemen and the Horn of Africa, is the
southern gateway to the Red Sea and the only sea route between the Indian Ocean and the Suez Canal. Persian
Gulf crude and Qatari LNG bound for Europe pass through it northbound; cargo bound for Asia does not. Houthi
attacks cut transit by more than half from 2023 to 2024.

**Marker:** lon 43.4, lat 12.6 (strait midpoint, off Perim/Mayyun island).

**Total flow (2Q26):** 8.1 million b/d crude + petroleum products, and LNG present but volatile (0.0–3.0 bcf/d
across the six reported quarters) — but 2Q26 is inflated by the 2026 war rerouting Saudi Yanbu crude
*southward*; the pre-crisis 1H25 baseline was 3.9–4.5 million b/d. EIA, *Short-Term Energy Outlook*, "Global
Energy Security Data," Table 6, August 2026 (`https://www.eia.gov/outlooks/steo/report/energysecurity/article.php`).
For the pre-Houthi-attack peak: EIA/Today in Energy reported 9.3 million b/d in 2023, falling to 4.1 million
b/d in 2024 (quoted via `time.com/article/2026/07/15/...`, sourcing "the U.S. Energy Information
Administration (EIA)"; I could not independently re-derive that exact figure from an EIA page I fetched, so
it is medium confidence pending a direct EIA citation).

| Exporter | Importer region | Commodity | Share | Source | Year | Confidence |
|---|---|---|---|---|---|---|
| SAU, ARE, KWT, QAT, IRQ, BHR (Gulf, loaded inside the Gulf/Hormuz) | EUROPE_MED | crude | 1.00 | EIA, "The Suez Canal and SUMED Pipeline are critical chokepoints for oil and natural gas trade" (`eia.gov/todayinenergy/detail.php?id=40152`), 2019 — structural geography unchanged | 2019 | high |
| SAU (Yanbu-loaded only, via the East-West Pipeline) | EUROPE_MED | crude | 0.00 | Structural: Yanbu is on the Red Sea north of the strait; cargo loaded there never crosses Bab el-Mandeb. It still crosses Suez (§3.2). No separate document quantifies Yanbu-only volumes to Europe; this is a geographic deduction, not a measured share | — | medium |
| SAU, ARE, KWT, QAT, IRQ, BHR | EAST_ASIA, SOUTH_ASIA | crude | 0.00 | Structural: Asia-bound Gulf crude exits via Hormuz→Arabian Sea directly (to India) or Hormuz→Arabian Sea→Malacca (to East Asia); it does not enter the Red Sea | — | high |
| QAT | EUROPE_MED | LNG | 1.00 | EIA, "Red Sea attacks increase shipping times and freight rates" (`eia.gov/todayinenergy/detail.php?id=61363`): "Bab el-Mandeb Strait...accounting for 12% of seaborne oil trade and 8% of...LNG trade in the first half of 2023," describing Qatari LNG to Europe as the main LNG traffic on this route | 2024 | medium |
| QAT | EAST_ASIA, SOUTH_ASIA | LNG | 0.00 | Structural: Qatar's Asia-bound LNG sails east via Hormuz→Arabian Sea→Malacca, not into the Red Sea | — | high |

**BACI gap:** Saudi and UAE crude both blend Gulf-loaded and Red-Sea/Gulf-of-Oman-loaded cargo into one
`exporter_iso3=SAU`/`ARE` row; BACI cannot see the port split, so the exporter-wide wildcard would overstate
exposure for these two unless the loading-port carve-out above is applied. There is no clean way to encode
"0.00 for Yanbu-loaded cargo only" as a BACI-keyed row (BACI has no port field) — the honest options are (a)
leave SAU's Bab el-Mandeb share as a single blended number the way the existing Hormuz SAU/ARE rows already
do, accepting it slightly overstates exposure, or (b) note in `source_note` that the number is a compromise.
I'd ship (a) with the caveat, since this is exactly the pattern the existing Hormuz rows already use.

### 3.2 Suez Canal + SUMED Pipeline

**Description:** The Suez Canal and the parallel SUMED pipeline are Egypt's two routes between the Red Sea
and the Mediterranean — the only way (short of the Cape of Good Hope) for Persian Gulf and Red Sea crude,
products and LNG to reach Europe and the U.S. East Coast. SUMED is a genuine bypass of the *canal itself*
(it can carry crude when the canal is blocked to large tankers) but not of the corridor: crude landed at
Sidi Kerir by SUMED still has to reach Europe via the Mediterranean.

**Marker:** lon 32.34, lat 30.5 (canal midpoint, near Ismailia); SUMED runs Ain Sukhna (29.6, 32.37) →
Sidi Kerir (31.1, 29.65).

**Total flow (2Q26):** 5.8 million b/d crude + products, 1.5 bcf/d LNG. EIA, *STEO* "Global Energy Security
Data," Table 5, August 2026. 1H25 average was ~4.6–5.1 million b/d, roughly matching the ~4.9 million b/d
figure independently reported by `worldandnewworld.com` for 1H25 (secondary, medium confidence, consistent
with the primary EIA table).

| Exporter | Importer region | Commodity | Share | Source | Year | Confidence |
|---|---|---|---|---|---|---|
| SAU, IRQ, IRN (pre-sanctions baseline), KWT, ARE, QAT, BHR | EUROPE_MED, USA | crude | 0.85 | EIA, "The Suez Canal and SUMED Pipeline are critical chokepoints..." (`id=40152`): "Petroleum exports from Persian Gulf countries...accounted for 85% of Suez Canal northbound traffic" (2018 data — the remaining 15% likely rode SUMED or arrived from non-Gulf Red Sea/East Africa producers not modelled here) | 2019 | medium |
| SAU, IRQ, KWT, ARE, QAT, BHR | EAST_ASIA, SOUTH_ASIA | crude | 0.00 | Structural, same logic as Bab el-Mandeb — Asia-bound Gulf crude never enters the Red Sea | — | high |
| RUS (all seaborne, both Baltic and Black Sea origin) | EAST_ASIA, SOUTH_ASIA (post-2022 buyers China/India) | crude | UNSOURCED (candidate range 0.3–0.6) | No single document splits Russian crude to India/China between the Suez/Red-Sea route and the Cape of Good Hope route; reporting is contradictory and time-varying — some 2024 Reuters coverage describes continued (if riskier) Bab el-Mandeb transits (`reuters.com/world/middle-east/russian-oil-flows-through-red-sea-still-face-lower-risks-2024-02-01`), while other 2024–2025 coverage describes widespread Cape rerouting industry-wide during the Houthi crisis. I did not find an EIA or IEA breakdown specific to Russian cargo | 2024 | low — do not ship without further sourcing |
| QAT | EUROPE_MED | LNG | ~1.00 | Same EIA `id=61363` citation as Bab el-Mandeb LNG (this LNG transits both straits on the same voyage) | 2024 | medium |
| US Gulf Coast (LPG/products, not crude) | EUROPE_MED | products | Time-varying, not a fixed share (see gap note) | EIA, "U.S. energy flows through Panama Canal rose slightly in January" (`id=61443`): describes US LPG cargoes shifting between Panama, Suez and the Cape opportunistically month to month, e.g. "374,000 b/d in November" via Suez | 2024 | low |

**BACI gap:** Russia's HS-2709 exports to China/India are large (108.5 Mt and 92.0 Mt in 2024 respectively —
`public/data/trade_flow.parquet`) and would be the single biggest Suez-scenario row by tonnage if a share
existed; I'm recommending it be left out (or shipped at 0 with a loud caveat) rather than guessed, since the
routing genuinely varies cargo-by-cargo with sanctions/insurance status, which BACI's annual country totals
cannot resolve. This is the most consequential open question for the maintainer (see §5).

### 3.3 Strait of Malacca

**Description:** The Strait of Malacca, between Sumatra and the Malay Peninsula, is the shortest sea route
between Persian Gulf suppliers and East Asia, and the only realistic route for Gulf crude and Qatari/
Australian LNG headed to China, Japan, South Korea and Taiwan. It does not carry Gulf-to-India traffic,
which crosses the Arabian Sea directly.

**Marker:** lon 103.7, lat 1.25 (the Phillips Channel, Singapore Strait — EIA's cited narrowest point).

**Total flow (2Q26):** 16.6 million b/d crude+products (war-depressed; range across the six reported
quarters is 21.3–24.9 million b/d for 1Q25–1Q26) and 5.5–10.1 bcf/d LNG. EIA, *STEO* "Global Energy Security
Data," Table 3, August 2026.

| Exporter | Importer region | Commodity | Share | Source | Year | Confidence |
|---|---|---|---|---|---|---|
| SAU, ARE, KWT, IRQ (the "nearly 60%" bloc) | EAST_ASIA | crude | 0.60 (bloc share of Malacca volume, not of each country's own exports) | Bernama, "Strait of Malacca Keeps Top Spot as World's Largest Oil Transit Chokepoint," citing EIA data: "Saudi Arabia, the United Arab Emirates, Kuwait and Iraq, accounted for nearly 60 percent of the crude oil moving through the Strait of Malacca in 1H25" (`garasi.bernama.com/quick-reads/strait-of-malacca-...`) | 2025 | medium — this is Malacca's composition, not a per-exporter share of trade; treat each of the four as share ≈1.0 to EAST_ASIA individually (see next row) and use this only as a sanity check |
| SAU, ARE, KWT, IRQ, QAT, OMN | EAST_ASIA | crude | 1.00 | Structural, same EIA framing ("shortest sea route between Persian Gulf suppliers and key Asian markets," `id=32452`) plus the Bernama destination breakdown showing China/Korea/Japan as the dominant Malacca destinations | 2017/2025 | high |
| SAU, ARE, KWT, IRQ, QAT, OMN | SOUTH_ASIA | crude | 0.00 | India-Briefing / Facebook (Rajya Sabha MP) reporting on India's Hormuz exposure describes Indian crude routing directly across the Arabian Sea, not via Malacca; consistent with EIA's Malacca destination table (Bernama) not listing India among the strait's major destinations | 2026 | medium |
| USA (Gulf/Atlantic Coast crude) | EAST_ASIA | crude | 1.00 | Bernama/EIA: "the United States also sent 0.8 million barrels per day of crude oil and condensates from its Atlantic coast through the Strait of Malacca to East Asia" in 1H25 — treated as ~all of USA→East Asia crude given the small base (2024 BACI: USA→KOR 21.8 Mt, →TWN 13.3 Mt, →SGP 11.9 Mt, →CHN 10.6 Mt, →JPN 2.8 Mt) | 2025 | medium |
| QAT | EAST_ASIA | LNG | 1.00 | EIA, `id=32452`: Malacca "is also an important transit route for [LNG] from Persian Gulf and African suppliers, particularly Qatar, to East Asian countries...The biggest importers...are Japan and South Korea" | 2017 | high |
| AUS | EAST_ASIA | LNG | 1.00 | Structural: all Australian LNG to China/Japan/Korea/Taiwan sails north through the South China Sea via the Malacca/Sunda/Lombok straits system; BACI 2024 shows AUS→CHN 26.2 Mt, →JPN 25.1 Mt, →KOR 11.4 Mt, →TWN 8.0 Mt as the dominant AUS LNG destinations | 2024 (BACI) | medium — I did not find an EIA document naming Australia specifically for Malacca (Australian cargo can also route via Lombok/Sunda, which EIA does not distinguish from Malacca in its headline number); treat as a bloc "Sunda/Malacca system" share |

**BACI gap:** none major — Malacca is the best-sourced of the six new chokepoints because EIA and its
tanker-tracking partners publish destination-level detail for it directly (unlike Suez/Bab el-Mandeb, where
EIA reports total flow but not a destination breakdown).

### 3.4 Turkish Straits (Bosporus + Dardanelles)

**Description:** The Bosporus and Dardanelles, both fully within Turkish territory, are the only sea outlet
from the Black Sea — the exit route for Russian Black Sea crude (Novorossiysk/Sheskharis) and for
Kazakhstan's CPC-blend crude, which also loads at Novorossiysk after arriving by the CPC pipeline. Turkey
has restricted tanker transit (insurance and daylight-only rules) since 2022, making this corridor doubly
sensitive.

**Marker:** lon 29.06, lat 41.10 (the Bosporus, Istanbul).

**Total flow (2Q26):** 4.1 million b/d crude+products, 0.3 bcf/d LNG (EIA labels this row "Turkish Straits
(Dardanelles)"). EIA, *STEO* "Global Energy Security Data," Table 8, August 2026. The pre-war 2016 figure
was "more than 5 million b/d" combined with the Danish Straits — EIA, "The Danish and Turkish Straits are
critical to Europe's crude oil and petroleum trade" (`id=32552`).

| Exporter | Importer region | Commodity | Share | Source | Year | Confidence |
|---|---|---|---|---|---|---|
| RUS (Black Sea-loaded share only, i.e. Novorossiysk/Sheskharis) | EUROPE_MED, EAST_ASIA, SOUTH_ASIA | crude | 1.00 | Structural: the Black Sea has no other sea exit. Kpler (`kpler.com/ja-jp/blog/black-sea-escalation-...`): Novorossiysk exports "roughly average around 2.5 Mbd"; The Moscow Times (2026-07-25): the Sheskharis terminal alone exported "about 650,000 barrels of oil per day," "around one-fifth of the country's oil exports" | 2026 | high (structural claim), the volume figures are war-period and secondary |
| RUS (as a whole country wildcard) | EUROPE_MED, EAST_ASIA, SOUTH_ASIA | crude | UNSOURCED — needs the Black Sea vs. Baltic vs. Pacific (ESPO, Kozmino) port split, which BACI cannot see | — | low; see below |
| KAZ (CPC-blend crude, loaded at Novorossiysk) | EUROPE_MED, EAST_ASIA, SOUTH_ASIA | crude | 1.00 | Same structural logic; content.ballastmarkets.com (Port of Novorossiysk profile): CPC is "30–35%" of Novorossiysk tanker departures in normal times, i.e. it shares the same single exit. This is additive to the existing `cpc` scenario's KAZ 0.80 (CPC as share of Kazakh *exports*) — this row is "of the CPC volume that does transit Novorossiysk, all of it also transits the Turkish Straits," a different question | 2026 | medium |

**BACI gap:** Russia's crude exports are reported by BACI as one `exporter_iso3=RUS` total with no
port-of-loading field, so a Turkish-Straits wildcard for Russia cannot distinguish Black Sea cargo (which
transits) from Baltic cargo (which uses the Danish Straits, §3.5) or Pacific/ESPO cargo out of Kozmino
(which uses neither). The Baltic-vs-Black-Sea port split is time-varying and itself a live sanctions/drone-
strike story in 2026 (Ukrainian strikes on Primorsk/Ust-Luga and on the Novorossiysk/CPC terminal cluster
have both hit in March–July 2026), so any snapshot share would be stale within months. I'd ship this only as
a **KAZ-specific** row (CPC via Novorossiysk, which is close to invariant) and leave RUS as UNSOURCED pending
a stable port-split source, rather than force a number.

### 3.5 Danish Straits (Great Belt / Øresund)

**Description:** The Danish Straits are the only sea exit from the Baltic Sea to the North Sea and the
Atlantic, and therefore the route for essentially all Russian crude loaded at its Gulf-of-Finland Baltic
ports (Primorsk, Ust-Luga, Vysotsk). Unlike Bab el-Mandeb/Suez, this chokepoint's share does not depend on
the importer's location — any Baltic-loaded cargo, to Europe or to Asia, must cross the straits to leave the
Baltic at all.

**Marker:** lon 10.9, lat 55.3 (the Great Belt, Denmark).

**Total flow (2Q26):** 4.7 million b/d crude+products, 1.4 bcf/d LNG. EIA, *STEO* "Global Energy Security
Data," Table 7, August 2026 (footnote: excludes the Kiel Canal). The 2016 pre-war baseline was 3.2 million
b/d — EIA, `id=32552`.

| Exporter | Importer region | Commodity | Share | Source | Year | Confidence |
|---|---|---|---|---|---|---|
| RUS (Baltic-loaded share only) | ALL (any importer — direction does not matter here, see description) | crude | 1.00 | Structural: Reuters, "The Danish straits: gateway for a third of Russia's sea-borne crude exports" (`reuters.com/business/energy/danish-straits-gateway-third-russias-sea-borne-crude-exports-2023-11-15`); CREA/energyandcleanair March 2026 report: Baltic ports "22 percent...from Primorsk, and 20 percent from Ust-Luga" of Russia's total seaborne crude+products exports (i.e. ~42% Baltic, before Kaliningrad) | 2023 (Reuters "a third") / 2026 (CREA ~42%) — range 33–47% depending on year and whether products are included | medium |
| RUS (as a whole-country wildcard, applying the ~0.33–0.47 Baltic-port-share figure directly to the whole export flow) | ALL | crude | UNSOURCED as a single number — the range above is wide and the underlying port mix is currently changing month to month (Ukrainian strikes have repeatedly knocked Primorsk/Ust-Luga offline in 2026, per Reuters `2026-03-25` and Marineinsight); I would not ship a point estimate without a maintainer decision on which vintage to anchor to | — | low |

**BACI gap:** same as Turkish Straits — no port-of-loading field, and the Baltic/Black Sea/Pacific split for
Russian exports is exactly the kind of "sanctioned relabelled crude" and shadow-fleet obfuscation the task
description warned about: CREA's March 2026 report notes 48% of Russia's seaborne oil moved on "shadow"
tankers under sanctions and 48 vessels were flagged as flying false flags that month, which is a second,
independent reason BACI (importer-declared trade statistics) will understate or misattribute Russian
chokepoint exposure beyond the port-mix problem.

### 3.6 Panama Canal

**Description:** The Panama Canal is the shortest water route between the U.S. Gulf Coast and East Asia.
Unlike the other five, it carries very little crude oil (0.1–0.2 million b/d) — its energy traffic is
overwhelmingly U.S. LPG/propane and, increasingly, LNG headed to Asian buyers, competing month-to-month
against the Cape of Good Hope, Cape Horn, and Suez as alternative (not bypass) routes depending on freight
rates and canal water levels (2023's Gatún Lake drought is the citation-worthy precedent for how sensitive
this corridor is to non-geopolitical disruption too).

**Marker:** lon -79.68, lat 9.08 (the canal, Panama).

**Total flow (2Q26):** 3.2 million b/d, of which only ~0.2 million b/d is crude/condensate and ~3.0 million
b/d is petroleum products (overwhelmingly LPG); 0.6 bcf/d LNG. EIA, *STEO* "Global Energy Security Data,"
Table 9, August 2026.

| Exporter | Importer region | Commodity | Share | Source | Year | Confidence |
|---|---|---|---|---|---|---|
| USA (LPG/HGL exports, not modelled as a BACI HS code in this schema today) | EAST_ASIA | products | UNSOURCED as a clean fraction | bpnews.com: "the most economical route from the U.S. Gulf Coast...to Asia is through the Panama Canal," but EIA `id=61443` describes cargoes shifting to Suez/Cape opportunistically ("374,000 b/d in November" via Suez instead); no single document gives a stable "% of US LPG-to-Asia via Panama" figure, and this project's schema doesn't carry an HGL/LPG trade table to check against BACI anyway | 2024 | low |
| USA (crude, HS 2709) | EAST_ASIA | crude | ~0.00–0.05 | Structural: EIA's own Table 9 shows crude is 0.1–0.2 million b/d of Panama's 2.5–3.2 million b/d total, i.e. a minor commodity on this route; most USA→EAST_ASIA crude (BACI 2024: USA→KOR 21.8 Mt, →TWN 13.3 Mt, →CHN 10.6 Mt, →SGP 11.9 Mt) is attributed to the Malacca-facing Atlantic-to-Pacific route in the Bernama/EIA Malacca destination breakdown (§3.3), which implies most of it is NOT going via Panama | 2025/2026 | low — two EIA-adjacent sources describe the same barrels differently; I flag this as needing reconciliation rather than resolving it myself |
| USA (LNG, Gulf Coast liquefaction) | EAST_ASIA | LNG | UNSOURCED as a clean fraction | Institute of Geoeconomics (Japan), discussing US LNG to Japan: describes the Cape of Good Hope route (avoiding Panama, Hormuz and the Gulf of Aden) as a real, currently-used alternative for security reasons, implying Panama is not close to 1.00 even structurally; no document gives a %, and I would not invent one | 2026 | low |

**BACI gap:** Panama's dominant commodities (LPG/HGL, LNG) are outside the `trade_flow` (crude, LNG) split
this project tracks at the necessary granularity for LPG, and even the LNG/crude BACI rows available here
are a poor match to Panama specifically, since so much of the same USA→EAST_ASIA tonnage plausibly also
qualifies for the Malacca row in §3.3 depending on which route was actually sailed that voyage — a
disruption-scenario share for Panama built from BACI totals would very likely double-count with Malacca.
This is the chokepoint I'm least confident should ship at all (see §4).

## 4. Recommendation: ship now vs. hold

**Ship first (well-sourced, structural, low ambiguity):**
- **Strait of Malacca** — the best-documented of the six; EIA/Bernama give destination-level detail
  directly. Ship SAU/ARE/KWT/IRQ/QAT/OMN → EAST_ASIA = 1.00, → SOUTH_ASIA = 0.00, QAT/AUS LNG → EAST_ASIA =
  1.00, USA → EAST_ASIA (crude) = 1.00 pending the Panama reconciliation below.
- **Bab el-Mandeb + Suez** together, as two disruption scenarios sharing the same importer-region logic
  (Gulf → EUROPE_MED = ~0.85–1.00, Gulf → Asia = 0.00), explicitly excluding a Russia row until §3.2's gap
  is resolved. These are also the two chokepoints with the best primary total-flow citation (EIA STEO Tables
  5–6).

**Ship with a visible caveat (structurally sound, but the numeric share rests on secondary/tanker-tracking
sources rather than an EIA/IEA document that states the fraction directly):**
- **Danish Straits** as a RUS(Baltic)→ALL = 1.00 structural row (skip the whole-country wildcard number;
  it's a range, not a fact, and the underlying ports are being hit by drone strikes as I write this).
- **Turkish Straits** as a KAZ(CPC)→ALL = 1.00 structural row only. Hold the RUS wildcard for the same
  reason as Danish Straits, compounded by the Black Sea/Baltic/Pacific split problem.

**Hold — too weakly sourced to ship a number, even with a caveat:**
- **Panama Canal.** The dominant commodity (LPG) isn't in this project's schema at the needed detail, the
  crude and LNG shares I could find are contradictory with the Malacca destination breakdown, and no EIA
  document gives a clean fraction. I'd either scope this to "US LNG to Asia" only (still UNSOURCED) or skip
  it until better data turns up — recommend skip.
- **The Russia-wide wildcards** on Suez, Turkish Straits and Danish Straits (as opposed to the Baltic/Black
  Sea *structural* rows recommended above) — these need a port-of-loading data source this project doesn't
  have (BACI has none), and the true split is actively changing month to month in 2026 due to drone strikes
  on Russian export terminals.

## 5. Open questions for the maintainer

1. **Russian crude routing (Suez, Turkish Straits, Danish Straits).** All three new scenarios have a
   Russia-shaped hole because BACI has no port-of-loading field and Russia's Baltic/Black Sea/Pacific split
   is itself news in 2026 (Ukrainian strikes repeatedly taking Primorsk, Ust-Luga and the Novorossiysk/CPC
   cluster offline). Options: (a) ship only the structural "100% of Baltic-loaded crude crosses the Danish
   Straits" / "100% of Black-Sea-loaded crude crosses the Turkish Straits" rows without a country-wide
   wildcard, accepting the scenario undercounts Russia's total exposure; (b) pin a specific Baltic-port-share
   vintage (e.g. CREA's ~42% for 2025) as a wildcard with a loud "as of [date], subject to change" note,
   matching how `druzhba`/`cpc` already carry dated pro-rata derivations; (c) skip Russia in these three
   scenarios entirely and only model the Gulf/Qatar/Kazakhstan/Saudi/Australia/US rows that are well-sourced.
   I lean toward (a) for Danish/Turkish and toward skipping Russia on Suez (b) is defensible if you want a
   number badly enough to accept it going stale.
2. **Panama — ship a narrower version, or not at all?** Given the LPG-schema gap and the Malacca overlap, is
   it worth adding a `crude` OR `lng` HS-code-only Panama scenario at all, or should this wait for an LPG
   trade table / a better source? I recommend waiting.
3. **Saudi Yanbu-loaded crude as a distinct BACI-invisible fraction (Bab el-Mandeb).** BACI cannot split
   Saudi Arabia's crude exports by loading port, so a single `SAU` row necessarily blends Yanbu-origin
   (Bab-el-Mandeb-exempt) and Gulf-origin (Bab-el-Mandeb-exposed) cargo. The existing Hormuz SAU row (0.88)
   already accepts this kind of blended imprecision — is that an acceptable precedent to reuse here, or
   should Bab el-Mandeb ship without a SAU row at all until port-level data exists?
4. **Vintage policy.** Existing shares (Hormuz, Druzhba, BTC, CPC) are pinned to specific 2022–2025
   citations and explicitly "static across years" even when known to be temporarily wrong (e.g. the IRQ note
   admits ~1.0 was true in 2023-24 but 0.90 is used as "the long-run share"). For chokepoints currently in
   an unusually distorted state (Bab el-Mandeb/Suez direction reversed by the 2026 war), should new rows be
   pinned to the pre-war baseline (as I did here) or updated to reflect the current abnormal routing? I
   assumed baseline, matching the existing convention, but flagging it since this is the first time the
   distortion is this large.
5. **Region granularity.** I used four coarse regions (EUROPE_MED, EAST_ASIA, SOUTH_ASIA, plus the existing
   GULF_COASTAL) rather than per-country pair rows. This keeps row count manageable (~20–30 new rows vs.
   ~150 for full per-country pairs) but means the scenario panel would need either a small code change to
   expand a region row into per-importer pair rows at load time, or the transform script could do that
   expansion itself when writing the Parquet (simplest: keep `build_disruption_routing.py` doing a Python
   loop over each region's members, same as `_intra_gulf()` already does for GULF_COASTAL — no engine
   changes needed). I recommend the latter; it requires no changes to `engine.ts`.

---

**Row count if shipped per the "ship first" + "ship with caveat" recommendations above (excluding "hold"):**
roughly 60–90 individual `(exporter, importer, commodity)` rows once regions are expanded to member
countries (Malacca: ~6 exporters × 11 EAST_ASIA members × 2, for the 1.00/0.00 split, plus LNG; Bab
el-Mandeb/Suez: ~6 exporters × 23 EUROPE_MED members × 2 chokepoints; Danish/Turkish: 2 structural rows each
with no per-importer expansion needed since they don't depend on importer). Counting the individual
share-rows drafted in §3 (before regional expansion): **6 high confidence, 10 medium confidence, 7 low
confidence — of which 5 are explicitly `UNSOURCED`** (the Suez and Turkish/Danish Straits Russia
whole-country wildcards, and two of Panama's three rows). The low/UNSOURCED rows are concentrated almost
entirely in Russia's port-split problem and Panama's LPG-schema gap — which is exactly why the Russia
wildcards and the Panama scenario are recommended for "hold," not "ship," in §4.

---

## Verification (independent, 2026-09-19)

Task RV. Every cited URL was re-opened (curl with a browser UA, or Tavily extract); every quoted
sentence was checked against the live page; every derivation was re-done; every proposed share was
reconciled against `public/data/trade_flow.parquet` (BACI 2024, 1 t crude ≈ 7.33 bbl) and against the
chokepoint's own **crude-only** transit figure from EIA STEO Table 2–9. Nothing above was edited.

**Tally: 21 CONFIRMED · 9 WRONG · 6 MISAPPLIED · 4 UNVERIFIABLE.** The three most serious are
(1) the Danish-Straits `RUS → ALL = 1.00` row, which implies 4.35 mb/d of Russian crude crossing a
strait EIA measures at 2.7–3.0 mb/d **in total, all origins**; (2) `SAU → EUROPE_MED = 1.00` for
Bab el-Mandeb, where Kpler's own Yanbu figure says the true share is near **zero**; and (3)
`AUS → EAST_ASIA LNG = 1.00` for Malacca, where roughly a third of Australian LNG loads on the
**east** coast and none of it need use Malacca at all.

### 4.1 Cited figures

| Row / figure | Verdict | What the source actually says | Corrected value |
|---|---|---|---|
| STEO "Global Energy Security Data" page exists, Aug 2026 release, Tables 2–10, Vortexa/EIA methodology, Panama formerly PCA | CONFIRMED | "Release Date: August 12, 2026"; "Volumes for the Danish Straits…Turkish Straits (Dardanelles), the Panama Canal…are EIA estimates based on Vortexa data. In previous EIA publications, data for the Panama Canal were sourced from the Panama Canal Authority." | — |
| Table numbering (Malacca 3, Suez 5, Bab 6, Danish 7, Turkish 8, Panama 9) | CONFIRMED | all six match | — |
| Bab total 8.1 mb/d 2Q26; LNG 0.0–3.0 bcf/d; 1H25 3.9–4.5 | CONFIRMED | Table 6: 3.9 / 4.5 / 4.6 / 5.4 / 5.6 / **8.1**; LNG 0.3 / – / – / 1.1 / 3.0 / – | 2Q26 LNG is "–" (not reported), not 0.0 |
| Bab "9.3 mb/d in 2023 → 4.1 in 2024", via `time.com/article/2026/07/15/…` | UNVERIFIABLE **as cited** | the sentence exists, but at **`time.com/article/2026/04/08/bab-el-mandeb-strait-iran-houthis-threat-trade-hormuz-war-ceasefire`** (8 Apr 2026): "increased from 5.7 million in 2020 to 9.3 million barrels per day in 2023. This figure decreased to 4.1 million barrels per day in 2024". It contradicts EIA/Vortexa's own published "**8.7 million b/d in full-year 2023**" (via SAFETY4SEA). Both are crude **+ products**. | fix the URL; prefer EIA 1H25 = 4.2 mb/d (Table 2 avg), or cite 8.7 (full-year 2023) not 9.3 |
| Suez total 5.8 mb/d + 1.5 bcf/d LNG (Table 5) | CONFIRMED | 4.6 / 5.1 / 5.6 / 5.9 / 5.7 / **5.8**; LNG 0.8 / 0.8 / 2.1 / 1.6 / 1.8 / **1.5** | — |
| Suez "~4.9 mb/d 1H25" per `worldandnewworld.com` | UNVERIFIABLE | secondary source not re-opened; the value is arithmetically consistent with EIA (1H25 = (4.6+5.1)/2 = **4.85**) | drop the secondary citation as redundant |
| Malacca 16.6 mb/d 2Q26; 21.3–24.9 range; LNG 5.5–10.1 | CONFIRMED (with an EIA internal inconsistency) | Table 3: 22.3 / 23.8 / 23.4 / **24.0** / 21.3 / 16.6 — but Table 2 gives **24.9** for the same 4Q25 cell. The note used Table 2's figure. | quote Table 3 (the per-chokepoint table); flag the 24.0/24.9 discrepancy |
| Turkish 4.1 mb/d + 0.3 bcf/d, row labelled "Turkish Straits (Dardanelles)" | CONFIRMED | Table 8 | — |
| Turkish/Danish "more than 5 million b/d in 2016", `id=32552` | CONFIRMED | "The Danish Straits and Turkish Straits, together transited by a combined volume of more than 5 million barrels per day (b/d) in 2016" | — |
| Danish 4.7 mb/d + 1.4 bcf/d; excludes Kiel Canal; 2016 baseline 3.2 mb/d | CONFIRMED | Table 7 + footnote a; `id=32552`: "An estimated 3.2 million b/d of crude oil and petroleum products flowed through the Danish Straits in 2016" | — |
| Panama 3.2 mb/d total, ~0.2 crude, ~3.0 products, 0.6 bcf/d LNG | CONFIRMED | Table 9 | — |
| EIA `id=40152`: "85% of Suez Canal northbound traffic" | quote CONFIRMED, use **MISAPPLIED** | "Petroleum exports from Persian Gulf countries, such as Saudi Arabia, Iraq, and Iran, accounted for 85% of Suez Canal northbound traffic" — this is the **composition of the chokepoint** (and of *petroleum*, i.e. crude **+ products**, 2018), not the fraction of Gulf→Europe crude that uses Suez | see §4.2 row S1 |
| EIA `id=61363`: "12% of seaborne oil trade and 8% of…LNG trade in 1H2023" | quote CONFIRMED | verbatim | data vintage is **1H2023**, not 2024 (the article is Feb 2024) |
| …"describing Qatari LNG to Europe as the main LNG traffic on this route" | **MISAPPLIED** — not in that source | `id=61363` names QatarEnergy only as a company *pausing* Red Sea transits. The supporting sentence is in `id=40152`: "**Nearly all (98%) of the northbound LNG transit is from Qatar and mainly destined for European markets.**" | re-cite to `id=40152` |
| EIA `id=32452` Malacca quotes ("shortest sea route…", LNG/Qatar/Japan+Korea, Phillips Channel) | CONFIRMED | all verbatim | — |
| Bernama "nearly 60 percent" | CONFIRMED verbatim | "Saudi Arabia, the United Arab Emirates, Kuwait and Iraq, accounted for nearly 60 percent of the crude oil moving through the Strait of Malacca in 1H25" | full URL: `https://garasi.bernama.com/quick-reads/strait-of-malacca-keeps-top-spot-as-worlds-largest-oil-transit-chokepoint` (3 Apr 2026). It also gives Malacca **crude** 1H25 = 16.6 mb/d, China 7.9 (48%), Korea 2.4, Japan 2.1 — better reconciliation anchors than the totals used above |
| Bernama "0.8 million b/d…from its Atlantic coast through the Strait of Malacca to East Asia" | quote CONFIRMED, derivation **WRONG** | verbatim | BACI 2024 USA→EAST_ASIA = 67.5 Mt = **1.35 mb/d**. 0.8 / 1.35 = **0.59**, not 1.00 |
| EIA `id=61443` "374,000 b/d in November" | quote CONFIRMED, use **MISAPPLIED** | "Monthly U.S. **LPG** volumes through the Suez started increasing in August, reaching 374,000 barrels per day (b/d) in November" — **November 2023**, and the article's whole frame is US LPG "which typically transit the Panama Canal **to destinations in East Asia**" | the flow is US→**Asia** (southbound Suez), not US→Europe; see §4.2 row S5 |
| Reuters "The Danish straits: gateway for a third of Russia's sea-borne crude exports" | CONFIRMED | article live (15 Nov 2023); "Primorsk and Ust-Luga are set to export more than 1.5 million barrels per day…more than a third of Russia's total seaborne oil exports" | note it also says **Kazakhstan** exports KEBCO through the same Baltic ports — relevant to §3.4's KAZ row |
| CREA Mar-2026: "22 percent…Primorsk, and 20 percent…Ust-Luga" | quote CONFIRMED, summary **WRONG** | verbatim — but the same sentence opens "[the Baltic ports are] key for Russian exports, with **47%** of the total seaborne crude oil and oil product exports (valued at EUR 60.9 bn) departing from them in **2025**" | Baltic share is **0.47** (2025, crude+products), not "~42%" |
| CREA: 48% shadow-fleet share, 48 false-flag vessels | CONFIRMED | "almost half (48%) of Russia's seaborne oil was transported by 'shadow' tankers under sanctions"; "48 'shadow' vessels were operating under false flags at the end of the month" | — |
| Kpler: Novorossiysk "roughly average around 2.5 Mbd" | quote CONFIRMED, context missing | verbatim — the **next sentence** is "with CPC Kazakhstan's share of that around **1.7 Mbd**". So 2.5 Mbd is the whole port complex incl. Kazakh CPC, not Russian crude. Reuters/Bloomberg put Russian Novorossiysk crude at 0.8–1.0 mb/d and Sheskharis at ~0.7 mb/d | quote both sentences or the figure misleads |
| Moscow Times: Sheskharis "about 650,000 barrels of oil per day", "around one-fifth of the country's oil exports" | CONFIRMED | verbatim; denominator stated as "Russia's average seaborne oil exports running at about 3.6 million barrels per day this year" | — |
| `content.ballastmarkets.com`: CPC "30–35%" of Novorossiysk **tanker departures** | **MISAPPLIED** (misquote) | the page says "**CPC oil share**: Estimated 30-35% of total oil **throughput** from Kazakhstan" — throughput, not departures. It also conflicts with Kpler (1.7 / 2.5 ≈ **68%**) | drop it; ballastmarkets is SEO content marketing with no stated method, not citable here |
| Reuters `…red-sea-still-face-lower-risks-2024-02-01` | CONFIRMED exists | live; "Four tankers carrying Russian Urals crude passed through the Bab-el-Mandab strait with another three heading south…since the attack on the Trafigura vessel on Jan. 26, Kpler data show" — seven tankers, anecdotal | fine as colour; correctly not used for a share |
| India-Briefing / **Facebook post by a Rajya Sabha MP** (§3.3 SOUTH_ASIA row) | **UNVERIFIABLE / not citable** | a social-media post cannot be a source on a site that publishes per-row citations | replace with Bernama/EIA: India is absent from the Malacca destination breakdown (China 7.9, Korea 2.4, Japan 2.1) |
| `bpnews.com` (Panama LPG), Institute of Geoeconomics (US LNG) | UNVERIFIABLE | not re-opened — both support rows the note itself marks UNSOURCED and recommends holding | moot if Panama is held |
| SUMED endpoint coordinates: "Ain Sukhna (29.6, 32.37) → Sidi Kerir (31.1, 29.65)" | **WRONG** | the Suez marker is given lon-first ("lon 32.34, lat 30.5") but these two pairs are lat/lon **reversed**: as written, Ain Sukhna plots at 32.37 °N in the Mediterranean off Turkey | Ain Sukhna ≈ **lon 32.35, lat 29.60**; Sidi Kerir ≈ **lon 29.65, lat 31.10** |
| Other markers (Bab 43.4/12.6, Suez 32.34/30.5, Bosporus 29.06/41.10, Great Belt 10.9/55.3, Panama −79.68/9.08, Malacca 103.7/1.25) | CONFIRMED | all plot where the note says | Phillips Channel is nearer 103.6/1.16 — cosmetic |

### 4.2 Share rows

| Row | Verdict | Why | Corrected value |
|---|---|---|---|
| **B1** Gulf-6 → EUROPE_MED crude 1.00 (Bab) | **WRONG for SAU**, CONFIRMED for the rest | see reconciliation below: SAU is 0.69 of the 1.32 mb/d total, and Kpler (already cited in `build_disruption_routing.py` for the Hormuz SAU row) puts Saudi Red Sea/Yanbu loadings at **~0.76 mb/d** — i.e. essentially all Saudi crude to Europe plausibly loads *north* of Bab el-Mandeb | ARE, KWT, QAT, IRQ, BHR = **1.00**; SAU = **0.00** (or ≤0.10) with the Argus/Kpler note |
| **B2** SAU Yanbu-only 0.00 | **MISAPPLIED** as a recommendation | BACI has no port field, so this cannot be a row — and §3.1's own recommendation (ship option (a), one blended 1.00) resolves the ambiguity in the **wrong direction**. The Hormuz precedent is a *blend* (0.88), not 1.00; here the blend for the Europe leg specifically is near 0, because Yanbu is exactly the terminal that serves Europe | fold into B1 |
| **B3 / S2** Gulf → EAST_ASIA, SOUTH_ASIA = 0.00 | CONFIRMED | structural, and corroborated by Bernama's destination table | keep — though with no exporter wildcard these rows are redundant (engine defaults missing pairs to 0) |
| **B4** QAT → EUROPE_MED LNG 1.00 | share OK, citation **MISAPPLIED** | see §4.1; `id=40152`'s "98% of northbound LNG is from Qatar, mainly to Europe" is the right support | 1.00, re-cited |
| **B5** QAT → EAST_ASIA/SOUTH_ASIA LNG 0.00 | CONFIRMED | structural | keep |
| **S1** Gulf(+IRN) → EUROPE_MED, USA crude **0.85** (Suez) | **MISAPPLIED** | 0.85 is Persian-Gulf **share of northbound Suez traffic** (composition), measured on *petroleum* (crude+products), 2018. It is not "85% of Gulf→Europe crude uses Suez". Reading it as a share is the same bloc-share-vs-exporter-share error the note correctly flags for Bernama's 60% | **1.00**, on the note's own principle 2 (the Cape is a consequence, not a bypass; SUMED is inside EIA's chokepoint definition). Drop the 0.85 derivation entirely. Also drop **IRN** — BACI shows ~0 Iranian crude to Europe after 2018, so the row is a phantom |
| **S3** RUS → Asia, UNSOURCED | CONFIRMED (correctly held) | no EIA/IEA cargo-level split exists; the Reuters piece is seven tankers | hold |
| **S4** QAT → EUROPE_MED LNG ~1.00 | share OK, citation **MISAPPLIED** | same as B4 | 1.00, re-cited to `id=40152` |
| **S5** US Gulf Coast products → EUROPE_MED | **WRONG (direction)** | the cited 374 kb/d is US **LPG** moving **to East Asia** via Suez, not to Europe. Separately, `products` is not a commodity in this schema (`trade_flow` carries HS 2709 and HS 271111 only) | drop the row |
| **M1** Gulf-4 → EAST_ASIA **0.60** (Malacca) | figure CONFIRMED, **must not ship as a row** | it collides on `(exporter, importer, commodity)` with M2 at a different value; `computeScenarioImpact` builds a `Map`, so whichever is written last silently wins | keep as prose/sanity check only; never write it to `disruption_route.parquet` |
| **M2** Gulf-6 + OMN → EAST_ASIA crude 1.00 | **CONFIRMED** | best-reconciling row in the note (see below) | ship; optionally drop **IDN** (Java refineries are reached via Sunda/Lombok) — worth 0.08 mb/d, immaterial |
| **M3** → SOUTH_ASIA 0.00 | CONFIRMED (bad citation) | correct conclusion, Facebook citation | keep, re-cite to Bernama/EIA |
| **M4** USA → EAST_ASIA crude 1.00 | **WRONG** | cited 0.8 mb/d vs 1.35 mb/d of actual BACI trade | **0.60** |
| **M5** QAT → EAST_ASIA LNG 1.00 | CONFIRMED | `id=32452` verbatim | ship |
| **M6** AUS → EAST_ASIA LNG 1.00 | **WRONG** | Australia's east-coast projects (Gladstone/Curtis Island, ~25 Mtpa, roughly a third of national exports) sail the Coral/Philippine Sea and never approach Malacca; NW-Shelf cargo to NE Asia routes via Lombok/Makassar/Ombai-Wetar. The note itself found no EIA document and calls it a "Sunda/Malacca system" bloc — but the scenario is *Malacca*. Shipping it adds **78.6 Mt** (1.58 mb/d-equiv) of unsupported exposure to the gas axis | drop from the Malacca scenario |
| **T1** RUS Black-Sea-loaded → all 1.00 (Turkish) | **MISAPPLIED** | not encodable — with no port field this becomes a RUS wildcard of 1.00, which would route Kozmino/ESPO barrels through Istanbul | drop; the wildcard is T2 |
| **T2** RUS wildcard UNSOURCED | CONFIRMED (correctly held) | — | hold |
| **T3** KAZ → EUROPE_MED, EAST_ASIA, SOUTH_ASIA = 1.00 | **WRONG**, four ways | (a) it contradicts the shipped `cpc` row (KAZ 0.80 of exports); the engine multiplies share × BACI directly with no chaining, so 1.00 asserts *all* Kazakh exports cross the straits; (b) **BGR and ROU are Black Sea importers** (Burgas, Constanța) — 0.13 mb/d that never reaches the Bosporus; (c) **KAZ→CHN** (0.06 mb/d) arrives by the Kazakhstan–China **pipeline**; (d) Kazakhstan also exports KEBCO from Russia's *Baltic* ports (Reuters, same article the note cites for §3.5) | **0.80** wildcard + share-0 pair rows for **BGR, ROU, CHN**. Add a note that Turkey's Izmit (Marmara) transits only the Bosporus, while EIA's series is labelled *Dardanelles* |
| **D1** RUS Baltic-loaded → ALL 1.00 (Danish) | **WRONG — the most dangerous row in the note** | not encodable as "Baltic-loaded"; as a row it is a RUS wildcard of 1.00 = **4.35 mb/d** of crude, against a strait EIA measures at **2.7–3.0 mb/d of crude in total, all origins, both directions**. It would also route Pacific ESPO cargo to China/Japan/Korea around Denmark | **0.47** wildcard (CREA, Baltic ports' share of Russian seaborne crude+products, 2025) **or hold**. Implies ~2.0 mb/d — fits inside EIA's 2.7 |
| **D2** RUS wildcard UNSOURCED (range 0.33–0.47) | CONFIRMED (correctly held) | the range is the right shape; its upper bound is CREA's actual headline | if shipped, **0.47**, dated |
| **P1–P3** Panama (LPG, crude ~0.00–0.05, LNG) | CONFIRMED as unsourced | concur with the note | hold / skip |

### 4.3 Implied-volume reconciliation (BACI 2024 × proposed shares vs EIA crude-only transit)

Crude only (HS 2709), tonnes → b/d at 7.33 bbl/t. EIA comparators are **crude + condensate** rows from
STEO Tables 3–9, 1H25 average (pre-distortion), *both directions*.

| Scenario | Proposed rows imply | EIA crude transit (1H25) | Read |
|---|---|---|---|
| **Malacca** | Gulf-6+OMN → EAST_ASIA 9.77 (Gulf-4 alone) / 11.31 (all 7) + USA 1.35 = **12.66 mb/d** | **16.45** (Bernama: 16.6) | Excellent. Gulf-4 alone = **9.77** vs EIA's 60% × 16.6 = **9.96** — a 2% match. The 3.9 mb/d residual is Iran (1.6, invisible in BACI because China does not declare it), Russia (0.4) and Africa/LatAm. **Ship.** With M4 corrected to 0.60 the total is 12.12, still clean |
| **Bab el-Mandeb** | Gulf-6 → EUROPE_MED × 1.00 = **1.32 mb/d**, of which SAU **0.69** | ~**2.35** (both directions) | Two errors partly cancelling. Northbound-only is at most ~half of 2.35 ≈ 1.2, so the *modelled* leg is about right — but only because SAU's 0.69 (which should be ~0, Yanbu) offsets the southbound and non-Gulf traffic the model omits. Drop SAU → 0.63 mb/d, honestly scoped to northbound Gulf-loaded crude |
| **Suez+SUMED** | at 0.85: **1.64**; at 1.00: **1.93 mb/d** | ~**2.85** (both directions; northbound ≈1.4) | 1.93 slightly overshoots northbound, 1.64 sits on it — but the 0.85 gets there by a wrong derivation. Ship 1.00 with the both-directions caveat, and keep SAU here (Yanbu crude *does* transit Suez — the note's §1 principle 3 is right) |
| **Turkish Straits** | KAZ → EU+EA+SA × 1.00 = **1.14 mb/d** | ~**2.25** (Russia + Kazakhstan) | plausible against Kpler's CPC 1.7 Mbd, but 0.13 of it is Black Sea (BGR/ROU) and 0.06 is pipeline (CHN). At the corrected 0.80 with those carve-outs: **0.76 mb/d**. Consistent |
| **Danish Straits** | RUS → ALL × 1.00 = **4.35 mb/d** | **2.70** (all origins) | **1.6× the entire chokepoint.** Unshippable. At 0.47: **2.04 mb/d** — fits |
| **Panama** | n/a (all rows unsourced) | 0.10 crude | concur: hold |

### 4.4 Region-list corrections

- **`BALTIC_NEIGHBOURS = {}` is wrong.** Shares in this table are *static across years* (the IRQ note in
  `build_disruption_routing.py` says so explicitly) and the slider runs 1990–2024, so "near zero since
  2022" does not license an empty set. BACI 2021: RUS crude to Baltic-interior buyers = **0.94 mb/d**
  (DEU 20.7, POL 12.3, FIN 6.65, LTU 4.94, SWE 1.05, DNK 1.01, EST 0.05 Mt); 2015 was larger still.
  None of it leaves the Baltic. → `BALTIC_NEIGHBOURS = {FIN, SWE, POL, LTU, LVA, EST, DNK, DEU}`
  (DEU because Rostock is Baltic and the rest arrives by Druzhba, not by sea).
- **`BLACKSEA_NEIGHBOURS = {GEO}` is wrong.** Bulgaria (Burgas/Lukoil Neftochim) and Romania
  (Constanța) are Black Sea importers of both Urals and CPC blend — 0.13 mb/d of Kazakh crude in 2024
  alone — and never see the Turkish Straits. → `{GEO, BGR, ROU, UKR}`, with **TUR** carved out
  separately: Tüpraş İzmit is on the Sea of Marmara (Bosporus only, not the Dardanelles that EIA's
  series actually measures), while STAR/Aliağa is Aegean (both straits).
- **`EUROPE_MED` must not be reused unmodified for the Turkish and Danish Straits.** It contains BGR
  and ROU (Black Sea) and FIN/SWE/POL/LTU/LVA/EST/DNK/DEU (Baltic) — the exact countries the two
  neighbour sets are supposed to exclude. Reusing it there is what produces the D1/T3 errors above.
- **`EAST_ASIA`**: `IDN` is a genuine (if immaterial, 0.08 mb/d) error for Malacca — Cilacap and
  Balongan are reached via Sunda/Lombok. `HKG` has no crude imports in BACI at all; harmless.
  `SGP`, `MYS`, `THA`, `VNM`, `PHL` are correct — cargo from the Gulf transits the strait to reach them.
- **`SOUTH_ASIA`, `GULF_COASTAL`** — correct as written; `GULF_COASTAL` matches the constant in
  `build_disruption_routing.py` exactly. No landlocked importers appear in any region list.
- **Coverage gap, not an error:** no region covers the Red Sea itself (Jordan/Aqaba, Egypt, Israel/Eilat,
  Sudan/Port Sudan), which sits *between* the two straits and is exposed to Bab el-Mandeb but not Suez.
  Immaterial in BACI tonnage, but worth one line in `source_note` so a reader does not assume it was modelled.
- **Missing exporter:** Bernama puts **Iran at 1.6 mb/d through Malacca in 1H25** — the largest single
  omission from the Malacca exporter list. BACI cannot see it (China does not declare Iranian crude), so
  leaving IRN out is defensible, but the omission should be stated rather than silent.

### 4.5 The 2026 war claim (task item 5)

**Substantially CONFIRMED, from primary data** — and it does **not** change any structural share, but it
does invalidate the "Total flow (2Q26)" figures the note proposes for panel display.

- **EIA STEO, Global Energy Security Data, 12 Aug 2026** (primary, the note's own source):
  Hormuz total oil 21.6 (4Q25) → 14.9 (1Q26) → **4.9** (2Q26) mb/d; Hormuz LNG 10.5 → 7.4 → **0.8**
  bcf/d; Bab el-Mandeb crude 3.2 → 3.4 → **6.1**; Cape of Good Hope LNG 6.0 → 4.8 → **9.7**. The
  methodology section states: "**Since the end of February 2026, AIS signal data for ships transiting the
  Strait of Hormuz have become especially unreliable. For 2026 Hormuz volumes, tanker tracking data are
  being revised frequently.**" EIA does not narrate a war, but its own series show the collapse and the
  Red Sea surge the note describes.
- **Congressional Research Service R45281**, *The Strait of Hormuz* (`congress.gov/crs-product/R45281`):
  "February 28–April 7, 2026: Days after U.S.-Israeli attacks on Iran began, Iranian forces declared the
  Strait closed and cross-Strait traffic largely halted"; a 17 June 2026 US–Iran MOU committed Iran to
  "safe passage of commercial vessels…for 60 days only".
- **IEA** via *Oil & Gas Journal*'s Iran-war index (`ogj.com/IranWar`): "IEA: Oil market recovery clouded
  as Hormuz ceasefire collapses" (July 2026). I did not reach an IEA-hosted page directly.
- EIA's own launch framing, reported by *World Oil* (12 May 2026): the quarterly chokepoint dataset was
  created "amid Hormuz crisis…as ongoing disruption in the Strait of Hormuz continues to reshape global
  energy markets."

**Assessment.** The note's decision to pin shares to a pre-war structural baseline is correct and matches
the existing convention. But the note then quotes **2Q26** as each chokepoint's headline "Total flow" —
the single most distorted quarter on record. Publishing "Bab el-Mandeb: 8.1 mb/d" as a descriptive fact
would tell a researcher the opposite of the structural story the shares encode. **Use 1H25 (or 4Q25) for
every headline figure**, and put 2Q26 in a dated "current state" line if at all. One further consequence:
EIA warns its 2026 Hormuz numbers are being revised frequently, so any figure taken from that column is
unstable by EIA's own statement.

### 4.6 Ship / hold

**Ship — rows I stand behind as written or as corrected:**

- **Malacca (crude).** `{SAU, ARE, KWT, IRQ, QAT, BHR, OMN} → EAST_ASIA \ {IDN} = 1.00`;
  `… → SOUTH_ASIA = 0.00`; `USA → EAST_ASIA = 0.60` (not 1.00). Cite Bernama-via-EIA (full URL) and
  `id=32452`. Reconciles to 9.77 mb/d against EIA's 9.96 — the strongest row set in the note.
- **Malacca (LNG).** `QAT → EAST_ASIA = 1.00` only. **Drop the AUS row.**
- **Suez+SUMED (crude).** `{SAU, ARE, KWT, QAT, IRQ, BHR} → EUROPE_MED ∪ {USA} = 1.00` (not 0.85,
  not IRN); `… → EAST_ASIA, SOUTH_ASIA = 0.00`. `source_note` must state that the 1.00 is structural
  (no bypass short of the Cape; SUMED is inside EIA's chokepoint definition, not outside it) and must
  **not** cite the 85% figure as its derivation. No Russia row.
- **Suez+SUMED (LNG).** `QAT → EUROPE_MED = 1.00`, cited to `id=40152`'s 98%.
- **Bab el-Mandeb (crude).** `{ARE, KWT, QAT, IRQ, BHR} → EUROPE_MED = 1.00`; `SAU → EUROPE_MED = 0.00`
  citing the Argus/Kpler Yanbu figure already in the repo; `… → EAST_ASIA, SOUTH_ASIA = 0.00`.
- **Bab el-Mandeb (LNG).** `QAT → EUROPE_MED = 1.00` / `→ EAST_ASIA, SOUTH_ASIA = 0.00`.

**Ship only with the stated corrections:**

- **Turkish Straits.** `KAZ = 0.80` wildcard + share-0 pairs for **BGR, ROU, CHN**, `source_note`
  reconciling it to the existing `cpc` row and naming the Marmara/Dardanelles nuance. No Russia row.

**Hold:**

- **Danish Straits.** Do not ship `RUS = 1.00` in any form. Either ship `RUS = 0.47` (CREA, 2025,
  crude+products, dated and caveated, implying 2.04 mb/d against EIA's 2.70) or ship nothing. A scenario
  with a populated `BALTIC_NEIGHBOURS` carve-out is a precondition either way.
- **All Russia wildcards** on Suez, Turkish and Danish — concur with the note.
- **Panama** — concur with the note; skip.

**Blocking fixes before any of this reaches `build_disruption_routing.py`:** populate
`BALTIC_NEIGHBOURS` and `BLACKSEA_NEIGHBOURS`; stop reusing `EUROPE_MED` for the two Russian straits;
guarantee the region-expansion loop cannot emit two rows with the same `(disruption_id, exporter, importer)`
key (the M1/M2 collision); fix the SUMED lon/lat; and swap every 2Q26 headline figure for 1H25.
