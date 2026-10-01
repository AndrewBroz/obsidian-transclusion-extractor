import { describe, expect, it } from "vitest";
import { expandDocument } from "../src/resolver/expand";
import type { Resolve } from "../src/resolver/types";

function fakeResolve(files: Record<string, string>): Resolve {
  return async (ref) => {
    if (/\.(png|pdf)$/.test(ref.linkpath)) return { ok: false, reason: "not-markdown", target: ref.target };
    const key = ref.linkpath + ref.subpath;
    if (!(key in files)) return { ok: false, reason: "missing-file", target: ref.target };
    return { ok: true, text: files[key], path: ref.linkpath, key };
  };
}

const OPTS = { shiftHeadings: true, provenance: false };
const expand = (doc: string, files: Record<string, string>, opts = OPTS) => expandDocument(doc, "Root", fakeResolve(files), opts);

describe("expandDocument", () => {
  it("replaces a block embed and removes the referenced block ID", async () => {
    const r = await expand("Intro\n\n![[N#^a]]\n\nEnd", { "N#^a": "Hello ^a" });
    expect(r).toEqual({ text: "Intro\n\nHello\n\nEnd", warnings: 0 });
  });

  it("removes the referenced block ID even when splicing mid-line (Review Focus 1)", async () => {
    expect((await expand("Say ![[N#^a]] now", { "N#^a": "Hello ^a" })).text).toBe("Say Hello now");
  });

  it("expands nested embeds", async () => {
    const files = { Outer: "Outer text\n\n![[Inner#^i]]", "Inner#^i": "Inner text ^i" };
    expect((await expand("![[Outer]]", files)).text).toBe("Outer text\n\nInner text");
  });

  it("stops at cycles with a warning callout", async () => {
    const files = { A: "A text\n\n![[B]]", B: "B text\n\n![[A]]" };
    expect(await expand("![[A]]", files)).toEqual({
      text: "A text\n\nB text\n\n> **Circular transclusion:** A",
      warnings: 1,
    });
  });

  it("marks a missing target inside a table cell in bold, keeping the row", async () => {
    expect(await expand("| ![[Nope]] | b |", {})).toEqual({ text: "| **Missing: Nope** | b |", warnings: 1 });
  });

  it("marks a cycle inside a table cell in bold", async () => {
    expect(await expand("![[A]]", { A: "| ![[A]] | b |" })).toEqual({ text: "| **Circular transclusion: A** | b |", warnings: 1 });
  });

  it("confines an unbalanced comment or fence to its embed", async () => {
    expect((await expand("![[A]]\n\nAfter", { A: "Text %% oops" })).text).toBe("Text %% oops\n%%\n\nAfter");
    expect((await expand("![[A]]\n\nAfter", { A: "```\ncode" })).text).toBe("```\ncode\n```\n\nAfter");
  });

  it("marks missing targets and counts them", async () => {
    expect(await expand("A\n\n![[Nope#^x]]", {})).toEqual({ text: "A\n\n> **Missing:** Nope#^x", warnings: 1 });
  });

  it("leaves non-note embeds verbatim", async () => {
    expect(await expand("![[pic.png]]", {})).toEqual({ text: "![[pic.png]]", warnings: 0 });
  });

  it("demotes embedded headings under the surrounding heading", async () => {
    const files = { "N#S": "## S\n\nBody\n\n### Sub\n\nMore" };
    expect((await expand("### Ctx\n\n![[N#S]]", files)).text).toBe("### Ctx\n\n#### S\n\nBody\n\n##### Sub\n\nMore");
    expect((await expand("### Ctx\n\n![[N#S]]", files, { ...OPTS, shiftHeadings: false })).text).toBe(
      "### Ctx\n\n## S\n\nBody\n\n### Sub\n\nMore",
    );
  });

  it("does not take heading context from lines inside code (Review Focus 4)", async () => {
    expect((await expand("```\n# not a heading\n```\n![[N#S]]", { "N#S": "# S" })).text).toBe("```\n# not a heading\n```\n# S");
  });

  it("wraps content in provenance comments when enabled", async () => {
    expect((await expand("![[N#^a]]", { "N#^a": "Hello ^a" }, { ...OPTS, provenance: true })).text).toBe(
      "<!-- from: N#^a -->\nHello\n<!-- /from -->",
    );
  });

  it("keeps parent frontmatter untouched", async () => {
    expect((await expand("---\nt: 1\n---\n![[N#^a]]", { "N#^a": "Hello ^a" })).text).toBe("---\nt: 1\n---\nHello");
  });

  it("normalizes CRLF in parent and target (Review Focus 3)", async () => {
    expect((await expand("Intro\r\n\r\n![[N#^a]]\r\n", { "N#^a": "Hello ^a\r\n" })).text).toBe("Intro\n\nHello\n");
  });

  it("does not expand embeds inside code", async () => {
    const doc = "```\n![[N#^a]]\n```";
    expect((await expand(doc, { "N#^a": "Hello" })).text).toBe(doc);
  });

  it("expands several embeds on one line", async () => {
    const files = { "N#^a": "Hello ^a", "N#^b": "World ^b" };
    expect((await expand("![[N#^a]] and ![[N#^b]]", files)).text).toBe("Hello and World");
  });

  const dropAdditions = (md: string) => ({ text: md.replace(/\{\+\+[\s\S]*?\+\+\}/g, ""), failures: [] as string[] });

  it("filters the parent document before expanding", async () => {
    const r = await expandDocument("Keep {++x++}this", "Root", fakeResolve({}), { ...OPTS, filter: dropAdditions });
    expect(r).toEqual({ text: "Keep this", warnings: 0 });
  });

  it("filters each embed's text", async () => {
    const r = await expandDocument("![[N#^a]]", "Root", fakeResolve({ "N#^a": "Hello {++big ++}world ^a" }), { ...OPTS, filter: dropAdditions });
    expect(r.text).toBe("Hello world");
  });

  it("does not resolve an embed removed by the filter (Review Focus 5)", async () => {
    const seen: string[] = [];
    const base = fakeResolve({ "N#^a": "Hello ^a" });
    const resolve: Resolve = async (ref, src) => (seen.push(ref.target), base(ref, src));
    const r = await expandDocument("A {++![[N#^a]]++}B", "Root", resolve, { ...OPTS, filter: dropAdditions });
    expect(r.text).toBe("A B");
    expect(seen).toEqual([]);
  });

  it("reports a failing filter as a warning and keeps the unfiltered text (Review Focus 4)", async () => {
    const failing = (md: string) => ({ text: md, failures: ["inkling"] });
    const r = await expandDocument("![[N#^a]]", "Root", fakeResolve({ "N#^a": "Hello ^a" }), { ...OPTS, filter: failing });
    expect(r).toEqual({
      text: "> **Filter failed (inkling):** document\n\n> **Filter failed (inkling):** N#^a\n\nHello",
      warnings: 2,
    });
  });

  it("renders a filter failure inside a table row as bold text", async () => {
    const failing = (md: string) => ({ text: md, failures: ["inkling"] });
    const r = await expandDocument("x\n\n| ![[N#^a]] | b |", "Root", fakeResolve({ "N#^a": "Hello ^a" }), { ...OPTS, filter: (md) => (md.startsWith("x") ? { text: md, failures: [] } : failing(md)) });
    expect(r.text).toBe("x\n\n| **Filter failed (inkling): N#^a** Hello | b |");
  });
});
