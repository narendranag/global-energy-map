"""Generate public/data/catalog.json from a small hand-written registry.

The catalog is the source of truth for the /about page and pipeline metadata.
It is GENERATED — never hand-edit catalog.json; edit REGISTRY below and re-run:

    uv run python -m scripts.transform.build_catalog

Run it last, after every other transform, because it records the size and
sha256 of each shipped file (tests/python/test_data_integrity.py checks them).

Hand-written fields per entry (REGISTRY):
    id, label, path, format, source_name, source_url, license, as_of, layers,
    attribution (optional), runtime (default True — False for artefacts shipped
    for reproducibility that no layer or scenario reads),
    redistributable (licence policy: True only for CC BY 4.0, public-domain,
    Etalab Open Licence 2.0 (BACI, Phase 10) and project-derived rows),
    download_note (one-line reason, for entries that are not redistributable)

Computed fields per entry:
    bytes, sha256   of the file at ``path``
    rows            rows this entry contributes: the whole file, or the subset
                    selected by the registry's ``subset`` filter when several
                    sources share one file (assets.parquet, pipelines.geojson)
    downloadable    the file at ``path`` may be offered as-is on /data: every
                    entry sharing the file is redistributable (assets.parquet is
                    not, because of its 88 ODbL OpenStreetMap refinery rows)
    download_note   why a non-downloadable entry is view-only

It also writes ``src/lib/export/citations.generated.json`` (site citation from
CITATION.cff + scenario route-share citations from disruption_route.parquet),
which /methodology, /data and the Share menu import — see ``build_citations``.

``generated_at`` is deterministic so that rebuilding unchanged inputs leaves
catalog.json byte-identical (``scripts.build_all`` run twice → clean git tree):
it is the newest ``as_of`` in the registry (the date of the most recent source
snapshot the catalog describes), as midnight UTC. It is NOT the wall-clock
build time and NOT a file mtime (mtimes change on every rebuild and checkout).

``as_of`` rule: always ``YYYY-MM-DD``. The date is the source's own release /
as-of date when it publishes one; a source that only gives a month uses the
first of that month; unversioned live services (NETL ArcGIS, OSM Overpass)
use the retrieval date of the snapshot in data/raw/.
"""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any

import pandas as pd
import pyarrow.parquet as pq

from scripts.common import sources as pins

PUBLIC = Path("public")
OUT = PUBLIC / "data" / "catalog.json"
CATALOG_VERSION = 6

GEM_ATTRIBUTION = "Data: Global Energy Monitor, CC BY 4.0"
LNG_T3_ATTRIBUTION = "Data: Zhou, C. 2026, LNG-T3 (Zenodo 10.5281/zenodo.19571058), CC BY 4.0"
NETL_SOURCE_NAME = "National Energy Technology Laboratory (US DOE)"
NETL_LICENSE = "US Government work, public domain (17 USC §105)"
# NETL's EDX listing of GOGI names a Creative Commons Attribution licence, so
# credit NETL wherever its rows are shown (see LICENSE-DATA.md).
NETL_ATTRIBUTION = "Data: NETL Global Oil & Gas Infrastructure (GOGI), US DOE"
NETL_GOGI_URL = pins.NETL.landing_url
NETL_SNAPSHOT = pins.NETL.as_of
LNG_T3_URL = pins.LNG_T3.landing_url
LNG_T3_SOURCE = pins.LNG_T3.name
LICENSE_DATA_URL = "https://github.com/narendranag/global-energy-map/blob/main/LICENSE-DATA.md"

# Files that are view-only as-is but have a downloadable open subset
# (written by scripts.transform.build_assets_open): mixed path → open file name.
OPEN_EXTRACTS: dict[str, str] = {"/data/assets.parquet": "assets_open.parquet"}

REGISTRY: list[dict[str, Any]] = [
    {
        "id": "ei_country_year",
        "label": "Country-year reserves + production",
        "path": "/data/country_year_series.parquet",
        "format": "parquet",
        "source_name": "Energy Institute Statistical Review of World Energy",
        "source_url": pins.EI.landing_url,
        "license": "Free to quote with attribution; extensive reproduction needs EI permission",
        "as_of": pins.EI.as_of,
        "layers": ["reserves", "reserves:gas", "production"],
        "redistributable": False,
        "download_note": (
            "The Energy Institute asks for permission before extensive reproduction "
            "of its tables, so the series is shown in the app, not offered for "
            "download; get it from the Energy Institute."
        ),
        "attribution": f"Data: {pins.EI.name} {pins.EI.release}",
    },
    {
        "id": "gem_extraction",
        "label": "Oil & gas extraction sites (GEM)",
        "path": "/data/assets.parquet",
        "subset": {"kind": ["extraction_site"]},
        "format": "parquet",
        "source_name": "Global Energy Monitor",
        "source_url": pins.GEM_GOGET.landing_url,
        "license": "CC BY 4.0",
        "as_of": pins.GEM_GOGET.as_of,
        "layers": ["extraction"],
        "redistributable": True,
        "attribution": GEM_ATTRIBUTION,
    },
    {
        "id": "netl_refineries",
        "label": "Oil refineries (NETL GOGI, primary)",
        "path": "/data/assets.parquet",
        "subset": {
            "kind": ["refinery"],
            "source": ["National Energy Technology Laboratory (US DOE) — GOGI Refineries"],
        },
        "format": "parquet",
        "source_name": NETL_SOURCE_NAME,
        "source_url": "https://prod.arcgis.netl.doe.gov/server/rest/services/Hosted/Refineries/FeatureServer",
        "license": NETL_LICENSE,
        "as_of": NETL_SNAPSHOT,
        "layers": ["refineries"],
        "redistributable": True,
        "attribution": NETL_ATTRIBUTION,
    },
    {
        "id": "osm_refineries",
        "label": "Oil refineries (OpenStreetMap, supplement to NETL)",
        "path": "/data/assets.parquet",
        "subset": {"kind": ["refinery"], "source": ["OpenStreetMap (Overpass)"]},
        "format": "parquet",
        "source_name": "OpenStreetMap",
        "source_url": pins.OSM.landing_url,
        "license": "ODbL (Open Database License)",
        "as_of": pins.OSM.as_of,
        "layers": ["refineries"],
        "redistributable": False,
        "download_note": (
            "ODbL (share-alike) rows; downloads are limited to CC BY 4.0 and public-domain "
            "sources, so these rows are left out of assets_open.parquet (the NETL refinery "
            "rows are in it)."
        ),
        "attribution": "© OpenStreetMap contributors, ODbL",
    },
    {
        "id": "netl_storage",
        "label": "Oil & gas storage (NETL GOGI)",
        "path": "/data/assets.parquet",
        "subset": {"kind": ["storage"]},
        "format": "parquet",
        "source_name": NETL_SOURCE_NAME,
        "source_url": NETL_GOGI_URL,
        "license": NETL_LICENSE,
        "as_of": NETL_SNAPSHOT,
        "layers": ["storage"],
        "redistributable": True,
        "attribution": NETL_ATTRIBUTION,
    },
    {
        "id": "netl_ports",
        "label": "Oil & gas ports (NETL GOGI)",
        "path": "/data/assets.parquet",
        "subset": {"kind": ["port"]},
        "format": "parquet",
        "source_name": NETL_SOURCE_NAME,
        "source_url": NETL_GOGI_URL,
        "license": NETL_LICENSE,
        "as_of": NETL_SNAPSHOT,
        "layers": ["ports"],
        "redistributable": True,
        "attribution": NETL_ATTRIBUTION,
    },
    {
        "id": "lng_t3_terminals",
        "label": "LNG terminals (LNG-T3, primary)",
        "path": "/data/assets.parquet",
        "subset": {
            "kind": ["lng_export", "lng_import"],
            "source": ["Zhou, C. 2026, LNG-T3 (Zenodo 10.5281/zenodo.19571058)"],
        },
        "format": "parquet",
        "source_name": LNG_T3_SOURCE,
        "source_url": LNG_T3_URL,
        "license": "CC BY 4.0",
        "as_of": pins.LNG_T3.as_of,
        "layers": ["lng_terminals"],
        "redistributable": True,
        "attribution": LNG_T3_ATTRIBUTION,
    },
    {
        "id": "gem_lng_terminals",
        "label": "LNG terminals (GEM GGIT, supplement to LNG-T3)",
        "path": "/data/assets.parquet",
        "subset": {
            "kind": ["lng_export", "lng_import"],
            "source": ["Global Energy Monitor — Global Gas Infrastructure Tracker"],
        },
        "format": "parquet",
        "source_name": "Global Energy Monitor",
        "source_url": pins.GEM_GGIT.landing_url,
        "license": "CC BY 4.0",
        "as_of": pins.GEM_GGIT.as_of,
        "layers": ["lng_terminals"],
        "redistributable": True,
        "attribution": GEM_ATTRIBUTION,
    },
    {
        # Written by scripts.transform.build_assets_open: assets.parquet minus
        # the OpenStreetMap (ODbL) rows, so the CC BY / public-domain asset
        # rows can be downloaded in one file. Not read by the map.
        "id": "assets_open",
        "label": "Asset table, open subset (every assets.parquet row except OpenStreetMap)",
        "path": "/data/assets_open.parquet",
        "format": "parquet",
        "source_name": "Global Energy Monitor, LNG-T3 and NETL — see the source column",
        "source_url": LICENSE_DATA_URL,
        "license": "CC BY 4.0 (GEM, LNG-T3) + public domain (NETL); attribution required",
        "as_of": max(pins.GEM_GOGET.as_of, pins.GEM_GGIT.as_of, pins.LNG_T3.as_of, NETL_SNAPSHOT),
        "layers": [],
        "redistributable": True,
        "runtime": False,
    },
    {
        "id": "gem_oil_pipelines",
        "label": "Crude/NGL pipelines (GEM GOIT; simplified GeoJSON)",
        "path": "/data/pipelines.geojson",
        "subset": {"commodity": ["crude", "ngl", "crude+ngl"]},
        "format": "json",
        "source_name": "Global Energy Monitor",
        "source_url": pins.GEM_GOIT.landing_url,
        "license": "CC BY 4.0",
        "as_of": pins.GEM_GOIT.as_of,
        "layers": ["pipelines"],
        "redistributable": True,
        "attribution": GEM_ATTRIBUTION,
    },
    {
        "id": "gem_gas_pipelines",
        "label": "Gas pipelines (GEM GGIT; simplified GeoJSON)",
        "path": "/data/pipelines.geojson",
        "subset": {"commodity": ["gas"]},
        "format": "json",
        "source_name": "Global Energy Monitor",
        "source_url": pins.GEM_GGIT.landing_url,
        "license": "CC BY 4.0",
        "as_of": pins.GEM_GGIT.as_of,
        "layers": ["gas_pipelines"],
        "redistributable": True,
        "attribution": GEM_ATTRIBUTION,
    },
    {
        "id": "netl_basins",
        "label": "Oil & gas basins (NETL GOGI; simplified GeoJSON)",
        "path": "/data/basins.geojson",
        "format": "json",
        "source_name": NETL_SOURCE_NAME,
        "source_url": NETL_GOGI_URL,
        "license": NETL_LICENSE,
        "as_of": NETL_SNAPSHOT,
        "layers": ["basins"],
        "redistributable": True,
        "attribution": NETL_ATTRIBUTION,
    },
    {
        "id": "baci_2709",
        "label": "Crude oil + LNG bilateral trade (HS 2709 + 271111)",
        "path": "/data/trade_flow.parquet",
        "format": "parquet",
        "source_name": "BACI (CEPII)",
        "source_url": pins.BACI.landing_url,
        "license": "Etalab Open Licence 2.0; cite Gaulier & Zignago (2010)",
        "as_of": pins.BACI.as_of,
        "layers": [
            "trade",
            "scenario:hormuz",
            "scenario:hormuz-lng",
            "scenario:druzhba",
            "scenario:btc",
            "scenario:cpc",
        ],
        # Etalab Open Licence 2.0 permits redistribution with attribution;
        # made downloadable 2026-09-10 (user decision, Phase 10).
        "redistributable": True,
        "attribution": (
            f"Data: CEPII BACI (release {pins.BACI.release}); cite Gaulier & Zignago (2010)"
        ),
    },
    {
        "id": "disruption_route",
        "label": "Disruption routing shares (chokepoints + pipelines; per-row citations)",
        "path": "/data/disruption_route.parquet",
        "format": "parquet",
        "source_name": "EIA / IEA / Argus Media (Kpler) / GEM — see source_* columns",
        "source_url": "https://www.iea.org/about/oil-security-and-emergency-response/strait-of-hormuz",
        "license": "Hand-set shares derived from public reports; per-row citations",
        "as_of": "2026-09-10",
        "layers": [
            "scenario:hormuz",
            "scenario:hormuz-lng",
            "scenario:druzhba",
            "scenario:btc",
            "scenario:cpc",
        ],
        "redistributable": True,
    },
    {
        "id": "natural_earth_countries",
        "label": "Country geometries (1:110m admin-0)",
        "path": "/data/countries.geojson",
        "format": "json",
        "source_name": "Natural Earth",
        "source_url": pins.NATURAL_EARTH.landing_url,
        "license": "Public domain",
        "as_of": pins.NATURAL_EARTH.as_of,
        "layers": ["basemap", "reserves"],
        "redistributable": True,
    },
    {
        "id": "lng_t3_voyages",
        "label": "LNG carrier voyages (LNG-T3)",
        "path": "/data/lng_voyage.parquet",
        "format": "parquet",
        "source_name": LNG_T3_SOURCE,
        "source_url": LNG_T3_URL,
        "license": "CC BY 4.0",
        "as_of": pins.LNG_T3.as_of,
        "layers": ["lng_voyages", "scenario:hormuz-lng"],
        "redistributable": True,
        "attribution": LNG_T3_ATTRIBUTION,
    },
    {
        "id": "lng_t3_trade_daily",
        "label": "LNG trade-daily arrivals/departures (LNG-T3) — reproducibility artefact",
        "path": "/data/lng_trade_daily.parquet",
        "format": "parquet",
        "source_name": LNG_T3_SOURCE,
        "source_url": LNG_T3_URL,
        "license": "CC BY 4.0",
        "as_of": pins.LNG_T3.as_of,
        "layers": [],
        "redistributable": True,
        "attribution": LNG_T3_ATTRIBUTION,
        "runtime": False,
    },
    {
        "id": "lng_t3_terminal_daily",
        "label": "LNG terminal-daily throughput (LNG-T3) — reproducibility artefact",
        "path": "/data/lng_terminal_daily.parquet",
        "format": "parquet",
        "source_name": LNG_T3_SOURCE,
        "source_url": LNG_T3_URL,
        "license": "CC BY 4.0",
        "as_of": pins.LNG_T3.as_of,
        "layers": [],
        "redistributable": True,
        "attribution": LNG_T3_ATTRIBUTION,
        "runtime": False,
    },
]

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_FIELD_ORDER = [
    "id",
    "label",
    "path",
    "format",
    "source_name",
    "source_url",
    "license",
    "as_of",
    "layers",
    "attribution",
    "runtime",
    "redistributable",
    "downloadable",
    "download_note",
    "rows",
    "bytes",
    "sha256",
]


def _disk_path(catalog_path: str, public: Path = PUBLIC) -> Path:
    return public / catalog_path.lstrip("/")


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _count_rows(path: Path, subset: dict[str, list[str]] | None) -> int:
    if path.suffix == ".parquet":
        if not subset:
            return int(pq.ParquetFile(path).metadata.num_rows)
        df = pd.read_parquet(path, columns=list(subset))
        mask = pd.Series(True, index=df.index)
        for col, values in subset.items():
            mask &= df[col].isin(values)
        return int(mask.sum())
    if path.suffix in (".geojson", ".json"):
        with open(path) as fh:
            feats = json.load(fh)["features"]
        if not subset:
            return len(feats)
        return sum(
            1
            for f in feats
            if all((f.get("properties") or {}).get(c) in v for c, v in subset.items())
        )
    raise ValueError(f"don't know how to count rows in {path}")


def _download_flags(
    registry: list[dict[str, Any]],
    open_extracts: dict[str, str] | None = None,
) -> dict[str, tuple[bool, str | None]]:
    """``id → (downloadable, download_note)``.

    A file is offered as-is only when EVERY entry sharing its ``path`` is
    redistributable; one ODbL / restricted subset makes the whole file
    view-only. The note is the entry's own reason, or — for a redistributable
    subset of a mixed file — which co-tenant blocks the download and, when
    *open_extracts* maps the file to a downloadable open subset, where the
    rows can be downloaded instead.
    """
    open_extracts = OPEN_EXTRACTS if open_extracts is None else open_extracts
    by_path: dict[str, list[dict[str, Any]]] = {}
    for spec in registry:
        by_path.setdefault(spec["path"], []).append(spec)
    flags: dict[str, tuple[bool, str | None]] = {}
    for spec in registry:
        tenants = by_path[spec["path"]]
        blockers = [t for t in tenants if not t.get("redistributable", False)]
        if not blockers:
            flags[spec["id"]] = (True, None)
        elif not spec.get("redistributable", False):
            flags[spec["id"]] = (False, spec.get("download_note") or "Not offered for download.")
        else:
            file = spec["path"].rsplit("/", 1)[-1]
            parts = {
                f"{b.get('source_name', b['label'])} rows under {b['license']}" for b in blockers
            }
            names = "; ".join(sorted(parts))
            blocked_layers = {tag for b in blockers for tag in b.get("layers", [])}
            same_layer = any(tag in blocked_layers for tag in spec.get("layers", []))
            advice = (
                f"The {', '.join(spec['layers'])} layer includes those rows too, "
                "so it is view-only."
                if same_layer
                else "Export this layer's rows from the map's Share / cite menu instead."
            )
            open_file = open_extracts.get(spec["path"])
            if open_file:
                advice = f"These rows are in {open_file}, which is downloadable." + (
                    f" {advice}" if same_layer else ""
                )
            flags[spec["id"]] = (
                False,
                f"{file} also contains {names}, so the file is not offered as-is. {advice}",
            )
    return flags


def build_catalog(public: Path = PUBLIC) -> dict[str, Any]:
    ids = [e["id"] for e in REGISTRY]
    if len(ids) != len(set(ids)):
        raise ValueError("duplicate catalog ids")
    flags = _download_flags(REGISTRY)
    entries = []
    for spec in REGISTRY:
        if not _DATE_RE.match(spec["as_of"]):
            raise ValueError(f"{spec['id']}: as_of must be YYYY-MM-DD, got {spec['as_of']!r}")
        path = _disk_path(spec["path"], public)
        if not path.exists():
            raise FileNotFoundError(f"{spec['id']}: {path} does not exist")
        entry = {k: v for k, v in spec.items() if k not in ("subset", "download_note")}
        entry.setdefault("runtime", True)
        entry["redistributable"] = bool(spec.get("redistributable", False))
        downloadable, note = flags[spec["id"]]
        entry["downloadable"] = downloadable
        if note is not None:
            entry["download_note"] = note
        entry["rows"] = _count_rows(path, spec.get("subset"))
        entry["bytes"] = path.stat().st_size
        entry["sha256"] = _sha256(path)
        entries.append({k: entry[k] for k in _FIELD_ORDER if k in entry})
    newest = max(e["as_of"] for e in REGISTRY)
    return {
        "version": CATALOG_VERSION,
        "generated_at": f"{newest}T00:00:00+00:00",
        "entries": entries,
    }


# ── citations sidecar (CITATION.cff + disruption_route.parquet) ─────────────
#
# The /methodology page, the /data page and the map's Share menu cite the site
# (APA/BibTeX) and the scenario route shares. Both come from files the browser
# cannot parse cheaply (YAML, Parquet), so this step writes them to a small
# JSON module the app imports at build time. It is build input for the app,
# not a shipped data file, so it lives under src/ and is not catalogued;
# tests/python/test_build_catalog.py fails if it drifts from its sources.

CITATION_CFF = Path("CITATION.cff")
CITATIONS_OUT = Path("src/lib/export/citations.generated.json")
DISRUPTION_ROUTE = PUBLIC / "data" / "disruption_route.parquet"
_CFF_SCALARS = ("title", "version", "date-released", "url", "repository-code", "license", "doi")


def _unquote(value: str) -> str:
    v = value.strip()
    if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
        return v[1:-1]
    return v


def parse_cff(text: str) -> dict[str, Any]:
    """The top-level scalars and ``authors`` of a CITATION.cff.

    A deliberately small parser for the subset of YAML CFF files use at the
    top level (``key: value`` scalars and an ``authors:`` list of mappings) —
    the project has no YAML dependency. Nested blocks other than ``authors``
    (``references``, folded ``abstract``) are skipped.
    """
    out: dict[str, Any] = {}
    authors: list[dict[str, str]] = []
    section: str | None = None
    for raw in text.splitlines():
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        if not raw[0].isspace():
            key, _, value = raw.partition(":")
            section = key.strip()
            value = value.strip()
            if section in _CFF_SCALARS and value and value not in (">", ">-", "|", "|-"):
                out[section] = _unquote(value)
            continue
        if section != "authors":
            continue
        line = raw.strip()
        if line.startswith("- "):
            authors.append({})
            line = line[2:].strip()
        if not authors or ":" not in line:
            continue
        k, _, v = line.partition(":")
        authors[-1][k.strip()] = _unquote(v)
    out["authors"] = [
        {k: a[k] for k in ("family-names", "given-names", "name", "orcid") if k in a and a[k]}
        for a in authors
    ]
    missing = [k for k in ("title", "version", "date-released", "url") if k not in out]
    if missing or not out["authors"]:
        raise ValueError(f"CITATION.cff is missing {missing or ['authors']}")
    return out


def scenario_share_rows(path: Path = DISRUPTION_ROUTE) -> list[dict[str, Any]]:
    """disruption_route.parquet as JSON-safe rows, in file order."""
    df = pd.read_parquet(path)

    def text(v: Any) -> str | None:
        return None if v is None or pd.isna(v) or str(v).strip() == "" else str(v)

    return [
        {
            "disruption_id": str(r.disruption_id),
            "kind": str(r.kind),
            "exporter_iso3": str(r.exporter_iso3),
            "importer_iso3": text(r.importer_iso3),
            "share": float(r.share),
            "source_title": str(r.source_title),
            "source_url": text(r.source_url),
            "source_year": int(r.source_year),
            "source_note": text(r.source_note),
        }
        for r in df.itertuples(index=False)
    ]


def build_citations(cff: Path = CITATION_CFF, routes: Path = DISRUPTION_ROUTE) -> dict[str, Any]:
    return {
        "_generated_by": "scripts/transform/build_catalog.py — do not edit",
        "site": parse_cff(cff.read_text()),
        "scenario_shares": scenario_share_rows(routes),
    }


def main() -> None:
    catalog = build_catalog()
    OUT.write_text(json.dumps(catalog, indent=2, ensure_ascii=False) + "\n")
    print(f"wrote {OUT}  entries={len(catalog['entries'])}")
    for e in catalog["entries"]:
        dl = "download" if e["downloadable"] else "view-only"
        print(f"  {e['id']:<26} rows={e['rows']:>7}  bytes={e['bytes']:>10}  {dl:<9}  {e['path']}")
    citations = build_citations()
    CITATIONS_OUT.parent.mkdir(parents=True, exist_ok=True)
    CITATIONS_OUT.write_text(json.dumps(citations, indent=2, ensure_ascii=False) + "\n")
    print(f"wrote {CITATIONS_OUT}  scenario_shares={len(citations['scenario_shares'])}")


if __name__ == "__main__":
    main()
