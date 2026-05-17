"""Unit tests for NETL refinery capacity string parser."""
from __future__ import annotations

from scripts.transform._refinery_capacity import parse_netl_capacity_kbpd


def test_parses_pure_integer_as_bpd():
    # NETL stores numbers in bbl/d. 59000 bbl/d = 59 kbpd.
    assert parse_netl_capacity_kbpd("59000") == 59.0


def test_parses_pure_integer_with_commas():
    assert parse_netl_capacity_kbpd("150,000") == 150.0


def test_parses_html_wrapped_with_bpd_suffix():
    s = (
        '<table width="300" border="0"><tr>'
        '<td colspan="2">150,000 bpd crude capacity</td></tr></table>'
    )
    assert parse_netl_capacity_kbpd(s) == 150.0


def test_parses_plain_bpd_suffix():
    assert parse_netl_capacity_kbpd("343,000 bpd crude capacity") == 343.0


def test_blank_returns_none():
    assert parse_netl_capacity_kbpd("") is None
    assert parse_netl_capacity_kbpd(" ") is None


def test_none_returns_none():
    assert parse_netl_capacity_kbpd(None) is None


def test_unparseable_returns_none():
    assert parse_netl_capacity_kbpd("n/a") is None
    assert parse_netl_capacity_kbpd("unknown") is None


def test_leading_trailing_whitespace_handled():
    assert parse_netl_capacity_kbpd("  59000  ") == 59.0
