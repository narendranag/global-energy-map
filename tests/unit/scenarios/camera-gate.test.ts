import { describe, expect, it } from "vitest";
import {
  INITIAL_GATE,
  fired,
  observeKey,
  resultScenarioKey,
  scenarioKey,
  shouldFit,
  type CameraGate,
} from "@/components/scenarios/camera-gate";
import type { ScenarioId, ScenarioResult } from "@/lib/scenarios/types";

function result(...ids: ScenarioId[]): ScenarioResult {
  const first = ids[0];
  if (first === undefined) throw new Error("need at least one id");
  return {
    scenarioId: first,
    scenarioIds: ids,
    commodity: "oil",
    year: 2024,
    byImporter: [],
    rankedImporters: [],
    byRefinery: [],
    rankedRefineries: [],
    byLngImport: [],
    rankedLngImports: [],
  };
}

/** A result with one optional field removed, as a pre-T1 result would be. */
function omit(r: ScenarioResult): ScenarioResult {
  const copy = { ...r };
  delete copy.scenarioIds;
  return copy;
}

/**
 * Drive the gate the way the hook does: render with a key, then hand it the
 * results that arrive, and count the fits.
 */
function run(
  start: CameraGate,
  steps: readonly (
    | { readonly render: string | null }
    | { readonly result: ScenarioResult | null; readonly markPending?: boolean }
  )[],
): { gate: CameraGate; fits: (string | null)[] } {
  let gate = start;
  const fits: (string | null)[] = [];
  for (const step of steps) {
    if ("render" in step) {
      gate = observeKey(gate, step.render);
      continue;
    }
    if (shouldFit(gate, step.result, step.markPending ?? false)) {
      fits.push(resultScenarioKey(step.result));
      gate = fired(gate);
    }
  }
  return { gate, fits };
}

describe("scenarioKey", () => {
  it("names the whole scenario set, not just the primary", () => {
    expect(scenarioKey(null, null)).toBeNull();
    expect(scenarioKey("hormuz", null)).toBe("hormuz");
    expect(scenarioKey("hormuz", "malacca")).toBe("hormuz+malacca");
  });

  it("reads the same key off a result", () => {
    expect(resultScenarioKey(null)).toBeNull();
    expect(resultScenarioKey(result("hormuz"))).toBe("hormuz");
    expect(resultScenarioKey(result("hormuz", "malacca"))).toBe("hormuz+malacca");
  });

  it("falls back to the primary id for a result with no scenarioIds", () => {
    const legacy: ScenarioResult = omit(result("hormuz"));
    expect(resultScenarioKey(legacy)).toBe("hormuz");
  });
});

describe("the scenario camera gate", () => {
  it("never fits the scenario a link arrives with", () => {
    const { fits } = run(INITIAL_GATE, [
      { render: "hormuz" },
      { result: result("hormuz") },
      { result: result("hormuz") },
    ]);
    expect(fits).toEqual([]);
  });

  it("fits once when the viewer picks a scenario, and not on recompute", () => {
    const { fits } = run(INITIAL_GATE, [
      { render: null },
      { render: "hormuz" },
      { result: null },
      { result: result("hormuz") },
      { result: result("hormuz") },
    ]);
    expect(fits).toEqual(["hormuz"]);
  });

  it("waits for the mark to be placed", () => {
    const { fits } = run(INITIAL_GATE, [
      { render: null },
      { render: "druzhba" },
      { result: result("druzhba"), markPending: true },
      { result: result("druzhba") },
    ]);
    expect(fits).toEqual(["druzhba"]);
  });

  // Finding 4: each of these used to be satisfied by the result already on
  // screen, because the gate remembered only the primary id.
  it("adding a secondary waits for the combined result, then fits once", () => {
    const { fits } = run(INITIAL_GATE, [
      { render: "hormuz" },
      { result: result("hormuz") },
      { render: "hormuz+malacca" },
      // The previous single-scenario result is still what the page holds.
      { result: result("hormuz") },
      { result: result("hormuz", "malacca") },
      { result: result("hormuz", "malacca") },
    ]);
    expect(fits).toEqual(["hormuz+malacca"]);
  });

  it("removing the secondary waits for the single-scenario result", () => {
    const { fits } = run(INITIAL_GATE, [
      { render: "hormuz+malacca" },
      { result: result("hormuz", "malacca") },
      { render: "hormuz" },
      { result: result("hormuz", "malacca") },
      { result: result("hormuz") },
    ]);
    expect(fits).toEqual(["hormuz"]);
  });

  it("swapping the secondary waits for the new pair", () => {
    const { fits } = run(INITIAL_GATE, [
      { render: "hormuz+malacca" },
      { result: result("hormuz", "malacca") },
      { render: "hormuz+suez" },
      { result: result("hormuz", "malacca") },
      { result: result("hormuz", "suez") },
      { result: result("hormuz", "suez") },
    ]);
    expect(fits).toEqual(["hormuz+suez"]);
  });

  it("clearing the scenario cancels an owed fit", () => {
    const { gate, fits } = run(INITIAL_GATE, [
      { render: "hormuz" },
      { render: "hormuz+malacca" },
      { render: null },
      { result: result("hormuz", "malacca") },
    ]);
    expect(fits).toEqual([]);
    expect(gate.awaiting).toBeNull();
  });

  it("an unchanged key owes nothing", () => {
    const gate = observeKey({ seen: "hormuz", awaiting: null }, "hormuz");
    expect(gate.awaiting).toBeNull();
  });
});
