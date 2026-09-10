import catalogJson from "../../../public/data/catalog.json";
import type { Catalog, CatalogEntry } from "./types";

/**
 * The catalog, imported statically (bundled at build) — metadata only, for
 * citations, licences and the download policy. Runtime SQL paths stay
 * hardcoded (CLAUDE.md convention).
 */
export const BUNDLED_CATALOG = catalogJson as unknown as Catalog;

/** True only when the catalog says the file may be offered as-is (fail closed). */
export function isDownloadable(entry: CatalogEntry): boolean {
  return entry.downloadable === true;
}
