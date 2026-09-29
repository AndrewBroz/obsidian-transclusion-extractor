import { findCommentRanges } from "./codeRegions";
import { removeSpan } from "./text";

/** Remove Obsidian %%comments%%. A comment that fills its line(s) removes those lines. */
export function stripComments(text: string): string {
  let out = text;
  for (const r of [...findCommentRanges(text)].reverse()) out = removeSpan(out, r.start, r.end);
  return out;
}
