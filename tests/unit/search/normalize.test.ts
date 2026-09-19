import { describe, expect, it } from "vitest";
import { normalizeText } from "@/lib/search/normalize";

describe("normalizeText", () => {
  it("lower-cases", () => {
    expect(normalizeText("JAPAN")).toBe("japan");
  });

  it("strips diacritics", () => {
    expect(normalizeText("Türkiye")).toBe("turkiye");
    expect(normalizeText("Curaçao")).toBe("curacao");
    expect(normalizeText("São Tomé")).toBe("sao tome");
  });

  it("leaves plain ascii untouched (besides casing)", () => {
    expect(normalizeText("Kirkuk-Ceyhan")).toBe("kirkuk-ceyhan");
  });
});
