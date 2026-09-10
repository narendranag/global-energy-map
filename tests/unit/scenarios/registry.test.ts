import { describe, it, expect } from "vitest";
import { SCENARIOS, getScenario, scenarioDescription } from "@/lib/scenarios/registry";

describe("scenario registry", () => {
  it("every scenario names the route used in the metric definition", () => {
    for (const s of SCENARIOS) {
      expect(s.routeName.length).toBeGreaterThan(0);
    }
  });

  it("Hormuz has a gas-specific description about LNG with no bypass", () => {
    const hormuz = getScenario("hormuz");
    const gas = scenarioDescription(hormuz, "gas");
    expect(gas).not.toBe(hormuz.description);
    expect(gas).toMatch(/LNG/);
    expect(gas).toMatch(/Qatar/);
    expect(gas).toMatch(/bypass/);
  });

  it("falls back to the default description when no commodity override exists", () => {
    const hormuz = getScenario("hormuz");
    expect(scenarioDescription(hormuz, "oil")).toBe(hormuz.description);
    const btc = getScenario("btc");
    expect(scenarioDescription(btc, "gas")).toBe(btc.description);
  });
});
