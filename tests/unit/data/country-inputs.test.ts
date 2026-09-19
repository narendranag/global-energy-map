import { describe, expect, it } from "vitest";
import { _lruLoaderForTests as lruLoader } from "@/lib/data/country-inputs";

/**
 * B12: `loadCountryExposure` used to sit behind the unbounded `cachedLoader`
 * (`src/lib/data/cache.ts`); keyed by (year, commodity), a long scrubbing
 * session would grow it without limit. It now sits behind this small
 * capacity-bounded cache instead — tested here directly (not through
 * `loadCountryExposure` itself, which would otherwise pull in parquet
 * fetches, the scenario engine and the whole registry just to prove a cache
 * evicts).
 */

function counting<A extends readonly (string | number)[]>() {
  let calls = 0;
  const seen: A[] = [];
  const load = (...args: A): Promise<number> => {
    calls += 1;
    seen.push(args);
    return Promise.resolve(calls);
  };
  return { load, calls: () => calls, seen };
}

describe("lruLoader (backing loadCountryExposure, B12)", () => {
  it("caches a hit: the same key never re-invokes load", async () => {
    const c = counting<[year: number, commodity: string]>();
    const loader = lruLoader(8, c.load);
    const a = await loader(2020, "oil");
    const b = await loader(2020, "oil");
    expect(a).toBe(b);
    expect(c.calls()).toBe(1);
  });

  it("evicts the least-recently-used key once past capacity", async () => {
    const c = counting<[year: number]>();
    const loader = lruLoader(3, c.load);
    await loader(1); // oldest
    await loader(2);
    await loader(3);
    expect(c.calls()).toBe(3);

    await loader(4); // pushes size to 4 → evicts key 1 (the oldest)
    expect(c.calls()).toBe(4);

    // Keys 2, 3, 4 are still warm — no new calls for any of them.
    await loader(2);
    await loader(3);
    await loader(4);
    expect(c.calls()).toBe(4);

    // Key 1 was evicted: asking again re-invokes load (and now evicts 2,
    // the oldest of {2,3,4}).
    await loader(1);
    expect(c.calls()).toBe(5);
    await loader(2);
    expect(c.calls()).toBe(6);
  });

  it("a hit refreshes recency, so it survives an eviction that would otherwise drop it", async () => {
    const c = counting<[year: number]>();
    const loader = lruLoader(3, c.load);
    await loader(1);
    await loader(2);
    await loader(3);
    await loader(1); // re-touch key 1: now the most-recently-used
    await loader(4); // capacity exceeded: key 2 (now oldest) is evicted, not 1
    expect(c.calls()).toBe(4);

    await loader(1); // still warm
    expect(c.calls()).toBe(4);

    await loader(2); // evicted: re-invokes
    expect(c.calls()).toBe(5);
  });

  it("never grows past capacity no matter how many distinct keys are asked for", async () => {
    const c = counting<[n: number]>();
    const loader = lruLoader(8, c.load);
    for (let n = 0; n < 100; n += 1) await loader(n);
    expect(c.calls()).toBe(100);
    // The oldest keys are long gone; the most recent 8 are still warm.
    const before = c.calls();
    for (let n = 92; n < 100; n += 1) await loader(n);
    expect(c.calls()).toBe(before);
  });
});
