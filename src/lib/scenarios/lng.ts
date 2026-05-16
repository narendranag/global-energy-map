import type { LngImportImpact, LngImportRow } from "./types";

interface SrcQty {
  readonly iso3: string;
  readonly qty: number;
}

export interface LngImportImpactInput {
  readonly lngImports: readonly LngImportRow[];
  readonly flowsByImporter: ReadonlyMap<string, readonly SrcQty[]>;
  readonly lookupShare: (exporter: string, importer: string) => number;
}

export function computeLngImportImpacts({
  lngImports,
  flowsByImporter,
  lookupShare,
}: LngImportImpactInput): LngImportImpact[] {
  const countryCap = new Map<string, number>();
  const countryCount = new Map<string, number>();
  for (const t of lngImports) {
    countryCap.set(t.country_iso3, (countryCap.get(t.country_iso3) ?? 0) + t.capacity);
    countryCount.set(t.country_iso3, (countryCount.get(t.country_iso3) ?? 0) + 1);
  }

  const out: LngImportImpact[] = [];
  for (const t of lngImports) {
    const totalCap = countryCap.get(t.country_iso3) ?? 0;
    const count = countryCount.get(t.country_iso3) ?? 0;
    const termShare = totalCap > 0 ? t.capacity / totalCap : count > 0 ? 1 / count : 0;

    const flows = flowsByImporter.get(t.country_iso3) ?? [];
    const sources = flows.map((f) => ({ iso3: f.iso3, qty: f.qty * termShare }));
    const totalSupply = sources.reduce((s, x) => s + x.qty, 0);

    let termAtRisk = 0;
    for (const src of sources) {
      const share = lookupShare(src.iso3, t.country_iso3);
      if (share > 0) termAtRisk += src.qty * share;
    }
    const topSources = [...sources].sort((a, b) => b.qty - a.qty).slice(0, 5);

    out.push({
      asset_id: t.asset_id,
      iso3: t.country_iso3,
      capacity: t.capacity,
      atRiskQty: termAtRisk,
      shareAtRisk: totalSupply > 0 ? termAtRisk / totalSupply : 0,
      topSources,
    });
  }
  return out;
}
