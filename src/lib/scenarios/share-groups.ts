/** The fields a cited route share needs for grouping (engine rows + citation). */
export interface GroupableShare {
  /** null = the importer-wide wildcard (S5); see InboundDisruptionRouteRow. */
  readonly exporter_iso3: string | null;
  readonly importer_iso3: string | null;
  readonly share: number;
  readonly source_title?: string | null;
  readonly source_url?: string | null;
  readonly source_year?: number | null;
  readonly data_year?: number | null;
  readonly source_note?: string | null;
}

/** Rows that read as one entry; `rows.length > 1` only for identical pair rows. */
export interface ShareGroup<R extends GroupableShare> {
  readonly rows: readonly [R, ...R[]];
}

/**
 * Collapse pair rows (both sides set) that carry the same share and the same
 * citation into one group, so the 42 share-0 intra-Gulf Hormuz pairs list as
 * one entry rather than 42. A wildcard row — exporter-wide or importer-wide —
 * is a statement about a whole country rather than one pair, so it always
 * stands alone. Groups keep the order of their first row.
 */
export function groupIdenticalPairShares<R extends GroupableShare>(
  rows: readonly R[],
): ShareGroup<R>[] {
  const groups: [R, ...R[]][] = [];
  const byKey = new Map<string, [R, ...R[]]>();
  for (const r of rows) {
    if (r.importer_iso3 === null || r.exporter_iso3 === null) {
      groups.push([r]);
      continue;
    }
    const key = JSON.stringify([
      r.share,
      r.source_title ?? "",
      r.source_url ?? "",
      r.source_year ?? null,
      // Two rows citing the same document for different years are two
      // different statements, so they never read as one entry.
      r.data_year ?? null,
      r.source_note ?? "",
    ]);
    const group = byKey.get(key);
    if (group) {
      group.push(r);
    } else {
      const fresh: [R, ...R[]] = [r];
      byKey.set(key, fresh);
      groups.push(fresh);
    }
  }
  return groups.map((g) => ({ rows: g }));
}

/** "IRN→IRQ", "IRN→*" (exporter-wide), "*→KWT" (importer-wide). */
export function pairLabel(r: Pick<GroupableShare, "exporter_iso3" | "importer_iso3">): string {
  return `${r.exporter_iso3 ?? "*"}→${r.importer_iso3 ?? "*"}`;
}
