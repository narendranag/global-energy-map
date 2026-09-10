import { describe, expect, it } from "vitest";
import { csvComments, csvField, toCsv } from "@/lib/export/csv";
import { featureCollection, lineFeatures, pointFeatures, reprojectProps } from "@/lib/export/geojson";

describe("csvField", () => {
  it("leaves plain values bare", () => {
    expect(csvField("Ras Tanura")).toBe("Ras Tanura");
    expect(csvField(12.5)).toBe("12.5");
    expect(csvField(0)).toBe("0");
    expect(csvField(true)).toBe("true");
  });

  it("quotes commas, quotes, newlines and edge whitespace; doubles quotes", () => {
    expect(csvField("Enbridge, Inc.")).toBe('"Enbridge, Inc."');
    expect(csvField('The "Big" One')).toBe('"The ""Big"" One"');
    expect(csvField("line1\nline2")).toBe('"line1\nline2"');
    expect(csvField("a\r\nb")).toBe('"a\r\nb"');
    expect(csvField(" padded")).toBe('" padded"');
  });

  it("writes null, undefined and non-finite numbers as empty fields", () => {
    expect(csvField(null)).toBe("");
    expect(csvField(undefined)).toBe("");
    expect(csvField(Number.NaN)).toBe("");
    expect(csvField(Number.POSITIVE_INFINITY)).toBe("");
  });
});

describe("toCsv", () => {
  it("writes a # comment header, a header row, and one record per row", () => {
    const csv = toCsv(
      ["id", "name", "qty"],
      [
        { id: "a", name: "x, y", qty: 1 },
        { id: "b", name: null, qty: 2.5 },
      ],
      ["Title line", "multi\nline"],
    );
    expect(csv).toBe('# Title line\n# multi\n# line\nid,name,qty\na,"x, y",1\nb,,2.5\n');
  });

  it("omits the header block when there are no comments", () => {
    expect(toCsv(["a"], [{ a: 1 }])).toBe("a\n1\n");
  });

  it("serialises non-scalar values as JSON (quoted)", () => {
    expect(toCsv(["v"], [{ v: { k: 1 } }])).toBe('v\n"{""k"":1}"\n');
  });

  it("renders blank comment lines as a bare #", () => {
    expect(csvComments(["a", "", "b"])).toBe("# a\n#\n# b");
  });
});

describe("GeoJSON builders", () => {
  it("builds Point features from lon/lat and drops rows without coordinates", () => {
    const fs = pointFeatures(
      [
        { id: "a", lon: 10, lat: 20, name: "A" },
        { id: "b", lon: null, lat: 5, name: "B" },
      ],
      ["id", "name"],
    );
    expect(fs).toEqual([
      { type: "Feature", geometry: { type: "Point", coordinates: [10, 20] }, properties: { id: "a", name: "A" } },
    ]);
  });

  it("builds two-point LineStrings and maps undefined props to null", () => {
    const fs = lineFeatures(
      [{ v: "1", a: 1, b: 2, c: 3, d: 4 }],
      ["v", "missing" as "v"],
      { fromLon: "a", fromLat: "b", toLon: "c", toLat: "d" },
    );
    expect(fs[0]?.geometry).toEqual({ type: "LineString", coordinates: [[1, 2], [3, 4]] });
    expect(fs[0]?.properties).toEqual({ v: "1", missing: null });
  });

  it("narrows properties of existing features and wraps them with metadata", () => {
    const f = {
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [0, 0] },
      properties: { keep: 1, drop: 2 },
    };
    const fc = featureCollection(reprojectProps([f], ["keep"]), {
      title: "t",
      view_url: "u",
      exported: "2026-09-10",
      cite: "c",
      sources: [],
    });
    expect(fc.type).toBe("FeatureCollection");
    expect(fc.features[0]?.properties).toEqual({ keep: 1 });
    expect(fc.metadata.title).toBe("t");
    // Valid JSON round-trip.
    expect(JSON.parse(JSON.stringify(fc))).toEqual(fc);
  });
});
