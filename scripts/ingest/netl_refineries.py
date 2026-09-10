"""Ingest the NETL GOGI refineries layer (shim over scripts.ingest.netl_gogi)."""

from scripts.ingest.netl_gogi import ingest_layer


def main() -> None:
    ingest_layer("refineries")


if __name__ == "__main__":
    main()
