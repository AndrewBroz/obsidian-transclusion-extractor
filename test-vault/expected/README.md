Reference outputs for Assembled.md. Export with the named preset to the default
location and compare: `diff "test-vault/Assembled (expanded).md" "test-vault/expected/Assembled (Publish).md"`.
Both exports report 2 warnings (one circular, one missing).

## Manual checks in Obsidian

The fixture test (`tests/fixture.test.ts`) verifies the expand + pipeline logic
against a fake resolver, but it cannot exercise the plugin's Obsidian-facing
commands, modals, and editor operations. Run these by hand after `npm run build`
(with `main.js`, `manifest.json`, and `styles.css` copied into
`test-vault/.obsidian/plugins/transclusion-extractor/`, which is git-ignored) and
opening `test-vault/` as a vault in Obsidian. Turn off Restricted mode and confirm
*Transclusion Extractor* is enabled under Community plugins.

### Verify export against the expected files

1. Open `Assembled.md` and run the command *Export with transclusions expanded…*.
   Choose the **Publish** preset and click **Export**.
   - Expected: the notice says "Exported with 2 warnings to Assembled (expanded).md".
2. Run `diff "test-vault/Assembled (expanded).md" "test-vault/expected/Assembled (Publish).md"`.
   - Expected: no differences.
3. Repeat with **Snapshot**. The dialog should warn that the file exists and label
   the button **Overwrite**.
   - Expected: `diff` against `Assembled (Snapshot).md` shows no differences.
4. In the file explorer, right-click `Assembled.md` and choose *Export expanded…*,
   then click **Choose location…**. The system dialog should open in `test-vault/`.
   Save to the Desktop.
   - Expected: the file is written to the Desktop.
5. Edit `Sources/Deep.md` (change "Deepest" to "Deeper") and export immediately,
   without waiting.
   - Expected: the export contains "Deeper paragraph." (this checks `flushEditors`).

If a diff shows a block-boundary difference, for example the `^tbl` table or the
`^pt` list item, check the `resolveSubpath` result for that block in the developer
console. Fix `EmbedResolver.ts`, not the expected file, unless the difference is
purely cosmetic and you have confirmed Obsidian renders it the same way.

### Verify inlining

In `Inline playground.md`, right-click each embed. After each check, undo with
**Cmd-Z** and confirm that one undo restores the original line.
- `![[Sources/Quotes#^q1]]` becomes `%% inlined from [[Sources/Quotes#^q1]] on <today> %%`
  followed by `Knowledge is a web, not a tree.`
- The callout embed becomes `> %% inlined … %%` followed by
  `> Second aside paragraph.`, and the callout still renders.
- The list embed becomes `- %% inlined … %%` followed by `  - Main point`,
  `    - Supporting detail` and `    - Another detail`.
- The mid-line embed becomes
  `See %% inlined from [[Sources/Deep#^d1]] on <today> %% Deepest paragraph. inline.`
- The missing embed shows the notice "Can't inline: Sources/Missing#^nope not found",
  and the text is unchanged.
- `![[diagram.png]]` shows no *Inline transclusion* menu item.
- The command-palette entry *Inline transclusion under cursor* appears only while
  the cursor is on a note embed.
- `Sources/Quotes.md` is unchanged after all of this.

### ⋯ button (Live Preview)

In `Inline playground.md`, switch to Live Preview (Reading view is out of scope
for the ⋯ button).
- Hovering a note embed reveals a ⋯ button immediately left of Obsidian's expand
  icon; hovering `![[diagram.png]]` shows no ⋯ button.
- Clicking ⋯ opens a menu without moving the cursor into the embed or opening the
  note.
- *Inline transclusion* from that menu works for the plain (`![[Sources/Quotes#^q1]]`),
  callout, list-item, and mid-line (`![[Sources/Deep#^d1]] inline.`) embeds, with
  the same results as above. One Cmd-Z undoes each.
- On the line `See ![[Sources/Deep#^d1]] and ![[Sources/Quotes#^q1]] together.`,
  each embed's own ⋯ button inlines that embed specifically (not the other one on
  the line).
- Clicking ⋯ on `![[Sources/Missing#^nope]]`, then *Inline transclusion*, shows
  the notice "Can't inline: Sources/Missing#^nope not found", and the text is
  unchanged. (If Obsidian doesn't render the missing embed as an embed box at
  all, there may be no ⋯ button to click — use right-click or the command
  palette instead, which cover this case regardless.)
