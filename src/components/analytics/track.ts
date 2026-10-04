/**
 * Marketing events for Google Analytics, sent through Google Tag Manager's
 * data layer. The event names and parameters are defined in `analytics.yaml`
 * (the GTM container has one trigger and one GA4 tag per event); change that
 * file first, then `analytics sync`, then call `track` here.
 *
 * `track` does nothing until `GoogleTagManager` has decided this visit loads
 * the container (production host only, never a visit that starts on /query),
 * so previews, `next dev`, the e2e suite and the query console push nothing.
 * Never pass anything a visitor typed: the privacy policy promises it never
 * reaches Google.
 */

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

export type AnalyticsParams = Readonly<Record<string, string | number | boolean>>;

let active = false;

/** Called by `GoogleTagManager` once it has decided whether this visit is measured. */
export function setAnalyticsActive(value: boolean): void {
  active = value;
}

/** Push an event on the data layer, if this visit is measured. */
export function track(event: string, params: AnalyticsParams = {}): void {
  if (!active || typeof window === "undefined") return;
  (window.dataLayer ??= []).push({ event, ...params });
}

/**
 * `gtag(...)` as GTM's data layer understands it (consent, `set`). gtag.js
 * reads the Arguments object itself; a plain array does not work.
 */
export const gtag: (...args: unknown[]) => void = function () {
  if (!active || typeof window === "undefined") return;
  // eslint-disable-next-line prefer-rest-params
  (window.dataLayer ??= []).push(arguments);
};

/** File name and extension for a `file_download` event. */
export function downloadParams(fileName: string, kind: "scenario_table" | "layer" | "dataset"): AnalyticsParams {
  const dot = fileName.lastIndexOf(".");
  return {
    file_name: fileName,
    file_extension: dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : "",
    download_kind: kind,
  };
}
