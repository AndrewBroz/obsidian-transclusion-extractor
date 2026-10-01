import { App, Editor, moment, Notice, TFile } from "obsidian";
import { applyFilters, getContentFilters } from "../filters/contentFilters";
import { createResolver } from "../resolver/EmbedResolver";
import { flushEditors } from "../resolver/freshness";
import { blockIdOf, embedAt, EmbedRef, looksLikeAttachment } from "../transforms/embeds";
import { buildInlineReplacement } from "../transforms/inline";

export interface EmbedHit {
  ref: EmbedRef;
  line: number;
  lineStart: number;
}

export function embedUnderCursor(editor: Editor): EmbedHit | null {
  const cursor = editor.getCursor();
  const ref = embedAt(editor.getValue(), editor.posToOffset(cursor));
  if (!ref || editor.offsetToPos(ref.start).line !== cursor.line) return null;
  return { ref, line: cursor.line, lineStart: editor.posToOffset({ line: cursor.line, ch: 0 }) };
}

/** Builds an EmbedHit for a ref located some other way than the cursor (e.g. from a rendered widget). */
export function embedHitAt(editor: Editor, ref: EmbedRef): EmbedHit {
  const line = editor.offsetToPos(ref.start).line;
  return { ref, line, lineStart: editor.posToOffset({ line, ch: 0 }) };
}

/** False when the embed points at an attachment (image, PDF…), where inlining makes no sense. */
export function isNoteEmbed(app: App, ref: EmbedRef, sourcePath: string): boolean {
  const dest = ref.linkpath === "" ? null : app.metadataCache.getFirstLinkpathDest(ref.linkpath, sourcePath);
  return dest ? dest.extension === "md" : !looksLikeAttachment(ref.linkpath);
}

const FAILURE = {
  "missing-file": "not found",
  "missing-subpath": "not found",
  "not-markdown": "is not a note",
} as const;

export async function inlineEmbed(
  app: App,
  editor: Editor,
  file: TFile,
  hit: EmbedHit | null = embedUnderCursor(editor),
): Promise<void> {
  if (!hit) return;
  const lineText = editor.getLine(hit.line);

  await flushEditors(app);
  const result = await createResolver(app)(hit.ref, file.path);
  if (!result.ok) {
    new Notice(`Can't inline: ${hit.ref.target} ${FAILURE[result.reason]}`);
    return;
  }
  if (editor.getLine(hit.line) !== lineText) {
    new Notice("Can't inline: the line changed while the transclusion was being resolved. Try again.");
    return;
  }

  const filtered = applyFilters(result.text, getContentFilters(app));
  if (filtered.failures.length > 0) new Notice("Inkling couldn't clean this transclusion; inlined as-is.");
  if (filtered.text.trim() === "") {
    new Notice("The original text of this transclusion is empty; only the marker was inserted.");
  }

  const replacement = buildInlineReplacement({
    line: lineText,
    start: hit.ref.start - hit.lineStart,
    end: hit.ref.end - hit.lineStart,
    target: hit.ref.target,
    blockId: blockIdOf(hit.ref.subpath),
    content: filtered.text,
    // Obsidian's `moment` re-export types as a namespace without a call signature under TS 7 +
    // esModuleInterop, even though it is callable at runtime (moment.d.ts uses `export = moment`
    // on a callable function/namespace). Cast to call it; behavior is unaffected.
    date: (moment as unknown as () => { format(fmt: string): string })().format("YYYY-MM-DD"),
    prev: hit.line > 0 ? editor.getLine(hit.line - 1) : null,
    next: hit.line < editor.lastLine() ? editor.getLine(hit.line + 1) : null,
  });
  editor.replaceRange(replacement, { line: hit.line, ch: 0 }, { line: hit.line, ch: lineText.length });
}
