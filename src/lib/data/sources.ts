import catalogJson from "../../../public/data/catalog.json";
import type { Catalog, CatalogEntry } from "@/lib/data-catalog/types";

/**
 * The catalog is imported statically (bundled at build) so tooltips can cite
 * source + as-of without a runtime fetch. Only metadata is read from it —
 * runtime SQL paths stay hardcoded (CLAUDE.md convention).
 */
const CATALOG = catalogJson as unknown as Catalog;

/** Catalog entries tagged with `layerTag` (e.g. "refineries"), in catalog order. */
export function catalogEntriesFor(layerTag: string, catalog: Catalog = CATALOG): CatalogEntry[] {
  return catalog.entries.filter((e) => e.layers.includes(layerTag));
}

/** "Zhou et al. 2026, LNG-T3 (Zenodo)" → "Zhou et al. 2026, LNG-T3". */
function sourceStem(sourceName: string): string {
  return (sourceName.split("(")[0] ?? sourceName).trim();
}

/**
 * The catalog entry behind a layer, or behind one row of a multi-source
 * layer: when `rowSource` (the row's `source` column) is given, the entry
 * whose source name it starts with wins; otherwise the layer's first entry.
 */
export function sourceEntry(
  layerTag: string,
  rowSource?: string | null,
  catalog: Catalog = CATALOG,
): CatalogEntry | undefined {
  const entries = catalogEntriesFor(layerTag, catalog);
  if (rowSource) {
    const match = entries.find((e) => rowSource.startsWith(sourceStem(e.source_name)));
    if (match) return match;
  }
  return entries[0];
}

/** "Source: Global Energy Monitor (as of 2023-07-01)", or null if uncatalogued. */
export function sourceLine(
  layerTag: string,
  rowSource?: string | null,
  catalog: Catalog = CATALOG,
): string | null {
  const e = sourceEntry(layerTag, rowSource, catalog);
  return e ? `Source: ${e.source_name} (as of ${e.as_of})` : null;
}
