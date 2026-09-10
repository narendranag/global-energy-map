"""Ingest the NETL GOGI basins layer (shim over scripts.ingest.netl_gogi)."""

from scripts.ingest.netl_gogi import ingest_layer


def main() -> None:
    ingest_layer("basins")


if __name__ == "__main__":
    main()
