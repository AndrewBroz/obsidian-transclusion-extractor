export function normalizeNewlines(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

/** Drop leading and trailing whitespace-only lines. */
export function trimBlankLines(text: string): string {
  if (text.trim() === "") return "";
  return text.replace(/^(?:[ \t]*\n)+/, "").replace(/(?:\n[ \t]*)+$/, "");
}

/**
 * Remove text[start, end). If nothing but whitespace (or quote markers) would remain
 * on the affected line(s), remove the whole line(s); if that leaves two blank lines
 * touching, drop one of them.
 */
export function removeSpan(text: string, start: number, end: number): string {
  const lineStart = text.lastIndexOf("\n", start - 1) + 1;
  const nl = text.indexOf("\n", end);
  const lineEnd = nl === -1 ? text.length : nl;
  const before = text.slice(lineStart, start);
  const after = text.slice(end, lineEnd);
  if (/^[\s>]*$/.test(before) && after.trim() === "") return removeLines(text, lineStart, lineEnd);
  let s = start;
  if (text[s - 1] === " " && (text[end] === " " || end === lineEnd)) s--;
  return text.slice(0, s) + text.slice(end);
}

function removeLines(text: string, lineStart: number, lineEnd: number): string {
  const lines = text.split("\n");
  const first = text.slice(0, lineStart).split("\n").length - 1;
  const last = text.slice(0, lineEnd).split("\n").length - 1;
  lines.splice(first, last - first + 1);
  if (first > 0 && first < lines.length && lines[first - 1].trim() === "" && lines[first].trim() === "") {
    lines.splice(first, 1);
  }
  return lines.join("\n");
}
