export interface Loc {
  line: number;
  offset: number;
}

export interface HeadingLike {
  level: number;
  position: { start: Loc };
}

export interface ListItemLike {
  /** Line of the parent list item; negative for top-level items. */
  parent: number;
  position: { start: Loc; end: Loc };
}

/** End offset of the section started by headings[index]: the next heading of equal or higher level. */
export function headingEndOffset(headings: HeadingLike[], index: number, textLength: number): number {
  const level = headings[index].level;
  for (let j = index + 1; j < headings.length; j++) {
    if (headings[j].level <= level) return headings[j].position.start.offset;
  }
  return textLength;
}

/** End offset of the list item on `rootLine`, including all of its descendant items. */
export function listItemEndOffset(items: ListItemLike[], rootLine: number): number {
  const members = new Set([rootLine]);
  let end = -1;
  const sorted = [...items].sort((a, b) => a.position.start.line - b.position.start.line);
  for (const item of sorted) {
    const line = item.position.start.line;
    if (line === rootLine || (line > rootLine && members.has(item.parent))) {
      members.add(line);
      end = Math.max(end, item.position.end.offset);
    }
  }
  return end;
}

/** Whether a slice taken at cached heading offsets really starts with that heading (guards stale caches). */
export function sliceMatchesHeading(slice: string, headingText: string): boolean {
  const m = /^[ \t]*#+[ \t]+([^\r\n]*)/.exec(slice);
  return m !== null && m[1].trim().startsWith(headingText.trim());
}

/** Whether a slice taken at cached block offsets contains the block's ^id marker (guards stale caches). */
export function sliceHasBlockId(slice: string, id: string): boolean {
  return slice.includes("^" + id);
}

/** Remove the first line's leading whitespace from the start of every line that has it. */
export function dedentBlock(slice: string): string {
  const indent = /^[ \t]*/.exec(slice)![0];
  if (indent === "") return slice;
  return slice
    .split("\n")
    .map((line) => (line.startsWith(indent) ? line.slice(indent.length) : line))
    .join("\n");
}
