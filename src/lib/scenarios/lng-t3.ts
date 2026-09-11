import type { LngImportImpact, LngImportRow, LngVoyageRow } from "./types";
import { computeLngImportImpacts } from "./lng";

interface SrcQty {
  readonly iso3: string;
  readonly qty: number;
}

export interface LngImportFromVoyagesInput {
  readonly lngImports: readonly LngImportRow[];
  /** Voyages that have already been filtered by active year. */
  readonly voyages: readonly LngVoyageRow[];
  /** BACI-derived country totals (tonnes) — same map engine.ts builds for the BACI path. */
  readonly flowsByImporter: ReadonlyMap<string, readonly SrcQty[]>;
  readonly lookupShare: (exporter: string, importer: string) => number;
  /** Default 3 — drops confidence 1 and 2. */
  readonly minConfidence?: number;
}

/**
 * Phase 6: LNG import terminal impacts derived from voyage-level data.
 *
 * LNG-T3 is a partial AIS sample (measured at 22-41% of global LNG trade
 * against GIIGNL public totals — see data/validation/lng_t3_vs_giignl.txt).
 * Absolute country totals therefore still come from BACI (`flowsByImporter`,
 * tonnes); voyages are used only to redistribute a country's known total
 * across its terminals and to derive each terminal's exporter mix.
 *
 * Per importing country C:
 *   - Q_C = BACI total for C (0 if C has no BACI rows).
 *   - "covered" terminals are C's terminals with >=1 qualifying voyage
 *     (exact name match against `to_terminal`).
 *   - If C has no covered terminals at all, fall back entirely to the
 *     Phase 3 capacity-weighted BACI path (`computeLngImportImpacts`) for
 *     C's terminals — coverage "capacity-proxy", dataSource "baci".
 *   - Otherwise, for each covered terminal T: s_T = cbm_T / W where W is
 *     the sum of voyage cbm across C's covered terminals. Quantities
 *     attributed to T are Q_C * s_T (tonnes conservation: they sum to
 *     Q_C over C's covered terminals). The exporter mix for T
 *     (m_{T,X} = cbm_{T,X} / cbm_T) comes entirely from voyages, not BACI.
 *   - C's terminals that are NOT covered (country has some voyage data,
 *     but this specific terminal got none) report zero quantities and
 *     coverage "none" — a data gap, not a real zero.
 *
 * Filters applied to voyages before bucketing:
 *   - voyage_type === "export" (drops ballast returns)
 *   - confidence_score >= minConfidence (default 3)
 *
 * Edge case: if Q_C = 0 (no BACI rows for C) but C has voyage coverage,
 * attributed quantities are all zero (0 * s_T), but `shareAtRisk` is still
 * meaningful — it's computed directly from the exporter mix
 * (Σ_X m_{T,X} * lookupShare(X, C)), not as a quantity ratio, so it
 * doesn't collapse to 0/0.
 */
export function computeLngImportImpactsFromVoyages({
  lngImports,
  voyages,
  flowsByImporter,
  lookupShare,
  minConfidence = 3,
}: LngImportFromVoyagesInput): LngImportImpact[] {
  const relevant = voyages.filter(
    (v) => v.voyage_type === "export" && v.confidence_score >= minConfidence,
  );

  // Bucket by (importing country, terminal name) — not bare terminal name.
  // A terminal name is only unique within its own country; two countries
  // can each have a terminal sharing a name (e.g. a generic "LNG Terminal"),
  // and keying globally by name would mix their BACI-attributed tonnes.
  const terminalKey = (iso3: string, name: string): string => `${iso3} ${name}`;
  const byTerminalName = new Map<string, SrcQty[]>();
  for (const v of relevant) {
    const key = terminalKey(v.to_country_iso3, v.to_terminal);
    const list = byTerminalName.get(key) ?? [];
    list.push({ iso3: v.from_country_iso3, qty: v.amount_cbm });
    byTerminalName.set(key, list);
  }

  // Group terminals by importing country.
  const terminalsByCountry = new Map<string, LngImportRow[]>();
  for (const t of lngImports) {
    const list = terminalsByCountry.get(t.country_iso3) ?? [];
    list.push(t);
    terminalsByCountry.set(t.country_iso3, list);
  }

  const out: LngImportImpact[] = [];

  for (const [country, terminals] of terminalsByCountry) {
    const flows = flowsByImporter.get(country) ?? [];
    const totalCountryQty = flows.reduce((s, f) => s + f.qty, 0);

    const covered = terminals.filter(
      (t) => (byTerminalName.get(terminalKey(t.country_iso3, t.name))?.length ?? 0) > 0,
    );

    if (covered.length === 0) {
      // No voyage coverage anywhere in this country — capacity-weighted
      // BACI fallback for all of its terminals.
      out.push(
        ...computeLngImportImpacts({
          lngImports: terminals,
          flowsByImporter,
          lookupShare,
        }),
      );
      continue;
    }

    // The build now collapses duplicate same-name/same-terminal rows before
    // this runs, so in practice every name maps to exactly one row here.
    // This split-evenly logic is a defensive no-op guard against that
    // invariant ever slipping (e.g. a future source reintroducing an
    // "operating" + "construction" pair under one name) — if it did, both
    // rows would match the same voyage bucket, so counting it once per row
    // would double that name's true share of the country total, stolen
    // from the country's uniquely-named terminals.
    const rowsPerName = new Map<string, number>();
    for (const t of terminals) {
      rowsPerName.set(t.name, (rowsPerName.get(t.name) ?? 0) + 1);
    }
    const measuredCbm = (t: LngImportRow): number => {
      const bucket = (byTerminalName.get(terminalKey(t.country_iso3, t.name)) ?? []).reduce(
        (a, x) => a + x.qty,
        0,
      );
      return bucket / (rowsPerName.get(t.name) ?? 1);
    };

    const totalCoveredCbm = covered.reduce((sum, t) => sum + measuredCbm(t), 0);

    for (const t of terminals) {
      const sources = byTerminalName.get(terminalKey(t.country_iso3, t.name)) ?? [];
      if (sources.length === 0) {
        // Country has coverage elsewhere, but not for this terminal.
        out.push({
          asset_id: t.asset_id,
          iso3: t.country_iso3,
          capacity: t.capacity,
          name: t.name,
          atRiskQty: 0,
          shareAtRisk: 0,
          topSources: [],
          dataSource: "lng-t3",
          coverage: "none",
        });
        continue;
      }

      const terminalCbm = sources.reduce((s, x) => s + x.qty, 0);
      const terminalShare = totalCoveredCbm > 0 ? measuredCbm(t) / totalCoveredCbm : 0;

      const byExporter = new Map<string, number>();
      for (const s of sources) {
        byExporter.set(s.iso3, (byExporter.get(s.iso3) ?? 0) + s.qty);
      }

      let riskMix = 0;
      const mix: { iso3: string; share: number }[] = [];
      for (const [iso3, cbm] of byExporter) {
        const m = terminalCbm > 0 ? cbm / terminalCbm : 0;
        mix.push({ iso3, share: m });
        riskMix += m * lookupShare(iso3, country);
      }

      const topSources = mix
        .map(({ iso3, share }) => ({ iso3, qty: totalCountryQty * terminalShare * share }))
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 5);

      out.push({
        asset_id: t.asset_id,
        iso3: t.country_iso3,
        capacity: t.capacity,
        name: t.name,
        atRiskQty: totalCountryQty * terminalShare * riskMix,
        // Computed directly from the exporter mix, not as atRiskQty/totalSupply,
        // so it stays meaningful even when totalCountryQty is 0.
        shareAtRisk: riskMix,
        topSources,
        dataSource: "lng-t3",
        coverage: "measured",
      });
    }
  }

  return out;
}
