import fs from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { CitationBlock } from "@/components/share/CitationBlock";
import { BUNDLED_CATALOG } from "@/lib/data-catalog/bundled";
import { attributionsFor, BASEMAP_ATTRIBUTION, SCENARIO_SHARES, UNSOURCED_TITLE } from "@/lib/export/citation";
import { getScenario } from "@/lib/scenarios/registry";
import type { ScenarioId } from "@/lib/scenarios/types";
import { renderDoc, type TocItem } from "./markdown";

export const metadata: Metadata = {
  title: "Methodology",
  description:
    "Current-state methodology of the Global Energy Map: sources, as-of dates, coverage, units and known gaps per layer, how each disruption scenario is computed, and how to cite.",
};

const HISTORY_URL = "https://github.com/narendranag/global-energy-map/blob/main/docs/history.md";

// Element-level styles for the rendered markdown (no @tailwindcss/typography).
const PROSE = [
  "text-base leading-relaxed text-ink-muted",
  "[&_h2]:mt-12 [&_h2]:scroll-mt-6 [&_h2]:border-b [&_h2]:border-panel-border [&_h2]:pb-1.5 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-ink",
  "[&_h3]:mt-8 [&_h3]:scroll-mt-6 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-ink",
  "[&_h4]:mt-6 [&_h4]:font-semibold [&_h4]:text-ink",
  "[&_p]:mt-3",
  "[&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:mt-1.5 [&_li>ul]:mt-1.5",
  "[&_a]:text-sky-800 [&_a]:underline [&_a]:underline-offset-2 [&_a:hover]:text-sky-950",
  "[&_strong]:font-semibold [&_strong]:text-ink",
  "[&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em] [&_code]:text-ink",
  "[&_pre]:mt-3 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-slate-50 [&_pre]:border [&_pre]:border-panel-border [&_pre]:p-3 [&_pre]:text-sm [&_pre_code]:bg-transparent [&_pre_code]:p-0",
  "[&_blockquote]:mt-3 [&_blockquote]:border-l-4 [&_blockquote]:border-panel-border [&_blockquote]:pl-4",
  "[&_table]:mt-4 [&_table]:block [&_table]:w-full [&_table]:overflow-x-auto [&_table]:text-sm",
  "[&_th]:border-b [&_th]:border-slate-300 [&_th]:py-1.5 [&_th]:pr-4 [&_th]:text-left [&_th]:font-semibold [&_th]:text-ink",
  "[&_td]:border-t [&_td]:border-panel-border [&_td]:py-1.5 [&_td]:pr-4 [&_td]:align-top",
  "[&_hr]:my-8 [&_hr]:border-panel-border",
].join(" ");

function pct(share: number): string {
  return `${(share * 100).toFixed(share < 0.1 ? 1 : 0)} %`;
}

function ScenarioSharesTable() {
  return (
    <div className="mt-4 overflow-x-auto" data-testid="scenario-shares">
      <table className="w-full text-sm">
        <caption className="sr-only">Route shares used by the disruption scenarios, with sources</caption>
        <thead>
          <tr className="text-left text-ink">
            <th scope="col" className="border-b border-slate-300 py-1.5 pr-4 font-semibold">Scenario</th>
            <th scope="col" className="border-b border-slate-300 py-1.5 pr-4 font-semibold">Exporter → importer</th>
            <th scope="col" className="border-b border-slate-300 py-1.5 pr-4 text-right font-semibold">Share</th>
            <th scope="col" className="border-b border-slate-300 py-1.5 pr-4 font-semibold">Source and derivation</th>
          </tr>
        </thead>
        <tbody className="text-ink-muted">
          {SCENARIO_SHARES.map((r) => {
            const unsourced = r.source_title === UNSOURCED_TITLE;
            return (
              <tr key={`${r.disruption_id}-${r.exporter_iso3}-${r.importer_iso3 ?? "all"}`} className="align-top">
                <td className="border-t border-panel-border py-2 pr-4 whitespace-nowrap">
                  {getScenario(r.disruption_id as ScenarioId).label.replace(/^(Close|Cut) /, "")}{r.disruption_id === "hormuz" ? " (oil + LNG)" : ""}
                </td>
                <td className="border-t border-panel-border py-2 pr-4 whitespace-nowrap font-mono text-xs text-ink">
                  {r.exporter_iso3} → {r.importer_iso3 ?? "all"}
                </td>
                <td className="border-t border-panel-border py-2 pr-4 text-right whitespace-nowrap font-mono tabular-nums text-ink">
                  {pct(r.share)}
                </td>
                <td className="border-t border-panel-border py-2 pr-4">
                  {unsourced ? (
                    <span className="font-semibold text-amber-800">{UNSOURCED_TITLE}</span>
                  ) : r.source_url ? (
                    <a href={r.source_url} className="text-sky-800 underline underline-offset-2 hover:text-sky-950">
                      {r.source_title}
                    </a>
                  ) : (
                    r.source_title
                  )}{" "}
                  <span className="text-ink-subtle">({r.source_year})</span>
                  {r.source_note && <p className="mt-1 text-xs leading-snug text-ink-subtle">{r.source_note}</p>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Attributions() {
  const lines = [...attributionsFor(BUNDLED_CATALOG.entries), BASEMAP_ATTRIBUTION];
  return (
    <div className="mt-3" data-testid="attributions">
      <p className="text-base text-ink-muted">
        These lines are required by the sources&apos; licences and appear verbatim wherever their data is shown.
      </p>
      <ul className="mt-3 space-y-1.5 rounded border border-panel-border bg-slate-50 p-4 text-sm text-ink">
        {lines.map((a) => (
          <li key={a}>{a}</li>
        ))}
      </ul>
    </div>
  );
}

const GENERATED: Record<string, () => ReactNode> = {
  "scenario-shares": () => <ScenarioSharesTable />,
  "how-to-cite": () => <CitationBlock />,
  attributions: () => <Attributions />,
};

function Toc({ items }: { items: readonly TocItem[] }) {
  return (
    <nav aria-label="Contents" className="text-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">Contents</div>
      <ol className="mt-2 space-y-1">
        {items.map((t) => (
          <li key={t.id} className={t.depth === 3 ? "pl-3" : ""}>
            <a
              href={`#${t.id}`}
              className={`block rounded px-1 py-0.5 hover:bg-slate-100 hover:text-ink ${t.depth === 2 ? "font-medium text-ink" : "text-ink-muted"}`}
            >
              {t.text}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export default async function MethodologyPage() {
  const md = await fs.readFile(path.join(process.cwd(), "docs", "methodology.md"), "utf8");
  const { segments, toc } = renderDoc(md);

  return (
    <div className="w-full bg-white text-ink">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-6 py-10 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <div className="sticky top-8 max-h-[calc(100vh-4rem)] overflow-y-auto pr-2">
            <Toc items={toc} />
          </div>
        </aside>
        <main className="min-w-0 max-w-3xl">
          <nav aria-label="Breadcrumb" className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <Link href="/" className="text-sky-800 underline-offset-2 hover:text-sky-950 hover:underline">
              ← Back to map
            </Link>
            <Link href="/data" className="text-sky-800 underline-offset-2 hover:text-sky-950 hover:underline">
              Data and downloads
            </Link>
            <a href={HISTORY_URL} className="text-sky-800 underline-offset-2 hover:text-sky-950 hover:underline">
              Phase history
            </a>
          </nav>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-ink">Methodology</h1>
          <details className="mt-6 rounded border border-panel-border p-3 lg:hidden">
            <summary className="cursor-pointer text-sm font-medium text-ink">Contents</summary>
            <div className="mt-2">
              <Toc items={toc} />
            </div>
          </details>
          <div className={PROSE}>
            {segments.map((s, i) =>
              s.kind === "html" ? (
                <div key={i} dangerouslySetInnerHTML={{ __html: s.html }} />
              ) : (
                <div key={i}>{GENERATED[s.name]?.() ?? null}</div>
              ),
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
