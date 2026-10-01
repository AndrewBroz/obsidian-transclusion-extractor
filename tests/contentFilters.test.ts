import { describe, expect, it } from "vitest";
import { applyFilters, composeFilters, getContentFilters } from "../src/filters/contentFilters";

const appWith = (plugin: unknown) => ({ plugins: { getPlugin: (id: string) => (id === "inkling" ? plugin : null) } });
const inkling = { api: { version: 1, toOriginalText: (md: string) => md.replace(/\{\+\+.*?\+\+\}/g, "") } };

describe("getContentFilters", () => {
  it("offers Inkling's toOriginalText when Inkling exposes api v1+", () => {
    const filters = getContentFilters(appWith(inkling));
    expect(filters.map((f) => f.name)).toEqual(["inkling"]);
    expect(filters[0].filter("a{++b++}c")).toBe("ac");
  });
  it("returns nothing when Inkling is absent or disabled", () => {
    expect(getContentFilters(appWith(null))).toEqual([]);
    expect(getContentFilters({})).toEqual([]);
    expect(getContentFilters(null)).toEqual([]);
  });
  it("returns nothing for an old or malformed API", () => {
    expect(getContentFilters(appWith({ api: { version: 0, toOriginalText: () => "" } }))).toEqual([]);
    expect(getContentFilters(appWith({ api: { version: 1 } }))).toEqual([]);
    expect(getContentFilters(appWith({}))).toEqual([]);
  });
  it("turns a non-string result into a thrown error (Review Focus 4)", () => {
    const [f] = getContentFilters(appWith({ api: { version: 1, toOriginalText: () => 42 } }));
    expect(() => f.filter("x")).toThrow();
  });
});

describe("applyFilters", () => {
  it("applies filters in order", () => {
    const r = applyFilters("ab", [
      { name: "one", filter: (s) => s + "1" },
      { name: "two", filter: (s) => s + "2" },
    ]);
    expect(r).toEqual({ text: "ab12", failures: [] });
  });
  it("skips a filter that throws and records its name", () => {
    const r = applyFilters("ab", [
      { name: "bad", filter: () => { throw new Error("boom"); } },
      { name: "ok", filter: (s) => s.toUpperCase() },
    ]);
    expect(r).toEqual({ text: "AB", failures: ["bad"] });
  });
});

describe("composeFilters", () => {
  it("is undefined when there are no filters", () => {
    expect(composeFilters([])).toBeUndefined();
  });
  it("wraps applyFilters", () => {
    expect(composeFilters([{ name: "x", filter: (s) => s.trim() }])?.("  a ")).toEqual({ text: "a", failures: [] });
  });
});
