# Transclusion Extractor

An Obsidian plugin (desktop only) for notes that are assembled from transclusions (`![[...]]`).

- **Export with transclusions expanded:** writes a new Markdown file in which every embed is replaced, recursively, by the text it points to. Use it from the command palette, or right-click a note in the file explorer and choose *Export expanded…*.
- **Inline transclusion:** right-click an embed in the editor, or run *Inline transclusion under cursor*. This replaces that one embed with a copy of its text, which you can then edit on its own. An HTML comment marker (`<!-- inlined from "Note#^id" on <date> -->`) records where it came from; Publish exports remove it. Cmd-Z undoes it. In Live Preview, you can also use the ⋯ button next to an embed's expand icon.

## Install (team, via BRAT)

1. Install **BRAT** from Community plugins.
2. BRAT → *Add beta plugin* → enter `AndrewBroz/obsidian-transclusion-extractor`.
3. Enable **Transclusion Extractor** under Community plugins.

BRAT checks for updates automatically.

## Export presets

| Option | Publish | Snapshot |
|---|---|---|
| Strip block IDs | on | off |
| Strip comments | on | off |
| Keep frontmatter | off | on |
| Nest headings | on | on |
| Source markers | off | off |

You can edit presets or add your own under Settings → Transclusion Extractor. Toggles in the export dialog apply to that one export only.

Missing or circular embeds become plain blockquotes (`> **Missing:** Note#^id`) in the output, and the completion notice counts them. Wikilinks and image/PDF embeds are left unchanged.

## Inkling integration (optional)

If [Inkling](https://github.com/AndrewBroz/obsidian-inkling) 0.11.0 or later is enabled, Transclusion Extractor uses it to show the **original text** of notes under review:

- **Inline transclusion** copies the original text: pending suggestions are left out (shown as rejected), comments are removed, highlights are unwrapped.
- **Every export** (all presets) contains the original text of the parent note and of every transclusion.

Without Inkling, text is copied exactly as written.

## Development

```bash
npm install
npm test          # unit tests (Vitest)
npm run dev       # watch build into test-vault/.obsidian/plugins/
```

Open `test-vault/` in Obsidian to try changes. See `test-vault/expected/README.md` for the acceptance check.

## Releasing

```bash
npm version patch   # bumps package.json, manifest.json, versions.json; tags without a "v"
git push --follow-tags
```

The Release workflow runs the tests, builds, and publishes `main.js`, `manifest.json` and `styles.css` to a GitHub release.
