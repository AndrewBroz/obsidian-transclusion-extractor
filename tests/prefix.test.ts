import { describe, expect, it } from "vitest";
import { applyPrefix, parseLinePrefix, stripQuote } from "../src/transforms/prefix";

describe("parseLinePrefix", () => {
  it("accepts an empty prefix", () => {
    expect(parseLinePrefix("")).toEqual({ first: "", rest: "", blank: "", inList: false, inQuote: false });
  });
  it("handles single and nested quotes", () => {
    expect(parseLinePrefix("> ")).toMatchObject({ rest: "> ", blank: ">", inQuote: true, inList: false });
    expect(parseLinePrefix("> > ")).toMatchObject({ rest: "> > ", blank: "> >" });
  });
  it("handles bullet, ordered and task list markers", () => {
    expect(parseLinePrefix("- ")).toMatchObject({ rest: "  ", inList: true });
    expect(parseLinePrefix("  1. ")).toMatchObject({ rest: "     ", inList: true });
    expect(parseLinePrefix("- [ ] ")).toMatchObject({ rest: "      ", inList: true });
  });
  it("treats indentation-only prefixes as list continuation", () => {
    expect(parseLinePrefix("    ")).toMatchObject({ inList: true, rest: "    " });
  });
  it("rejects prefixes containing text", () => {
    expect(parseLinePrefix("See ")).toBeNull();
    expect(parseLinePrefix("2019 ")).toBeNull();
  });
});

describe("applyPrefix", () => {
  it("prefixes quote lines and turns blanks into bare markers", () => {
    expect(applyPrefix(["a", "", "b"], parseLinePrefix("> ")!)).toEqual(["> a", ">", "> b"]);
  });
  it("uses the marker on the first line and indentation after", () => {
    expect(applyPrefix(["a", "b"], parseLinePrefix("- ")!)).toEqual(["- a", "  b"]);
  });
});

describe("stripQuote", () => {
  it("removes leading quote markers", () => {
    expect(stripQuote("> > text")).toBe("text");
  });
});
