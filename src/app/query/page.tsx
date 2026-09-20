import type { Metadata } from "next";
import Link from "next/link";
import { QueryConsole } from "@/components/query/QueryConsole";
import { SiteFooter } from "@/components/ui/SiteFooter";

const LICENSE_DATA_URL = "https://github.com/narendranag/global-energy-map/blob/main/LICENSE-DATA.md";
const LINK = "text-sky-800 underline underline-offset-2 hover:text-sky-950";

export const metadata: Metadata = {
  title: "Query console",
  description:
    "Run SQL against the Global Energy Map's Parquet tables in your browser: trade flows, disruption routes, LNG voyages, assets and daily gas storage. Nothing is sent to a server.",
};

export default function QueryPage() {
  return (
    <div className="w-full bg-white text-ink">
      <main className="mx-auto w-full max-w-7xl px-6 py-10">
        <nav aria-label="Breadcrumb" className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <Link href="/" className="text-sky-800 underline-offset-2 hover:text-sky-950 hover:underline">
            ← Back to map
          </Link>
          <Link href="/methodology" className="text-sky-800 underline-offset-2 hover:text-sky-950 hover:underline">
            Methodology
          </Link>
          <Link href="/data" className="text-sky-800 underline-offset-2 hover:text-sky-950 hover:underline">
            Data
          </Link>
        </nav>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-ink">Query console</h1>
        <div className="mt-4 max-w-3xl space-y-3 text-base leading-relaxed text-ink-muted">
          <p>
            SQL over the same Parquet files the map reads, run by{" "}
            <a href="https://duckdb.org/docs/api/wasm/overview" className={LINK}>
              DuckDB-WASM
            </a>{" "}
            <strong className="text-ink">inside your browser</strong>. There is no query server:
            the engine and the data are fetched from this site, the query never leaves your
            machine, and nothing about it is recorded. The first query downloads the engine (about
            7 MB, cached afterwards) and only the tables it names.
          </p>
          <p>
            <strong className="text-ink">Every table can be read here; not every result can be
            saved.</strong>{" "}
            The map already displays all of these rows, so reading them is nothing new — but a CSV
            is redistribution, so <em>Download CSV</em> is offered only when every table the query
            reads is openly licensed, exactly as on the{" "}
            <Link href="/data" className={LINK}>
              Data page
            </Link>
            . A join that pulls in a view-only table (Energy Institute reserves, Gas Infrastructure
            Europe, UN Comtrade, or <code className="font-mono text-[0.85em]">assets</code> with its
            OpenStreetMap rows) blocks the download and says which table did it. See{" "}
            <a href={LICENSE_DATA_URL} className={LINK}>
              LICENSE-DATA.md
            </a>
            .
          </p>
          <p>
            Your query travels in the address bar, so a link to this page carries the SQL with it.
            Exported CSVs start with <code className="font-mono text-[0.85em]">#</code> comment
            lines giving the query and citing every source it read.
          </p>
        </div>

        <QueryConsole />
        <SiteFooter />
      </main>
    </div>
  );
}
