"""EIA STEO shale regions: forecast cut-off, units, county join."""

from __future__ import annotations

import geopandas as gpd
import pandas as pd
import pytest
from shapely.geometry import box

from scripts.transform import build_shale_regions as bsr


def _steo(rows: list[tuple[str, str, str]]) -> dict:
    return {"data": [{"seriesId": s, "period": p, "value": v} for s, p, v in rows]}


def test_forecast_years_are_dropped_and_units_converted():
    steo = _steo(
        [
            ("COPRPM", "2024", "6.3221"),
            ("COPRPM", "2025", "6.5728"),
            ("COPRPM", "2026", "6.7649"),  # forecast
            ("NGMPPM", "2025", "27.5"),
            ("NGMPPM", "2027", "32.8"),  # forecast
            ("PAPR48NGOM", "2025", "11.0"),  # not a region series
        ]
    )
    df = bsr.production(steo, history_through=2025)
    assert df["year"].max() == 2025
    crude = df[(df.metric == "crude_production_kbpd") & (df.year == 2025)]
    assert crude["value"].item() == pytest.approx(6572.8)
    assert crude["unit"].item() == "kb/d"
    gas = df[df.metric == "gas_marketed_bcfd"]
    assert gas["value"].tolist() == [27.5]
    assert set(df["region_id"]) == {"permian"}


def test_series_short_of_the_pinned_history_year_fails():
    steo = _steo([("COPRPM", "2024", "6.3"), ("NGMPPM", "2025", "27.5")])
    with pytest.raises(SystemExit, match="permian/crude_production_kbpd ends 2024"):
        bsr.production(steo, history_through=2025)


def test_county_keys_tolerate_spacing_and_saint():
    assert bsr._county_key("TX", "DE WITT") == bsr._county_key("TX", "DeWitt")
    assert bsr._county_key("LA", "SAINT MARTIN") == bsr._county_key("LA", "St. Martin")


def test_regions_dissolve_and_unmatched_counties_fail():
    dpr = pd.DataFrame(
        {
            "State": ["TX", "TX", "OK"],
            "County": ["ANDREWS", "ECTOR", "ALFALFA"],
            "Region": ["Permian Region", "Permian Region", "Anadarko Region"],
        }
    )
    members = bsr.region_counties(dpr)
    assert members["region_id"].tolist() == ["permian", "permian"]  # Anadarko not in STEO
    counties = gpd.GeoDataFrame(
        {"STUSPS": ["TX", "TX"], "NAME": ["Andrews", "Ector"]},
        geometry=[box(-103, 32, -102, 33), box(-102, 32, -101, 33)],
        crs="EPSG:4326",
    )
    shapes = bsr.region_shapes(counties, members)
    assert shapes["counties"].tolist() == [2]
    assert shapes.geometry.iloc[0].geom_type == "Polygon"  # adjacent counties merge
    with pytest.raises(SystemExit, match="no Census polygon"):
        bsr.region_shapes(counties.iloc[:1], members)
