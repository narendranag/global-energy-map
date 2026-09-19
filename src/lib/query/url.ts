/**
 * The query lives in the URL, so a researcher can share the exact SQL behind
 * a number the way they already share a map view.
 *
 * base64url of the UTF-8 text, in `?q=`: percent-encoding SQL produces long,
 * unreadable URLs full of `%20`/`%27`, and mail clients break lines through
 * them. Size is capped so a shared link stays inside every browser's and
 * mail client's practical URL limit — a longer query simply is not written to
 * the URL (the editor still holds it).
 */

/** Longest `q=` value we will write. ~2 KB of base64 ≈ 1.5 KB of SQL. */
export const MAX_QUERY_PARAM_CHARS = 2048;

export function encodeQuery(sql: string): string | null {
  const trimmed = sql.trim();
  if (trimmed === "") return null;
  const bytes = new TextEncoder().encode(trimmed);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  const b64 = btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  return b64.length > MAX_QUERY_PARAM_CHARS ? null : b64;
}

/** Inverse of {@link encodeQuery}; null for anything that is not valid base64url UTF-8. */
export function decodeQuery(param: string | null | undefined): string | null {
  if (param === null || param === undefined || param === "") return null;
  if (param.length > MAX_QUERY_PARAM_CHARS) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(param)) return null;
  const b64 = param.replaceAll("-", "+").replaceAll("_", "/");
  try {
    const binary = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "="));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const sql = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return sql.trim() === "" ? null : sql;
  } catch {
    return null;
  }
}

/**
 * Write the query into the address bar without a Next navigation
 * (`history.replaceState`, as the map's URL sync does — `router.replace`
 * turned every keystroke into a route transition).
 */
export function writeQueryToUrl(sql: string): void {
  if (typeof window === "undefined") return;
  const encoded = encodeQuery(sql);
  const url = new URL(window.location.href);
  if (encoded === null) url.searchParams.delete("q");
  else url.searchParams.set("q", encoded);
  const next = `${url.pathname}${url.search}`;
  if (next !== `${window.location.pathname}${window.location.search}`) {
    window.history.replaceState(window.history.state, "", next);
  }
}
