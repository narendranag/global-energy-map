import citationsJson from "./citations.generated.json";
import type { Catalog, CatalogEntry } from "@/lib/data-catalog/types";

/**
 * Site + source citations. The site citation comes from CITATION.cff and the
 * scenario share citations from disruption_route.parquet, both via
 * `citations.generated.json` (written by scripts/transform/build_catalog.py;
 * pytest fails if it drifts). Everything here is pure.
 */

export interface CffAuthor {
  readonly "family-names"?: string;
  readonly "given-names"?: string;
  /** Entity (organisation) author. */
  readonly name?: string;
}

export interface SiteCitation {
  readonly title: string;
  readonly version: string;
  readonly "date-released": string;
  readonly url: string;
  readonly "repository-code"?: string;
  readonly license?: string;
  readonly doi?: string;
  readonly authors: readonly CffAuthor[];
}

/** One row of disruption_route.parquet with its citation. */
export interface ShareCitation {
  readonly disruption_id: string;
  readonly kind: string;
  readonly exporter_iso3: string;
  /** null = applies to every importer of this exporter. */
  readonly importer_iso3: string | null;
  readonly share: number;
  readonly source_title: string;
  readonly source_url: string | null;
  readonly source_year: number;
  readonly source_note: string | null;
}

interface CitationsFile {
  readonly site: SiteCitation;
  readonly scenario_shares: readonly ShareCitation[];
}

const CITATIONS = citationsJson as unknown as CitationsFile;

export const SITE_CITATION: SiteCitation = CITATIONS.site;
export const SCENARIO_SHARES: readonly ShareCitation[] = CITATIONS.scenario_shares;

/** Marker build_disruption_routing.py writes for rows no document supports. */
export const UNSOURCED_TITLE = "Analyst estimate (unsourced)";

export function sharesFor(
  scenarioId: string,
  rows: readonly ShareCitation[] = SCENARIO_SHARES,
): ShareCitation[] {
  return rows.filter((r) => r.disruption_id === scenarioId);
}

// ---------------------------------------------------------------------------
// Site citation: APA 7 and BibTeX
// ---------------------------------------------------------------------------

function initials(given: string): string {
  return given
    .split(/\s+/)
    .filter(Boolean)
    .map((part) =>
      part
        .split("-")
        .map((p) => `${p.charAt(0).toUpperCase()}.`)
        .join("-"),
    )
    .join(" ");
}

function apaAuthor(a: CffAuthor): string {
  if (a["family-names"]) {
    const given = a["given-names"] ? `, ${initials(a["given-names"])}` : "";
    return `${a["family-names"]}${given}`;
  }
  return a.name ?? "";
}

function apaAuthors(authors: readonly CffAuthor[]): string {
  const names = authors.map(apaAuthor).filter(Boolean);
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0] ?? ""}, & ${names[1] ?? ""}`;
  return `${names.slice(0, -1).join(", ")}, & ${names[names.length - 1] ?? ""}`;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

/** "2026-09-10" → "September 10, 2026" (no Date parsing: no timezone drift). */
export function longDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const [, y, mo, d] = m;
  return `${MONTHS[Number(mo) - 1] ?? mo ?? ""} ${String(Number(d))}, ${y ?? ""}`;
}

function year(site: SiteCitation): string {
  return site["date-released"].slice(0, 4);
}

export interface CiteOptions {
  /** URL of the specific view; defaults to the site URL. */
  readonly viewUrl?: string;
  /** Access date (YYYY-MM-DD) — include for a view, since the map changes. */
  readonly accessed?: string;
}

/** APA 7 reference for software, as plain text (no italics markup). */
export function apaCitation(site: SiteCitation = SITE_CITATION, opts: CiteOptions = {}): string {
  const who = apaAuthors(site.authors);
  const head = `${who}${who.endsWith(".") ? "" : "."} (${year(site)}). ${site.title} (Version ${site.version}) [Computer software].`;
  const url = opts.viewUrl ?? (site.doi ? `https://doi.org/${site.doi}` : site.url);
  return opts.accessed
    ? `${head} Retrieved ${longDate(opts.accessed)}, from ${url}`
    : `${head} ${url}`;
}

/** Escape BibTeX-special characters in a text field (not in `url`). */
export function bibtexEscape(s: string): string {
  return s
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/([&%$#_{}])/g, "\\$1")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}");
}

function bibtexAuthor(a: CffAuthor): string {
  if (a["family-names"]) {
    return a["given-names"]
      ? `${bibtexEscape(a["family-names"])}, ${bibtexEscape(a["given-names"])}`
      : bibtexEscape(a["family-names"]);
  }
  // Double braces keep an organisation name from being split into first/last.
  return `{${bibtexEscape(a.name ?? "")}}`;
}

export function bibtexKey(site: SiteCitation = SITE_CITATION): string {
  const first = site.authors[0];
  const who = (first?.["family-names"] ?? first?.name ?? "anon").toLowerCase();
  const word = site.title.toLowerCase().split(/\s+/).find((w) => w.length > 3) ?? "work";
  return `${who}${year(site)}${word}`.replace(/[^a-z0-9]/g, "");
}

/** biblatex `@software` entry (BibTeX tools that lack it treat it as @misc). */
export function bibtexCitation(site: SiteCitation = SITE_CITATION, opts: CiteOptions = {}): string {
  const fields: [string, string][] = [
    ["author", site.authors.map(bibtexAuthor).join(" and ")],
    ["title", `{${bibtexEscape(site.title)}}`],
    ["year", year(site)],
    ["version", bibtexEscape(site.version)],
    ["url", opts.viewUrl ?? site.url],
  ];
  if (site.doi) fields.push(["doi", site.doi]);
  if (opts.accessed) fields.push(["urldate", opts.accessed]);
  if (opts.viewUrl && opts.viewUrl !== site.url) {
    fields.push(["note", `Map view; project home \\url{${site.url}}`]);
  }
  const width = Math.max(...fields.map(([k]) => k.length));
  const body = fields.map(([k, v]) => `  ${k.padEnd(width)} = {${v}}`).join(",\n");
  return `@software{${bibtexKey(site)},\n${body}\n}`;
}

// ---------------------------------------------------------------------------
// Sources behind a view
// ---------------------------------------------------------------------------

/** Unique catalog entries tagged with any of `tags`, in catalog order. */
export function entriesForTags(tags: readonly string[], catalog: Catalog): CatalogEntry[] {
  const want = new Set(tags);
  return catalog.entries.filter((e) => e.layers.some((l) => want.has(l)));
}

/** "Global Energy Monitor — Oil & gas extraction sites (GEM), as of 2023-07-01. CC BY 4.0. <url>" */
export function sourceCitationLine(e: CatalogEntry): string {
  return `${e.source_name} — ${e.label}, as of ${e.as_of}. Licence: ${e.license}. ${e.source_url}`;
}

/** Distinct required attribution strings, in catalog order. */
export function attributionsFor(entries: readonly CatalogEntry[]): string[] {
  return [
    ...new Set(entries.map((e) => e.attribution).filter((a): a is string => a !== undefined && a !== "")),
  ];
}

/** Basemap attribution (OpenFreeMap Positron; see src/components/map/style.ts). */
export const BASEMAP_ATTRIBUTION = "Basemap: OpenFreeMap © OpenMapTiles, data from OpenStreetMap contributors";

export interface ViewDescription {
  readonly viewUrl: string;
  readonly accessed: string;
  /** e.g. "2020 · crude oil · Close Strait of Hormuz". */
  readonly summary: string;
  readonly layerLabels: readonly string[];
  readonly sources: readonly CatalogEntry[];
}

/** Plain-text "Cite this view" block: APA line, view summary, sources + as-of, attributions. */
export function viewCitationText(v: ViewDescription, site: SiteCitation = SITE_CITATION): string {
  const lines = [
    apaCitation(site, { viewUrl: v.viewUrl, accessed: v.accessed }),
    "",
    `View: ${v.summary}`,
    v.layerLabels.length > 0 ? `Layers: ${v.layerLabels.join(", ")}` : "Layers: none",
    "",
    "Sources behind this view:",
    ...v.sources.map((e) => `- ${sourceCitationLine(e)}`),
  ];
  const attributions = attributionsFor(v.sources);
  if (attributions.length > 0) {
    lines.push("", "Required attributions:", ...attributions.map((a) => `- ${a}`));
  }
  return lines.join("\n");
}
