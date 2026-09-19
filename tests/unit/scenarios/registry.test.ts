import { describe, it, expect } from "vitest";
import { SCENARIOS, getScenario, howComputed, scenarioDescription, sourceGapNote } from "@/lib/scenarios/registry";

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
    // Intra-Gulf pairs and terminals not yet in service are stated rules.
    expect(oil).toMatch(/inside the Gulf/);
    expect(gasOld).toMatch(/not yet in service/);
  });

  it("source-gap notes apply only on the oil axis from the year the BACI gap starts", () => {
    const hormuz = getScenario("hormuz");
    expect(sourceGapNote(hormuz, "oil", 2018)).toBeNull();
    expect(sourceGapNote(hormuz, "oil", 2019)).toMatch(/Iranian crude/);
    expect(sourceGapNote(hormuz, "gas", 2023)).toBeNull();
    const druzhba = getScenario("druzhba");
    expect(sourceGapNote(druzhba, "oil", 2021)).toBeNull();
    expect(sourceGapNote(druzhba, "oil", 2022)).toMatch(/Belarus/);
    expect(sourceGapNote(getScenario("btc"), "oil", 2024)).toBeNull();
  });

  it("howComputed is unchanged when the S5 options are absent or inert", () => {
    const hormuz = getScenario("hormuz");
    const base = howComputed(hormuz, "oil", 2020);
    expect(howComputed(hormuz, "oil", 2020, {})).toEqual(base);
    expect(howComputed(hormuz, "oil", 2020, { severity: 1 })).toEqual(base);
    expect(howComputed(hormuz, "oil", 2020, { view: "importer" })).toEqual(base);
    expect(howComputed(hormuz, "oil", 2020, { combinedWith: [] })).toEqual(base);
    expect(howComputed(hormuz, "oil", 2020, { combinedWith: [hormuz] })).toEqual(base);
    expect(howComputed(hormuz, "oil", 2020, { hasInboundRoutes: false })).toEqual(base);
  });

  it("howComputed stops claiming inbound cargo is uncounted once inbound rows exist", () => {
    const hormuz = getScenario("hormuz");
    expect(howComputed(hormuz, "oil", 2020).join(" ")).toMatch(/not counted/);
    const inbound = howComputed(hormuz, "oil", 2020, { hasInboundRoutes: true }).join(" ");
    expect(inbound).not.toMatch(/not counted/);
    expect(inbound).toMatch(/per importing country/);
    expect(inbound).toMatch(/inside the Gulf/); // the share-0 pair rule still holds
  });

  it("howComputed states a partial closure and leaves the denominator alone", () => {
    const steps = howComputed(getScenario("hormuz"), "oil", 2020, { severity: 0.4 }).join(" ");
    expect(steps).toMatch(/40%/);
    expect(steps).toMatch(/total imports|denominator/i);
  });

  it("howComputed explains the exporter view when it is the one on screen", () => {
    const steps = howComputed(getScenario("druzhba"), "oil", 2021, { view: "exporter" }).join(" ");
    expect(steps).toMatch(/exporter's volume at risk/i);
    expect(steps).toMatch(/exports/);
  });

  it("howComputed explains the combined-scenario range and both its ends", () => {
    const steps = howComputed(getScenario("hormuz"), "oil", 2020, {
      combinedWith: [getScenario("hormuz"), getScenario("btc")],
    }).join(" ");
    expect(steps).toMatch(/the Strait of Hormuz/);
    expect(steps).toMatch(/the Baku-Tbilisi-Ceyhan pipeline/);
    expect(steps).toMatch(/range/i);
    expect(steps).toMatch(/same barrels|series/i);
    expect(steps).toMatch(/added|sum/i);
  });

  it("pipeline scenarios explain per-pair shares", () => {
    expect(howComputed(getScenario("druzhba"), "oil", 2021).join(" ")).toMatch(/exporter → importer pair/);
  });
});
