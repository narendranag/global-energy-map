import { describe, expect, it } from "vitest";
import {
  MIN_WINDOW_DAYS,
  summariseTransits,
  TRANSIT_WINDOW_DAYS,
  type TransitRow,
} from "@/lib/data/chokepoint-transits";

const DAY = 24 * 60 * 60 * 1000;

/** `n` consecutive days ending on `through`, every day the same counts. */
function days(
  scenario_id: string,
  through: string,
  n: number,
  tankers: number,
  all: number,
): TransitRow[] {
  const end = Date.parse(`${through}T00:00:00Z`);
  return Array.from({ length: n }, (_, i) => ({
    scenario_id,
    chokepoint: "Strait of Hormuz",
    date: new Date(end - (n - 1 - i) * DAY).toISOString().slice(0, 10),
    transits_tanker: tankers,
    transits_all: all,
  }));
}

describe("summariseTransits", () => {
  it("compares the latest 30 days with the same 30 days a year earlier", () => {
    const rows = [
      ...days("hormuz", "2025-10-11", 60, 50, 100),
      ...days("hormuz", "2026-10-11", 30, 1, 3),
    ];
    const s = summariseTransits(rows).get("hormuz");
    expect(s).toBeDefined();
    expect(s?.chokepoint).toBe("Strait of Hormuz");
    expect(s?.recent).toEqual({
      from: "2026-09-12",
      through: "2026-10-11",
      tankersPerDay: 1,
      allPerDay: 3,
      days: TRANSIT_WINDOW_DAYS,
    });
    expect(s?.yearEarlier?.from).toBe("2025-09-12");
    expect(s?.yearEarlier?.through).toBe("2025-10-11");
    expect(s?.yearEarlier?.tankersPerDay).toBe(50);
    expect(s?.tankerChangePct).toBeCloseTo(-98);
  });

  it("averages over the days actually reported, and drops a thin window", () => {
    // Only MIN_WINDOW_DAYS - 1 days a year earlier: no comparison, not a fake one.
    const rows = [
      ...days("suez", "2025-10-11", MIN_WINDOW_DAYS - 1, 20, 40),
      ...days("suez", "2026-10-11", MIN_WINDOW_DAYS, 10, 30),
    ];
    const s = summariseTransits(rows).get("suez");
    expect(s?.recent.days).toBe(MIN_WINDOW_DAYS);
    expect(s?.recent.tankersPerDay).toBe(10);
    expect(s?.yearEarlier).toBeNull();
    expect(s?.tankerChangePct).toBeNull();
  });

  it("leaves out a chokepoint whose latest window is too thin to state", () => {
    expect(summariseTransits(days("malacca", "2026-10-11", 3, 70, 200)).has("malacca")).toBe(false);
  });

  it("keeps each chokepoint's own latest date", () => {
    const rows = [...days("hormuz", "2026-10-11", 30, 1, 2), ...days("malacca", "2026-10-04", 30, 70, 200)];
    const out = summariseTransits(rows);
    expect(out.get("hormuz")?.recent.through).toBe("2026-10-11");
    expect(out.get("malacca")?.recent.through).toBe("2026-10-04");
  });
});
