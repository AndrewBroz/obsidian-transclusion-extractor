import { classifyLine, isOrderedNotOne } from "./spacing";
import { spliceEmbed } from "./splice";
import { stripBlockIds } from "./stripBlockIds";
import { normalizeNewlines, trimBlankLines } from "./text";
import { formatInlineMarker } from "./inlineMarker";

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
  const marker = formatInlineMarker(input.target, input.date);
  const firstLine = content.split("\n")[0];
  const firstLineKind = classifyLine(firstLine);
  const gap = (firstLineKind === "table" || firstLineKind === "rule" || isOrderedNotOne(firstLine)) ? "\n" : "";
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
