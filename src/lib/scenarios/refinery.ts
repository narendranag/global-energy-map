import type { RefineryImpact, RefineryRow } from "./types";

interface SrcQty {
  readonly iso3: string;
  readonly qty: number;
}

export interface RefineryImpactInput {
  readonly refineries: readonly RefineryRow[];
  readonly flowsByImporter: ReadonlyMap<string, readonly SrcQty[]>;
  readonly lookupShare: (exporter: string, importer: string) => number;
}

export function computeRefineryImpacts({
  refineries,
  flowsByImporter,
  lookupShare,
}: RefineryImpactInput): RefineryImpact[] {
  const countryCap = new Map<string, number>();
  const countryCount = new Map<string, number>();
  for (const r of refineries) {
    countryCap.set(r.country_iso3, (countryCap.get(r.country_iso3) ?? 0) + r.capacity);
    countryCount.set(r.country_iso3, (countryCount.get(r.country_iso3) ?? 0) + 1);
  }

  const out: RefineryImpact[] = [];
  for (const r of refineries) {
    const totalCap = countryCap.get(r.country_iso3) ?? 0;
    const count = countryCount.get(r.country_iso3) ?? 0;
    const refShare =
      totalCap > 0 ? r.capacity / totalCap : count > 0 ? 1 / count : 0;

    const flows = flowsByImporter.get(r.country_iso3) ?? [];
    const sources = flows.map((f) => ({ iso3: f.iso3, qty: f.qty * refShare }));
    const totalFeedstock = sources.reduce((s, x) => s + x.qty, 0);

    let refAtRisk = 0;
    for (const src of sources) {
      const share = lookupShare(src.iso3, r.country_iso3);
      if (share > 0) refAtRisk += src.qty * share;
    }
    const topSources = [...sources].sort((a, b) => b.qty - a.qty).slice(0, 5);

    out.push({
      asset_id: r.asset_id,
      iso3: r.country_iso3,
      capacity: r.capacity,
      atRiskQty: refAtRisk,
      shareAtRisk: totalFeedstock > 0 ? refAtRisk / totalFeedstock : 0,
      topSources,
    });
  }
  return out;
}
