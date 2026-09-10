"""Every hand-set scenario share must carry a citation (review R6)."""

from __future__ import annotations

from scripts.transform.build_disruption_routing import UNSOURCED, all_rows

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


def test_every_row_is_cited():
    rows = all_rows()
    assert len(rows) == 16
    for r in rows:
        assert r["source_title"].strip(), r
        assert isinstance(r["source_year"], int) and 1990 <= r["source_year"] <= 2100, r
        assert r["source_note"].strip(), r
        if r["source_title"] != UNSOURCED:
            assert r["source_url"].startswith("https://"), r


def test_shares_unchanged():
    got = {(r["disruption_id"], r["exporter_iso3"], r["importer_iso3"]): r["share"]
           for r in all_rows()}
    assert got == EXPECTED_SHARES
