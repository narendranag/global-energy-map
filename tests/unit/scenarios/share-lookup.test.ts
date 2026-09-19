import { describe, it, expect } from "vitest";
import { computeScenarioImpact } from "@/lib/scenarios/engine";
import { resolveScenarioShare } from "@/lib/scenarios/shares";
import type { RouteRow, TradeFlowRow } from "@/lib/scenarios/types";

/**
 * Builds any row shape, including the (null, null) one the union forbids at
 * compile time but a hand-edited parquet could still contain.
 */
const row = (
  exporter_iso3: string | null,
  importer_iso3: string | null,
  share: number,
): RouteRow =>
  ({
    disruption_id: "hormuz",
    kind: "chokepoint",
    exporter_iso3,
    importer_iso3,
    share,
  }) as RouteRow;

describe("route share precedence", () => {
  it("an exact pair row wins over both wildcards, including share 0", () => {
    const lookup = resolveScenarioShare([
      row("SAU", null, 0.98), // exporter-wide: outbound transit
      row(null, "BHR", 1), // importer-wide: inbound transit
      row("SAU", "BHR", 0), // intra-Gulf: never crosses the strait
    ]);
    expect(lookup("SAU", "BHR")).toBe(0);
  });

  it("an importer-wide row covers a flow with no exporter row (inbound exposure)", () => {
    const lookup = resolveScenarioShare([row("SAU", null, 0.98), row(null, "KWT", 1)]);
    expect(lookup("USA", "KWT")).toBe(1);
    expect(lookup("USA", "JPN")).toBe(0);
  });

  it("takes the larger of the two wildcards when both describe the flow", () => {
    const lookup = resolveScenarioShare([row("ARE", null, 0.65), row(null, "KWT", 1)]);
    expect(lookup("ARE", "KWT")).toBe(1);
    const other = resolveScenarioShare([row("QAT", null, 1), row(null, "IND", 0.2)]);
    expect(other("QAT", "IND")).toBe(1);
  });

  it("falls back to 0 when nothing describes the flow", () => {
    expect(resolveScenarioShare([row("SAU", null, 0.98)])("USA", "JPN")).toBe(0);
  });

  it("ignores a row with neither side set rather than cutting the world", () => {
    const lookup = resolveScenarioShare([row(null, null, 1), row("SAU", null, 0.5)]);
    expect(lookup("USA", "JPN")).toBe(0);
    expect(lookup("SAU", "JPN")).toBe(0.5);
  });

  it("with no importer-wide rows behaves exactly as before", () => {
    const rows = [row("SAU", null, 0.98), row("SAU", "BHR", 0), row("IRQ", null, 1)];
    const lookup = resolveScenarioShare(rows);
    expect(lookup("SAU", "JPN")).toBe(0.98);
    expect(lookup("SAU", "BHR")).toBe(0);
    expect(lookup("IRQ", "IND")).toBe(1);
    expect(lookup("USA", "IND")).toBe(0);
  });
});

describe("importer-wide wildcards through the engine", () => {
  const TRADE: readonly TradeFlowRow[] = [
    { year: 2024, importer_iso3: "KWT", exporter_iso3: "USA", qty: 100 },
    { year: 2024, importer_iso3: "KWT", exporter_iso3: "IRQ", qty: 100 },
    { year: 2024, importer_iso3: "JPN", exporter_iso3: "SAU", qty: 100 },
  ];

  it("gives a Gulf importer inbound exposure while intra-Gulf pairs stay 0", () => {
    const r = computeScenarioImpact({
      scenarioId: "hormuz",
      commodity: "oil",
      year: 2024,
      tradeFlows: TRADE,
      routes: [
        { ...row("SAU", null, 1), disruption_id: "hormuz" },
        { ...row("IRQ", null, 1), disruption_id: "hormuz" },
        { ...row("IRQ", "KWT", 0), disruption_id: "hormuz" },
        { ...row(null, "KWT", 1), disruption_id: "hormuz" },
      ],
    });
    const kwt = r.byImporter.find((i) => i.iso3 === "KWT");
    expect(kwt?.atRiskQty).toBe(100); // the USA cargo only
    expect(kwt?.shareAtRisk).toBe(0.5);
    expect(r.byImporter.find((i) => i.iso3 === "JPN")?.atRiskQty).toBe(100);
  });
});
