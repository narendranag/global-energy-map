// The Worker in front of OpenNext's Next.js handler (wrangler.jsonc `main`).
// It runs first only for /data/* and /duckdb/* (`run_worker_first`), and does
// for those static files what next.config.ts's headers() did on Vercel — see
// src/lib/edge/static.ts. Everything else goes to Next unchanged.
import nextHandler from "../.open-next/worker.js";
import {
  WORKER_FIRST_PREFIXES,
  cacheControlFor,
  duckdbWasmKey,
  parseRange,
} from "../src/lib/edge/static.ts";

/** The DuckDB wasm modules, from R2 (over the 25 MiB asset limit). */
async function wasmFromR2(request, env, key) {
  const object = await env.DUCKDB_WASM.get(key, { range: request.headers, onlyIf: request.headers });
  if (object === null) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("ETag", object.httpEtag);
  headers.set("Content-Type", "application/wasm");
  headers.set("Accept-Ranges", "bytes");
  if (!("body" in object)) return new Response(null, { status: 304, headers });
  const r = object.range;
  if (request.headers.has("range") && r && "offset" in r) {
    const end = r.offset + r.length - 1;
    headers.set("Content-Range", `bytes ${r.offset}-${end}/${object.size}`);
    return new Response(object.body, { status: 206, headers });
  }
  return new Response(object.body, { headers });
}

/**
 * A file from the asset store, honouring a single byte range ourselves when
 * the store answers 200 to a ranged request (DuckDB reads parquet by range).
 */
async function fromAssets(request, env) {
  const res = await env.ASSETS.fetch(request);
  const rangeHeader = request.headers.get("range");
  if (res.status !== 200 || !rangeHeader || request.method !== "GET") return res;
  const body = await res.arrayBuffer();
  const range = parseRange(rangeHeader, body.byteLength);
  const headers = new Headers(res.headers);
  headers.set("Accept-Ranges", "bytes");
  if (range === null) return new Response(body, { status: 200, headers });
  if (range === "unsatisfiable") {
    headers.set("Content-Range", `bytes */${body.byteLength}`);
    return new Response(null, { status: 416, headers });
  }
  headers.set("Content-Range", `bytes ${range.start}-${range.end}/${body.byteLength}`);
  headers.delete("Content-Length");
  return new Response(body.slice(range.start, range.end + 1), { status: 206, headers });
}

const worker = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!WORKER_FIRST_PREFIXES.some((p) => url.pathname.startsWith(p))) {
      return nextHandler.fetch(request, env, ctx);
    }
    const key = duckdbWasmKey(url, env.DUCKDB_WASM_VERSION);
    const res = key ? await wasmFromR2(request, env, key) : await fromAssets(request, env);
    if (res.status >= 400) return res;
    const out = new Response(res.body, res);
    out.headers.set("Cache-Control", cacheControlFor(url));
    return out;
  },
};

export default worker;
