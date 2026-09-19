import type { ConsoleValue } from "@/lib/query/engine";

/** Rows rendered at once. Beyond this the browser, not DuckDB, is the limit. */
export const RENDER_CAP = 500;

/**
 * The result grid. Capped independently of the query's row limit: DuckDB will
 * happily return 5,000 rows, but 5,000 × N DOM cells is what makes a page
 * feel broken. The cap is stated rather than silent, and the CSV export
 * carries the full (limited) result regardless of what is drawn.
 */
export function ResultTable({
  columns,
  rows,
  truncated,
}: {
  readonly columns: readonly string[];
  readonly rows: readonly Record<string, ConsoleValue>[];
  readonly truncated: boolean;
}) {
  const shown = rows.slice(0, RENDER_CAP);
  return (
    <section className="mt-6" aria-labelledby="results-heading" data-testid="query-results">
      <h2 id="results-heading" className="text-lg font-semibold tracking-tight text-ink">
        Result
      </h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-ink-muted">No rows.</p>
      ) : (
        <>
          <div className="mt-2 max-h-[32rem] overflow-auto rounded border border-slate-200">
            <table className="w-full text-sm">
              <caption className="sr-only">
                Query result: {rows.length} rows, {columns.length} columns
              </caption>
              <thead className="sticky top-0 bg-slate-50">
                <tr className="text-left">
                  {columns.map((c) => (
                    <th
                      key={c}
                      scope="col"
                      className="whitespace-nowrap border-b border-slate-200 px-3 py-2 font-mono text-xs font-semibold text-ink"
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((row, i) => (
                  // Result rows have no stable identity; the index is the row.
                  <tr key={i} className="even:bg-slate-50/60">
                    {columns.map((c) => (
                      <td
                        key={c}
                        className="whitespace-nowrap border-b border-slate-100 px-3 py-1.5 font-mono text-xs text-ink tabular-nums"
                      >
                        {format(row[c])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-ink-muted">
            {shown.length < rows.length
              ? `Showing the first ${RENDER_CAP.toLocaleString("en-US")} of ${rows.length.toLocaleString("en-US")} rows; the CSV holds all of them.`
              : `${rows.length.toLocaleString("en-US")} ${rows.length === 1 ? "row" : "rows"}.`}
            {truncated && " The query returned more than the row limit, so the result was cut."}
          </p>
        </>
      )}
    </section>
  );
}

function format(v: ConsoleValue | undefined): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  return v;
}
