import { findCodeRanges, indexOutside, unclosedFence } from "./codeRegions";

/**
 * Close an unclosed code fence and an unmatched %% at the end of an embed's text,
 * so they stay confined to the embed (as in Obsidian's rendering) instead of leaking into the export.
 */
export function balanceEmbed(text: string): string {
  let out = text;
  const fence = unclosedFence(out);
  if (fence !== null) out += "\n" + fence;

  const code = findCodeRanges(out);
  let count = 0;
  for (let i = indexOutside(out, "%%", 0, code); i !== -1; i = indexOutside(out, "%%", i + 2, code)) count++;
  if (count % 2 === 1) out += "\n%%";
  return out;
}
