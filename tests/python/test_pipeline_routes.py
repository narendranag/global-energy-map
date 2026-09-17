"""Route-geometry overlay: GEM's route repo supplies geometry, trackers supply attributes."""

from __future__ import annotations

import json

import geopandas as gpd
import pytest
from shapely.geometry import LineString

from scripts.ingest.gem_pipeline_routes import _member_target
from scripts.transform.build_pipelines import apply_route_geometries, load_route_geometries


def _write(path, geometry):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"type": "FeatureCollection", "features": [{"geometry": geometry}]}))


@pytest.fixture
def routes_dir(tmp_path):
    d = tmp_path / "routes"
    _write(
        d / "liquid-pipelines" / "P0001.geojson",
        {"type": "LineString", "coordinates": [[0, 0], [1, 1]]},
    )
    _write(
        d / "gas-pipelines" / "P0002.geojson",
        {"type": "LineString", "coordinates": [[2, 2], [3, 3]]},
    )
    # GEM writes a file for every project, with null geometry when there is no
    # route to draw. Those must not shadow the tracker's own geometry.
    _write(d / "gas-pipelines" / "P0003.geojson", None)
    return d


def test_loads_routes_and_skips_null_geometry(routes_dir):
    routes = load_route_geometries(routes_dir)
    assert set(routes) == {"P0001", "P0002"}
    assert routes["P0001"].coords[0] == (0.0, 0.0)


def test_empty_geometry_collection_is_skipped(tmp_path):
    d = tmp_path / "routes"
    _write(d / "gas-pipelines" / "P0009.geojson", {"type": "LineString", "coordinates": []})
    assert load_route_geometries(d) == {}


def test_compressor_station_sidecars_are_ignored(tmp_path):
    d = tmp_path / "routes"
    _write(
        d / "gas-pipelines" / "P0010-compressor-stations.geojson",
        {"type": "Point", "coordinates": [1, 1]},
    )
    assert load_route_geometries(d) == {}


def test_unmatched_rows_keep_their_original_geometry(routes_dir):
    original = LineString([(9, 9), (10, 10)])
    g = gpd.GeoDataFrame(
        {"pipeline_id": ["P0001", "P9999"]},
        geometry=[LineString([(5, 5), (6, 6)]), original],
        crs="EPSG:4326",
    )
    apply_route_geometries(g, load_route_geometries(routes_dir), "test")

    # P0001 is replaced by the route repo's geometry...
    assert g.loc[0, "geometry"].coords[0] == (0.0, 0.0)
    # ...and P9999, which the repo has never heard of, is left alone.
    assert g.loc[1, "geometry"] == original


@pytest.mark.parametrize(
    "member,expected",
    [
        ("repo-abc123/data/individual-routes/gas-pipelines/P1.geojson", "gas-pipelines/P1.geojson"),
        (
            "repo-abc123/data/individual-routes/liquid-pipelines/P2.geojson",
            "liquid-pipelines/P2.geojson",
        ),
        # Out of scope, or not a route file at all.
        ("repo-abc123/data/individual-routes/hydrogen-pipelines/P3.geojson", None),
        ("repo-abc123/README.md", None),
        ("repo-abc123/scripts/validate_geojson.py", None),
        ("repo-abc123/data/example-empty-route.geojson", None),
    ],
)
def test_tarball_member_selection(member, expected):
    target = _member_target(member)
    if expected is None:
        assert target is None
    else:
        assert target is not None
        assert str(target).endswith(expected)
