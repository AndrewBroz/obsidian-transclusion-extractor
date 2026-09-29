import { App, MarkdownView, TFile } from "obsidian";

/**
 * Save every open Markdown editor and wait until the metadata cache has re-indexed
 * any file that save actually changed, so cached offsets match file contents.
 */
export async function flushEditors(app: App, timeoutMs = 2000): Promise<void> {
  const waits: Promise<void>[] = [];
  for (const leaf of app.workspace.getLeavesOfType("markdown")) {
    const view = leaf.view;
    if (!(view instanceof MarkdownView) || !view.file) continue;
    const file = view.file;
    const before = file.stat.mtime;
    const changed = waitForCacheChange(app, file, timeoutMs);
    await view.save();
    if (file.stat.mtime !== before) waits.push(changed.promise);
    else changed.cancel();
  }
  await Promise.all(waits);
}

function waitForCacheChange(app: App, file: TFile, timeoutMs: number): { promise: Promise<void>; cancel: () => void } {
  let finish = () => {};
  const promise = new Promise<void>((resolve) => {
    const ref = app.metadataCache.on("changed", (changed) => {
      if (changed.path === file.path) finish();
    });
    const timer = window.setTimeout(() => finish(), timeoutMs);
    finish = () => {
      app.metadataCache.offref(ref);
      window.clearTimeout(timer);
      resolve();
    };
  });
  return { promise, cancel: () => finish() };
}
