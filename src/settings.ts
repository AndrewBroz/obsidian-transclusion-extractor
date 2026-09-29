export interface ExportOptions {
  stripBlockIds: boolean;
  stripComments: boolean;
  keepParentFrontmatter: boolean;
  shiftHeadings: boolean;
  provenance: boolean;
}

export interface Preset {
  name: string;
  options: ExportOptions;
}

export interface PluginSettings {
  presets: Preset[];
  lastPreset: string;
}

export const OPTION_KEYS: (keyof ExportOptions)[] = [
  "stripBlockIds",
  "stripComments",
  "keepParentFrontmatter",
  "shiftHeadings",
  "provenance",
];

export const PUBLISH: Readonly<ExportOptions> = Object.freeze({
  stripBlockIds: true,
  stripComments: true,
  keepParentFrontmatter: false,
  shiftHeadings: true,
  provenance: false,
});

export const SNAPSHOT: Readonly<ExportOptions> = Object.freeze({
  stripBlockIds: false,
  stripComments: false,
  keepParentFrontmatter: true,
  shiftHeadings: true,
  provenance: false,
});

export function defaultPresets(): Preset[] {
  return [
    { name: "Publish", options: { ...PUBLISH } },
    { name: "Snapshot", options: { ...SNAPSHOT } },
  ];
}

export function loadSettings(data: unknown): PluginSettings {
  const saved = (data ?? {}) as { presets?: { name?: unknown; options?: Partial<ExportOptions> }[]; lastPreset?: unknown };
  const presets =
    Array.isArray(saved.presets) && saved.presets.length > 0
      ? saved.presets.map((p) => ({ name: String(p.name ?? "Preset"), options: { ...PUBLISH, ...p.options } }))
      : defaultPresets();
  const lastPreset =
    typeof saved.lastPreset === "string" && presets.some((p) => p.name === saved.lastPreset) ? saved.lastPreset : presets[0].name;
  return { presets, lastPreset };
}

export function uniqueName(existing: string[], base: string): string {
  if (!existing.includes(base)) return base;
  let n = 2;
  while (existing.includes(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}
