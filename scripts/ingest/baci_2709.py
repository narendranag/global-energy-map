"""Ingest BACI HS92 crude petroleum (HS6=270900) — shim over scripts.ingest.baci."""

from scripts.ingest import baci


def main(argv: list[str] | None = None) -> None:
    baci.main(argv, products=["2709"])


if __name__ == "__main__":
    main()
