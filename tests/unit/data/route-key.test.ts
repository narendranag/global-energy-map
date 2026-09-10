import { describe, it, expect } from "vitest";
import { routeKeyFor } from "@/lib/data/scenario-inputs";

describe("routeKeyFor", () => {
  it("uses LNG-specific Hormuz shares on the gas axis", () => {
    expect(routeKeyFor("hormuz", "gas")).toBe("hormuz_lng");
  });
  it("uses the scenario's own shares otherwise", () => {
    expect(routeKeyFor("hormuz", "oil")).toBe("hormuz");
    expect(routeKeyFor("druzhba", "oil")).toBe("druzhba");
  });
});
