import type { ExportOptions } from "../settings";
import { splitFrontmatter } from "./frontmatter";
import { stripBlockIds } from "./stripBlockIds";
import { stripComments } from "./stripComments";
import { stripInlineMarkers } from "./inlineMarker";

/** Post-expansion cleanup, in fixed order: comments, inline markers, block IDs, then frontmatter. */
export function runPipeline(text: string, opts: ExportOptions): string {
  const { frontmatter, body } = splitFrontmatter(text);
  let out = body;
  if (opts.stripComments) out = stripComments(out);
  if (opts.stripInlineMarkers) out = stripInlineMarkers(out);
  if (opts.stripBlockIds) out = stripBlockIds(out);
  return opts.keepParentFrontmatter ? frontmatter + out : out.replace(/^(?:[ \t]*\n)+/, "");
}
