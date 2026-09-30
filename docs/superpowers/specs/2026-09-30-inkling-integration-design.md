# Portable markers and Inkling integration: design spec

- **Date:** 2026-09-30
- **Repos:**
  - Transclusion Extractor: `~/Code/cri/obsidian-transclusion-extractor` (plugin id `transclusion-extractor`, currently 0.1.1)
  - Inkling: `~/Code/personal/obsidian-inkling` (plugin id `inkling`, currently 0.10.1)
- **Supersedes:** the inline-marker format and the warning-callout format in `2026-09-29-transclusion-extractor-design.md` (§5.1, §6, §7). Everything else in that spec stands.

## 1. Purpose

1. **No Obsidian-only syntax.** Transclusion Extractor should not introduce Obsidian-specific syntax into notes or exports.
   - The provenance marker written by *inline* becomes a standard HTML comment.
   - The export's missing/circular warnings become plain Markdown.
2. **Transclusions show the original text.** A transclusion of a note that contains Inkling review markup (CriticMarkup) currently shows raw `{++…++}` / `{>>…<<}` syntax. It should instead show the note's original text: pending suggestions shown as *rejected*, and comments hidden.
3. **Inline and export produce the original text.** Both remove Inkling markup using the same "original text" rule.
4. **Concerns stay separated.** Only Inkling understands CriticMarkup. Transclusion Extractor applies opaque text filters offered by other plugins and never parses review markup itself.

### Success criteria

- A transclusion in Live Preview or Reading view of `The {~~cat~>dog~~} sat. {>>check<<}` displays "The cat sat.", and the source note is unchanged.
- Inlining that embed writes `<!-- inlined from "Note#^id" on YYYY-MM-DD -->` followed by `The cat sat.`, with no `%%` and no `[[…]]` in the marker.
- Every export (Publish and Snapshot) contains no CriticMarkup when Inkling ≥ 0.11.0 is enabled.
- With Inkling absent or disabled, Transclusion Extractor behaves exactly as it does today, apart from the marker and warning formats, and shows no errors.
- Neither plugin requires the other in order to install or load.

### Non-goals

- Accept-mode ("final text") rendering of transclusions. The user chose original text.
- Making embeds editable.
- Changing how Inkling renders the note's own editor or Reading view outside transclusions.
- Reading-view support for the ⋯ inline button.

## 2. The "original text" rule (owned by Inkling)

| Markup | Original text |
|---|---|
| Addition `{++x++}` | removed |
| Deletion `{--x--}` | `x` |
| Substitution `{~~a~>b~~}` | `a` |
| Comment `{>>x<<}`, including whole reply threads | removed |
| Highlight `{==x==}` | `x` |

- **Metadata:** Inkling's metadata prefix (`{"author":…}@@`) is never part of the output.
- **Cleanup after removal:**
  - Where removing a range leaves two spaces, collapse them to one.
  - Where a line becomes empty or whitespace-only because of a removal, drop the line. If that leaves two blank lines touching, collapse them to one.
- **Other text:** text outside CriticMarkup is byte-identical to the input, including code blocks.

## 3. Inkling changes (release 0.11.0)

### 3a. Public API

- **`src/api/original-text.ts`:** a pure function `toOriginalText(markdown: string, settings?: PluginSettings): string` implementing §2.
  - It is built on the existing `getRangesInText`, each range's `reject()` (comments are always removed, regardless of the `removeComments` setting) and `applyToText`, plus the cleanup rules.
  - It has no `obsidian` import.
- **`onload`:** set `this.api = Object.freeze({ version: 1, toOriginalText: (md) => toOriginalText(md, this.settings) })`.
  - Remove the unused stub in `src/api/suggest.ts`.
  - Document the API in Inkling's README: a stable contract, with `version` bumped on breaking change.
- **Tests (Jest):** every row of §2, including:
  - metadata;
  - threads (a highlight plus replies);
  - markup spanning lines;
  - markup inside code (left untouched, if the parser excludes code; the test pins whatever the parser does);
  - whitespace cleanup;
  - text with no markup, which must be returned identical.

### 3b. Transclusions render the original text

- **Scope:** when Inkling's markdown post-processor renders content inside a transclusion (`.markdown-embed`, in Live Preview or Reading view), it displays the §2 original text. Comments render as nothing, and suggestions render in the existing `PreviewMode.REJECT` style, i.e. as plain original text.
- **Detection:** how to tell that the post-processor is rendering inside a transclusion is decided by a **spike (the first plan task)** in a real vault. The candidates, in order of preference:
  1. `ctx.addChild(MarkdownRenderChild)`, checking `containerEl.closest(".markdown-embed")` in `onload` (after attachment), then re-running processing in REJECT mode;
  2. comparing `ctx.sourcePath` / `ctx.docId` with the host view;
  3. an observer on `.markdown-embed-content` that re-renders the embed from `toOriginalText(source)` with `MarkdownRenderer.render`, where the source is resolved from the embed `src` via the metadata cache.
  
  The spike records the chosen technique and its evidence in the plan's ledger.
- **Display only:** this only affects what is displayed. Source files are never written.
- **Setting:** none new. Transclusions always show the original text; that was the user's decision.
- **Tests:**
  - unit tests for any pure helper;
  - a manual checklist entry (Live Preview and Reading view; a nested transclusion; a transclusion of a heading section with a comment thread);
  - no regression in the existing Jest suite.

## 4. Transclusion Extractor changes (release 0.2.0)

### 4a. Portable inline marker

- **Format:** `<!-- inlined from "<target>" on YYYY-MM-DD -->`, where `<target>` is the embed target without alias (e.g. `Sources/Quotes#^q1`).
  - Any `--` in the target is written as `- -`.
  - A `"` in the target is written as `\"`.
- **Placement:** unchanged from the original spec (§6): above the content, with the same prefix and spacing rules, and inline for a single-paragraph embed mid-line.
  - The gap rules keyed on the first content line (table, rule, ordered list not starting at 1) still apply.
  - An HTML comment on its own line is an HTML block. The spacing classifier treats it like the old marker line (a paragraph-level line) so that existing layouts are unchanged; tests pin the output.
- **Stripping on export:** a new pure transform, `stripInlineMarkers(text)`, removes lines (or inline occurrences) matching `<!-- inlined from "…" on YYYY-MM-DD -->`, using the same `removeSpan` whole-line and blank-line collapse behaviour.
  - It runs in Publish only (a new `ExportOptions` key, `stripInlineMarkers`: Publish on, Snapshot off; `loadSettings` back-fills it from the matching built-in preset).
  - It skips code.
- **Legacy markers:** `%% inlined from [[…]] on … %%` markers keep being removed by `stripComments` (Publish). No migration is needed.

### 4b. Content filters (the only Inkling-aware code)

- **Module:** `src/filters/contentFilters.ts`.
  - `export type ContentFilter = (markdown: string) => string;`
  - `export function getContentFilters(app: unknown): { name: string; filter: ContentFilter }[]`. It is pure-typed (no `obsidian` import) and duck-types `app.plugins.getPlugin("inkling")?.api`. It returns the Inkling filter only when `api.version >= 1` and `typeof api.toOriginalText === "function"`.
- **Pipeline:** `applyFilters(text, filters): { text: string; failures: string[] }` applies the filters in order. A filter that throws is skipped and its name is recorded.
- **Export:**
  - `expandDocument(text, sourcePath, resolve, opts)` gains `opts.filter?: (markdown: string) => { text: string; failures: string[] }`. It is applied to the parent body and to every resolved embed's text **before** expansion, block-ID stripping and splicing.
  - Every failure adds one warning. The warning's text in the output is `> **Filter failed (inkling):** <target or "document">` (see 4c).
  - Filtering is always on when a filter exists, in every preset.
- **Inline:** the filter is applied to the resolved content before `buildInlineReplacement`. The parent note's own text is not filtered. A failure shows a Notice ("Inkling couldn't clean this transclusion; inlined as-is.") and proceeds.
- **Filters are fetched per action,** so enabling or disabling Inkling takes effect without reloading.

### 4c. Plain-Markdown warnings

- **Missing:** `> [!warning] Missing: X` becomes `> **Missing:** X`.
- **Circular:** `> [!warning] Circular transclusion: X` becomes `> **Circular transclusion:** X`.
- **Table cells:** unchanged (`**Missing: X**`).
- **Fixture:** update `test-vault/expected/*.md` and the fixture test's warning assertions accordingly.

### 4d. Docs

- **README:** the Inkling integration (optional; requires Inkling ≥ 0.11.0), the marker format, and the fact that exports always show the original text when Inkling is enabled.
- **Manual checklist:** add a fixture note, `test-vault/Sources/Reviewed.md`, containing an addition, a deletion, a substitution, a highlight with a comment thread, and metadata, plus a transclusion of it in `Inline playground.md`.

## 5. Sequencing and delivery

1. **Inkling 3a (API):** can be merged independently.
2. **Inkling 3b:** the spike, then the embed rendering. Release Inkling 0.11.0.
3. **Transclusion Extractor 4a + 4c:** independent of Inkling.
4. **Transclusion Extractor 4b + 4d:** tested against a fake filter; manual check against Inkling 0.11.0. Release Transclusion Extractor 0.2.0.

**Merging:** per the user's standing preference, each repo's reviewed work is merged directly to `main` and pushed (no PRs). Releases are tagged after the user's go-ahead.

## 6. Risks

- **Embed detection (3b):** the embed-context detection may be unreliable. The spike decides; option 3 is the fallback.
- **HTML comments in Live Preview:** Obsidian's Live Preview may still display HTML comments as muted text. Portability, not invisibility, is the goal; Reading view and other Markdown renderers hide them.
- **API stability:** Inkling's API is a new public contract. Keep it minimal (`version`, `toOriginalText`).
