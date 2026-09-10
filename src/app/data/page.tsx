import type { Metadata } from "next";
import Link from "next/link";
import { CitationBlock } from "@/components/share/CitationBlock";
import { CopyButton } from "@/components/share/CopyButton";
import { BUNDLED_CATALOG, isDownloadable } from "@/lib/data-catalog/bundled";
import type { CatalogEntry } from "@/lib/data-catalog/types";
import { attributionsFor } from "@/lib/export/citation";

const LICENSE_DATA_URL = "https://github.com/narendranag/global-energy-map/blob/main/LICENSE-DATA.md";
/** The downloadable, openly licensed subset of assets.parquet (no OSM rows). */
const OPEN_ASSETS_ID = "assets_open";

export const metadata: Metadata = {
  title: "Data",
  description:
    "Every dataset behind the Global Energy Map: source, licence, as-of date, rows, size and sha256, with downloads for the CC BY 4.0 and public-domain files.",
};

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

function fileName(p: string): string {
  return p.split("/").pop() ?? p;
}

const LINK = "text-sky-800 underline underline-offset-2 hover:text-sky-950";

/**
 * Attribution lines for entries that carry none of their own: the open asset
 * extract inherits those of the redistributable assets.parquet sources it holds.
 */
const attributionLines = new Map<string, string[]>([
  [
    OPEN_ASSETS_ID,
    attributionsFor(
      BUNDLED_CATALOG.entries.filter((t) => t.path === "/data/assets.parquet" && t.redistributable === true),
    ),
  ],
]);

function EntryRow({ e, tenants }: { e: CatalogEntry; tenants: readonly CatalogEntry[] }) {
  const others = tenants.filter((t) => t.id !== e.id);
  const downloadable = isDownloadable(e);
  return (
    <tr className="align-top" data-testid={`data-row-${e.id}`}>
      <td className="border-t border-panel-border py-3 pr-4">
        <div className="font-medium text-ink">{e.label}</div>
        <div className="mt-0.5 font-mono text-xs text-ink-subtle">{e.id}</div>
        {e.layers.length > 0 ? (
          <div className="mt-1 flex flex-wrap gap-1">
            {e.layers.map((l) => (
              <span key={l} className="rounded bg-slate-100 px-1.5 py-0.5 text-2xs text-ink-muted">
                {l}
              </span>
            ))}
          </div>
        ) : (
          <div className="mt-1 text-2xs text-ink-subtle">
            {e.id === OPEN_ASSETS_ID
              ? "Download-only copy of the map's asset table"
              : "Not read by the app — reproducibility artefact"}
          </div>
        )}
      </td>
      <td className="border-t border-panel-border py-3 pr-4">
        <a href={e.source_url} className={LINK}>
          {e.source_name}
        </a>
        <div className="mt-1 text-ink-muted">{e.license}</div>
        {(e.attribution ? [e.attribution] : (attributionLines.get(e.id) ?? [])).map((a) => (
          <div key={a} className="mt-1 text-xs text-ink-subtle">
            {a}
          </div>
        ))}
      </td>
      <td className="border-t border-panel-border py-3 pr-4 whitespace-nowrap font-mono text-xs">{e.as_of}</td>
      <td className="border-t border-panel-border py-3 pr-4 text-right font-mono text-xs tabular-nums">
        {e.rows !== undefined ? e.rows.toLocaleString("en-US") : "—"}
      </td>
      <td className="border-t border-panel-border py-3 pr-4">
        <div className="font-mono text-xs text-ink">{fileName(e.path)}</div>
        <div className="mt-0.5 text-xs text-ink-muted">
          {e.bytes !== undefined ? formatBytes(e.bytes) : "—"}
          {others.length > 0 && ` · shared with ${String(others.length)} other ${others.length === 1 ? "entry" : "entries"}`}
        </div>
        {e.sha256 && (
          <div className="mt-1 flex items-center gap-1.5">
            <code className="font-mono text-2xs text-ink-subtle" title={e.sha256}>
              sha256 {e.sha256.slice(0, 12)}…
            </code>
            <CopyButton
              text={e.sha256}
              label="Copy"
              ariaLabel={`Copy sha256 of ${fileName(e.path)}`}
              className="rounded border border-slate-300 bg-white px-1.5 text-2xs text-ink-muted hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-700"
            />
          </div>
        )}
      </td>
      <td className="border-t border-panel-border py-3 pr-1">
        {downloadable ? (
          <a
            href={e.path}
            download={fileName(e.path)}
            className="inline-block whitespace-nowrap rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-ink hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-700"
            data-testid={`download-${e.id}`}
          >
            Download
          </a>
        ) : (
          <p className="max-w-56 text-xs leading-snug text-ink-muted" data-testid={`view-only-${e.id}`}>
            <span className="font-medium text-ink">View-only.</span> {e.download_note ?? "Not offered for download."}
          </p>
        )}
      </td>
    </tr>
  );
}

export default function DataPage() {
  const entries = BUNDLED_CATALOG.entries;
  const byPath = new Map<string, CatalogEntry[]>();
  for (const e of entries) byPath.set(e.path, [...(byPath.get(e.path) ?? []), e]);
  const files = [...byPath.keys()];
  const downloadableFiles = files.filter((p) => (byPath.get(p) ?? []).every(isDownloadable));
  const openAssets = entries.find((e) => e.id === OPEN_ASSETS_ID);
  const osmRows = entries.find((e) => e.id === "osm_refineries")?.rows;

  return (
    <div className="w-full bg-white text-ink">
      <main className="mx-auto w-full max-w-7xl px-6 py-10">
        <nav aria-label="Breadcrumb" className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <Link href="/" className="text-sky-800 underline-offset-2 hover:text-sky-950 hover:underline">
            ← Back to map
          </Link>
          <Link href="/methodology" className="text-sky-800 underline-offset-2 hover:text-sky-950 hover:underline">
            Methodology
          </Link>
          <a href={LICENSE_DATA_URL} className="text-sky-800 underline-offset-2 hover:text-sky-950 hover:underline">
            Data licences (LICENSE-DATA.md)
          </a>
        </nav>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-ink">Data</h1>
        <div className="mt-4 max-w-3xl space-y-3 text-base leading-relaxed text-ink-muted">
          <p>
            Every file the map reads, one row per source (several sources can share a file). Sizes and sha256
            hashes are the exact bytes served from <code className="font-mono text-[0.85em]">/data/</code>;
            they are generated by the build (<code className="font-mono text-[0.85em]">catalog.json</code>) and
            checked in CI, so a download can be verified against this page.
          </p>
          <p>
            <strong className="text-ink">Downloads are limited to CC BY 4.0 and public-domain sources</strong>{" "}and
            the project&apos;s own route-share table — {downloadableFiles.length} of {files.length}{" "}files. Energy
            Institute reserves and CEPII BACI trade data are shown in the app but not redistributed. Each
            source&apos;s licence, what we redistribute and what you may do with it are summarised in{" "}
            <a href={LICENSE_DATA_URL} className={LINK}>
              LICENSE-DATA.md
            </a>{" "}
            (plain language, not legal advice).
          </p>
          {openAssets && (
            <p data-testid="open-assets-note">
              <strong className="text-ink">The asset table:</strong>{" "}the map reads{" "}
              <code className="font-mono text-[0.85em]">assets.parquet</code>, which is view-only because it mixes
              {osmRows !== undefined ? ` ${osmRows.toLocaleString("en-US")}` : ""} OpenStreetMap (ODbL, share-alike)
              refinery rows with CC BY and public-domain rows. Download{" "}
              <a href={openAssets.path} download="assets_open.parquet" className={LINK}>
                <code className="font-mono text-[0.85em]">assets_open.parquet</code>
              </a>{" "}
              instead: every other row ({openAssets.rows?.toLocaleString("en-US") ?? "—"}{" "}extraction sites, refineries,
              storage sites, ports and LNG terminals from GEM, LNG-T3 and NETL), same columns, with each row&apos;s{" "}
              <code className="font-mono text-[0.85em]">source</code>. Single layers can also be exported from the
              map&apos;s <strong className="text-ink">Share / cite</strong>{" "}menu, with their source and licence in
              the file header.
            </p>
          )}
          <p>
            Keep the attribution line with any CC BY 4.0 data you reuse (see{" "}
            <Link href="/methodology#required-attributions" className={LINK}>
              required attributions
            </Link>
            ).
          </p>
        </div>

        <div className="mt-8 overflow-x-auto">
          <table className="w-full min-w-[60rem] text-sm">
            <caption className="sr-only">Datasets, licences and downloads</caption>
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-ink-subtle">
                <th scope="col" className="pb-2 pr-4 font-semibold">Dataset · layers</th>
                <th scope="col" className="pb-2 pr-4 font-semibold">Source · licence</th>
                <th scope="col" className="pb-2 pr-4 font-semibold">As of</th>
                <th scope="col" className="pb-2 pr-4 text-right font-semibold">Rows</th>
                <th scope="col" className="pb-2 pr-4 font-semibold">File</th>
                <th scope="col" className="pb-2 pr-1 font-semibold">Download</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <EntryRow key={e.id} e={e} tenants={byPath.get(e.path) ?? []} />
              ))}
            </tbody>
          </table>
        </div>

        <section className="mt-12 max-w-3xl" aria-labelledby="how-to-cite">
          <h2 id="how-to-cite" className="border-b border-panel-border pb-1.5 text-2xl font-semibold tracking-tight text-ink">
            How to cite
          </h2>
          <CitationBlock />
        </section>
      </main>
    </div>
  );
}
