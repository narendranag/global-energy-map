import type { QueryTable } from "@/lib/query/tables";
import { apaCitation, attributionsFor, sourceCitationLine, type SiteCitation } from "./citation";
import { toCsv, type CsvValue } from "./csv";

/**
 * A console result as CSV, with the same `#` citation header the scenario
 * export carries: what produced the rows, the query that produced them, and
 * one line per source the query read, with its licence and as-of date.
 *
 * The header makes the file self-documenting — a reviewer can see the exact
 * SQL and re-run it — and it carries the attributions the CC BY 4.0 sources
 * require. `read_csv(path, comment="#")` skips it.
 */

export interface QueryExportContext {
  readonly sql: string;
  readonly viewUrl: string;
  /** YYYY-MM-DD */
  readonly exported: string;
  /** Tables the query read, resolved from DuckDB's parse tree. */
  readonly tables: readonly QueryTable[];
  readonly truncated: boolean;
  readonly rowLimit: number;
  readonly site?: SiteCitation;
}

export function queryCsvComments(ctx: QueryExportContext): string[] {
  const entries = ctx.tables.flatMap((t) => [...t.sources]);
  const lines = [
    "Global Energy Map — query console result (derived analysis, not source data).",
    apaCitation(ctx.site, { viewUrl: ctx.viewUrl, accessed: ctx.exported }),
    "",
    "Query:",
    ...ctx.sql.trim().split(/\r?\n/),
    "",
    ctx.truncated
      ? `Rows: cut at the console's ${String(ctx.rowLimit)}-row display cap — re-run with your own LIMIT for the full result.`
      : `Rows: the complete result (under the console's ${String(ctx.rowLimit)}-row cap).`,
    "",
  ];
  if (entries.length > 0) {
    lines.push("Sources read by this query:", ...entries.map((e) => `- ${sourceCitationLine(e)}`));
    const attributions = attributionsFor(entries);
    if (attributions.length > 0) {
      lines.push("", "Required attributions:", ...attributions.map((a) => `- ${a}`));
    }
  } else {
    lines.push("This query read no catalogued table.");
  }
  return lines;
}

export function queryCsv(
  columns: readonly string[],
  rows: readonly Record<string, CsvValue>[],
  ctx: QueryExportContext,
): string {
  return toCsv(columns, rows, queryCsvComments(ctx));
}

/** `query-result-2026-09-19.csv` */
export function queryCsvFilename(exported: string): string {
  return `query-result-${exported}.csv`;
}
