import type { EmbedRef } from "../transforms/embeds";

export type ResolveResult =
  | { ok: true; text: string; path: string; key: string }
  | { ok: false; reason: "missing-file" | "missing-subpath" | "not-markdown"; target: string };

/** Resolve one embed, relative to the note that contains it. */
export type Resolve = (ref: EmbedRef, sourcePath: string) => Promise<ResolveResult>;
