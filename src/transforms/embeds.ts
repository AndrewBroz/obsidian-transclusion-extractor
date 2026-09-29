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

/**
 * Maps a rendered embed widget (as seen in the DOM, spanning `[from, to)` per `posAtDOM`) back to
 * its source `EmbedRef`. Candidates are embeds whose start lies within `[from, max(to, end of the
 * line containing from)]` — the wider bound covers widgets (like a callout) whose DOM range starts
 * before the embed's own line. When `src` (the DOM `src` attribute, target without alias) is given,
 * only an exact target match is returned — never a guess. When `src` is absent, the single candidate
 * is returned only if there's exactly one; otherwise the result is ambiguous and `null`.
 */
export function embedForWidget(doc: string, from: number, to: number, src: string | null): EmbedRef | null {
  const lineStart = doc.lastIndexOf("\n", from - 1) + 1;
  const nl = doc.indexOf("\n", lineStart);
  const lineEnd = nl === -1 ? doc.length : nl;
  const rangeEnd = Math.max(to, lineEnd);

  const candidates = findEmbeds(doc).filter((e) => e.start >= from && e.start <= rangeEnd);

  if (src !== null) {
    const target = src.trim();
    return candidates.find((e) => e.target === target) ?? null;
  }
  return candidates.length === 1 ? candidates[0] : null;
}

export function blockIdOf(subpath: string): string | null {
  return subpath.startsWith("#^") ? subpath.slice(2) : null;
}

export function looksLikeAttachment(linkpath: string): boolean {
  const ext = /\.([^./]+)$/.exec(linkpath)?.[1]?.toLowerCase();
  return ext !== undefined && ATTACHMENT_EXTENSIONS.has(ext);
}
