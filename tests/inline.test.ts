import { describe, expect, it } from "vitest";
import { buildInlineReplacement, InlineInput } from "../src/transforms/inline";

const M = '<!-- inlined from "N#^a" on 2026-09-29 -->';

function build(line: string, content: string, extra: Partial<InlineInput> = {}): string {
  const start = line.indexOf("![[");
  const end = line.indexOf("]]", start) + 2;
  return buildInlineReplacement({
    line, start, end, target: "N#^a", blockId: "a", content, date: "2026-09-29", prev: "", next: "", ...extra,
  });
}

describe("buildInlineReplacement", () => {
  it("writes the marker, then the content without its own block ID", () => {
    expect(build("![[N#^a]]", "Hello ^a")).toBe(`${M}\nHello`);
  });

  it("keeps block IDs other than the referenced one", () => {
    expect(build("![[N#^a]]", "- Main ^a\n  - Child ^c")).toBe(`${M}\n- Main\n  - Child ^c`);
  });

  it("stays inside a quote", () => {
    expect(build("> ![[N#^a]]", "Hello ^a", { prev: "> Intro" })).toBe(`>\n> ${M}\n> Hello`);
  });

  it("inlines a single paragraph mid-sentence, marker after the content (F1)", () => {
    expect(build("See ![[N#^a]] now", "Hello ^a")).toBe(`See Hello ${M} now`);
  });

  it("puts the marker after the content when the embed starts the line (F1)", () => {
    expect(build("![[N#^a]] trailing", "Hello ^a")).toBe(`Hello ${M} trailing`);
  });

  it("puts the marker after the content for a mid-line list item (F1)", () => {
    expect(build("- ![[N#^a]] trailing", "Hello ^a")).toBe(`- Hello ${M} trailing`);
  });

  it("puts the marker after the content for a mid-line quote (F1)", () => {
    expect(build("> ![[N#^a]] trailing", "Hello ^a")).toBe(`> Hello ${M} trailing`);
  });

  it("puts a blank line between the marker and a table", () => {
    expect(build("![[N#^a]]", "| a |\n| - |", { blockId: null })).toBe(`${M}\n\n| a |\n| - |`);
  });

  it("puts a blank line between the marker and a horizontal rule", () => {
    expect(build("![[N#^a]]", "---\nAfter", { blockId: null })).toBe(`${M}\n\n---\nAfter`);
  });

  it("puts a blank line between the marker and an ordered list not starting at 1", () => {
    expect(build("![[N#^a]]", "3. third\n4. fourth", { blockId: null })).toBe(`${M}\n\n3. third\n4. fourth`);
    expect(build("![[N#^a]]", "1. first", { blockId: null })).toBe(`${M}\n1. first`);
  });
});
