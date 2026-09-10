import { apaCitation, bibtexCitation, SITE_CITATION } from "@/lib/export/citation";
import { CopyButton } from "./CopyButton";

/**
 * "How to cite" block for /methodology and /data: APA 7 and BibTeX for the
 * site, generated from CITATION.cff (via citations.generated.json). Server
 * component; only the copy buttons hydrate.
 */
export function CitationBlock() {
  const apa = apaCitation();
  const bib = bibtexCitation();
  return (
    <div className="mt-3 space-y-4" data-testid="how-to-cite">
      <div>
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-ink">APA</h3>
          <CopyButton text={apa} label="Copy APA" />
        </div>
        <p className="mt-1.5 rounded border border-panel-border bg-slate-50 p-3 text-sm leading-relaxed text-ink">
          {apa}
        </p>
      </div>
      <div>
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-ink">BibTeX</h3>
          <CopyButton text={bib} label="Copy BibTeX" />
        </div>
        <pre className="mt-1.5 overflow-x-auto rounded border border-panel-border bg-slate-50 p-3 font-mono text-xs leading-relaxed text-ink">
          {bib}
        </pre>
      </div>
      <p className="text-sm text-ink-muted">
        To cite a specific map view, open <strong>Share / cite</strong>{" "}on the map: it adds the view URL, the
        access date and the as-of date of every source behind the visible layers. Cite the underlying datasets
        to their publishers as well — each file&apos;s source is on the{" "}
        <a href="/data" className="text-sky-800 underline underline-offset-2 hover:text-sky-950">
          Data page
        </a>{" "}
        and in <code className="font-mono text-[0.85em]">CITATION.cff</code>{" "}({SITE_CITATION.title}{" "}
        {SITE_CITATION.version}).
      </p>
    </div>
  );
}
