/** Half-open character range [start, end). */
export interface Range {
  start: number;
  end: number;
}

const FENCE = /^[ \t]*(?:>[ \t]?)*[ \t]*(`{3,}|~{3,})/;

function getQuoteDepth(line: string): number {
  let depth = 0;
  let i = 0;
  while (i < line.length) {
    if (line[i] === " " || line[i] === "\t") {
      i++;
    } else if (line[i] === ">") {
      depth++;
      i++;
      if (i < line.length && (line[i] === " " || line[i] === "\t")) {
        i++;
      }
    } else {
      break;
    }
  }
  return depth;
}

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
  let open: { start: number; char: string; len: number; quoteDepth: number } | null = null;
  let pos = 0;
  while (pos < text.length) {
    const nl = text.indexOf("\n", pos);
    const lineEnd = nl === -1 ? text.length : nl + 1;
    const line = text.slice(pos, nl === -1 ? text.length : nl);
    const m = FENCE.exec(line);
    if (open) {
      const currentDepth = getQuoteDepth(line);
      if (currentDepth < open.quoteDepth) {
        ranges.push({ start: open.start, end: pos });
        open = null;
        if (m) {
          open = { start: pos, char: m[1][0], len: m[1].length, quoteDepth: currentDepth };
        }
      } else {
        const rest = m ? line.slice(m.index + m[0].length) : "";
        if (m && m[1][0] === open.char && m[1].length >= open.len && rest.trim() === "") {
          ranges.push({ start: open.start, end: lineEnd });
          open = null;
        }
      }
    } else if (m) {
      const quoteDepth = getQuoteDepth(line);
      open = { start: pos, char: m[1][0], len: m[1].length, quoteDepth };
    }
    pos = lineEnd;
  }
  if (open) ranges.push({ start: open.start, end: text.length });
  return ranges;
}

/** `fenced` must be sorted and non-overlapping (as findFencedRanges returns them). */
function findInlineCodeRanges(text: string, fenced: Range[]): Range[] {
  const ranges: Range[] = [];
  // Run length -> position a failed search for that length stopped at; later openers before it also fail.
  const failedUntil = new Map<number, number>();
  let f = 0;
  let i = 0;
  while (i < text.length) {
    while (f < fenced.length && fenced[f].end <= i) f++;
    const fence = fenced[f];
    if (fence && i >= fence.start) {
      i = fence.end;
      continue;
    }
    if (text[i] !== "`") {
      i++;
      continue;
    }
    let n = 0;
    while (text[i + n] === "`") n++;
    const limit = fence ? fence.start : text.length;
    if ((failedUntil.get(n) ?? -1) > i) {
      i += n;
      continue;
    }
    const found = findBacktickRun(text, i + n, n, limit);
    if (!found.ok) {
      failedUntil.set(n, found.stop);
      i += n;
      continue;
    }
    ranges.push({ start: i, end: found.pos + n });
    i = found.pos + n;
  }
  return ranges;
}

/** Finds a closing run of exactly `n` backticks before `limit`, not crossing a blank line. */
function findBacktickRun(
  text: string,
  from: number,
  n: number,
  limit: number,
): { ok: true; pos: number } | { ok: false; stop: number } {
  let j = from;
  while (j < limit) {
    const c = text[j];
    if (c === "`") {
      let m = 0;
      while (text[j + m] === "`") m++;
      if (m === n) return { ok: true, pos: j };
      j += m;
      continue;
    }
    if (c === "\n") {
      let k = j + 1;
      while (k < limit && (text[k] === " " || text[k] === "\t" || text[k] === "\r")) k++;
      if (k >= limit || text[k] === "\n") return { ok: false, stop: k };
      j = k;
      continue;
    }
    j++;
  }
  return { ok: false, stop: limit };
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
