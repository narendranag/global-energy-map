"""SPIKE — energy-price and flow context through OpenBB's Open Data Platform (ODP V5).

Not wired into ``build_all`` or the app. This module answers one question: can
ODP's free providers supply the *context* the map lacks — what prices, recent
production/stocks and chokepoint traffic were doing — without a paid source, a
sign-up or a new client per publisher? See ``docs/02-odp-energy-context-spike.md``.

Four sources, every one reached through ODP with no paid key:

    imf_pcps    IMF Primary Commodity Prices, monthly USD: Brent, WTI, Dubai,
                Henry Hub, EU gas, Asia LNG, Australian coal         (keyless)
    eia_spot    EIA daily spot: Brent, WTI, Henry Hub                 (EIA_API_KEY,
                else EIA's public DEMO_KEY — rate-limited, no sign-up)
    jodi        JODI-Oil/Gas monthly: crude production, crude stocks,
                natural-gas production, per country                  (keyless)
    portwatch   IMF PortWatch daily chokepoint transits (all vessels,
                tankers, tanker capacity) for the five chokepoints the
                scenario registry models                              (keyless)

Everything lands in one long table, ``ENERGY_CONTEXT_COLUMNS``, so a loader on
the app side would read one file the way ``loadGasStorageByCountry`` does and
key on ``iso3`` (country panel) or ``scenario_id`` (scenario panel's context
block). The pure ``tidy_*`` functions take the DataFrames ODP returns and need
neither ODP nor the network, which is what the tests exercise against the
fixture in ``tests/python/fixtures/odp/``.

ODP is an opt-in dependency group (~700 MB), so CI never installs it:

    uv sync --group odp
    uv run --group odp python -m scripts.ingest.odp_energy_context [--since YYYY-MM-DD]
    uv run python -m scripts.ingest.odp_energy_context --fixture   # synthetic, from data/raw/odp/

Writes raw frames to ``data/raw/odp/`` and the tidy table to
``data/derived/odp/energy_context.parquet`` (both gitignored). ``--fixture``
instead rewrites the small committed fixture from a fresh pull.
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from collections.abc import Callable
from pathlib import Path

import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[2]

RAW_DIR = REPO_ROOT / "data" / "raw" / "odp"
OUT_PATH = REPO_ROOT / "data" / "derived" / "odp" / "energy_context.parquet"
FIXTURE_DIR = REPO_ROOT / "tests" / "python" / "fixtures" / "odp"

# One long table for every source. `iso3` is set for country series,
# `scenario_id` for chokepoint series, neither for world benchmark prices.
ENERGY_CONTEXT_COLUMNS = [
    "source",  # imf_pcps | eia_spot | jodi | portwatch
    "series_id",  # stable id, e.g. "brent_usd_bbl", "crude_production"
    "iso3",
    "scenario_id",
    "date",  # ISO date string; monthly series are dated the 1st of the month
    "frequency",  # daily | monthly
    "value",
    "unit",
]

# --- IMF Primary Commodity Prices -------------------------------------------

# PCPS indicator -> (series_id, unit). All are "World" (G001), USD, monthly.
IMF_PCPS: dict[str, tuple[str, str]] = {
    "POILBRE": ("brent_usd_bbl", "USD/bbl"),
    "POILWTI": ("wti_usd_bbl", "USD/bbl"),
    "POILDUB": ("dubai_usd_bbl", "USD/bbl"),
    "PNGASUS": ("henry_hub_usd_mmbtu", "USD/MMBtu"),
    "PNGASEU": ("eu_gas_usd_mmbtu", "USD/MMBtu"),
    "PNGASJP": ("asia_lng_usd_mmbtu", "USD/MMBtu"),
    "PCOALAU": ("coal_australia_usd_t", "USD/t"),
}

# --- EIA daily spot ----------------------------------------------------------

# EIA series code -> (series_id, unit). The ODP endpoint returns every product
# it covers; we keep these three.
EIA_SPOT: dict[str, tuple[str, str]] = {
    "RBRTE": ("brent_usd_bbl", "USD/bbl"),
    "RWTC": ("wti_usd_bbl", "USD/bbl"),
    "RNGWHHD": ("henry_hub_usd_mmbtu", "USD/MMBtu"),
}

# --- JODI ---------------------------------------------------------------------

# JODI is asked by ISO2 and answers with one snake_case column per country.
# A fixed list keeps the spike small and makes an unmapped column an error
# rather than a silently dropped country.
JODI_COUNTRIES: dict[str, tuple[str, str]] = {
    # iso2: (column JODI returns, iso3)
    "SA": ("saudi_arabia", "SAU"),
    "US": ("united_states", "USA"),
    "RU": ("russia", "RUS"),
    "IQ": ("iraq", "IRQ"),
    "AE": ("united_arab_emirates", "ARE"),
    "KW": ("kuwait", "KWT"),
    "QA": ("qatar", "QAT"),
    "NO": ("norway", "NOR"),
    "AU": ("australia", "AUS"),
    "JP": ("japan", "JPN"),
    "KR": ("south_korea", "KOR"),
    "IN": ("india", "IND"),
    "DE": ("germany", "DEU"),
}

# (series_id, ODP call path, kwargs, unit). Units are JODI's own.
JODI_SERIES: list[tuple[str, str, dict[str, str], str]] = [
    ("crude_production", "oil.production", {"product": "crude_oil", "unit": "kbd"}, "kb/d"),
    ("crude_stocks", "oil.stocks", {"product": "crude_oil", "unit": "kbbl"}, "kbbl"),
    ("gas_production", "gas.production", {"unit": "m3"}, "million m3"),
]

# --- IMF PortWatch -----------------------------------------------------------

# PortWatch chokepoint -> our scenario id (src/lib/scenarios/registry.ts).
# PortWatch also tracks Panama, Gibraltar, Dover, Oresund, Cape of Good Hope …;
# none is a modelled scenario, so the spike leaves them out.
PORTWATCH_CHOKEPOINTS: dict[str, str] = {
    "strait_of_hormuz": "hormuz",
    "malacca_strait": "malacca",
    "suez_canal": "suez",
    "bab_el-mandeb_strait": "bab_el_mandeb",  # sic: ODP's own key
    "bosporus_strait": "turkish_straits",
}

# PortWatch column -> (series_id, unit).
PORTWATCH_FIELDS: dict[str, tuple[str, str]] = {
    "vessels_total": ("transits_all", "vessels/day"),
    "vessels_tanker": ("transits_tanker", "vessels/day"),
    "capacity_tanker": ("tanker_capacity", "t/day"),
}


# --- pure normalisers (tested; no ODP, no network) ---------------------------


def _iso_date(values: pd.Series | pd.Index) -> pd.Series:
    return pd.Series(pd.DatetimeIndex(pd.to_datetime(values)).strftime("%Y-%m-%d"), dtype="string")


def _month_start(values: pd.Series | pd.Index) -> pd.Series:
    # IMF dates a month by its last day; JODI by its first. One convention.
    months = pd.DatetimeIndex(pd.to_datetime(values)).to_period("M").to_timestamp()
    return pd.Series(months.strftime("%Y-%m-%d"), dtype="string")


def _frame(**cols: object) -> pd.DataFrame:
    df = pd.DataFrame(cols)
    for col in ENERGY_CONTEXT_COLUMNS:
        if col not in df:
            df[col] = pd.NA
    df = df[ENERGY_CONTEXT_COLUMNS]
    df["value"] = pd.to_numeric(df["value"], errors="coerce").astype("float64")
    for col in ENERGY_CONTEXT_COLUMNS:
        if col != "value":
            df[col] = df[col].astype("string")
    return df.dropna(subset=["value"]).reset_index(drop=True)


def tidy_imf_pcps(raw: pd.DataFrame) -> pd.DataFrame:
    """IMF ``indicators`` output (date index, ``symbol`` "PCPS::POILBRE") → long rows.

    Only USD rows are kept: asking PCPS without a transform also returns the
    2016=100 index and percentage changes under the same symbol.
    """
    df = raw.reset_index()
    if "data_transformation_code" in df:
        df = df[df["data_transformation_code"].astype(str) == "USD"]
    code = df["symbol"].astype(str).str.split("::").str[-1]
    known = code.isin(IMF_PCPS)
    df, code = df[known], code[known]
    return _frame(
        source="imf_pcps",
        series_id=code.map(lambda c: IMF_PCPS[c][0]).to_numpy(),
        date=_month_start(df["date"]).to_numpy(),
        frequency="monthly",
        value=df["value"].to_numpy(),
        unit=code.map(lambda c: IMF_PCPS[c][1]).to_numpy(),
    )


def tidy_eia_spot(raw: pd.DataFrame) -> pd.DataFrame:
    """EIA spot output (date index, ``series`` "RBRTE" or "EER_…") → long rows."""
    df = raw.reset_index()
    code = df["series"].astype(str)
    known = code.isin(EIA_SPOT)
    df, code = df[known], code[known]
    return _frame(
        source="eia_spot",
        series_id=code.map(lambda c: EIA_SPOT[c][0]).to_numpy(),
        date=_iso_date(df["date"]).to_numpy(),
        frequency="daily",
        value=df["value"].to_numpy(),
        unit=code.map(lambda c: EIA_SPOT[c][1]).to_numpy(),
    )


def tidy_jodi(raw: pd.DataFrame, series_id: str, unit: str) -> pd.DataFrame:
    """JODI output (date index, one column per country) → long rows by ISO3.

    Raises on a column that is not in ``JODI_COUNTRIES``: JODI spells countries
    its own way, and a renamed column must fail loudly, not drop a country.
    """
    by_column = {column: iso3 for column, iso3 in JODI_COUNTRIES.values()}
    unknown = sorted(set(raw.columns) - set(by_column) - {"date"})
    if unknown:
        raise ValueError(f"JODI returned unmapped country columns: {unknown}")
    long = raw.reset_index().melt(id_vars="date", var_name="column", value_name="value")
    return _frame(
        source="jodi",
        series_id=series_id,
        iso3=long["column"].map(by_column).to_numpy(),
        date=_month_start(long["date"]).to_numpy(),
        frequency="monthly",
        value=long["value"].to_numpy(),
        unit=unit,
    )


def tidy_portwatch(raw: pd.DataFrame) -> pd.DataFrame:
    """PortWatch ``chokepoint_volume`` output → long rows keyed on our scenario id."""
    df = raw.reset_index()

    # PortWatch answers with display names ("Strait of Hormuz", "Bab el-Mandeb
    # Strait"); the request keys are snake_case. Compare both folded the same way.
    def fold(name: str) -> str:
        return " ".join(name.lower().replace("_", " ").replace("-", " ").split())

    names = {fold(name): sid for name, sid in PORTWATCH_CHOKEPOINTS.items()}
    key = df["chokepoint"].astype(str).map(fold)
    df = df.assign(scenario_id=key.map(names)).dropna(subset=["scenario_id"])
    frames = [
        _frame(
            source="portwatch",
            series_id=series_id,
            scenario_id=df["scenario_id"].to_numpy(),
            date=_iso_date(df["date"]).to_numpy(),
            frequency="daily",
            value=df[field].to_numpy(),
            unit=unit,
        )
        for field, (series_id, unit) in PORTWATCH_FIELDS.items()
        if field in df
    ]
    return pd.concat(frames, ignore_index=True)


def latest_vs_trailing(
    df: pd.DataFrame, *, series_id: str, key: str | None = None, window: int = 12
) -> dict[str, object]:
    """How the map would *use* a context series: the latest value against the
    mean of the ``window`` observations before it — "Brent $X, Y% vs its
    12-month average", "Hormuz tanker transits N/day, Z% vs the prior 30 days".

    ``key`` filters on ``iso3`` or ``scenario_id`` (whichever matches).
    """
    rows = df[df["series_id"] == series_id]
    if key is not None:
        rows = rows[(rows["iso3"] == key) | (rows["scenario_id"] == key)]
    rows = rows.sort_values("date")
    if len(rows) < window + 1:
        raise ValueError(f"{series_id}/{key}: need {window + 1} points, have {len(rows)}")
    latest = rows.iloc[-1]
    trailing = rows["value"].iloc[-window - 1 : -1].mean()
    return {
        "series_id": series_id,
        "key": key,
        "date": str(latest["date"]),
        "value": float(latest["value"]),
        "unit": str(latest["unit"]),
        "trailing_mean": float(trailing),
        "change_pct": float((latest["value"] - trailing) / trailing * 100),
    }


# --- fetchers (need `uv sync --group odp` and the network) --------------------


def _obb():
    try:
        from openbb import obb
    except ImportError:
        sys.exit("ODP is not installed: run `uv sync --group odp` first.")
    obb.user.credentials.eia_api_key = os.environ.get("EIA_API_KEY") or "DEMO_KEY"
    return obb


def fetch_imf_pcps(obb, since: str) -> pd.DataFrame:
    symbols = ",".join(f"PCPS::{code}" for code in IMF_PCPS)
    return obb.imf.indicators(
        symbol=symbols, country="G001", frequency="month", transform="USD", start_date=since
    ).to_df()


def fetch_eia_spot(obb, since: str) -> pd.DataFrame:
    oil = obb.eia.petroleum.prices.spot_prices(
        frequency="daily",
        series="europe_brent_spot_price_fob,cushing_ok_wti_spot_price_fob",
        start_date=since,
    ).to_df()
    gas = obb.eia.natural_gas.prices.natural_gas_spot_and_futures_prices(
        frequency="daily", series="henry_hub_natural_gas_spot_price", start_date=since
    ).to_df()
    return pd.concat([oil, gas])


def fetch_jodi(obb, call: str, kwargs: dict[str, str], since: str) -> pd.DataFrame:
    fn = obb.jodi
    for part in call.split("."):
        fn = getattr(fn, part)
    return fn(country=",".join(JODI_COUNTRIES), start_date=since, **kwargs).to_df()


def fetch_portwatch(obb, since: str) -> pd.DataFrame:
    frames = [
        obb.imf.chokepoint_volume(chokepoint=name, start_date=since).to_df()
        for name in PORTWATCH_CHOKEPOINTS
    ]
    return pd.concat(frames)


def _timed(label: str, fn: Callable[[], pd.DataFrame]) -> pd.DataFrame:
    t = time.monotonic()
    df = fn()
    print(f"  {label}: {len(df):,} rows in {time.monotonic() - t:.1f}s")
    return df


def pull(since: str) -> dict[str, pd.DataFrame]:
    """Every raw frame, keyed by the name it is saved under in data/raw/odp/."""
    obb = _obb()
    raw = {
        "imf_pcps": _timed("imf_pcps", lambda: fetch_imf_pcps(obb, since)),
        "eia_spot": _timed("eia_spot", lambda: fetch_eia_spot(obb, since)),
        "portwatch": _timed("portwatch", lambda: fetch_portwatch(obb, since)),
    }
    for series_id, call, kwargs, _unit in JODI_SERIES:
        name = f"jodi_{series_id}"
        raw[name] = _timed(name, lambda c=call, k=kwargs: fetch_jodi(obb, c, k, since))
    return raw


def tidy_all(raw: dict[str, pd.DataFrame]) -> pd.DataFrame:
    parts = [
        tidy_imf_pcps(raw["imf_pcps"]),
        tidy_eia_spot(raw["eia_spot"]),
        tidy_portwatch(raw["portwatch"]),
    ]
    for series_id, _call, _kwargs, unit in JODI_SERIES:
        parts.append(tidy_jodi(raw[f"jodi_{series_id}"], series_id, unit))
    out = pd.concat(parts, ignore_index=True)
    return out.sort_values(["source", "series_id", "iso3", "scenario_id", "date"]).reset_index(
        drop=True
    )


# Columns each raw frame keeps in the fixture, and the column that groups it.
_FIXTURE_SHAPE: dict[str, tuple[list[str] | None, str | None]] = {
    "imf_pcps": (["symbol", "value", "data_transformation_code"], "symbol"),
    "eia_spot": (["series", "value", "units"], "series"),
    "portwatch": (["chokepoint", *PORTWATCH_FIELDS], "chokepoint"),
}


def synthetic_fixture(raw: dict[str, pd.DataFrame], rows: int = 14) -> dict[str, pd.DataFrame]:
    """The shape of a real pull with **invented values**.

    The repo is public and none of these series is cleanly redistributable
    (EIA and IMF energy prices are Refinitiv/Argus data, PortWatch counts are
    Kpler's, JODI states no licence), so the committed fixture keeps the real
    columns, codes, country/chokepoint names and dates and replaces every
    number with a deterministic ramp. Tests exercise parsing, not prices.
    """
    out: dict[str, pd.DataFrame] = {}
    for name, df in raw.items():
        keep, group = _FIXTURE_SHAPE.get(name, (None, None))
        df = df.reset_index()
        if keep is not None:
            df = df[["date", *keep]]
        df = df.groupby(group).tail(rows) if group else df.tail(rows)
        df = df.reset_index(drop=True)
        step = df.groupby(group).cumcount() if group else pd.Series(range(len(df)))
        for col in df.columns:
            if col != "date" and pd.api.types.is_numeric_dtype(df[col]):
                df[col] = (10.0 + step * 0.5).round(2)
        if name == "imf_pcps":
            # One non-USD row per symbol, so the USD filter has something to drop.
            extra = df.groupby("symbol").tail(1).assign(data_transformation_code="INDEX")
            df = pd.concat([df, extra], ignore_index=True)
        out[name] = df
    return out


def _write_fixture() -> None:
    """Rebuild the committed synthetic fixture from the last real pull in data/raw/odp/."""
    raw = {p.stem: pd.read_csv(p).set_index("date") for p in sorted(RAW_DIR.glob("*.csv"))}
    if not raw:
        sys.exit(f"no raw frames in {RAW_DIR}: run without --fixture first")
    FIXTURE_DIR.mkdir(parents=True, exist_ok=True)
    for name, df in synthetic_fixture(raw).items():
        df.to_csv(FIXTURE_DIR / f"{name}.csv", index=False)
        print(f"  fixture {name}.csv: {len(df)} rows (synthetic values)")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=(__doc__ or "").split("\n", 1)[0])
    ap.add_argument("--since", default="2019-01-01", help="first date to pull (YYYY-MM-DD)")
    ap.add_argument(
        "--fixture",
        action="store_true",
        help="rebuild the synthetic test fixture from data/raw/odp/ (no network)",
    )
    args = ap.parse_args(argv)

    if args.fixture:
        _write_fixture()
        return 0

    t = time.monotonic()
    raw = pull(args.since)

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    for name, df in raw.items():
        df.to_csv(RAW_DIR / f"{name}.csv")
    tidy = tidy_all(raw)
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    tidy.to_parquet(OUT_PATH, index=False, compression="zstd")
    print(f"wrote {OUT_PATH.relative_to(REPO_ROOT)}: {len(tidy):,} rows")

    for series_id, key, window in [
        ("brent_usd_bbl", None, 12),
        ("transits_tanker", "hormuz", 30),
        ("crude_production", "SAU", 12),
    ]:
        rows = tidy[tidy["source"] != "eia_spot"] if series_id == "brent_usd_bbl" else tidy
        print(" ", latest_vs_trailing(rows, series_id=series_id, key=key, window=window))
    print(f"total {time.monotonic() - t:.0f}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
