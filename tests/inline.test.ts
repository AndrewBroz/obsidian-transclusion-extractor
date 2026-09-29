import { describe, expect, it } from "vitest";
import { buildInlineReplacement, InlineInput } from "../src/transforms/inline";

const M = "%% inlined from [[N#^a]] on 2026-09-29 %%";

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

  it("inlines a single paragraph mid-sentence", () => {
    expect(build("See ![[N#^a]] now", "Hello ^a")).toBe(`See ${M} Hello now`);
  });

  it("puts a blank line between the marker and a table", () => {
    expect(build("![[N#^a]]", "| a |\n| - |", { blockId: null })).toBe(`${M}\n\n| a |\n| - |`);
  });
});
