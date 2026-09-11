import Link from "next/link";
import { AUTHOR_NAME, AUTHOR_URL, PRACTICE_URL } from "./provenance";

const LICENSE_DATA_URL = "https://github.com/narendranag/global-energy-map/blob/main/LICENSE-DATA.md";

const LINK = "text-sky-800 underline underline-offset-2 hover:text-sky-950";

/**
 * Data attribution line, bottom-left of the map: every source visible on the
 * map, with the licence where it requires attribution (GEM and LNG-T3 are
 * CC BY 4.0, OSM is ODbL). The per-source detail lives in /methodology#licences
 * and LICENSE-DATA.md. Under 768 px it sits above the commodity toggle, clear
 * of the full-width year slider. The first line credits the author and Marain
 * (provenance); the last links are the terms and privacy pages. Text stays ≥ 11 px on a near-opaque white
 * ground (slate-700 ≈ 10:1) — the a11y e2e checks both.
 */
export function MapFooter() {
  return (
    <div
      className="pointer-events-auto absolute bottom-2 left-4 z-10 max-w-72 rounded bg-white/90 px-2 py-1 text-[11px] leading-snug text-slate-700 shadow-sm backdrop-blur max-md:bottom-[10.5rem]"
      data-testid="map-footer"
    >
      <p className="mb-0.5">
        By{" "}
        <a href={AUTHOR_URL} className={LINK} rel="author">
          {AUTHOR_NAME}
        </a>{" "}
        ·{" "}
        <a href={PRACTICE_URL} className={LINK}>
          marain.space
        </a>
      </p>
      Data: Global Energy Monitor (CC BY 4.0) · LNG-T3, Zhou et al. 2026 (CC BY 4.0) · NETL (US DOE) · Energy
      Institute Statistical Review · CEPII BACI · © OpenStreetMap contributors (ODbL) · Basemap: OpenFreeMap ©
      OpenMapTiles. Licences:{" "}
      <a href={LICENSE_DATA_URL} className={LINK}>
        LICENSE-DATA
      </a>{" "}
      ·{" "}
      <Link href="/terms" className={LINK}>
        Terms
      </Link>{" "}
      ·{" "}
      <Link href="/privacy" className={LINK}>
        Privacy
      </Link>{" "}
      ·{" "}
      {/* Keep this the footer's last focusable element: the a11y e2e focuses the
          last "Methodology" link and expects Tab to land on the map canvas. */}
      <Link href="/methodology#licences" className={LINK}>
        Methodology
      </Link>
    </div>
  );
}
