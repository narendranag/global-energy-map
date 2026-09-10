import { describe, it, expect, vi, afterEach } from "vitest";
import type { CountryCollection } from "@/lib/geo/countries";

const FC: CountryCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { iso3: "SAU", name: "Saudi Arabia" },
      geometry: { type: "Polygon", coordinates: [] },
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("loadCountries", () => {
  it("issues a single fetch for concurrent callers", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify(FC), { status: 200 })),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { loadCountries } = await import("@/lib/geo/countries");
    const [a, b] = await Promise.all([loadCountries(), loadCountries()]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  it("clears the cache after a failure so a retry can succeed", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(FC), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { loadCountries } = await import("@/lib/geo/countries");
    await expect(loadCountries()).rejects.toThrow();
    await expect(loadCountries()).resolves.toEqual(FC);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("countryNameMap", () => {
  it("merges Natural Earth names with the small-country supplement", async () => {
    const { countryNameMap } = await import("@/lib/geo/countries");
    const m = countryNameMap(FC);
    expect(m.get("SAU")).toBe("Saudi Arabia");
    expect(m.get("SGP")).toBe("Singapore");
    expect(m.get("BHR")).toBe("Bahrain");
  });

  it("does not know BACI pseudo-country codes", async () => {
    const { countryNameMap } = await import("@/lib/geo/countries");
    const m = countryNameMap(FC);
    expect(m.has("S19")).toBe(false);
    expect(m.has("ZA1")).toBe(false);
    expect(m.has("PUS")).toBe(false);
  });
});
