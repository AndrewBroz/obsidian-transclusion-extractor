import { describe, expect, it } from "vitest";
import { headingEndOffset, listItemEndOffset } from "../src/transforms/sectionRange";

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
