"use client";
/**
 * T3: the scenario panel's "Context" block — ties the two live, view-only
 * layers (EU gas storage, UN Comtrade recent imports) to the active
 * scenario's own result. Mounted with one line at the bottom of
 * `ScenarioPanel.tsx`; everything else (loaders, model, markup) lives here so
 * that file's footprint stays a single import + a single mount.
 *
 * Both figures are honesty checks, never a recomputed exposure — see the
 * doc comment on `src/components/scenarios/context-model.ts`. Loaders are
 * `fatal: false` (a failed fetch here must not blank the map) and are not
 * counted in the page's `pending`/`data-ready` signal, because this block is
 * a second reader off the critical path, same as the country panel.
 */
import { useSearchParams } from "next/navigation";
import { useMemo } from "react";
import {
  buildRecentImportsContextRows,
  buildStorageContextRows,
  showsStorageContext,
  TWH_PER_MT_LNG,
} from "./context-model";
import { loadGasStorageByCountry } from "@/lib/data/gas-storage";
import { loadRecentImports } from "@/lib/data/recent-imports";
import { useAsync } from "@/lib/data/useAsync";
import { useCountryNames } from "@/lib/geo/useCountryNames";
import { isEmbed } from "@/lib/url-state/embed";
import type { ScenarioResult } from "@/lib/scenarios/types";

export interface ScenarioContextProps {
  readonly result: ScenarioResult | null;
}

/** Rows shown before truncation — this block is a check, not the main list. */
const CONTEXT_TOP_N = 5;

const HEADING = "text-xs font-medium uppercase tracking-wide text-slate-600";
const NOTE = "text-[11px] leading-snug text-slate-600";
const NON_FATAL = { fatal: false } as const;

function fmtTwh(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function fmtMt(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: n < 1 ? 2 : 1, maximumFractionDigits: n < 1 ? 2 : 1 });
}

function fmtDays(n: number): string {
  if (!Number.isFinite(n)) return "∞";
  return Math.round(n).toLocaleString("en-US");
}

function fmtPct(n: number): string {
  return `${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}%`;
}

export function ScenarioContext({ result }: ScenarioContextProps) {
  const searchParams = useSearchParams();
  const embed = isEmbed(searchParams);
  const names = useCountryNames();

  const wantsStorage = result !== null && showsStorageContext(result);
  const storageState = useAsync(loadGasStorageByCountry, wantsStorage ? [] : null, NON_FATAL);

  const wantsRecent = result?.byImporter.some((i) => i.atRiskQty > 0) ?? false;
  const recentState = useAsync(
    loadRecentImports,
    wantsRecent && result !== null ? [result.commodity] : null,
    NON_FATAL,
  );

  const storageRows = useMemo(() => {
    if (result === null || storageState.data === null) return [];
    return buildStorageContextRows(result, storageState.data).slice(0, CONTEXT_TOP_N);
  }, [result, storageState.data]);

  const recentRows = useMemo(() => {
    if (result === null || recentState.data === null) return [];
    return buildRecentImportsContextRows(result, recentState.data, CONTEXT_TOP_N);
  }, [result, recentState.data]);

  if (embed || result === null) return null;
  if (!wantsStorage && !wantsRecent) return null;

  const nameOf = (iso3: string): string => names?.get(iso3) ?? iso3;

  return (
    <section className="mt-3 border-t border-slate-200 pt-3" aria-label="Context" data-testid="scenario-context">
      <h3 className={`mb-1 ${HEADING}`}>Context</h3>
      <p className={`mb-2 ${NOTE}`}>
        View-only figures from two live layers, shown beside this scenario&apos;s own result as a
        check — never a recomputed exposure.
      </p>

      {wantsStorage && (
        <div className="mb-3" data-testid="scenario-context-storage">
          <h4 className="mb-1 text-[11px] font-medium text-slate-700">EU gas storage cover</h4>
          {storageState.error !== null ? (
            <p className={NOTE} data-testid="scenario-context-storage-error">
              Could not load gas storage data.
            </p>
          ) : storageRows.length === 0 ? (
            <p className={NOTE}>
              {storageState.ready ? "No exposed importer is covered by GIE gas storage." : "Loading…"}
            </p>
          ) : (
            <>
              <ul className="space-y-1.5">
                {storageRows.map((r) => (
                  <li key={r.iso3} className="text-xs">
                    <div className="flex justify-between gap-2">
                      <span className="min-w-0 truncate font-medium">{nameOf(r.iso3)}</span>
                      <span className="shrink-0 font-mono text-[11px] text-slate-600">
                        {fmtMt(r.atRiskMt)} Mt at risk ({r.baciYear})
                      </span>
                    </div>
                    <p className={NOTE}>
                      In storage on {r.gasDay}: {fmtTwh(r.storageTwh)} TWh ({fmtPct(r.storagePctFull)} full). At
                      current storage, that is {fmtDays(r.daysOfCover)} days of the at-risk LNG volume, at the{" "}
                      {r.baciYear} annual rate.
                    </p>
                  </li>
                ))}
              </ul>
              <p className={`mt-1 ${NOTE}`}>
                LNG mass → energy: 1 Mt ≈ {TWH_PER_MT_LNG.toFixed(3)} TWh (52 MJ/t HHV, IGU{" "}
                <em>Natural Gas Conversion Guide</em>, 2012). Storage is a stock serving all of a
                country&apos;s gas demand, not just LNG from this route — &quot;days of cover&quot; is a
                scale comparison against the at-risk volume, not a forecast of how long storage would
                actually last. BACI exposure is annual for {result.year}; the storage reading is each
                country&apos;s own latest published gas day, so the two dates differ. Source: Gas
                Infrastructure Europe AGSI, view-only (not downloadable).
              </p>
            </>
          )}
        </div>
      )}

      {wantsRecent && (
        <div data-testid="scenario-context-recent">
          <h4 className="mb-1 text-[11px] font-medium text-slate-700">Recent imports check</h4>
          {recentState.error !== null ? (
            <p className={NOTE} data-testid="scenario-context-recent-error">
              Could not load recent-imports data.
            </p>
          ) : recentRows.length === 0 ? (
            <p className={NOTE}>{recentState.ready ? "No exposed importer to check." : "Loading…"}</p>
          ) : (
            <>
              <ul className="space-y-1">
                {recentRows.map((r) => (
                  <li key={r.iso3} className="flex justify-between gap-2 text-xs">
                    <span className="min-w-0 truncate">{nameOf(r.iso3)}</span>
                    <span className="shrink-0 text-right font-mono text-[11px] text-slate-600">
                      {r.comtradeMt === null ? (
                        "no monthly reports"
                      ) : (
                        <>
                          {fmtMt(r.comtradeMt)} Mt ({r.from}–{r.through}
                          {!r.complete ? ", incomplete" : ""}
                          {r.diverges ? ", diverges >2×" : ""}) vs {fmtMt(r.baciMt)} Mt BACI {r.baciYear}
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              <p className={`mt-1 ${NOTE}`}>
                UN Comtrade, as-reported monthly imports over each country&apos;s own latest 12
                reported months — a recency check against the BACI figure this scenario used, never a
                second exposure computation (Comtrade is importer totals only, unreconciled). China and
                Taiwan file no monthly reports. View-only, not downloadable.
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
