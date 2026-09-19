/**
 * Which tables and files a query reads — decided from DuckDB's **own** parse
 * tree (`json_serialize_sql`), never from a regular expression over the SQL
 * text. Export from the console is gated on this (export-gate.ts), so the
 * rule has to hold for quoted identifiers, CTEs, subqueries, joins, set
 * operations and direct `read_parquet('/data/…')` calls alike.
 *
 * Everything here is pure: the caller hands over the parsed JSON DuckDB
 * returned, and gets back either a resolved reference set or a list of
 * reasons the parse could not be trusted. **Anything unrecognised makes the
 * result unresolved**, and an unresolved result refuses export. The cost of a
 * false refusal is a researcher rewriting a query; the cost of a false
 * allowance is redistributing data we have no licence to redistribute.
 */

export interface SqlReferences {
  /** Base-table names read, lowercased, CTE names removed, deduplicated. */
  readonly tables: readonly string[];
  /** File paths read through `read_parquet()` / `parquet_scan()`. */
  readonly files: readonly string[];
  /** Non-empty when the parse tree could not be proven safe to reason about. */
  readonly unresolved: readonly string[];
}

/** Table-ref node types this walker understands. Anything else is unresolved. */
const KNOWN_TABLE_REFS = new Set([
  "BASE_TABLE",
  "TABLE_FUNCTION",
  "JOIN",
  "SUBQUERY",
  "EMPTY",
  "EXPRESSION_LIST",
]);

/** Table functions that read one of our shipped files, by a string argument. */
const FILE_FUNCTIONS = new Set(["read_parquet", "parquet_scan"]);

/** Query-node types a SELECT statement can be built from. */
const KNOWN_QUERY_NODES = new Set([
  "SELECT_NODE",
  "SET_OPERATION_NODE",
  "RECURSIVE_CTE_NODE",
  "CTE_NODE",
]);

type Json = Record<string, unknown>;

function isObject(v: unknown): v is Json {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? (v as unknown[]) : [];
}

/**
 * A table-reference node, as opposed to an expression. DuckDB tags every
 * expression with `class`; table refs carry `type` + `alias` + `sample`.
 */
function isTableRef(node: Json): boolean {
  return (
    typeof node.type === "string" &&
    !("class" in node) &&
    "alias" in node &&
    "sample" in node
  );
}

/**
 * Parse `json_serialize_sql(<sql>)`'s output into the set of tables and files
 * the statement reads.
 *
 * Refuses (returns `unresolved`) when: DuckDB reported a parse error, the
 * text holds anything other than exactly one statement, the statement is not
 * a SELECT, a table reference is of a kind this walker does not model, a
 * table is qualified with a catalog or schema, a table function other than
 * `read_parquet`/`parquet_scan` is used, a file argument is not a literal
 * string, or a CTE shadows the name of a real table.
 */
export function referencesFromSerializedSql(
  parsed: unknown,
  knownTableNames: readonly string[] = [],
): SqlReferences {
  const unresolved: string[] = [];
  const tables = new Set<string>();
  const files = new Set<string>();
  const ctes = new Set<string>();

  const refuse = (why: string) => unresolved.push(why);

  if (!isObject(parsed)) return blocked("DuckDB returned no parse tree for this query.");
  if (parsed.error !== false) {
    return blocked(str(parsed.error_message) ?? "DuckDB could not parse this query.");
  }
  const statements = arr(parsed.statements);
  if (statements.length !== 1) {
    return blocked(`Export needs exactly one statement; DuckDB parsed ${String(statements.length)}.`);
  }
  const statement: unknown = statements[0];
  if (
    !isObject(statement) ||
    !isObject(statement.node) ||
    !KNOWN_QUERY_NODES.has(str(statement.node.type) ?? "")
  ) {
    return blocked("Only a SELECT statement can be exported.");
  }

  walk(statement);

  function walk(value: unknown): void {
    if (Array.isArray(value)) {
      for (const v of value) walk(v);
      return;
    }
    if (!isObject(value)) return;

    // `WITH x AS (…)`: remember x so a reference to it is not read as a file.
    if (isObject(value.cte_map)) {
      for (const cte of arr(value.cte_map.map)) {
        if (isObject(cte)) {
          const key = str(cte.key);
          if (key !== undefined) ctes.add(key.toLowerCase());
        }
      }
    }

    if (isTableRef(value)) {
      const type = str(value.type) ?? "";
      if (!KNOWN_TABLE_REFS.has(type)) {
        refuse(`This query uses a ${type} table reference, which export cannot check.`);
      } else if (type === "BASE_TABLE") {
        readBaseTable(value);
      } else if (type === "TABLE_FUNCTION") {
        readTableFunction(value);
      }
    }

    for (const v of Object.values(value)) walk(v);
  }

  function readBaseTable(node: Json): void {
    const name = str(node.table_name);
    if (name === undefined) {
      refuse("A table reference has no name.");
      return;
    }
    const catalog = str(node.catalog_name) ?? "";
    const schema = str(node.schema_name) ?? "";
    if ((catalog !== "" && catalog !== "memory") || (schema !== "" && schema !== "main")) {
      refuse(`Export cannot check the qualified table ${catalog}.${schema}.${name}.`);
      return;
    }
    tables.add(name.toLowerCase());
  }

  function readTableFunction(node: Json): void {
    const fn = isObject(node.function) ? node.function : undefined;
    const name = (str(fn?.function_name) ?? "").toLowerCase();
    if (!FILE_FUNCTIONS.has(name)) {
      refuse(`Export cannot check what ${name === "" ? "this table function" : `${name}()`} reads.`);
      return;
    }
    const first: unknown = arr(fn?.children)[0];
    const literal =
      isObject(first) && isObject(first.value) && str(first.value.value) !== undefined
        ? str(first.value.value)
        : undefined;
    if (literal === undefined) {
      refuse(`${name}() must be given a single file path as plain text for export.`);
      return;
    }
    files.add(literal);
  }

  // A CTE that shadows a real table name would make "which file did this
  // read" ambiguous. Rare, and cheaper to refuse than to model scoping.
  for (const known of knownTableNames) {
    if (ctes.has(known.toLowerCase()) && tables.has(known.toLowerCase())) {
      refuse(`The name "${known}" is used both as a CTE and as a table.`);
    }
  }
  for (const cte of ctes) tables.delete(cte);

  return { tables: [...tables].sort(), files: [...files].sort(), unresolved };
}

function blocked(why: string): SqlReferences {
  return { tables: [], files: [], unresolved: [why] };
}
