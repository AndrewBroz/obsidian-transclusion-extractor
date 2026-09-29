import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { expandDocument } from "../src/resolver/expand";
import type { Resolve, ResolveResult } from "../src/resolver/types";
import { looksLikeAttachment } from "../src/transforms/embeds";
import { stripFrontmatter } from "../src/transforms/frontmatter";
import { PUBLISH, SNAPSHOT } from "../src/settings";
import { runPipeline } from "../src/transforms/pipeline";

const HERE = dirname(fileURLToPath(import.meta.url));
const VAULT = join(HERE, "..", "test-vault");

/**
 * Test-only resolver that emulates Obsidian's linkpath/subpath rules over the fixture
 * files on disk, without touching the `obsidian` module.
 */
function vaultFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".") || name === "expected") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) vaultFiles(full, out);
    else if (name.endsWith(".md")) out.push(relative(VAULT, full));
  }
  return out;
}

function resolveFile(linkpath: string): string | null {
  const files = vaultFiles(VAULT);
  const exact = `${linkpath}.md`;
  if (files.includes(exact)) return exact;
  const matches = files.filter((f) => basename(f) === basename(exact));
  return matches.length === 1 ? matches[0] : null;
}

/** Heading subpath "#A#B…": each segment is the next heading, nested under the previous. */
function headingBlock(lines: string[], subpath: string): string | null {
  const segments = subpath.slice(1).split("#");
  const headings = lines
    .map((line, i) => ({ i, level: (/^(#{1,6})(?:[ \t]|$)/.exec(line) ?? [])[1]?.length ?? 0, text: line.replace(/^#{1,6}[ \t]*/, "").trim() }))
    .filter((h) => h.level > 0);

  let scopeStart = 0;
  let level = 0;
  let target: (typeof headings)[number] | undefined;
  for (const seg of segments) {
    target = headings.find((h) => h.i >= scopeStart && h.level > level && h.text === seg);
    if (!target) return null;
    level = target.level;
    scopeStart = target.i + 1;
  }
  const end = headings.find((h) => h.i > target!.i && h.level <= level)?.i ?? lines.length;
  return lines.slice(target!.i, end).join("\n");
}

/** Block subpath "#^id": paragraph, list item (with children), or block before a bare id line. */
function blockSlice(lines: string[], id: string): string | null {
  const idx = lines.findIndex((l) => new RegExp(`(^|[ \\t])\\^${id}[ \\t]*$`).test(l));
  if (idx === -1) return null;
  const line = lines[idx];

  if (/^\s*\^[A-Za-z0-9-]+\s*$/.test(line)) {
    let j = idx - 1;
    while (j >= 0 && lines[j].trim() === "") j--;
    let start = j;
    while (start > 0 && lines[start - 1].trim() !== "") start--;
    return lines.slice(Math.max(start, 0), idx + 1).join("\n");
  }

  const list = /^(\s*)[-*+]\s+/.exec(line);
  if (list) {
    const indent = list[1].length;
    let end = idx + 1;
    while (end < lines.length) {
      const m = /^(\s*)\S/.exec(lines[end]);
      if (!m || m[1].length <= indent) break;
      end++;
    }
    return lines.slice(idx, end).join("\n");
  }

  let start = idx;
  let end = idx + 1;
  while (start > 0 && lines[start - 1].trim() !== "") start--;
  while (end < lines.length && lines[end].trim() !== "") end++;
  return lines.slice(start, end).join("\n");
}

function fixtureResolve(): Resolve {
  return async (ref): Promise<ResolveResult> => {
    const path = resolveFile(ref.linkpath);
    if (!path) {
      return looksLikeAttachment(ref.linkpath)
        ? { ok: false, reason: "not-markdown", target: ref.target }
        : { ok: false, reason: "missing-file", target: ref.target };
    }
    const raw = readFileSync(join(VAULT, path), "utf8").replace(/\r\n?/g, "\n");
    const key = path + ref.subpath;
    const done = (text: string): ResolveResult => ({ ok: true, text, path, key });

    if (ref.subpath === "") return done(stripFrontmatter(raw));

    const lines = raw.split("\n");
    if (ref.subpath.startsWith("#^")) {
      const slice = blockSlice(lines, ref.subpath.slice(2));
      return slice === null ? { ok: false, reason: "missing-subpath", target: ref.target } : done(slice);
    }
    const slice = headingBlock(lines, ref.subpath);
    return slice === null ? { ok: false, reason: "missing-subpath", target: ref.target } : done(slice);
  };
}

describe("fixture vault", () => {
  const resolve = fixtureResolve();
  const source = readFileSync(join(VAULT, "Assembled.md"), "utf8");

  it("resolves a missing file as missing-file (sanity check)", async () => {
    const r = await resolve({ start: 0, end: 0, raw: "", target: "Sources/Missing", linkpath: "Sources/Missing", subpath: "", alias: null }, "Assembled.md");
    expect(r).toEqual({ ok: false, reason: "missing-file", target: "Sources/Missing" });
  });

  it("matches the Publish expected output", async () => {
    const { text, warnings } = await expandDocument(source, "Assembled.md", resolve, { shiftHeadings: PUBLISH.shiftHeadings, provenance: PUBLISH.provenance });
    const out = runPipeline(text, PUBLISH);
    const expected = readFileSync(join(VAULT, "expected", "Assembled (Publish).md"), "utf8");
    expect(out).toBe(expected);
    expect(warnings).toBe(2);
  });

  it("matches the Snapshot expected output", async () => {
    const { text, warnings } = await expandDocument(source, "Assembled.md", resolve, { shiftHeadings: SNAPSHOT.shiftHeadings, provenance: SNAPSHOT.provenance });
    const out = runPipeline(text, SNAPSHOT);
    const expected = readFileSync(join(VAULT, "expected", "Assembled (Snapshot).md"), "utf8");
    expect(out).toBe(expected);
    expect(warnings).toBe(2);
  });
});
