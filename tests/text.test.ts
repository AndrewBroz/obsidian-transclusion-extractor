import { describe, expect, it } from "vitest";
import { normalizeNewlines, removeSpan, trimBlankLines } from "../src/transforms/text";

describe("normalizeNewlines", () => {
  it("converts CRLF and CR to LF", () => {
    expect(normalizeNewlines("a\r\nb\rc")).toBe("a\nb\nc");
  });
});

describe("trimBlankLines", () => {
  it("drops leading and trailing whitespace-only lines", () => {
    expect(trimBlankLines("\n\n  \nA\nB\n\n")).toBe("A\nB");
  });
  it("returns empty for whitespace-only text", () => {
    expect(trimBlankLines("  \n \n")).toBe("");
  });
  it("keeps indentation of the first content line", () => {
    expect(trimBlankLines("\n    code")).toBe("    code");
  });
});

describe("removeSpan", () => {
  it("removes an inline span and one adjacent space", () => {
    expect(removeSpan("keep XX this", 5, 7)).toBe("keep this");
  });
  it("removes a whole line when nothing else is on it", () => {
    expect(removeSpan("A\nXX\nB", 2, 4)).toBe("A\nB");
  });
  it("collapses the blank lines around a removed line", () => {
    expect(removeSpan("A\n\nXX\n\nB", 3, 5)).toBe("A\n\nB");
  });
  it("treats a quote marker as empty when deciding to remove the line", () => {
    expect(removeSpan("> A\n> XX", 6, 8)).toBe("> A");
  });
});
