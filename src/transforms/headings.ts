import { findCodeRanges, inRanges } from "./codeRegions";

const HEADING = /^(#{1,6})(?=[ \t]|$)/;

export function headingLevel(line: string): number {
  const m = HEADING.exec(line);
  return m ? m[1].length : 0;
}

function eachHeading(text: string, fn: (lineStart: number, level: number) => void): void {
  const code = findCodeRanges(text);
  let pos = 0;
  for (const line of text.split("\n")) {
    const level = headingLevel(line);
    if (level > 0 && !inRanges(code, pos)) fn(pos, level);
    pos += line.length + 1;
  }
}

export function minHeadingLevel(text: string): number {
  let min = 0;
  eachHeading(text, (_, level) => {
    if (min === 0 || level < min) min = level;
  });
  return min;
}

export function lastHeadingLevel(text: string): number {
  let last = 0;
  eachHeading(text, (_, level) => {
    last = level;
  });
  return last;
}

/** How far to demote `content` so its top heading sits one level below `contextLevel`. */
export function computeShift(contextLevel: number, content: string): number {
  const min = minHeadingLevel(content);
  return min === 0 ? 0 : Math.max(0, contextLevel + 1 - min);
}

export function shiftHeadings(text: string, by: number): string {
  if (by <= 0) return text;
  const levels = new Map<number, number>();
  eachHeading(text, (start, level) => levels.set(start, level));
  let pos = 0;
  return text
    .split("\n")
    .map((line) => {
      const level = levels.get(pos);
      pos += line.length + 1;
      return level === undefined ? line : "#".repeat(Math.min(6, level + by)) + line.slice(level);
    })
    .join("\n");
}
