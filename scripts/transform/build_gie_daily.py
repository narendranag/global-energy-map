"""Transform GIE AGSI + ALSI raw JSON → public/data/gie_daily.parquet.

Long format, matching country_year_series: one row per (iso3, gas_day, metric).
Daily resolution — the only daily series in the project.

Metrics
    gas_storage_full_pct    % of working gas volume in store   (AGSI `full`)
    gas_in_storage_twh      TWh currently in store             (AGSI `gasInStorage`)
    gas_working_volume_twh  TWh of usable capacity             (AGSI `workingGasVolume`)
    lng_send_out_gwh_d      GWh/day sent out from terminals    (ALSI `sendOut`)
    lng_inventory_gwh       GWh of LNG held at terminals       (ALSI `inventory.gwh`)

GIE writes "-" for a country-day with no applicable data — landlocked countries
have no LNG terminals, so every ALSI field for Austria is "-" for every day of
the series. Those become no row at all rather than a zero: absent and zero mean
very different things for send-out, and a chart that draws Austria's LNG
throughput as a flat zero line is stating something false.

Usage:
    uv run python -m scripts.transform.build_gie_daily
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd

from scripts.common.sources import GIE

RAW_DIR = GIE.raw_dir
OUT_PATH = Path("public/data/gie_daily.parquet")
SOURCE = GIE.name
SOURCE_VERSION = GIE.release

# GIE reports ISO-3166 alpha-2; the rest of the project keys on alpha-3.
# Explicit rather than a dependency: it is 24 rows and never changes silently.
ISO2_TO_ISO3 = {
    "AT": "AUT",
    "BE": "BEL",
    "BG": "BGR",
    "HR": "HRV",
    "CZ": "CZE",
    "DK": "DNK",
    "FR": "FRA",
    "DE": "DEU",
    "GR": "GRC",
    "HU": "HUN",
    "IE": "IRL",
    "IT": "ITA",
    "LV": "LVA",
    "LT": "LTU",
    "NL": "NLD",
    "PL": "POL",
    "PT": "PRT",
    "RO": "ROU",
    "SK": "SVK",
    "SI": "SVN",
    "ES": "ESP",
    "SE": "SWE",
    "GB": "GBR",
    "UA": "UKR",
}

# (raw field, metric name, unit). Nested ALSI fields use "parent.child".
AGSI_METRICS = [
    ("full", "gas_storage_full_pct", "percent"),
    ("gasInStorage", "gas_in_storage_twh", "TWh"),
    ("workingGasVolume", "gas_working_volume_twh", "TWh"),
]
ALSI_METRICS = [
    ("sendOut", "lng_send_out_gwh_d", "GWh/d"),
    ("inventory.gwh", "lng_inventory_gwh", "GWh"),
]


def _num(raw: object) -> float | None:
    """GIE numbers arrive as strings; "-" and "" mean no data, not zero."""
    if raw is None or isinstance(raw, (list, dict)):
        return None
    text = str(raw).strip()
    if text in {"", "-", "N/A", "n/a"}:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def _field(row: dict, path: str) -> object:
    """Read "a" or "a.b", tolerating GIE sending a scalar where a dict is expected."""
    if "." not in path:
        return row.get(path)
    parent, child = path.split(".", 1)
    value = row.get(parent)
    return value.get(child) if isinstance(value, dict) else None


def _read(dataset: str, metrics: list[tuple[str, str, str]]) -> list[dict]:
    out: list[dict] = []
    directory = RAW_DIR / dataset
    if not directory.is_dir():
        raise FileNotFoundError(
            f"{directory} missing — run `uv run python -m scripts.ingest.gie_daily` first"
        )
    for path in sorted(directory.glob("*.json")):
        iso2 = path.stem
        iso3 = ISO2_TO_ISO3.get(iso2)
        if iso3 is None:
            print(f"[{dataset}] skipping unmapped country code {iso2!r}", file=sys.stderr)
            continue
        for row in json.loads(path.read_text()):
            gas_day = row.get("gasDayStart")
            if not gas_day:
                continue
            for raw_field, metric, unit in metrics:
                value = _num(_field(row, raw_field))
                if value is None:
                    continue
                out.append(
                    {
                        "iso3": iso3,
                        "gas_day": gas_day,
                        "metric": metric,
                        "value": value,
                        "unit": unit,
                        # AGSI and ALSI are separate GIE platforms with separate
                        # operator reporting; keep which one a row came from.
                        "source": f"GIE {dataset.upper()}",
                    }
                )
    return out


def build() -> pd.DataFrame:
    rows = _read("agsi", AGSI_METRICS) + _read("alsi", ALSI_METRICS)
    df = pd.DataFrame(rows, columns=["iso3", "gas_day", "metric", "value", "unit", "source"])
    if df.empty:
        raise SystemExit("no GIE rows parsed — check data/raw/gie/")
    df["gas_day"] = pd.to_datetime(df["gas_day"]).dt.date
    df = df.drop_duplicates(["iso3", "gas_day", "metric"], keep="last")
    return df.sort_values(["metric", "iso3", "gas_day"]).reset_index(drop=True)


def main() -> None:
    df = build()
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(OUT_PATH, index=False, compression="zstd")
    per_metric = df["metric"].value_counts().to_dict()
    print(
        f"wrote {OUT_PATH}  rows={len(df)}  countries={df['iso3'].nunique()}  "
        f"days={df['gas_day'].min()}…{df['gas_day'].max()}"
    )
    for metric, n in sorted(per_metric.items()):
        countries = df.loc[df["metric"] == metric, "iso3"].nunique()
        print(f"    {metric:<24} rows={n:>7}  countries={countries}")


if __name__ == "__main__":
    main()
