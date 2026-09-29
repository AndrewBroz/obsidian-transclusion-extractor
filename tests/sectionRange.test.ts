import { describe, expect, it } from "vitest";
import { blockIdMatches, dedentBlock, headingEndOffset, listItemEndOffset, sliceMatchesHeading } from "../src/transforms/sectionRange";

const h = (level: number, offset: number) => ({ level, position: { start: { line: 0, offset } } });
const li = (line: number, parent: number, endOffset: number) => ({
  parent,
  position: { start: { line, offset: 0 }, end: { line, offset: endOffset } },
});

describe("headingEndOffset", () => {
  const headings = [h(1, 0), h(2, 10), h(3, 30), h(2, 50)];
  it("ends at the next heading of equal or higher level", () => {
    expect(headingEndOffset(headings, 1, 99)).toBe(50);
    expect(headingEndOffset(headings, 2, 99)).toBe(50);
  });
  it("runs to the end of the text when no such heading follows", () => {
    expect(headingEndOffset(headings, 3, 99)).toBe(99);
    expect(headingEndOffset(headings, 0, 99)).toBe(99);
  });
});

describe("listItemEndOffset", () => {
  const items = [li(0, -1, 7), li(1, -1, 14), li(2, 1, 24), li(3, 2, 35), li(4, -1, 43)];
  it("extends a list item to cover all descendants", () => {
    expect(listItemEndOffset(items, 1)).toBe(35);
  });
  it("covers only the item itself when it has no children", () => {
    expect(listItemEndOffset(items, 0)).toBe(7);
  });
});

describe("sliceMatchesHeading", () => {
  it("accepts a slice starting with that heading", () => {
    expect(sliceMatchesHeading("## Setup steps\nbody", "Setup steps")).toBe(true);
    expect(sliceMatchesHeading("#\tSetup  \nbody", " Setup ")).toBe(true);
  });
  it("rejects a slice that starts elsewhere (stale offsets)", () => {
    expect(sliceMatchesHeading("tup steps\nbody", "Setup steps")).toBe(false);
    expect(sliceMatchesHeading("## Other\nbody", "Setup steps")).toBe(false);
    expect(sliceMatchesHeading("##Setup steps", "Setup steps")).toBe(false);
  });
  it("ignores an optional ATX closing hash sequence", () => {
    expect(sliceMatchesHeading("## Title ##", "Title")).toBe(true);
  });
  it("accepts an empty ATX heading", () => {
    expect(sliceMatchesHeading("##\nbody", "")).toBe(true);
  });
  it("accepts setext headings", () => {
    expect(sliceMatchesHeading("Title\n=====\nbody", "Title")).toBe(true);
    expect(sliceMatchesHeading("Title\n---", "Title")).toBe(true);
  });
  it("rejects a setext-looking slice with no underline", () => {
    expect(sliceMatchesHeading("Title\nnot underline", "Title")).toBe(false);
  });
});

describe("blockIdMatches", () => {
  it("accepts the ^id marker inside the cached range", () => {
    const raw = "A paragraph ^p1\nnext";
    expect(blockIdMatches(raw, 0, 16, "p1")).toBe(true);
  });
  it("accepts an own-line ^id immediately after the cached range", () => {
    const raw = "| table |\n\n^tbl\n";
    expect(blockIdMatches(raw, 0, 9, "tbl")).toBe(true);
  });
  it("accepts an own-line ^id right after the range at end of file", () => {
    const raw = "> quote\n^q";
    expect(blockIdMatches(raw, 0, 7, "q")).toBe(true);
  });
  it("rejects a different own-line id after the range", () => {
    const raw = "| table |\n\n^other\n";
    expect(blockIdMatches(raw, 0, 9, "tbl")).toBe(false);
  });
  it("rejects an id that isn't at the start of the following line", () => {
    const raw = "| table |\n\nText ^tbl\n";
    expect(blockIdMatches(raw, 0, 9, "tbl")).toBe(false);
  });
});

describe("dedentBlock", () => {
  it("removes the first line's indentation from every line", () => {
    expect(dedentBlock("\t- child ^id\n\t\t- grandchild")).toBe("- child ^id\n\t- grandchild");
    expect(dedentBlock("  - a\n    - b")).toBe("- a\n  - b");
  });
  it("leaves lines without that indentation alone", () => {
    expect(dedentBlock("- a\n  - b")).toBe("- a\n  - b");
    expect(dedentBlock("  - a\n\n x")).toBe("- a\n\n x");
  });
});
