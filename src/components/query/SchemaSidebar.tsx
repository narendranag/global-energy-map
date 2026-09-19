import type { QueryTable } from "@/lib/query/tables";

/**
 * What can be queried: one disclosure per table, with its columns and types,
 * row count, licence and whether a result that reads it may be saved as a
 * file. Everything comes from `catalog.json` via `queryTables()`, so the list
 * cannot drift from what the console actually registers.
 */
export function SchemaSidebar({ tables }: { readonly tables: readonly QueryTable[] }) {
  return (
    <aside aria-labelledby="schema-heading" className="min-w-0" data-testid="schema-sidebar">
      <h2 id="schema-heading" className="text-lg font-semibold tracking-tight text-ink">
        Tables
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        {tables.length} tables, one per Parquet file the site ships. Map geometry (pipelines,
        basins, country outlines) is GeoJSON and is not queryable here.
      </p>
      <ul className="mt-3 space-y-1.5">
        {tables.map((t) => (
          <li key={t.name}>
            <details className="rounded border border-slate-200 bg-white" data-testid={`table-${t.name}`}>
              <summary className="cursor-pointer list-none p-2.5 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-700">
                <span className="font-mono text-[13px] font-medium text-ink">{t.name}</span>
                <span className="ml-2 text-xs text-ink-muted">
                  {t.rows.toLocaleString("en-US")} rows
                </span>
                <span
                  className={`ml-2 rounded px-1.5 py-0.5 text-2xs font-medium ${
                    t.downloadable ? "bg-emerald-100 text-emerald-900" : "bg-slate-200 text-slate-800"
                  }`}
                >
                  {t.downloadable ? "downloadable" : "view-only"}
                </span>
              </summary>
              <div className="border-t border-slate-200 p-2.5">
                <table className="w-full text-xs">
                  <caption className="sr-only">Columns of {t.name}</caption>
                  <thead>
                    <tr className="text-left text-ink-subtle">
                      <th scope="col" className="pb-1 pr-3 font-semibold">
                        Column
                      </th>
                      <th scope="col" className="pb-1 font-semibold">
                        Type
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {t.columns.map((c) => (
                      <tr key={c.name}>
                        <td className="pr-3 font-mono text-ink">{c.name}</td>
                        <td className="font-mono text-ink-muted">{c.type}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <ul className="mt-2 space-y-1">
                  {t.sources.map((s) => (
                    <li key={s.id} className="text-xs leading-snug text-ink-muted">
                      {s.source_name} — {s.license}, as of {s.as_of}
                    </li>
                  ))}
                </ul>
                {!t.downloadable && (
                  <p className="mt-2 text-xs leading-snug text-ink-muted">
                    <strong className="text-ink">View-only.</strong> {t.downloadNote}
                  </p>
                )}
              </div>
            </details>
          </li>
        ))}
      </ul>
    </aside>
  );
}
