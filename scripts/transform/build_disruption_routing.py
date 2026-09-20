"""Build disruption_route.parquet — chokepoint + pipeline disruptions.

Each row: (disruption_id, kind, exporter_iso3, importer_iso3, share, source,
           source_title, source_url, source_year, source_note)

Share semantics:
- chokepoint: fraction of exporter's seaborne crude that transits the chokepoint
- pipeline: fraction of exporter→importer trade flow that moves on this pipeline

importer_iso3 = None means the share applies to all importers of that exporter;
a pair row (importer_iso3 set) overrides it for that importer, including
share 0 for Hormuz trade that stays inside the Gulf.

Citations (review R6, Phase 7 A6): every hand-set share carries the document
that supports it (``source_title``/``source_url``/``source_year``) and a
``source_note`` explaining how the number follows from that document. Shares
were set in Phase 1/2; the citations were researched afterwards (2026-09-10)
and the shares were left unchanged at first; on 2026-09-10 the user approved
updating the six that disagreed with their sources (IRQ, POL, DEU, CZE, AZE,
RUS-CPC) to values derived from the cited figures. Each note records the
derivation and the Phase 1/2 value it replaced. Rows no document supports
directly are marked ``source_title = UNSOURCED``.
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

OUT = Path("public/data/disruption_route.parquet")
SRC_EIA = "EIA World Oil Transit Chokepoints"
SRC_IEA_PIPELINE = "EIA / IEA pipeline analysis (Phase 2 simplified)"

UNSOURCED = "Analyst estimate (unsourced)"


# ── Citations ───────────────────────────────────────────────────────────────
IEA_HORMUZ = (
    "IEA, Strait of Hormuz (Oil security and emergency response)",
    "https://www.iea.org/about/oil-security-and-emergency-response/strait-of-hormuz",
    2026,
)
ARGUS_YANBU = (
    "Argus Media, Yanbu gives Aramco limited option for rerouting crude (Kpler data)",
    "https://www.argusmedia.com/en/news-and-insights/latest-market-news/"
    "2798868-yanbu-gives-aramco-limited-option-for-rerouting-crude",
    2026,
)
IEA_RUSSIA_2022 = (
    "IEA, Russian supplies to global energy markets — Oil market and Russian supply",
    "https://www.iea.org/reports/russian-supplies-to-global-energy-markets/"
    "oil-market-and-russian-supply-2",
    2022,
)
GEM_DRUZHBA = (
    "Global Energy Monitor, Druzhba Oil Pipeline (GEM.wiki)",
    "https://www.gem.wiki/Druzhba_Oil_Pipeline",
    2026,
)
EIA_CASPIAN = (
    "EIA, Regional Analysis Brief: Caspian Sea",
    "https://www.eia.gov/international/content/analysis/regions_of_interest/caspian_sea/",
    2025,
)
EIA_MALACCA = (
    "EIA, World Oil Transit Chokepoints: Strait of Malacca",
    "https://www.eia.gov/todayinenergy/detail.php?id=32452",
    2017,
)
BERNAMA_MALACCA = (
    "Bernama, Strait of Malacca Keeps Top Spot as World's Largest Oil Transit Chokepoint "
    "(EIA data)",
    "https://garasi.bernama.com/quick-reads/"
    "strait-of-malacca-keeps-top-spot-as-worlds-largest-oil-transit-chokepoint",
    2026,
)
EIA_SUEZ_SUMED = (
    "EIA, The Suez Canal and SUMED Pipeline are critical chokepoints for oil and natural gas trade",
    "https://www.eia.gov/todayinenergy/detail.php?id=40152",
    2019,
)
CER_PIPELINE_SYSTEM = (
    "Canada Energy Regulator, Canada's Pipeline System 2021 "
    "(Crude Oil Pipeline Transportation System)",
    "https://www.cer-rec.gc.ca/en/data-analysis/facilities-we-regulate/"
    "canadas-pipeline-system/2021/crude-oil-pipeline-transportation-system.html",
    2021,
)
DOWNS_USCC_2019 = (
    "Erica Downs, testimony to the U.S.-China Economic and Security Review Commission",
    "https://www.uscc.gov/sites/default/files/Downs_Testimony...pdf",
    2019,
)


def _row(
    disruption_id: str,
    kind: str,
    exporter_iso3: str,
    importer_iso3: str | None,
    share: float,
    source: str,
    citation: tuple[str, str, int] | None,
    note: str,
) -> dict:
    """Create a disruption route row. ``citation=None`` marks it unsourced."""
    title, url, year = citation if citation else (UNSOURCED, "", 2026)
    return {
        "disruption_id": disruption_id,
        "kind": kind,
        "exporter_iso3": exporter_iso3,
        "importer_iso3": importer_iso3,
        "share": share,
        "source": source,
        "source_title": title,
        "source_url": url,
        "source_year": year,
        "source_note": note,
    }


_NO_BYPASS = (
    "IEA (2025 data): Iran, Iraq, Kuwait, Qatar and Bahrain 'rely on the Strait to "
    "deliver the vast majority of their oil exports'; only Saudi Arabia and the UAE "
    "have bypass routes."
)

# ── Hormuz ──────────────────────────────────────────────────────────────────
HORMUZ = [
    _row(
        "hormuz",
        "chokepoint",
        "IRN",
        None,
        1.00,
        SRC_EIA,
        IEA_HORMUZ,
        _NO_BYPASS + " Iran's Goreh-Jask/Jask terminal is 'effectively non-operational' "
        "(one test cargo, late 2024).",
    ),
    _row(
        "hormuz",
        "chokepoint",
        "IRQ",
        None,
        0.90,
        SRC_EIA,
        IEA_HORMUZ,
        _NO_BYPASS + " Iraq's northern Kirkuk-Ceyhan exports (roughly 0.4 mb/d before "
        "the Mar 2023 shutdown; figure not from the cited source) bypass Hormuz, so 0.90 "
        "is the long-run share; ~1.0 in 2023-24 while that line was shut (shares are "
        "static across years). Was 1.00 before 2026-09-10.",
    ),
    _row("hormuz", "chokepoint", "KWT", None, 1.00, SRC_EIA, IEA_HORMUZ, _NO_BYPASS),
    _row("hormuz", "chokepoint", "QAT", None, 1.00, SRC_EIA, IEA_HORMUZ, _NO_BYPASS),
    _row(
        "hormuz",
        "chokepoint",
        "SAU",
        None,
        0.88,
        SRC_EIA,
        ARGUS_YANBU,
        "Kpler 2025: ~5.5 mb/d of Saudi crude shipped via Hormuz vs ~0.76 mb/d via the "
        "Red Sea (Yanbu) -> 5.5 / 6.26 = 0.88. Consistent with IEA (5.43 mb/d Saudi "
        "crude through Hormuz, 2025).",
    ),
    _row(
        "hormuz",
        "chokepoint",
        "ARE",
        None,
        0.65,
        SRC_EIA,
        IEA_HORMUZ,
        "IEA 2025: 2.02 mb/d of UAE crude through Hormuz; ~1.1 mb/d of domestic crude "
        "exported via the Habshan-Fujairah (ADCOP) pipeline -> 2.02 / 3.12 = 0.65.",
    ),
    _row(
        "hormuz",
        "chokepoint",
        "BHR",
        None,
        1.00,
        SRC_EIA,
        IEA_HORMUZ,
        _NO_BYPASS + " Bahrain's own crude exports are ~0 (IEA table: 0.00 mb/d crude, "
        "0.21 mb/d products).",
    ),
]

# ── Druzhba (RUS → Central/Eastern Europe) ──────────────────────────────────
DRUZHBA = [
    _row(
        "druzhba",
        "pipeline",
        "RUS",
        "BLR",
        1.00,
        SRC_IEA_PIPELINE,
        GEM_DRUZHBA,
        "Structural: Belarus is landlocked; its two refineries (Mozyr, Naftan/Novopolotsk) "
        "are fed by Druzhba and the Unecha-Polotsk line. Residual rail volumes not "
        "quantified in the source.",
    ),
    _row(
        "druzhba",
        "pipeline",
        "RUS",
        "POL",
        0.47,
        SRC_IEA_PIPELINE,
        IEA_RUSSIA_2022,
        "IEA: ~750 kb/d to Europe via Druzhba, ~250 kb/d on the southern branch -> "
        "~500 kb/d on the northern branch shared by Poland and Germany. Poland imported "
        "372 kb/d and Germany 687 kb/d from Russia (Nov 2021); IEA does not give the "
        "split, so the branch is allocated pro-rata: 500 / (372 + 687) = 0.47. "
        "Was 0.95 before 2026-09-10.",
    ),
    _row(
        "druzhba",
        "pipeline",
        "RUS",
        "DEU",
        0.47,
        SRC_IEA_PIPELINE,
        IEA_RUSSIA_2022,
        "Northern branch ~500 kb/d allocated pro-rata across Poland (372 kb/d) and "
        "Germany (687 kb/d) Russian imports (IEA, Nov 2021): 500 / 1059 = 0.47; the "
        "remainder arrived by tanker. Was 0.60 before 2026-09-10.",
    ),
    _row(
        "druzhba",
        "pipeline",
        "RUS",
        "SVK",
        1.00,
        SRC_IEA_PIPELINE,
        IEA_RUSSIA_2022,
        "IEA: ~250 kb/d via the southern branch to Hungary, Slovakia, Czechia; their "
        "Nov 2021 imports from Russia (SVK 109 + HUN 79 + CZE 52 = 240 kb/d) match "
        "that volume, i.e. essentially all by pipeline.",
    ),
    _row(
        "druzhba",
        "pipeline",
        "RUS",
        "HUN",
        1.00,
        SRC_IEA_PIPELINE,
        IEA_RUSSIA_2022,
        "IEA: southern branch ~250 kb/d vs HUN+SVK+CZE Russian imports 240 kb/d "
        "(Nov 2021) — essentially all by pipeline.",
    ),
    _row(
        "druzhba",
        "pipeline",
        "RUS",
        "CZE",
        1.00,
        SRC_IEA_PIPELINE,
        IEA_RUSSIA_2022,
        "IEA: southern branch ~250 kb/d vs HUN+SVK+CZE Russian imports 240 kb/d "
        "(Nov 2021) — essentially all by pipeline. Was 0.90 before 2026-09-10.",
    ),
]

# ── BTC (Baku-Tbilisi-Ceyhan) ───────────────────────────────────────────────
BTC = [
    _row(
        "btc",
        "pipeline",
        "AZE",
        None,
        0.83,
        SRC_IEA_PIPELINE,
        EIA_CASPIAN,
        "EIA: 'about 83% of Azerbaijan's oil exports go through the BTC pipeline' "
        "(IEA 2023 profile: ~80%). The 'over 90%' EIA figure is cumulative ACG output, "
        "not the share of exports. Was 0.90 before 2026-09-10.",
    ),
]

# ── CPC (Caspian Pipeline Consortium) ───────────────────────────────────────
CPC = [
    _row(
        "cpc",
        "pipeline",
        "KAZ",
        None,
        0.80,
        SRC_IEA_PIPELINE,
        EIA_CASPIAN,
        "EIA: 'The CPC carries about 80% of Kazakhstan's crude oil export'.",
    ),
    _row(
        "cpc",
        "pipeline",
        "RUS",
        None,
        0.035,
        SRC_IEA_PIPELINE,
        None,
        "Derived, no single document: non-Kazakh (Russian-field) CPC volumes are ~8 Mt/y "
        "(63 Mt total 2024 minus 54.9 Mt Kazakh) against ~230 Mt/y of Russian crude "
        "exports -> ~0.035. The earlier 0.10 conflated Russia's share of CPC throughput "
        "with CPC's share of Russian exports. Was 0.10 before 2026-09-10.",
    ),
]


# ── Hormuz, LNG (used when the scenario runs on the gas axis) ───────────────
# The crude shares above do not transfer to LNG: the UAE's crude bypass (the
# Habshan-Fujairah pipeline) carries no gas, and both Gulf LNG export plants
# (Qatar's Ras Laffan, the UAE's Das Island) load inside the strait.
_LNG_NO_BYPASS = (
    "Structural: the LNG export terminal loads inside the Persian Gulf and there is no "
    "pipeline or alternative port for LNG, so all LNG exports transit Hormuz. IEA puts "
    "Hormuz LNG flows at about a fifth of global LNG trade, almost all from Qatar and "
    "the UAE."
)
HORMUZ_LNG = [
    _row(
        "hormuz_lng",
        "chokepoint",
        "QAT",
        None,
        1.00,
        SRC_EIA,
        IEA_HORMUZ,
        _LNG_NO_BYPASS + " Ras Laffan (Qatar).",
    ),
    _row(
        "hormuz_lng",
        "chokepoint",
        "ARE",
        None,
        1.00,
        SRC_EIA,
        IEA_HORMUZ,
        _LNG_NO_BYPASS + " Das Island (ADNOC Gas); the crude-only 0.65 share reflects "
        "the Fujairah oil bypass, which does not apply to LNG.",
    ),
]


# ── Hormuz, intra-Gulf pairs ────────────────────────────────────────────────
# The exporter-wide shares above apply to every buyer, including buyers
# inside the Gulf, whose cargoes never cross the strait (Qatari LNG into
# Kuwait's Al Zour, Saudi crude to Bahrain's Sitra refinery via the AB
# pipeline). A share-0 pair row overrides the wildcard for those pairs
# (user-approved 2026-09-11). Inbound flows into the Gulf from outside also
# cross the strait but are out of scope: the scenario measures Gulf exports.
GULF_COASTAL = ("IRN", "IRQ", "KWT", "QAT", "SAU", "ARE", "BHR")

_INTRA_GULF_NOTE = (
    "Structural: both the exporter and the importer have terminals inside the Persian "
    "Gulf, so the cargo never crosses the Strait of Hormuz. The exporter-wide share "
    "applies only to buyers outside the Gulf. Saudi Arabia and the UAE also have "
    "ports outside the strait (Red Sea, Fujairah), but a cargo from a Gulf "
    "neighbour lands at their Gulf-coast terminals. Imports into the Gulf from "
    "outside are out of scope: the scenario measures Gulf exports."
)


def _intra_gulf(disruption_id: str, exporters: list[dict]) -> list[dict]:
    return [
        _row(
            disruption_id,
            "chokepoint",
            e["exporter_iso3"],
            importer,
            0.0,
            SRC_EIA,
            IEA_HORMUZ,
            _INTRA_GULF_NOTE,
        )
        for e in exporters
        for importer in GULF_COASTAL
        if importer != e["exporter_iso3"]
    ]


INTRA_GULF = _intra_gulf("hormuz", HORMUZ) + _intra_gulf("hormuz_lng", HORMUZ_LNG)


# ── R1: chokepoint region definitions (ISO3), verified 2026-09-19 ──────────
# Codes checked against scripts.common.iso3's source-name dicts (EI/GEM/NETL/
# LNG-T3), which between them cover every code used below.
#
# Direction is the whole model for these chokepoints (unlike Hormuz, where
# nearly every Gulf cargo must cross the strait regardless of destination):
# a share only applies to the (exporter, importer-region) pairs whose cargo
# actually needs this route. Missing pairs default to 0 in the engine, so
# only "= 1.00" and explicit "= 0.00" carve-outs need a row.
EUROPE_MED = (
    "NLD",
    "GBR",
    "FRA",
    "ESP",
    "ITA",
    "GRC",
    "BEL",
    "DEU",
    "POL",
    "LTU",
    "DNK",
    "SWE",
    "IRL",
    "PRT",
    "TUR",
    "BGR",
    "HRV",
    "ROU",
    "FIN",
    "EST",
    "LVA",
    "CYP",
    "MLT",
)
EAST_ASIA = ("CHN", "JPN", "KOR", "TWN", "HKG", "SGP", "MYS", "IDN", "THA", "PHL", "VNM")
# Malacca-specific: Java-bound cargo (Cilacap/Balongan) reaches Indonesia via
# the Sunda/Lombok straits, not Malacca (verifier RV, chokepoints.md §4.4).
EAST_ASIA_MINUS_IDN = tuple(c for c in EAST_ASIA if c != "IDN")
SOUTH_ASIA = ("IND", "PAK", "BGD", "LKA")


def _region_rows(
    disruption_id: str,
    exporters: tuple[str, ...],
    region: tuple[str, ...],
    share: float,
    source: str,
    citation: tuple[str, str, int] | None,
    note: str,
) -> list[dict]:
    """One chokepoint row per (exporter, importer) pair in the region."""
    return [
        _row(disruption_id, "chokepoint", exp, imp, share, source, citation, note)
        for exp in exporters
        for imp in region
    ]


# ── Strait of Malacca ────────────────────────────────────────────────────────
_MALACCA_GULF = ("SAU", "ARE", "KWT", "IRQ", "QAT", "BHR", "OMN")

MALACCA = (
    _region_rows(
        "malacca",
        _MALACCA_GULF,
        EAST_ASIA_MINUS_IDN,
        1.00,
        SRC_EIA,
        EIA_MALACCA,
        "Structural: the shortest sea route between Persian Gulf suppliers and East Asia, "
        "with no alternative once past Hormuz (EIA id=32452). Bernama/EIA (1H2025): Saudi "
        "Arabia, the UAE, Kuwait and Iraq alone were 'nearly 60 percent' of Malacca crude. "
        "IDN excluded: Cilacap/Balongan-bound cargo reaches Indonesia via the Sunda/Lombok "
        "straits, not Malacca.",
    )
    + _region_rows(
        "malacca",
        _MALACCA_GULF,
        SOUTH_ASIA,
        0.00,
        SRC_EIA,
        EIA_MALACCA,
        "Structural: Gulf crude to South Asia crosses the Arabian Sea directly and never "
        "reaches the strait; India is absent from EIA/Bernama's Malacca destination "
        "breakdown (China 7.9 mb/d, Korea 2.4, Japan 2.1 in 1H2025).",
    )
    + _region_rows(
        "malacca",
        ("USA",),
        EAST_ASIA_MINUS_IDN,
        0.60,
        SRC_EIA,
        BERNAMA_MALACCA,
        "Bernama/EIA (1H2025): 'the United States also sent 0.8 million barrels per day of "
        "crude oil and condensates from its Atlantic coast through the Strait of Malacca to "
        "East Asia.' BACI USA->East Asia crude (2024): 67.5 Mt/yr = 1.35 mb/d; "
        "0.8 / 1.35 = 0.59, rounded to 0.60. Was proposed at 1.00 by the first-pass research "
        "note; the verifier corrected it against the BACI denominator.",
    )
)

MALACCA_LNG = _region_rows(
    "malacca_lng",
    ("QAT",),
    EAST_ASIA_MINUS_IDN,
    1.00,
    SRC_EIA,
    EIA_MALACCA,
    "EIA id=32452: Malacca 'is also an important transit route for [LNG] from Persian Gulf "
    "and African suppliers, particularly Qatar, to East Asian countries...The biggest "
    "importers...are Japan and South Korea.' No Australia row: the verifier found roughly a "
    "third of Australian LNG loads on the east coast (Gladstone/Curtis Island) and sails the "
    "Coral/Philippine Sea, never approaching Malacca; the remainder (NW Shelf) routes via "
    "Lombok/Makassar/Ombai-Wetar, not this strait.",
)

# ── Suez Canal + SUMED pipeline ──────────────────────────────────────────────
_SUEZ_GULF = ("SAU", "ARE", "KWT", "QAT", "IRQ", "BHR")
# No USA row (orchestrator decision, final review #6, 2026-09-19): the
# previous exporter-wide wildcard implied Gulf->USA Gulf Coast VLCCs sail via
# Suez/SUMED, ranking USA as the top Suez-exposed importer (30.3 Mt, ~9% of
# US crude imports) on no cited share. Gulf->US Gulf Coast crude routinely
# sails around the Cape of Good Hope (the longer all-water route avoids the
# canal's size limits and SUMED's own capacity constraints for VLCCs), and no
# EIA/IEA document was found splitting Gulf->USA crude between the Suez/SUMED
# route and the Cape. A hole beats a contested number: USA is left out of
# this scenario's importer set until a cited share exists (docs/methodology.md
# "known omissions"); a maintainer may restore it with a source.
_SUEZ_IMPORTERS = EUROPE_MED

SUEZ = _region_rows(
    "suez",
    _SUEZ_GULF,
    _SUEZ_IMPORTERS,
    1.00,
    SRC_EIA,
    EIA_SUEZ_SUMED,
    "Structural, not the EIA '85% of northbound traffic' composition figure (that describes "
    "the chokepoint's own traffic mix, crude+products, 2018 — not the fraction of Gulf->"
    "Europe crude that uses Suez, and the verifier flagged the 0.85 reading as misapplied). "
    "Per this file's own bypass rule: the Cape of Good Hope is a disruption consequence, not "
    "a pre-existing bypass, and SUMED is inside this chokepoint's definition, not outside it "
    "- so the structural share is 1.00. No Iran row: BACI shows ~0 Iranian crude to Europe "
    "after 2018 sanctions. No USA row: Gulf->US Gulf Coast crude routinely sails the Cape of "
    "Good Hope rather than Suez/SUMED, and no cited share exists to split it - see this "
    "file's header comment. Coverage gap: Red Sea littoral importers themselves (Egypt, "
    "Jordan, Israel, Sudan) are not in the EUROPE_MED importer set this row uses, so their "
    "own Suez-transiting imports are out of scope for this scenario, not modelled as zero "
    "exposure.",
)

SUEZ_LNG = _region_rows(
    "suez_lng",
    ("QAT",),
    EUROPE_MED,
    1.00,
    SRC_EIA,
    EIA_SUEZ_SUMED,
    "EIA id=40152: 'Nearly all (98%) of the northbound LNG transit is from Qatar and mainly "
    "destined for European markets.' This LNG transits both Bab el-Mandeb and Suez on the "
    "same voyage.",
)

# ── Bab el-Mandeb Strait ─────────────────────────────────────────────────────
_BAB_GULF = ("ARE", "KWT", "QAT", "IRQ", "BHR")

BAB_EL_MANDEB = _region_rows(
    "bab_el_mandeb",
    _BAB_GULF,
    EUROPE_MED,
    1.00,
    SRC_EIA,
    EIA_SUEZ_SUMED,
    "Structural, not the EIA '85% of northbound traffic' composition figure used on the "
    "'suez' scenario (that figure describes the chokepoint's own traffic mix, crude+"
    "products, 2018 - not the fraction of Gulf->Europe crude that uses this route, and "
    "the verifier flagged it as misapplied there; it is not used here either). Per this "
    "file's own bypass rule: the Cape of Good Hope is a disruption consequence, not a "
    "pre-existing bypass, so Gulf crude bound for Europe that transits the Red Sea at "
    "all necessarily crosses Bab el-Mandeb - the structural share is 1.00. Coverage gap: "
    "Red Sea littoral importers themselves (Egypt, Jordan, Israel, Sudan) are not in the "
    "EUROPE_MED importer set this row uses, so their own Bab el-Mandeb-transiting imports "
    "are out of scope for this scenario, not modelled as zero exposure.",
) + _region_rows(
    "bab_el_mandeb",
    ("SAU",),
    EUROPE_MED,
    0.00,
    SRC_EIA,
    ARGUS_YANBU,
    "Structural: Saudi crude to Europe loads at Yanbu on the Red Sea (reached via the "
    "East-West/Petroline pipeline), north of Bab el-Mandeb - it never crosses this "
    "strait, though it still crosses Suez/SUMED (see the 'suez' scenario). Kpler 2025 "
    "(same figure already used for the Hormuz SAU row): ~0.76 mb/d of Saudi crude moves "
    "via the Red Sea, i.e. essentially all of Saudi Arabia's Europe-bound crude.",
)

BAB_EL_MANDEB_LNG = _region_rows(
    "bab_el_mandeb_lng",
    ("QAT",),
    EUROPE_MED,
    1.00,
    SRC_EIA,
    EIA_SUEZ_SUMED,
    "EIA id=40152: 'Nearly all (98%) of the northbound LNG transit is from Qatar and mainly "
    "destined for European markets.' This LNG transits both Bab el-Mandeb and Suez on the "
    "same voyage.",
)

# ── Turkish Straits (Bosporus + Dardanelles) ─────────────────────────────────
# Kazakhstan's CPC-blend crude is loaded onto tankers at Novorossiysk alongside
# Russian Black Sea crude, so it shares the same single sea exit. This is a
# different question from the existing `cpc` row (KAZ 0.80 of Kazakh
# *exports*, i.e. how much moves by the CPC pipeline at all): this row asks
# what fraction of Kazakh crude, once it reaches a tanker, must cross the
# Turkish Straits to leave the Black Sea - the same 0.80, since essentially
# all Kazakh crude that reaches Novorossiysk sails through the Straits. No
# Russia wildcard: BACI has no port-of-loading field, so a RUS-wide share
# cannot distinguish Black Sea cargo (which transits) from Baltic cargo
# (Danish Straits) or Pacific/ESPO cargo out of Kozmino (neither) - and the
# port mix is itself moving month to month in 2026 (Ukrainian strikes on
# Primorsk/Ust-Luga and the Novorossiysk/CPC terminal cluster).
TURKISH_STRAITS = [
    _row(
        "turkish_straits",
        "chokepoint",
        "KAZ",
        None,
        0.80,
        SRC_IEA_PIPELINE,
        EIA_CASPIAN,
        "EIA: 'The CPC carries about 80% of Kazakhstan's crude oil export' (the same figure "
        "and citation as the shipped `cpc` row); essentially all of that Novorossiysk-loaded "
        "crude then transits the Turkish Straits, since the Black Sea has no other sea exit. "
        "Turkey's Izmit (Marmara) refinery transits only the Bosporus, while EIA's own series "
        "is labelled 'Turkish Straits (Dardanelles)' - a nuance this share does not attempt "
        "to resolve. Caveat (2026-09-20): a part of Kazakhstan's crude to inland Europe moves "
        "overland instead - KEBCO to Germany's PCK Schwedt runs Uzen-Atyrau-Samara into "
        "Druzhba, never touching a tanker. That flow began only in February 2023 and runs "
        "~1.0-1.5 Mt/y against BACI's 3.1 Mt (2023) and 4.3 Mt (2024) of KAZ->DEU crude, so "
        "the majority still arrives seaborne or via TAL from Trieste on CPC blend that does "
        "transit the Straits. This wildcard therefore overstates Germany 2023-24 by roughly "
        "a third; zeroing the pair was tried and rejected, because it understated every "
        "pre-2023 year by the full 2.0-2.7 Mt.",
    ),
    _row(
        "turkish_straits",
        "chokepoint",
        "KAZ",
        "BGR",
        0.00,
        SRC_IEA_PIPELINE,
        EIA_CASPIAN,
        "Structural: Bulgaria (Burgas/Lukoil Neftochim) is a Black Sea importer and never "
        "sees the Turkish Straits.",
    ),
    _row(
        "turkish_straits",
        "chokepoint",
        "KAZ",
        "ROU",
        0.00,
        SRC_IEA_PIPELINE,
        EIA_CASPIAN,
        "Structural: Romania (Constanta) is a Black Sea importer and never sees the Turkish "
        "Straits.",
    ),
    _row(
        "turkish_straits",
        "chokepoint",
        "KAZ",
        "CHN",
        0.00,
        SRC_IEA_PIPELINE,
        EIA_CASPIAN,
        "Structural: Kazakh crude to China moves by the Kazakhstan-China pipeline "
        "(Atasu-Alashankou), not by sea, so it never reaches Novorossiysk or the Straits.",
    ),
    _row(
        "turkish_straits",
        "chokepoint",
        "KAZ",
        "UZB",
        0.00,
        SRC_IEA_PIPELINE,
        None,
        "UNSOURCED (structural): Uzbekistan is landlocked and borders Kazakhstan directly; "
        "no document was found describing Kazakh crude to Uzbekistan moving by any route "
        "other than overland (pipeline/rail) via Central Asia's own network. BACI 2024 "
        "KAZ->UZB is a small volume (~0.06 Mt) consistent with a regional overland trade, "
        "not seaborne CPC-blend crude that would need to reach a Black Sea tanker first.",
    ),
    _row(
        "turkish_straits",
        "chokepoint",
        "KAZ",
        "KGZ",
        0.00,
        SRC_IEA_PIPELINE,
        None,
        "UNSOURCED (structural): Kyrgyzstan is landlocked and borders Kazakhstan directly; "
        "the same reasoning as Uzbekistan applies, and BACI 2024 KAZ->KGZ is negligible "
        "(well under 1,000 tonnes) - consistent with overland regional trade, not seaborne "
        "crude that would need to reach a Black Sea tanker first.",
    ),
]

# ── Keystone (Canada -> USA) ──────────────────────────────────────────────────
KEYSTONE = [
    _row(
        "keystone",
        "pipeline",
        "CAN",
        "USA",
        0.14,
        SRC_IEA_PIPELINE,
        CER_PIPELINE_SYSTEM,
        "CER: 'The Keystone Pipeline...transports about 14% of western Canadian crude oil "
        "exports.' Corroborated: CAPP ('Canadian Oil and Gas Export Infrastructure', Feb "
        "2026) gives South Bow Keystone US exports at 579 kb/d (2025 Jan-Sep average) against "
        "BACI CAN->USA 2024 = 4,124 kb/d -> 579 / 4,124 = 0.14.",
    ),
]

# ── Enbridge Mainline (Canada -> USA) ────────────────────────────────────────
ENBRIDGE_MAINLINE = [
    _row(
        "enbridge_mainline",
        "pipeline",
        "CAN",
        "USA",
        0.60,
        SRC_IEA_PIPELINE,
        CER_PIPELINE_SYSTEM,
        "CER: 'The Enbridge Canadian Mainline...transports about 58% of all Canadian crude "
        "oil exports' (i.e. of all Canadian crude exports, not just to the US). Converted to "
        "a CAN->USA basis using the CER's own 2020 vintage: BACI CAN total 2020 = 181.71 Mt "
        "vs CAN->USA 2020 = 175.03 Mt, so 0.58 x (181.71 / 175.03) = 0.602, rounded to 0.60. "
        "CAPP's 3,062 kb/d 'U.S. Exports, Eastern Canada' figure is not usable as a numerator "
        "here: it is crude+NGL ex-Gretna including deliveries that stay in Eastern Canada, "
        "and CAPP's own table total (4,745 kb/d) exceeds all Canadian crude exports in BACI.",
    ),
]

# ── ESPO Skovorodino-Mohe spur (Russia -> China, direct pipeline only) ───────
# The Kozmino seaborne leg is deliberately excluded: ESPO Blend loaded there
# is sold FOB to Asian buyers generally (Argus: China lifts 65-80% of monthly
# Kozmino volumes) and cannot be separated in BACI from Urals/other Russian
# crude reaching China by long-haul tanker since 2022. See the sourceGap on
# this scenario in registry.ts for the same caveat.
ESPO_SPUR = [
    _row(
        "espo_spur",
        "pipeline",
        "RUS",
        "CHN",
        0.28,
        SRC_IEA_PIPELINE,
        DOWNS_USCC_2019,
        "Downs (USCC, 2019): the ESPO trunk has 'a capacity of 1.2 million barrels per day of "
        "which around 630,000 bpd go to Kozmino', leaving ~570 kb/d for the Skovorodino-Mohe "
        "spur to Daqing; GEM P5174 gives the spur 602 kb/d. 602 / 2,180 kb/d (BACI RUS->CHN "
        "2024) = 0.28. Design capacity, not metered flow. Kozmino seaborne ESPO Blend is "
        "deliberately excluded: it is sold FOB to Asian buyers generally and cannot be "
        "separated in BACI from Urals crude reaching China by long-haul tanker.",
    ),
]


def all_rows() -> list[dict]:
    rows = (
        HORMUZ
        + HORMUZ_LNG
        + INTRA_GULF
        + DRUZHBA
        + BTC
        + CPC
        + MALACCA
        + MALACCA_LNG
        + SUEZ
        + SUEZ_LNG
        + BAB_EL_MANDEB
        + BAB_EL_MANDEB_LNG
        + TURKISH_STRAITS
        + KEYSTONE
        + ENBRIDGE_MAINLINE
        + ESPO_SPUR
    )
    # Blocking fix (verifier RV): the region-expansion loops above must never
    # emit two rows for the same (disruption_id, exporter, importer) key - the
    # M1/M2 collision the chokepoints verification caught, where a Map-based
    # engine lookup would silently let the last-written row win.
    seen: set[tuple[str, str, str | None]] = set()
    for r in rows:
        key = (r["disruption_id"], r["exporter_iso3"], r["importer_iso3"])
        if key in seen:
            raise ValueError(f"duplicate disruption_route key: {key}")
        seen.add(key)
        # S5 review finding 5: a share outside [0, 1] is nonsense on its own
        # (a route cannot carry 140% of a flow), and it used to break the
        # combined-scenario range in the browser - combineShares returned
        # lower = 1.4 above upper = min(1, 1.4) = 1, an inverted "range" the
        # panel would have printed as fact. The engine now clamps defensively;
        # this asserts the data never needs it.
        share = r["share"]
        if not (0.0 <= float(share) <= 1.0):
            raise ValueError(f"share out of range for {key}: {share}")
    return rows


def main() -> None:
    df = pd.DataFrame(all_rows())
    df["source_year"] = df["source_year"].astype("int32")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    pq.write_table(
        pa.Table.from_pandas(df, preserve_index=False),
        OUT,
        compression="zstd",
    )
    counts = df.groupby("disruption_id").size().to_dict()
    n_unsourced = int((df["source_title"] == UNSOURCED).sum())
    print(f"wrote {OUT} rows={len(df)} per-scenario={counts} unsourced={n_unsourced}")


if __name__ == "__main__":
    main()
