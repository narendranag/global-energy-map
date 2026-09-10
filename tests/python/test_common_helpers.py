"""Shared pipeline helpers: ISO3 API, value coercion, raw-file discovery, downloads."""

from __future__ import annotations

from pathlib import Path

import httpx
import pytest

from scripts.common import download
from scripts.common.iso3 import (
    gem_endpoints_iso3,
    gem_first_iso3,
    lookup,
    lookup_iso3,
    netl_country_iso3,
)
from scripts.common.paths import latest
from scripts.common.values import to_float

# ── iso3 ────────────────────────────────────────────────────────────────────


def test_lookup_iso3_merges_every_source():
    assert lookup_iso3("US") == "USA"  # EI spelling
    assert lookup_iso3("Russian Federation") == "RUS"  # NETL spelling
    assert lookup_iso3("South Korea") == "KOR"  # LNG-T3 delta
    assert lookup("South Korea", "lng_t3") == "KOR"


@pytest.mark.parametrize(
    ("raw", "iso3"),
    [
        ("Saudi Arabia", "SAU"),
        ("  Saudi Arabia ", "SAU"),
        ("Russian Federation;Kazakhstan", "RUS"),
        ("Venezuela, Bolivarian Republic of", "VEN"),
        ("Venezuela, somewhere", "VEN"),  # comma fallback
        ("Cote D''Ivoire", "CIV"),  # GeoJSON-escaped quote
        ("Atlantis", None),
        ("", None),
        (None, None),
    ],
)
def test_netl_country_iso3(raw, iso3):
    assert netl_country_iso3(raw) == iso3


def test_gem_area_helpers():
    assert gem_first_iso3("Atlantis; Kazakhstan; Russia") == "KAZ"
    assert gem_first_iso3(None) is None
    assert gem_endpoints_iso3("Kazakhstan; Russia") == ("KAZ", "RUS")
    assert gem_endpoints_iso3("Russia") == ("RUS", None)
    assert gem_endpoints_iso3(float("nan")) == (None, None)


# ── values / paths ──────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("raw", "value"),
    [
        ("1,500", 1500.0),
        (" 2.5 ", 2.5),
        (7, 7.0),
        ("", None),
        ("NA", None),
        ("N/A", None),
        ("abc", None),
        (None, None),
        (float("nan"), None),
    ],
)
def test_to_float(raw, value):
    assert to_float(raw) == value


def test_latest_picks_last_by_name_and_raises_when_missing(tmp_path: Path):
    for name in ("ggit_map_2025-01-01.geojson", "ggit_map_2026-02-20.geojson"):
        (tmp_path / name).write_text("{}")
    assert latest(tmp_path, "*.geojson").name == "ggit_map_2026-02-20.geojson"
    with pytest.raises(FileNotFoundError):
        latest(tmp_path, "*.xlsx")


# ── download ────────────────────────────────────────────────────────────────


def test_snapshot_url_from_cdx():
    rows = [["timestamp", "original"], ["20240321185306", "https://x.org/f.xlsx"]]
    assert download.snapshot_url_from_cdx(rows) == (
        "http://web.archive.org/web/20240321185306/https://x.org/f.xlsx"
    )
    assert download.snapshot_url_from_cdx([["timestamp", "original"]]) is None
    assert "url=https://x.org/f.xlsx" in download.cdx_query_url("https://x.org/f.xlsx")


class _Resp:
    def __init__(self, status: int, payload=None):
        self.status_code = status
        self._payload = payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError("x", request=None, response=None)  # type: ignore[arg-type]

    def json(self):
        return self._payload


def test_resolve_prefers_primary(monkeypatch):
    monkeypatch.setattr(download.httpx, "head", lambda *a, **k: _Resp(200))
    assert download.resolve_download_url("https://p/f", help_text="h") == "https://p/f"


def test_resolve_falls_back_to_wayback_of_cdx_target(monkeypatch):
    seen = {}

    def fake_get(url, **_):
        seen["url"] = url
        return _Resp(200, [["timestamp", "original"], ["2024", "https://orig/f"]])

    monkeypatch.setattr(download.httpx, "head", lambda *a, **k: _Resp(403))
    monkeypatch.setattr(download.httpx, "get", fake_get)
    url = download.resolve_download_url("https://p/f", cdx_target="https://orig/f", help_text="h")
    assert url == "http://web.archive.org/web/2024/https://orig/f"
    assert "orig" in seen["url"]


def test_resolve_raises_help_text_when_nothing_works(monkeypatch):
    def boom(*a, **k):
        raise httpx.ConnectError("offline")

    monkeypatch.setattr(download.httpx, "head", boom)
    monkeypatch.setattr(download.httpx, "get", boom)
    with pytest.raises(RuntimeError, match="place it by hand"):
        download.resolve_download_url("https://p/f", help_text="place it by hand")


def test_fetch_skips_existing_file(tmp_path: Path, monkeypatch):
    dest = tmp_path / "f.xlsx"
    dest.write_text("cached")
    monkeypatch.setattr(download, "resolve_download_url", pytest.fail)
    assert download.fetch(dest, "https://p/f", help_text="h") == dest
    assert download.parse_force(None, ["--force"]) is True
    assert download.parse_force(None, []) is False
