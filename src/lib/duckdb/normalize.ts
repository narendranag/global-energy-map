/**
 * Arrow hands BIGINT (Int64) columns back as JS `bigint`, which cannot be
 * mixed with `number` in arithmetic ("Cannot mix BigInt and other types") and
 * never `===` a number. Every integer we store — years, counts, cbm cargo
 * sizes, IMO numbers — is far below 2^53, so converting to `number` is
 * lossless. Doing it once here means no caller ever sees a bigint.
 */
export function normalizeValue(v: unknown): unknown {
  return typeof v === "bigint" ? Number(v) : v;
}

/**
 * Copy `fields` out of each row (Arrow StructRow proxies or plain objects)
 * into plain objects, normalising BigInts to numbers.
 */
export function normalizeRows(
  rows: Iterable<Record<string, unknown>>,
  fields: readonly string[],
): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const row of rows) {
    const obj: Record<string, unknown> = {};
    for (const f of fields) obj[f] = normalizeValue(row[f]);
    out.push(obj);
  }
  return out;
}
