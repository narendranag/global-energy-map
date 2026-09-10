"use client";
import { useEffect, useState } from "react";
import { countryNameMap, loadCountries } from "./countries";

/** iso3 → country name, or null until countries.geojson has loaded. */
export function useCountryNames(): ReadonlyMap<string, string> | null {
  const [names, setNames] = useState<ReadonlyMap<string, string> | null>(null);
  useEffect(() => {
    const ctrl = { cancelled: false };
    loadCountries()
      .then((fc) => {
        if (!ctrl.cancelled) setNames(countryNameMap(fc));
      })
      .catch((err: unknown) => {
        console.error("country names load failed:", err);
      });
    return () => {
      ctrl.cancelled = true;
    };
  }, []);
  return names;
}
