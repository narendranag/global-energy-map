import { BUNDLED_CATALOG } from "@/lib/data-catalog/bundled";
import type { Catalog, CatalogEntry } from "@/lib/data-catalog/types";
import SCHEMAS from "./schema.generated.json";

/**
 * The tables the query console exposes, derived from `catalog.json` — the
 * generated manifest is the only source of truth for what exists, what it
 * costs to read and whether it may leave the browser (CLAUDE.md).
 *
 * One table per **Parquet file** (several catalog entries can share a file:
 * `assets.parquet` holds seven sources). The table name is the file stem, so
 * a new dataset added to the catalog shows up here without a code change.
 * GeoJSON sidecars are not SQL tables and are left out — the DuckDB spatial
 * extension was dropped as unreliable in the pinned build.
 */

export interface TableColumn {
  readonly name: string;
  /** Parquet logical type, as pyarrow prints it (e.g. "string", "int64"). */
  readonly type: string;
}

export interface QueryTable {
  /** SQL identifier: the file stem, e.g. `trade_flow`. */
  readonly name: string;
  /** Logical data path, hardcoded into the view SQL: `/data/trade_flow.parquet`. */
  readonly path: string;
  readonly label: string;
  readonly columns: readonly TableColumn[];
  readonly rows: number;
  /** Every catalog entry whose rows live in this file, in catalog order. */
  readonly sources: readonly CatalogEntry[];
  /** True only when every source of the file may be redistributed. */
  readonly downloadable: boolean;
  /** Why not, when it is view-only. */
  readonly downloadNote?: string;
}

interface SchemaFile {
  readonly tables: Readonly<Record<string, readonly TableColumn[]>>;
}

const SCHEMA = SCHEMAS as unknown as SchemaFile;

/** `/data/trade_flow.parquet` → `trade_flow`. */
export function tableNameForPath(path: string): string {
  return (path.split("/").pop() ?? path).replace(/\.parquet$/, "");
}

/**
 * One row per Parquet file in the catalog, sorted by table name. A file is
 * downloadable only when *every* entry sharing it is (`assets.parquet` mixes
 * ODbL OpenStreetMap rows in, so it is not) — the same rule /data applies.
 */
export function queryTables(catalog: Catalog = BUNDLED_CATALOG): QueryTable[] {
  const byPath = new Map<string, CatalogEntry[]>();
  for (const e of catalog.entries) {
    if (!e.path.endsWith(".parquet")) continue;
    byPath.set(e.path, [...(byPath.get(e.path) ?? []), e]);
  }
  const tables = [...byPath].map(([path, sources]) => {
    const downloadable = sources.every((s) => s.downloadable === true);
    const note = sources.find((s) => s.download_note !== undefined)?.download_note;
    return {
      name: tableNameForPath(path),
      path,
      label: sources.length === 1 ? (sources[0]?.label ?? path) : labelForShared(path, sources),
      columns: SCHEMA.tables[path] ?? [],
      rows: sources.reduce((n, s) => n + (s.rows ?? 0), 0),
      sources,
      downloadable,
      ...(downloadable ? {} : { downloadNote: note ?? "Not offered for download." }),
    } satisfies QueryTable;
  });
  return tables.sort((a, b) => a.name.localeCompare(b.name));
}

/** A file several sources share gets a neutral name, not the first source's. */
function labelForShared(path: string, sources: readonly CatalogEntry[]): string {
  return `${tableNameForPath(path)} (${String(sources.length)} sources)`;
}

/** Look a table up by its SQL name (DuckDB identifiers are case-insensitive). */
export function findTable(
  name: string,
  tables: readonly QueryTable[],
): QueryTable | undefined {
  const want = name.toLowerCase();
  return tables.find((t) => t.name.toLowerCase() === want);
}

export function findTableByPath(
  path: string,
  tables: readonly QueryTable[],
): QueryTable | undefined {
  return tables.find((t) => t.path === path);
}

/**
 * `CREATE OR REPLACE VIEW "x" AS SELECT * FROM read_parquet('/data/x.parquet')`.
 *
 * The logical path is the name `files.ts` registers the bytes under, so the
 * view reads the already-fetched buffer rather than the network.
 */
export function createViewSql(table: QueryTable): string {
  const ident = `"${table.name.replaceAll('"', '""')}"`;
  const literal = `'${table.path.replaceAll("'", "''")}'`;
  return `CREATE OR REPLACE VIEW ${ident} AS SELECT * FROM read_parquet(${literal})`;
}
