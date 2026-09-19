/**
 * The country profile (S3): everything the country panel reads about one
 * country in one year, as a pure function of already-loaded rows.
 *
 * Nothing here fetches. `buildCountryProfile` takes the raw tables the shared
 * module-cached loaders return (`country_year_series`, `trade_flow`, the
 * scenario engine's results, GIE, Comtrade, `assets.parquet`), slices out one
 * country and returns a render-ready shape. Every section carries its own
 * `source` line, taken from the generated catalog rather than typed by hand,
 * and every section is `null` when the country has no data for it — an absent
 * section is the honest answer, not a zero.
 *
 * Unit-tested in tests/unit/data/country-profile.test.ts.
 */
import type { AssetsByKind } from "./assets";
import type { GasStorageData } from "./gas-storage";
import type { RecentImport, RecentImportsData } from "./recent-imports";
import { sourceLine } from "./sources";
import { RESERVES_METRIC } from "./reserves";
import { YEAR_MAX, YEAR_MIN } from "@/lib/time/range";
import { SCENARIOS, isScenarioActive, type ScenarioDef } from "@/lib/scenarios/registry";
import type { Commodity, ScenarioId, ScenarioResult } from "@/lib/scenarios/types";

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** A row of `country_year_series.parquet`. */
export interface CountrySeriesRow {
  readonly iso3: string;
  readonly year: number;
  readonly metric: string;
  readonly value: number | null;
  readonly unit?: string | null;
}

/** A row of `trade_flow.parquet` (BACI), before the commodity filter. */
export interface CountryTradeRow {
  readonly year: number;
  readonly hs_code: string;
  readonly importer_iso3: string;
  readonly exporter_iso3: string;
  readonly qty: number | null;
}

/** BACI HS codes, mirroring `scenario-inputs.ts`. */
export const HS_BY_COMMODITY: Record<Commodity, string> = { oil: "2709", gas: "271111" };

/** First year BACI covers (`src/lib/modes`: TRADE_FIRST_YEAR). */
export const TRADE_FIRST_YEAR = 1995;

/**
 * Everything the profile is built from. Each field is whatever its loader
 * returned, or null while it is still loading / was not requested — the
 * profile then simply omits that section.
 */
export interface CountryProfileInputs {
  /** iso3 → display name (countries.geojson + the BACI extras). */
  readonly names: ReadonlyMap<string, string> | null;
  /** All of `country_year_series.parquet`. */
  readonly series: readonly CountrySeriesRow[] | null;
  /** All of `trade_flow.parquet`. */
  readonly trade: readonly CountryTradeRow[] | null;
  /** Engine results keyed by scenario, for the current (year, commodity). */
  readonly exposure: ReadonlyMap<ScenarioId, ScenarioResult> | null;
  readonly gasStorage: GasStorageData | null;
  readonly recentImports: RecentImportsData | null;
  readonly assets: AssetsByKind | null;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export interface SeriesPoint {
  readonly year: number;
  /** null = the source has no value for this year (the sparkline breaks). */
  readonly value: number | null;
}

export interface CountryTimeSeries {
  readonly label: string;
  readonly unit: string;
  /** One point per year over the series' full span, gaps included. */
  readonly points: readonly SeriesPoint[];
  /** Value at the headline year, and the year it came from (may be earlier). */
  readonly value: number | null;
  readonly valueYear: number | null;
  /** Index into `points` of `valueYear`, for the slider marker; -1 if none. */
  readonly markerIndex: number;
  readonly min: { readonly year: number; readonly value: number } | null;
  readonly max: { readonly year: number; readonly value: number } | null;
  readonly first: SeriesPoint | null;
  readonly last: SeriesPoint | null;
  /** "Source: … (as of …)" from the catalog; null when uncatalogued. */
  readonly source: string | null;
  /** Set when the headline value is older than the selected year. */
  readonly staleNote: string | null;
}

export interface PartnerRow {
  readonly iso3: string;
  readonly name: string;
  /** BACI tonnes in the selected year. */
  readonly qty: number;
  /** Fraction of the country's total on this side of the trade. */
  readonly share: number;
}

export interface CountryTrade {
  readonly hsCode: string;
  readonly year: number;
  /** Total imports / exports in the selected year, BACI tonnes. */
  readonly importsQty: number;
  readonly exportsQty: number;
  readonly suppliers: readonly PartnerRow[];
  readonly customers: readonly PartnerRow[];
  /** null when the country never appears on that side of the trade. */
  readonly importsSeries: CountryTimeSeries | null;
  readonly exportsSeries: CountryTimeSeries | null;
  readonly source: string | null;
  /** True when BACI has no row at all for this country in this year. */
  readonly emptyYear: boolean;
}

export interface ExposureRow {
  readonly scenarioId: ScenarioId;
  readonly label: string;
  readonly routeName: string;
  /** Fraction of the country's imports at risk (the engine's lower bound). */
  readonly shareAtRisk: number;
  /** Tonnes at risk. */
  readonly atRiskQty: number;
  readonly totalQty: number;
}

export interface CountryInfrastructure {
  readonly kind: "lng_import" | "lng_export" | "refinery" | "extraction_site";
  readonly label: string;
  readonly count: number;
  /** Summed capacity of the rows that have one; null when none do. */
  readonly capacity: number | null;
  readonly capacityUnit: string | null;
  /** How many rows carried a capacity (the rest are counted, not summed). */
  readonly withCapacity: number;
  readonly source: string | null;
}

export interface CountryGasStorage {
  readonly gasDay: string;
  readonly percentFull: number;
  readonly source: string | null;
}

export interface CountryRecentImports extends RecentImport {
  readonly commodity: Commodity;
  readonly source: string | null;
}

export interface CountryProfile {
  readonly iso3: string;
  readonly name: string;
  readonly year: number;
  readonly commodity: Commodity;
  readonly reserves: CountryTimeSeries | null;
  readonly production: CountryTimeSeries | null;
  readonly trade: CountryTrade | null;
  readonly exposure: readonly ExposureRow[];
  readonly infrastructure: readonly CountryInfrastructure[];
  readonly gasStorage: CountryGasStorage | null;
  readonly recentImports: CountryRecentImports | null;
  /** True when nothing at all is known about the country yet. */
  readonly empty: boolean;
}

// ---------------------------------------------------------------------------
// Series helpers
// ---------------------------------------------------------------------------

const PRODUCTION_METRIC = "production_crude_kbpd";

const METRIC_LABEL: Record<string, string> = {
  proved_reserves_oil_bbn_bbl: "Proved oil reserves",
  proved_reserves_gas_tcm: "Proved gas reserves",
  production_crude_kbpd: "Crude production",
};

const METRIC_UNIT: Record<string, string> = {
  proved_reserves_oil_bbn_bbl: "bn bbl",
  proved_reserves_gas_tcm: "tcm",
  production_crude_kbpd: "kb/d",
};

/**
 * Turn `(year → value)` into a dense series over [from, through], with the
 * headline value taken at `year` or, if the series stops earlier, at its own
 * last year (EI froze reserves at 2020; saying so beats showing a blank).
 */
export function toTimeSeries(
  byYear: ReadonlyMap<number, number>,
  opts: {
    readonly label: string;
    readonly unit: string;
    readonly from: number;
    readonly through: number;
    readonly year: number;
    readonly source: string | null;
    readonly staleLabel?: string;
  },
): CountryTimeSeries | null {
  if (byYear.size === 0) return null;
  const points: SeriesPoint[] = [];
  for (let y = opts.from; y <= opts.through; y++) {
    points.push({ year: y, value: byYear.get(y) ?? null });
  }
  let min: { year: number; value: number } | null = null;
  let max: { year: number; value: number } | null = null;
  let first: SeriesPoint | null = null;
  let last: SeriesPoint | null = null;
  for (const p of points) {
    if (p.value === null) continue;
    first ??= p;
    last = p;
    if (min === null || p.value < min.value) min = { year: p.year, value: p.value };
    if (max === null || p.value > max.value) max = { year: p.year, value: p.value };
  }

  // The headline year, then the latest year at or before it, then nothing.
  let valueYear: number | null = null;
  if (byYear.has(opts.year)) {
    valueYear = opts.year;
  } else {
    for (const y of byYear.keys()) {
      if (y <= opts.year && (valueYear === null || y > valueYear)) valueYear = y;
    }
  }
  const value = valueYear === null ? null : (byYear.get(valueYear) ?? null);
  const markerIndex = valueYear === null ? -1 : points.findIndex((p) => p.year === valueYear);
  const staleNote =
    valueYear !== null && valueYear < opts.year
      ? `${String(valueYear)} value — ${opts.staleLabel ?? "the latest the source publishes"}`
      : null;

  return {
    label: opts.label,
    unit: opts.unit,
    points,
    value,
    valueYear,
    markerIndex,
    min,
    max,
    first,
    last,
    source: opts.source,
    staleNote,
  };
}

/** Plain-language alternative text for a sparkline (WCAG: the chart is an image). */
export function describeSeries(s: CountryTimeSeries): string {
  if (s.first === null || s.last === null || s.min === null || s.max === null) {
    return `${s.label}: no data.`;
  }
  const n = (v: number) => formatSeriesValue(v);
  const span =
    s.first.year === s.last.year
      ? `${String(s.first.year)} only`
      : `${String(s.first.year)}–${String(s.last.year)}`;
  const ends = `${n(s.first.value ?? 0)} to ${n(s.last.value ?? 0)} ${s.unit}`;
  const extremes =
    s.min.value === s.max.value
      ? `flat at ${n(s.min.value)} ${s.unit}`
      : `low ${n(s.min.value)} in ${String(s.min.year)}, high ${n(s.max.value)} in ${String(s.max.year)}`;
  return `${s.label}, ${span}: ${ends}; ${extremes}.`;
}

/** Compact number for panel text: 3 significant-ish digits, thousands grouped. */
export function formatSeriesValue(v: number): string {
  const abs = Math.abs(v);
  const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : abs >= 1 ? 2 : 3;
  return v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

// ---------------------------------------------------------------------------
// The profile
// ---------------------------------------------------------------------------

function seriesByYear(
  rows: readonly CountrySeriesRow[],
  iso3: string,
  metric: string,
): Map<number, number> {
  const out = new Map<number, number>();
  for (const r of rows) {
    if (r.iso3 !== iso3 || r.metric !== metric) continue;
    if (r.value === null || !Number.isFinite(r.value)) continue;
    out.set(r.year, r.value);
  }
  return out;
}

function partnerRows(
  totals: ReadonlyMap<string, number>,
  grandTotal: number,
  names: ReadonlyMap<string, string> | null,
  limit: number,
): PartnerRow[] {
  return [...totals]
    .filter(([, qty]) => qty > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([iso3, qty]) => ({
      iso3,
      name: names?.get(iso3) ?? iso3,
      qty,
      share: grandTotal > 0 ? qty / grandTotal : 0,
    }));
}

/** How many partners each side of the trade lists before "and the rest". */
export const TOP_PARTNERS = 5;

function buildTrade(
  rows: readonly CountryTradeRow[],
  iso3: string,
  year: number,
  commodity: Commodity,
  names: ReadonlyMap<string, string> | null,
): CountryTrade | null {
  const hs = HS_BY_COMMODITY[commodity];
  const importsByYear = new Map<number, number>();
  const exportsByYear = new Map<number, number>();
  const suppliers = new Map<string, number>();
  const customers = new Map<string, number>();
  let touched = false;
  for (const r of rows) {
    if (r.hs_code !== hs) continue;
    const qty = r.qty ?? 0;
    if (r.importer_iso3 === iso3) {
      touched = true;
      importsByYear.set(r.year, (importsByYear.get(r.year) ?? 0) + qty);
      if (r.year === year) suppliers.set(r.exporter_iso3, (suppliers.get(r.exporter_iso3) ?? 0) + qty);
    }
    if (r.exporter_iso3 === iso3) {
      touched = true;
      exportsByYear.set(r.year, (exportsByYear.get(r.year) ?? 0) + qty);
      if (r.year === year) customers.set(r.importer_iso3, (customers.get(r.importer_iso3) ?? 0) + qty);
    }
  }
  if (!touched) return null;

  const noun = commodity === "gas" ? "LNG" : "crude";
  const unit = "t";
  const source = sourceLine("trade");
  const importsQty = importsByYear.get(year) ?? 0;
  const exportsQty = exportsByYear.get(year) ?? 0;
  const span = { from: TRADE_FIRST_YEAR, through: YEAR_MAX, year, source };
  const importsSeries = toTimeSeries(importsByYear, {
    ...span,
    label: `${noun} imports`,
    unit,
    staleLabel: "the latest year BACI records for this country",
  });
  const exportsSeries = toTimeSeries(exportsByYear, {
    ...span,
    label: `${noun} exports`,
    unit,
    staleLabel: "the latest year BACI records for this country",
  });
  if (importsSeries === null && exportsSeries === null) return null;

  return {
    hsCode: hs,
    year,
    importsQty,
    exportsQty,
    suppliers: partnerRows(suppliers, importsQty, names, TOP_PARTNERS),
    customers: partnerRows(customers, exportsQty, names, TOP_PARTNERS),
    importsSeries,
    exportsSeries,
    source,
    emptyYear: importsQty === 0 && exportsQty === 0,
  };
}

/**
 * The country's row in every scenario result, most exposed first. Scenarios
 * that do not apply to the commodity, or whose `activeYears` exclude the
 * selected year (Kirkuk-Ceyhan's shutdown, say), are never run and are absent
 * here; a scenario the country has no BACI imports under is dropped rather
 * than shown as a confident 0%.
 */
export function buildExposure(
  results: ReadonlyMap<ScenarioId, ScenarioResult>,
  iso3: string,
  commodity: Commodity,
  year: number,
  scenarios: readonly ScenarioDef[] = SCENARIOS,
): ExposureRow[] {
  const rows: ExposureRow[] = [];
  for (const def of scenarios) {
    if (!def.commodities.includes(commodity)) continue;
    if (!isScenarioActive(def, year)) continue;
    const result = results.get(def.id);
    if (result?.commodity !== commodity) continue;
    const impact = result.byImporter.find((i) => i.iso3 === iso3);
    if (impact === undefined || impact.totalQty <= 0) continue;
    rows.push({
      scenarioId: def.id,
      label: def.label,
      routeName: def.routeName,
      shareAtRisk: impact.shareAtRisk,
      atRiskQty: impact.atRiskQty,
      totalQty: impact.totalQty,
    });
  }
  return rows.sort((a, b) => b.shareAtRisk - a.shareAtRisk || a.label.localeCompare(b.label));
}

interface AssetLike {
  readonly country_iso3: string;
  readonly capacity: number | null;
  readonly capacity_unit: string | null;
}

function summarise(
  rows: readonly AssetLike[],
  iso3: string,
  kind: CountryInfrastructure["kind"],
  label: string,
  layerTag: string,
): CountryInfrastructure | null {
  let count = 0;
  let withCapacity = 0;
  let capacity = 0;
  let unit: string | null = null;
  for (const r of rows) {
    if (r.country_iso3 !== iso3) continue;
    count += 1;
    if (r.capacity !== null && Number.isFinite(r.capacity)) {
      withCapacity += 1;
      capacity += r.capacity;
      unit ??= r.capacity_unit;
    }
  }
  if (count === 0) return null;
  return {
    kind,
    label,
    count,
    capacity: withCapacity > 0 ? capacity : null,
    capacityUnit: withCapacity > 0 ? unit : null,
    withCapacity,
    source: sourceLine(layerTag),
  };
}

/**
 * Build the whole profile. Pure: every argument is data the caller already
 * loaded, and nothing here touches the network, the DOM or the clock.
 */
export function buildCountryProfile(
  inputs: CountryProfileInputs,
  iso3: string,
  year: number,
  commodity: Commodity,
): CountryProfile {
  const name = inputs.names?.get(iso3) ?? iso3;

  const reservesMetric = RESERVES_METRIC[commodity];
  const reserves =
    inputs.series === null
      ? null
      : toTimeSeries(seriesByYear(inputs.series, iso3, reservesMetric), {
          label: METRIC_LABEL[reservesMetric] ?? reservesMetric,
          unit: METRIC_UNIT[reservesMetric] ?? "",
          from: YEAR_MIN,
          through: YEAR_MAX,
          year,
          source: sourceLine(commodity === "gas" ? "reserves:gas" : "reserves"),
          staleLabel: "the Energy Institute has not refreshed reserves since",
        });

  const production =
    inputs.series === null
      ? null
      : toTimeSeries(seriesByYear(inputs.series, iso3, PRODUCTION_METRIC), {
          label: METRIC_LABEL[PRODUCTION_METRIC] ?? PRODUCTION_METRIC,
          unit: METRIC_UNIT[PRODUCTION_METRIC] ?? "",
          from: YEAR_MIN,
          through: YEAR_MAX,
          year,
          source: sourceLine("production"),
          staleLabel: "the latest year the Energy Institute publishes for this country",
        });

  const trade =
    inputs.trade === null ? null : buildTrade(inputs.trade, iso3, year, commodity, inputs.names);

  const exposure =
    inputs.exposure === null ? [] : buildExposure(inputs.exposure, iso3, commodity, year);

  const infrastructure: CountryInfrastructure[] = [];
  if (inputs.assets !== null) {
    const a = inputs.assets;
    const parts = [
      summarise(a.lngImport, iso3, "lng_import", "LNG import terminals", "lng_terminals"),
      summarise(a.lngExport, iso3, "lng_export", "LNG export terminals", "lng_terminals"),
      summarise(a.refinery, iso3, "refinery", "Refineries", "refineries"),
      summarise(a.extraction, iso3, "extraction_site", "Extraction sites", "extraction"),
    ];
    for (const p of parts) if (p !== null) infrastructure.push(p);
  }

  const storagePct = inputs.gasStorage?.values.get(iso3);
  const gasStorage =
    inputs.gasStorage && storagePct !== undefined
      ? {
          gasDay: inputs.gasStorage.gasDay,
          percentFull: storagePct,
          source: sourceLine("gas_storage"),
        }
      : null;

  const recent = inputs.recentImports?.byIso3.get(iso3);
  const recentImports =
    recent === undefined
      ? null
      : { ...recent, commodity, source: sourceLine("trade_monthly") };

  return {
    iso3,
    name,
    year,
    commodity,
    reserves,
    production,
    trade,
    exposure,
    infrastructure,
    gasStorage,
    recentImports,
    empty:
      reserves === null &&
      production === null &&
      trade === null &&
      exposure.length === 0 &&
      infrastructure.length === 0 &&
      gasStorage === null &&
      recentImports === null,
  };
}
