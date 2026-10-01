import { findCodeRanges, inRanges } from "./codeRegions";
import { removeSpan } from "./text";

/** Provenance marker written above inlined text, e.g. `<!-- inlined from "Note#^id" on 2026-09-30 -->`. */
export const INLINE_MARKER_RE = /<!-- inlined from "(?:[^"\\]|\\.)*" on \d{4}-\d{2}-\d{2} -->/;

export function formatInlineMarker(target: string, date: string): string {
  // `--` is not allowed inside an HTML comment, so every dash followed by a dash gets a space after it.
  const safe = target.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/-(?=-)/g, "- ");
  return `<!-- inlined from "${safe}" on ${date} -->`;
}

/** Remove markers written by Inline transclusion (outside code). Other HTML comments are kept. */
export function stripInlineMarkers(text: string): string {
  const code = findCodeRanges(text);
  const spans = [...text.matchAll(new RegExp(INLINE_MARKER_RE.source, "g"))]
    .filter((m) => !inRanges(code, m.index ?? 0))
    .map((m) => ({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length }));
  let out = text;
  for (const s of spans.reverse()) out = removeSpan(out, s.start, s.end);
  return out;
}
