"""Ingest BACI bilateral trade data (HS92) filtered to our hydrocarbon HS6 codes.

Downloads the BACI HS92 zip from CEPII by range-fetching only the compressed block
for each year's CSV (each block is ~44-100 MB compressed).  Decompresses in-memory,
filters to the requested HS6 product codes, and saves one small filtered CSV per
product per year under data/raw/baci/:

    product   HS6      file
    2709      270900   BACI_HS92_Y{year}_crude.csv   (crude petroleum)
    271111    271111   baci_271111_{year}.csv        (liquefied natural gas)

Each year block is fetched ONCE and filtered for every requested product whose
file is missing (previously baci_2709 and baci_2711 each fetched all ~2.4 GB).

Also downloads the BACI-shipped country_codes_V202601.csv which maps BACI's internal
numeric country codes (e.g. 699=India, 842=USA) to ISO 3166-1 alpha-3.  This file is
required by the transform step — do NOT substitute pycountry, as BACI uses its own
country numbering that diverges from ISO numeric in 17+ cases.

BACI release: BACI_HS92_V202601
Coverage:     1995-2024 (30 years)
Source:       https://www.cepii.fr/CEPII/en/bdd_modele/bdd_modele_item.asp?id=37

The zip byte offsets below are specific to the V202601 archive; a new BACI
release needs them re-derived from its central directory.

Usage:
    uv run python -m scripts.ingest.baci [--force] [--product 2709|271111 ...]
    uv run python -m scripts.ingest.baci_2709 [--force]    # shim: crude only
    uv run python -m scripts.ingest.baci_2711 [--force]    # shim: LNG only
"""

from __future__ import annotations

import argparse
import io
import struct
import zlib
from dataclasses import dataclass
from pathlib import Path

import httpx
import pandas as pd

from scripts.common.download import HEADERS

RAW_DIR = Path("data/raw/baci")
BACI_URL = "https://www.cepii.fr/DATA_DOWNLOAD/baci/data/BACI_HS92_V202601.zip"
BACI_RELEASE = "V202601"


@dataclass(frozen=True)
class Product:
    hs6: int
    label: str
    filename: str  # per-year output file name, with a {year} placeholder


PRODUCTS: dict[str, Product] = {
    "2709": Product(270900, "crude petroleum", "BACI_HS92_Y{year}_crude.csv"),
    "271111": Product(271111, "liquefied natural gas", "baci_271111_{year}.csv"),
}

# ---------------------------------------------------------------------------
# Zip structure constants (probed from the real archive via central directory)
# ---------------------------------------------------------------------------
# Total file size of the zip (used for range requests on central directory)
_ZIP_FILE_SIZE = 2_417_732_497

# Each entry: (year, compressed_size, local_file_offset)
# Derived by parsing the zip central directory (ZIP spec: offset is at CDR pos+42).
_YEAR_ENTRIES: list[tuple[int, int, int]] = [
    (1995, 44_679_446, 0),
    (1996, 48_346_867, 44_679_519),
    (1997, 50_750_747, 93_026_459),
    (1998, 52_804_390, 143_777_279),
    (1999, 54_269_508, 196_581_742),
    (2000, 64_992_099, 250_851_323),
    (2001, 67_011_019, 315_843_495),
    (2002, 68_925_177, 382_854_587),
    (2003, 71_241_072, 451_779_837),
    (2004, 74_843_919, 523_020_982),
    (2005, 77_648_747, 597_864_974),
    (2006, 80_888_408, 675_513_794),
    (2007, 83_022_568, 756_402_275),
    (2008, 84_871_955, 839_424_916),
    (2009, 82_869_195, 924_296_944),
    (2010, 85_254_029, 1_007_166_212),
    (2011, 87_075_389, 1_092_420_314),
    (2012, 89_412_719, 1_179_495_776),
    (2013, 90_943_250, 1_268_908_568),
    (2014, 91_402_676, 1_359_851_891),
    (2015, 93_651_766, 1_451_254_640),
    (2016, 94_366_457, 1_544_906_479),
    (2017, 96_664_899, 1_639_273_009),
    (2018, 97_685_028, 1_735_937_981),
    (2019, 98_211_259, 1_833_623_082),
    (2020, 94_613_385, 1_931_834_414),
    (2021, 99_018_744, 2_026_447_872),
    (2022, 99_132_276, 2_125_466_689),
    (2023, 99_129_749, 2_224_599_038),
    (2024, 93_900_893, 2_323_728_860),
]

# country_codes file location in archive (from central directory parse)
_CC_LOCAL_OFFSET = 2_417_726_445
_CC_COMP_SIZE = 3_121
_CC_DATA_OFFSET = 2_417_726_500  # after 55-byte local file header

# Max local file header probe size (30 + max_name + max_extra)
_LFH_PROBE = 256


def _get_local_data_offset(local_file_offset: int) -> int:
    """Return the byte offset within the zip where compressed data starts.

    The local file header has variable-length name and extra fields; we probe
    the first 256 bytes to find the exact data start.
    """
    byte_end = local_file_offset + _LFH_PROBE - 1
    r = httpx.get(
        BACI_URL,
        headers={**HEADERS, "Range": f"bytes={local_file_offset}-{byte_end}"},
        timeout=30,
        follow_redirects=True,
    )
    r.raise_for_status()
    data = r.content
    sig = data[:4]
    if sig != b"PK\x03\x04":
        raise RuntimeError(
            f"Unexpected local file header signature at offset {local_file_offset}: {sig.hex()}"
        )
    name_len, extra_len = struct.unpack_from("<HH", data, 26)
    return local_file_offset + 30 + name_len + extra_len


def download_country_codes(force: bool = False) -> Path:
    """Download BACI country_codes_V202601.csv if not already present.

    IMPORTANT: This is BACI's own country code mapping.  BACI uses internal numeric
    codes that differ from ISO 3166-1 in 17+ cases (e.g. India=699, USA=842,
    France=251, Norway=579).  The transform script must use this file — not pycountry.
    """
    dest = RAW_DIR / f"country_codes_{BACI_RELEASE}.csv"
    if dest.exists() and not force:
        print(f"  country_codes: already exists, skipping ({dest})")
        return dest

    print("  country_codes: downloading...", flush=True)
    data_end = _CC_DATA_OFFSET + _CC_COMP_SIZE - 1
    r = httpx.get(
        BACI_URL,
        headers={**HEADERS, "Range": f"bytes={_CC_DATA_OFFSET}-{data_end}"},
        timeout=60,
        follow_redirects=True,
    )
    r.raise_for_status()
    decompressor = zlib.decompressobj(-zlib.MAX_WBITS)
    raw = decompressor.decompress(r.content)
    df = pd.read_csv(io.BytesIO(raw))
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    df.to_csv(dest, index=False)
    print(f"  country_codes: saved {len(df)} entries → {dest}")
    return dest


def dest_path(product: str, year: int, raw_dir: Path = RAW_DIR) -> Path:
    """Filtered per-year CSV path for *product* (a PRODUCTS key)."""
    return raw_dir / PRODUCTS[product].filename.format(year=year)


def filter_products(csv_bytes: bytes, hs6_codes: list[int]) -> dict[int, pd.DataFrame]:
    """Filter a decompressed BACI year CSV to each HS6 code in *hs6_codes*.

    Reads in 500k-row chunks to keep memory manageable. Returns one frame per
    code (possibly empty, but with the source columns).
    """
    parts: dict[int, list[pd.DataFrame]] = {code: [] for code in hs6_codes}
    for chunk in pd.read_csv(io.BytesIO(csv_bytes), dtype={"k": int}, chunksize=500_000):
        for code in hs6_codes:
            parts[code].append(chunk[chunk["k"] == code])
    return {
        code: pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()
        for code, frames in parts.items()
    }


def _fetch_year_csv(year: int, comp_size: int, local_offset: int) -> bytes:
    """Range-fetch and inflate one year's CSV from the BACI zip."""
    print(f"  {year}: finding data offset...", flush=True)
    data_start = _get_local_data_offset(local_offset)

    print(f"  {year}: downloading {comp_size / 1_048_576:.1f} MB compressed...", flush=True)
    r = httpx.get(
        BACI_URL,
        headers={**HEADERS, "Range": f"bytes={data_start}-{data_start + comp_size - 1}"},
        timeout=600,
        follow_redirects=True,
    )
    r.raise_for_status()

    print(f"  {year}: decompressing...", flush=True)
    return zlib.decompressobj(-zlib.MAX_WBITS).decompress(r.content)


def download_all(products: list[str], force: bool = False) -> list[Path]:
    """Download country_codes + every year's CSV filtered to each of *products*.

    Returns output paths (country codes first, then year files).
    """
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    paths: list[Path] = [download_country_codes(force=force)]

    for year, comp_size, local_offset in _YEAR_ENTRIES:
        dests = {p: dest_path(p, year) for p in products}
        pending = [p for p, d in dests.items() if force or not d.exists()]
        if not pending:
            print(f"  {year}: already exists, skipping ({', '.join(map(str, dests.values()))})")
        else:
            raw_bytes = _fetch_year_csv(year, comp_size, local_offset)
            codes = [PRODUCTS[p].hs6 for p in pending]
            print(f"  {year}: filtering to HS6={','.join(map(str, codes))} in chunks...")
            filtered = filter_products(raw_bytes, codes)
            del raw_bytes
            for p in pending:
                df = filtered[PRODUCTS[p].hs6]
                dests[p].parent.mkdir(parents=True, exist_ok=True)
                df.to_csv(dests[p], index=False)
                print(f"  {year}: saved {len(df):,} rows → {dests[p]}")
        paths.extend(dests.values())
    return paths


def main(argv: list[str] | None = None, products: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-download even if filtered CSV already exists",
    )
    parser.add_argument(
        "--product",
        action="append",
        choices=list(PRODUCTS),
        help="HS product to ingest (repeatable; default: all)",
    )
    args = parser.parse_args(argv)
    chosen = products or args.product or list(PRODUCTS)

    labels = ", ".join(f"{PRODUCTS[p].label} (HS6={PRODUCTS[p].hs6})" for p in chosen)
    print(f"Ingesting BACI HS92 {labels} into {RAW_DIR}/")
    paths = download_all(chosen, force=args.force)
    print(f"\nDone. {len(paths)} files in {RAW_DIR}/")
    for p in paths:
        print(f"  {p}")


if __name__ == "__main__":
    main()
