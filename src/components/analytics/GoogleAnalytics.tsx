"use client";
import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const GA_ID = "G-YMXRSFHM6R";
const PRODUCTION_HOST = "energymap.marain.space";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const isQuery = (path: string) => path === "/query" || path.startsWith("/query/");

/**
 * Google Analytics 4, on the production host only (not previews, `next dev`
 * or the e2e suite). Page views are sent here, once per pathname: the map
 * rewrites its URL with `history.replaceState` on every slider tick, so the
 * stream's own history-based page views are switched off in GA.
 *
 * `/query` writes the user's SQL into the address bar, which must never reach
 * Google: a visit that starts on /query never loads GA at all, and one that
 * arrives there from the map reports the page without its query string.
 */
export function GoogleAnalytics() {
  const pathname = usePathname();
  // Decided once, on the first page of the visit.
  const [enabled] = useState(
    () =>
      typeof window !== "undefined" &&
      window.location.hostname === PRODUCTION_HOST &&
      !isQuery(pathname),
  );

  useEffect(() => {
    if (!enabled) return;
    if (!window.gtag) {
      const dataLayer = (window.dataLayer ??= []);
      window.gtag = function gtag() {
        // gtag.js reads the Arguments object itself; an array does not work.
        // eslint-disable-next-line prefer-rest-params
        dataLayer.push(arguments);
      };
      window.gtag("js", new Date());
      window.gtag("config", GA_ID, { send_page_view: false });
    }
    const location = isQuery(pathname)
      ? `${window.location.origin}${pathname}`
      : window.location.href;
    // `set` also covers the events GA sends on its own (scrolls, outbound clicks).
    window.gtag("set", { page_location: location });
    window.gtag("event", "page_view");
  }, [enabled, pathname]);

  if (!enabled) return null;
  return (
    <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
  );
}
