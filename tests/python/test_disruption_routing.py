"""Every hand-set scenario share must carry a citation (review R6)."""

from __future__ import annotations

from scripts.transform.build_disruption_routing import GULF_COASTAL, UNSOURCED, all_rows

# Shares drive every scenario and must not change silently. Six were updated
# to source-derived values on 2026-09-10 (user-approved); see row notes.
EXPECTED_SHARES = {
    ("hormuz", "IRN", None): 1.00,
    ("hormuz", "IRQ", None): 0.90,
    ("hormuz", "KWT", None): 1.00,
    ("hormuz", "QAT", None): 1.00,
    ("hormuz", "SAU", None): 0.88,
    ("hormuz", "ARE", None): 0.65,
    ("hormuz", "BHR", None): 1.00,
    ("hormuz_lng", "QAT", None): 1.00,
    ("hormuz_lng", "ARE", None): 1.00,
    ("druzhba", "RUS", "BLR"): 1.00,
    ("druzhba", "RUS", "POL"): 0.47,
    ("druzhba", "RUS", "DEU"): 0.47,
    ("druzhba", "RUS", "SVK"): 1.00,
    ("druzhba", "RUS", "HUN"): 1.00,
    ("druzhba", "RUS", "CZE"): 1.00,
    ("btc", "AZE", None): 0.83,
    ("cpc", "KAZ", None): 0.80,
    ("cpc", "RUS", None): 0.035,
}

# Intra-Gulf trade never crosses the strait (user-approved 2026-09-11): every
# Hormuz exporter gets a share-0 pair row for each other Gulf-coast importer.
_HORMUZ_EXPORTERS = {
    "hormuz": ["IRN", "IRQ", "KWT", "QAT", "SAU", "ARE", "BHR"],
    "hormuz_lng": ["QAT", "ARE"],
}
for _sid, _exporters in _HORMUZ_EXPORTERS.items():
    for _exp in _exporters:
        for _imp in GULF_COASTAL:
            if _imp != _exp:
                EXPECTED_SHARES[(_sid, _exp, _imp)] = 0.0


def test_every_row_is_cited():
    rows = all_rows()
    assert len(rows) == 18 + 7 * 6 + 2 * 6
    for r in rows:
        assert r["source_title"].strip(), r
        assert isinstance(r["source_year"], int) and 1990 <= r["source_year"] <= 2100, r
        assert r["source_note"].strip(), r
        if r["source_title"] != UNSOURCED:
            assert r["source_url"].startswith("https://"), r


def test_shares_unchanged():
    got = {
        (r["disruption_id"], r["exporter_iso3"], r["importer_iso3"]): r["share"] for r in all_rows()
    }
    assert got == EXPECTED_SHARES


def test_gulf_coastal_is_the_hormuz_exporter_set():
    assert set(GULF_COASTAL) == set(_HORMUZ_EXPORTERS["hormuz"])
