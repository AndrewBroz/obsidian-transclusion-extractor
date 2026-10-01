import { describe, expect, it } from "vitest";
import { PUBLISH, SNAPSHOT } from "../src/settings";
import { splitFrontmatter, stripFrontmatter } from "../src/transforms/frontmatter";
import { runPipeline } from "../src/transforms/pipeline";

describe("frontmatter", () => {
  it("splits YAML frontmatter from the body", () => {
    expect(splitFrontmatter("---\ntitle: x\n---\nBody")).toEqual({ frontmatter: "---\ntitle: x\n---\n", body: "Body" });
  });
  it("handles empty frontmatter", () => {
    expect(stripFrontmatter("---\n---\nBody")).toBe("Body");
  });
  it("leaves text without frontmatter alone", () => {
    expect(splitFrontmatter("Body\n---\n")).toEqual({ frontmatter: "", body: "Body\n---\n" });
  });
});

describe("runPipeline", () => {
  const input = "---\nt: 1\n---\n\n# H\n\nText ^a %%x%%\n";

  it("Publish strips comments before block IDs, then drops frontmatter", () => {
    expect(runPipeline(input, PUBLISH)).toBe("# H\n\nText\n");
  });

  it("Snapshot leaves everything in place", () => {
    expect(runPipeline(input, SNAPSHOT)).toBe(input);
  });
});

describe("inline markers", () => {
  const M = '<!-- inlined from "N#^a" on 2026-09-30 -->';
  it("Publish strips new and legacy inline markers (Review Focus 2)", () => {
    const text = `${M}\nNew\n\n%% inlined from [[Old#^b]] on 2026-09-29 %%\nOld\n`;
    expect(runPipeline(text, PUBLISH)).toBe("New\n\nOld\n");
  });
  it("Snapshot keeps them", () => {
    const text = `${M}\nNew\n`;
    expect(runPipeline(text, SNAPSHOT)).toBe(text);
  });
});
