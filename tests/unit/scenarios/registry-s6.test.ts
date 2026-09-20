import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it, expect } from "vitest";
import {
  SCENARIOS,
  getScenario,
  isScenarioActive,
  routeKeyFor,
  type ScenarioDef,
} from "@/lib/scenarios/registry";
import { scenarioTags } from "@/lib/export/layers";

describe("isScenarioActive", () => {
  const withRange = (from?: number, to?: number): ScenarioDef => ({
    ...getScenario("hormuz"),
    activeYears: {
      ...(from !== undefined ? { from } : {}),
      ...(to !== undefined ? { to } : {}),
    },
  });

  it("is always active when activeYears is unset", () => {
    expect(isScenarioActive(getScenario("hormuz"), 1990)).toBe(true);
    expect(isScenarioActive(getScenario("hormuz"), 2024)).toBe(true);
  });

  it("respects from/to bounds independently and together", () => {
    expect(isScenarioActive(withRange(2023), 2022)).toBe(false);
    expect(isScenarioActive(withRange(2023), 2023)).toBe(true);
    expect(isScenarioActive(withRange(undefined, 2022), 2023)).toBe(false);
    expect(isScenarioActive(withRange(undefined, 2022), 2022)).toBe(true);
    expect(isScenarioActive(withRange(2020, 2022), 2019)).toBe(false);
    expect(isScenarioActive(withRange(2020, 2022), 2021)).toBe(true);
    expect(isScenarioActive(withRange(2020, 2022), 2023)).toBe(false);
  });
});

describe("routeKeyFor / scenarioTags — generalized LNG-variant naming (S6)", () => {
  it("maps a gas-capable scenario's gas axis to a `_lng` disruption id, no special cases", () => {
    for (const s of SCENARIOS) {
      expect(routeKeyFor(s.id, "oil")).toBe(s.commodities.includes("oil") ? s.id : null);
      // A1: an oil-only scenario has no `_lng` rows, so it has no gas key.
      expect(routeKeyFor(s.id, "gas")).toBe(
        s.commodities.includes("gas") ? `${s.id}_lng` : null,
      );
    }
  });

  it("scenarioTags follows the same `-lng` suffix convention for catalog tags", () => {
    expect(scenarioTags("hormuz", "oil")).toContain("scenario:hormuz");
    expect(scenarioTags("hormuz", "gas")).toContain("scenario:hormuz-lng");
    expect(scenarioTags("malacca", "gas")).toContain("scenario:malacca-lng");
    expect(scenarioTags("bab_el_mandeb", "gas")).toContain("scenario:bab_el_mandeb-lng");
  });
});

describe("registry: new S6 scenarios", () => {
  const NEW_IDS = [
    "malacca",
    "suez",
    "bab_el_mandeb",
    "turkish_straits",
    "keystone",
    "enbridge_mainline",
    "espo_spur",
  ] as const;

  it("every new scenario is registered with a route name and commodities", () => {
    for (const id of NEW_IDS) {
      const s = getScenario(id);
      expect(s.routeName.length).toBeGreaterThan(0);
      expect(s.commodities.length).toBeGreaterThan(0);
    }
  });

  it("chokepoints with a gas axis carry a verified marker location", () => {
    for (const id of ["malacca", "suez", "bab_el_mandeb", "turkish_straits"] as const) {
      const s = getScenario(id);
      expect(s.location).toBeDefined();
      expect(s.location?.lon).toBeGreaterThan(-180);
      expect(s.location?.lon).toBeLessThan(180);
      expect(s.location?.lat).toBeGreaterThan(-90);
      expect(s.location?.lat).toBeLessThan(90);
    }
  });

  it("pipeline scenarios (new and existing) carry pipelineIds", () => {
    for (const id of [
      "druzhba",
      "btc",
      "cpc",
      "keystone",
      "enbridge_mainline",
      "espo_spur",
    ] as const) {
      const s = getScenario(id);
      expect(s.pipelineIds).toBeDefined();
      expect(s.pipelineIds?.length).toBeGreaterThan(0);
    }
  });

  it("Enbridge Mainline's id list excludes the mislabelled P3871", () => {
    expect(getScenario("enbridge_mainline").pipelineIds).not.toContain("P3871");
  });

  it("Druzhba's corrected id list includes the two the first-pass note missed", () => {
    const ids = getScenario("druzhba").pipelineIds ?? [];
    expect(ids).toContain("P6307");
    expect(ids).toContain("P7280");
  });
});

describe("registry: pipelineIds resolve in the shipped pipelines.geojson", () => {
  it("every pipelineId across every scenario is a real feature", async () => {
    const raw: unknown = JSON.parse(
      await readFile(path.join(process.cwd(), "public", "data", "pipelines.geojson"), "utf8"),
    );
    const doc = raw as { features: { properties: { pipeline_id: string } }[] };
    const known = new Set(doc.features.map((f) => f.properties.pipeline_id));
    expect(known.size).toBeGreaterThan(0);
    for (const s of SCENARIOS) {
      for (const id of s.pipelineIds ?? []) {
        expect(known.has(id), `${s.id}: unknown pipeline_id ${id}`).toBe(true);
      }
    }
  });
});
