"""Pinned upstream sources — one place for every URL, release and snapshot date.

Every ingest downloads from, and every transform stamps ``source_version`` /
catalog ``as_of`` with, the values below. To move to a new upstream release,
edit the pin here (and nowhere else), re-run the ingest for that source, then
``uv run python -m scripts.build_all``. The runbook is ``docs/refresh.md``.

A pin is documentation as much as configuration: ``cadence`` says when the
publisher usually releases, ``terms_url`` where its licence lives (summarised
in ``LICENSE-DATA.md``). Nothing here touches the network at import time.

Naming: ``release`` is the publisher's own label for the version we use (or
the retrieval date for unversioned live services such as NETL's ArcGIS layers
and OpenStreetMap's Overpass API); ``as_of`` is that release's date as
``YYYY-MM-DD`` (first of the month when only a month is published), which
``scripts/transform/build_catalog.py`` copies into ``catalog.json``.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path


@dataclass(frozen=True)
class SourcePin:
    key: str
    name: str
    release: str
    as_of: str
    licence: str
    landing_url: str
    terms_url: str
    cadence: str
    raw_dir: Path
    ingest: str  # module under scripts.ingest that fetches it ("" = no ingest)
    download_url: str = ""
    dest_filename: str = ""
    extra: dict[str, str] = field(default_factory=dict)


# ── Energy Institute Statistical Review of World Energy ────────────────────
EI = SourcePin(
    key="ei",
    name="Energy Institute Statistical Review of World Energy",
    release="2025",  # 74th edition
    as_of="2025-06-26",
    licence="Free to use and quote with attribution; extensive reproduction needs EI permission",
    landing_url="https://www.energyinst.org/statistical-review/resources-and-data-downloads",
    terms_url="https://www.energyinst.org/statistical-review/about",
    cadence="annual, late June",
    raw_dir=Path("data/raw/ei_statistical_review"),
    ingest="ei_statistical_review",
    download_url=(
        "https://www.energyinst.org/__data/assets/excel_doc/0008/1656215/"
        "EI-Stats-Review-ALL-data.xlsx"
    ),
    dest_filename="EI-Stats-Review-ALL-data.xlsx",
)

# ── CEPII BACI (HS92) ───────────────────────────────────────────────────────
BACI = SourcePin(
    key="baci",
    name="BACI (CEPII)",
    release="V202601",
    as_of="2026-01-01",
    licence="Etalab Open Licence 2.0; cite Gaulier & Zignago (2010)",
    landing_url="https://www.cepii.fr/CEPII/en/bdd_modele/bdd_modele_item.asp?id=37",
    terms_url="https://www.etalab.gouv.fr/wp-content/uploads/2018/11/open-licence.pdf",
    cadence="annual, January–February",
    raw_dir=Path("data/raw/baci"),
    ingest="baci",
    download_url="https://www.cepii.fr/DATA_DOWNLOAD/baci/data/BACI_HS92_V202601.zip",
)

# ── Global Energy Monitor trackers ──────────────────────────────────────────
GEM_TERMS = "https://globalenergymonitor.org/creative-commons-public-license/"

GEM_GOGET = SourcePin(
    key="gem_goget",
    name="Global Energy Monitor — Global Oil and Gas Extraction Tracker",
    release="July 2023",
    as_of="2023-07-01",
    licence="CC BY 4.0",
    landing_url="https://globalenergymonitor.org/projects/global-oil-gas-extraction-tracker/",
    terms_url=GEM_TERMS,
    cadence="per tracker release (irregular, roughly annual)",
    raw_dir=Path("data/raw/gem_extraction"),
    ingest="gem_extraction",
    # The live download is behind GEM's email form; the pinned Wayback capture
    # is the public copy. ``original_url`` is the CDX fallback target.
    download_url=(
        "https://web.archive.org/web/20240321185306/"
        "https://globalenergymonitor.org/wp-content/uploads/2023/08/"
        "Global-Oil-and-Gas-Extraction-Tracker-July-2023.xlsx"
    ),
    dest_filename="Global-Oil-and-Gas-Extraction-Tracker-July-2023.xlsx",
    extra={
        "original_url": (
            "https://globalenergymonitor.org/wp-content/uploads/2023/08/"
            "Global-Oil-and-Gas-Extraction-Tracker-July-2023.xlsx"
        ),
    },
)

GEM_GOIT = SourcePin(
    key="gem_goit",
    name="Global Energy Monitor — Global Oil Infrastructure Tracker",
    release="2025-04-09",
    as_of="2025-04-09",
    licence="CC BY 4.0",
    landing_url="https://globalenergymonitor.org/projects/global-oil-infrastructure-tracker/",
    terms_url=GEM_TERMS,
    cadence="per tracker release (irregular, roughly annual)",
    raw_dir=Path("data/raw/gem_oil_infra"),
    ingest="gem_oil_infra",
    download_url=(
        "https://publicgemdata.nyc3.cdn.digitaloceanspaces.com/GOIT/2025-03/goit_2025-04-09.geojson"
    ),
    dest_filename="goit_2025-04-09.geojson",
)

GEM_GGIT = SourcePin(
    key="gem_ggit",
    name="Global Energy Monitor — Global Gas Infrastructure Tracker",
    release="2026-02-20",
    as_of="2026-02-20",
    licence="CC BY 4.0",
    landing_url="https://globalenergymonitor.org/projects/global-gas-infrastructure-tracker/",
    terms_url=GEM_TERMS,
    cadence="per tracker release (irregular, roughly annual)",
    raw_dir=Path("data/raw/gem_gas_infra"),
    ingest="gem_gas_infra",
    # Discovered from the tracker map config (the xlsx is form-gated):
    # https://globalenergymonitor.github.io/maps/trackers/ggit/config.js
    download_url=(
        "https://publicgemdata.nyc3.cdn.digitaloceanspaces.com/ggit/2026-03/ggit_map_2026-02-20.geojson"
    ),
    dest_filename="ggit_map_2026-02-20.geojson",
)

# ── LNG-T3 (Zhou, C. 2026, Zenodo) ───────────────────────────────────────
LNG_T3_RECORD_ID = "19571058"
LNG_T3 = SourcePin(
    key="lng_t3",
    name="Zhou, C. 2026, LNG-T3 (Zenodo)",
    # Our label for Zenodo record 19571058 (published 2026-04-01). Zenodo
    # shows it as the second version under concept DOI 10.5281/zenodo.17273526;
    # the label is stamped into source_version, so it stays as-is until the
    # next refresh.
    release="v1-2026-04-01",
    as_of="2026-04-01",
    licence="CC BY 4.0",
    landing_url=f"https://doi.org/10.5281/zenodo.{LNG_T3_RECORD_ID}",
    terms_url="https://creativecommons.org/licenses/by/4.0/",
    cadence="per Zenodo version (check the concept DOI for newer versions)",
    raw_dir=Path("data/raw/lng_t3") / "v1-2026-04-01",
    ingest="lng_t3",
    download_url=f"https://zenodo.org/api/records/{LNG_T3_RECORD_ID}/files-archive",
    extra={
        "record_id": LNG_T3_RECORD_ID,
        "concept_doi": "10.5281/zenodo.17273526",
        # md5 of each CSV in the pinned record (as listed by the Zenodo API);
        # docs/refresh.md shows how to compare after a re-download.
        "md5:LNG_terminal.csv": "c2f8b863261e94782cca9d05fad60edf",
        "md5:LNG_tanker.csv": "88a46edf6bd95aaeb0de7a9fef5b4bd4",
        "md5:LNG_tanker_voyage.csv": "eab322d7c3a2cb31b3894084b8b5e777",
        "md5:LNG_terminal_daily.csv": "911c6767fee2a7a6755dd2c6a235e5b7",
        "md5:LNG_trade_daily.csv": "0b261adb0f88555284c652385756b7a8",
    },
)

# ── NETL Global Oil & Gas Infrastructure (GOGI) ─────────────────────────────
NETL = SourcePin(
    key="netl",
    name="National Energy Technology Laboratory (US DOE) — GOGI",
    # Live, unversioned ArcGIS FeatureServer layers: the pin is the retrieval
    # date of the snapshot in data/raw/netl/ (a constant keeps rebuilds stable).
    release="2026-05-17",
    as_of="2026-05-17",
    licence="US Government work, public domain (17 USC §105); credit NETL",
    landing_url=(
        "https://arcgis.netl.doe.gov/portal/home/item.html?id=1e1c13b43dfb4af68040598c6f4baf44"
    ),
    terms_url=(
        "https://edx.netl.doe.gov/dataset/global-oil-gas-infrastructure-features-database-edx-spatial-webmap"
    ),
    cadence="ad hoc (NETL updates the live layers without release notes)",
    raw_dir=Path("data/raw/netl"),
    ingest="netl_gogi",
    download_url="https://prod.arcgis.netl.doe.gov/server/rest/services/Hosted",
)

# ── OpenStreetMap (Overpass) ────────────────────────────────────────────────
OSM = SourcePin(
    key="osm",
    name="OpenStreetMap",
    release="2026-05-15",  # Overpass retrieval date of data/raw/osm_refineries/
    as_of="2026-05-15",
    licence="ODbL 1.0 (share-alike)",
    landing_url="https://www.openstreetmap.org/",
    terms_url="https://www.openstreetmap.org/copyright",
    cadence="quarterly (live database; re-query when refreshing refineries)",
    raw_dir=Path("data/raw/osm_refineries"),
    ingest="osm_refineries",
    download_url="https://overpass-api.de/api/interpreter",
    extra={
        "fallback_1": "https://overpass.kumi.systems/api/interpreter",
        "fallback_2": "https://overpass.private.coffee/api/interpreter",
    },
)

# ── Natural Earth (static file, no ingest) ──────────────────────────────────
NATURAL_EARTH = SourcePin(
    key="natural_earth",
    name="Natural Earth",
    release="1:110m admin-0 countries",
    as_of="2024-10-01",
    licence="Public domain",
    landing_url=(
        "https://www.naturalearthdata.com/downloads/110m-cultural-vectors/110m-admin-0-countries/"
    ),
    terms_url="https://www.naturalearthdata.com/about/terms-of-use/",
    cadence="rarely (major Natural Earth releases)",
    raw_dir=Path("public/data"),
    ingest="",
)

ALL: tuple[SourcePin, ...] = (
    EI,
    BACI,
    GEM_GOGET,
    GEM_GOIT,
    GEM_GGIT,
    LNG_T3,
    NETL,
    OSM,
    NATURAL_EARTH,
)
