import { describe, it, expect } from "vitest";
import { groupIdenticalPairShares, pairLabel } from "@/lib/scenarios/share-groups";

const cite = { source_title: "IEA", source_url: "https://iea.org", source_year: 2026, data_year: null, source_note: "inside" };

describe("groupIdenticalPairShares", () => {
  it("merges pair rows with the same share and citation, keeping first-row order", () => {
    const rows = [
      { exporter_iso3: "SAU", importer_iso3: null, share: 0.88, ...cite },
      { exporter_iso3: "QAT", importer_iso3: "KWT", share: 0, ...cite },
      { exporter_iso3: "RUS", importer_iso3: "DEU", share: 0.47, ...cite, source_note: "other" },
      { exporter_iso3: "QAT", importer_iso3: "BHR", share: 0, ...cite },
    ];
    const groups = groupIdenticalPairShares(rows);
    expect(groups.map((g) => g.rows.map(pairLabel))).toEqual([["SAU→*"], ["QAT→KWT", "QAT→BHR"], ["RUS→DEU"]]);
  });

  it("never merges exporter-wide rows, and splits pairs whose share or note differs", () => {
    const rows = [
      { exporter_iso3: "IRN", importer_iso3: null, share: 1, ...cite },
      { exporter_iso3: "KWT", importer_iso3: null, share: 1, ...cite },
      { exporter_iso3: "RUS", importer_iso3: "POL", share: 0.47, ...cite },
      { exporter_iso3: "RUS", importer_iso3: "HUN", share: 1, ...cite },
    ];
    expect(groupIdenticalPairShares(rows).every((g) => g.rows.length === 1)).toBe(true);
  });

  it("keeps importer-wide rows separate from pair rows and labels them *→X", () => {
    const rows = [
      { exporter_iso3: null, importer_iso3: "KWT", share: 1, ...cite },
      { exporter_iso3: "IRQ", importer_iso3: "KWT", share: 1, ...cite },
      { exporter_iso3: null, importer_iso3: "BHR", share: 1, ...cite },
    ];
    const groups = groupIdenticalPairShares(rows);
    expect(groups.map((g) => g.rows.map(pairLabel))).toEqual([["*→KWT"], ["IRQ→KWT"], ["*→BHR"]]);
  });
});

it("never merges two rows that cite the same document for different years", () => {
  // One document can support a 2025 figure and a structural carve-out that
  // describes no year; reading them as one entry would date both by one.
  const rows = [
    { exporter_iso3: "QAT", importer_iso3: "KWT", share: 0, ...cite, data_year: 2025 },
    { exporter_iso3: "QAT", importer_iso3: "BHR", share: 0, ...cite, data_year: null },
    { exporter_iso3: "QAT", importer_iso3: "ARE", share: 0, ...cite, data_year: 2025 },
  ];
  const groups = groupIdenticalPairShares(rows);
  expect(groups.map((g) => g.rows.length)).toEqual([2, 1]);
});
