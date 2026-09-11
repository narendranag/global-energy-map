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


def all_rows() -> list[dict]:
    return HORMUZ + HORMUZ_LNG + INTRA_GULF + DRUZHBA + BTC + CPC


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
