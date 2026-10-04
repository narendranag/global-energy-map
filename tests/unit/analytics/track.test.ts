import { afterEach, describe, expect, it } from "vitest";
import { downloadParams, gtag, setAnalyticsActive, track } from "@/components/analytics/track";

afterEach(() => {
  setAnalyticsActive(false);
  delete window.dataLayer;
});

describe("track", () => {
  it("pushes nothing until the visit is measured", () => {
    track("share", { method: "copy_link" });
    gtag("set", { page_location: "https://example.test/" });
    expect(window.dataLayer).toBeUndefined();
  });

  it("pushes the event with its parameters once active", () => {
    setAnalyticsActive(true);
    track("select_content", { content_type: "scenario", scenario: "hormuz" });
    expect(window.dataLayer).toEqual([{ event: "select_content", content_type: "scenario", scenario: "hormuz" }]);
  });

  it("pushes gtag commands as an Arguments object", () => {
    setAnalyticsActive(true);
    gtag("set", { page_location: "https://example.test/query" });
    const pushed = window.dataLayer?.[0] as ArrayLike<unknown>;
    expect(Object.prototype.toString.call(pushed)).toBe("[object Arguments]");
    expect(pushed[0]).toBe("set");
  });
});

describe("downloadParams", () => {
  it("splits the extension", () => {
    expect(downloadParams("refineries-2024.GeoJSON", "layer")).toEqual({
      file_name: "refineries-2024.GeoJSON",
      file_extension: "geojson",
      download_kind: "layer",
    });
  });
});
