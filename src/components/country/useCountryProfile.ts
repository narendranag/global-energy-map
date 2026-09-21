"use client";
import { useMemo } from "react";
import { useAssets } from "@/lib/data/assets";
import {
  loadAllTradeFlows,
  loadCountryExposure,
  loadCountrySeries,
  loadRouteYears,
} from "@/lib/data/country-inputs";
import { buildCountryProfile, type CountryProfile } from "@/lib/data/country-profile";
import { loadGasStorage } from "@/lib/data/gas-storage";
import { loadRecentImports } from "@/lib/data/recent-imports";
import type { YearSpan } from "@/lib/data/section-vintage";
import { useAsync, type AsyncState } from "@/lib/data/useAsync";
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
export interface CountryProfileSectionError {
  /** What the reader was waiting for, in the panel's own words. */
  readonly section: string;
  readonly retry: () => void;
}

export interface CountryProfileState {
  readonly profile: CountryProfile | null;
  /** Sections whose loader rejected. Never escalated to the error panel (B7). */
  readonly errors: readonly CountryProfileSectionError[];
  /**
   * Publication years of the documents behind the exposure rows' route
   * shares. Kept beside the profile rather than inside it: the profile is a
   * pure function of already-loaded rows, and this is provenance about a
   * second input the engine consumed and discarded.
   */
  readonly routeYears: YearSpan | null;
}

export function useCountryProfile(
  iso3: string | null,
  year: number,
  commodity: Commodity,
): CountryProfileState {
  const names = useCountryNames();
  const assets = useAssets(iso3 !== null);
  // `fatal: false` everywhere here: the panel is a second reader off the
  // critical path (see the note above), so a failed section renders an inline
  // notice with a retry instead of replacing the map with the error panel.
  const NON_FATAL = { fatal: false } as const;
  const seriesState = useAsync(loadCountrySeries, iso3 === null ? null : [], NON_FATAL);
  const tradeState = useAsync(loadAllTradeFlows, iso3 === null ? null : [], NON_FATAL);
  const exposureState = useAsync(
    loadCountryExposure,
    iso3 === null ? null : [year, commodity],
    NON_FATAL,
  );
  const gasStorageState = useAsync(
    loadGasStorage,
    iso3 !== null && commodity === "gas" ? [] : null,
    NON_FATAL,
  );
  const recentState = useAsync(loadRecentImports, iso3 === null ? null : [commodity], NON_FATAL);
  // Provenance only, never a number on screen: a failure here costs the
  // exposure line its route-share years and nothing else.
  const routeYearsState = useAsync(
    loadRouteYears,
    iso3 === null ? null : [year, commodity],
    NON_FATAL,
  );

  const { data: series } = seriesState;
  const { data: trade } = tradeState;
  const { data: exposure, ready: exposureReady } = exposureState;
  const { data: gasStorage } = gasStorageState;
  const { data: recentImports, ready: recentReady } = recentState;

  const errors = useMemo(() => {
    const labelled: readonly (readonly [string, Pick<AsyncState<unknown>, "error" | "retry">])[] = [
      ["reserves and production", seriesState],
      ["trade", tradeState],
      ["exposure", exposureState],
      ["gas storage", gasStorageState],
      ["recent imports", recentState],
    ];
    return labelled
      .filter(([, s]) => s.error !== null)
      .map(([section, s]) => ({ section, retry: s.retry }));
  }, [seriesState, tradeState, exposureState, gasStorageState, recentState]);

  const profile = useMemo(() => {
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

  const routeYears = routeYearsState.ready ? routeYearsState.data : null;
  return useMemo(() => ({ profile, errors, routeYears }), [profile, errors, routeYears]);
}
