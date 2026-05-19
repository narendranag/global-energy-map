import type { LngImportImpact, LngImportRow, LngVoyageRow } from "./types";

interface SrcQty {
  readonly iso3: string;
  readonly qty: number;
}

export interface LngImportFromVoyagesInput {
  readonly lngImports: readonly LngImportRow[];
  /** Voyages that have already been filtered by active year. */
  readonly voyages: readonly LngVoyageRow[];
  readonly lookupShare: (exporter: string, importer: string) => number;
  /** Default 3 — drops confidence 1 and 2. */
  readonly minConfidence?: number;
}

/**
 * Phase 6: LNG import terminal impacts derived from voyage-level data.
 *
 * Unlike `computeLngImportImpacts` (Phase 3 capacity-weighted attribution
 * over country totals), this path attributes each voyage's `amount_cbm`
 * directly to its `to_terminal`. No capacity proxy.
 *
 * Filters applied:
 *   - voyage_type === "export" (drops ballast returns)
 *   - confidence_score >= minConfidence (default 3)
 *
 * Terminals with no voyage data get zero atRisk / zero shareAtRisk.
 */
export function computeLngImportImpactsFromVoyages({
  lngImports,
  voyages,
  lookupShare,
  minConfidence = 3,
}: LngImportFromVoyagesInput): LngImportImpact[] {
  // Filter once
  const relevant = voyages.filter(
    (v) => v.voyage_type === "export" && v.confidence_score >= minConfidence,
  );

  // Bucket by destination terminal
  const sourcesByTerminal = new Map<string, SrcQty[]>();
  for (const v of relevant) {
    const list = sourcesByTerminal.get(v.to_terminal) ?? [];
    list.push({ iso3: v.from_country_iso3, qty: v.amount_cbm });
    sourcesByTerminal.set(v.to_terminal, list);
  }

  // We compare on terminal NAME (the LNG-T3 voyage `to_terminal` is the
  // terminal name). LngImportRow.asset_id includes a prefix like "lngt3/Name";
  // we strip the prefix to match.
  const out: LngImportImpact[] = [];
  for (const t of lngImports) {
    const terminalName = t.asset_id.startsWith("lngt3/")
      ? t.asset_id.slice("lngt3/".length).replace(/_/g, " ")  // best-effort restore
      : t.asset_id;

    // Try exact name match first; fall back to asset_id-derived
    const sources =
      sourcesByTerminal.get(terminalName) ??
      sourcesByTerminal.get(t.asset_id) ??
      [];

    // Aggregate by exporter for topSources
    const byExporter = new Map<string, number>();
    for (const s of sources) {
      byExporter.set(s.iso3, (byExporter.get(s.iso3) ?? 0) + s.qty);
    }
    const topSources = [...byExporter.entries()]
      .map(([iso3, qty]) => ({ iso3, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);

    const totalSupply = topSources.reduce((s, x) => s + x.qty, 0);
    let termAtRisk = 0;
    for (const src of topSources) {
      const share = lookupShare(src.iso3, t.country_iso3);
      if (share > 0) termAtRisk += src.qty * share;
    }

    out.push({
      asset_id: t.asset_id,
      iso3: t.country_iso3,
      capacity: t.capacity,
      atRiskQty: termAtRisk,
      shareAtRisk: totalSupply > 0 ? termAtRisk / totalSupply : 0,
      topSources,
      dataSource: "lng-t3",
    });
  }
  return out;
}
