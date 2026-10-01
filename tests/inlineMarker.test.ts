import { describe, expect, it } from "vitest";
import { formatInlineMarker, INLINE_MARKER_RE, stripInlineMarkers } from "../src/transforms/inlineMarker";

describe("formatInlineMarker", () => {
  it("writes an HTML comment with a quoted target", () => {
    expect(formatInlineMarker("Sources/Quotes#^q1", "2026-09-30")).toBe('<!-- inlined from "Sources/Quotes#^q1" on 2026-09-30 -->');
  });
  it("never puts -- inside the comment (Review Focus 1)", () => {
    const m = formatInlineMarker("a--b---c", "2026-09-30");
    expect(m).toBe('<!-- inlined from "a- -b- - -c" on 2026-09-30 -->');
    expect(m.slice(4, -3)).not.toContain("--");
  });
  it("escapes quotes and backslashes", () => {
    expect(formatInlineMarker('Say "hi"\\x', "2026-09-30")).toBe('<!-- inlined from "Say \\"hi\\"\\\\x" on 2026-09-30 -->');
  });
});

describe("INLINE_MARKER_RE", () => {
  it("matches produced markers, including escaped quotes", () => {
    const text = `a ${formatInlineMarker('X "y"', "2026-09-30")} b ${formatInlineMarker("Z", "2026-10-01")}`;
    expect([...text.matchAll(INLINE_MARKER_RE)].length).toBe(2);
  });
  it("does not match other HTML comments", () => {
    expect([..."<!-- from: N#^a --> <!-- note -->".matchAll(INLINE_MARKER_RE)].length).toBe(0);
  });
});

describe("stripInlineMarkers", () => {
  const M = '<!-- inlined from "N#^a" on 2026-09-30 -->';
  it("removes a marker line and keeps the content", () => {
    expect(stripInlineMarkers(`Intro\n\n${M}\nHello\n\nEnd`)).toBe("Intro\n\nHello\n\nEnd");
  });
  it("removes an inline marker without a double space", () => {
    expect(stripInlineMarkers(`See ${M} Hello now`)).toBe("See Hello now");
  });
  it("removes a marker inside a quote", () => {
    expect(stripInlineMarkers(`> ${M}\n> Hello`)).toBe("> Hello");
  });
  it("leaves other HTML comments and code alone (Review Focus 3)", () => {
    const text = "<!-- from: N#^a -->\nHello\n<!-- /from -->\n```\n" + M + "\n```";
    expect(stripInlineMarkers(text)).toBe(text);
  });
});
