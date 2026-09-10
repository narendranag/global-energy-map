import { Marked, type Tokens } from "marked";

/**
 * Build-time markdown rendering for docs/methodology.md: GFM, heading ids for
 * the table of contents, and `<!-- generated:NAME -->` placeholders that the
 * page replaces with components rendered from generated data (the scenario
 * share table, citations, attributions). The source is the repo's own doc
 * (trusted, build-time), so the HTML is injected as-is.
 */

export interface TocItem {
  readonly id: string;
  readonly text: string;
  readonly depth: 2 | 3;
}

export type Segment =
  | { readonly kind: "html"; readonly html: string }
  | { readonly kind: "generated"; readonly name: string };

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/&[a-z]+;/g, "")
    .replace(/[`*_~[\]()]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const PLACEHOLDER = /<!--\s*generated:([a-z0-9-]+)\s*-->/g;

/** Render the doc (minus its `# title`) into HTML segments split at placeholders, plus a TOC. */
export function renderDoc(md: string): { segments: Segment[]; toc: TocItem[] } {
  const body = md.replace(/^\s*#\s[^\n]*\n/, "");
  const toc: TocItem[] = [];
  const seen = new Map<string, number>();
  const uniqueId = (text: string) => {
    const base = slugify(text) || "section";
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n === 0 ? base : `${base}-${String(n)}`;
  };

  const marked = new Marked({
    gfm: true,
    renderer: {
      heading(this: { parser: { parseInline: (t: Tokens.Heading["tokens"]) => string } }, token: Tokens.Heading) {
        const inner = this.parser.parseInline(token.tokens);
        const id = uniqueId(token.text);
        if (token.depth === 2 || token.depth === 3) toc.push({ id, text: inner.replace(/<[^>]+>/g, ""), depth: token.depth });
        return `<h${String(token.depth)} id="${id}">${inner}</h${String(token.depth)}>\n`;
      },
    },
  });

  const segments: Segment[] = [];
  let last = 0;
  for (const m of body.matchAll(PLACEHOLDER)) {
    const chunk = body.slice(last, m.index);
    if (chunk.trim()) segments.push({ kind: "html", html: marked.parse(chunk, { async: false }) });
    segments.push({ kind: "generated", name: m[1] ?? "" });
    last = m.index + m[0].length;
  }
  const tail = body.slice(last);
  if (tail.trim()) segments.push({ kind: "html", html: marked.parse(tail, { async: false }) });
  return { segments, toc };
}
