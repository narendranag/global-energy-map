"""Fixture tests for the build_* transforms: tiny in-memory inputs → frames.

Each test feeds a handful of hand-made source rows through the transform's
pure ``build`` function, then through ``conform`` (what append_kind applies),
and checks schema, counts and the mapping decisions.
"""

from __future__ import annotations

from pathlib import Path

import geopandas as gpd
import pandas as pd
import pyarrow as pa
import pytest
from shapely.geometry import Point

from scripts.common.parquet import ASSETS_SCHEMA, REQUIRED, check_required, conform
from scripts.transform import build_assets, build_ports, build_refineries, build_storage


def _as_assets(df: pd.DataFrame) -> pd.DataFrame:
    out = conform(df, ASSETS_SCHEMA)
    check_required(out, REQUIRED["assets.parquet"], "fixture")
    # The frame must convert to the declared arrow schema without loss.
    pa.Table.from_pandas(out, schema=ASSETS_SCHEMA, preserve_index=False)
    return out


# ── build_assets (GEM extraction workbook) ──────────────────────────────────


@pytest.fixture
def gem_xlsx(tmp_path: Path) -> Path:
    df = pd.DataFrame(
        {
            "Unit ID": ["OG0000001", "OG0000002", "OG0000003", "OG0000004"],
            "Unit name": ["Ghawar", "Safaniya", "Nowhere", "Lost"],
            "Country": ["Saudi Arabia", "Saudi Arabia", "Atlantis", "Saudi Arabia"],
            "Latitude": [25.4, 28.0, 10.0, None],
            "Longitude": [49.6, 48.8, 10.0, 50.0],
            "Status": ["operating", None, "operating", "operating"],
            "Operator": ["Saudi Aramco", None, "X", "Y"],
            "Production start year": [1951, "1957/1958", None, 2000],
        }
    )
    path = tmp_path / "goget.xlsx"
    df.to_excel(path, sheet_name="Main data", index=False)
    return path


def test_build_assets_maps_gem_rows(gem_xlsx: Path):
    out = _as_assets(build_assets.build(gem_xlsx))
    # "Lost" has no latitude, "Nowhere" has an unmapped country.
    assert out["asset_id"].tolist() == ["OG0000001", "OG0000002"]
    assert set(out["kind"]) == {"extraction_site"}
    assert set(out["country_iso3"]) == {"SAU"}
    assert out["commissioned_year"].tolist() == [1951, 1957]
    assert (out["capacity_unit"] == "kboe/d").all()
    assert out["capacity"].isna().all()
    assert pd.isna(out.loc[1, "operator"])


# ── build_storage / build_ports (NETL point layers) ─────────────────────────


def _netl_points() -> gpd.GeoDataFrame:
    return gpd.GeoDataFrame(
        {
            "fid": [1, 2, 3, 4],
            "facility_n": ["Ras Tanura", None, "Somewhere", "Caracas Tank"],
            "md_country": [
                "Saudi Arabia",
                "Russian Federation;Kazakhstan",
                "Atlantis",
                "Venezuela, Bolivarian Republic of",
            ],
            "operator": ["Aramco", " ", "Z", None],
            "capacity": ["1,500", "", "NA", "200"],
            "status": ["NA", "operating", " ", "active"],
            "type": ["Saudi Arabia.kml/Saudi Arabia/Facilities/Terminals", " ", " ", "FRP"],
        },
        geometry=[Point(50.1, 26.6), Point(37.6, 55.7), Point(0, 0), Point(-66.9, 10.5)],
        crs="EPSG:4326",
    )


def test_build_storage_maps_netl_shape():
    out = _as_assets(build_storage.build(_netl_points()))
    assert out["asset_id"].tolist() == ["netl-storage-1", "netl-storage-2", "netl-storage-4"]
    assert out["country_iso3"].tolist() == ["SAU", "RUS", "VEN"]  # Atlantis dropped
    assert out["capacity"].tolist()[0] == 1500.0 and pd.isna(out["capacity"].tolist()[1])
    assert (out["capacity_unit"] == "bbl").all()
    assert pd.isna(out.loc[0, "status"]) and out.loc[1, "status"] == "operating"
    assert pd.isna(out.loc[1, "operator"])  # blank operator → null
    assert out.loc[1, "name"] == ""  # missing facility name stays a (non-null) string
    assert (out["source_version"] == build_storage.SOURCE_VERSION).all()


def test_build_storage_drops_epa_records_that_are_not_bulk_storage():
    # NETL's US storage layer is mostly EPA regulatory records: leaking-tank
    # cleanup sites, SPCC spill plans (any site over 1,320 gal), a state master
    # list and rail/truck/air transfer points. Only FRP (bulk, >= 1M gal) and
    # the EIA terminals are storage in the energy-system sense.
    names = [
        "LUST site",
        "SPCC garage",
        "State list store",
        "Grain elevator",
        "SPR Big Hill",
        "EIA terminal",
        "Fujairah",
    ]
    gdf = gpd.GeoDataFrame(
        {
            "fid": list(range(1, 8)),
            "facility_n": names,
            "md_country": ["United States of America"] * 6 + ["United Arab Emirates"],
            "operator": [" "] * 7,
            "capacity": [" "] * 7,
            "status": ["LEAKING UNDERGROUND STORAGE TANK - ARRA", " ", " ", " ", " ", " ", " "],
            "type": [" ", "SPCC", "STATE MASTER", "RAIL", "FRP", " ", "World.kml/World/terminals"],
        },
        geometry=[Point(-95, 30)] * 6 + [Point(56.3, 25.1)],
        crs="EPSG:4326",
    )
    out = _as_assets(build_storage.build(gdf))
    assert out["name"].tolist() == ["SPR Big Hill", "EIA terminal", "Fujairah"]


def test_build_ports_has_no_capacity_unit():
    out = _as_assets(build_ports.build(_netl_points()))
    assert out["asset_id"].str.startswith("netl-port-").all()
    assert len(out) == 3 and set(out["kind"]) == {"port"}
    assert out["capacity_unit"].isna().all()


# ── build_refineries (NETL within-source dedup + OSM supplement) ────────────


def _netl_refineries() -> pd.DataFrame:
    rows = [
        # One Myanmar plant listed three times within ~100 m.
        ("netl/1", "MMR", 94.825059, 20.904636, "Myanma Petro-chemical Enterprise (MPE)", None),
        ("netl/2", "MMR", 94.824967, 20.905583, "333 - Myanmar Petrochemical Ent. - Chauk", None),
        ("netl/3", "MMR", 94.824856, 20.904644, "Raffinerie de Chauk (Myanmar)", None),
        # A plant 18 km away stays separate.
        ("netl/4", "MMR", 96.221366, 16.605267, "334 - Thanlyin", None),
        # A duplicate pair where only the numbered row has capacity: capacity wins.
        ("netl/5", "SAU", 50.16, 26.64, "Ras Tanura Refinery", None),
        ("netl/6", "SAU", 50.161, 26.641, "400 - Saudi Aramco - Ras Tanura", 550.0),
    ]
    return pd.DataFrame(
        [
            {
                "asset_id": a,
                "country_iso3": c,
                "lon": x,
                "lat": y,
                "name": n,
                "operator": None,
                "capacity": cap,
                "status": None,
                "source_version": "netl-gogi",
            }
            for a, c, x, y, n, cap in rows
        ]
    )


def _osm_refineries() -> pd.DataFrame:
    return pd.DataFrame(
        [
            # Within 2 km of the (dropped) French Chauk listing → dropped.
            {"asset_id": "osm/way/1", "name": "Chauk", "lon": 94.83, "lat": 20.905},
            # Far from any NETL row → kept.
            {"asset_id": "osm/way/2", "name": "Jizan", "lon": 42.6, "lat": 16.7},
        ]
    ).assign(
        capacity=[None, 400.0],
        operator=None,
        source_version="2026-05-15",
        country_iso3=["MMR", "SAU"],
    )


def test_build_refineries_dedups_netl_then_supplements_with_osm():
    out = _as_assets(build_refineries.build(_netl_refineries(), _osm_refineries()))
    assert out["asset_id"].tolist() == ["netl/1", "netl/4", "netl/6", "osm/way/2"]
    assert out.loc[0, "name"] == "Myanma Petro-chemical Enterprise (MPE)"
    assert out["capacity_unit"].isna().tolist() == [True, True, False, False]
    assert out["capacity_unit"].dropna().eq("kbpd").all()
    assert out["status"].eq("operating").all()
    assert out["source"].tolist()[:3] == [build_refineries.NETL_SOURCE] * 3
    assert out["source"].tolist()[3] == build_refineries.OSM_SOURCE
