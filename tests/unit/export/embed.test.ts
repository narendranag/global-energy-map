import { describe, expect, it } from "vitest";
import { embedSnippet, embedUrl, escapeHtmlAttribute } from "@/lib/export/embed";

describe("escapeHtmlAttribute", () => {
  it("escapes &, \", < and >", () => {
    expect(escapeHtmlAttribute(`a&b"c<d>e`)).toBe("a&amp;b&quot;c&lt;d&gt;e");
  });

  it("leaves an already-clean string alone", () => {
    expect(escapeHtmlAttribute("https://example.com/path")).toBe("https://example.com/path");
  });
});

describe("embedUrl", () => {
  const base = "https://energymap.marain.space/?mode=scenarios&scenario=hormuz&year=2023";

  it("adds embed=1", () => {
    const url = new URL(embedUrl(base));
    expect(url.searchParams.get("embed")).toBe("1");
    expect(url.searchParams.has("controls")).toBe(false);
  });

  it("adds controls=0 when hideControls is set", () => {
    const url = new URL(embedUrl(base, { hideControls: true }));
    expect(url.searchParams.get("embed")).toBe("1");
    expect(url.searchParams.get("controls")).toBe("0");
  });

  it("preserves every other param", () => {
    const url = new URL(embedUrl(base));
    expect(url.searchParams.get("mode")).toBe("scenarios");
    expect(url.searchParams.get("scenario")).toBe("hormuz");
    expect(url.searchParams.get("year")).toBe("2023");
  });
});

describe("embedSnippet", () => {
  const base = "https://energymap.marain.space/?mode=scenarios&scenario=hormuz&year=2023";

  it("builds an <iframe> with the expected attributes", () => {
    const html = embedSnippet(base);
    expect(html).toContain('width="100%"');
    expect(html).toContain('height="560"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('style="border:0"');
    expect(html).toContain('title="Global Energy Map"');
  });

  it("HTML-escapes the & in the querystring inside the src attribute", () => {
    const html = embedSnippet(base);
    const srcMatch = /src="([^"]*)"/.exec(html);
    expect(srcMatch).not.toBeNull();
    const src = srcMatch?.[1] ?? "";
    expect(src).toContain("&amp;");
    expect(src).not.toMatch(/&(?!amp;)/);
  });

  it("carries embed=1 (and controls=0 when asked) into the src", () => {
    const html = embedSnippet(base, { hideControls: true });
    const srcMatch = /src="([^"]*)"/.exec(html);
    const decoded = (srcMatch?.[1] ?? "").replace(/&amp;/g, "&");
    const url = new URL(decoded);
    expect(url.searchParams.get("embed")).toBe("1");
    expect(url.searchParams.get("controls")).toBe("0");
  });

  it("uses a custom title, still escaped", () => {
    const html = embedSnippet(base, { title: `Oil & Gas "Map"` });
    expect(html).toContain('title="Oil &amp; Gas &quot;Map&quot;"');
  });
});
