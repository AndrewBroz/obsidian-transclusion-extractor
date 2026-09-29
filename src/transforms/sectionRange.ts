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
