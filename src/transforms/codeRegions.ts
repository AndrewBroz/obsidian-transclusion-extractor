/** Half-open character range [start, end). */
export interface Range {
  start: number;
  end: number;
}

const FENCE = /^[ \t]*(?:>[ \t]?)*[ \t]*(`{3,}|~{3,})/;

export function inRanges(ranges: Range[], pos: number): boolean {
  return ranges.some((r) => pos >= r.start && pos < r.end);
}

/** Fenced code blocks and inline code spans. */
export function findCodeRanges(text: string): Range[] {
  const fenced = findFencedRanges(text);
  return mergeRanges([...fenced, ...findInlineCodeRanges(text, fenced)]);
}

/** Obsidian %%comments%% outside code. An unclosed %% produces no range. */
export function findCommentRanges(text: string, code: Range[] = findCodeRanges(text)): Range[] {
  const ranges: Range[] = [];
  let from = 0;
  for (;;) {
    const open = indexOutside(text, "%%", from, code);
    if (open === -1) break;
    const close = indexOutside(text, "%%", open + 2, code);
    if (close === -1) break;
    ranges.push({ start: open, end: close + 2 });
    from = close + 2;
  }
  return ranges;
}

/** Everything that must not be treated as live Markdown: code and comments. */
export function findProtectedRanges(text: string): Range[] {
  const code = findCodeRanges(text);
  return mergeRanges([...code, ...findCommentRanges(text, code)]);
}

function findFencedRanges(text: string): Range[] {
  const ranges: Range[] = [];
  let open: { start: number; char: string; len: number } | null = null;
  let pos = 0;
  while (pos < text.length) {
    const nl = text.indexOf("\n", pos);
    const lineEnd = nl === -1 ? text.length : nl + 1;
    const line = text.slice(pos, nl === -1 ? text.length : nl);
    const m = FENCE.exec(line);
    if (open) {
      const rest = m ? line.slice(m.index + m[0].length) : "";
      if (m && m[1][0] === open.char && m[1].length >= open.len && rest.trim() === "") {
        ranges.push({ start: open.start, end: lineEnd });
        open = null;
      }
    } else if (m) {
      open = { start: pos, char: m[1][0], len: m[1].length };
    }
    pos = lineEnd;
  }
  if (open) ranges.push({ start: open.start, end: text.length });
  return ranges;
}

function findInlineCodeRanges(text: string, skip: Range[]): Range[] {
  const ranges: Range[] = [];
  let i = 0;
  while (i < text.length) {
    const fence = skip.find((r) => i >= r.start && i < r.end);
    if (fence) {
      i = fence.end;
      continue;
    }
    if (text[i] !== "`") {
      i++;
      continue;
    }
    let n = 0;
    while (text[i + n] === "`") n++;
    const close = findBacktickRun(text, i + n, n, skip);
    if (close === -1) {
      i += n;
      continue;
    }
    ranges.push({ start: i, end: close + n });
    i = close + n;
  }
  return ranges;
}

function findBacktickRun(text: string, from: number, n: number, skip: Range[]): number {
  let j = from;
  while (j < text.length) {
    if (inRanges(skip, j)) return -1;
    if (text[j] === "`") {
      let m = 0;
      while (text[j + m] === "`") m++;
      if (m === n) return j;
      j += m;
      continue;
    }
    j++;
  }
  return -1;
}

function indexOutside(text: string, needle: string, from: number, ranges: Range[]): number {
  let i = text.indexOf(needle, from);
  while (i !== -1 && inRanges(ranges, i)) i = text.indexOf(needle, i + 1);
  return i;
}

function mergeRanges(ranges: Range[]): Range[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const out: Range[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else out.push({ ...r });
  }
  return out;
}
