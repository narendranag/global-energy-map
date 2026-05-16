import type { ScenarioResult, TradeFlowRow, DisruptionRouteRow } from "./types";
import { computeScenarioImpact } from "./engine";

export interface HormuzInput {
  readonly year: number;
  readonly tradeFlows: readonly TradeFlowRow[];
  readonly routes: readonly DisruptionRouteRow[];
}

export function computeHormuzImpact(input: HormuzInput): ScenarioResult {
  return computeScenarioImpact({
    scenarioId: "hormuz",
    commodity: "oil",
    year: input.year,
    tradeFlows: input.tradeFlows,
    routes: input.routes,
  });
}
