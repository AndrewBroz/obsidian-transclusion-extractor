import { App, MarkdownView, TFile } from "obsidian";
import { normalizeNewlines } from "../transforms/text";

/**
 * Save every open Markdown editor whose buffer has unsaved changes, and wait until
 * the metadata cache has re-indexed each such file, so cached offsets match file contents.
 */
export async function flushEditors(app: App, timeoutMs = 2000): Promise<void> {
  const waits: Promise<void>[] = [];
  for (const leaf of app.workspace.getLeavesOfType("markdown")) {
    const view = leaf.view;
    if (!(view instanceof MarkdownView) || !view.file) continue;
    const file = view.file;
    // Compare line-ending-insensitively: a CRLF file never equals its LF editor buffer (source notes must not be re-saved).
    const dirty = normalizeNewlines(view.getViewData()) !== normalizeNewlines(await app.vault.read(file));
    if (!dirty) continue;
    // Subscribe before saving so we can't miss the "changed" event.
    waits.push(waitForCacheChange(app, file, timeoutMs));
    await view.save();
  }
  await Promise.all(waits);
}

/** Resolves when the metadata cache reports `file` changed, or after `timeoutMs`. */
export function waitForCacheChange(app: App, file: TFile, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const ref = app.metadataCache.on("changed", (changed) => {
      if (changed.path === file.path) finish();
    });
    const timer = window.setTimeout(() => finish(), timeoutMs);
    function finish() {
      app.metadataCache.offref(ref);
      window.clearTimeout(timer);
      resolve();
    }
  });
}
