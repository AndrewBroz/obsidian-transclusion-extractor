import { findCodeRanges, inRanges, Range } from "./codeRegions";
import { removeSpan } from "./text";

/**
 * Remove block IDs (` ^id` at the end of a line, outside code). With `only`, remove just
 * that ID. A line holding nothing but the ID is removed entirely.
 */
export function stripBlockIds(text: string, only?: string): string {
  const id = only ? only.replace(/[^A-Za-z0-9-]/g, "") : "[A-Za-z0-9-]+";
  const pattern = new RegExp(`(^|[ \\t]+)\\^${id}[ \\t]*$`, "gm");
  const code = findCodeRanges(text);
  const spans: Range[] = [];
  for (const m of text.matchAll(pattern)) {
    const start = m.index ?? 0;
    if (inRanges(code, start + m[1].length)) continue;
    spans.push({ start, end: start + m[0].length });
  }
  let out = text;
  for (const s of spans.reverse()) out = removeSpan(out, s.start, s.end);
  return out;
}
