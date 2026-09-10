import { toCsv } from "./csv";
import { apaCitation, attributionsFor } from "./citation";
import { featureCollection, type ExportMetadata } from "./geojson";
import type { ExportTable, LayerExportStatus } from "./layers";

/** File contents for one exportable layer: CSV with a `#` citation header, or GeoJSON. */

export interface FileContext {
  readonly viewUrl: string;
  /** YYYY-MM-DD */
  readonly exported: string;
}

function title(status: LayerExportStatus, table: ExportTable): string {
  return `Global Energy Map — ${status.label}${table.filter ? `: ${table.filter}` : ""}`;
}

export function layerHeader(status: LayerExportStatus, table: ExportTable, ctx: FileContext): string[] {
  const lines = [
    title(status, table),
    `${String(table.rows.length)} rows; all features of the layer, not clipped to the map viewport.`,
    ...status.entries.map(
      (e) => `Source: ${e.source_name} — ${e.label}, as of ${e.as_of}. Licence: ${e.license}. ${e.source_url}`,
    ),
  ];
  const attributions = attributionsFor(status.entries);
  if (attributions.length > 0) lines.push(`Required attribution: ${attributions.join("; ")}`);
  lines.push(
    `View: ${ctx.viewUrl}`,
    `Exported: ${ctx.exported}`,
    `Cite this site: ${apaCitation(undefined, { viewUrl: ctx.viewUrl, accessed: ctx.exported })}`,
  );
  return lines;
}

export function layerCsv(status: LayerExportStatus, table: ExportTable, ctx: FileContext): string {
  return toCsv(table.columns, table.rows, layerHeader(status, table, ctx));
}

export function layerGeoJson(status: LayerExportStatus, table: ExportTable, ctx: FileContext): string {
  const metadata: ExportMetadata = {
    title: title(status, table),
    view_url: ctx.viewUrl,
    exported: ctx.exported,
    cite: apaCitation(undefined, { viewUrl: ctx.viewUrl, accessed: ctx.exported }),
    sources: status.entries.map((e) => ({
      name: e.source_name,
      dataset: e.label,
      license: e.license,
      as_of: e.as_of,
      url: e.source_url,
      ...(e.attribution ? { attribution: e.attribution } : {}),
    })),
  };
  return `${JSON.stringify(featureCollection(table.features, metadata))}\n`;
}

export function layerFilename(key: string, year: number, ext: "csv" | "geojson"): string {
  return `global-energy-map_${key}_${String(year)}.${ext}`;
}
