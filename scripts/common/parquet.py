"""Declared schemas for every shipped Parquet table + the shared assets writer.

``assets.parquet`` is shared by five transforms, each owning one or more
``kind`` values:

    kind(s)                    transform
    extraction_site            build_assets
    refinery                   build_refineries
    storage                    build_storage
    port                       build_ports
    lng_export, lng_import     build_lng_terminals

They all write through :func:`append_kind`, which drops the caller's kinds,
conforms the new rows to :data:`ASSETS_SCHEMA`, concatenates, orders rows by
the owning transform (:data:`KIND_RANK`, stable, so each writer's own row order
is kept) and writes with the explicit ``pyarrow`` schema. Because of the rank
ordering the file is the same whichever transform ran last, so re-running any
single transform is idempotent and leaves the other kinds untouched.

Nullability: every physical Parquet field stays nullable (that is what pandas
writes and what DuckDB-WASM reads); the columns that must never be null are
listed in ``REQUIRED`` and enforced by :func:`append_kind` and by
``tests/python/test_schemas.py``.
"""

from __future__ import annotations

import sys
from collections.abc import Iterable
from pathlib import Path

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

ASSETS_PATH = Path("public/data/assets.parquet")

_S = pa.large_string()  # what pandas' string dtypes map to; kept for byte-stable files

ASSETS_SCHEMA = pa.schema(
    [
        ("asset_id", _S),
        ("kind", _S),
        ("name", _S),
        ("country_iso3", _S),
        ("lon", pa.float64()),
        ("lat", pa.float64()),
        ("capacity", pa.float64()),
        ("capacity_unit", _S),
        ("operator", _S),
        ("status", _S),
        ("commissioned_year", pa.int64()),
        ("decommissioned_year", pa.int64()),
        ("source", _S),
        ("source_version", _S),
        ("unit_count", pa.int64()),
        ("total_processed_bcm", pa.int64()),
        ("un_locode", _S),
    ]
)

# Row order of assets.parquet: by owning transform, in the build_all order.
KIND_RANK: dict[str, int] = {
    "extraction_site": 0,
    "refinery": 1,
    "storage": 2,
    "port": 3,
    "lng_export": 4,
    "lng_import": 4,
}

COUNTRY_YEAR_SCHEMA = pa.schema(
    [
        ("iso3", _S),
        ("year", pa.int64()),
        ("metric", _S),
        ("value", pa.float64()),
        ("unit", _S),
        ("source", _S),
    ]
)

TRADE_FLOW_SCHEMA = pa.schema(
    [
        ("year", pa.int64()),
        ("importer_iso3", _S),
        ("exporter_iso3", _S),
        ("hs_code", _S),
        ("value_usd", pa.float64()),
        ("qty", pa.float64()),
        ("qty_unit", _S),
        ("source", _S),
    ]
)

DISRUPTION_ROUTE_SCHEMA = pa.schema(
    [
        ("disruption_id", _S),
        ("kind", _S),
        ("exporter_iso3", _S),
        ("importer_iso3", _S),
        ("share", pa.float64()),
        ("source", _S),
        ("source_title", _S),
        ("source_url", _S),
        ("source_year", pa.int32()),
        ("source_note", _S),
    ]
)

LNG_VOYAGE_SCHEMA = pa.schema(
    [
        ("voyage_id", _S),
        ("start_date", pa.date32()),
        ("end_date", pa.date32()),
        ("imo", pa.int64()),
        ("voyage_type", _S),
        ("from_terminal", _S),
        ("to_terminal", _S),
        ("from_country", _S),
        ("to_country", _S),
        ("from_country_iso3", _S),
        ("to_country_iso3", _S),
        ("amount_cbm", pa.int64()),
        ("confidence_score", pa.int8()),
        ("voyage_distance_km", pa.int64()),
        ("source", _S),
        ("source_version", _S),
    ]
)

LNG_TRADE_DAILY_SCHEMA = pa.schema(
    [
        ("date", pa.date32()),
        ("type", _S),
        ("from_country", _S),
        ("to_country", _S),
        ("from_country_iso3", _S),
        ("to_country_iso3", _S),
        ("amount_cbm", pa.int64()),
        ("voyage_distance_km", pa.float64()),
        ("confidence_score", pa.float32()),
        ("source", _S),
        ("source_version", _S),
    ]
)

LNG_TERMINAL_DAILY_SCHEMA = pa.schema(
    [
        ("terminal_name", _S),
        ("date", pa.date32()),
        ("processed_cbm", pa.int64()),
        ("source", _S),
        ("source_version", _S),
    ]
)

# Shipped file name → declared schema (tests/python/test_schemas.py checks each).
SCHEMAS: dict[str, pa.Schema] = {
    "assets.parquet": ASSETS_SCHEMA,
    "country_year_series.parquet": COUNTRY_YEAR_SCHEMA,
    "trade_flow.parquet": TRADE_FLOW_SCHEMA,
    "disruption_route.parquet": DISRUPTION_ROUTE_SCHEMA,
    "lng_voyage.parquet": LNG_VOYAGE_SCHEMA,
    "lng_trade_daily.parquet": LNG_TRADE_DAILY_SCHEMA,
    "lng_terminal_daily.parquet": LNG_TERMINAL_DAILY_SCHEMA,
}

# Columns that must never be null, per shipped file.
REQUIRED: dict[str, tuple[str, ...]] = {
    "assets.parquet": (
        "asset_id",
        "kind",
        "name",
        "country_iso3",
        "lon",
        "lat",
        "source",
        "source_version",
    ),
    "country_year_series.parquet": ("iso3", "year", "metric", "value", "unit", "source"),
    "trade_flow.parquet": ("year", "importer_iso3", "exporter_iso3", "hs_code", "source"),
    "disruption_route.parquet": ("disruption_id", "kind", "exporter_iso3", "share", "source"),
    "lng_voyage.parquet": (
        "voyage_id",
        "start_date",
        "from_terminal",
        "to_terminal",
        "from_country_iso3",
        "to_country_iso3",
        "source",
    ),
    "lng_trade_daily.parquet": ("date", "from_country_iso3", "to_country_iso3", "source"),
    "lng_terminal_daily.parquet": ("terminal_name", "date", "source"),
}


def _pandas_dtype(t: pa.DataType) -> object:
    """Nullable pandas dtype used to hold a column of arrow type *t*."""
    if pa.types.is_large_string(t) or pa.types.is_string(t):
        return pd.StringDtype()
    if t == pa.float64():
        return "Float64"
    if pa.types.is_integer(t):
        return pd.Int64Dtype() if t == pa.int64() else str(t).capitalize()
    raise TypeError(f"no pandas dtype mapping for {t}")


def conform(df: pd.DataFrame, schema: pa.Schema) -> pd.DataFrame:
    """Return *df* with exactly the schema's columns, in order, with nullable dtypes.

    Missing columns are added as all-null; extra columns are an error (a writer
    silently dropping data is worse than a loud failure).
    """
    extra = [c for c in df.columns if c not in schema.names]
    if extra:
        raise ValueError(f"columns not in the declared schema: {extra}")
    out = pd.DataFrame(index=df.index)
    for field in schema:
        dtype = _pandas_dtype(field.type)
        if field.name in df.columns:
            col = df[field.name]
            if dtype == "Float64":
                col = pd.to_numeric(col, errors="raise")
            out[field.name] = col.astype(dtype)
        else:
            out[field.name] = pd.Series(pd.NA, index=df.index, dtype=dtype)
    # lon/lat are plain (non-nullable) doubles.
    for c in ("lon", "lat"):
        if c in out.columns and schema.field(c).type == pa.float64():
            out[c] = out[c].astype("float64")
    return out


def check_required(df: pd.DataFrame, required: Iterable[str], label: str) -> None:
    bad = {c: int(df[c].isna().sum()) for c in required if df[c].isna().any()}
    if bad:
        raise ValueError(f"{label}: null values in required columns {bad}")


def append_kind(
    df: pd.DataFrame,
    kinds: str | Iterable[str],
    path: Path = ASSETS_PATH,
    schema: pa.Schema = ASSETS_SCHEMA,
) -> pd.DataFrame:
    """Replace the rows of *kinds* in the assets file at *path* with *df*.

    Drops every existing row whose ``kind`` is in *kinds* (and any orphan row
    with a null ``kind``), conforms *df* to *schema*, concatenates, orders rows
    by :data:`KIND_RANK` (stable) and writes with the explicit schema. A
    missing file is written fresh. Returns the combined frame.
    """
    owned = {kinds} if isinstance(kinds, str) else set(kinds)
    new = conform(df, schema)
    stray = set(new["kind"].dropna()) - owned
    if stray:
        raise ValueError(f"rows with kinds {sorted(stray)} passed to append_kind({sorted(owned)})")

    if path.exists():
        existing = pd.read_parquet(path)
        n_before = len(existing)
        existing = existing[existing["kind"].notna() & ~existing["kind"].isin(owned)]
        if n_before != len(existing):
            print(
                f"dropped {n_before - len(existing)} stale {'/'.join(sorted(owned))} rows "
                f"from {path}",
                file=sys.stderr,
            )
        existing = conform(existing, schema)
        frames = [f for f in (existing, new) if not f.empty]
        combined = pd.concat(frames, ignore_index=True) if frames else new
    else:
        combined = new

    rank = combined["kind"].map(KIND_RANK).fillna(len(KIND_RANK)).astype(int)
    combined = combined.iloc[rank.argsort(kind="stable")].reset_index(drop=True)
    combined = conform(combined, schema)

    check_required(combined, REQUIRED["assets.parquet"], str(path))
    if not combined["asset_id"].is_unique:
        dup = combined.loc[combined["asset_id"].duplicated(keep=False), "asset_id"]
        raise ValueError(f"duplicate asset_id values: {sorted(set(dup))[:10]}")

    path.parent.mkdir(parents=True, exist_ok=True)
    pq.write_table(
        pa.Table.from_pandas(combined, schema=schema, preserve_index=False),
        path,
        compression="zstd",
    )
    return combined
