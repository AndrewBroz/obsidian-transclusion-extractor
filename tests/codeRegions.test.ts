import { describe, expect, it } from "vitest";
import { findCodeRanges, findCommentRanges, findProtectedRanges, inRanges } from "../src/transforms/codeRegions";

const slices = (text: string, ranges: { start: number; end: number }[]) => ranges.map((r) => text.slice(r.start, r.end));

describe("findCodeRanges", () => {
  it("covers a backtick fence including its closing line", () => {
    const text = "a\n```js\nx\n```\nb";
    expect(slices(text, findCodeRanges(text))).toEqual(["```js\nx\n```\n"]);
  });

  it("closes a tilde fence only with an equal-or-longer tilde run", () => {
    const text = "~~~~\ncode ~~~\n~~~~\nafter";
    expect(slices(text, findCodeRanges(text))).toEqual(["~~~~\ncode ~~~\n~~~~\n"]);
  });

  it("runs an unclosed fence to the end of the text", () => {
    const text = "a\n```\nx";
    expect(slices(text, findCodeRanges(text))).toEqual(["```\nx"]);
  });

  it("finds fences inside blockquotes", () => {
    const text = "> ```\n> x\n> ```\nafter";
    expect(slices(text, findCodeRanges(text))).toEqual(["> ```\n> x\n> ```\n"]);
  });

  it("finds inline code, matching backtick run lengths", () => {
    expect(slices("use `x` here", findCodeRanges("use `x` here"))).toEqual(["`x`"]);
    const text = "a ``b ` c`` d";
    expect(slices(text, findCodeRanges(text))).toEqual(["``b ` c``"]);
  });

  it("ignores an unmatched backtick", () => {
    expect(findCodeRanges("a ` b")).toEqual([]);
  });
});

describe("findCommentRanges", () => {
  it("finds inline and multi-line comments", () => {
    expect(slices("a %%hidden%% b", findCommentRanges("a %%hidden%% b"))).toEqual(["%%hidden%%"]);
    const text = "a\n%%\nx\n%%\nb";
    expect(slices(text, findCommentRanges(text))).toEqual(["%%\nx\n%%"]);
  });

  it("returns nothing for an unclosed comment", () => {
    expect(findCommentRanges("a %% b")).toEqual([]);
  });

  it("ignores %% inside code", () => {
    const text = "`%%` and %%real%%";
    expect(slices(text, findCommentRanges(text))).toEqual(["%%real%%"]);
  });
});

describe("findProtectedRanges / inRanges", () => {
  it("merges code and comment ranges", () => {
    const text = "`a` %%b%%";
    expect(slices(text, findProtectedRanges(text))).toEqual(["`a`", "%%b%%"]);
  });

  it("treats ranges as half-open", () => {
    expect(inRanges([{ start: 2, end: 4 }], 2)).toBe(true);
    expect(inRanges([{ start: 2, end: 4 }], 4)).toBe(false);
  });
});
