import { describe, expect, it } from "vitest";
import { classifyLine, isSingleParagraph, separators, toInline, wouldMerge } from "../src/transforms/spacing";

describe("classifyLine", () => {
  it("classifies Markdown line types", () => {
    expect(classifyLine(null)).toBe("blank");
    expect(classifyLine("  ")).toBe("blank");
    expect(classifyLine("## H")).toBe("heading");
    expect(classifyLine("[!note] Title")).toBe("heading");
    expect(classifyLine("```js")).toBe("fence");
    expect(classifyLine("> q")).toBe("quote");
    expect(classifyLine("| a |")).toBe("table");
    expect(classifyLine("---")).toBe("rule");
    expect(classifyLine("- item")).toBe("list");
    expect(classifyLine("12. item")).toBe("list");
    expect(classifyLine("^abc")).toBe("other");
    expect(classifyLine("Plain text")).toBe("paragraph");
  });
});

describe("wouldMerge", () => {
  it("never merges across a blank line", () => {
    expect(wouldMerge("blank", "paragraph")).toBe(false);
    expect(wouldMerge("paragraph", "blank")).toBe(false);
  });
  it("merges paragraph text into the paragraph, list, table or quote above it", () => {
    expect(wouldMerge("paragraph", "paragraph")).toBe(true);
    expect(wouldMerge("list", "paragraph")).toBe(true);
    expect(wouldMerge("table", "paragraph")).toBe(true);
    expect(wouldMerge("quote", "paragraph")).toBe(true);
  });
  it("needs a blank line before a table", () => {
    expect(wouldMerge("paragraph", "table")).toBe(true);
  });
  it("turns paragraph + --- into a setext heading", () => {
    expect(wouldMerge("paragraph", "rule")).toBe(true);
  });
  it("does not merge where Markdown starts a new block anyway", () => {
    expect(wouldMerge("heading", "paragraph")).toBe(false);
    expect(wouldMerge("paragraph", "heading")).toBe(false);
    expect(wouldMerge("paragraph", "list")).toBe(false);
    expect(wouldMerge("fence", "paragraph")).toBe(false);
  });
});

describe("separators", () => {
  it("adds separators only where text would merge", () => {
    expect(separators("Body", { prev: "Text", next: "More", inList: false })).toEqual({ above: true, below: true });
    expect(separators("Body", { prev: "", next: "", inList: false })).toEqual({ above: false, below: false });
    expect(separators("Body", { prev: null, next: null, inList: false })).toEqual({ above: false, below: false });
  });
  it("never separates inside a list item", () => {
    expect(separators("Body", { prev: "Text", next: "More", inList: true })).toEqual({ above: false, below: false });
  });
  it("uses the content's first and last lines", () => {
    expect(separators("| a |\n| - |", { prev: "Text", next: null, inList: false })).toEqual({ above: true, below: false });
    expect(separators("- a\n- b", { prev: "Text", next: "After", inList: false })).toEqual({ above: false, below: true });
  });
  it("separates an ordered list not starting at 1 from an adjacent paragraph", () => {
    expect(separators("3. third\n4. fourth", { prev: "Para", next: null, inList: false })).toEqual({ above: true, below: false });
    expect(separators("Body", { prev: null, next: "3) third", inList: false })).toEqual({ above: false, below: true });
    expect(separators("1. first", { prev: "Para", next: null, inList: false })).toEqual({ above: false, below: false });
    expect(separators("- a", { prev: null, next: "3. third", inList: false })).toEqual({ above: false, below: false });
  });
});

describe("inline helpers", () => {
  it("isSingleParagraph", () => {
    expect(isSingleParagraph("one\ntwo")).toBe(true);
    expect(isSingleParagraph("one\n\ntwo")).toBe(false);
    expect(isSingleParagraph("- a")).toBe(false);
    expect(isSingleParagraph("")).toBe(false);
  });
  it("toInline joins soft-wrapped lines with spaces", () => {
    expect(toInline("one\n  two")).toBe("one two");
  });
});
