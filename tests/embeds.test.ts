import { describe, expect, it } from "vitest";
import { blockIdOf, embedAt, findEmbeds, looksLikeAttachment } from "../src/transforms/embeds";

describe("findEmbeds", () => {
  it("parses note, heading, block and alias forms", () => {
    const [a, b, c] = findEmbeds("![[Note]] ![[Note#Head]] ![[Dir/Note#^id|Alias]]");
    expect(a).toMatchObject({ start: 0, end: 9, target: "Note", linkpath: "Note", subpath: "", alias: null });
    expect(b).toMatchObject({ target: "Note#Head", linkpath: "Note", subpath: "#Head" });
    expect(c).toMatchObject({ target: "Dir/Note#^id", linkpath: "Dir/Note", subpath: "#^id", alias: "Alias" });
  });

  it("finds an embed between two stray backticks in separate paragraphs", () => {
    const refs = findEmbeds("Press the ` key.\n\n![[Note]]\n\nThen ` again.");
    expect(refs.map((r) => r.target)).toEqual(["Note"]);
  });

  it("keeps nested heading paths in the subpath", () => {
    expect(findEmbeds("![[Note#A#B]]")[0].subpath).toBe("#A#B");
  });

  it("parses an escaped pipe used inside table cells (Review Focus 2)", () => {
    const [e] = findEmbeds("| ![[Note\\|alias]] |");
    expect(e).toMatchObject({ target: "Note", linkpath: "Note", alias: "alias" });
  });

  it("ignores plain wikilinks", () => {
    expect(findEmbeds("[[Note]]")).toEqual([]);
  });

  it("skips embeds inside code and comments", () => {
    expect(findEmbeds("`![[A]]` %% ![[B]] %%\n```\n![[C]]\n```\n![[D]]").map((e) => e.target)).toEqual(["D"]);
  });

  it("does not match across lines", () => {
    expect(findEmbeds("![[A\nB]]")).toEqual([]);
  });
});

describe("embedAt", () => {
  const text = "x ![[A]] y";
  it("finds the embed at or touching the offset", () => {
    expect(embedAt(text, 2)?.target).toBe("A");
    expect(embedAt(text, 8)?.target).toBe("A");
  });
  it("returns null outside embeds", () => {
    expect(embedAt(text, 0)).toBeNull();
  });
});

describe("helpers", () => {
  it("blockIdOf extracts block IDs only", () => {
    expect(blockIdOf("#^abc")).toBe("abc");
    expect(blockIdOf("#Heading")).toBeNull();
    expect(blockIdOf("")).toBeNull();
  });
  it("looksLikeAttachment recognises non-note extensions", () => {
    expect(looksLikeAttachment("diagram.png")).toBe(true);
    expect(looksLikeAttachment("paper.PDF")).toBe(true);
    expect(looksLikeAttachment("Note")).toBe(false);
    expect(looksLikeAttachment("Note.v2")).toBe(false);
    expect(looksLikeAttachment("Note.md")).toBe(false);
  });
});
