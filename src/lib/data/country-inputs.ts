import { cachedLoader } from "./cache";
import { readParquet } from "./parquet";
import { loadScenarioInputs } from "./scenario-inputs";
import type { CountrySeriesRow, CountryTradeRow } from "./country-profile";
import { computeScenarioImpact } from "@/lib/scenarios/engine";
import { SCENARIOS } from "@/lib/scenarios/registry";
import type { Commodity, ScenarioId, ScenarioResult } from "@/lib/scenarios/types";

/**
 * Loaders behind the country panel (S3). Every one of them reads a file some
 * other part of the app already reads, with the **same column set**, so
 * `readParquet`'s per-(path, columns) cache hands back the rows that are
 * already decoded — opening the panel adds no fetch when the scenario or the
 * reserves choropleth has run, and one small fetch when it has not.
 *
 * None of this is on the first-paint path: the panel renders its header from
 * `countries.geojson` (already loaded for the focus outline) and fills its
 * sections in as they arrive, so it contributes nothing to the page's
 * `pending` count and cannot stall the e2e ready signal.
 */

/** Same columns `loadReserves` asks for, so the decode is shared. */
const SERIES_COLUMNS = ["iso3", "year", "metric", "value"] as const;

/** Every country-year row (reserves + production), all years. */
export const loadCountrySeries = cachedLoader(
  (): Promise<readonly CountrySeriesRow[]> =>
    readParquet<CountrySeriesRow>("/data/country_year_series.parquet", SERIES_COLUMNS),
);

/** Same columns `loadTradeFlows` asks for, so the decode is shared. */
const TRADE_COLUMNS = ["year", "hs_code", "importer_iso3", "exporter_iso3", "qty"] as const;

/**
 * All of BACI, every year and both commodities. The panel needs the whole
 * span for its 1995–2024 sparkline, and filtering in memory is what every
 * other loader here does.
 */
export const loadAllTradeFlows = cachedLoader(
  (): Promise<readonly CountryTradeRow[]> =>
    readParquet<CountryTradeRow>("/data/trade_flow.parquet", TRADE_COLUMNS),
);

/**
 * Every registered scenario's engine result for one (year, commodity), keyed
 * by scenario id — so the panel can say what a country is exposed to without
 * the user selecting each scenario in turn.
 *
 * Scenarios come from `SCENARIOS`, so one added elsewhere appears here with
 * no change; those that do not apply to the commodity are not run at all.
 * The engine is called **without** refinery or LNG-terminal rows: the panel
 * only reads `byImporter`, and skipping the asset attribution keeps this to
 * a handful of passes over one year of BACI rows. Cached on (year,
 * commodity), so switching the focused country re-runs nothing.
 */
export const loadCountryExposure = cachedLoader(
  async (year: number, commodity: Commodity): Promise<ReadonlyMap<ScenarioId, ScenarioResult>> => {
    const defs = SCENARIOS.filter((s) => s.commodities.includes(commodity));
    const entries = await Promise.all(
      defs.map(async (def) => {
        const inputs = await loadScenarioInputs(def.id, year, commodity);
        return [
          def.id,
          computeScenarioImpact({
            scenarioId: def.id,
            commodity,
            year,
            tradeFlows: inputs.tradeFlows,
            routes: inputs.routes,
          }),
        ] as const;
      }),
    );
    return new Map(entries);
  },
);
