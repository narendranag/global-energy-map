import { describe, it, expect } from "vitest";
import { lngTerminalsInService } from "@/lib/scenarios/lng-in-service";
import { computeScenarioImpact } from "@/lib/scenarios/engine";
import type { DisruptionRouteRow, LngImportRow, LngVoyageRow } from "@/lib/scenarios/types";

function t(name: string, overrides: Partial<LngImportRow> = {}): LngImportRow {
  return { asset_id: name, name, country_iso3: "JPN", capacity: 10, ...overrides };
}

function v(to_terminal: string, overrides: Partial<LngVoyageRow> = {}): LngVoyageRow {
  return {
    start_date: "2021-06-15",
    end_date: "2021-06-20",
    imo: 1,
    voyage_type: "export",
    from_terminal: "Ras Laffan",
    to_terminal,
    from_country_iso3: "QAT",
    to_country_iso3: "JPN",
    amount_cbm: 100,
    confidence_score: 4,
    ...overrides,
  };
}

const names = (rows: readonly LngImportRow[]) => rows.map((r) => r.name);

describe("lngTerminalsInService", () => {
  it("keeps terminals commissioned in or before the year, and those with no known vintage", () => {
    const rows = [
      t("old", { commissioned_year: 2010 }),
      t("same-year", { commissioned_year: 2021 }),
      t("unknown", { commissioned_year: null }),
      t("no-field"),
    ];
    expect(names(lngTerminalsInService(rows, 2021, []))).toEqual(names(rows));
  });

  it("drops terminals commissioned after the year", () => {
    const rows = [t("old", { commissioned_year: 2010 }), t("future", { commissioned_year: 2026 })];
    expect(names(lngTerminalsInService(rows, 2021, []))).toEqual(["old"]);
  });

  it("drops in-construction terminals even when their listed year has passed", () => {
    const rows = [t("slipped", { commissioned_year: 2022, status: "in-construction" })];
    expect(lngTerminalsInService(rows, 2024, [])).toHaveLength(0);
  });

  it("keeps a terminal that received cargoes in the year, whatever its listed vintage", () => {
    // Al Zour lists 2022 but took commissioning cargoes in 2021.
    const rows = [t("Al Zour", { country_iso3: "KWT", commissioned_year: 2022 })];
    const kept = lngTerminalsInService(rows, 2021, [v("Al Zour", { to_country_iso3: "KWT" })]);
    expect(names(kept)).toEqual(["Al Zour"]);
  });

  it("only counts cargoes the attribution itself uses as evidence", () => {
    const rows = [t("future", { commissioned_year: 2026 })];
    const ballast = v("future", { voyage_type: "return" });
    const lowConfidence = v("future", { confidence_score: 2 });
    const otherCountry = v("future", { to_country_iso3: "KOR" });
    expect(lngTerminalsInService(rows, 2021, [ballast, lowConfidence, otherCountry])).toHaveLength(0);
  });
});

describe("computeScenarioImpact — terminals not yet in service get no attribution", () => {
  const routes: DisruptionRouteRow[] = [
    { disruption_id: "hormuz", kind: "chokepoint", exporter_iso3: "QAT", importer_iso3: null, share: 1 },
  ];

  it("BACI path: a future terminal takes no share of the country's imports", () => {
    const result = computeScenarioImpact({
      scenarioId: "hormuz",
      commodity: "gas",
      year: 2019,
      tradeFlows: [{ year: 2019, importer_iso3: "JPN", exporter_iso3: "QAT", qty: 900 }],
      routes,
      lngImports: [
        t("existing", { commissioned_year: 2000 }),
        t("future", { commissioned_year: 2026, capacity: 90 }),
      ],
    });
    expect(result.byLngImport.map((i) => i.name)).toEqual(["existing"]);
    expect(result.byLngImport[0]?.atRiskQty).toBeCloseTo(900);
  });

  it("LNG-T3 path: a future terminal is not reported as an uncovered gap", () => {
    const result = computeScenarioImpact({
      scenarioId: "hormuz",
      commodity: "gas",
      year: 2021,
      tradeFlows: [{ year: 2021, importer_iso3: "JPN", exporter_iso3: "QAT", qty: 900 }],
      routes,
      lngImports: [t("existing", { commissioned_year: 2000 }), t("future", { commissioned_year: 2026 })],
      lngVoyages: [v("existing")],
    });
    expect(result.byLngImport.map((i) => [i.name, i.coverage])).toEqual([["existing", "measured"]]);
  });
});
