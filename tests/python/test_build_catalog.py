"""build_catalog: download flags, CITATION.cff parsing, citations sidecar drift."""

from __future__ import annotations

import json

from scripts.transform import build_catalog as bc

# Licences the Phase 9 decision allows to be offered for download.
_OPEN_LICENCES = ("CC BY 4.0", "public domain", "Public domain")


def test_download_flags_block_mixed_files():
    reg = [
        {
            "id": "a",
            "path": "/data/x.parquet",
            "label": "A",
            "license": "CC BY 4.0",
            "redistributable": True,
        },
        {
            "id": "b",
            "path": "/data/x.parquet",
            "label": "B",
            "license": "ODbL",
            "redistributable": False,
            "download_note": "share-alike",
        },
        {
            "id": "c",
            "path": "/data/y.parquet",
            "label": "C",
            "license": "CC BY 4.0",
            "redistributable": True,
        },
        {"id": "d", "path": "/data/z.parquet", "label": "D", "license": "?"},
    ]
    flags = bc._download_flags(reg)
    assert flags["c"] == (True, None)
    assert flags["b"] == (False, "share-alike")
    ok, note = flags["a"]
    assert ok is False and note is not None and "B rows under ODbL" in note and "x.parquet" in note
    # Missing flag = not redistributable (fail closed).
    assert flags["d"][0] is False
    # A mixed file with a downloadable open subset points there instead.
    flags = bc._download_flags(reg, {"/data/x.parquet": "x_open.parquet"})
    ok, note = flags["a"]
    assert ok is False and note is not None and "x_open.parquet" in note
    assert flags["c"] == (True, None) and flags["b"] == (False, "share-alike")


def test_shipped_catalog_download_policy():
    entries = {e["id"]: e for e in json.loads(bc.OUT.read_text())["entries"]}
    for e in entries.values():
        assert isinstance(e["downloadable"], bool)
        if not e["downloadable"]:
            assert e.get("download_note"), f"{e['id']}: view-only entries must say why"
        if e["downloadable"]:
            # Every tenant of a downloadable file is open-licensed or project-derived.
            tenants = [t for t in entries.values() if t["path"] == e["path"]]
            assert all(t["redistributable"] for t in tenants), e["id"]
    # User decision (Phase 9): EI and BACI view-only; assets.parquet not offered as-is.
    assert not entries["ei_country_year"]["downloadable"]
    assert not entries["baci_2709"]["downloadable"]
    assets = [e for e in entries.values() if e["path"] == "/data/assets.parquet"]
    assert assets and not any(e["downloadable"] for e in assets)
    # Phase 10: the open subset (no OSM rows) is the downloadable asset table.
    assert entries["assets_open"]["downloadable"]
    assert not entries["assets_open"]["runtime"]
    for e in assets:
        if e["redistributable"]:
            assert "assets_open.parquet" in e["download_note"], e["id"]
    for e in entries.values():
        if e["redistributable"] and e["id"] != "disruption_route":
            assert any(lic in e["license"] for lic in _OPEN_LICENCES), e["id"]


def test_parse_cff_reads_core_fields_and_authors():
    text = (
        "cff-version: 1.2.0\n"
        "message: >-\n  folded text: with a colon\n"
        'title: "My Tool"\nversion: 2.1.0\ndate-released: 2026-01-02\n'
        'authors:\n  - family-names: Doe\n    given-names: Jane\n  - name: "Some Lab"\n'
        'url: "https://example.org"\n'
        'references:\n  - type: dataset\n    title: "Not me"\n'
    )
    out = bc.parse_cff(text)
    assert out["title"] == "My Tool"
    assert out["version"] == "2.1.0"
    assert out["date-released"] == "2026-01-02"
    assert out["url"] == "https://example.org"
    assert out["authors"] == [{"family-names": "Doe", "given-names": "Jane"}, {"name": "Some Lab"}]


def test_citations_sidecar_is_current():
    """Re-run `uv run python -m scripts.transform.build_catalog` if this fails."""
    on_disk = json.loads(bc.CITATIONS_OUT.read_text())
    assert on_disk == bc.build_citations()
    assert len(on_disk["scenario_shares"]) == 18
