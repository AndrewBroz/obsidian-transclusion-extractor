import { describe, expect, it } from "vitest";
import { applyFilters, composeFilters, getContentFilters, NamedFilter } from "../src/filters/contentFilters";

const appWithPlugins = (plugins: Record<string, unknown>) => ({ plugins: { getPlugin: (id: string) => plugins[id] ?? null } });
const appWith = (plugin: unknown) => appWithPlugins({ "inkling-markup": plugin });
const inkling = { api: { version: 1, toOriginalText: (md: string) => md.replace(/\{\+\+.*?\+\+\}/g, "") } };

describe("getContentFilters", () => {
  it("offers Inkling's toOriginalText when Inkling exposes api v1+", () => {
    const filters = getContentFilters(appWith(inkling));
    expect(filters.map((f) => f.name)).toEqual(["inkling"]);
    expect(filters[0].filter("a{++b++}c")).toBe("ac");
  });
  it("falls back to Inkling's pre-0.12 plugin id", () => {
    const filters = getContentFilters(appWithPlugins({ inkling }));
    expect(filters.map((f) => f.name)).toEqual(["inkling"]);
    expect(filters[0].filter("a{++b++}c")).toBe("ac");
  });
  it("prefers the current plugin id over the pre-0.12 one", () => {
    const legacy = { api: { version: 1, toOriginalText: () => "legacy" } };
    const [f] = getContentFilters(appWithPlugins({ "inkling-markup": inkling, inkling: legacy }));
    expect(f.filter("a{++b++}c")).toBe("ac");
  });
  it("ignores an unrelated plugin installed under the old id", () => {
    expect(getContentFilters(appWithPlugins({ inkling: { api: { draw: () => {} } } }))).toEqual([]);
    expect(getContentFilters(appWithPlugins({ inkling: {} }))).toEqual([]);
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

describe("applyFilters — code protection", () => {
  const stripAdditions: NamedFilter = { name: "strip", filter: (md) => md.replace(/\{\+\+.*?\+\+\}/g, "") };

  it("leaves CriticMarkup-looking text inside inline code alone", () => {
    const r = applyFilters("Use `{++x++}` here {++gone++}", [stripAdditions]);
    expect(r).toEqual({ text: "Use `{++x++}` here ", failures: [] });
  });

  it("leaves CriticMarkup-looking text inside a fenced block alone", () => {
    const text = "before\n```\n{++x++}\n```\nafter {++gone++}";
    const r = applyFilters(text, [stripAdditions]);
    expect(r).toEqual({ text: "before\n```\n{++x++}\n```\nafter ", failures: [] });
  });

  it("removes an addition that contains inline code, entirely", () => {
    const r = applyFilters("{++see `x`++} y", [stripAdditions]);
    expect(r).toEqual({ text: " y", failures: [] });
  });

  it("behaves exactly as before when there is no code", () => {
    const r = applyFilters("{++a++} and {++b++}", [stripAdditions]);
    expect(r).toEqual({ text: " and ", failures: [] });
  });

  const identity: NamedFilter = { name: "id", filter: (s) => s };

  it("round-trips code containing a literal <1> through an identity filter", () => {
    const text = "```cpp\nauto y = std::get<1>(t);\n```\n\nUse `x` here.";
    expect(applyFilters(text, [identity])).toEqual({ text, failures: [] });
  });

  it("round-trips prose containing a literal <0> through an identity filter", () => {
    const text = "Press <0> then `run`.";
    expect(applyFilters(text, [identity])).toEqual({ text, failures: [] });
  });

  it("skips masking entirely when the text already contains a placeholder character", () => {
    const text = "weird text with `code`";
    expect(applyFilters(text, [identity])).toEqual({ text, failures: [] });
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
