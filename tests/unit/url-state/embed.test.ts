import { describe, expect, it } from "vitest";
import { embedControlsHidden, extractEmbedParams, isEmbed } from "@/lib/url-state/embed";

describe("isEmbed", () => {
  it("is true only for embed=1", () => {
    expect(isEmbed(new URLSearchParams("embed=1"))).toBe(true);
    expect(isEmbed(new URLSearchParams("embed=true"))).toBe(false);
    expect(isEmbed(new URLSearchParams("embed=0"))).toBe(false);
    expect(isEmbed(new URLSearchParams(""))).toBe(false);
  });
});

describe("embedControlsHidden", () => {
  it("is true only for controls=0", () => {
    expect(embedControlsHidden(new URLSearchParams("controls=0"))).toBe(true);
    expect(embedControlsHidden(new URLSearchParams("controls=1"))).toBe(false);
    expect(embedControlsHidden(new URLSearchParams(""))).toBe(false);
  });
});

describe("extractEmbedParams", () => {
  it("is empty when neither key is present", () => {
    expect(extractEmbedParams("mode=infrastructure&year=2020")).toBe("");
  });

  it("keeps only embed/controls, dropping everything else", () => {
    const out = extractEmbedParams("mode=infrastructure&embed=1&year=2020&controls=0");
    const params = new URLSearchParams(out);
    expect(params.get("embed")).toBe("1");
    expect(params.get("controls")).toBe("0");
    expect(params.has("mode")).toBe(false);
    expect(params.has("year")).toBe(false);
  });

  it("keeps embed alone when controls is absent", () => {
    expect(extractEmbedParams("embed=1")).toBe("embed=1");
  });

  it("accepts a leading '?'", () => {
    expect(extractEmbedParams("?embed=1")).toBe("embed=1");
  });

  it("preserves the raw value even if not '1' (decoding decides validity elsewhere)", () => {
    expect(new URLSearchParams(extractEmbedParams("embed=yes")).get("embed")).toBe("yes");
  });
});
