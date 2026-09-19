"""Record DuckDB's own parse trees for the /query export-gate unit tests.

`src/lib/query/references.ts` decides which tables a query reads by walking
`json_serialize_sql()`'s output rather than by pattern-matching the SQL text.
Its unit tests therefore need *real* parse trees, not hand-written ones — this
script produces them, so the fixtures can be regenerated after a DuckDB bump:

    uv run python -m scripts.dev.serialize_sql_fixtures

The Python and WASM builds share the serializer, so a tree recorded here is
the tree the browser will hand the walker.
"""

import json
from pathlib import Path

import duckdb

OUT = Path("tests/unit/query/fixtures/serialized-sql.json")

# name → SQL. Each case exists to pin one decision the export gate makes.
CASES: dict[str, str] = {
    "simple": "SELECT * FROM trade_flow",
    "join": "SELECT a.name FROM assets a JOIN country_year_series c ON a.country_iso3 = c.iso3",
    "cte": "WITH t AS (SELECT * FROM trade_flow) SELECT * FROM t",
    "cte_shadowing_a_table": "WITH trade_flow AS (SELECT 1 AS x) SELECT * FROM trade_flow",
    "subquery": (
        "SELECT * FROM (SELECT importer_iso3 FROM trade_flow) x "
        "WHERE x.importer_iso3 IN (SELECT iso3 FROM country_year_series)"
    ),
    "quoted_identifiers": 'SELECT * FROM "trade_flow" AS "tf"',
    "read_parquet_direct": "SELECT * FROM read_parquet('/data/assets.parquet')",
    "read_parquet_view_only": "SELECT * FROM read_parquet('/data/gie_daily.parquet')",
    "read_csv": "SELECT * FROM read_csv('https://example.invalid/x.csv')",
    "read_parquet_list_arg": (
        "SELECT * FROM read_parquet(['/data/assets.parquet', '/data/trade_flow.parquet'])"
    ),
    "set_operation": (
        "SELECT iso3 FROM country_year_series UNION ALL SELECT importer_iso3 FROM trade_flow"
    ),
    "scalar_subquery_over_file": (
        "SELECT (SELECT count(*) FROM read_parquet('/data/gie_daily.parquet')) AS n"
    ),
    "recursive_cte": (
        "WITH RECURSIVE r(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM r WHERE n < 3) "
        "SELECT * FROM r"
    ),
    "values_list": "SELECT * FROM (VALUES (1), (2)) v(x)",
    "constant_only": "SELECT 1 AS a",
    "qualified_memory_main": "SELECT * FROM memory.main.trade_flow",
    "qualified_other_catalog": "SELECT * FROM other.main.trade_flow",
    "two_statements": "SELECT 1; SELECT 2",
    "non_select": "CREATE TABLE x AS SELECT 1",
    "syntax_error": "SELECT FROM WHERE",
}


def main() -> None:
    con = duckdb.connect()
    trees = {
        name: json.loads(con.execute("SELECT json_serialize_sql(?)", [sql]).fetchone()[0])
        for name, sql in CASES.items()
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(
            {
                "_generated_by": "scripts/dev/serialize_sql_fixtures.py — do not edit",
                "duckdb": duckdb.__version__,
                "sql": CASES,
                "trees": trees,
            },
            indent=2,
        )
        + "\n"
    )
    print(f"wrote {OUT}  cases={len(CASES)}  duckdb={duckdb.__version__}")


if __name__ == "__main__":
    main()
