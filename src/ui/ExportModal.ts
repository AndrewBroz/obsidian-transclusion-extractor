import { App, ButtonComponent, Modal, Notice, Setting, TFile } from "obsidian";
import {
  absolutePathOf,
  buildExport,
  defaultExportPath,
  describeTarget,
  ExportTarget,
  targetExists,
  targetFromAbsolute,
  writeExport,
} from "../features/exportDocument";
import { ExportOptions, OPTION_KEYS, PluginSettings } from "../settings";
import { OPTION_LABELS } from "./optionLabels";
import { getSaveDialog } from "./saveDialog";

interface SettingsHost {
  settings: PluginSettings;
  saveSettings(): Promise<void>;
}

export class ExportModal extends Modal {
  private presetName: string;
  private options: ExportOptions;
  private target: ExportTarget;
  private chosenViaDialog = false;

  constructor(app: App, private host: SettingsHost, private file: TFile) {
    super(app);
    const { presets, lastPreset } = host.settings;
    const preset = presets.find((p) => p.name === lastPreset) ?? presets[0];
    this.presetName = preset.name;
    this.options = { ...preset.options };
    this.target = { kind: "vault", path: defaultExportPath(file) };
  }

  onOpen(): void {
    this.modalEl.addClass("transclusion-extractor-modal");
    this.render();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    this.titleEl.setText(`Export "${this.file.basename}" with transclusions expanded`);

    new Setting(contentEl).setName("Preset").addDropdown((dd) => {
      for (const p of this.host.settings.presets) dd.addOption(p.name, p.name);
      dd.setValue(this.presetName).onChange((name) => {
        const preset = this.host.settings.presets.find((p) => p.name === name);
        if (!preset) return;
        this.presetName = name;
        this.options = { ...preset.options };
        this.render();
      });
    });

    for (const key of OPTION_KEYS) {
      const [name, desc] = OPTION_LABELS[key];
      new Setting(contentEl)
        .setName(name)
        .setDesc(desc)
        .addToggle((t) => t.setValue(this.options[key]).onChange((v) => (this.options[key] = v)));
    }

    const exists = !this.chosenViaDialog && targetExists(this.app, this.target);
    const location = new Setting(contentEl)
      .setName("Save to")
      .addButton((b) => b.setButtonText("Choose location…").onClick(() => void this.chooseLocation()));
    location.descEl.createDiv({ cls: "te-path", text: describeTarget(this.target) });
    if (exists) location.descEl.createDiv({ cls: "te-warning", text: "A file already exists here and will be overwritten." });

    new Setting(contentEl).addButton((b) =>
      b
        .setButtonText(exists ? "Overwrite" : "Export")
        .setCta()
        .onClick(() => void this.runExport(b)),
    );
  }

  private isSourceTarget(target: ExportTarget): boolean {
    return target.kind === "vault" && target.path === this.file.path;
  }

  private async chooseLocation(): Promise<void> {
    const dialog = getSaveDialog();
    if (!dialog) {
      new Notice("The system save dialog isn't available; the default location will be used.");
      return;
    }
    const result = await dialog.showSaveDialog({
      defaultPath: absolutePathOf(this.app, this.target),
      filters: [{ name: "Markdown", extensions: ["md"] }],
    });
    if (result.canceled || !result.filePath) return;
    const target = targetFromAbsolute(this.app, result.filePath);
    if (this.isSourceTarget(target)) {
      new Notice("Can't export over the note being exported. Choose a different file name.");
      return;
    }
    this.target = target;
    this.chosenViaDialog = true;
    this.render();
  }

  private async runExport(button: ButtonComponent): Promise<void> {
    if (this.isSourceTarget(this.target)) {
      new Notice("Can't export over the note being exported. Choose a different file name.");
      return;
    }
    button.setDisabled(true);
    try {
      const { text, warnings } = await buildExport(this.app, this.file, this.options);
      await writeExport(this.app, this.target, text);
      this.host.settings.lastPreset = this.presetName;
      await this.host.saveSettings();
      const where = describeTarget(this.target);
      new Notice(warnings > 0 ? `Exported with ${warnings} warning${warnings === 1 ? "" : "s"} to ${where}` : `Exported to ${where}`);
      this.close();
    } catch (err) {
      new Notice(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
      button.setDisabled(false);
    }
  }
}
