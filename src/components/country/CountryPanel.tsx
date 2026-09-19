"use client";
import { useEffect, useId, useRef } from "react";
import catalogJson from "../../../public/data/catalog.json";
import type { Catalog } from "@/lib/data-catalog/types";
import {
  formatSeriesValue,
  type CountryTimeSeries,
  type PartnerRow,
} from "@/lib/data/country-profile";
import { isComplete } from "@/lib/data/recent-imports";
import { countryCsv, countryCsvFilename, countryCsvPlan } from "@/lib/export/country";
import { downloadText, todayIso } from "@/lib/export/browser";
import { panelPadding, useCamera } from "@/lib/state";
import type { Commodity, ScenarioId } from "@/lib/scenarios/types";
import { formatVolume, pct } from "@/components/scenarios/panel-model";
import { Sparkline } from "./Sparkline";
import { isKeyboardClick, setFocusIntent, takeFocusIntent } from "./focus-intent";
import { useCountryProfile } from "./useCountryProfile";

const CATALOG = catalogJson as unknown as Catalog;

const HEADING = "text-xs font-medium uppercase tracking-wide text-slate-600";
const NOTE = "text-[11px] leading-snug text-slate-600";
const SOURCE = "mt-1 text-[11px] leading-snug text-slate-600";
const LINK =
  "rounded text-[11px] font-medium text-sky-800 underline decoration-dotted underline-offset-2 hover:text-sky-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-700";

export interface CountryPanelProps {
  /** The focused country (ISO3). The panel is only rendered when one is set. */
  readonly iso3: string;
  readonly year: number;
  readonly commodity: Commodity;
  /** Clear the focus (the close button). */
  readonly onClose: () => void;
  /** Focus another country — a supplier or customer row. */
  readonly onFocus: (iso3: string) => void;
  /** Activate a scenario — an exposure row. */
  readonly onScenario: (id: ScenarioId) => void;
  /** True when the scenario panel is sharing the right-hand side. */
  readonly scenarioOpen: boolean;
}

function Section({
  label,
  source,
  children,
  testId,
}: {
  label: string;
  source?: string | null | undefined;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <section className="mt-3 border-t border-slate-200 pt-2" aria-label={label} data-testid={testId}>
      <h3 className={`mb-1 ${HEADING}`}>{label}</h3>
      {children}
      {source !== null && source !== undefined && source !== "" && <p className={SOURCE}>{source}</p>}
    </section>
  );
}

function Metric({ series }: { series: CountryTimeSeries }) {
  return (
    <div className="mb-2 last:mb-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-slate-700">{series.label}</span>
        <span className="font-mono text-sm">
          {series.value === null ? "—" : formatSeriesValue(series.value)}{" "}
          <span className="text-[11px] text-slate-600">{series.unit}</span>
        </span>
      </div>
      {series.staleNote !== null && <p className={NOTE}>{series.staleNote}</p>}
      <Sparkline series={series} />
    </div>
  );
}

function PartnerList({
  rows,
  total,
  commodity,
  emptyText,
  onFocus,
  testId,
}: {
  rows: readonly PartnerRow[];
  total: number;
  commodity: Commodity;
  emptyText: string;
  onFocus: (iso3: string) => void;
  testId: string;
}) {
  if (rows.length === 0) return <p className={NOTE}>{emptyText}</p>;
  return (
    <ol className="space-y-0.5" data-testid={testId}>
      {rows.map((r) => (
        <li key={r.iso3}>
          <button
            type="button"
            onClick={(e) => {
              if (isKeyboardClick(e)) setFocusIntent("keyboard");
              onFocus(r.iso3);
            }}
            className="flex w-full items-baseline justify-between gap-2 rounded px-1 py-0.5 text-left text-xs hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-700"
          >
            <span className="min-w-0 truncate">
              {r.name} <span className="font-mono text-[11px] text-slate-600">{r.iso3}</span>
            </span>
            <span className="shrink-0 text-right">
              <span className="font-mono">{pct(r.share)}</span>{" "}
              <span className="ml-1.5 inline-block min-w-[4.5rem] font-mono text-[11px] text-slate-600">
                {formatVolume(r.qty, commodity)}
              </span>
            </span>
          </button>
        </li>
      ))}
      <li className={`px-1 ${NOTE}`}>
        Shares of {formatVolume(total, commodity)} total.
      </li>
    </ol>
  );
}

/**
 * The country panel (S3): what a researcher reads when they select a country,
 * rather than what a tooltip can say while they hover it.
 *
 * Layout. It docks on the right, and slides left of the scenario panel when
 * one is open so both can be read at once — the alternative, a second tab in
 * the scenario panel's slot, would make "how exposed is Japan, and to what"
 * a two-click toggle, which is exactly the comparison this panel exists for.
 * It ends above the year slider and the commodity toggle and scrolls
 * internally; on phones it collapses to a header button like the scenario
 * panel does.
 *
 * Every number is loaded off the first-paint path (see `useCountryProfile`),
 * so a `?focus=` link paints the header immediately and fills in.
 */
export function CountryPanel({
  iso3,
  year,
  commodity,
  onClose,
  onFocus,
  onScenario,
  scenarioOpen,
}: CountryPanelProps) {
  const uid = useId();
  const headingId = `${uid}-heading`;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const camera = useCamera();
  const profile = useCountryProfile(iso3, year, commodity);

  // Keyboard-initiated selection moves focus here; a map click does not (it
  // would take the pointer user out of the map mid-gesture).
  useEffect(() => {
    if (takeFocusIntent() === "keyboard") headingRef.current?.focus();
  }, [iso3]);

  const noun = commodity === "gas" ? "LNG" : "crude";
  const trade = profile?.trade ?? null;
  const plan = profile === null ? null : countryCsvPlan(profile, CATALOG);
  const canExport = plan !== null && plan.included.length > 0;

  const zoomTo = () => {
    // Clear both right-hand panels, whichever are open (see camera.ts).
    const rem = 16;
    void camera.fitCountry(iso3, {
      padding: { ...panelPadding({ right: false }), right: (scenarioOpen ? 49 : 23) * rem },
    });
  };

  const download = () => {
    if (profile === null) return;
    downloadText(
      countryCsvFilename(profile),
      countryCsv(profile, {
        viewUrl: window.location.href,
        exported: todayIso(),
        catalog: CATALOG,
      }),
      "text/csv",
    );
  };

  return (
    <section
      aria-labelledby={headingId}
      data-testid="country-panel"
      className="pointer-events-auto absolute right-4 top-4 w-[min(21rem,calc(100%-2rem))] rounded-md bg-white/95 p-3 text-sm text-slate-800 shadow-lg backdrop-blur"
    >
      <div className="flex items-start justify-between gap-2">
        <h2
          id={headingId}
          ref={headingRef}
          tabIndex={-1}
          className="min-w-0 text-base font-semibold leading-tight text-slate-900 outline-offset-2"
        >
          {profile?.name ?? iso3}{" "}
          <span className="font-mono text-xs font-normal text-slate-600">{iso3}</span>
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={`Close ${profile?.name ?? iso3} and clear the selection`}
          className="-mr-1 -mt-1 shrink-0 rounded px-2 py-1 text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-700"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>
      <div className="mt-1 flex items-center gap-3">
        <button type="button" onClick={zoomTo} className={LINK} data-testid="country-zoom">
          Zoom to
        </button>
        {canExport && (
          <button type="button" onClick={download} className={LINK} data-testid="country-csv">
            Download CSV
          </button>
        )}
      </div>

      {profile === null ? (
        <p className={`mt-2 ${NOTE}`}>Loading…</p>
      ) : (
        <>
          {/* 1. Reserves + production ------------------------------------- */}
          {(profile.reserves !== null || profile.production !== null) && (
            <Section
              label="Reserves and production"
              source={profile.reserves?.source ?? profile.production?.source}
              testId="country-reserves"
            >
              {profile.reserves !== null && <Metric series={profile.reserves} />}
              {profile.production !== null && <Metric series={profile.production} />}
            </Section>
          )}

          {/* 2. Trade ------------------------------------------------------ */}
          {trade !== null && (
            <Section
              label={`${noun} trade, ${String(year)}`}
              source={trade.source}
              testId="country-trade"
            >
              {trade.emptyYear ? (
                <p className={NOTE}>
                  BACI records no {noun} trade for {profile.name} in {String(year)}.
                </p>
              ) : (
                <>
                  <div className="flex justify-between gap-2 text-xs">
                    <span>Imports</span>
                    <span className="font-mono">{formatVolume(trade.importsQty, commodity)}</span>
                  </div>
                  <div className="flex justify-between gap-2 text-xs">
                    <span>Exports</span>
                    <span className="font-mono">{formatVolume(trade.exportsQty, commodity)}</span>
                  </div>
                </>
              )}
              {trade.importsSeries !== null && (
                <Sparkline
                  series={trade.importsSeries}
                  caption={`Imports ${String(trade.importsSeries.first?.year ?? "")}–${String(trade.importsSeries.last?.year ?? "")}`}
                />
              )}
              {trade.exportsSeries !== null && (
                <Sparkline
                  series={trade.exportsSeries}
                  caption={`Exports ${String(trade.exportsSeries.first?.year ?? "")}–${String(trade.exportsSeries.last?.year ?? "")}`}
                />
              )}
              <h4 className={`mt-2 ${HEADING}`}>Top suppliers</h4>
              <PartnerList
                rows={trade.suppliers}
                total={trade.importsQty}
                commodity={commodity}
                emptyText={`No ${noun} imports recorded in ${String(year)}.`}
                onFocus={onFocus}
                testId="country-suppliers"
              />
              <h4 className={`mt-2 ${HEADING}`}>Top customers</h4>
              <PartnerList
                rows={trade.customers}
                total={trade.exportsQty}
                commodity={commodity}
                emptyText={`No ${noun} exports recorded in ${String(year)}.`}
                onFocus={onFocus}
                testId="country-customers"
              />
            </Section>
          )}

          {/* 3. Exposure --------------------------------------------------- */}
          {profile.exposure.length > 0 && (
            <Section
              label={`Exposure, ${String(year)}`}
              source={trade?.source}
              testId="country-exposure"
            >
              <p className={`mb-1 ${NOTE}`}>
                Share of {profile.name}&apos;s {noun} imports that moves on each route. Select one
                to see it on the map.
              </p>
              <ol className="space-y-0.5" data-testid="country-exposure-rows">
                {profile.exposure.map((e) => (
                  <li key={e.scenarioId}>
                    <button
                      type="button"
                      onClick={() => { onScenario(e.scenarioId); }}
                      className="flex w-full items-baseline justify-between gap-2 rounded px-1 py-0.5 text-left text-xs hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-700"
                    >
                      <span className="min-w-0 truncate">{e.label}</span>
                      <span className="shrink-0 text-right">
                        <span className="font-mono">{pct(e.shareAtRisk)}</span>{" "}
                        <span className="ml-1.5 inline-block min-w-[4.5rem] font-mono text-[11px] text-slate-600">
                          {formatVolume(e.atRiskQty, commodity)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </Section>
          )}

          {/* 4. Infrastructure, storage, recent imports --------------------- */}
          {profile.infrastructure.length > 0 && (
            <Section label="Infrastructure" testId="country-infrastructure">
              <ul className="space-y-1">
                {profile.infrastructure.map((i) => (
                  <li key={i.kind}>
                    <div className="flex justify-between gap-2 text-xs">
                      <span>{i.label}</span>
                      <span className="font-mono">{String(i.count)}</span>
                    </div>
                    {i.capacity !== null && (
                      <p className={NOTE}>
                        {formatSeriesValue(i.capacity)} {i.capacityUnit} across the{" "}
                        {String(i.withCapacity)} with capacity in the source
                      </p>
                    )}
                    {i.source !== null && <p className={NOTE}>{i.source}</p>}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {profile.gasStorage !== null && (
            <Section label="Gas storage" source={profile.gasStorage.source} testId="country-storage">
              <div className="flex justify-between gap-2 text-xs">
                <span>Full on {profile.gasStorage.gasDay}</span>
                <span className="font-mono">{profile.gasStorage.percentFull.toFixed(1)}%</span>
              </div>
              <p className={NOTE}>
                Latest gas day GIE has published — independent of the year slider.
              </p>
            </Section>
          )}

          {profile.recentImports !== null && (
            <Section
              label="Recent imports"
              source={profile.recentImports.source}
              testId="country-recent"
            >
              <div className="flex justify-between gap-2 text-xs">
                <span>
                  {profile.recentImports.from} to {profile.recentImports.through}
                </span>
                <span className="font-mono">{profile.recentImports.mt.toFixed(1)} Mt</span>
              </div>
              <p className={NOTE}>
                {isComplete(profile.recentImports)
                  ? "All 12 months reported."
                  : `${String(profile.recentImports.monthsReported)} of 12 months reported — the total is incomplete.`}{" "}
                As reported to UN Comtrade by the importer; not reconciled with BACI, and view-only.
              </p>
            </Section>
          )}

          {profile.empty && (
            <p className={`mt-3 ${NOTE}`} data-testid="country-empty">
              No reserves, trade, scenario or infrastructure data for {profile.name} on the{" "}
              {noun} axis in {String(year)}.
            </p>
          )}

          {plan !== null && plan.excluded.length > 0 && (
            <p className={`mt-3 border-t border-slate-200 pt-2 ${NOTE}`} data-testid="country-csv-note">
              The CSV leaves out {plan.excluded.map((s) => s.section).join(", ")}: their sources do
              not allow redistribution. The file says so in its header.
            </p>
          )}
        </>
      )}
    </section>
  );
}
