/**
 * RFC 4180 CSV serialisation for exports (scenario table, layer rows).
 *
 * - Fields containing a comma, double quote, CR/LF, or leading/trailing
 *   whitespace are quoted; embedded quotes are doubled.
 * - null / undefined / non-finite numbers → empty field.
 * - Optional leading `# ` comment lines carry the citation header (pandas:
 *   `read_csv(path, comment="#")`; R: `read.csv(path, comment.char = "#")`).
 *   No BOM: a BOM before `#` would defeat comment detection.
 * - Records end in `\n`.
 */

export type CsvValue = string | number | boolean | null | undefined;

export function csvField(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (/[",\r\n]/.test(value) || value !== value.trim()) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Comment lines: each input line (split on newlines) becomes `# …`. */
export function csvComments(lines: readonly string[]): string {
  return lines
    .flatMap((l) => l.split(/\r?\n/))
    .map((l) => (l === "" ? "#" : `# ${l}`))
    .join("\n");
}

export function toCsv<R extends Record<string, unknown>>(
  columns: readonly (keyof R & string)[],
  rows: readonly R[],
  comments: readonly string[] = [],
): string {
  const out: string[] = [];
  if (comments.length > 0) out.push(csvComments(comments));
  out.push(columns.map((c) => csvField(c)).join(","));
  for (const r of rows) {
    out.push(columns.map((c) => csvField(toCsvValue(r[c]))).join(","));
  }
  return `${out.join("\n")}\n`;
}

function toCsvValue(v: unknown): CsvValue {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v === "bigint") return Number(v);
  return JSON.stringify(v);
}
