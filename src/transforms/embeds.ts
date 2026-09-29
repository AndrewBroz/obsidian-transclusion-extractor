import { findProtectedRanges, inRanges, Range } from "./codeRegions";

export interface EmbedRef {
  start: number;
  end: number;
  raw: string;
  /** Link path plus subpath, without alias, e.g. "Note#^id". */
  target: string;
  linkpath: string;
  /** Keeps its leading "#", or "" for a whole-note embed. */
  subpath: string;
  alias: string | null;
}

const EMBED = /!\[\[([^[\]|\n]+?)(?:\\?\|([^[\]\n]*))?\]\]/g;

const ATTACHMENT_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "bmp", "svg", "webp", "avif",
  "pdf",
  "mp3", "wav", "m4a", "ogg", "3gp", "flac",
  "mp4", "webm", "mov", "mkv", "ogv",
  "canvas", "base",
]);

export function findEmbeds(text: string, skip: Range[] = findProtectedRanges(text)): EmbedRef[] {
  const refs: EmbedRef[] = [];
  for (const m of text.matchAll(EMBED)) {
    const start = m.index ?? 0;
    if (inRanges(skip, start)) continue;
    const target = m[1].trim();
    const hash = target.indexOf("#");
    refs.push({
      start,
      end: start + m[0].length,
      raw: m[0],
      target,
      linkpath: (hash === -1 ? target : target.slice(0, hash)).trim(),
      subpath: hash === -1 ? "" : target.slice(hash).trim(),
      alias: m[2] ?? null,
    });
  }
  return refs;
}

export function embedAt(text: string, offset: number): EmbedRef | null {
  return findEmbeds(text).find((e) => offset >= e.start && offset <= e.end) ?? null;
}

export function blockIdOf(subpath: string): string | null {
  return subpath.startsWith("#^") ? subpath.slice(2) : null;
}

export function looksLikeAttachment(linkpath: string): boolean {
  const ext = /\.([^./]+)$/.exec(linkpath)?.[1]?.toLowerCase();
  return ext !== undefined && ATTACHMENT_EXTENSIONS.has(ext);
}
