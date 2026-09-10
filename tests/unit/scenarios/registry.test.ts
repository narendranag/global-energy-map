import { describe, it, expect } from "vitest";
import { SCENARIOS, getScenario, howComputed, scenarioDescription } from "@/lib/scenarios/registry";

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

describe("scenario registry (Phase 9)", () => {
  it("descriptions match the cited route shares", () => {
    expect(getScenario("btc").description).toMatch(/83%/);
    expect(getScenario("btc").description).not.toMatch(/90%/);
    expect(getScenario("cpc").description).toMatch(/80%/);
    expect(getScenario("cpc").description).toMatch(/3\.5%/);
  });

  it("howComputed names BACI and the route, and switches the LNG terminal rule by year", () => {
    const hormuz = getScenario("hormuz");
    const oil = howComputed(hormuz, "oil", 2020).join(" ");
    expect(oil).toMatch(/BACI/);
    expect(oil).toMatch(/the Strait of Hormuz/);
    expect(oil).toMatch(/Refineries/);
    expect(oil).toMatch(/7\.33/);
    const gasT3 = howComputed(hormuz, "gas", 2023).join(" ");
    expect(gasT3).toMatch(/LNG-T3/);
    expect(gasT3).not.toMatch(/Refineries/);
    const gasOld = howComputed(hormuz, "gas", 2015).join(" ");
    expect(gasOld).toMatch(/capacity proxy/);
    expect(gasOld).toMatch(/only covers 2020–2024/);
    // e2e asserts "LNG-T3 voyages" appears exactly once (the footnote).
    expect(gasT3).not.toMatch(/LNG-T3 voyages/);
  });

  it("pipeline scenarios explain per-pair shares", () => {
    expect(howComputed(getScenario("druzhba"), "oil", 2021).join(" ")).toMatch(/exporter → importer pair/);
  });
});
