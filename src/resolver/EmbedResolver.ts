import { App, resolveSubpath, TFile } from "obsidian";
import { looksLikeAttachment } from "../transforms/embeds";
import { stripFrontmatter } from "../transforms/frontmatter";
import { headingEndOffset, listItemEndOffset } from "../transforms/sectionRange";
import { normalizeNewlines, trimBlankLines } from "../transforms/text";
import type { Resolve, ResolveResult } from "./types";

export function createResolver(app: App): Resolve {
  return async (ref, sourcePath): Promise<ResolveResult> => {
    const file =
      ref.linkpath === ""
        ? app.vault.getAbstractFileByPath(sourcePath)
        : app.metadataCache.getFirstLinkpathDest(ref.linkpath, sourcePath);

    if (!(file instanceof TFile)) {
      return looksLikeAttachment(ref.linkpath)
        ? { ok: false, reason: "not-markdown", target: ref.target }
        : { ok: false, reason: "missing-file", target: ref.target };
    }
    if (file.extension !== "md") return { ok: false, reason: "not-markdown", target: ref.target };

    // Slice the RAW text with cached offsets, then normalize (Review Focus 3).
    const raw = await app.vault.cachedRead(file);
    const key = file.path + ref.subpath;
    const done = (slice: string): ResolveResult => ({ ok: true, text: trimBlankLines(normalizeNewlines(slice)), path: file.path, key });

    if (ref.subpath === "") return done(stripFrontmatter(raw));

    const cache = app.metadataCache.getFileCache(file);
    const sub = cache ? resolveSubpath(cache, ref.subpath) : null;
    if (!cache || !sub) return { ok: false, reason: "missing-subpath", target: ref.target };

    if (sub.type === "heading") {
      const headings = cache.headings ?? [];
      const start = sub.current.position.start.offset;
      const index = headings.findIndex((h) => h.position.start.offset === start);
      return done(raw.slice(start, headingEndOffset(headings, index, raw.length)));
    }
    if (sub.type === "block") {
      const start = sub.block.position.start.offset;
      let end = sub.block.position.end.offset;
      if (sub.list && cache.listItems) end = Math.max(end, listItemEndOffset(cache.listItems, sub.list.position.start.line));
      return done(raw.slice(start, end));
    }
    return { ok: false, reason: "missing-subpath", target: ref.target };
  };
}
