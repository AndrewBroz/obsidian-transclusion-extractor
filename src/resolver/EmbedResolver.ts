import { App, CachedMetadata, resolveSubpath, TFile } from "obsidian";
import { looksLikeAttachment } from "../transforms/embeds";
import { stripFrontmatter } from "../transforms/frontmatter";
import { headingEndOffset, listItemEndOffset, sliceHasBlockId, sliceMatchesHeading } from "../transforms/sectionRange";
import { normalizeNewlines, trimBlankLines } from "../transforms/text";
import { waitForCacheChange } from "./freshness";
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
    const key = file.path + ref.subpath;
    const done = (slice: string): ResolveResult => ({ ok: true, text: trimBlankLines(normalizeNewlines(slice)), path: file.path, key });

    if (ref.subpath === "") return done(stripFrontmatter(await app.vault.cachedRead(file)));

    // The cache may be missing (just opened) or stale (changed on disk): validate, else wait once and retry.
    const first = sliceSubpath(await app.vault.cachedRead(file), app.metadataCache.getFileCache(file), ref.subpath);
    if (typeof first === "string") return done(first);
    if (first === MISSING) return { ok: false, reason: "missing-subpath", target: ref.target };
    await waitForCacheChange(app, file, CACHE_WAIT_MS);
    const second = sliceSubpath(await app.vault.cachedRead(file), app.metadataCache.getFileCache(file), ref.subpath);
    if (typeof second === "string") return done(second);
    return { ok: false, reason: "missing-subpath", target: ref.target };
  };
}

const CACHE_WAIT_MS = 2000;
const MISSING = Symbol("missing");
const STALE = Symbol("stale");

/**
 * The raw text of a heading section or block; MISSING if the cache has no such subpath;
 * STALE if there is no cache yet or its offsets don't match `raw`.
 */
function sliceSubpath(raw: string, cache: CachedMetadata | null, subpath: string): string | typeof MISSING | typeof STALE {
  if (!cache) return STALE;
  const sub = resolveSubpath(cache, subpath);
  if (!sub) return MISSING;

  if (sub.type === "heading") {
    const headings = cache.headings ?? [];
    const start = sub.current.position.start.offset;
    const index = headings.findIndex((h) => h.position.start.offset === start);
    if (index === -1) return STALE;
    const slice = raw.slice(start, headingEndOffset(headings, index, raw.length));
    return sliceMatchesHeading(slice, sub.current.heading) ? slice : STALE;
  }
  if (sub.type === "block") {
    const start = sub.block.position.start.offset;
    let end = sub.block.position.end.offset;
    if (sub.list && cache.listItems) end = Math.max(end, listItemEndOffset(cache.listItems, sub.list.position.start.line));
    const slice = raw.slice(start, end);
    return sliceHasBlockId(slice, sub.block.id) ? slice : STALE;
  }
  return MISSING;
}
