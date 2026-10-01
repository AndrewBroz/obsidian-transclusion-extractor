import type { ExportOptions } from "../settings";

export const OPTION_LABELS: Record<keyof ExportOptions, [name: string, description: string]> = {
  stripBlockIds: ["Strip block IDs", "Remove ^block-id markers."],
  stripComments: ["Strip comments", "Remove %%Obsidian comments%% (including old-style inline markers)."],
  stripInlineMarkers: ["Strip inline markers", "Remove <!-- inlined from … --> comments left by Inline transclusion."],
  keepParentFrontmatter: ["Keep frontmatter", "Keep this note's YAML properties at the top of the export."],
  shiftHeadings: ["Nest headings", "Demote embedded headings so they sit under the surrounding heading."],
  provenance: ["Source markers", "Wrap each expanded block in <!-- from: … --> comments."],
};
