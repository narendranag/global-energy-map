import Link from "next/link";

/**
 * Data attribution line, bottom-left of the map. GEM and LNG-T3 are CC BY 4.0
 * and OSM is ODbL — all require visible attribution. The full per-source
 * table lives on /methodology. Under 768 px it sits above the commodity
 * toggle, clear of the full-width year slider.
 */
export function MapFooter() {
  return (
    <div className="pointer-events-auto absolute bottom-2 left-4 z-10 max-w-60 rounded bg-white/90 px-2 py-1 text-[11px] leading-snug text-slate-700 shadow-sm backdrop-blur max-md:bottom-[10.5rem]">
      Data: Global Energy Monitor (CC BY 4.0), LNG-T3 (CC BY 4.0), NETL, EI Statistical Review,
      CEPII BACI, OSM contributors (ODbL) ·{" "}
      <Link href="/methodology" className="text-sky-800 underline underline-offset-2 hover:text-sky-950">
        Methodology
      </Link>
    </div>
  );
}
