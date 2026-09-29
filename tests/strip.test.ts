import { describe, expect, it } from "vitest";
import { stripBlockIds } from "../src/transforms/stripBlockIds";
import { stripComments } from "../src/transforms/stripComments";

describe("stripComments", () => {
  it("removes an inline comment without leaving a double space", () => {
    expect(stripComments("keep %%drop%% this")).toBe("keep this");
  });
  it("removes a trailing comment and its leading space", () => {
    expect(stripComments("keep %%drop%%")).toBe("keep");
  });
  it("removes a comment-only line and collapses the blank lines around it", () => {
    expect(stripComments("A\n\n%% note %%\n\nB")).toBe("A\n\nB");
  });
  it("removes a multi-line comment block", () => {
    expect(stripComments("A\n\n%%\nhidden\n%%\n\nB")).toBe("A\n\nB");
  });
  it("leaves an unclosed comment alone", () => {
    expect(stripComments("a %% b")).toBe("a %% b");
  });
  it("leaves comments inside code alone", () => {
    const text = "```\n%%x%%\n```";
    expect(stripComments(text)).toBe(text);
  });
  it("removes a comment that starts the line, including trailing space", () => {
    expect(stripComments("%%TODO%% remember")).toBe("remember");
  });
});

describe("stripBlockIds", () => {
  it("removes a trailing block ID", () => {
    expect(stripBlockIds("Para ^abc-1")).toBe("Para");
    expect(stripBlockIds("Para ^abc\nNext")).toBe("Para\nNext");
  });
  it("removes extra whitespace before the ID", () => {
    expect(stripBlockIds("Para   ^abc")).toBe("Para");
  });
  it("removes an ID on its own line after a table", () => {
    expect(stripBlockIds("| a |\n| - |\n\n^tbl\n\nAfter")).toBe("| a |\n| - |\n\nAfter");
  });
  it("removes an ID-only line inside a quote", () => {
    expect(stripBlockIds("> Quote\n> ^q")).toBe("> Quote");
  });
  it("ignores carets that are not trailing block IDs", () => {
    expect(stripBlockIds("x ^y z")).toBe("x ^y z");
    expect(stripBlockIds("x^2")).toBe("x^2");
  });
  it("ignores IDs inside code", () => {
    const text = "```\nline ^id\n```";
    expect(stripBlockIds(text)).toBe(text);
  });
  it("removes only the requested ID when `only` is given", () => {
    expect(stripBlockIds("One ^a\nTwo ^b", "a")).toBe("One\nTwo ^b");
  });
});
