import type { SqlReferences } from "./references";
import { findTable, findTableByPath, type QueryTable } from "./tables";

/**
 * May the result of this query be saved as a file?
 *
 * The console shows every table on screen — the map already renders all of
 * these rows — but a **file** may only leave the browser when every table the
 * query reads is `downloadable: true` in the catalog. That is the same rule
 * /data applies, extended one step: a join between a downloadable and a
 * view-only table produces a new derived table, and must not be allowed to
 * launder the view-only side (LICENSE-DATA.md).
 *
 * Fails closed. If `referencesFromSerializedSql` could not prove what the
 * query reads, or it names something the catalog does not know, export is
 * refused and the reason says so.
 */

export type ExportGate =
  | { readonly allowed: true; readonly tables: readonly QueryTable[] }
  | {
      readonly allowed: false;
      readonly reason: string;
      /** View-only tables that block the export, when that is the cause. */
      readonly blocking: readonly QueryTable[];
      readonly tables: readonly QueryTable[];
    };

export function exportGate(refs: SqlReferences, tables: readonly QueryTable[]): ExportGate {
  if (refs.unresolved.length > 0) {
    return { allowed: false, reason: refs.unresolved.join(" "), blocking: [], tables: [] };
  }

  const used: QueryTable[] = [];
  const unknown: string[] = [];

  for (const name of refs.tables) {
    const t = findTable(name, tables);
    if (t === undefined) unknown.push(name);
    else if (!used.includes(t)) used.push(t);
  }
  for (const path of refs.files) {
    const t = findTableByPath(path, tables);
    if (t === undefined) unknown.push(path);
    else if (!used.includes(t)) used.push(t);
  }

  if (unknown.length > 0) {
    return {
      allowed: false,
      reason: `Export cannot check ${unknown.map((u) => `"${u}"`).join(", ")}: not a table in the data catalogue.`,
      blocking: [],
      tables: used,
    };
  }

  const blocking = used.filter((t) => !t.downloadable);
  if (blocking.length > 0) {
    const names = blocking.map((t) => t.name).join(", ");
    const why = blocking.map((t) => `${t.name}: ${t.downloadNote ?? ""}`).join(" ");
    return {
      allowed: false,
      reason: `${names} ${blocking.length === 1 ? "is" : "are"} view-only, so this result cannot be saved as a file. ${why}`.trim(),
      blocking,
      tables: used,
    };
  }

  return { allowed: true, tables: used };
}
