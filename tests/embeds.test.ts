import { describe, expect, it } from "vitest";
import { blockIdOf, embedAt, embedForWidget, findEmbeds, looksLikeAttachment } from "../src/transforms/embeds";

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

describe("embedForWidget", () => {
  it("returns the only embed in range when src is not provided", () => {
    const text = "prefix ![[Solo]] suffix";
    expect(embedForWidget(text, 0, text.length, null)?.target).toBe("Solo");
  });

  it("picks between two embeds on a line by matching src", () => {
    const text = "See ![[Sources/Deep#^d1]] and ![[Sources/Quotes#^q1]] together.";
    expect(embedForWidget(text, 0, text.length, "Sources/Quotes#^q1")?.target).toBe("Sources/Quotes#^q1");
    expect(embedForWidget(text, 0, text.length, "Sources/Deep#^d1")?.target).toBe("Sources/Deep#^d1");
  });

  it("matches src with a heading subpath", () => {
    const text = "![[A#Head]] ![[B]]";
    expect(embedForWidget(text, 0, text.length, "A#Head")?.target).toBe("A#Head");
  });

  it("matches src with a block subpath", () => {
    const text = "![[A#^id]] ![[B]]";
    expect(embedForWidget(text, 0, text.length, "A#^id")?.target).toBe("A#^id");
  });

  it("matches src against the target without the alias", () => {
    const text = "![[Note|Alias]] ![[Other]]";
    expect(embedForWidget(text, 0, text.length, "Note")?.target).toBe("Note");
  });

  it("returns null when the widget range has no embeds", () => {
    const text = "just text\nmore text";
    expect(embedForWidget(text, 0, 9, null)).toBeNull();
  });

  it("returns null when src matches nothing (no guessing fallback)", () => {
    const text = "![[A]] and ![[B]]";
    expect(embedForWidget(text, 0, text.length, "NoSuchTarget")).toBeNull();
  });

  it("returns null when src is not provided and more than one candidate exists (ambiguous)", () => {
    const text = "![[A]] and ![[B]]";
    expect(embedForWidget(text, 0, text.length, null)).toBeNull();
  });

  it("finds a callout embed within a wider widget range by src", () => {
    // `from` is the "> [!tip]" line start (as posAtDOM would report for the enclosing callout
    // widget); `to` extends past the embed's own line.
    const text = "> [!tip]\n> ![[Sources/Quotes#^q2]]\n";
    const from = 0;
    const to = text.length;
    expect(embedForWidget(text, from, to, "Sources/Quotes#^q2")?.target).toBe("Sources/Quotes#^q2");
  });

  it("never returns an embed on the line above the widget range", () => {
    const text = "![[Above]]\n> [!tip]\n> ![[Sources/Quotes#^q2]]\n";
    const from = text.indexOf("> [!tip]");
    const to = text.indexOf("\n", text.indexOf("q2]]"));
    expect(embedForWidget(text, from, to, null)?.target).toBe("Sources/Quotes#^q2");
    expect(embedForWidget(text, from, to, "NoSuchTarget")).toBeNull();
  });

  it("uses the end of the line containing `from` when `to` is narrower", () => {
    const text = "![[Solo]] trailing text";
    // `to` stops right after the embed itself, well short of the line's actual end.
    const to = text.indexOf("![[Solo]]") + "![[Solo]]".length;
    expect(embedForWidget(text, 0, to, null)?.target).toBe("Solo");
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
