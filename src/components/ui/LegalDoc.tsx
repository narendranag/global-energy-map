import fs from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import { renderDoc } from "@/app/methodology/markdown";
import { PROSE } from "./prose";
import { SiteFooter } from "./SiteFooter";

const CRUMB = "text-sky-800 underline-offset-2 hover:text-sky-950 hover:underline";

/**
 * A legal page rendered at build time from `docs/legal/<file>.md` (the repo
 * copy is the source of truth, so its git history is the change log).
 */
export async function LegalDoc({ file, title }: { file: "terms" | "privacy"; title: string }) {
  const md = await fs.readFile(path.join(process.cwd(), "docs", "legal", `${file}.md`), "utf8");
  const { segments } = renderDoc(md);
  return (
    <div className="w-full bg-white text-ink">
      <main className="mx-auto w-full max-w-3xl px-6 py-10">
        <nav aria-label="Breadcrumb" className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <Link href="/" className={CRUMB}>
            ← Back to map
          </Link>
          <Link href="/methodology" className={CRUMB}>
            Methodology
          </Link>
          <Link href="/data" className={CRUMB}>
            Data and downloads
          </Link>
        </nav>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-ink">{title}</h1>
        <div className={PROSE}>
          {segments.map((s, i) => (s.kind === "html" ? <div key={i} dangerouslySetInnerHTML={{ __html: s.html }} /> : null))}
        </div>
        <SiteFooter />
      </main>
    </div>
  );
}
