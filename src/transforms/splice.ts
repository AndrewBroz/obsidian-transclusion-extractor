import { applyPrefix, parseLinePrefix, stripQuote } from "./prefix";
import { classifyLine, isSingleParagraph, separators, toInline } from "./spacing";

export interface SpliceInput {
  line: string;
  /** Column where the embed starts in `line`. */
  start: number;
  /** Column just past the embed in `line`. */
  end: number;
  content: string;
  /** Line directly above in the output, or null at the start. */
  prev: string | null;
  /** Line directly below in the parent, or null at the end. */
  next: string | null;
}

/**
 * True when spliceEmbed, given the same `line`/`start`/`end`/`content`, would take its single-paragraph
 * mid-line branch (content spliced directly into the surrounding text rather than placed as its own
 * block). Callers that need to place something (e.g. a provenance marker) relative to the content,
 * rather than always above it, use this to mirror spliceEmbed's placement decision.
 */
export function willSpliceInline(line: string, start: number, end: number, content: string): boolean {
  const before = line.slice(0, start);
  const after = line.slice(end);
  if (classifyLine(line) === "table") return false;
  const prefix = after.trim() === "" ? parseLinePrefix(before) : null;
  if (prefix) return false;
  if (content.trim() === "") return false;
  return isSingleParagraph(content);
}

/**
 * Replace the embed at line[start, end) with `content`, returning the lines that replace `line`.
 * Text before the embed always lands in the first returned line.
 */
export function spliceEmbed({ line, start, end, content, prev, next }: SpliceInput): string[] {
  const before = line.slice(0, start);
  const after = line.slice(end);
  if (classifyLine(line) === "table") return [before + toTableCell(content) + after];
  const prefix = after.trim() === "" ? parseLinePrefix(before) : null;

  if (prefix) {
    if (content.trim() === "") return [];
    const norm = (l: string | null) => (l !== null && prefix.inQuote ? stripQuote(l) : l);
    const sep = separators(content, { prev: norm(prev), next: norm(next), inList: prefix.inList });
    return [
      ...(sep.above ? [prefix.blank] : []),
      ...applyPrefix(content.split("\n"), prefix),
      ...(sep.below ? [prefix.blank] : []),
    ];
  }

  if (content.trim() === "") {
    const head = before.replace(/[ \t]+$/, "");
    const tail = after.replace(/^[ \t]+/, "");
    return [head && tail ? `${head} ${tail}` : head + tail];
  }

  if (isSingleParagraph(content)) return [before + toInline(content) + after];

  const head = before.trimEnd();
  const tail = after.trimStart();
  const sep = separators(content, {
    prev: head.trim() ? head : prev,
    next: tail.trim() ? tail : next,
    inList: false,
  });
  return [
    ...(head.trim() ? [head] : []),
    ...(sep.above ? [""] : []),
    ...content.split("\n"),
    ...(sep.below ? [""] : []),
    ...(tail.trim() ? [tail] : []),
  ];
}

/** Content as one table-cell value: quote markers stripped, soft wraps joined by spaces, paragraphs by <br>. */
function toTableCell(content: string): string {
  const paragraphs: string[][] = [[]];
  for (const raw of content.split("\n")) {
    const line = raw.replace(/^[ \t]*(?:>[ \t]?)+/, "").trim();
    if (line === "") paragraphs.push([]);
    else paragraphs[paragraphs.length - 1].push(line);
  }
  return paragraphs
    .filter((p) => p.length > 0)
    .map((p) => p.join(" "))
    .join("<br>");
}
