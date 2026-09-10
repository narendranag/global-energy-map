#!/usr/bin/env node
// scripts/smoke/smoke.mjs — HTTP smoke checks against a deployed URL (Phase 10, O3).
//
//   node scripts/smoke/smoke.mjs https://global-energy-map-one.vercel.app
//   node scripts/smoke/smoke.mjs <preview-url> --allow-protected
//
// Checks: `/`, `/methodology`, `/data` render; `/data/catalog.json` parses and
// every catalogued file answers 200/206 with exactly the catalogued byte size
// and sha256; one parquet serves HTTP Range requests (head + footer magic),
// also under its sha-versioned `?v=` URL — what DuckDB-WASM / the app fetch.
//
// No secrets required. If the optional VERCEL_AUTOMATION_BYPASS_SECRET is set
// it is sent as `x-vercel-protection-bypass` (Vercel Deployment Protection).
// With --allow-protected, a deployment behind Vercel Authentication is
// reported as skipped (exit 0, `skipped=true` in $GITHUB_OUTPUT) instead of
// failing — previews are protected by default; production aliases are not.
//
// Zero dependencies: Node >= 20 (global fetch, crypto).
import { createHash } from "node:crypto";
import { appendFileSync } from "node:fs";

const args = process.argv.slice(2);
const allowProtected = args.includes("--allow-protected");
const baseArg = args.find((a) => !a.startsWith("--")) ?? process.env.SMOKE_URL;
if (!baseArg) {
  console.error("usage: node scripts/smoke/smoke.mjs <base-url> [--allow-protected]");
  process.exit(2);
}
const BASE = baseArg.replace(/\/+$/, "");
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "";
const GH = process.env.GITHUB_ACTIONS === "true";
const TIMEOUT_MS = 60_000;
const ATTEMPTS = 3;

/** @type {{ ok: boolean; name: string; detail: string }[]} */
const results = [];

function record(ok, name, detail = "") {
  results.push({ ok, name, detail });
  const line = `${ok ? "ok  " : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`;
  if (ok) console.log(line);
  else {
    console.log(line);
    if (GH) console.log(`::error title=Smoke: ${name}::${detail}`);
  }
}

function headers(extra = {}) {
  const h = { "user-agent": "global-energy-map-smoke/1", ...extra };
  if (BYPASS) h["x-vercel-protection-bypass"] = BYPASS;
  return h;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** fetch with a timeout; retries network errors and 5xx (fresh deploys can be cold). */
async function get(path, init = {}) {
  let lastErr;
  for (let i = 0; i < ATTEMPTS; i++) {
    try {
      const res = await fetch(`${BASE}${path}`, {
        ...init,
        headers: headers(init.headers),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status < 500 || i === ATTEMPTS - 1) return res;
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
    await sleep(2_000 * (i + 1));
  }
  throw lastErr;
}

function isVercelAuthWall(res) {
  const loc = res.headers.get("location") ?? "";
  return (
    res.status === 401 ||
    (res.status >= 300 && res.status < 400 && /vercel\.com\/sso-api|\/_vercel\/sso/.test(loc)) ||
    (res.headers.get("set-cookie") ?? "").includes("_vercel_sso_nonce")
  );
}

function writeOutput(key, value) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
}

function writeSummary(skippedReason) {
  if (!process.env.GITHUB_STEP_SUMMARY) return;
  const lines = [`### Smoke: ${BASE}`, ""];
  if (skippedReason) lines.push(`> Skipped: ${skippedReason}`, "");
  lines.push("| | check | detail |", "|---|---|---|");
  for (const r of results) {
    lines.push(`| ${r.ok ? "✅" : "❌"} | ${r.name} | ${r.detail.replace(/\|/g, "\\|")} |`);
  }
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`);
}

// ---------------------------------------------------------------------------

async function checkProtection() {
  const res = await get("/", { redirect: "manual" });
  if (!isVercelAuthWall(res)) return false;
  const reason =
    "deployment is behind Vercel Deployment Protection (SSO). Set the optional repository " +
    "secret VERCEL_AUTOMATION_BYPASS_SECRET (Vercel → Settings → Deployment Protection → " +
    "Protection Bypass for Automation) or disable protection for previews to smoke-test it.";
  if (allowProtected) {
    console.log(`skip  ${BASE} — ${reason}`);
    if (GH) console.log(`::warning title=Smoke skipped::${reason}`);
    writeOutput("skipped", "true");
    writeSummary(reason);
    process.exit(0);
  }
  record(false, "GET / (protection)", `HTTP ${res.status} → ${res.headers.get("location") ?? ""}; ${reason}`);
  return true;
}

async function checkPage(path, marker) {
  try {
    const res = await get(path);
    const type = res.headers.get("content-type") ?? "";
    const body = await res.text();
    const ok = res.status === 200 && type.includes("text/html") && body.includes(marker);
    record(ok, `GET ${path}`, `HTTP ${res.status}, ${type}${ok ? "" : `, marker "${marker}" ${body.includes(marker) ? "found" : "missing"}`}`);
  } catch (err) {
    record(false, `GET ${path}`, String(err));
  }
}

async function loadCatalog() {
  try {
    const res = await get("/data/catalog.json");
    if (res.status !== 200) {
      record(false, "GET /data/catalog.json", `HTTP ${res.status}`);
      return null;
    }
    const catalog = await res.json();
    const entries = Array.isArray(catalog.entries) ? catalog.entries : [];
    const ok = entries.length > 0 && entries.every((e) => typeof e.path === "string" && e.path.startsWith("/data/"));
    record(ok, "GET /data/catalog.json", `version ${catalog.version}, ${entries.length} entries, generated ${catalog.generated_at}`);
    return ok ? entries : null;
  } catch (err) {
    record(false, "GET /data/catalog.json", `unparseable: ${String(err)}`);
    return null;
  }
}

/** Size via a 1-byte Range request (uncompressed; Content-Range carries the total), then sha256 of the full body. */
async function checkFile(path, bytes, sha256) {
  const name = `catalog file ${path}`;
  if (!Number.isInteger(bytes) || bytes <= 0) {
    record(false, name, `catalog has no byte size (${String(bytes)})`);
    return;
  }
  try {
    const head = await get(path, { headers: { range: "bytes=0-0", "accept-encoding": "identity" } });
    let size;
    if (head.status === 206) {
      size = Number((head.headers.get("content-range") ?? "").split("/")[1]);
    } else if (head.status === 200) {
      size = Number(head.headers.get("content-length"));
    } else {
      record(false, name, `HTTP ${head.status}`);
      return;
    }
    await head.arrayBuffer().catch(() => undefined);
    if (size !== bytes) {
      record(false, name, `size ${size} ≠ catalog ${bytes}`);
      return;
    }
    let shaNote = "";
    if (typeof sha256 === "string" && sha256.length === 64) {
      const full = await get(path);
      if (full.status !== 200) {
        record(false, name, `full GET HTTP ${full.status}`);
        return;
      }
      const buf = Buffer.from(await full.arrayBuffer());
      const got = createHash("sha256").update(buf).digest("hex");
      if (got !== sha256) {
        record(false, name, `sha256 ${got.slice(0, 12)}… ≠ catalog ${sha256.slice(0, 12)}… (stale CDN copy or catalog not regenerated?)`);
        return;
      }
      shaNote = ", sha256 ✓";
    }
    record(true, name, `HTTP ${head.status}, ${bytes} bytes${shaNote}`);
  } catch (err) {
    record(false, name, String(err));
  }
}

/** DuckDB-WASM reads parquet by HTTP range: the "PAR1" magic opens and closes every file. */
async function checkRange(path, bytes, sha256) {
  const name = `Range ${path}`;
  try {
    const first = await get(path, { headers: { range: "bytes=0-3" } });
    const a = Buffer.from(await first.arrayBuffer()).toString("latin1");
    const cr = first.headers.get("content-range") ?? "";
    const last = await get(path, { headers: { range: `bytes=${bytes - 4}-${bytes - 1}` } });
    const b = Buffer.from(await last.arrayBuffer()).toString("latin1");
    const ok =
      first.status === 206 && a === "PAR1" && cr === `bytes 0-3/${bytes}` && last.status === 206 && b === "PAR1";
    let versionNote = "";
    if (typeof sha256 === "string" && sha256.length === 64) {
      // The app requests `<path>?v=<sha8>` (served immutable for a year); it must serve the same bytes.
      const v = await get(`${path}?v=${sha256.slice(0, 8)}`, { headers: { range: "bytes=0-3" } });
      const magic = Buffer.from(await v.arrayBuffer()).toString("latin1");
      if (v.status !== 206 || magic !== "PAR1") {
        record(false, `${name}?v=`, `HTTP ${v.status} "${magic}"`);
      }
      versionNote = `, ?v= ${v.status} cache-control: ${v.headers.get("cache-control") ?? "—"}`;
    }
    record(ok, name, `head ${first.status} "${a}" (${cr}), footer ${last.status} "${b}", accept-ranges: ${first.headers.get("accept-ranges") ?? "—"}${versionNote}`);
  } catch (err) {
    record(false, name, String(err));
  }
}

async function main() {
  console.log(`Smoke-testing ${BASE}${BYPASS ? " (with protection bypass)" : ""}`);
  if (await checkProtection()) {
    writeSummary();
    process.exit(1);
  }
  await checkPage("/", "Global Energy Map");
  await checkPage("/methodology", "Methodology");
  await checkPage("/data", "Global Energy Map");

  const entries = await loadCatalog();
  if (entries) {
    const files = new Map();
    for (const e of entries) if (!files.has(e.path)) files.set(e.path, e);
    for (const [path, e] of files) await checkFile(path, e.bytes, e.sha256);
    const parquet = [...files.values()].find((e) => e.path.endsWith(".parquet") && Number.isInteger(e.bytes));
    if (parquet) await checkRange(parquet.path, parquet.bytes, parquet.sha256);
    else record(false, "Range", "no parquet in catalog");
  }

  const failed = results.filter((r) => !r.ok);
  writeOutput("skipped", "false");
  writeSummary();
  console.log(`\n${results.length - failed.length}/${results.length} checks passed${failed.length ? ` — ${failed.length} FAILED` : ""}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
