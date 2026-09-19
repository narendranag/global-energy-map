"use client";
import { useMemo } from "react";
import { useAssets } from "@/lib/data/assets";
import {
  loadAllTradeFlows,
  loadCountryExposure,
  loadCountrySeries,
} from "@/lib/data/country-inputs";
import { buildCountryProfile, type CountryProfile } from "@/lib/data/country-profile";
import { loadGasStorage } from "@/lib/data/gas-storage";
import { loadRecentImports } from "@/lib/data/recent-imports";
import { useAsync } from "@/lib/data/useAsync";
import { useCountryNames } from "@/lib/geo/useCountryNames";
import type { Commodity } from "@/lib/scenarios/types";

/**
 * The focused country's profile, filled in progressively.
 *
 * Deliberately **not** counted in the page's `pending` / `data-ready` signal:
 * the panel's first paint needs only the country's name, which the focus
 * outline has already loaded, and blocking readiness on ~1 MB of BACI would
 * turn every `?focus=` link into a long white wait (and stall e2e). Each
 * section renders as soon as its own loader resolves, and says "Loading…"
 * until then.
 *
 * GIE gas storage is fetched only on the gas axis: it is a 750 KB file whose
 * one contribution here is a fullness percentage for 22 European countries,
 * and paying for it while reading an oil profile is not a trade anyone asked
 * for. The same reading is on the map's own Gas storage layer either way.
 */
export function useCountryProfile(
  iso3: string | null,
  year: number,
  commodity: Commodity,
): CountryProfile | null {
  const names = useCountryNames();
  const assets = useAssets(iso3 !== null);
  const { data: series } = useAsync(loadCountrySeries, iso3 === null ? null : []);
  const { data: trade } = useAsync(loadAllTradeFlows, iso3 === null ? null : []);
  const { data: exposure, ready: exposureReady } = useAsync(
    loadCountryExposure,
    iso3 === null ? null : [year, commodity],
  );
  const { data: gasStorage } = useAsync(
    loadGasStorage,
    iso3 !== null && commodity === "gas" ? [] : null,
  );
  const { data: recentImports, ready: recentReady } = useAsync(
    loadRecentImports,
    iso3 === null ? null : [commodity],
  );

  return useMemo(() => {
    if (iso3 === null) return null;
    return buildCountryProfile(
      {
        names,
        series,
        trade,
        // A stale result belongs to another (year, commodity): show nothing
        // rather than last year's exposure under this year's heading.
        exposure: exposureReady ? exposure : null,
        gasStorage,
        recentImports: recentReady ? recentImports : null,
        assets,
      },
      iso3,
      year,
      commodity,
    );
  }, [
    iso3,
    year,
    commodity,
    names,
    series,
    trade,
    exposure,
    exposureReady,
    gasStorage,
    recentImports,
    recentReady,
    assets,
  ]);
}
