import { describe, it, expect } from "vitest";
import citations from "@/lib/export/citations.generated.json";
import catalogJson from "../../../public/data/catalog.json";
import type { Catalog } from "@/lib/data-catalog/types";
import { entriesForTags } from "@/lib/export/citation";
import { scenarioTags } from "@/lib/export/layers";
import { SCENARIOS, routeKeyFor } from "@/lib/scenarios/registry";
import type { Commodity } from "@/lib/scenarios/types";

/**
 * A1. `routeKeyFor` and `scenarioTags` used to append `_lng` / `-lng` for
 * *every* scenario on the gas axis, including the oil-only ones. The key then
 * named a `disruption_id` that does not exist in the parquet (empty result,
 * silently) and the tag named a catalog entry that does not exist (the share
 * citation and every CSV header lost the scenario's provenance).
 *
 * The check below is over the shipped data, not a hand-written list: every
 * route key a scenario/commodity pair can produce must be a `disruption_id`
 * that actually has rows, and every tag must resolve to catalog entries.
 */

const CATALOG = catalogJson as unknown as Catalog;

interface ShareRow {
  readonly disruption_id: string;
}
const SHIPPED_IDS = new Set(
  (citations as { scenario_shares: readonly ShareRow[] }).scenario_shares.map(
    (r) => r.disruption_id,
  ),
);

const COMMODITIES: readonly Commodity[] = ["oil", "gas"];

describe("routeKeyFor is gated on the scenario's commodities (A1)", () => {
  it("only produces a route key for a commodity the scenario models", () => {
    for (const s of SCENARIOS) {
      for (const c of COMMODITIES) {
        const key = routeKeyFor(s.id, c);
        if (s.commodities.includes(c)) {
          expect(key, `${s.id} / ${c}`).not.toBeNull();
        } else {
          expect(key, `${s.id} / ${c}`).toBeNull();
        }
      }
    }
  });

  it("every route key it produces exists in the shipped disruption_route rows", () => {
    for (const s of SCENARIOS) {
      for (const c of COMMODITIES) {
        const key = routeKeyFor(s.id, c);
        if (key === null) continue;
        expect(SHIPPED_IDS.has(key), `${s.id} / ${c} → ${key}`).toBe(true);
      }
    }
  });

  it("keeps the `_lng` convention for the scenarios that do ship a gas axis", () => {
    expect(routeKeyFor("hormuz", "oil")).toBe("hormuz");
    expect(routeKeyFor("hormuz", "gas")).toBe("hormuz_lng");
    expect(routeKeyFor("malacca", "gas")).toBe("malacca_lng");
    expect(routeKeyFor("druzhba", "oil")).toBe("druzhba");
    expect(routeKeyFor("druzhba", "gas")).toBeNull();
  });
});

describe("scenarioTags is gated the same way (A1)", () => {
  it("every tag it produces resolves to at least one catalog entry", () => {
    for (const s of SCENARIOS) {
      for (const c of COMMODITIES) {
        if (!s.commodities.includes(c)) continue;
        for (const tag of scenarioTags(s.id, c)) {
          expect(entriesForTags([tag], CATALOG).length, `${s.id} / ${c} → ${tag}`).toBeGreaterThan(
            0,
          );
        }
      }
    }
  });

  it("an oil-only scenario on the gas axis keeps its own (oil) share tag", () => {
    // The gas axis can be selected with an oil-only scenario only through a
    // hand-typed URL; the tag must still name a real catalog entry rather
    // than the `-lng` one that does not exist.
    expect(scenarioTags("druzhba", "gas")).toContain("scenario:druzhba");
    expect(scenarioTags("druzhba", "gas")).not.toContain("scenario:druzhba-lng");
  });
});
