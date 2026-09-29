import { App, Plugin, PluginSettingTab, Setting } from "obsidian";
import { defaultPresets, OPTION_KEYS, PluginSettings, PUBLISH, uniqueName } from "../settings";
import { OPTION_LABELS } from "./optionLabels";

interface SettingsHost extends Plugin {
  settings: PluginSettings;
  saveSettings(): Promise<void>;
}

export class SettingsTab extends PluginSettingTab {
  constructor(app: App, private host: SettingsHost) {
    super(app, host);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const settings = this.host.settings;
    const save = () => this.host.saveSettings();

    new Setting(containerEl)
      .setName("Export presets")
      .setDesc("Presets appear in the export dialog. Toggles in the dialog apply to one export only.")
      .setHeading();

    settings.presets.forEach((preset, index) => {
      new Setting(containerEl)
        .setName("Preset name")
        .addText((t) =>
          t.setValue(preset.name).onChange(async (value) => {
            const name = value.trim();
            if (!name || settings.presets.some((p, i) => i !== index && p.name === name)) return;
            if (settings.lastPreset === preset.name) settings.lastPreset = name;
            preset.name = name;
            await save();
          }),
        )
        .addExtraButton((b) =>
          b
            .setIcon("trash")
            .setTooltip("Delete preset")
            .setDisabled(settings.presets.length === 1)
            .onClick(async () => {
              settings.presets.splice(index, 1);
              if (!settings.presets.some((p) => p.name === settings.lastPreset)) settings.lastPreset = settings.presets[0].name;
              await save();
              this.display();
            }),
        );

      for (const key of OPTION_KEYS) {
        const [name, desc] = OPTION_LABELS[key];
        new Setting(containerEl)
          .setName(name)
          .setDesc(desc)
          .setClass("te-preset-option")
          .addToggle((t) =>
            t.setValue(preset.options[key]).onChange(async (v) => {
              preset.options[key] = v;
              await save();
            }),
          );
      }
    });

    new Setting(containerEl)
      .addButton((b) =>
        b.setButtonText("Add preset").onClick(async () => {
          const name = uniqueName(
            settings.presets.map((p) => p.name),
            "New preset",
          );
          settings.presets.push({ name, options: { ...PUBLISH } });
          await save();
          this.display();
        }),
      )
      .addButton((b) =>
        b
          .setButtonText("Restore built-in presets")
          .setWarning()
          .onClick(async () => {
            settings.presets = defaultPresets();
            settings.lastPreset = settings.presets[0].name;
            await save();
            this.display();
          }),
      );
  }
}
