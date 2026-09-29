export interface LinePrefix {
  /** Prefix for the first inserted line: the original text before the embed. */
  first: string;
  /** Prefix for following non-blank lines. */
  rest: string;
  /** What a blank line becomes: "" or the quote markers, e.g. ">". */
  blank: string;
  inList: boolean;
  inQuote: boolean;
}

const PREFIX = /^([ \t]*(?:>[ \t]?)*)([ \t]*)((?:[-*+]|\d+[.)])[ \t]+(?:\[[^\]]\][ \t]+)?)?$/;

/** Returns null when `before` holds real text, not just quote/indent/list markers. */
export function parseLinePrefix(before: string): LinePrefix | null {
  const m = PREFIX.exec(before);
  if (!m) return null;
  const [, quote, indent, marker = ""] = m;
  const inQuote = quote.includes(">");
  return {
    first: before,
    rest: quote + indent + " ".repeat(marker.length),
    blank: inQuote ? quote.trimEnd() : "",
    inList: marker !== "" || (!inQuote && (quote + indent).length > 0),
    inQuote,
  };
}

export function applyPrefix(lines: string[], p: LinePrefix): string[] {
  return lines.map((line, i) => (i === 0 ? p.first + line : line.trim() === "" ? p.blank : p.rest + line));
}

export function stripQuote(line: string): string {
  return line.replace(/^[ \t]*(?:>[ \t]?)*/, "");
}
