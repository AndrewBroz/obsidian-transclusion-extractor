# Transclusion Extractor — Design Spec

- **Date:** 2026-09-29
- **Plugin name / ID:** Transclusion Extractor / `transclusion-extractor`
- **Platform:** Obsidian desktop only (`isDesktopOnly: true`)
- **Distribution:** GitHub releases installed by a small team via BRAT

## 1. Purpose

Some Obsidian documents are assembled almost entirely from transclusions (`![[...]]`) of prose blocks that live in other notes. This plugin supports two workflows on such documents:

1. **Export**: produce a new, self-contained `.md` file in which every transclusion is replaced, recursively, by the text it points to. The output serves two uses: a snapshot that stays in Obsidian, and a clean file for use outside Obsidian (Pandoc, Word, and so on).
2. **Inline**: replace a single transclusion in the parent document with a copy of its text (a fork) so that copy can be edited on its own, without changing the source.

### Success criteria

- Exported text matches what Obsidian renders for each embed (same note resolution, same block and heading boundaries).
- Source notes are never modified by either feature.
- Export never silently drops content: every unresolved or circular embed is visible in the output and counted in a notice.
- Inlining is a single undoable edit and changes nothing when it fails.
- Team members can install and update the plugin through BRAT from tagged GitHub releases.

### Non-goals (v1)

- Converting wikilinks to Markdown links or plain text. Wikilinks pass through unchanged; this was considered and deliberately rejected.
- Mobile support.
- A rendered button on embeds in Live Preview (possible later addition).
- Merging frontmatter from embedded notes.
- A standalone CLI. The pure transform layer keeps this option open.

## 2. Architecture

The code has two layers: an **Obsidian-dependent resolver** and **pure transforms**.

```
obsidian-transclusion-extractor/
├── manifest.json, versions.json
├── src/
│   ├── main.ts                    # registers commands, editor-menu, file-menu, settings tab
│   ├── settings.ts                # settings/preset types and defaults
│   ├── resolver/
│   │   ├── EmbedResolver.ts       # (Obsidian) one embed → raw target text
│   │   └── expand.ts              # (Obsidian) recursive expansion, cycle detection, heading context
│   ├── transforms/                # PURE — no `obsidian` imports
│   │   ├── codeRegions.ts         # locate fenced/inline code + %% %% ranges to skip
│   │   ├── spacing.ts             # context-aware joining of embed content into parent
│   │   ├── prefix.ts              # re-apply blockquote/list prefixes to inserted lines
│   │   ├── shiftHeadings.ts
│   │   ├── stripBlockIds.ts
│   │   ├── stripComments.ts
│   │   ├── frontmatter.ts
│   │   └── pipeline.ts            # applies enabled transforms in fixed order
│   ├── features/
│   │   ├── exportDocument.ts      # expand → pipeline → write file
│   │   └── inlineEmbed.ts         # one-level replace + provenance marker
│   └── ui/
│       ├── ExportModal.ts         # preset picker, toggles, Choose location…, Export
│       └── SettingsTab.ts         # preset management
├── tests/                         # Vitest; targets src/transforms only
├── test-vault/                    # fixture vault + expected outputs
└── .github/workflows/release.yml
```

**Boundary rules**

- Nothing under `transforms/` may import `obsidian`; everything else may.
- `transforms/` functions are shaped like `(text, options) → text` (or take small plain data structures) and are fully unit-testable.
- UI collects options and calls features; it contains no text-processing logic.

## 3. Entry points

| Entry point | Action |
|---|---|
| Command: *Export with transclusions expanded…* | Opens ExportModal for the active note |
| File-explorer context menu: *Export expanded…* | Opens ExportModal for that note |
| Editor context menu: *Inline transclusion* | Shown only when cursor is inside a Markdown-note `![[...]]` not in code |
| Command: *Inline transclusion under cursor* | Same as above; hotkey-assignable. Command is unavailable (via `editorCheckCallback`) when not on an embed |

## 4. Resolver: embed → text

The resolver uses `metadataCache.getFirstLinkpathDest(linkpath, sourcePath)` for note resolution and the `CachedMetadata` (`headings`, `blocks`, `sections`, `listItems`, `frontmatterPosition`) for offsets. Text is read with `vault.cachedRead`.

| Embed form | Extracted range |
|---|---|
| `![[Note]]` | Whole file minus frontmatter |
| `![[Note#Heading]]` | Heading line through the line before the next heading of equal or higher level (or end of file). Nested `#A#B` resolves B within A's range. |
| `![[Note#^id]]` | The cached block range. If the block is a list item, it is extended to include all of that item's descendant list items (from `listItems` parent chains). |
| Non-Markdown targets (images, PDFs, canvas, etc.) | Not expanded; embed text left verbatim |
| Display alias (`\|alias`) | Ignored for extraction |

Result type:

```ts
type ResolveResult =
  | { ok: true; text: string; file: TFile; subpath: string }
  | { ok: false; reason: "missing-file" | "missing-subpath" | "not-markdown"; target: string };
```

Leading and trailing blank lines are trimmed from the extracted text.

## 5. Export pipeline

### 5.1 Expansion (`expand.ts`)

- Before export begins, the plugin waits until the metadata cache has finished indexing (it listens for `metadataCache` `resolved` if indexing is in progress).
- Embeds inside fenced code, inline code, or `%% %%` comments are skipped (`codeRegions.ts`).
- Expansion is depth-first. A **visited set** of `path#subpath` keys follows each chain; revisiting a key emits:
  `> [!warning] Circular transclusion: Note#^id`
- An unresolved embed emits `> [!warning] Missing: Note#^id`.
- A warning count is accumulated and reported.
- **Heading shift** (when enabled) is applied per embed during expansion:
  - The *context level* is the level of the nearest heading above the embed in the output being built (0 if there is none).
  - The shift is `max(0, contextLevel + 1 − minHeadingLevelInContent)`.
  - Headings are only ever demoted, never promoted. Levels are clamped at 6.
- **Provenance** (when enabled): expanded content is wrapped as
  `<!-- from: Note#^id -->` … `<!-- /from -->`. HTML comments are not affected by `%%` stripping.
- **Prefixes** (`prefix.ts`): if the embed line has a blockquote or callout prefix (`> `, nested `> > `) or list indentation, every inserted line gets the same prefix or continuation indent.
- **Spacing** (`spacing.ts`): see 5.2.

### 5.2 Context-aware spacing

Principle: **keep the parent's existing spacing; add a separator only where Markdown would otherwise join the two pieces of text.**

- **Embed alone on its line.** Replace the line. Add a blank separator above or below only when:
  - the neighbouring line is non-blank paragraph text and the adjacent edge of the content is paragraph text (they would merge), or
  - the content begins with a table and the previous line is non-blank, or
  - the content ends with a list and the next line is non-blank non-list text (lazy continuation).
  
  When a blank line already exists, nothing is added.
- **Inside a list item:** never insert blank lines, so a tight list stays tight.
- **Inside a blockquote or callout:** a needed separator is written as the quote prefix alone (`>`).
- **Embed mid-line:** if the content is a single paragraph, splice it inline with no newlines. Otherwise break it out into its own block, with a line break before and after, following the rules above.

### 5.3 Transform pipeline (after expansion)

A fixed order is applied to the whole expanded document, and every step skips code regions:

1. `stripComments`: remove `%%…%%`, both inline and multi-line. An unclosed `%%` is left untouched.
2. `stripBlockIds`: remove a trailing ` ^[A-Za-z0-9-]+` at the end of a line, including one on its own line after a table or quote.
3. `frontmatter`: keep or strip the **parent's** YAML. Frontmatter from embedded whole notes is always dropped at resolve time.

Transforms never throw. Malformed input passes through unchanged.

### 5.4 Presets

```ts
interface ExportOptions {
  stripBlockIds: boolean;
  stripComments: boolean;
  keepParentFrontmatter: boolean;
  shiftHeadings: boolean;
  provenance: boolean;
}
interface Preset { name: string; options: ExportOptions }
```

| Option | Snapshot | Publish (default preset) |
|---|---|---|
| stripBlockIds | off | on |
| stripComments | off | on |
| keepParentFrontmatter | on | off |
| shiftHeadings | on | on |
| provenance | off | off |

Presets can be added, renamed, edited and deleted in the settings tab. The last-used preset is remembered.

### 5.5 Output location

- The ExportModal shows the target path. The default is `<source folder>/<Name> (expanded).md`.
- **Choose location…** opens the Electron system save dialog, with `defaultPath` set to the absolute path of that default.
- A path inside the vault is written with `vault.create` or `vault.modify`, so it appears in the file explorer immediately. A path outside the vault is written with Node `fs.promises.writeFile`.
- Overwrite confirmation for the chosen path comes from the system dialog. For the default path without the dialog, the modal warns if the file exists and the button label changes to *Overwrite*.
- After writing, a notice reads *"Exported to …"*, or *"Exported with N warnings"* when there were warnings.

## 6. Inline action (`inlineEmbed.ts`)

1. Find the `![[...]]` span containing the cursor on the current line, and confirm it is not inside code or a comment.
2. Resolve **one level only**. Nested embeds inside the content remain as embeds.
3. Remove the source block ID (`^id`) from the copied text. The ID belongs to the original, and links elsewhere should keep pointing to the source.
4. No heading shift; the text is copied exactly as it appears in the source.
5. Build the replacement:
   ```
   %% inlined from [[<original link text without !>]] on YYYY-MM-DD %%
   <content>
   ```
   Apply the same prefix and spacing rules as export (§5.1–5.2).
6. Apply it with a single `editor.replaceRange`, so one undo reverts it.
7. On any resolve failure: show a `Notice` (*"Can't inline: Note#^id not found"*) and do not change the document.

## 7. Error handling summary

| Situation | Export | Inline |
|---|---|---|
| Missing note or subpath | Warning callout in the output; export continues | Notice; no change |
| Circular embed | Warning callout; the branch stops | N/A (one level only) |
| Non-Markdown embed | Left verbatim | Menu item hidden |
| Metadata cache still indexing | Wait, then export | Wait, then inline |
| Write failure (permissions, etc.) | Error notice with the message; no partial file | N/A |

## 8. Testing

- **Vitest unit tests** for every file in `transforms/`, including:
  - comments and block IDs inside code blocks, which must survive,
  - unclosed `%%`,
  - block IDs on their own line after tables,
  - heading shift clamping and the no-promotion rule,
  - spacing: paragraph after paragraph, table, list lazy continuation, inside a list, inside a callout, mid-line single and multi-paragraph,
  - prefix application for nested quotes and list indents,
  - frontmatter keep and strip.
- **Fixture vault** `test-vault/` with notes covering:
  - nested embeds three levels deep,
  - a loop,
  - a missing note and a missing block,
  - a list-item block with children,
  - an embed in a callout,
  - an embed mid-sentence,
  - a table with a block ID,
  - a heading embed with a `#A#B` path,
  - an image embed.
  
  `test-vault/expected/` holds the reference output for each preset, and resolver behaviour is checked by hand against it in Obsidian.
- No automated Obsidian end-to-end tests.

## 9. Build and release

- The toolchain is the Obsidian sample-plugin setup: TypeScript, esbuild and the `obsidian` types package. `npm run dev` watches and builds into `test-vault/.obsidian/plugins/transclusion-extractor/`.
- `npm version patch|minor|major` bumps `manifest.json` and `versions.json` together (version-bump script).
- A GitHub Action runs on each `x.y.z` tag. It runs the tests, builds, and creates a GitHub release with `main.js`, `manifest.json` and `styles.css` attached.
- Team install: BRAT → *Add beta plugin* → `<org>/obsidian-transclusion-extractor`.
