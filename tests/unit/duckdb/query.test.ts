import { describe, it, expect } from "vitest";
import { quoteIdent } from "@/lib/duckdb/query";

describe("quoteIdent", () => {
  it("wraps a simple ident", () => {
    expect(quoteIdent("year")).toBe(`"year"`);
  });
  it("escapes embedded quotes", () => {
    expect(quoteIdent('na"me')).toBe(`"na""me"`);
  });
});
