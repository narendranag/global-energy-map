import { describe, it, expect } from "vitest";
import { groupIdenticalPairShares, pairLabel } from "@/lib/scenarios/share-groups";

const cite = { source_title: "IEA", source_url: "https://iea.org", source_year: 2026, source_note: "inside" };

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
});
