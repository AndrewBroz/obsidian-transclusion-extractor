import { findCodeRanges, inRanges } from "../transforms/codeRegions";
import { blockIdOf, EmbedRef, findEmbeds } from "../transforms/embeds";
import { splitFrontmatter } from "../transforms/frontmatter";
import { computeShift, lastHeadingLevel, shiftHeadings } from "../transforms/headings";
import { spliceEmbed } from "../transforms/splice";
import { stripBlockIds } from "../transforms/stripBlockIds";
import { normalizeNewlines, trimBlankLines } from "../transforms/text";
import type { Resolve } from "./types";

export interface ExpandOptions {
  shiftHeadings: boolean;
  provenance: boolean;
}

export interface ExpandResult {
  text: string;
  warnings: number;
}

interface State {
  warnings: number;
}

export async function expandDocument(text: string, sourcePath: string, resolve: Resolve, opts: ExpandOptions): Promise<ExpandResult> {
  const { frontmatter, body } = splitFrontmatter(normalizeNewlines(text));
  const state: State = { warnings: 0 };
  const expanded = await expandText(body, sourcePath, [sourcePath], resolve, opts, state);
  return { text: frontmatter + expanded, warnings: state.warnings };
}

async function expandText(
  text: string,
  sourcePath: string,
  chain: string[],
  resolve: Resolve,
  opts: ExpandOptions,
  state: State,
): Promise<string> {
  const embeds = findEmbeds(text);
  if (embeds.length === 0) return text;
  const code = findCodeRanges(text);
  const lines = text.split("\n");
  const out: string[] = [];
  let context = 0;
  let lineStart = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineEnd = lineStart + line.length;
    const onLine = embeds.filter((e) => e.start >= lineStart && e.end <= lineEnd);
    let result = [line];
    for (const e of [...onLine].reverse()) {
      const content = await contentFor(e, context);
      if (content === null) continue;
      const [first, ...rest] = result;
      const spliced = spliceEmbed({
        line: first,
        start: e.start - lineStart,
        end: e.end - lineStart,
        content,
        prev: out.length > 0 ? out[out.length - 1] : null,
        next: rest.length > 0 ? rest[0] : (lines[i + 1] ?? null),
      });
      result = [...spliced, ...rest];
    }
    out.push(...result);
    if (!inRanges(code, lineStart)) context = lastHeadingLevel(result.join("\n")) || context;
    lineStart = lineEnd + 1;
  }
  return out.join("\n");

  async function contentFor(e: EmbedRef, contextLevel: number): Promise<string | null> {
    const r = await resolve(e, sourcePath);
    if (!r.ok) {
      if (r.reason === "not-markdown") return null;
      state.warnings++;
      return `> [!warning] Missing: ${e.target}`;
    }
    if (chain.includes(r.key)) {
      state.warnings++;
      return `> [!warning] Circular transclusion: ${e.target}`;
    }
    const raw = normalizeNewlines(r.text);
    const id = blockIdOf(e.subpath);
    const own = trimBlankLines(id ? stripBlockIds(raw, id) : raw);
    let content = await expandText(own, r.path, [...chain, r.key], resolve, opts, state);
    if (opts.shiftHeadings) content = shiftHeadings(content, computeShift(contextLevel, content));
    if (opts.provenance) content = `<!-- from: ${e.target} -->\n${content}\n<!-- /from -->`;
    return content;
  }
}
