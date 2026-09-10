"""Ingest the NETL GOGI storage layer (shim over scripts.ingest.netl_gogi)."""

from scripts.ingest.netl_gogi import ingest_layer


def main() -> None:
    ingest_layer("storage")


if __name__ == "__main__":
    main()
