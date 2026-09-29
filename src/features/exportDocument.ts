import { App, FileSystemAdapter, normalizePath, TFile, TFolder } from "obsidian";
import { promises as fsp } from "fs";
import * as nodePath from "path";
import { vaultRelative } from "../paths";
import { createResolver } from "../resolver/EmbedResolver";
import { expandDocument } from "../resolver/expand";
import { flushEditors } from "../resolver/freshness";
import type { ExportOptions } from "../settings";
import { runPipeline } from "../transforms/pipeline";

export type ExportTarget = { kind: "vault"; path: string } | { kind: "fs"; absPath: string };

export function defaultExportPath(file: TFile): string {
  const folder = file.parent && !file.parent.isRoot() ? `${file.parent.path}/` : "";
  return normalizePath(`${folder}${file.basename} (expanded).md`);
}

function vaultBasePath(app: App): string | null {
  const adapter = app.vault.adapter;
  return adapter instanceof FileSystemAdapter ? adapter.getBasePath() : null;
}

export function targetFromAbsolute(app: App, absPath: string): ExportTarget {
  const base = vaultBasePath(app);
  const rel = base ? vaultRelative(base, absPath) : null;
  return rel ? { kind: "vault", path: normalizePath(rel) } : { kind: "fs", absPath };
}

export function absolutePathOf(app: App, t: ExportTarget): string {
  if (t.kind === "fs") return t.absPath;
  const base = vaultBasePath(app);
  return base ? nodePath.join(base, t.path) : t.path;
}

export function describeTarget(t: ExportTarget): string {
  return t.kind === "vault" ? t.path : t.absPath;
}

export function targetExists(app: App, t: ExportTarget): boolean {
  return t.kind === "vault" && app.vault.getAbstractFileByPath(t.path) !== null;
}

export async function buildExport(app: App, file: TFile, options: ExportOptions): Promise<{ text: string; warnings: number }> {
  await flushEditors(app);
  const source = await app.vault.read(file);
  const { text, warnings } = await expandDocument(source, file.path, createResolver(app), {
    shiftHeadings: options.shiftHeadings,
    provenance: options.provenance,
  });
  return { text: runPipeline(text, options), warnings };
}

export async function writeExport(app: App, target: ExportTarget, text: string): Promise<void> {
  if (target.kind === "fs") {
    const tmp = `${target.absPath}.tmp-${Date.now()}`;
    try {
      await fsp.writeFile(tmp, text, "utf8");
      await fsp.rename(tmp, target.absPath);
    } catch (err) {
      await fsp.rm(tmp, { force: true });
      throw err;
    }
    return;
  }
  const existing = app.vault.getAbstractFileByPath(target.path);
  if (existing instanceof TFile) {
    await app.vault.modify(existing, text);
    return;
  }
  if (existing) throw new Error(`${target.path} is a folder`);
  const slash = target.path.lastIndexOf("/");
  const folder = slash === -1 ? "" : target.path.slice(0, slash);
  if (folder && !(app.vault.getAbstractFileByPath(folder) instanceof TFolder)) await app.vault.createFolder(folder);
  await app.vault.create(target.path, text);
}
