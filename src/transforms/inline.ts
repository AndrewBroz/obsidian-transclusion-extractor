import { classifyLine } from "./spacing";
import { spliceEmbed } from "./splice";
import { stripBlockIds } from "./stripBlockIds";
import { normalizeNewlines, trimBlankLines } from "./text";

export interface InlineInput {
  line: string;
  start: number;
  end: number;
  /** Embed target without alias, e.g. "Note#^id". */
  target: string;
  /** The referenced block ID to drop from the copy, if the embed targets a block. */
  blockId: string | null;
  content: string;
  /** YYYY-MM-DD */
  date: string;
  prev: string | null;
  next: string | null;
}

/** Text that replaces the whole parent line when one transclusion is inlined. */
export function buildInlineReplacement(input: InlineInput): string {
  const raw = normalizeNewlines(input.content);
  const content = trimBlankLines(input.blockId ? stripBlockIds(raw, input.blockId) : raw);
  const marker = `%% inlined from [[${input.target}]] on ${input.date} %%`;
  const gap = classifyLine(content.split("\n")[0]) === "table" ? "\n" : "";
  const withMarker = content === "" ? marker : `${marker}\n${gap}${content}`;
  return spliceEmbed({
    line: input.line,
    start: input.start,
    end: input.end,
    content: withMarker,
    prev: input.prev,
    next: input.next,
  }).join("\n");
}
