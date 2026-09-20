import type { Catalog, CatalogEntry } from "@/lib/data-catalog/types";
import type { CountryProfile } from "@/lib/data/country-profile";
import { SCENARIOS } from "@/lib/scenarios/registry";
import { toCsv, type CsvValue } from "./csv";
import { apaCitation, entriesForTags, sourceCitationLine } from "./citation";

/**
 * "Download CSV" for the country panel: exactly the numbers the panel shows,
 * minus the ones we are not allowed to redistribute.
 *
 * The licence rule is the same catalog-driven one the Share menu uses
 * (`layerExportStatus`): a section ships only if **every** catalog entry
 * behind it is `redistributable` — CC BY 4.0, public domain, Etalab (BACI),
 * or project-derived. That leaves out:
 *
 *  - reserves and crude production (Energy Institute — permission needed
 *    before extensive reproduction of its tables),
 *  - EU gas storage (Gas Infrastructure Europe — free with a key, but not an
 *    open licence),
 *  - the recent-imports window (UN Comtrade — re-dissemination limited),
 *  - refineries (the layer mixes in ODbL OpenStreetMap rows).
 *
 * What ships is BACI trade, the scenario exposure derived from BACI ×
 * `disruption_route` (treated as derived analysis, exactly like the scenario
 * table), LNG terminal counts and extraction-site counts. The file says in
 * its own header what was left out and why, so a reader never mistakes an
 * omission for a zero.
 */

export const COUNTRY_CSV_COLUMNS = [
  "section",
  "metric",
  "year",
  "partner_iso3",
  "partner_name",
  "value",
  "unit",
  "share",
  "note",
] as const;

export type CountryCsvRow = Record<(typeof COUNTRY_CSV_COLUMNS)[number], CsvValue>;

/**
 * B8: every scenario's route-share tag, derived from `SCENARIOS` so a new
 * scenario is covered for free (the panel's own exposure numbers already
 * iterate `SCENARIOS` the same way — see CLAUDE.md's country-panel note).
 * The `-lng` tag variant only exists for a scenario whose `commodities`
 * include gas (`scenarioTags` in `layers.ts` assumes every scenario has one,
 * which is the separate A1 bug — this list does not repeat that mistake).
 */
const EXPOSURE_SCENARIO_TAGS: readonly string[] = SCENARIOS.flatMap((s) => [
  `scenario:${s.id}`,
  ...(s.commodities.includes("gas") ? [`scenario:${s.id}-lng`] : []),
]);

/** Catalog `layers` tags behind each section of the panel. */
export const COUNTRY_SECTION_TAGS: Readonly<Record<string, readonly string[]>> = {
  reserves: ["reserves"],
  "reserves (gas)": ["reserves:gas"],
  production: ["production"],
  trade: ["trade"],
  // Exposure is BACI x the cited route shares: both sources must clear the bar.
  exposure: ["trade", ...EXPOSURE_SCENARIO_TAGS],
  "LNG terminals": ["lng_terminals"],
  "extraction sites": ["extraction"],
  refineries: ["refineries"],
  "gas storage": ["gas_storage"],
  "recent imports": ["trade_monthly"],
};

export interface SectionLicence {
  readonly section: string;
  readonly included: boolean;
  /** Why it was left out (null when included). */
  readonly reason: string | null;
  readonly entries: readonly CatalogEntry[];
}

/**
 * Whether a section's rows may be redistributed, and the reason when not.
 * Unknown sections (no catalogued source) are left out — "when unsure, leave
 * it out" is the rule, not a judgement call at the call site.
 */
export function sectionLicence(section: string, catalog: Catalog): SectionLicence {
  const tags = COUNTRY_SECTION_TAGS[section];
  if (tags === undefined) {
    return { section, included: false, reason: "No catalogued source.", entries: [] };
  }
  const entries = entriesForTags(tags, catalog);
  if (entries.length === 0) {
    return { section, included: false, reason: "No catalogued source.", entries };
  }
  const blockers = entries.filter((e) => e.redistributable !== true);
  if (blockers.length === 0) return { section, included: true, reason: null, entries };
  const reason = blockers
    .map((b) => `${b.source_name}: ${b.download_note ?? b.license}`)
    .join(" ");
  return { section, included: false, reason, entries };
}

export interface CountryCsvContext {
  readonly viewUrl: string;
  /** YYYY-MM-DD */
  readonly exported: string;
  readonly catalog: Catalog;
}

const round = (n: number, dp: number): number => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

const blank: CountryCsvRow = {
  section: null,
  metric: null,
  year: null,
  partner_iso3: null,
  partner_name: null,
  value: null,
  unit: null,
  share: null,
  note: null,
};

/** Which panel sections this country actually has data for, in panel order. */
export function countrySections(profile: CountryProfile): string[] {
  const out: string[] = [];
  if (profile.reserves) out.push(profile.commodity === "gas" ? "reserves (gas)" : "reserves");
  if (profile.production) out.push("production");
  if (profile.trade) out.push("trade", "exposure");
  for (const i of profile.infrastructure) {
    out.push(
      i.kind === "refinery"
        ? "refineries"
        : i.kind === "extraction_site"
          ? "extraction sites"
          : "LNG terminals",
    );
  }
  if (profile.gasStorage) out.push("gas storage");
  if (profile.recentImports) out.push("recent imports");
  return [...new Set(out)];
}

export interface CountryCsvPlan {
  readonly included: readonly SectionLicence[];
  readonly excluded: readonly SectionLicence[];
}

/** Split the country's sections into what may be shipped and what may not. */
export function countryCsvPlan(profile: CountryProfile, catalog: Catalog): CountryCsvPlan {
  const all = countrySections(profile).map((s) => sectionLicence(s, catalog));
  // "exposure" only exists as rows when the engine has produced some.
  const live = all.filter((s) => s.section !== "exposure" || profile.exposure.length > 0);
  return {
    included: live.filter((s) => s.included),
    excluded: live.filter((s) => !s.included),
  };
}

export function countryCsvRows(profile: CountryProfile, catalog: Catalog): CountryCsvRow[] {
  const plan = countryCsvPlan(profile, catalog);
  const has = (section: string) => plan.included.some((s) => s.section === section);
  const rows: CountryCsvRow[] = [];
  const noun = profile.commodity === "gas" ? "lng" : "crude";

  if (profile.trade && has("trade")) {
    const t = profile.trade;
    for (const [direction, series] of [
      ["imports", t.importsSeries],
      ["exports", t.exportsSeries],
    ] as const) {
      for (const p of series?.points ?? []) {
        if (p.value === null) continue;
        rows.push({
          ...blank,
          section: "trade",
          metric: `${noun}_${direction}`,
          year: p.year,
          value: round(p.value, 1),
          unit: "tonnes",
          note: `BACI HS ${t.hsCode}`,
        });
      }
    }
    for (const [metric, list] of [
      ["top_supplier", t.suppliers],
      ["top_customer", t.customers],
    ] as const) {
      for (const p of list) {
        rows.push({
          ...blank,
          section: "trade",
          metric,
          year: t.year,
          partner_iso3: p.iso3,
          partner_name: p.name,
          value: round(p.qty, 1),
          unit: "tonnes",
          share: round(p.share, 6),
          note: `BACI HS ${t.hsCode}`,
        });
      }
    }
  }

  if (has("exposure")) {
    for (const e of profile.exposure) {
      rows.push({
        ...blank,
        section: "exposure",
        metric: e.scenarioId,
        year: profile.year,
        value: round(e.atRiskQty, 1),
        unit: "tonnes",
        share: round(e.shareAtRisk, 6),
        note: `imports at risk if ${e.routeName} is closed; of ${String(round(e.totalQty, 1))} tonnes imported`,
      });
    }
  }

  for (const i of profile.infrastructure) {
    const section =
      i.kind === "refinery"
        ? "refineries"
        : i.kind === "extraction_site"
          ? "extraction sites"
          : "LNG terminals";
    if (!has(section)) continue;
    rows.push({
      ...blank,
      section,
      metric: `${i.kind}_count`,
      value: i.count,
      unit: "assets",
      note: i.label,
    });
    if (i.capacity !== null) {
      rows.push({
        ...blank,
        section,
        metric: `${i.kind}_capacity`,
        value: round(i.capacity, 2),
        unit: i.capacityUnit,
        note: `summed over the ${String(i.withCapacity)} of ${String(i.count)} with capacity in the source`,
      });
    }
  }

  return rows;
}

export function countryCsvHeader(profile: CountryProfile, ctx: CountryCsvContext): string[] {
  const plan = countryCsvPlan(profile, ctx.catalog);
  const lines = [
    `Global Energy Map — country profile: ${profile.name} (${profile.iso3}), ${String(profile.year)}, ${profile.commodity === "gas" ? "LNG" : "crude oil"}`,
    "Long format: one row per (section, metric, year, partner). Quantities in metric tonnes as BACI records them.",
    "Scenario exposure rows are DERIVED ANALYSIS, not source data: BACI bilateral imports x the cited route share of each supplier.",
  ];
  const seen = new Set<string>();
  const sources: string[] = [];
  for (const s of plan.included) {
    for (const e of s.entries) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      sources.push(`  ${sourceCitationLine(e)}`);
    }
  }
  if (sources.length > 0) lines.push("Sources in this file:", ...sources);
  if (plan.excluded.length > 0) {
    lines.push(
      "Left out — shown in the app but not redistributable under its source's licence:",
      ...plan.excluded.map((s) => `  ${s.section}: ${s.reason ?? "licence unknown"}`),
    );
  }
  lines.push(
    `View: ${ctx.viewUrl}`,
    `Exported: ${ctx.exported}`,
    `Cite this site: ${apaCitation(undefined, { viewUrl: ctx.viewUrl, accessed: ctx.exported })}`,
  );
  return lines;
}

export function countryCsv(profile: CountryProfile, ctx: CountryCsvContext): string {
  return toCsv(
    COUNTRY_CSV_COLUMNS,
    countryCsvRows(profile, ctx.catalog),
    countryCsvHeader(profile, ctx),
  );
}

export function countryCsvFilename(profile: CountryProfile): string {
  return `global-energy-map_country-${profile.iso3}_${profile.commodity}_${String(profile.year)}.csv`;
}
