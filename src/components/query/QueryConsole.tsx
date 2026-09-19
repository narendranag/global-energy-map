"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { downloadText, todayIso } from "@/lib/export/browser";
import { queryCsv, queryCsvFilename } from "@/lib/export/query-csv";
import { exportGate } from "@/lib/query/export-gate";
import { EXAMPLE_QUERIES, DEFAULT_QUERY } from "@/lib/query/examples";
import type { ConsoleResult } from "@/lib/query/engine";
import { queryTables } from "@/lib/query/tables";
import { decodeQuery, writeQueryToUrl } from "@/lib/query/url";
import { SchemaSidebar } from "./SchemaSidebar";
import { ResultTable } from "./ResultTable";

/**
 * The SQL console. **DuckDB-WASM is imported here and nowhere else**, inside
 * the Run handler — `await import("@/lib/query/engine")` — so the 7 MB wasm
 * is fetched on this route, on demand, and `/` keeps its 1.2 s cold load
 * (tests/e2e/network.spec.ts holds both halves of that).
 *
 * A textarea, not a code editor: a rich editor is real bundle weight for a
 * deliberately niche tool, and a plain labelled textarea is what screen
 * readers and keyboard users already know.
 */

/** Row caps offered; the largest is what the page will render at all. */
const ROW_LIMITS = [100, 1_000, 5_000] as const;
const DEFAULT_LIMIT = 1_000;

const LINK = "text-sky-800 underline underline-offset-2 hover:text-sky-950";
const BUTTON =
  "rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-ink hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-700 disabled:cursor-not-allowed disabled:opacity-60";

export function QueryConsole() {
  const tables = useMemo(() => queryTables(), []);
  const [sql, setSql] = useState(DEFAULT_QUERY);
  const [limit, setLimit] = useState<number>(DEFAULT_LIMIT);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ConsoleResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const editorId = useId();
  const hintId = useId();
  const editor = useRef<HTMLTextAreaElement>(null);

  // A shared link carries the SQL; the editor is the source of truth after that.
  useEffect(() => {
    const fromUrl = decodeQuery(new URLSearchParams(window.location.search).get("q"));
    // Reading location during render would differ from the server's HTML and
    // break hydration, so a shared query is adopted once, after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- external source (the URL), read once
    if (fromUrl !== null) setSql(fromUrl);
  }, []);

  const run = useCallback(
    async (text: string) => {
      setRunning(true);
      setError(null);
      try {
        // The one dynamic import that pulls DuckDB-WASM into the page.
        const engine = await import("@/lib/query/engine");
        const out = await engine.runConsoleQuery(text, { limit });
        setResult(out);
        setWarning(engine.coreVersionWarning());
        writeQueryToUrl(text);
      } catch (err: unknown) {
        // A SQL typo is expected input, not an application failure: it is
        // shown here, never through the app's global error panel.
        setError(err instanceof Error ? err.message : String(err));
        setResult(null);
      } finally {
        setRunning(false);
      }
    },
    [limit],
  );

  const gate = useMemo(
    () => (result === null ? null : exportGate(result.references, tables)),
    [result, tables],
  );

  const download = useCallback(() => {
    if (result === null || gate?.allowed !== true) return;
    const exported = todayIso();
    downloadText(
      queryCsvFilename(exported),
      queryCsv(result.columns, result.rows, {
        sql,
        viewUrl: window.location.href,
        exported,
        tables: gate.tables,
        truncated: result.truncated,
        rowLimit: limit,
      }),
      "text/csv",
    );
  }, [result, gate, sql, limit]);

  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(sql);
          }}
        >
          <label htmlFor={editorId} className="block text-sm font-semibold text-ink">
            SQL query
          </label>
          <p id={hintId} className="mt-1 text-xs text-ink-muted">
            One SELECT statement over the tables listed beside this box. Press{" "}
            <kbd className="rounded border border-slate-300 bg-slate-50 px-1 font-mono text-2xs">
              Ctrl
            </kbd>
            {" / "}
            <kbd className="rounded border border-slate-300 bg-slate-50 px-1 font-mono text-2xs">
              ⌘
            </kbd>
            {" + "}
            <kbd className="rounded border border-slate-300 bg-slate-50 px-1 font-mono text-2xs">
              Enter
            </kbd>{" "}
            to run. Everything runs in your browser; nothing is sent anywhere.
          </p>
          <textarea
            id={editorId}
            ref={editor}
            aria-describedby={hintId}
            value={sql}
            spellCheck={false}
            rows={14}
            onChange={(e) => {
              setSql(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void run(sql);
              }
            }}
            data-testid="query-editor"
            className="mt-2 w-full resize-y rounded border border-slate-300 bg-white p-3 font-mono text-[13px] leading-relaxed text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-700"
          />

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="submit" className={BUTTON} disabled={running} data-testid="run-query">
              {running ? "Running…" : "Run"}
            </button>
            <label className="flex items-center gap-2 text-sm text-ink-muted">
              Row limit
              <select
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                }}
                className="rounded border border-slate-300 bg-white px-2 py-1 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-700"
              >
                {ROW_LIMITS.map((n) => (
                  <option key={n} value={n}>
                    {n.toLocaleString("en-US")}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className={BUTTON}
              onClick={download}
              disabled={gate?.allowed !== true}
              data-testid="export-csv"
            >
              Download CSV
            </button>
            <span className="text-xs text-ink-muted" aria-live="polite" data-testid="query-status">
              {running
                ? "Loading the query engine and running…"
                : result === null
                  ? ""
                  : `${result.rows.length.toLocaleString("en-US")} ${result.rows.length === 1 ? "row" : "rows"} in ${result.elapsedMs.toLocaleString("en-US")} ms${result.truncated ? ` (cut at ${limit.toLocaleString("en-US")})` : ""}`}
            </span>
          </div>
        </form>

        {running && result === null && (
          <p className="mt-3 text-sm text-ink-muted">
            The first query loads DuckDB (about 7 MB, from this site) — later ones are instant.
          </p>
        )}

        {warning !== null && (
          <p
            role="alert"
            className="mt-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-ink"
            data-testid="engine-warning"
          >
            {warning}
          </p>
        )}

        {error !== null && (
          <div
            role="alert"
            className="mt-4 rounded border border-red-300 bg-red-50 p-3"
            data-testid="query-error"
          >
            <p className="text-sm font-semibold text-ink">That query did not run</p>
            <pre className="mt-1 overflow-x-auto whitespace-pre-wrap font-mono text-xs text-ink">
              {error}
            </pre>
          </div>
        )}

        {gate !== null && !gate.allowed && (
          <p className="mt-4 text-sm text-ink-muted" data-testid="export-blocked">
            <strong className="text-ink">Not downloadable.</strong> {gate.reason}{" "}
            <a
              href="https://github.com/narendranag/global-energy-map/blob/main/LICENSE-DATA.md"
              className={LINK}
            >
              LICENSE-DATA.md
            </a>{" "}
            explains the rule; the{" "}
            <a href="/data" className={LINK}>
              Data page
            </a>{" "}
            lists what may be downloaded.
          </p>
        )}

        {result !== null && (
          <ResultTable columns={result.columns} rows={result.rows} truncated={result.truncated} />
        )}

        <section className="mt-10" aria-labelledby="examples">
          <h2 id="examples" className="text-lg font-semibold tracking-tight text-ink">
            Example queries
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            Each one reproduces a number from the{" "}
            <a
              href="https://github.com/narendranag/global-energy-map/blob/main/docs/researchers/worked-examples.md"
              className={LINK}
            >
              worked examples
            </a>
            .
          </p>
          <ul className="mt-3 space-y-2">
            {EXAMPLE_QUERIES.map((ex) => (
              <li key={ex.id}>
                <button
                  type="button"
                  data-testid={`example-${ex.id}`}
                  onClick={() => {
                    setSql(ex.sql);
                    editor.current?.focus();
                  }}
                  className="w-full rounded border border-slate-200 bg-white p-3 text-left hover:border-slate-400 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-700"
                >
                  <span className="block text-sm font-medium text-ink">{ex.title}</span>
                  <span className="mt-0.5 block text-xs leading-snug text-ink-muted">
                    {ex.note}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <SchemaSidebar tables={tables} />
    </div>
  );
}
