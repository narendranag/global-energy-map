import type { Catalog, CatalogEntry, DataFormat } from "./types";

export type { Catalog, CatalogEntry, DataFormat };

const REQUIRED_FIELDS = [
  "id",
  "label",
  "path",
  "format",
  "source_name",
  "source_url",
  "license",
  "as_of",
  "layers",
] as const;

function assertEntry(raw: unknown): asserts raw is CatalogEntry {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("entry must be object");
  }
  const obj = raw as Record<string, unknown>;
  for (const f of REQUIRED_FIELDS) {
    if (!(f in obj)) throw new Error(`entry missing field: ${f}`);
  }
}

export function parseCatalog(raw: unknown): Catalog {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("catalog must be object");
  }
  const obj = raw as Record<string, unknown>;
  if (obj.version !== 1) throw new Error("unsupported catalog version");
  if (typeof obj.generated_at !== "string") {
    throw new Error("generated_at required");
  }
  if (!Array.isArray(obj.entries)) throw new Error("entries must be array");
  for (const e of obj.entries as unknown[]) {
    assertEntry(e);
  }
  return obj as unknown as Catalog;
}

export async function loadCatalog(baseUrl = ""): Promise<Catalog> {
  const res = await fetch(`${baseUrl}/data/catalog.json`);
  if (!res.ok) throw new Error(`catalog fetch failed: ${String(res.status)}`);
  return parseCatalog(await res.json());
}
