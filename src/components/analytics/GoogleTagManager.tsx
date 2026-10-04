"use client";
import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { downloadParams, gtag, setAnalyticsActive, track } from "./track";

/** The container defined by `analytics.yaml` (it holds the Google tag for G-YMXRSFHM6R). */
const GTM_ID = "GTM-PT8ZNQ7Z";
const PRODUCTION_HOST = "energymap.marain.space";

const isQuery = (path: string) => path === "/query" || path.startsWith("/query/");

/** The standard Tag Manager snippet, run once the page is interactive. */
const LOADER = `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${GTM_ID}');`;

/**
 * Google Analytics 4 through Google Tag Manager, on the production host only
 * (not previews, `next dev` or the e2e suite). The container's Google tag sends
 * the first page view; this component sends one more per later pathname, because
 * the map rewrites its URL with `history.replaceState` on every slider tick and
 * the stream's own history-based page views are switched off in GA.
 *
 * `/query` writes the user's SQL into the address bar, which must never reach
 * Google: a visit that starts on /query never loads the container at all, and
 * one that arrives there from the map reports the page without its query string.
 *
 * There is no `<noscript>` iframe: it cannot honour those two rules, and the
 * map does nothing without JavaScript anyway.
 */
export function GoogleTagManager() {
  const pathname = usePathname();
  // Decided once, on the first page of the visit.
  const [enabled] = useState(
    () =>
      typeof window !== "undefined" &&
      window.location.hostname === PRODUCTION_HOST &&
      !isQuery(pathname),
  );
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    setAnalyticsActive(enabled);
    return () => {
      setAnalyticsActive(false);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const previous = lastPath.current;
    lastPath.current = pathname;
    // The first page is the Google tag's own page view.
    if (previous === null || previous === pathname) return;
    const location = isQuery(pathname)
      ? `${window.location.origin}${pathname}`
      : window.location.href;
    // `set` also covers the events GA sends on its own (scrolls, outbound clicks).
    gtag("set", { page_location: location });
    track("page_view", { page_location: location });
  }, [enabled, pathname]);

  // A click on a download link marked `data-analytics-download` (the /data page).
  useEffect(() => {
    if (!enabled) return;
    const onClick = (e: MouseEvent) => {
      const link = (e.target as Element | null)?.closest<HTMLAnchorElement>("a[data-analytics-download]");
      const file = link?.getAttribute("download");
      if (file) track("file_download", downloadParams(file, "dataset"));
    };
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("click", onClick);
    };
  }, [enabled]);

  if (!enabled) return null;
  return <Script id="gtm" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: LOADER }} />;
}
