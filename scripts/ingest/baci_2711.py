"""Ingest BACI HS92 liquefied natural gas (HS6=271111) — shim over scripts.ingest.baci."""

from scripts.ingest import baci


def main(argv: list[str] | None = None) -> None:
    baci.main(argv, products=["271111"])


if __name__ == "__main__":
    main()
