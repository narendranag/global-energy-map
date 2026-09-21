"""Every hand-set scenario share must carry a citation (review R6)."""

from __future__ import annotations

from scripts.transform.build_disruption_routing import (
    EAST_ASIA_MINUS_IDN,
    EUROPE_MED,
    GULF_COASTAL,
    SOUTH_ASIA,
    UNSOURCED,
    all_rows,
)

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

# ── R1 chokepoints (region-expanded, S6 2026-09-19) ─────────────────────────
_MALACCA_GULF = ("SAU", "ARE", "KWT", "IRQ", "QAT", "BHR", "OMN")
for _exp in _MALACCA_GULF:
    for _imp in EAST_ASIA_MINUS_IDN:
        EXPECTED_SHARES[("malacca", _exp, _imp)] = 1.00
    for _imp in SOUTH_ASIA:
        EXPECTED_SHARES[("malacca", _exp, _imp)] = 0.00
for _imp in EAST_ASIA_MINUS_IDN:
    EXPECTED_SHARES[("malacca", "USA", _imp)] = 0.60
    EXPECTED_SHARES[("malacca_lng", "QAT", _imp)] = 1.00

_SUEZ_GULF = ("SAU", "ARE", "KWT", "QAT", "IRQ", "BHR")
for _exp in _SUEZ_GULF:
    # No USA row (final review #6): a hole beats a contested number, see the
    # header comment on _SUEZ_IMPORTERS in build_disruption_routing.py.
    for _imp in EUROPE_MED:
        EXPECTED_SHARES[("suez", _exp, _imp)] = 1.00
for _imp in EUROPE_MED:
    EXPECTED_SHARES[("suez_lng", "QAT", _imp)] = 1.00
    EXPECTED_SHARES[("bab_el_mandeb_lng", "QAT", _imp)] = 1.00

_BAB_GULF = ("ARE", "KWT", "QAT", "IRQ", "BHR")
for _exp in _BAB_GULF:
    for _imp in EUROPE_MED:
        EXPECTED_SHARES[("bab_el_mandeb", _exp, _imp)] = 1.00
for _imp in EUROPE_MED:
    EXPECTED_SHARES[("bab_el_mandeb", "SAU", _imp)] = 0.00

EXPECTED_SHARES[("turkish_straits", "KAZ", None)] = 0.80
EXPECTED_SHARES[("turkish_straits", "KAZ", "BGR")] = 0.00
EXPECTED_SHARES[("turkish_straits", "KAZ", "ROU")] = 0.00
EXPECTED_SHARES[("turkish_straits", "KAZ", "CHN")] = 0.00
# Final review #7: landlocked/overland buyers of Kazakh crude that
# demonstrably avoid the Straits.
# Germany is a partial carve-out, not a zero: KEBCO via Druzhba began only in
# Feb 2023 and runs ~1.0-1.5 Mt/y against BACI's 3.1 Mt (2023) / 4.3 Mt (2024),
# so ~2/3 of German volumes still transit. Interim estimate (0.80 x ~0.66)
# pending a year-aware share; see the row's source_note.
EXPECTED_SHARES[("turkish_straits", "KAZ", "DEU")] = 0.53
EXPECTED_SHARES[("turkish_straits", "KAZ", "UZB")] = 0.00
EXPECTED_SHARES[("turkish_straits", "KAZ", "KGZ")] = 0.00

EXPECTED_SHARES[("keystone", "CAN", "USA")] = 0.14
EXPECTED_SHARES[("enbridge_mainline", "CAN", "USA")] = 0.60
EXPECTED_SHARES[("espo_spur", "RUS", "CHN")] = 0.28


def test_every_row_is_cited():
    rows = all_rows()
    assert len(rows) == len(EXPECTED_SHARES)
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


def test_no_duplicate_disruption_route_keys():
    """Blocking fix (chokepoints.md verification): region expansion must never
    emit two rows for the same (disruption_id, exporter, importer)."""
    keys = [(r["disruption_id"], r["exporter_iso3"], r["importer_iso3"]) for r in all_rows()]
    assert len(keys) == len(set(keys))


def test_shares_are_in_unit_range():
    for r in all_rows():
        assert 0.0 <= r["share"] <= 1.0, r


# ── data_year ───────────────────────────────────────────────────────────────
# `source_year` is the year the cited document was *published*; `data_year` is
# the year of the flows or routing it describes. A row gets one only where the
# document (or the row's own note) states it: structural rows — the intra-Gulf
# share-0 pairs, the physical-geography wildcards — and unsourced analyst
# estimates carry NULL, with nothing implied. See the comment beside each
# citation constant for where its data year comes from.
#
# (rows with a data year, rows without), per route-share set.
EXPECTED_DATA_YEAR_COUNTS = {
    "hormuz": (6, 43),
    "hormuz_lng": (0, 14),
    "druzhba": (5, 1),
    "btc": (1, 0),
    "cpc": (1, 1),
    "malacca": (10, 98),
    "malacca_lng": (0, 10),
    "suez": (0, 138),
    "suez_lng": (23, 0),
    "bab_el_mandeb": (0, 138),
    "bab_el_mandeb_lng": (23, 0),
    "turkish_straits": (2, 5),
    "keystone": (1, 0),
    "enbridge_mainline": (1, 0),
    "espo_spur": (0, 1),
}


def _counts_by_id(rows):
    counts = {}
    for r in rows:
        dated, undated = counts.get(r["disruption_id"], (0, 0))
        counts[r["disruption_id"]] = (
            (dated + 1, undated) if r["data_year"] is not None else (dated, undated + 1)
        )
    return counts


def test_every_row_carries_a_data_year_column():
    for r in all_rows():
        assert "data_year" in r, r
        dy = r["data_year"]
        assert dy is None or isinstance(dy, int), r


def test_data_year_counts_per_route_set():
    assert _counts_by_id(all_rows()) == EXPECTED_DATA_YEAR_COUNTS


def test_data_year_never_postdates_its_document():
    """A document cannot describe flows from after it was published."""
    for r in all_rows():
        if r["data_year"] is not None:
            assert 1990 <= r["data_year"] <= r["source_year"], r


def test_unsourced_rows_have_no_data_year():
    """`source_year` keeps its 2026 default for compatibility; a row with no
    document behind it has no data year to state."""
    for r in all_rows():
        if r["source_title"] == UNSOURCED:
            assert r["data_year"] is None, r


def test_structural_share_zero_rows_are_undated():
    """The share-0 carve-outs are geography, not a dated measurement."""
    for r in all_rows():
        if r["share"] == 0.0:
            assert r["data_year"] is None, r
