import fs from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";
import Link from "next/link";
import { Marked } from "marked";
import type { Catalog, CatalogEntry } from "@/lib/data-catalog/types";
import { parseCatalog } from "@/lib/data-catalog";

export const metadata: Metadata = {
  title: "Methodology",
  description:
    "Sources, licences, coverage and simplifications behind the Global Energy Map layers and disruption scenarios.",
};

/**
 * Optional provenance fields the catalog builder may emit (bytes, rows,
 * sha256, attribution). Read defensively from the raw entry so this page works
 * whether or not `CatalogEntry` declares them.
 */
interface EntryExtras {
  readonly bytes: number | undefined;
  readonly rows: number | undefined;
  readonly attribution: string | undefined;
}

function readExtras(entry: CatalogEntry): EntryExtras {
  const raw = entry as unknown as Record<string, unknown>;
  const num = (v: unknown): number | undefined =>
    typeof v === "number" && Number.isFinite(v) ? v : undefined;
  const str = (v: unknown): string | undefined =>
    typeof v === "string" && v.trim() !== "" ? v : undefined;
  return {
    bytes: num(raw.bytes),
    rows: num(raw.rows),
    attribution: str(raw.attribution),
  };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`;
  const units = ["KB", "MB", "GB"] as const;
  let value = bytes / 1024;
  let unit: (typeof units)[number] = units[0];
  for (let i = 1; i < units.length && value >= 1024; i++) {
    value /= 1024;
    unit = units[i] ?? unit;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${unit}`;
}

async function readCatalog(): Promise<Catalog> {
  const raw = await fs.readFile(
    path.join(process.cwd(), "public", "data", "catalog.json"),
    "utf8",
  );
  return parseCatalog(JSON.parse(raw) as unknown);
}

async function readMethodology(): Promise<string> {
  return fs.readFile(path.join(process.cwd(), "docs", "methodology.md"), "utf8");
}

const markdown = new Marked({ gfm: true });

/**
 * Render the methodology doc to HTML at build time. The leading `# …` title is
 * dropped because the page supplies its own <h1>. Source is the repo's own
 * docs/methodology.md (trusted, build-time), so injecting the HTML is safe.
 */
function renderMethodology(md: string): string {
  const body = md.replace(/^\s*#\s[^\n]*\n/, "");
  return markdown.parse(body, { async: false });
}

// Element-level styles for the rendered markdown (no @tailwindcss/typography).
const PROSE = [
  "text-[15px] leading-relaxed text-slate-700",
  "[&_h2]:mt-10 [&_h2]:border-b [&_h2]:border-slate-200 [&_h2]:pb-1 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:text-slate-900",
  "[&_h3]:mt-8 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-slate-900",
  "[&_h4]:mt-6 [&_h4]:font-semibold [&_h4]:text-slate-900",
  "[&_p]:mt-3",
  "[&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:mt-1",
  "[&_a]:text-blue-700 [&_a]:underline [&_a:hover]:text-blue-900",
  "[&_strong]:font-semibold [&_strong]:text-slate-900",
  "[&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em]",
  "[&_pre]:mt-3 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-slate-100 [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0",
  "[&_blockquote]:mt-3 [&_blockquote]:border-l-4 [&_blockquote]:border-slate-300 [&_blockquote]:pl-4 [&_blockquote]:text-slate-600",
  "[&_table]:mt-4 [&_table]:block [&_table]:w-full [&_table]:overflow-x-auto [&_table]:text-sm",
  "[&_th]:border-b [&_th]:border-slate-300 [&_th]:py-1.5 [&_th]:pr-4 [&_th]:text-left [&_th]:font-semibold",
  "[&_td]:border-t [&_td]:border-slate-200 [&_td]:py-1.5 [&_td]:pr-4 [&_td]:align-top",
  "[&_hr]:my-8 [&_hr]:border-slate-200",
].join(" ");

export default async function AboutPage() {
  const [catalog, methodology] = await Promise.all([readCatalog(), readMethodology()]);
  const html = renderMethodology(methodology);

  const rows = catalog.entries.map((entry) => ({ entry, extras: readExtras(entry) }));
  const showRows = rows.some((r) => r.extras.rows !== undefined);
  const showSize = rows.some((r) => r.extras.bytes !== undefined);
  const attributions = [
    ...new Set(rows.map((r) => r.extras.attribution).filter((a): a is string => a !== undefined)),
  ];

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12 text-slate-800">
      <Link
        href="/"
        className="text-sm text-blue-700 underline-offset-2 hover:text-blue-900 hover:underline"
      >
        ← Back to map
      </Link>
      <h1 className="mt-4 text-3xl font-bold text-slate-900">Methodology</h1>
      <div className={PROSE} dangerouslySetInnerHTML={{ __html: html }} />

      <h2 className="mt-12 text-2xl font-semibold text-slate-900">Data sources</h2>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="py-2 pr-4">Label</th>
              <th className="py-2 pr-4">Source</th>
              <th className="py-2 pr-4">License</th>
              <th className="py-2 pr-4">As of</th>
              {showRows && <th className="py-2 pr-4 text-right">Rows</th>}
              {showSize && <th className="py-2 pr-4 text-right">Size</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ entry: e, extras }) => (
              <tr key={e.id} className="border-t border-slate-200 align-top">
                <td className="py-2 pr-4">{e.label}</td>
                <td className="py-2 pr-4">
                  <a className="text-blue-600 underline hover:text-blue-800" href={e.source_url}>
                    {e.source_name}
                  </a>
                </td>
                <td className="py-2 pr-4">{e.license}</td>
                <td className="py-2 pr-4 font-mono">{e.as_of}</td>
                {showRows && (
                  <td className="py-2 pr-4 text-right font-mono tabular-nums">
                    {extras.rows !== undefined ? extras.rows.toLocaleString("en-US") : "—"}
                  </td>
                )}
                {showSize && (
                  <td className="whitespace-nowrap py-2 pr-4 text-right font-mono tabular-nums">
                    {extras.bytes !== undefined ? formatBytes(extras.bytes) : "—"}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {attributions.length > 0 && (
        <section className="mt-8">
          <h3 className="text-lg font-semibold text-slate-900">Required attributions</h3>
          <ul className="mt-2 list-disc space-y-1 pl-6 text-sm text-slate-700">
            {attributions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
