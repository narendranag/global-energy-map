"""IMF PortWatch chokepoint transits: ingest query shape and transform."""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from scripts.ingest import portwatch_chokepoints as ingest
from scripts.transform import build_chokepoint_transits as m

REGISTRY = Path("src/lib/scenarios/registry.ts")


def _row(portid: str, name: str, date: str, total: int, tanker: int, cap: float) -> dict:
    # The attribute shape PortWatch's FeatureServer returns (values invented).
    return {
        "date": date,
        "portid": portid,
        "portname": name,
        "n_total": total,
        "n_tanker": tanker,
        "capacity_tanker": cap,
    }


def test_every_chokepoint_maps_to_a_real_scenario_id():
    ids = set(re.findall(r'id: "([a-z_]+)"', REGISTRY.read_text()))
    assert set(ingest.CHOKEPOINTS.values()) <= ids


def test_query_asks_for_one_chokepoint_from_a_date_oldest_first():
    q = ingest.query_params("chokepoint6", "2019-01-01", 2000)
    assert q["where"] == "portid = 'chokepoint6' AND date >= TIMESTAMP '2019-01-01 00:00:00'"
    assert q["orderByFields"] == "date"
    assert q["resultOffset"] == "2000"


def test_tidy_keys_on_scenario_id_and_drops_repeated_days():
    raw = {
        "chokepoint6": [
            _row("chokepoint6", "Strait of Hormuz", "2026-02-27", 60, 40, 3.0e6),
            _row("chokepoint6", "Strait of Hormuz", "2026-02-28", 55, 35, 2.5e6),
            # A page boundary can repeat a day; the later copy wins.
            _row("chokepoint6", "Strait of Hormuz", "2026-02-28", 54, 34, 2.4e6),
        ],
        "chokepoint1": [_row("chokepoint1", "Suez Canal", "2026-02-28", 30, 8, 5.0e5)],
    }
    out = m.tidy(raw)
    assert list(out.columns) == m.COLUMNS
    assert len(out) == 3
    hormuz = out[out["scenario_id"] == "hormuz"]
    assert hormuz["transits_tanker"].tolist() == [40, 34]
    assert out["transits_all"].dtype == "int64"
    assert set(out["source"]) == {"IMF PortWatch"}


def test_tidy_refuses_an_unmapped_chokepoint():
    with pytest.raises(ValueError, match="chokepoint2"):
        m.tidy({"chokepoint2": [_row("chokepoint2", "Panama Canal", "2026-01-01", 1, 0, 0.0)]})
