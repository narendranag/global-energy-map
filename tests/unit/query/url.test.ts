import { describe, expect, it } from "vitest";
import { MAX_QUERY_PARAM_CHARS, decodeQuery, encodeQuery } from "@/lib/query/url";

describe("the query in the URL", () => {
  it("round-trips SQL, including quotes, newlines and non-ASCII", () => {
    const sql = "SELECT *\nFROM trade_flow\nWHERE importer_iso3 = 'DEU' -- Köln ≥ 2020\n";
    expect(decodeQuery(encodeQuery(sql) ?? "")).toBe(sql.trim());
  });

  it("uses base64url, so nothing needs percent-encoding in the address bar", () => {
    const encoded = encodeQuery("SELECT ?? >> 1 FROM t WHERE a = 'b/c+d'") ?? "";
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("has no query for empty or blank input", () => {
    expect(encodeQuery("")).toBeNull();
    expect(encodeQuery("   \n ")).toBeNull();
    expect(decodeQuery(null)).toBeNull();
    expect(decodeQuery("")).toBeNull();
  });

  it("refuses to write a query too long to survive a shared link", () => {
    expect(encodeQuery("a".repeat(10)) ).not.toBeNull();
    expect(encodeQuery("-- ".padEnd(MAX_QUERY_PARAM_CHARS * 2, "x"))).toBeNull();
  });

  it("returns null rather than throwing on a param that is not base64url UTF-8", () => {
    expect(decodeQuery("not base64!")).toBeNull();
    expect(decodeQuery("§§§")).toBeNull();
    expect(decodeQuery("/w==")).toBeNull(); // valid base64, invalid UTF-8
    expect(decodeQuery("x".repeat(MAX_QUERY_PARAM_CHARS + 1))).toBeNull();
  });
});
