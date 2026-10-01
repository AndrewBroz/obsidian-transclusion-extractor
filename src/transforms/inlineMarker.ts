/** Provenance marker written above inlined text, e.g. `<!-- inlined from "Note#^id" on 2026-09-30 -->`. */
export const INLINE_MARKER_RE = /<!-- inlined from "(?:[^"\\]|\\.)*" on \d{4}-\d{2}-\d{2} -->/g;

export function formatInlineMarker(target: string, date: string): string {
  // `--` is not allowed inside an HTML comment, so every dash followed by a dash gets a space after it.
  const safe = target.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/-(?=-)/g, "- ");
  return `<!-- inlined from "${safe}" on ${date} -->`;
}
