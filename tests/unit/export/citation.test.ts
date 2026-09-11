import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Catalog, CatalogEntry } from "@/lib/data-catalog/types";
import {
  apaCitation,
  attributionsFor,
  bibtexCitation,
  bibtexEscape,
  bibtexKey,
  entriesForTags,
  longDate,
  SCENARIO_SHARES,
  SITE_CITATION,
  sharesFor,
  viewCitationText,
  type SiteCitation,
} from "@/lib/export/citation";

const SITE: SiteCitation = {
  title: "Global Energy Map",
  version: "1.0.0",
  "date-released": "2026-09-09",
  url: "https://energymap.marain.space",
  authors: [{ "family-names": "Nag", "given-names": "Narendra" }],
};

function entry(over: Partial<CatalogEntry>): CatalogEntry {
  return {
    id: "x",
    label: "X",
    path: "/data/x.parquet",
    format: "parquet",
    source_name: "Src",
    source_url: "https://src.example",
    license: "CC BY 4.0",
    as_of: "2025-01-01",
    layers: [],
    ...over,
  };
}

describe("site citation (from CITATION.cff)", () => {
  it("APA 7 software reference", () => {
    expect(apaCitation(SITE)).toBe(
      "Nag, N. (2026). Global Energy Map (Version 1.0.0) [Computer software]. https://energymap.marain.space",
    );
  });

  it("APA for a view carries a retrieval date and the view URL", () => {
    expect(apaCitation(SITE, { viewUrl: "https://x/?year=2020", accessed: "2026-09-10" })).toBe(
      "Nag, N. (2026). Global Energy Map (Version 1.0.0) [Computer software]. Retrieved September 10, 2026, from https://x/?year=2020",
    );
  });

  it("APA joins multiple authors with an ampersand and keeps organisations whole", () => {
    const site = {
      ...SITE,
      authors: [
        { "family-names": "Doe", "given-names": "Jane Q" },
        { "family-names": "Roe", "given-names": "Jean-Luc" },
        { name: "Energy Lab" },
      ],
    };
    expect(apaCitation(site)).toMatch(/^Doe, J\. Q\., Roe, J\.-L\., & Energy Lab\. \(2026\)/);
  });

  it("BibTeX @software entry with escaped text and urldate", () => {
    const bib = bibtexCitation(SITE, { viewUrl: "https://x/?a=1&b=2", accessed: "2026-09-10" });
    expect(bib.startsWith("@software{nag2026global,\n")).toBe(true);
    expect(bib).toContain("author  = {Nag, Narendra}");
    expect(bib).toContain("title   = {{Global Energy Map}}");
    expect(bib).toContain("year    = {2026}");
    expect(bib).toContain("url     = {https://x/?a=1&b=2}");
    expect(bib).toContain("urldate = {2026-09-10}");
    expect(bib.trimEnd().endsWith("}")).toBe(true);
    expect(bibtexEscape("R&D 50% #1 a_b {x}")).toBe("R\\&D 50\\% \\#1 a\\_b \\{x\\}");
    expect(bibtexKey(SITE)).toBe("nag2026global");
  });

  it("longDate formats without timezone drift", () => {
    expect(longDate("2026-01-01")).toBe("January 1, 2026");
    expect(longDate("not a date")).toBe("not a date");
  });

  it("the generated sidecar matches CITATION.cff", () => {
    const cff = readFileSync(path.join(process.cwd(), "CITATION.cff"), "utf8");
    const scalar = (k: string) => new RegExp(`^${k}:\\s*"?([^"\\n]+)"?$`, "m").exec(cff)?.[1];
    expect(SITE_CITATION.title).toBe(scalar("title"));
    expect(SITE_CITATION.version).toBe(scalar("version"));
    expect(SITE_CITATION["date-released"]).toBe(scalar("date-released"));
    expect(SITE_CITATION.url).toBe(scalar("url"));
    expect(SITE_CITATION.authors[0]?.["family-names"]).toBe("Nag");
  });
});

describe("scenario share citations", () => {
  it("carries all 72 disruption_route rows with a source title", () => {
    // 18 hand-set shares + 54 share-0 intra-Gulf Hormuz pairs (42 crude, 12 LNG).
    expect(SCENARIO_SHARES).toHaveLength(72);
    for (const r of SCENARIO_SHARES) {
      expect(r.source_title.length).toBeGreaterThan(0);
      expect(r.share).toBeGreaterThanOrEqual(0);
      expect(r.share).toBeLessThanOrEqual(1);
      if (r.share === 0) expect(r.disruption_id).toMatch(/^hormuz/);
    }
    expect(sharesFor("druzhba").map((r) => r.importer_iso3)).toEqual(["BLR", "POL", "DEU", "SVK", "HUN", "CZE"]);
    expect(sharesFor("hormuz_lng").filter((r) => r.importer_iso3 === null).map((r) => r.exporter_iso3)).toEqual([
      "QAT",
      "ARE",
    ]);
  });
});

describe("view citation", () => {
  const catalog: Catalog = {
    version: 6,
    generated_at: "2026-09-10T00:00:00+00:00",
    entries: [
      entry({ id: "a", layers: ["pipelines"], attribution: "Data: GEM, CC BY 4.0" }),
      entry({ id: "b", layers: ["gas_pipelines"], attribution: "Data: GEM, CC BY 4.0" }),
      entry({ id: "c", layers: ["basins"] }),
    ],
  };

  it("entriesForTags keeps catalog order and de-duplicates", () => {
    expect(entriesForTags(["gas_pipelines", "pipelines", "pipelines"], catalog).map((e) => e.id)).toEqual(["a", "b"]);
    expect(attributionsFor(catalog.entries)).toEqual(["Data: GEM, CC BY 4.0"]);
  });

  it("lists the view, layers, sources with as-of dates and attributions", () => {
    const text = viewCitationText(
      {
        viewUrl: "https://x/?year=2020",
        accessed: "2026-09-10",
        summary: "2020 · oil · no scenario",
        layerLabels: ["Oil pipelines"],
        sources: entriesForTags(["pipelines"], catalog),
      },
      SITE,
    );
    expect(text).toContain("Retrieved September 10, 2026, from https://x/?year=2020");
    expect(text).toContain("View: 2020 · oil · no scenario");
    expect(text).toContain("Layers: Oil pipelines");
    expect(text).toContain("- Src — X, as of 2025-01-01. Licence: CC BY 4.0. https://src.example");
    expect(text).toContain("Required attributions:\n- Data: GEM, CC BY 4.0");
  });
});
