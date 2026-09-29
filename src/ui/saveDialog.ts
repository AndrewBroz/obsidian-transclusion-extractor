interface SaveDialogResult {
  canceled: boolean;
  filePath?: string;
}

export interface ElectronDialog {
  showSaveDialog(options: { defaultPath: string; filters: { name: string; extensions: string[] }[] }): Promise<SaveDialogResult>;
}

/** Electron's native dialog via Obsidian's remote module, or null if unavailable. */
export function getSaveDialog(): ElectronDialog | null {
  const req = (window as unknown as { require?: (id: string) => unknown }).require;
  const electron = req?.("electron") as { remote?: { dialog?: ElectronDialog } } | undefined;
  return electron?.remote?.dialog ?? null;
}
