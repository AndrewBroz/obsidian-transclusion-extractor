import { describe, expect, it } from "vitest";
import { computeShift, headingLevel, lastHeadingLevel, minHeadingLevel, shiftHeadings } from "../src/transforms/headings";

describe("headingLevel", () => {
  it("recognises ATX headings only", () => {
    expect(headingLevel("## A")).toBe(2);
    expect(headingLevel("#tag")).toBe(0);
    expect(headingLevel("####### seven")).toBe(0);
    expect(headingLevel("text")).toBe(0);
  });
});

describe("computeShift", () => {
  it("demotes so the top embedded heading sits one below the context", () => {
    expect(computeShift(3, "## S\ntext")).toBe(2);
  });
  it("never promotes", () => {
    expect(computeShift(1, "### X")).toBe(0);
  });
  it("is zero when the content has no headings", () => {
    expect(computeShift(2, "plain")).toBe(0);
  });
});

describe("shiftHeadings", () => {
  it("demotes every heading", () => {
    expect(shiftHeadings("## A\ntext\n### B", 2)).toBe("#### A\ntext\n##### B");
  });
  it("clamps at H6", () => {
    expect(shiftHeadings("##### A", 3)).toBe("###### A");
  });
  it("ignores lines inside fenced code (Review Focus 4)", () => {
    expect(shiftHeadings("```\n# not\n```\n# yes", 1)).toBe("```\n# not\n```\n## yes");
    expect(minHeadingLevel("```\n# c\n```\n### h")).toBe(3);
  });
});

describe("lastHeadingLevel", () => {
  it("returns the level of the last heading, or 0", () => {
    expect(lastHeadingLevel("# a\n## b\ntext")).toBe(2);
    expect(lastHeadingLevel("text")).toBe(0);
  });
});
