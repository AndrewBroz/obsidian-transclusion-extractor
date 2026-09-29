import { Plugin, TFile } from "obsidian";
import { embedUnderCursor, inlineEmbed, isNoteEmbed } from "./features/inlineEmbed";
import { loadSettings, PluginSettings } from "./settings";
import { ExportModal } from "./ui/ExportModal";
import { SettingsTab } from "./ui/SettingsTab";

export default class TransclusionExtractorPlugin extends Plugin {
  settings: PluginSettings = loadSettings(undefined);

  async onload(): Promise<void> {
    this.settings = loadSettings(await this.loadData());
    this.addSettingTab(new SettingsTab(this.app, this));

    this.addCommand({
      id: "export-expanded",
      name: "Export with transclusions expanded…",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "md") return false;
        if (!checking) new ExportModal(this.app, this, file).open();
        return true;
      },
    });

    this.addCommand({
      id: "inline-transclusion",
      name: "Inline transclusion under cursor",
      editorCheckCallback: (checking, editor, ctx) => {
        const file = ctx.file;
        const hit = file ? embedUnderCursor(editor) : null;
        if (!file || !hit || !isNoteEmbed(this.app, hit.ref, file.path)) return false;
        if (!checking) void inlineEmbed(this.app, editor, file);
        return true;
      },
    });

    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor, info) => {
        const file = info.file;
        const hit = file ? embedUnderCursor(editor) : null;
        if (!file || !hit || !isNoteEmbed(this.app, hit.ref, file.path)) return;
        menu.addItem((item) =>
          item
            .setTitle("Inline transclusion")
            .setIcon("unfold-vertical")
            .onClick(() => void inlineEmbed(this.app, editor, file)),
        );
      }),
    );

    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (!(file instanceof TFile) || file.extension !== "md") return;
        menu.addItem((item) =>
          item
            .setTitle("Export expanded…")
            .setIcon("file-output")
            .onClick(() => new ExportModal(this.app, this, file).open()),
        );
      }),
    );
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
