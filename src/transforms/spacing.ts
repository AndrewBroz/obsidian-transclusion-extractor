export type LineKind = "blank" | "heading" | "fence" | "quote" | "table" | "rule" | "list" | "paragraph" | "other";

export function classifyLine(line: string | null): LineKind {
  if (line === null || line.trim() === "") return "blank";
  if (/^ {0,3}#{1,6}(?:[ \t]|$)/.test(line)) return "heading";
  if (/^[ \t]*\[![\w-]+\][+-]?/.test(line)) return "heading"; // callout title, quote markers already stripped
  if (/^[ \t]*(?:`{3,}|~{3,})/.test(line)) return "fence";
  if (/^[ \t]*>/.test(line)) return "quote";
  if (/^[ \t]*\|/.test(line)) return "table";
  if (/^[ \t]*(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/.test(line)) return "rule";
  if (/^[ \t]*(?:[-*+]|\d+[.)])(?:[ \t]|$)/.test(line)) return "list";
  if (/^[ \t]*\^[A-Za-z0-9-]+[ \t]*$/.test(line)) return "other";
  return "paragraph";
}

/**
 * Would a line of kind `lower`, placed directly under a line of kind `upper`,
 * be absorbed into (or change the meaning of) the block above?
 */
export function wouldMerge(upper: LineKind, lower: LineKind): boolean {
  if (upper === "blank" || lower === "blank") return false;
  if (lower === "table") return true;
  if (lower === "rule") return upper === "paragraph";
  if (lower === "paragraph") return upper === "paragraph" || upper === "list" || upper === "table" || upper === "quote";
  return false;
}

export interface JoinContext {
  prev: string | null;
  next: string | null;
  inList: boolean;
}

export function separators(content: string, ctx: JoinContext): { above: boolean; below: boolean } {
  if (ctx.inList) return { above: false, below: false };
  const lines = content.split("\n");
  return {
    above: wouldMerge(classifyLine(ctx.prev), classifyLine(lines[0])),
    below: wouldMerge(classifyLine(lines[lines.length - 1]), classifyLine(ctx.next)),
  };
}

export function isSingleParagraph(content: string): boolean {
  return content.split("\n").every((l) => classifyLine(l) === "paragraph");
}

export function toInline(content: string): string {
  return content
    .split("\n")
    .map((l) => l.trim())
    .join(" ");
}
