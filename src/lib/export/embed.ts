/**
 * "Copy embed code" (S7, ShareMenu): a pure builder from the current view's
 * share URL to an `<iframe>` snippet. The URL always carries its own
 * querystring (`&mode=…&year=…`), so every attribute value goes through
 * {@link escapeHtmlAttribute} — a bare `&` in an unescaped `src="…"` would
 * corrupt the HTML.
 */

/** Escape a string for safe use inside a double-quoted HTML attribute. */
export function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export interface EmbedSnippetOptions {
  /** Hide the commodity toggle (`&controls=0`). Default false. */
  readonly hideControls?: boolean;
  /** Accessible `<iframe title>`. Default "Global Energy Map". */
  readonly title?: string;
}

/**
 * Add `embed=1` (and `controls=0` when asked) to a view URL that does not
 * already carry them — `viewUrl` comes from the same builder "Copy link"
 * uses, which never includes embed params (see `src/lib/url-state/embed.ts`).
 */
export function embedUrl(viewUrl: string, options: EmbedSnippetOptions = {}): string {
  const url = new URL(viewUrl);
  url.searchParams.set("embed", "1");
  if (options.hideControls) url.searchParams.set("controls", "0");
  else url.searchParams.delete("controls");
  return url.toString();
}

/**
 * The `<iframe>` snippet offered by "Copy embed code": 100% width, a fixed
 * 560 px height (a reasonable default for an article column), `loading="lazy"`,
 * a real `title` and an inline `border:0` (no external stylesheet needed).
 */
export function embedSnippet(viewUrl: string, options: EmbedSnippetOptions = {}): string {
  const { title = "Global Energy Map" } = options;
  const src = embedUrl(viewUrl, options);
  return `<iframe src="${escapeHtmlAttribute(src)}" width="100%" height="560" loading="lazy" title="${escapeHtmlAttribute(title)}" style="border:0"></iframe>`;
}
