export type DataFormat = "parquet" | "geoparquet" | "json";

export interface CatalogEntry {
  readonly id: string;
  readonly label: string;
  readonly path: string;
  readonly format: DataFormat;
  readonly source_name: string;
  readonly source_url: string;
  readonly license: string;
  readonly as_of: string;
  readonly layers: readonly string[];
}

export interface Catalog {
  readonly version: 1;
  readonly generated_at: string;
  readonly entries: readonly CatalogEntry[];
}
