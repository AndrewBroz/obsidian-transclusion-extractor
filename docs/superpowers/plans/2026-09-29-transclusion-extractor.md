# Transclusion Extractor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An Obsidian desktop plugin that (1) exports a transclusion-built note as a new `.md` file with every `![[...]]` expanded, and (2) inlines a single transclusion into the parent note as an editable fork.

**Architecture:**
- **Pure core.** Pure TypeScript text transforms in `src/transforms/`, plus a pure recursive expander in `src/resolver/expand.ts` that receives its resolver as a function. All of this is fully unit-tested with Vitest.
- **Thin Obsidian layer.** A resolver in `src/resolver/EmbedResolver.ts` turns an embed into its text using `metadataCache` and `resolveSubpath`.
- **Features and UI.** The export and inline features, plus the UI, wire the pure core to Obsidian.

**Tech Stack:** TypeScript, esbuild, the Obsidian API (`obsidian` npm types), Vitest, Node `fs`/`path` (desktop only), GitHub Actions, and BRAT for distribution.

**Spec:** `docs/superpowers/specs/2026-09-29-transclusion-extractor-design.md`

## Global Constraints

- **Plugin identity:** plugin ID `transclusion-extractor`; name `Transclusion Extractor`; `isDesktopOnly: true`; `minAppVersion` `1.5.0`.
- **No `obsidian` in the pure core:** nothing under `src/transforms/` and neither `src/resolver/expand.ts` nor `src/resolver/types.ts` may import `obsidian`. Vitest cannot load the `obsidian` package, because it ships types only.
- **Source notes are never modified** by any feature.
- **Wikilinks** (`[[...]]`) and non-note embeds (`![[image.png]]`) pass through unchanged. There is no wikilink conversion.
- **Release tags** have no `v` prefix (`0.1.0`), and each release attaches exactly `main.js`, `manifest.json` and `styles.css`.
- **Built-in presets:**
  - **Publish** (default): stripBlockIds on, stripComments on, keepParentFrontmatter off, shiftHeadings on, provenance off.
  - **Snapshot:** stripBlockIds off, stripComments off, keepParentFrontmatter on, shiftHeadings on, provenance off.
- **Inline marker format:** `%% inlined from [[<target>]] on YYYY-MM-DD %%`
- **Warning callouts:** `> [!warning] Missing: <target>` and `> [!warning] Circular transclusion: <target>`
- **Commit trailer:** every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A referenced block ID in a mid-sentence embed.** In `See ![[N#^a]] now`, the `^a` must not survive in the middle of the line. It is stripped when the text is inserted (test in Task 9).
2. **Embeds inside table cells use an escaped pipe.** `![[Note\|alias]]` must parse as target `Note` (test in Task 6).
3. **Notes with CRLF line endings.** The resolver must slice raw text using cached offsets *before* normalizing, and expansion must normalize (tests in Task 9; resolver code in Task 11).
4. **Headings inside fenced code** in the parent or in embedded content must be neither shifted nor counted as heading context (tests in Tasks 5 and 9).
5. **An empty target note or empty section.** A block embed of empty content removes the line cleanly; a mid-line embed of empty content leaves no double space (test in Task 8).

---

## File Map

```
obsidian-transclusion-extractor/
├── package.json, tsconfig.json, esbuild.config.mjs, vitest.config.ts
├── manifest.json, versions.json, version-bump.mjs, .npmrc, .gitignore, styles.css
├── README.md
├── .github/workflows/release.yml
├── src/
│   ├── main.ts                       # plugin entry: commands, menus, settings tab
│   ├── settings.ts                   # PURE: option/preset types, defaults, loadSettings, uniqueName
│   ├── paths.ts                      # PURE: vaultRelative()
│   ├── transforms/                   # PURE
│   │   ├── codeRegions.ts            # fenced/inline code + %% comment ranges
│   │   ├── text.ts                   # normalizeNewlines, trimBlankLines, removeSpan
│   │   ├── stripComments.ts
│   │   ├── stripBlockIds.ts
│   │   ├── frontmatter.ts
│   │   ├── pipeline.ts
│   │   ├── headings.ts               # headingLevel, min/last level, computeShift, shiftHeadings
│   │   ├── embeds.ts                 # findEmbeds, embedAt, blockIdOf, looksLikeAttachment
│   │   ├── prefix.ts                 # quote/list prefixes
│   │   ├── spacing.ts                # classifyLine, wouldMerge, separators, isSingleParagraph
│   │   ├── splice.ts                 # spliceEmbed: one embed → replacement lines
│   │   ├── inline.ts                 # buildInlineReplacement
│   │   └── sectionRange.ts           # headingEndOffset, listItemEndOffset
│   ├── resolver/
│   │   ├── types.ts                  # PURE: Resolve, ResolveResult
│   │   ├── expand.ts                 # PURE: expandDocument (resolver injected)
│   │   ├── EmbedResolver.ts          # Obsidian: createResolver(app)
│   │   └── freshness.ts              # Obsidian: flushEditors(app)
│   ├── features/
│   │   ├── exportDocument.ts         # Obsidian: buildExport, writeExport, targets
│   │   └── inlineEmbed.ts            # Obsidian: embedUnderCursor, isNoteEmbed, inlineEmbed
│   └── ui/
│       ├── optionLabels.ts
│       ├── saveDialog.ts
│       ├── ExportModal.ts
│       └── SettingsTab.ts
├── tests/*.test.ts
└── test-vault/                        # fixture notes + expected/ outputs
```

---

### Task 1: Project scaffold and build/test harness

**Files:**
- Create: `package.json`, `tsconfig.json`, `esbuild.config.mjs`, `vitest.config.ts`, `manifest.json`, `versions.json`, `version-bump.mjs`, `.npmrc`, `.gitignore`, `styles.css`, `src/main.ts`, `test-vault/.obsidian/community-plugins.json`

**Interfaces:**
- Produces: `npm run build` (typecheck plus production bundle to `./main.js`), `npm run dev` (watch build into the test vault), `npm test` (Vitest).

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "obsidian-transclusion-extractor",
  "version": "0.1.0",
  "description": "Export transclusion-built notes with every embed expanded, or inline a single transclusion for separate editing.",
  "main": "main.js",
  "type": "module",
  "private": true,
  "scripts": {
    "dev": "node esbuild.config.mjs",
    "build": "tsc -noEmit -skipLibCheck && node esbuild.config.mjs production",
    "test": "vitest run --passWithNoTests",
    "test:watch": "vitest",
    "version": "node version-bump.mjs && git add manifest.json versions.json"
  },
  "license": "MIT"
}
```

- [ ] **Step 2: Install dev dependencies (let npm choose current versions)**

Run: `npm install -D obsidian typescript esbuild vitest @types/node`
Expected: `node_modules/` is created and `package.json` gains a `devDependencies` block.

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "module": "ESNext",
    "target": "ES2018",
    "lib": ["DOM", "ES2022"],
    "moduleResolution": "bundler",
    "strict": true,
    "noImplicitAny": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node"],
    "inlineSourceMap": true,
    "inlineSources": true
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
```

- [ ] **Step 4: Create `esbuild.config.mjs`**

```js
import esbuild from "esbuild";
import process from "process";
import { builtinModules } from "node:module";
import { copyFile, mkdir } from "node:fs/promises";

const prod = process.argv[2] === "production";
const outdir = prod ? "." : "test-vault/.obsidian/plugins/transclusion-extractor";

const copyStatic = {
  name: "copy-static",
  setup(build) {
    build.onEnd(async () => {
      if (prod) return;
      await mkdir(outdir, { recursive: true });
      for (const f of ["manifest.json", "styles.css"]) await copyFile(f, `${outdir}/${f}`);
    });
  },
};

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
    ...builtinModules,
    ...builtinModules.map((m) => `node:${m}`),
  ],
  format: "cjs",
  target: "es2018",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  minify: prod,
  outfile: `${outdir}/main.js`,
  plugins: [copyStatic],
});

if (prod) {
  await context.rebuild();
  process.exit(0);
} else {
  await context.watch();
}
```

- [ ] **Step 5: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
```

- [ ] **Step 6: Create the manifest, versions and version-bump files**

`manifest.json`:

```json
{
  "id": "transclusion-extractor",
  "name": "Transclusion Extractor",
  "version": "0.1.0",
  "minAppVersion": "1.5.0",
  "description": "Export notes built from transclusions with every embed expanded, or inline a single transclusion for separate editing.",
  "author": "Andrew Broz",
  "isDesktopOnly": true
}
```

`versions.json`:

```json
{
  "0.1.0": "1.5.0"
}
```

`version-bump.mjs`:

```js
import { readFileSync, writeFileSync } from "fs";

const targetVersion = process.env.npm_package_version;

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const { minAppVersion } = manifest;
manifest.version = targetVersion;
writeFileSync("manifest.json", JSON.stringify(manifest, null, "\t") + "\n");

const versions = JSON.parse(readFileSync("versions.json", "utf8"));
versions[targetVersion] = minAppVersion;
writeFileSync("versions.json", JSON.stringify(versions, null, "\t") + "\n");
```

`.npmrc` (so that `npm version` creates tags without a `v` prefix, as Obsidian and BRAT expect):

```
tag-version-prefix=""
```

- [ ] **Step 7: Create `.gitignore`, `styles.css`, a stub `src/main.ts` and the test-vault plugin list**

`.gitignore`:

```
node_modules/
main.js
*.map
.DS_Store
test-vault/.obsidian/plugins/transclusion-extractor/main.js
test-vault/.obsidian/plugins/transclusion-extractor/manifest.json
test-vault/.obsidian/plugins/transclusion-extractor/styles.css
test-vault/.obsidian/plugins/transclusion-extractor/data.json
test-vault/.obsidian/workspace*.json
```

`styles.css`:

```css
.transclusion-extractor-modal .te-path {
  font-family: var(--font-monospace);
  font-size: var(--font-ui-smaller);
  color: var(--text-muted);
  word-break: break-all;
}

.transclusion-extractor-modal .te-warning {
  color: var(--text-warning);
  font-size: var(--font-ui-smaller);
}

.te-preset-option {
  padding-inline-start: 1.5em;
}
```

`src/main.ts` (a stub, replaced in Task 13):

```ts
import { Plugin } from "obsidian";

export default class TransclusionExtractorPlugin extends Plugin {
  async onload(): Promise<void> {}
}
```

`test-vault/.obsidian/community-plugins.json`:

```json
["transclusion-extractor"]
```

- [ ] **Step 8: Verify the build and the test runner**

Run: `npm run build && npm test`
Expected: the build finishes with no TypeScript errors, `./main.js` exists, and Vitest reports "No test files found" and exits 0.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold Obsidian plugin build and test harness"
```

---

### Task 2: Code and comment regions

**Files:**
- Create: `src/transforms/codeRegions.ts`
- Test: `tests/codeRegions.test.ts`

**Interfaces:**
- Produces:
  - `interface Range { start: number; end: number }`, a half-open range.
  - `inRanges(ranges: Range[], pos: number): boolean`
  - `findCodeRanges(text: string): Range[]`
  - `findCommentRanges(text: string, code?: Range[]): Range[]`
  - `findProtectedRanges(text: string): Range[]`, which is code plus comments.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { findCodeRanges, findCommentRanges, findProtectedRanges, inRanges } from "../src/transforms/codeRegions";

const slices = (text: string, ranges: { start: number; end: number }[]) => ranges.map((r) => text.slice(r.start, r.end));

describe("findCodeRanges", () => {
  it("covers a backtick fence including its closing line", () => {
    const text = "a\n```js\nx\n```\nb";
    expect(slices(text, findCodeRanges(text))).toEqual(["```js\nx\n```\n"]);
  });

  it("closes a tilde fence only with an equal-or-longer tilde run", () => {
    const text = "~~~~\ncode ~~~\n~~~~\nafter";
    expect(slices(text, findCodeRanges(text))).toEqual(["~~~~\ncode ~~~\n~~~~\n"]);
  });

  it("runs an unclosed fence to the end of the text", () => {
    const text = "a\n```\nx";
    expect(slices(text, findCodeRanges(text))).toEqual(["```\nx"]);
  });

  it("finds fences inside blockquotes", () => {
    const text = "> ```\n> x\n> ```\nafter";
    expect(slices(text, findCodeRanges(text))).toEqual(["> ```\n> x\n> ```\n"]);
  });

  it("finds inline code, matching backtick run lengths", () => {
    expect(slices("use `x` here", findCodeRanges("use `x` here"))).toEqual(["`x`"]);
    const text = "a ``b ` c`` d";
    expect(slices(text, findCodeRanges(text))).toEqual(["``b ` c``"]);
  });

  it("ignores an unmatched backtick", () => {
    expect(findCodeRanges("a ` b")).toEqual([]);
  });
});

describe("findCommentRanges", () => {
  it("finds inline and multi-line comments", () => {
    expect(slices("a %%hidden%% b", findCommentRanges("a %%hidden%% b"))).toEqual(["%%hidden%%"]);
    const text = "a\n%%\nx\n%%\nb";
    expect(slices(text, findCommentRanges(text))).toEqual(["%%\nx\n%%"]);
  });

  it("returns nothing for an unclosed comment", () => {
    expect(findCommentRanges("a %% b")).toEqual([]);
  });

  it("ignores %% inside code", () => {
    const text = "`%%` and %%real%%";
    expect(slices(text, findCommentRanges(text))).toEqual(["%%real%%"]);
  });
});

describe("findProtectedRanges / inRanges", () => {
  it("merges code and comment ranges", () => {
    const text = "`a` %%b%%";
    expect(slices(text, findProtectedRanges(text))).toEqual(["`a`", "%%b%%"]);
  });

  it("treats ranges as half-open", () => {
    expect(inRanges([{ start: 2, end: 4 }], 2)).toBe(true);
    expect(inRanges([{ start: 2, end: 4 }], 4)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/codeRegions.test.ts`
Expected: FAIL, "Failed to resolve import ../src/transforms/codeRegions".

- [ ] **Step 3: Implement `src/transforms/codeRegions.ts`**

```ts
/** Half-open character range [start, end). */
export interface Range {
  start: number;
  end: number;
}

const FENCE = /^[ \t]*(?:>[ \t]?)*[ \t]*(`{3,}|~{3,})/;

export function inRanges(ranges: Range[], pos: number): boolean {
  return ranges.some((r) => pos >= r.start && pos < r.end);
}

/** Fenced code blocks and inline code spans. */
export function findCodeRanges(text: string): Range[] {
  const fenced = findFencedRanges(text);
  return mergeRanges([...fenced, ...findInlineCodeRanges(text, fenced)]);
}

/** Obsidian %%comments%% outside code. An unclosed %% produces no range. */
export function findCommentRanges(text: string, code: Range[] = findCodeRanges(text)): Range[] {
  const ranges: Range[] = [];
  let from = 0;
  for (;;) {
    const open = indexOutside(text, "%%", from, code);
    if (open === -1) break;
    const close = indexOutside(text, "%%", open + 2, code);
    if (close === -1) break;
    ranges.push({ start: open, end: close + 2 });
    from = close + 2;
  }
  return ranges;
}

/** Everything that must not be treated as live Markdown: code and comments. */
export function findProtectedRanges(text: string): Range[] {
  const code = findCodeRanges(text);
  return mergeRanges([...code, ...findCommentRanges(text, code)]);
}

function findFencedRanges(text: string): Range[] {
  const ranges: Range[] = [];
  let open: { start: number; char: string; len: number } | null = null;
  let pos = 0;
  while (pos < text.length) {
    const nl = text.indexOf("\n", pos);
    const lineEnd = nl === -1 ? text.length : nl + 1;
    const line = text.slice(pos, nl === -1 ? text.length : nl);
    const m = FENCE.exec(line);
    if (open) {
      const rest = m ? line.slice(m.index + m[0].length) : "";
      if (m && m[1][0] === open.char && m[1].length >= open.len && rest.trim() === "") {
        ranges.push({ start: open.start, end: lineEnd });
        open = null;
      }
    } else if (m) {
      open = { start: pos, char: m[1][0], len: m[1].length };
    }
    pos = lineEnd;
  }
  if (open) ranges.push({ start: open.start, end: text.length });
  return ranges;
}

function findInlineCodeRanges(text: string, skip: Range[]): Range[] {
  const ranges: Range[] = [];
  let i = 0;
  while (i < text.length) {
    const fence = skip.find((r) => i >= r.start && i < r.end);
    if (fence) {
      i = fence.end;
      continue;
    }
    if (text[i] !== "`") {
      i++;
      continue;
    }
    let n = 0;
    while (text[i + n] === "`") n++;
    const close = findBacktickRun(text, i + n, n, skip);
    if (close === -1) {
      i += n;
      continue;
    }
    ranges.push({ start: i, end: close + n });
    i = close + n;
  }
  return ranges;
}

function findBacktickRun(text: string, from: number, n: number, skip: Range[]): number {
  let j = from;
  while (j < text.length) {
    if (inRanges(skip, j)) return -1;
    if (text[j] === "`") {
      let m = 0;
      while (text[j + m] === "`") m++;
      if (m === n) return j;
      j += m;
      continue;
    }
    j++;
  }
  return -1;
}

function indexOutside(text: string, needle: string, from: number, ranges: Range[]): number {
  let i = text.indexOf(needle, from);
  while (i !== -1 && inRanges(ranges, i)) i = text.indexOf(needle, i + 1);
  return i;
}

function mergeRanges(ranges: Range[]): Range[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const out: Range[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else out.push({ ...r });
  }
  return out;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/codeRegions.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add src/transforms/codeRegions.ts tests/codeRegions.test.ts
git commit -m "feat: detect code and comment regions"
```

---

### Task 3: Text helpers, comment stripping, block-ID stripping

**Files:**
- Create: `src/transforms/text.ts`, `src/transforms/stripComments.ts`, `src/transforms/stripBlockIds.ts`
- Test: `tests/text.test.ts`, `tests/strip.test.ts`

**Interfaces:**
- Consumes: `findCodeRanges`, `findCommentRanges`, `inRanges`, `Range` (Task 2).
- Produces:
  - `normalizeNewlines(text: string): string`
  - `trimBlankLines(text: string): string`
  - `removeSpan(text: string, start: number, end: number): string`
  - `stripComments(text: string): string`
  - `stripBlockIds(text: string, only?: string): string`

- [ ] **Step 1: Write the failing tests**

`tests/text.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { normalizeNewlines, removeSpan, trimBlankLines } from "../src/transforms/text";

describe("normalizeNewlines", () => {
  it("converts CRLF and CR to LF", () => {
    expect(normalizeNewlines("a\r\nb\rc")).toBe("a\nb\nc");
  });
});

describe("trimBlankLines", () => {
  it("drops leading and trailing whitespace-only lines", () => {
    expect(trimBlankLines("\n\n  \nA\nB\n\n")).toBe("A\nB");
  });
  it("returns empty for whitespace-only text", () => {
    expect(trimBlankLines("  \n \n")).toBe("");
  });
  it("keeps indentation of the first content line", () => {
    expect(trimBlankLines("\n    code")).toBe("    code");
  });
});

describe("removeSpan", () => {
  it("removes an inline span and one adjacent space", () => {
    expect(removeSpan("keep XX this", 5, 7)).toBe("keep this");
  });
  it("removes a whole line when nothing else is on it", () => {
    expect(removeSpan("A\nXX\nB", 2, 4)).toBe("A\nB");
  });
  it("collapses the blank lines around a removed line", () => {
    expect(removeSpan("A\n\nXX\n\nB", 3, 5)).toBe("A\n\nB");
  });
  it("treats a quote marker as empty when deciding to remove the line", () => {
    expect(removeSpan("> A\n> XX", 6, 8)).toBe("> A");
  });
});
```

`tests/strip.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { stripBlockIds } from "../src/transforms/stripBlockIds";
import { stripComments } from "../src/transforms/stripComments";

describe("stripComments", () => {
  it("removes an inline comment without leaving a double space", () => {
    expect(stripComments("keep %%drop%% this")).toBe("keep this");
  });
  it("removes a trailing comment and its leading space", () => {
    expect(stripComments("keep %%drop%%")).toBe("keep");
  });
  it("removes a comment-only line and collapses the blank lines around it", () => {
    expect(stripComments("A\n\n%% note %%\n\nB")).toBe("A\n\nB");
  });
  it("removes a multi-line comment block", () => {
    expect(stripComments("A\n\n%%\nhidden\n%%\n\nB")).toBe("A\n\nB");
  });
  it("leaves an unclosed comment alone", () => {
    expect(stripComments("a %% b")).toBe("a %% b");
  });
  it("leaves comments inside code alone", () => {
    const text = "```\n%%x%%\n```";
    expect(stripComments(text)).toBe(text);
  });
});

describe("stripBlockIds", () => {
  it("removes a trailing block ID", () => {
    expect(stripBlockIds("Para ^abc-1")).toBe("Para");
    expect(stripBlockIds("Para ^abc\nNext")).toBe("Para\nNext");
  });
  it("removes extra whitespace before the ID", () => {
    expect(stripBlockIds("Para   ^abc")).toBe("Para");
  });
  it("removes an ID on its own line after a table", () => {
    expect(stripBlockIds("| a |\n| - |\n\n^tbl\n\nAfter")).toBe("| a |\n| - |\n\nAfter");
  });
  it("removes an ID-only line inside a quote", () => {
    expect(stripBlockIds("> Quote\n> ^q")).toBe("> Quote");
  });
  it("ignores carets that are not trailing block IDs", () => {
    expect(stripBlockIds("x ^y z")).toBe("x ^y z");
    expect(stripBlockIds("x^2")).toBe("x^2");
  });
  it("ignores IDs inside code", () => {
    const text = "```\nline ^id\n```";
    expect(stripBlockIds(text)).toBe(text);
  });
  it("removes only the requested ID when `only` is given", () => {
    expect(stripBlockIds("One ^a\nTwo ^b", "a")).toBe("One\nTwo ^b");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/text.test.ts tests/strip.test.ts`
Expected: FAIL with unresolved imports.

- [ ] **Step 3: Implement `src/transforms/text.ts`**

```ts
export function normalizeNewlines(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

/** Drop leading and trailing whitespace-only lines. */
export function trimBlankLines(text: string): string {
  if (text.trim() === "") return "";
  return text.replace(/^(?:[ \t]*\n)+/, "").replace(/(?:\n[ \t]*)+$/, "");
}

/**
 * Remove text[start, end). If nothing but whitespace (or quote markers) would remain
 * on the affected line(s), remove the whole line(s); if that leaves two blank lines
 * touching, drop one of them.
 */
export function removeSpan(text: string, start: number, end: number): string {
  const lineStart = text.lastIndexOf("\n", start - 1) + 1;
  const nl = text.indexOf("\n", end);
  const lineEnd = nl === -1 ? text.length : nl;
  const before = text.slice(lineStart, start);
  const after = text.slice(end, lineEnd);
  if (/^[\s>]*$/.test(before) && after.trim() === "") return removeLines(text, lineStart, lineEnd);
  let s = start;
  if (text[s - 1] === " " && (text[end] === " " || end === lineEnd)) s--;
  return text.slice(0, s) + text.slice(end);
}

function removeLines(text: string, lineStart: number, lineEnd: number): string {
  const lines = text.split("\n");
  const first = text.slice(0, lineStart).split("\n").length - 1;
  const last = text.slice(0, lineEnd).split("\n").length - 1;
  lines.splice(first, last - first + 1);
  if (first > 0 && first < lines.length && lines[first - 1].trim() === "" && lines[first].trim() === "") {
    lines.splice(first, 1);
  }
  return lines.join("\n");
}
```

- [ ] **Step 4: Implement `src/transforms/stripComments.ts`**

```ts
import { findCommentRanges } from "./codeRegions";
import { removeSpan } from "./text";

/** Remove Obsidian %%comments%%. A comment that fills its line(s) removes those lines. */
export function stripComments(text: string): string {
  let out = text;
  for (const r of [...findCommentRanges(text)].reverse()) out = removeSpan(out, r.start, r.end);
  return out;
}
```

- [ ] **Step 5: Implement `src/transforms/stripBlockIds.ts`**

```ts
import { findCodeRanges, inRanges, Range } from "./codeRegions";
import { removeSpan } from "./text";

/**
 * Remove block IDs (` ^id` at the end of a line, outside code). With `only`, remove just
 * that ID. A line holding nothing but the ID is removed entirely.
 */
export function stripBlockIds(text: string, only?: string): string {
  const id = only ? only.replace(/[^A-Za-z0-9-]/g, "") : "[A-Za-z0-9-]+";
  const pattern = new RegExp(`(^|[ \\t]+)\\^${id}[ \\t]*$`, "gm");
  const code = findCodeRanges(text);
  const spans: Range[] = [];
  for (const m of text.matchAll(pattern)) {
    const start = m.index ?? 0;
    if (inRanges(code, start + m[1].length)) continue;
    spans.push({ start, end: start + m[0].length });
  }
  let out = text;
  for (const s of spans.reverse()) out = removeSpan(out, s.start, s.end);
  return out;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/text.test.ts tests/strip.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/transforms/text.ts src/transforms/stripComments.ts src/transforms/stripBlockIds.ts tests/text.test.ts tests/strip.test.ts
git commit -m "feat: strip comments and block IDs outside code"
```

---

### Task 4: Settings model, frontmatter, and the transform pipeline

**Files:**
- Create: `src/settings.ts`, `src/transforms/frontmatter.ts`, `src/transforms/pipeline.ts`
- Test: `tests/settings.test.ts`, `tests/pipeline.test.ts`

**Interfaces:**
- Consumes: `stripComments`, `stripBlockIds` (Task 3).
- Produces:
  - `interface ExportOptions { stripBlockIds: boolean; stripComments: boolean; keepParentFrontmatter: boolean; shiftHeadings: boolean; provenance: boolean }`
  - `interface Preset { name: string; options: ExportOptions }`
  - `interface PluginSettings { presets: Preset[]; lastPreset: string }`
  - `PUBLISH: ExportOptions`, `SNAPSHOT: ExportOptions`, `OPTION_KEYS: (keyof ExportOptions)[]`
  - `defaultPresets(): Preset[]`, `loadSettings(data: unknown): PluginSettings`, `uniqueName(existing: string[], base: string): string`
  - `splitFrontmatter(text: string): { frontmatter: string; body: string }`, `stripFrontmatter(text: string): string`
  - `runPipeline(text: string, opts: ExportOptions): string`

- [ ] **Step 1: Write the failing tests**

`tests/settings.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { loadSettings, PUBLISH, SNAPSHOT, uniqueName } from "../src/settings";

describe("loadSettings", () => {
  it("returns Publish and Snapshot presets when nothing is saved", () => {
    const s = loadSettings(undefined);
    expect(s.presets.map((p) => p.name)).toEqual(["Publish", "Snapshot"]);
    expect(s.presets[0].options).toEqual(PUBLISH);
    expect(s.presets[1].options).toEqual(SNAPSHOT);
    expect(s.lastPreset).toBe("Publish");
  });

  it("fills option keys missing from saved presets", () => {
    const s = loadSettings({ presets: [{ name: "Mine", options: { provenance: true } }], lastPreset: "Mine" });
    expect(s.presets[0].options).toEqual({ ...PUBLISH, provenance: true });
    expect(s.lastPreset).toBe("Mine");
  });

  it("falls back to the first preset when lastPreset is unknown", () => {
    expect(loadSettings({ lastPreset: "Gone" }).lastPreset).toBe("Publish");
  });

  it("does not share option objects with the defaults", () => {
    const s = loadSettings(undefined);
    s.presets[0].options.provenance = true;
    expect(PUBLISH.provenance).toBe(false);
  });
});

describe("uniqueName", () => {
  it("appends a counter when the name is taken", () => {
    expect(uniqueName(["New preset"], "New preset")).toBe("New preset 2");
    expect(uniqueName(["New preset", "New preset 2"], "New preset")).toBe("New preset 3");
    expect(uniqueName([], "New preset")).toBe("New preset");
  });
});
```

`tests/pipeline.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PUBLISH, SNAPSHOT } from "../src/settings";
import { splitFrontmatter, stripFrontmatter } from "../src/transforms/frontmatter";
import { runPipeline } from "../src/transforms/pipeline";

describe("frontmatter", () => {
  it("splits YAML frontmatter from the body", () => {
    expect(splitFrontmatter("---\ntitle: x\n---\nBody")).toEqual({ frontmatter: "---\ntitle: x\n---\n", body: "Body" });
  });
  it("handles empty frontmatter", () => {
    expect(stripFrontmatter("---\n---\nBody")).toBe("Body");
  });
  it("leaves text without frontmatter alone", () => {
    expect(splitFrontmatter("Body\n---\n")).toEqual({ frontmatter: "", body: "Body\n---\n" });
  });
});

describe("runPipeline", () => {
  const input = "---\nt: 1\n---\n\n# H\n\nText ^a %%x%%\n";

  it("Publish strips comments before block IDs, then drops frontmatter", () => {
    expect(runPipeline(input, PUBLISH)).toBe("# H\n\nText\n");
  });

  it("Snapshot leaves everything in place", () => {
    expect(runPipeline(input, SNAPSHOT)).toBe(input);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/settings.test.ts tests/pipeline.test.ts`
Expected: FAIL with unresolved imports.

- [ ] **Step 3: Implement `src/settings.ts`**

```ts
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
```

- [ ] **Step 4: Implement `src/transforms/frontmatter.ts`**

```ts
const FRONTMATTER = /^---[ \t]*\r?\n(?:[\s\S]*?\r?\n)?---[ \t]*(?:\r?\n|$)/;

export function splitFrontmatter(text: string): { frontmatter: string; body: string } {
  const m = FRONTMATTER.exec(text);
  return m ? { frontmatter: m[0], body: text.slice(m[0].length) } : { frontmatter: "", body: text };
}

export function stripFrontmatter(text: string): string {
  return splitFrontmatter(text).body;
}
```

- [ ] **Step 5: Implement `src/transforms/pipeline.ts`**

```ts
import type { ExportOptions } from "../settings";
import { splitFrontmatter } from "./frontmatter";
import { stripBlockIds } from "./stripBlockIds";
import { stripComments } from "./stripComments";

/** Post-expansion cleanup, in fixed order: comments, then block IDs, then frontmatter. */
export function runPipeline(text: string, opts: ExportOptions): string {
  const { frontmatter, body } = splitFrontmatter(text);
  let out = body;
  if (opts.stripComments) out = stripComments(out);
  if (opts.stripBlockIds) out = stripBlockIds(out);
  return opts.keepParentFrontmatter ? frontmatter + out : out.replace(/^(?:[ \t]*\n)+/, "");
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/settings.test.ts tests/pipeline.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/settings.ts src/transforms/frontmatter.ts src/transforms/pipeline.ts tests/settings.test.ts tests/pipeline.test.ts
git commit -m "feat: add presets, frontmatter handling, and transform pipeline"
```

---

### Task 5: Heading levels and heading shift

**Files:**
- Create: `src/transforms/headings.ts`
- Test: `tests/headings.test.ts`

**Interfaces:**
- Consumes: `findCodeRanges`, `inRanges` (Task 2).
- Produces:
  - `headingLevel(line: string): number` (0 if the line is not a heading)
  - `minHeadingLevel(text: string): number`
  - `lastHeadingLevel(text: string): number`
  - `computeShift(contextLevel: number, content: string): number`
  - `shiftHeadings(text: string, by: number): string`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { computeShift, headingLevel, lastHeadingLevel, minHeadingLevel, shiftHeadings } from "../src/transforms/headings";

describe("headingLevel", () => {
  it("recognises ATX headings only", () => {
    expect(headingLevel("## A")).toBe(2);
    expect(headingLevel("#tag")).toBe(0);
    expect(headingLevel("####### seven")).toBe(0);
    expect(headingLevel("text")).toBe(0);
  });
});

describe("computeShift", () => {
  it("demotes so the top embedded heading sits one below the context", () => {
    expect(computeShift(3, "## S\ntext")).toBe(2);
  });
  it("never promotes", () => {
    expect(computeShift(1, "### X")).toBe(0);
  });
  it("is zero when the content has no headings", () => {
    expect(computeShift(2, "plain")).toBe(0);
  });
});

describe("shiftHeadings", () => {
  it("demotes every heading", () => {
    expect(shiftHeadings("## A\ntext\n### B", 2)).toBe("#### A\ntext\n##### B");
  });
  it("clamps at H6", () => {
    expect(shiftHeadings("##### A", 3)).toBe("###### A");
  });
  it("ignores lines inside fenced code (Review Focus 4)", () => {
    expect(shiftHeadings("```\n# not\n```\n# yes", 1)).toBe("```\n# not\n```\n## yes");
    expect(minHeadingLevel("```\n# c\n```\n### h")).toBe(3);
  });
});

describe("lastHeadingLevel", () => {
  it("returns the level of the last heading, or 0", () => {
    expect(lastHeadingLevel("# a\n## b\ntext")).toBe(2);
    expect(lastHeadingLevel("text")).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/headings.test.ts`
Expected: FAIL with an unresolved import.

- [ ] **Step 3: Implement `src/transforms/headings.ts`**

```ts
import { findCodeRanges, inRanges } from "./codeRegions";

const HEADING = /^(#{1,6})(?=[ \t]|$)/;

export function headingLevel(line: string): number {
  const m = HEADING.exec(line);
  return m ? m[1].length : 0;
}

function eachHeading(text: string, fn: (lineStart: number, level: number) => void): void {
  const code = findCodeRanges(text);
  let pos = 0;
  for (const line of text.split("\n")) {
    const level = headingLevel(line);
    if (level > 0 && !inRanges(code, pos)) fn(pos, level);
    pos += line.length + 1;
  }
}

export function minHeadingLevel(text: string): number {
  let min = 0;
  eachHeading(text, (_, level) => {
    if (min === 0 || level < min) min = level;
  });
  return min;
}

export function lastHeadingLevel(text: string): number {
  let last = 0;
  eachHeading(text, (_, level) => {
    last = level;
  });
  return last;
}

/** How far to demote `content` so its top heading sits one level below `contextLevel`. */
export function computeShift(contextLevel: number, content: string): number {
  const min = minHeadingLevel(content);
  return min === 0 ? 0 : Math.max(0, contextLevel + 1 - min);
}

export function shiftHeadings(text: string, by: number): string {
  if (by <= 0) return text;
  const levels = new Map<number, number>();
  eachHeading(text, (start, level) => levels.set(start, level));
  let pos = 0;
  return text
    .split("\n")
    .map((line) => {
      const level = levels.get(pos);
      pos += line.length + 1;
      return level === undefined ? line : "#".repeat(Math.min(6, level + by)) + line.slice(level);
    })
    .join("\n");
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/headings.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/transforms/headings.ts tests/headings.test.ts
git commit -m "feat: compute and apply heading shifts"
```

---

### Task 6: Embed parsing

**Files:**
- Create: `src/transforms/embeds.ts`
- Test: `tests/embeds.test.ts`

**Interfaces:**
- Consumes: `findProtectedRanges`, `inRanges`, `Range` (Task 2).
- Produces:
  - `interface EmbedRef { start: number; end: number; raw: string; target: string; linkpath: string; subpath: string; alias: string | null }`. `target` is the linkpath plus the subpath, without the alias. `subpath` keeps its leading `#`, or is `""`.
  - `findEmbeds(text: string, skip?: Range[]): EmbedRef[]`
  - `embedAt(text: string, offset: number): EmbedRef | null`
  - `blockIdOf(subpath: string): string | null`
  - `looksLikeAttachment(linkpath: string): boolean`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { blockIdOf, embedAt, findEmbeds, looksLikeAttachment } from "../src/transforms/embeds";

describe("findEmbeds", () => {
  it("parses note, heading, block and alias forms", () => {
    const [a, b, c] = findEmbeds("![[Note]] ![[Note#Head]] ![[Dir/Note#^id|Alias]]");
    expect(a).toMatchObject({ start: 0, end: 9, target: "Note", linkpath: "Note", subpath: "", alias: null });
    expect(b).toMatchObject({ target: "Note#Head", linkpath: "Note", subpath: "#Head" });
    expect(c).toMatchObject({ target: "Dir/Note#^id", linkpath: "Dir/Note", subpath: "#^id", alias: "Alias" });
  });

  it("keeps nested heading paths in the subpath", () => {
    expect(findEmbeds("![[Note#A#B]]")[0].subpath).toBe("#A#B");
  });

  it("parses an escaped pipe used inside table cells (Review Focus 2)", () => {
    const [e] = findEmbeds("| ![[Note\\|alias]] |");
    expect(e).toMatchObject({ target: "Note", linkpath: "Note", alias: "alias" });
  });

  it("ignores plain wikilinks", () => {
    expect(findEmbeds("[[Note]]")).toEqual([]);
  });

  it("skips embeds inside code and comments", () => {
    expect(findEmbeds("`![[A]]` %% ![[B]] %%\n```\n![[C]]\n```\n![[D]]").map((e) => e.target)).toEqual(["D"]);
  });

  it("does not match across lines", () => {
    expect(findEmbeds("![[A\nB]]")).toEqual([]);
  });
});

describe("embedAt", () => {
  const text = "x ![[A]] y";
  it("finds the embed at or touching the offset", () => {
    expect(embedAt(text, 2)?.target).toBe("A");
    expect(embedAt(text, 8)?.target).toBe("A");
  });
  it("returns null outside embeds", () => {
    expect(embedAt(text, 0)).toBeNull();
  });
});

describe("helpers", () => {
  it("blockIdOf extracts block IDs only", () => {
    expect(blockIdOf("#^abc")).toBe("abc");
    expect(blockIdOf("#Heading")).toBeNull();
    expect(blockIdOf("")).toBeNull();
  });
  it("looksLikeAttachment recognises non-note extensions", () => {
    expect(looksLikeAttachment("diagram.png")).toBe(true);
    expect(looksLikeAttachment("paper.PDF")).toBe(true);
    expect(looksLikeAttachment("Note")).toBe(false);
    expect(looksLikeAttachment("Note.v2")).toBe(false);
    expect(looksLikeAttachment("Note.md")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/embeds.test.ts`
Expected: FAIL with an unresolved import.

- [ ] **Step 3: Implement `src/transforms/embeds.ts`**

```ts
import { findProtectedRanges, inRanges, Range } from "./codeRegions";

export interface EmbedRef {
  start: number;
  end: number;
  raw: string;
  /** Link path plus subpath, without alias, e.g. "Note#^id". */
  target: string;
  linkpath: string;
  /** Keeps its leading "#", or "" for a whole-note embed. */
  subpath: string;
  alias: string | null;
}

const EMBED = /!\[\[([^[\]|\n]+?)(?:\\?\|([^[\]\n]*))?\]\]/g;

const ATTACHMENT_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "bmp", "svg", "webp", "avif",
  "pdf",
  "mp3", "wav", "m4a", "ogg", "3gp", "flac",
  "mp4", "webm", "mov", "mkv", "ogv",
  "canvas", "base",
]);

export function findEmbeds(text: string, skip: Range[] = findProtectedRanges(text)): EmbedRef[] {
  const refs: EmbedRef[] = [];
  for (const m of text.matchAll(EMBED)) {
    const start = m.index ?? 0;
    if (inRanges(skip, start)) continue;
    const target = m[1].trim();
    const hash = target.indexOf("#");
    refs.push({
      start,
      end: start + m[0].length,
      raw: m[0],
      target,
      linkpath: (hash === -1 ? target : target.slice(0, hash)).trim(),
      subpath: hash === -1 ? "" : target.slice(hash).trim(),
      alias: m[2] ?? null,
    });
  }
  return refs;
}

export function embedAt(text: string, offset: number): EmbedRef | null {
  return findEmbeds(text).find((e) => offset >= e.start && offset <= e.end) ?? null;
}

export function blockIdOf(subpath: string): string | null {
  return subpath.startsWith("#^") ? subpath.slice(2) : null;
}

export function looksLikeAttachment(linkpath: string): boolean {
  const ext = /\.([^./]+)$/.exec(linkpath)?.[1]?.toLowerCase();
  return ext !== undefined && ATTACHMENT_EXTENSIONS.has(ext);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/embeds.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/transforms/embeds.ts tests/embeds.test.ts
git commit -m "feat: parse transclusion embeds"
```

---

### Task 7: Line prefixes and context-aware spacing

**Files:**
- Create: `src/transforms/prefix.ts`, `src/transforms/spacing.ts`
- Test: `tests/prefix.test.ts`, `tests/spacing.test.ts`

**Interfaces:**
- Produces:
  - `interface LinePrefix { first: string; rest: string; blank: string; inList: boolean; inQuote: boolean }`
  - `parseLinePrefix(before: string): LinePrefix | null`, which returns null when `before` contains text rather than only quote, indent or list markers.
  - `applyPrefix(lines: string[], p: LinePrefix): string[]`
  - `stripQuote(line: string): string`
  - `type LineKind = "blank" | "heading" | "fence" | "quote" | "table" | "rule" | "list" | "paragraph" | "other"`
  - `classifyLine(line: string | null): LineKind`
  - `wouldMerge(upper: LineKind, lower: LineKind): boolean`
  - `interface JoinContext { prev: string | null; next: string | null; inList: boolean }`
  - `separators(content: string, ctx: JoinContext): { above: boolean; below: boolean }`
  - `isSingleParagraph(content: string): boolean`, `toInline(content: string): string`

> **Human contribution:** during execution, the human partner writes the body of `wouldMerge`. It is the core rule for "context-aware, not blind" spacing that they asked for. The tests in Step 1 describe the intended behaviour; the reference body in Step 4 is the fallback.

- [ ] **Step 1: Write the failing tests**

`tests/prefix.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { applyPrefix, parseLinePrefix, stripQuote } from "../src/transforms/prefix";

describe("parseLinePrefix", () => {
  it("accepts an empty prefix", () => {
    expect(parseLinePrefix("")).toEqual({ first: "", rest: "", blank: "", inList: false, inQuote: false });
  });
  it("handles single and nested quotes", () => {
    expect(parseLinePrefix("> ")).toMatchObject({ rest: "> ", blank: ">", inQuote: true, inList: false });
    expect(parseLinePrefix("> > ")).toMatchObject({ rest: "> > ", blank: "> >" });
  });
  it("handles bullet, ordered and task list markers", () => {
    expect(parseLinePrefix("- ")).toMatchObject({ rest: "  ", inList: true });
    expect(parseLinePrefix("  1. ")).toMatchObject({ rest: "     ", inList: true });
    expect(parseLinePrefix("- [ ] ")).toMatchObject({ rest: "      ", inList: true });
  });
  it("treats indentation-only prefixes as list continuation", () => {
    expect(parseLinePrefix("    ")).toMatchObject({ inList: true, rest: "    " });
  });
  it("rejects prefixes containing text", () => {
    expect(parseLinePrefix("See ")).toBeNull();
    expect(parseLinePrefix("2019 ")).toBeNull();
  });
});

describe("applyPrefix", () => {
  it("prefixes quote lines and turns blanks into bare markers", () => {
    expect(applyPrefix(["a", "", "b"], parseLinePrefix("> ")!)).toEqual(["> a", ">", "> b"]);
  });
  it("uses the marker on the first line and indentation after", () => {
    expect(applyPrefix(["a", "b"], parseLinePrefix("- ")!)).toEqual(["- a", "  b"]);
  });
});

describe("stripQuote", () => {
  it("removes leading quote markers", () => {
    expect(stripQuote("> > text")).toBe("text");
  });
});
```

`tests/spacing.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { classifyLine, isSingleParagraph, separators, toInline, wouldMerge } from "../src/transforms/spacing";

describe("classifyLine", () => {
  it("classifies Markdown line types", () => {
    expect(classifyLine(null)).toBe("blank");
    expect(classifyLine("  ")).toBe("blank");
    expect(classifyLine("## H")).toBe("heading");
    expect(classifyLine("[!note] Title")).toBe("heading");
    expect(classifyLine("```js")).toBe("fence");
    expect(classifyLine("> q")).toBe("quote");
    expect(classifyLine("| a |")).toBe("table");
    expect(classifyLine("---")).toBe("rule");
    expect(classifyLine("- item")).toBe("list");
    expect(classifyLine("12. item")).toBe("list");
    expect(classifyLine("^abc")).toBe("other");
    expect(classifyLine("Plain text")).toBe("paragraph");
  });
});

describe("wouldMerge", () => {
  it("never merges across a blank line", () => {
    expect(wouldMerge("blank", "paragraph")).toBe(false);
    expect(wouldMerge("paragraph", "blank")).toBe(false);
  });
  it("merges paragraph text into the paragraph, list, table or quote above it", () => {
    expect(wouldMerge("paragraph", "paragraph")).toBe(true);
    expect(wouldMerge("list", "paragraph")).toBe(true);
    expect(wouldMerge("table", "paragraph")).toBe(true);
    expect(wouldMerge("quote", "paragraph")).toBe(true);
  });
  it("needs a blank line before a table", () => {
    expect(wouldMerge("paragraph", "table")).toBe(true);
  });
  it("turns paragraph + --- into a setext heading", () => {
    expect(wouldMerge("paragraph", "rule")).toBe(true);
  });
  it("does not merge where Markdown starts a new block anyway", () => {
    expect(wouldMerge("heading", "paragraph")).toBe(false);
    expect(wouldMerge("paragraph", "heading")).toBe(false);
    expect(wouldMerge("paragraph", "list")).toBe(false);
    expect(wouldMerge("fence", "paragraph")).toBe(false);
  });
});

describe("separators", () => {
  it("adds separators only where text would merge", () => {
    expect(separators("Body", { prev: "Text", next: "More", inList: false })).toEqual({ above: true, below: true });
    expect(separators("Body", { prev: "", next: "", inList: false })).toEqual({ above: false, below: false });
    expect(separators("Body", { prev: null, next: null, inList: false })).toEqual({ above: false, below: false });
  });
  it("never separates inside a list item", () => {
    expect(separators("Body", { prev: "Text", next: "More", inList: true })).toEqual({ above: false, below: false });
  });
  it("uses the content's first and last lines", () => {
    expect(separators("| a |\n| - |", { prev: "Text", next: null, inList: false })).toEqual({ above: true, below: false });
    expect(separators("- a\n- b", { prev: "Text", next: "After", inList: false })).toEqual({ above: false, below: true });
  });
});

describe("inline helpers", () => {
  it("isSingleParagraph", () => {
    expect(isSingleParagraph("one\ntwo")).toBe(true);
    expect(isSingleParagraph("one\n\ntwo")).toBe(false);
    expect(isSingleParagraph("- a")).toBe(false);
    expect(isSingleParagraph("")).toBe(false);
  });
  it("toInline joins soft-wrapped lines with spaces", () => {
    expect(toInline("one\n  two")).toBe("one two");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/prefix.test.ts tests/spacing.test.ts`
Expected: FAIL with unresolved imports.

- [ ] **Step 3: Implement `src/transforms/prefix.ts`**

```ts
export interface LinePrefix {
  /** Prefix for the first inserted line: the original text before the embed. */
  first: string;
  /** Prefix for following non-blank lines. */
  rest: string;
  /** What a blank line becomes: "" or the quote markers, e.g. ">". */
  blank: string;
  inList: boolean;
  inQuote: boolean;
}

const PREFIX = /^([ \t]*(?:>[ \t]?)*)([ \t]*)((?:[-*+]|\d+[.)])[ \t]+(?:\[[^\]]\][ \t]+)?)?$/;

/** Returns null when `before` holds real text, not just quote/indent/list markers. */
export function parseLinePrefix(before: string): LinePrefix | null {
  const m = PREFIX.exec(before);
  if (!m) return null;
  const [, quote, indent, marker = ""] = m;
  const inQuote = quote.includes(">");
  return {
    first: before,
    rest: quote + indent + " ".repeat(marker.length),
    blank: inQuote ? quote.trimEnd() : "",
    inList: marker !== "" || (!inQuote && (quote + indent).length > 0),
    inQuote,
  };
}

export function applyPrefix(lines: string[], p: LinePrefix): string[] {
  return lines.map((line, i) => (i === 0 ? p.first + line : line.trim() === "" ? p.blank : p.rest + line));
}

export function stripQuote(line: string): string {
  return line.replace(/^[ \t]*(?:>[ \t]?)*/, "");
}
```

- [ ] **Step 4: Implement `src/transforms/spacing.ts`** (the human partner writes the `wouldMerge` body; the reference is shown here)

```ts
export type LineKind = "blank" | "heading" | "fence" | "quote" | "table" | "rule" | "list" | "paragraph" | "other";

export function classifyLine(line: string | null): LineKind {
  if (line === null || line.trim() === "") return "blank";
  if (/^ {0,3}#{1,6}(?:[ \t]|$)/.test(line)) return "heading";
  if (/^[ \t]*\[![\w-]+\][+-]?/.test(line)) return "heading"; // callout title, quote markers already stripped
  if (/^[ \t]*(?:`{3,}|~{3,})/.test(line)) return "fence";
  if (/^[ \t]*>/.test(line)) return "quote";
  if (/^[ \t]*\|/.test(line)) return "table";
  if (/^[ \t]*(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/.test(line)) return "rule";
  if (/^[ \t]*(?:[-*+]|\d+[.)])(?:[ \t]|$)/.test(line)) return "list";
  if (/^[ \t]*\^[A-Za-z0-9-]+[ \t]*$/.test(line)) return "other";
  return "paragraph";
}

/**
 * Would a line of kind `lower`, placed directly under a line of kind `upper`,
 * be absorbed into (or change the meaning of) the block above?
 */
export function wouldMerge(upper: LineKind, lower: LineKind): boolean {
  if (upper === "blank" || lower === "blank") return false;
  if (lower === "table") return true;
  if (lower === "rule") return upper === "paragraph";
  if (lower === "paragraph") return upper === "paragraph" || upper === "list" || upper === "table" || upper === "quote";
  return false;
}

export interface JoinContext {
  prev: string | null;
  next: string | null;
  inList: boolean;
}

export function separators(content: string, ctx: JoinContext): { above: boolean; below: boolean } {
  if (ctx.inList) return { above: false, below: false };
  const lines = content.split("\n");
  return {
    above: wouldMerge(classifyLine(ctx.prev), classifyLine(lines[0])),
    below: wouldMerge(classifyLine(lines[lines.length - 1]), classifyLine(ctx.next)),
  };
}

export function isSingleParagraph(content: string): boolean {
  return content.split("\n").every((l) => classifyLine(l) === "paragraph");
}

export function toInline(content: string): string {
  return content
    .split("\n")
    .map((l) => l.trim())
    .join(" ");
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/prefix.test.ts tests/spacing.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/transforms/prefix.ts src/transforms/spacing.ts tests/prefix.test.ts tests/spacing.test.ts
git commit -m "feat: context-aware spacing and line prefixes"
```

---

### Task 8: Splicing one embed into its line

**Files:**
- Create: `src/transforms/splice.ts`
- Test: `tests/splice.test.ts`

**Interfaces:**
- Consumes: `parseLinePrefix`, `applyPrefix`, `stripQuote` (Task 7); `separators`, `isSingleParagraph`, `toInline` (Task 7).
- Produces:
  - `interface SpliceInput { line: string; start: number; end: number; content: string; prev: string | null; next: string | null }`, where `start` and `end` are columns within `line`.
  - `spliceEmbed(input: SpliceInput): string[]`, which returns the lines that replace `line`. **Invariant:** any text before the embed ends up in the first returned line, so callers can splice several embeds on one line from right to left.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { spliceEmbed } from "../src/transforms/splice";

const at = (line: string, content: string, prev: string | null = null, next: string | null = null) => {
  const start = line.indexOf("![[");
  const end = line.indexOf("]]", start) + 2;
  return spliceEmbed({ line, start, end, content, prev, next });
};

describe("spliceEmbed — embed alone on its line", () => {
  it("adds separators only where paragraphs would merge", () => {
    expect(at("![[x]]", "Body", "Para", "More")).toEqual(["", "Body", ""]);
    expect(at("![[x]]", "Body", "", "")).toEqual(["Body"]);
  });

  it("keeps a quote intact, using bare markers for blank lines", () => {
    expect(at("> ![[x]]", "p1\n\np2", "> Intro", null)).toEqual([">", "> p1", ">", "> p2"]);
  });

  it("does not add a separator after a callout title", () => {
    expect(at("> ![[x]]", "Body", "> [!note] Title", null)).toEqual(["> Body"]);
  });

  it("continues a list item with indentation and never adds blanks", () => {
    expect(at("- ![[x]]", "a\nb", "- first", "- third")).toEqual(["- a", "  b"]);
  });
});

describe("spliceEmbed — embed mid-line", () => {
  it("splices a single paragraph inline", () => {
    expect(at("See ![[x]] now.", "one\ntwo")).toEqual(["See one two now."]);
  });

  it("breaks multi-block content out onto its own lines", () => {
    expect(at("See ![[x]] now.", "- a\n- b")).toEqual(["See", "- a", "- b", "", "now."]);
  });
});

describe("spliceEmbed — empty content (Review Focus 5)", () => {
  it("removes a block embed line entirely", () => {
    expect(at("![[x]]", "", "A", "B")).toEqual([]);
  });
  it("leaves no double space mid-line", () => {
    expect(at("See ![[x]] now.", "")).toEqual(["See now."]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/splice.test.ts`
Expected: FAIL with an unresolved import.

- [ ] **Step 3: Implement `src/transforms/splice.ts`**

```ts
import { applyPrefix, parseLinePrefix, stripQuote } from "./prefix";
import { isSingleParagraph, separators, toInline } from "./spacing";

export interface SpliceInput {
  line: string;
  /** Column where the embed starts in `line`. */
  start: number;
  /** Column just past the embed in `line`. */
  end: number;
  content: string;
  /** Line directly above in the output, or null at the start. */
  prev: string | null;
  /** Line directly below in the parent, or null at the end. */
  next: string | null;
}

/**
 * Replace the embed at line[start, end) with `content`, returning the lines that replace `line`.
 * Text before the embed always lands in the first returned line.
 */
export function spliceEmbed({ line, start, end, content, prev, next }: SpliceInput): string[] {
  const before = line.slice(0, start);
  const after = line.slice(end);
  const prefix = after.trim() === "" ? parseLinePrefix(before) : null;

  if (prefix) {
    if (content.trim() === "") return [];
    const norm = (l: string | null) => (l !== null && prefix.inQuote ? stripQuote(l) : l);
    const sep = separators(content, { prev: norm(prev), next: norm(next), inList: prefix.inList });
    return [
      ...(sep.above ? [prefix.blank] : []),
      ...applyPrefix(content.split("\n"), prefix),
      ...(sep.below ? [prefix.blank] : []),
    ];
  }

  if (content.trim() === "") {
    const head = before.replace(/[ \t]+$/, "");
    const tail = after.replace(/^[ \t]+/, "");
    return [head && tail ? `${head} ${tail}` : head + tail];
  }

  if (isSingleParagraph(content)) return [before + toInline(content) + after];

  const head = before.trimEnd();
  const tail = after.trimStart();
  const sep = separators(content, {
    prev: head.trim() ? head : prev,
    next: tail.trim() ? tail : next,
    inList: false,
  });
  return [
    ...(head.trim() ? [head] : []),
    ...(sep.above ? [""] : []),
    ...content.split("\n"),
    ...(sep.below ? [""] : []),
    ...(tail.trim() ? [tail] : []),
  ];
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/splice.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/transforms/splice.ts tests/splice.test.ts
git commit -m "feat: splice embed content into its parent line"
```

---

### Task 9: Recursive expansion with an injected resolver

**Files:**
- Create: `src/resolver/types.ts`, `src/resolver/expand.ts`
- Test: `tests/expand.test.ts`

**Interfaces:**
- Consumes:
  - `findEmbeds`, `blockIdOf`, `EmbedRef` (Task 6)
  - `splitFrontmatter` (Task 4)
  - `computeShift`, `lastHeadingLevel`, `shiftHeadings` (Task 5)
  - `spliceEmbed` (Task 8)
  - `stripBlockIds`, `normalizeNewlines`, `trimBlankLines` (Task 3)
  - `findCodeRanges`, `inRanges` (Task 2)
- Produces:
  - ```ts
    type ResolveResult =
      | { ok: true; text: string; path: string; key: string }
      | { ok: false; reason: "missing-file" | "missing-subpath" | "not-markdown"; target: string };
    ```
  - `type Resolve = (ref: EmbedRef, sourcePath: string) => Promise<ResolveResult>`. The `key` is the vault path plus the subpath, and a whole-note key equals the path.
  - `interface ExpandOptions { shiftHeadings: boolean; provenance: boolean }`
  - `interface ExpandResult { text: string; warnings: number }`
  - `expandDocument(text: string, sourcePath: string, resolve: Resolve, opts: ExpandOptions): Promise<ExpandResult>`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { expandDocument } from "../src/resolver/expand";
import type { Resolve } from "../src/resolver/types";

function fakeResolve(files: Record<string, string>): Resolve {
  return async (ref) => {
    if (/\.(png|pdf)$/.test(ref.linkpath)) return { ok: false, reason: "not-markdown", target: ref.target };
    const key = ref.linkpath + ref.subpath;
    if (!(key in files)) return { ok: false, reason: "missing-file", target: ref.target };
    return { ok: true, text: files[key], path: ref.linkpath, key };
  };
}

const OPTS = { shiftHeadings: true, provenance: false };
const expand = (doc: string, files: Record<string, string>, opts = OPTS) => expandDocument(doc, "Root", fakeResolve(files), opts);

describe("expandDocument", () => {
  it("replaces a block embed and removes the referenced block ID", async () => {
    const r = await expand("Intro\n\n![[N#^a]]\n\nEnd", { "N#^a": "Hello ^a" });
    expect(r).toEqual({ text: "Intro\n\nHello\n\nEnd", warnings: 0 });
  });

  it("removes the referenced block ID even when splicing mid-line (Review Focus 1)", async () => {
    expect((await expand("Say ![[N#^a]] now", { "N#^a": "Hello ^a" })).text).toBe("Say Hello now");
  });

  it("expands nested embeds", async () => {
    const files = { Outer: "Outer text\n\n![[Inner#^i]]", "Inner#^i": "Inner text ^i" };
    expect((await expand("![[Outer]]", files)).text).toBe("Outer text\n\nInner text");
  });

  it("stops at cycles with a warning callout", async () => {
    const files = { A: "A text\n\n![[B]]", B: "B text\n\n![[A]]" };
    expect(await expand("![[A]]", files)).toEqual({
      text: "A text\n\nB text\n\n> [!warning] Circular transclusion: A",
      warnings: 1,
    });
  });

  it("marks missing targets and counts them", async () => {
    expect(await expand("A\n\n![[Nope#^x]]", {})).toEqual({ text: "A\n\n> [!warning] Missing: Nope#^x", warnings: 1 });
  });

  it("leaves non-note embeds verbatim", async () => {
    expect(await expand("![[pic.png]]", {})).toEqual({ text: "![[pic.png]]", warnings: 0 });
  });

  it("demotes embedded headings under the surrounding heading", async () => {
    const files = { "N#S": "## S\n\nBody\n\n### Sub\n\nMore" };
    expect((await expand("### Ctx\n\n![[N#S]]", files)).text).toBe("### Ctx\n\n#### S\n\nBody\n\n##### Sub\n\nMore");
    expect((await expand("### Ctx\n\n![[N#S]]", files, { ...OPTS, shiftHeadings: false })).text).toBe(
      "### Ctx\n\n## S\n\nBody\n\n### Sub\n\nMore",
    );
  });

  it("does not take heading context from lines inside code (Review Focus 4)", async () => {
    expect((await expand("```\n# not a heading\n```\n![[N#S]]", { "N#S": "# S" })).text).toBe("```\n# not a heading\n```\n# S");
  });

  it("wraps content in provenance comments when enabled", async () => {
    expect((await expand("![[N#^a]]", { "N#^a": "Hello ^a" }, { ...OPTS, provenance: true })).text).toBe(
      "<!-- from: N#^a -->\nHello\n<!-- /from -->",
    );
  });

  it("keeps parent frontmatter untouched", async () => {
    expect((await expand("---\nt: 1\n---\n![[N#^a]]", { "N#^a": "Hello ^a" })).text).toBe("---\nt: 1\n---\nHello");
  });

  it("normalizes CRLF in parent and target (Review Focus 3)", async () => {
    expect((await expand("Intro\r\n\r\n![[N#^a]]\r\n", { "N#^a": "Hello ^a\r\n" })).text).toBe("Intro\n\nHello\n");
  });

  it("does not expand embeds inside code", async () => {
    const doc = "```\n![[N#^a]]\n```";
    expect((await expand(doc, { "N#^a": "Hello" })).text).toBe(doc);
  });

  it("expands several embeds on one line", async () => {
    const files = { "N#^a": "Hello ^a", "N#^b": "World ^b" };
    expect((await expand("![[N#^a]] and ![[N#^b]]", files)).text).toBe("Hello and World");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/expand.test.ts`
Expected: FAIL with an unresolved import.

- [ ] **Step 3: Implement `src/resolver/types.ts`**

```ts
import type { EmbedRef } from "../transforms/embeds";

export type ResolveResult =
  | { ok: true; text: string; path: string; key: string }
  | { ok: false; reason: "missing-file" | "missing-subpath" | "not-markdown"; target: string };

/** Resolve one embed, relative to the note that contains it. */
export type Resolve = (ref: EmbedRef, sourcePath: string) => Promise<ResolveResult>;
```

- [ ] **Step 4: Implement `src/resolver/expand.ts`**

```ts
import { findCodeRanges, inRanges } from "../transforms/codeRegions";
import { blockIdOf, EmbedRef, findEmbeds } from "../transforms/embeds";
import { splitFrontmatter } from "../transforms/frontmatter";
import { computeShift, lastHeadingLevel, shiftHeadings } from "../transforms/headings";
import { spliceEmbed } from "../transforms/splice";
import { stripBlockIds } from "../transforms/stripBlockIds";
import { normalizeNewlines, trimBlankLines } from "../transforms/text";
import type { Resolve } from "./types";

export interface ExpandOptions {
  shiftHeadings: boolean;
  provenance: boolean;
}

export interface ExpandResult {
  text: string;
  warnings: number;
}

interface State {
  warnings: number;
}

export async function expandDocument(text: string, sourcePath: string, resolve: Resolve, opts: ExpandOptions): Promise<ExpandResult> {
  const { frontmatter, body } = splitFrontmatter(normalizeNewlines(text));
  const state: State = { warnings: 0 };
  const expanded = await expandText(body, sourcePath, [sourcePath], resolve, opts, state);
  return { text: frontmatter + expanded, warnings: state.warnings };
}

async function expandText(
  text: string,
  sourcePath: string,
  chain: string[],
  resolve: Resolve,
  opts: ExpandOptions,
  state: State,
): Promise<string> {
  const embeds = findEmbeds(text);
  if (embeds.length === 0) return text;
  const code = findCodeRanges(text);
  const lines = text.split("\n");
  const out: string[] = [];
  let context = 0;
  let lineStart = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineEnd = lineStart + line.length;
    const onLine = embeds.filter((e) => e.start >= lineStart && e.end <= lineEnd);
    let result = [line];
    for (const e of [...onLine].reverse()) {
      const content = await contentFor(e, context);
      if (content === null) continue;
      const [first, ...rest] = result;
      const spliced = spliceEmbed({
        line: first,
        start: e.start - lineStart,
        end: e.end - lineStart,
        content,
        prev: out.length > 0 ? out[out.length - 1] : null,
        next: rest.length > 0 ? rest[0] : (lines[i + 1] ?? null),
      });
      result = [...spliced, ...rest];
    }
    out.push(...result);
    if (!inRanges(code, lineStart)) context = lastHeadingLevel(result.join("\n")) || context;
    lineStart = lineEnd + 1;
  }
  return out.join("\n");

  async function contentFor(e: EmbedRef, contextLevel: number): Promise<string | null> {
    const r = await resolve(e, sourcePath);
    if (!r.ok) {
      if (r.reason === "not-markdown") return null;
      state.warnings++;
      return `> [!warning] Missing: ${e.target}`;
    }
    if (chain.includes(r.key)) {
      state.warnings++;
      return `> [!warning] Circular transclusion: ${e.target}`;
    }
    const raw = normalizeNewlines(r.text);
    const id = blockIdOf(e.subpath);
    const own = trimBlankLines(id ? stripBlockIds(raw, id) : raw);
    let content = await expandText(own, r.path, [...chain, r.key], resolve, opts, state);
    if (opts.shiftHeadings) content = shiftHeadings(content, computeShift(contextLevel, content));
    if (opts.provenance) content = `<!-- from: ${e.target} -->\n${content}\n<!-- /from -->`;
    return content;
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/expand.test.ts`
Expected: PASS (13 tests).

- [ ] **Step 6: Run the full suite and commit**

Run: `npm test`
Expected: all test files pass.

```bash
git add src/resolver/types.ts src/resolver/expand.ts tests/expand.test.ts
git commit -m "feat: recursive transclusion expansion with cycle detection"
```

---

### Task 10: Inline replacement builder

**Files:**
- Create: `src/transforms/inline.ts`
- Test: `tests/inline.test.ts`

**Interfaces:**
- Consumes: `classifyLine` (Task 7), `spliceEmbed` (Task 8), `stripBlockIds`, `normalizeNewlines`, `trimBlankLines` (Task 3).
- Produces:
  - `interface InlineInput { line: string; start: number; end: number; target: string; blockId: string | null; content: string; date: string; prev: string | null; next: string | null }`
  - `buildInlineReplacement(input: InlineInput): string`, the text that replaces the whole parent line.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { buildInlineReplacement, InlineInput } from "../src/transforms/inline";

const M = "%% inlined from [[N#^a]] on 2026-09-29 %%";

function build(line: string, content: string, extra: Partial<InlineInput> = {}): string {
  const start = line.indexOf("![[");
  const end = line.indexOf("]]", start) + 2;
  return buildInlineReplacement({
    line, start, end, target: "N#^a", blockId: "a", content, date: "2026-09-29", prev: "", next: "", ...extra,
  });
}

describe("buildInlineReplacement", () => {
  it("writes the marker, then the content without its own block ID", () => {
    expect(build("![[N#^a]]", "Hello ^a")).toBe(`${M}\nHello`);
  });

  it("keeps block IDs other than the referenced one", () => {
    expect(build("![[N#^a]]", "- Main ^a\n  - Child ^c")).toBe(`${M}\n- Main\n  - Child ^c`);
  });

  it("stays inside a quote", () => {
    expect(build("> ![[N#^a]]", "Hello ^a", { prev: "> Intro" })).toBe(`>\n> ${M}\n> Hello`);
  });

  it("inlines a single paragraph mid-sentence", () => {
    expect(build("See ![[N#^a]] now", "Hello ^a")).toBe(`See ${M} Hello now`);
  });

  it("puts a blank line between the marker and a table", () => {
    expect(build("![[N#^a]]", "| a |\n| - |", { blockId: null })).toBe(`${M}\n\n| a |\n| - |`);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/inline.test.ts`
Expected: FAIL with an unresolved import.

- [ ] **Step 3: Implement `src/transforms/inline.ts`**

```ts
import { classifyLine } from "./spacing";
import { spliceEmbed } from "./splice";
import { stripBlockIds } from "./stripBlockIds";
import { normalizeNewlines, trimBlankLines } from "./text";

export interface InlineInput {
  line: string;
  start: number;
  end: number;
  /** Embed target without alias, e.g. "Note#^id". */
  target: string;
  /** The referenced block ID to drop from the copy, if the embed targets a block. */
  blockId: string | null;
  content: string;
  /** YYYY-MM-DD */
  date: string;
  prev: string | null;
  next: string | null;
}

/** Text that replaces the whole parent line when one transclusion is inlined. */
export function buildInlineReplacement(input: InlineInput): string {
  const raw = normalizeNewlines(input.content);
  const content = trimBlankLines(input.blockId ? stripBlockIds(raw, input.blockId) : raw);
  const marker = `%% inlined from [[${input.target}]] on ${input.date} %%`;
  const gap = classifyLine(content.split("\n")[0]) === "table" ? "\n" : "";
  const withMarker = content === "" ? marker : `${marker}\n${gap}${content}`;
  return spliceEmbed({
    line: input.line,
    start: input.start,
    end: input.end,
    content: withMarker,
    prev: input.prev,
    next: input.next,
  }).join("\n");
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/inline.test.ts`
Expected: PASS. (In the quote case, the marker line is a paragraph and `prev` `> Intro` is a paragraph after the quote is stripped, so a `>` separator is added above.)

- [ ] **Step 5: Commit**

```bash
git add src/transforms/inline.ts tests/inline.test.ts
git commit -m "feat: build inline-transclusion replacement text"
```

---

### Task 11: Obsidian resolver, section ranges, editor flushing

**Files:**
- Create: `src/transforms/sectionRange.ts`, `src/resolver/EmbedResolver.ts`, `src/resolver/freshness.ts`
- Test: `tests/sectionRange.test.ts`

**Interfaces:**
- Consumes: `Resolve`, `ResolveResult` (Task 9); `looksLikeAttachment`, `EmbedRef` (Task 6); `stripFrontmatter` (Task 4); `normalizeNewlines`, `trimBlankLines` (Task 3).
- Produces:
  - `headingEndOffset(headings: HeadingLike[], index: number, textLength: number): number`
  - `listItemEndOffset(items: ListItemLike[], rootLine: number): number`
  - `createResolver(app: App): Resolve`
  - `flushEditors(app: App, timeoutMs?: number): Promise<void>`

- [ ] **Step 1: Write the failing tests for the pure range helpers**

```ts
import { describe, expect, it } from "vitest";
import { headingEndOffset, listItemEndOffset } from "../src/transforms/sectionRange";

const h = (level: number, offset: number) => ({ level, position: { start: { line: 0, offset } } });
const li = (line: number, parent: number, endOffset: number) => ({
  parent,
  position: { start: { line, offset: 0 }, end: { line, offset: endOffset } },
});

describe("headingEndOffset", () => {
  const headings = [h(1, 0), h(2, 10), h(3, 30), h(2, 50)];
  it("ends at the next heading of equal or higher level", () => {
    expect(headingEndOffset(headings, 1, 99)).toBe(50);
    expect(headingEndOffset(headings, 2, 99)).toBe(50);
  });
  it("runs to the end of the text when no such heading follows", () => {
    expect(headingEndOffset(headings, 3, 99)).toBe(99);
    expect(headingEndOffset(headings, 0, 99)).toBe(99);
  });
});

describe("listItemEndOffset", () => {
  const items = [li(0, -1, 7), li(1, -1, 14), li(2, 1, 24), li(3, 2, 35), li(4, -1, 43)];
  it("extends a list item to cover all descendants", () => {
    expect(listItemEndOffset(items, 1)).toBe(35);
  });
  it("covers only the item itself when it has no children", () => {
    expect(listItemEndOffset(items, 0)).toBe(7);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/sectionRange.test.ts`
Expected: FAIL with an unresolved import.

- [ ] **Step 3: Implement `src/transforms/sectionRange.ts`**

```ts
export interface Loc {
  line: number;
  offset: number;
}

export interface HeadingLike {
  level: number;
  position: { start: Loc };
}

export interface ListItemLike {
  /** Line of the parent list item; negative for top-level items. */
  parent: number;
  position: { start: Loc; end: Loc };
}

/** End offset of the section started by headings[index]: the next heading of equal or higher level. */
export function headingEndOffset(headings: HeadingLike[], index: number, textLength: number): number {
  const level = headings[index].level;
  for (let j = index + 1; j < headings.length; j++) {
    if (headings[j].level <= level) return headings[j].position.start.offset;
  }
  return textLength;
}

/** End offset of the list item on `rootLine`, including all of its descendant items. */
export function listItemEndOffset(items: ListItemLike[], rootLine: number): number {
  const members = new Set([rootLine]);
  let end = -1;
  const sorted = [...items].sort((a, b) => a.position.start.line - b.position.start.line);
  for (const item of sorted) {
    const line = item.position.start.line;
    if (line === rootLine || (line > rootLine && members.has(item.parent))) {
      members.add(line);
      end = Math.max(end, item.position.end.offset);
    }
  }
  return end;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/sectionRange.test.ts`
Expected: PASS.

- [ ] **Step 5: Confirm the Obsidian API shapes**

Run: `grep -n "interface HeadingSubpathResult\|interface BlockSubpathResult\|export function resolveSubpath" -A 12 node_modules/obsidian/obsidian.d.ts`
Expected:
- `resolveSubpath(cache, subpath)` is exported.
- `HeadingSubpathResult` has `type: 'heading'` and `current: HeadingCache`.
- `BlockSubpathResult` has `type: 'block'`, `block: BlockCache` and `list?: ListItemCache`.

If any name differs, adapt the matching lines in Step 6 to the installed typings. Keep the behaviour: slice from the heading start to `headingEndOffset`, or from the block start to max(block end, `listItemEndOffset`).

- [ ] **Step 6: Implement `src/resolver/EmbedResolver.ts`**

```ts
import { App, resolveSubpath, TFile } from "obsidian";
import { looksLikeAttachment } from "../transforms/embeds";
import { stripFrontmatter } from "../transforms/frontmatter";
import { headingEndOffset, listItemEndOffset } from "../transforms/sectionRange";
import { normalizeNewlines, trimBlankLines } from "../transforms/text";
import type { Resolve, ResolveResult } from "./types";

export function createResolver(app: App): Resolve {
  return async (ref, sourcePath): Promise<ResolveResult> => {
    const file =
      ref.linkpath === ""
        ? app.vault.getAbstractFileByPath(sourcePath)
        : app.metadataCache.getFirstLinkpathDest(ref.linkpath, sourcePath);

    if (!(file instanceof TFile)) {
      return looksLikeAttachment(ref.linkpath)
        ? { ok: false, reason: "not-markdown", target: ref.target }
        : { ok: false, reason: "missing-file", target: ref.target };
    }
    if (file.extension !== "md") return { ok: false, reason: "not-markdown", target: ref.target };

    // Slice the RAW text with cached offsets, then normalize (Review Focus 3).
    const raw = await app.vault.cachedRead(file);
    const key = file.path + ref.subpath;
    const done = (slice: string): ResolveResult => ({ ok: true, text: trimBlankLines(normalizeNewlines(slice)), path: file.path, key });

    if (ref.subpath === "") return done(stripFrontmatter(raw));

    const cache = app.metadataCache.getFileCache(file);
    const sub = cache ? resolveSubpath(cache, ref.subpath) : null;
    if (!cache || !sub) return { ok: false, reason: "missing-subpath", target: ref.target };

    if (sub.type === "heading") {
      const headings = cache.headings ?? [];
      const start = sub.current.position.start.offset;
      const index = headings.findIndex((h) => h.position.start.offset === start);
      return done(raw.slice(start, headingEndOffset(headings, index, raw.length)));
    }
    if (sub.type === "block") {
      const start = sub.block.position.start.offset;
      let end = sub.block.position.end.offset;
      if (sub.list && cache.listItems) end = Math.max(end, listItemEndOffset(cache.listItems, sub.list.position.start.line));
      return done(raw.slice(start, end));
    }
    return { ok: false, reason: "missing-subpath", target: ref.target };
  };
}
```

- [ ] **Step 7: Implement `src/resolver/freshness.ts`**

This implements the spec's "wait for the metadata cache to be current". It saves any open editors, then waits for the cache to re-index files that actually changed.

```ts
import { App, MarkdownView, TFile } from "obsidian";

/**
 * Save every open Markdown editor and wait until the metadata cache has re-indexed
 * any file that save actually changed, so cached offsets match file contents.
 */
export async function flushEditors(app: App, timeoutMs = 2000): Promise<void> {
  const waits: Promise<void>[] = [];
  for (const leaf of app.workspace.getLeavesOfType("markdown")) {
    const view = leaf.view;
    if (!(view instanceof MarkdownView) || !view.file) continue;
    const file = view.file;
    const before = file.stat.mtime;
    const changed = waitForCacheChange(app, file, timeoutMs);
    await view.save();
    if (file.stat.mtime !== before) waits.push(changed.promise);
    else changed.cancel();
  }
  await Promise.all(waits);
}

function waitForCacheChange(app: App, file: TFile, timeoutMs: number): { promise: Promise<void>; cancel: () => void } {
  let finish = () => {};
  const promise = new Promise<void>((resolve) => {
    const ref = app.metadataCache.on("changed", (changed) => {
      if (changed.path === file.path) finish();
    });
    const timer = window.setTimeout(() => finish(), timeoutMs);
    finish = () => {
      app.metadataCache.offref(ref);
      window.clearTimeout(timer);
      resolve();
    };
  });
  return { promise, cancel: () => finish() };
}
```

- [ ] **Step 8: Typecheck and run the tests**

Run: `npm run build && npm test`
Expected: the build succeeds with no type errors, and all tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/transforms/sectionRange.ts src/resolver/EmbedResolver.ts src/resolver/freshness.ts tests/sectionRange.test.ts
git commit -m "feat: resolve embeds through Obsidian's metadata cache"
```

---

### Task 12: Export feature, save dialog, export modal

**Files:**
- Create: `src/paths.ts`, `src/features/exportDocument.ts`, `src/ui/optionLabels.ts`, `src/ui/saveDialog.ts`, `src/ui/ExportModal.ts`
- Test: `tests/paths.test.ts`

**Interfaces:**
- Consumes:
  - `expandDocument` (Task 9)
  - `createResolver`, `flushEditors` (Task 11)
  - `runPipeline`, `ExportOptions`, `OPTION_KEYS`, `PluginSettings` (Task 4)
- Produces:
  - `vaultRelative(base: string, abs: string): string | null`
  - `type ExportTarget = { kind: "vault"; path: string } | { kind: "fs"; absPath: string }`
  - `defaultExportPath(file: TFile): string`
  - `targetFromAbsolute(app: App, absPath: string): ExportTarget`
  - `absolutePathOf(app: App, t: ExportTarget): string`
  - `describeTarget(t: ExportTarget): string`
  - `targetExists(app: App, t: ExportTarget): boolean`
  - `buildExport(app: App, file: TFile, options: ExportOptions): Promise<{ text: string; warnings: number }>`
  - `writeExport(app: App, target: ExportTarget, text: string): Promise<void>`
  - `OPTION_LABELS: Record<keyof ExportOptions, [string, string]>`
  - `getSaveDialog(): ElectronDialog | null`
  - `class ExportModal extends Modal`, with constructor `(app: App, plugin: { settings: PluginSettings; saveSettings(): Promise<void> }, file: TFile)`

- [ ] **Step 1: Write the failing test for the pure path helper**

```ts
import { describe, expect, it } from "vitest";
import { vaultRelative } from "../src/paths";

describe("vaultRelative", () => {
  it("returns a forward-slash vault path for files inside the vault", () => {
    expect(vaultRelative("/Users/me/Vault", "/Users/me/Vault/Exports/Doc.md")).toBe("Exports/Doc.md");
  });
  it("returns null outside the vault, including sibling folders sharing a prefix", () => {
    expect(vaultRelative("/Users/me/Vault", "/Users/me/Desktop/Doc.md")).toBeNull();
    expect(vaultRelative("/Users/me/Vault", "/Users/me/Vault2/Doc.md")).toBeNull();
  });
  it("returns null for the vault folder itself", () => {
    expect(vaultRelative("/Users/me/Vault", "/Users/me/Vault")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/paths.test.ts`
Expected: FAIL with an unresolved import.

- [ ] **Step 3: Implement `src/paths.ts`**

```ts
import * as nodePath from "path";

/** Vault-relative, forward-slash path of `abs`, or null when it lies outside `base`. */
export function vaultRelative(base: string, abs: string): string | null {
  const rel = nodePath.relative(base, abs);
  if (rel === "" || rel.startsWith("..") || nodePath.isAbsolute(rel)) return null;
  return rel.split(nodePath.sep).join("/");
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/paths.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement `src/features/exportDocument.ts`**

```ts
import { App, FileSystemAdapter, normalizePath, TFile, TFolder } from "obsidian";
import { promises as fsp } from "fs";
import * as nodePath from "path";
import { vaultRelative } from "../paths";
import { createResolver } from "../resolver/EmbedResolver";
import { expandDocument } from "../resolver/expand";
import { flushEditors } from "../resolver/freshness";
import type { ExportOptions } from "../settings";
import { runPipeline } from "../transforms/pipeline";

export type ExportTarget = { kind: "vault"; path: string } | { kind: "fs"; absPath: string };

export function defaultExportPath(file: TFile): string {
  const folder = file.parent && !file.parent.isRoot() ? `${file.parent.path}/` : "";
  return normalizePath(`${folder}${file.basename} (expanded).md`);
}

function vaultBasePath(app: App): string | null {
  const adapter = app.vault.adapter;
  return adapter instanceof FileSystemAdapter ? adapter.getBasePath() : null;
}

export function targetFromAbsolute(app: App, absPath: string): ExportTarget {
  const base = vaultBasePath(app);
  const rel = base ? vaultRelative(base, absPath) : null;
  return rel ? { kind: "vault", path: normalizePath(rel) } : { kind: "fs", absPath };
}

export function absolutePathOf(app: App, t: ExportTarget): string {
  if (t.kind === "fs") return t.absPath;
  const base = vaultBasePath(app);
  return base ? nodePath.join(base, t.path) : t.path;
}

export function describeTarget(t: ExportTarget): string {
  return t.kind === "vault" ? t.path : t.absPath;
}

export function targetExists(app: App, t: ExportTarget): boolean {
  return t.kind === "vault" && app.vault.getAbstractFileByPath(t.path) !== null;
}

export async function buildExport(app: App, file: TFile, options: ExportOptions): Promise<{ text: string; warnings: number }> {
  await flushEditors(app);
  const source = await app.vault.read(file);
  const { text, warnings } = await expandDocument(source, file.path, createResolver(app), {
    shiftHeadings: options.shiftHeadings,
    provenance: options.provenance,
  });
  return { text: runPipeline(text, options), warnings };
}

export async function writeExport(app: App, target: ExportTarget, text: string): Promise<void> {
  if (target.kind === "fs") {
    const tmp = `${target.absPath}.tmp-${Date.now()}`;
    try {
      await fsp.writeFile(tmp, text, "utf8");
      await fsp.rename(tmp, target.absPath);
    } catch (err) {
      await fsp.rm(tmp, { force: true });
      throw err;
    }
    return;
  }
  const existing = app.vault.getAbstractFileByPath(target.path);
  if (existing instanceof TFile) {
    await app.vault.modify(existing, text);
    return;
  }
  if (existing) throw new Error(`${target.path} is a folder`);
  const slash = target.path.lastIndexOf("/");
  const folder = slash === -1 ? "" : target.path.slice(0, slash);
  if (folder && !(app.vault.getAbstractFileByPath(folder) instanceof TFolder)) await app.vault.createFolder(folder);
  await app.vault.create(target.path, text);
}
```

- [ ] **Step 6: Implement `src/ui/optionLabels.ts` and `src/ui/saveDialog.ts`**

`src/ui/optionLabels.ts`:

```ts
import type { ExportOptions } from "../settings";

export const OPTION_LABELS: Record<keyof ExportOptions, [name: string, description: string]> = {
  stripBlockIds: ["Strip block IDs", "Remove ^block-id markers."],
  stripComments: ["Strip comments", "Remove %%Obsidian comments%%, including inline-provenance markers."],
  keepParentFrontmatter: ["Keep frontmatter", "Keep this note's YAML properties at the top of the export."],
  shiftHeadings: ["Nest headings", "Demote embedded headings so they sit under the surrounding heading."],
  provenance: ["Source markers", "Wrap each expanded block in <!-- from: … --> comments."],
};
```

`src/ui/saveDialog.ts`:

```ts
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
```

- [ ] **Step 7: Implement `src/ui/ExportModal.ts`**

```ts
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
    this.target = targetFromAbsolute(this.app, result.filePath);
    this.chosenViaDialog = true;
    this.render();
  }

  private async runExport(button: ButtonComponent): Promise<void> {
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
```

- [ ] **Step 8: Typecheck and run the tests**

Run: `npm run build && npm test`
Expected: the build succeeds and all tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/paths.ts src/features/exportDocument.ts src/ui/optionLabels.ts src/ui/saveDialog.ts src/ui/ExportModal.ts tests/paths.test.ts
git commit -m "feat: export modal with presets and save dialog"
```

---

### Task 13: Inline feature, settings tab, plugin wiring

**Files:**
- Create: `src/features/inlineEmbed.ts`, `src/ui/SettingsTab.ts`
- Modify: `src/main.ts` (replace the stub entirely)

**Interfaces:**
- Consumes:
  - `createResolver`, `flushEditors` (Task 11)
  - `embedAt`, `blockIdOf`, `looksLikeAttachment`, `EmbedRef` (Task 6)
  - `buildInlineReplacement` (Task 10)
  - `ExportModal`, `OPTION_LABELS` (Task 12)
  - `loadSettings`, `defaultPresets`, `uniqueName`, `PUBLISH`, `OPTION_KEYS`, `PluginSettings` (Task 4)
- Produces:
  - `embedUnderCursor(editor: Editor): EmbedHit | null`
  - `isNoteEmbed(app: App, ref: EmbedRef, sourcePath: string): boolean`
  - `inlineEmbed(app: App, editor: Editor, file: TFile): Promise<void>`
  - `class SettingsTab extends PluginSettingTab`
  - the default export `TransclusionExtractorPlugin`

- [ ] **Step 1: Implement `src/features/inlineEmbed.ts`**

```ts
import { App, Editor, moment, Notice, TFile } from "obsidian";
import { createResolver } from "../resolver/EmbedResolver";
import { flushEditors } from "../resolver/freshness";
import { blockIdOf, embedAt, EmbedRef, looksLikeAttachment } from "../transforms/embeds";
import { buildInlineReplacement } from "../transforms/inline";

export interface EmbedHit {
  ref: EmbedRef;
  line: number;
  lineStart: number;
}

export function embedUnderCursor(editor: Editor): EmbedHit | null {
  const cursor = editor.getCursor();
  const ref = embedAt(editor.getValue(), editor.posToOffset(cursor));
  if (!ref || editor.offsetToPos(ref.start).line !== cursor.line) return null;
  return { ref, line: cursor.line, lineStart: editor.posToOffset({ line: cursor.line, ch: 0 }) };
}

/** False when the embed points at an attachment (image, PDF…), where inlining makes no sense. */
export function isNoteEmbed(app: App, ref: EmbedRef, sourcePath: string): boolean {
  const dest = ref.linkpath === "" ? null : app.metadataCache.getFirstLinkpathDest(ref.linkpath, sourcePath);
  return dest ? dest.extension === "md" : !looksLikeAttachment(ref.linkpath);
}

const FAILURE = {
  "missing-file": "not found",
  "missing-subpath": "not found",
  "not-markdown": "is not a note",
} as const;

export async function inlineEmbed(app: App, editor: Editor, file: TFile): Promise<void> {
  const hit = embedUnderCursor(editor);
  if (!hit) return;
  const lineText = editor.getLine(hit.line);

  await flushEditors(app);
  const result = await createResolver(app)(hit.ref, file.path);
  if (!result.ok) {
    new Notice(`Can't inline: ${hit.ref.target} ${FAILURE[result.reason]}`);
    return;
  }
  if (editor.getLine(hit.line) !== lineText) {
    new Notice("Can't inline: the line changed while the transclusion was being resolved. Try again.");
    return;
  }

  const replacement = buildInlineReplacement({
    line: lineText,
    start: hit.ref.start - hit.lineStart,
    end: hit.ref.end - hit.lineStart,
    target: hit.ref.target,
    blockId: blockIdOf(hit.ref.subpath),
    content: result.text,
    date: moment().format("YYYY-MM-DD"),
    prev: hit.line > 0 ? editor.getLine(hit.line - 1) : null,
    next: hit.line < editor.lastLine() ? editor.getLine(hit.line + 1) : null,
  });
  editor.replaceRange(replacement, { line: hit.line, ch: 0 }, { line: hit.line, ch: lineText.length });
}
```

- [ ] **Step 2: Implement `src/ui/SettingsTab.ts`**

```ts
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
```

- [ ] **Step 3: Replace `src/main.ts`**

```ts
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
```

- [ ] **Step 4: Typecheck and run the tests**

Run: `npm run build && npm test`
Expected: the build succeeds and all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/features/inlineEmbed.ts src/ui/SettingsTab.ts src/main.ts
git commit -m "feat: inline command, context menus, and settings tab"
```

---

### Task 14: Fixture vault and manual verification in Obsidian

**Files:**
- Create:
  - `test-vault/Assembled.md`
  - `test-vault/Inline playground.md`
  - `test-vault/Sources/Quotes.md`, `Background.md`, `Lists.md`, `Data.md`, `Nested.md`, `Deep.md`, `Loop A.md`, `Loop B.md`
  - `test-vault/expected/Assembled (Publish).md`
  - `test-vault/expected/Assembled (Snapshot).md`
  - `test-vault/expected/README.md`

**Interfaces:**
- Consumes: the built plugin from Tasks 1–13.
- Produces: a reproducible manual acceptance check that anyone on the team can run.

- [ ] **Step 1: Create the source notes**

`test-vault/Sources/Quotes.md`:

```
Knowledge is a web, not a tree. ^q1

First aside paragraph.

Second aside paragraph. ^q2
```

`test-vault/Sources/Background.md`:

```
# Background notes

## History

The project began in 2019. ^h1

### Early work

Prototype built in a weekend.

## Later

Not included.
```

`test-vault/Sources/Lists.md`:

```
- Alpha
- Main point ^pt
  - Supporting detail
  - Another detail
- Omega
```

`test-vault/Sources/Data.md`:

```
| Year | Count |
| ---- | ----- |
| 2019 | 3     |
| 2020 | 8     |

^tbl
```

`test-vault/Sources/Nested.md`:

```
Nested intro.

![[Sources/Deep#^d1]]
```

`test-vault/Sources/Deep.md`:

```
Deepest paragraph. ^d1
```

`test-vault/Sources/Loop A.md`:

```
A says hi.

![[Loop B]]
```

`test-vault/Sources/Loop B.md`:

```
B says hi.

![[Loop A]]
```

- [ ] **Step 2: Create `test-vault/Assembled.md`**

~~~~
---
title: Assembled
---
# Assembled document

Intro paragraph with an inline quote: ![[Sources/Quotes#^q1]] as noted.

## Background

![[Sources/Background#Background notes#History]]

## Points

![[Sources/Lists#^pt]]

Summary list:

- ![[Sources/Quotes#^q1]]
- Second point

> [!note] Aside
> ![[Sources/Quotes#^q2]]

![[Sources/Data#^tbl]]

![[Sources/Nested]]

![[Sources/Loop A]]

![[Sources/Missing#^nope]]

![[diagram.png]]

%% editor note: revise this section %%

```js
const example = "![[Sources/Quotes#^q1]]";
```
~~~~

- [ ] **Step 3: Create the expected outputs**

`test-vault/expected/Assembled (Publish).md`:

~~~~
# Assembled document

Intro paragraph with an inline quote: Knowledge is a web, not a tree. as noted.

## Background

### History

The project began in 2019.

#### Early work

Prototype built in a weekend.

## Points

- Main point
  - Supporting detail
  - Another detail

Summary list:

- Knowledge is a web, not a tree.
- Second point

> [!note] Aside
> Second aside paragraph.

| Year | Count |
| ---- | ----- |
| 2019 | 3     |
| 2020 | 8     |

Nested intro.

Deepest paragraph.

A says hi.

B says hi.

> [!warning] Circular transclusion: Loop A

> [!warning] Missing: Sources/Missing#^nope

![[diagram.png]]

```js
const example = "![[Sources/Quotes#^q1]]";
```
~~~~

`test-vault/expected/Assembled (Snapshot).md` is the Publish output with three differences:
- the original frontmatter block stays at the top,
- `The project began in 2019. ^h1` keeps its ID,
- the `%% editor note: revise this section %%` line stays in place, with a blank line on each side.

Write it in full:

~~~~
---
title: Assembled
---
# Assembled document

Intro paragraph with an inline quote: Knowledge is a web, not a tree. as noted.

## Background

### History

The project began in 2019. ^h1

#### Early work

Prototype built in a weekend.

## Points

- Main point
  - Supporting detail
  - Another detail

Summary list:

- Knowledge is a web, not a tree.
- Second point

> [!note] Aside
> Second aside paragraph.

| Year | Count |
| ---- | ----- |
| 2019 | 3     |
| 2020 | 8     |

Nested intro.

Deepest paragraph.

A says hi.

B says hi.

> [!warning] Circular transclusion: Loop A

> [!warning] Missing: Sources/Missing#^nope

![[diagram.png]]

%% editor note: revise this section %%

```js
const example = "![[Sources/Quotes#^q1]]";
```
~~~~

`test-vault/expected/README.md`:

```
Reference outputs for Assembled.md. Export with the named preset to the default
location and compare: `diff "test-vault/Assembled (expanded).md" "test-vault/expected/Assembled (Publish).md"`.
Both exports report 2 warnings (one circular, one missing).
```

- [ ] **Step 4: Create `test-vault/Inline playground.md`**

```
# Inline playground

Right-click each embed and choose "Inline transclusion". Undo with Cmd-Z after each one.

![[Sources/Quotes#^q1]]

> [!tip]
> ![[Sources/Quotes#^q2]]

- ![[Sources/Lists#^pt]]

See ![[Sources/Deep#^d1]] inline.

![[Sources/Missing#^nope]]

![[diagram.png]]
```

- [ ] **Step 5: Build into the vault and open it**

Run: `npm run build && node esbuild.config.mjs` (stop with Ctrl-C once it logs that the build finished)
Then open `test-vault/` as a vault in Obsidian. Turn off Restricted mode, and confirm that *Transclusion Extractor* is enabled under Community plugins.

- [ ] **Step 6: Verify export against the expected files**

1. Open `Assembled.md` and run the command *Export with transclusions expanded…*. Choose the **Publish** preset and click **Export**.
   - Expected: the notice says "Exported with 2 warnings to Assembled (expanded).md".
2. Run `diff "test-vault/Assembled (expanded).md" "test-vault/expected/Assembled (Publish).md"`.
   - Expected: no differences.
3. Repeat with **Snapshot**. The dialog should warn that the file exists and label the button **Overwrite**.
   - Expected: `diff` against `Assembled (Snapshot).md` shows no differences.
4. In the file explorer, right-click `Assembled.md` and choose *Export expanded…*, then click **Choose location…**. The system dialog should open in `test-vault/`. Save to the Desktop.
   - Expected: the file is written to the Desktop.
5. Edit `Sources/Deep.md` (change "Deepest" to "Deeper") and export immediately, without waiting.
   - Expected: the export contains "Deeper paragraph." (this checks `flushEditors`).

If a diff shows a block-boundary difference, for example the `^tbl` table or the `^pt` list item, check the `resolveSubpath` result for that block in the developer console. Fix `EmbedResolver.ts`, not the expected file, unless the difference is purely cosmetic and you have confirmed Obsidian renders it the same way.

- [ ] **Step 7: Verify inlining**

In `Inline playground.md`, right-click each embed. After each check, undo with **Cmd-Z** and confirm that one undo restores the original line.
- `![[Sources/Quotes#^q1]]` becomes `%% inlined from [[Sources/Quotes#^q1]] on <today> %%` followed by `Knowledge is a web, not a tree.`
- The callout embed becomes `> %% inlined … %%` followed by `> Second aside paragraph.`, and the callout still renders.
- The list embed becomes `- %% inlined … %%` followed by `  - Main point`, `    - Supporting detail` and `    - Another detail`.
- The mid-line embed becomes `See %% inlined from [[Sources/Deep#^d1]] on <today> %% Deepest paragraph. inline.`
- The missing embed shows the notice "Can't inline: Sources/Missing#^nope not found", and the text is unchanged.
- `![[diagram.png]]` shows no *Inline transclusion* menu item.
- The command-palette entry *Inline transclusion under cursor* appears only while the cursor is on a note embed.
- `Sources/Quotes.md` is unchanged after all of this.

- [ ] **Step 8: Commit**

```bash
git add test-vault
git commit -m "test: fixture vault with expected export outputs"
```

---

### Task 15: README and BRAT release workflow

**Files:**
- Create: `README.md`, `.github/workflows/release.yml`

**Interfaces:**
- Consumes: `npm test`, `npm run build`, `manifest.json` (Task 1).
- Produces: tagged GitHub releases carrying `main.js`, `manifest.json` and `styles.css`, which is what BRAT installs.

- [ ] **Step 1: Create `.github/workflows/release.yml`**

```yaml
name: Release

on:
  push:
    tags: ["*"]

permissions:
  contents: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build
      - name: Check tag matches manifest version
        run: test "$GITHUB_REF_NAME" = "$(node -p "require('./manifest.json').version")"
      - name: Create release
        env:
          GH_TOKEN: ${{ github.token }}
        run: gh release create "$GITHUB_REF_NAME" --title "$GITHUB_REF_NAME" --generate-notes main.js manifest.json styles.css
```

- [ ] **Step 2: Create `README.md`**

````markdown
# Transclusion Extractor

An Obsidian plugin (desktop only) for notes that are assembled from transclusions (`![[...]]`).

- **Export with transclusions expanded:** writes a new Markdown file in which every embed is replaced, recursively, by the text it points to. Use it from the command palette, or right-click a note in the file explorer and choose *Export expanded…*.
- **Inline transclusion:** right-click an embed in the editor, or run *Inline transclusion under cursor*. This replaces that one embed with a copy of its text, which you can then edit on its own. A hidden `%% inlined from [[...]] on <date> %%` marker records where it came from. Cmd-Z undoes it.

## Install (team, via BRAT)

1. Install **BRAT** from Community plugins.
2. BRAT → *Add beta plugin* → enter `<github-org>/obsidian-transclusion-extractor`.
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

Missing or circular embeds become `> [!warning]` callouts in the output, and the completion notice counts them. Wikilinks and image/PDF embeds are left unchanged.

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
````

- [ ] **Step 3: Verify locally**

Run: `npm test && npm run build && ls main.js manifest.json styles.css`
Expected: all tests pass, the build succeeds, and all three files are listed.

- [ ] **Step 4: Commit**

```bash
git add README.md .github/workflows/release.yml
git commit -m "ci: BRAT-compatible release workflow and README"
```

- [ ] **Step 5: First release (requires the human partner)**

Pushing to GitHub publishes the code and needs a remote repository. Ask the human partner:
- which GitHub organization or account should host `obsidian-transclusion-extractor`,
- whether the repository should be public or private. A private repository means BRAT users need a GitHub token configured in BRAT.

After they confirm:

```bash
git remote add origin git@github.com:<org>/obsidian-transclusion-extractor.git
git push -u origin main
git tag 0.1.0
git push origin 0.1.0
```

Expected: the Release workflow succeeds, and release `0.1.0` lists `main.js`, `manifest.json` and `styles.css`. Installing through BRAT in a fresh vault then works.
