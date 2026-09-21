/**
 * Embed mode (S7): `?embed=1` (optionally `&controls=0`) is a **view flag**,
 * not `AppState` — it changes chrome, never map data, so it deliberately does
 * not go through `encodeAppState`/`decodeAppState`. That keeps every existing
 * link (which never carries `embed`) byte-identical, and keeps the "Copy
 * link" share action — which builds its URL from `AppState` + `MapView` only
 * — from ever leaking `embed=1` into a normal shared link.
 *
 * The one place this needs help is `src/lib/state/store.ts`: its debounced
 * `history.replaceState` writer rebuilds the querystring from `AppState` +
 * `MapView` on every tick, which would silently drop `embed`/`controls` the
 * next time the URL is written (e.g. a year change inside an embed). The
 * store calls {@link extractEmbedParams} once per `decode()` and re-appends
 * the result to every write, so the flag survives without ever becoming part
 * of the state it decodes.
 */

/** Params the store preserves verbatim across its own URL rewrites. */
const EMBED_PARAM_KEYS = ["embed", "controls"] as const;

function parse(search: string): URLSearchParams {
  return new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
}

/** True if the querystring asks for embed chrome (`embed=1`). */
export function isEmbed(params: URLSearchParams): boolean {
  return params.get("embed") === "1";
}

/** True if an embed should also hide the commodity toggle. */
export function embedControlsHidden(params: URLSearchParams): boolean {
  return params.get("controls") === "0";
}

/**
 * The querystring fragment (no leading `&`/`?`, `""` if neither key is
 * present) holding only `embed`/`controls`, exactly as given — order and
 * presence preserved, nothing else parsed or validated.
 */
export function extractEmbedParams(search: string): string {
  const params = parse(search);
  const out = new URLSearchParams();
  for (const key of EMBED_PARAM_KEYS) {
    const v = params.get(key);
    if (v !== null) out.set(key, v);
  }
  return out.toString();
}
