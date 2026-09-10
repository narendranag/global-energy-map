"""Pipeline modules import cleanly (no I/O at import) and their pure parts work."""

from __future__ import annotations

import importlib
import pkgutil

import pandas as pd
import pytest

import scripts
from scripts import build_all
from scripts.ingest import baci, netl_gogi
from scripts.transform import build_catalog


def _all_modules() -> list[str]:
    return sorted(
        m.name for m in pkgutil.walk_packages(scripts.__path__, prefix="scripts.") if not m.ispkg
    )


@pytest.mark.parametrize("name", _all_modules())
def test_module_imports_without_side_effects(name: str):
    mod = importlib.import_module(name)
    if name.startswith(("scripts.ingest.", "scripts.transform.build_")):
        assert callable(getattr(mod, "main", None)), f"{name} has no main()"


# ── build_all ───────────────────────────────────────────────────────────────


def test_build_all_steps():
    assert build_all.select_steps() == build_all.TRANSFORMS
    assert build_all.TRANSFORMS[-1] == "build_catalog"
    assert build_all.select_steps(start="build_refineries")[0] == "build_refineries"
    assert build_all.select_steps(only=["build_catalog", "build_assets"]) == [
        "build_assets",
        "build_catalog",
    ]
    assert build_all.select_steps(ingest=True)[: len(build_all.INGESTS)] == build_all.INGESTS
    with pytest.raises(ValueError):
        build_all.select_steps(only=["nope"])
    with pytest.raises(ValueError):
        build_all.select_steps(only=["build_assets"], start="build_assets")


def test_every_build_step_names_a_module():
    for step in [*build_all.TRANSFORMS, *build_all.INGESTS]:
        importlib.import_module(build_all._module(step))


def test_run_step_calls_main_with_a_clean_argv(monkeypatch):
    calls = []

    class Fake:
        @staticmethod
        def main():
            import sys

            calls.append(list(sys.argv))

    monkeypatch.setattr("sys.argv", ["build_all", "--from", "x"])
    build_all.run_step("build_assets", load=lambda _: Fake)
    assert calls == [["scripts.transform.build_assets"]]


# ── build_catalog determinism ───────────────────────────────────────────────


def test_catalog_generated_at_is_newest_as_of(tmp_path, monkeypatch):
    monkeypatch.setattr(
        build_catalog,
        "REGISTRY",
        [
            {"id": "a", "path": "/data/a.json", "as_of": "2024-01-01", "format": "json"},
            {"id": "b", "path": "/data/b.json", "as_of": "2025-06-30", "format": "json"},
        ],
    )
    (tmp_path / "data").mkdir()
    for n in ("a", "b"):
        (tmp_path / "data" / f"{n}.json").write_text('{"features": []}')
    first = build_catalog.build_catalog(tmp_path)
    assert first["generated_at"] == "2025-06-30T00:00:00+00:00"
    assert build_catalog.build_catalog(tmp_path) == first


# ── ingest helpers ──────────────────────────────────────────────────────────


def test_baci_dest_paths_match_the_transform_globs():
    assert baci.dest_path("2709", 2001).name == "BACI_HS92_Y2001_crude.csv"
    assert baci.dest_path("271111", 2001).name == "baci_271111_2001.csv"


def test_baci_filter_products_splits_by_hs6():
    csv = b"t,i,j,k,v,q\n2020,1,2,270900,10,5\n2020,1,2,271111,3,1\n2020,1,2,999999,1,1\n"
    out = baci.filter_products(csv, [270900, 271111])
    assert out[270900]["v"].tolist() == [10]
    assert out[271111]["v"].tolist() == [3]
    assert isinstance(out[270900], pd.DataFrame)


def test_netl_layers_and_paths():
    assert set(netl_gogi.LAYERS) == {"basins", "ports", "refineries", "storage"}
    assert str(netl_gogi.out_path("storage")) == "data/raw/netl/storage.geojson"
    with pytest.raises(KeyError):
        netl_gogi.out_path("pipelines")
