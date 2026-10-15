import { describe, expect, it } from "vitest";
import {
  showsTransitContext,
  TRANSIT_SCENARIOS,
  transitScenarioIds,
} from "@/components/scenarios/context-model";
import type { ChokepointTransits, ChokepointTransitSummary } from "@/lib/data/chokepoint-transits";
import { SCENARIOS } from "@/lib/scenarios/registry";
import type { ScenarioId } from "@/lib/scenarios/types";

const summary = (scenarioId: string): ChokepointTransitSummary => ({
  scenarioId,
  chokepoint: scenarioId,
  recent: { from: "2026-09-12", through: "2026-10-11", tankersPerDay: 1, allPerDay: 2, days: 30 },
  yearEarlier: null,
  tankerChangePct: null,
});

const transits: ChokepointTransits = new Map(
  (["hormuz", "malacca", "suez"] as const).map((id) => [id, summary(id)]),
);

describe("chokepoint transits context", () => {
  it("only names real scenario ids", () => {
    const ids = new Set(SCENARIOS.map((s) => s.id));
    for (const id of TRANSIT_SCENARIOS) expect(ids.has(id)).toBe(true);
  });

  it("shows for chokepoint scenarios and never for a pipeline", () => {
    expect(showsTransitContext({ scenarioId: "hormuz" })).toBe(true);
    expect(showsTransitContext({ scenarioId: "druzhba" })).toBe(false);
    // A pipeline combined with a chokepoint still has a chokepoint to show.
    expect(showsTransitContext({ scenarioId: "druzhba", scenarioIds: ["druzhba", "suez"] })).toBe(true);
  });

  it("lists every observed chokepoint of a combined run, primary first, once each", () => {
    const ids: ScenarioId[] = ["malacca", "hormuz", "malacca"];
    expect(transitScenarioIds({ scenarioId: "malacca", scenarioIds: ids }, transits)).toEqual([
      "malacca",
      "hormuz",
    ]);
    expect(transitScenarioIds({ scenarioId: "bab_el_mandeb" }, transits)).toEqual([]);
  });
});
