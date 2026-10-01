# Transclusion Extractor: Portable Markers and Content Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop writing Obsidian-only syntax (`%%` markers, `[!warning]` callouts), and apply content filters offered by other plugins (Inkling's `toOriginalText`) to inlined and exported text.

**Architecture:**
- **Inline marker:** the new marker lives in a pure module, `src/transforms/inlineMarker.ts`, which formats it and strips it on export.
- **Content filters:** a new pure module, `src/filters/contentFilters.ts`, is the only code that knows Inkling exists. It duck-types `app.plugins.getPlugin("inkling")?.api` and returns opaque `markdown → markdown` filters.
- **Expansion:** `expandDocument` gains an injected `filter` option, so the pure core stays free of `obsidian`.
- **Wiring:** the export and inline features fetch the filters for each action.

**Tech Stack:** TypeScript 7, Vitest 5, esbuild, Obsidian API.

**Spec:** `docs/superpowers/specs/2026-09-30-inkling-integration-design.md` (§1, §4, §5 apply to this repo)

## Global Constraints

- **Inline marker format:** exactly `<!-- inlined from "<target>" on YYYY-MM-DD -->`, where `<target>` is the embed target without alias.
  - In `<target>`, `\` is written as `\\` and `"` as `\"`.
  - Any `-` followed by another `-` gets a space after it, so `--` never appears.
- **Warning formats:**
  - `> **Missing:** <target>` and `> **Circular transclusion:** <target>`;
  - inside a table row, `**Missing: <target>**` and `**Circular transclusion: <target>**`;
  - a filter failure: `> **Filter failed (<name>):** <target or "document">`, or `**Filter failed (<name>): <target>**` in a table row.
- **`stripInlineMarkers` preset key:** Publish `true`, Snapshot `false`. `loadSettings` back-fills it from the built-in preset of the same name.
- **Legacy markers:** `%% inlined from [[…]] on … %%` markers are still removed by Publish's `stripComments`.
- **Inkling filter:** used only when `api.version >= 1` and `typeof api.toOriginalText === "function"`. Absent, disabled or old Inkling means no filter and no message.
- **Pure core:** nothing in `src/transforms/`, `src/filters/`, `src/resolver/expand.ts` or `src/resolver/types.ts` may import `obsidian`.
- **Export filtering** applies to the parent body and to every resolved embed, **before** expansion, block-ID stripping and splicing, in every preset.
- **Inline filtering** applies to the copied content only, never the parent's own text. A failure shows a Notice (`Inkling couldn't clean this transclusion; inlined as-is.`) and proceeds.
- **Commits:** conventional messages ending with `Co-Authored-By: Claude <model> <noreply@anthropic.com>`.
- **Merging:** work on branch `feat/portable-markers`, then merge directly to `main` and push (no PR).
- **Release:** version 0.2.0 (`npm version minor`) is tagged only after the user's go-ahead.

## Review Focus

1. **A target containing `--`, `---` or `"`** must produce a valid HTML comment, with no `--` inside. Tested in Task 1.
2. **Old `%% inlined from … %%` markers** in existing notes are still removed by Publish. Tested in Task 2.
3. **`stripInlineMarkers`** never removes other HTML comments (e.g. `<!-- from: … -->` provenance) or markers inside code. Tested in Task 2.
4. **A filter that throws or returns a non-string** must not break export or inline; the unfiltered text is used. Tested in Tasks 4 and 5.
5. **An embed inside a pending addition** (`{++![[X]]++}`) is not resolved at all when the filter removes it. Tested in Task 5.

---

### Task 1: Portable inline marker

**Files:**
- Create: `src/transforms/inlineMarker.ts`
- Modify: `src/transforms/inline.ts:24` (marker construction)
- Test: `tests/inlineMarker.test.ts`; Modify: `tests/inline.test.ts:4` (constant `M`)

**Interfaces:**
- Produces:
  - `formatInlineMarker(target: string, date: string): string`
  - `INLINE_MARKER_RE: RegExp` (global), matching markers produced by `formatInlineMarker`

- [ ] **Step 1: Create the branch**

```bash
cd ~/Code/cri/obsidian-transclusion-extractor && git checkout main && git pull && git checkout -b feat/portable-markers
```

- [ ] **Step 2: Write the failing tests** in `tests/inlineMarker.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { formatInlineMarker, INLINE_MARKER_RE } from "../src/transforms/inlineMarker";

describe("formatInlineMarker", () => {
  it("writes an HTML comment with a quoted target", () => {
    expect(formatInlineMarker("Sources/Quotes#^q1", "2026-09-30")).toBe('<!-- inlined from "Sources/Quotes#^q1" on 2026-09-30 -->');
  });
  it("never puts -- inside the comment (Review Focus 1)", () => {
    const m = formatInlineMarker("a--b---c", "2026-09-30");
    expect(m).toBe('<!-- inlined from "a- -b- - -c" on 2026-09-30 -->');
    expect(m.slice(4, -3)).not.toContain("--");
  });
  it("escapes quotes and backslashes", () => {
    expect(formatInlineMarker('Say "hi"\\x', "2026-09-30")).toBe('<!-- inlined from "Say \\"hi\\"\\\\x" on 2026-09-30 -->');
  });
});

describe("INLINE_MARKER_RE", () => {
  it("matches produced markers, including escaped quotes", () => {
    const text = `a ${formatInlineMarker('X "y"', "2026-09-30")} b ${formatInlineMarker("Z", "2026-10-01")}`;
    expect([...text.matchAll(INLINE_MARKER_RE)].length).toBe(2);
  });
  it("does not match other HTML comments", () => {
    expect([..."<!-- from: N#^a --> <!-- note -->".matchAll(INLINE_MARKER_RE)].length).toBe(0);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/inlineMarker.test.ts`
Expected: FAIL, cannot resolve `../src/transforms/inlineMarker`.

- [ ] **Step 4: Implement `src/transforms/inlineMarker.ts`**

```ts
/** Provenance marker written above inlined text, e.g. `<!-- inlined from "Note#^id" on 2026-09-30 -->`. */
export const INLINE_MARKER_RE = /<!-- inlined from "(?:[^"\\]|\\.)*" on \d{4}-\d{2}-\d{2} -->/g;

export function formatInlineMarker(target: string, date: string): string {
  // `--` is not allowed inside an HTML comment, so every dash followed by a dash gets a space after it.
  const safe = target.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/-(?=-)/g, "- ");
  return `<!-- inlined from "${safe}" on ${date} -->`;
}
```

- [ ] **Step 5: Use it in `src/transforms/inline.ts`**

Add `import { formatInlineMarker } from "./inlineMarker";`. Replace

```ts
  const marker = `%% inlined from [[${input.target}]] on ${input.date} %%`;
```

with

```ts
  const marker = formatInlineMarker(input.target, input.date);
```

In `tests/inline.test.ts`, change line 4 to:

```ts
const M = '<!-- inlined from "N#^a" on 2026-09-29 -->';
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/inlineMarker.test.ts tests/inline.test.ts && npm test && npm run build`
Expected: all pass. The inline layout tests pass unchanged apart from `M`, because an HTML comment line classifies as a paragraph line just like the old marker.

- [ ] **Step 7: Commit**

```bash
git add src/transforms/inlineMarker.ts src/transforms/inline.ts tests/inlineMarker.test.ts tests/inline.test.ts
git commit -m "feat: write inline provenance as a portable HTML comment" -m "Co-Authored-By: Claude <model> <noreply@anthropic.com>"
```

---

### Task 2: Strip inline markers on Publish

**Files:**
- Modify: `src/transforms/inlineMarker.ts` (add `stripInlineMarkers`)
- Modify: `src/settings.ts` (new key `stripInlineMarkers` in `ExportOptions`, `OPTION_KEYS`, `PUBLISH`, `SNAPSHOT`)
- Modify: `src/transforms/pipeline.ts`
- Modify: `src/ui/optionLabels.ts`
- Test: `tests/inlineMarker.test.ts`, `tests/pipeline.test.ts`, `tests/settings.test.ts`

**Interfaces:**
- Consumes: `INLINE_MARKER_RE` (Task 1); `findCodeRanges`, `inRanges` (`src/transforms/codeRegions.ts`); `removeSpan` (`src/transforms/text.ts`).
- Produces:
  - `stripInlineMarkers(text: string): string`
  - `ExportOptions.stripInlineMarkers: boolean`

- [ ] **Step 1: Write the failing tests**

Append to `tests/inlineMarker.test.ts`:

```ts
import { stripInlineMarkers } from "../src/transforms/inlineMarker";

describe("stripInlineMarkers", () => {
  const M = '<!-- inlined from "N#^a" on 2026-09-30 -->';
  it("removes a marker line and keeps the content", () => {
    expect(stripInlineMarkers(`Intro\n\n${M}\nHello\n\nEnd`)).toBe("Intro\n\nHello\n\nEnd");
  });
  it("removes an inline marker without a double space", () => {
    expect(stripInlineMarkers(`See ${M} Hello now`)).toBe("See Hello now");
  });
  it("removes a marker inside a quote", () => {
    expect(stripInlineMarkers(`> ${M}\n> Hello`)).toBe("> Hello");
  });
  it("leaves other HTML comments and code alone (Review Focus 3)", () => {
    const text = "<!-- from: N#^a -->\nHello\n<!-- /from -->\n```\n" + M + "\n```";
    expect(stripInlineMarkers(text)).toBe(text);
  });
});
```

Append to `tests/pipeline.test.ts`:

```ts
describe("inline markers", () => {
  const M = '<!-- inlined from "N#^a" on 2026-09-30 -->';
  it("Publish strips new and legacy inline markers (Review Focus 2)", () => {
    const text = `${M}\nNew\n\n%% inlined from [[Old#^b]] on 2026-09-29 %%\nOld\n`;
    expect(runPipeline(text, PUBLISH)).toBe("New\n\nOld\n");
  });
  it("Snapshot keeps them", () => {
    const text = `${M}\nNew\n`;
    expect(runPipeline(text, SNAPSHOT)).toBe(text);
  });
});
```

Append to `tests/settings.test.ts`, inside `describe("loadSettings", …)`:

```ts
  it("back-fills stripInlineMarkers from the matching built-in preset", () => {
    const s = loadSettings({
      presets: [
        { name: "Publish", options: { stripBlockIds: true } },
        { name: "Snapshot", options: { stripBlockIds: false } },
      ],
    });
    expect(s.presets[0].options.stripInlineMarkers).toBe(true);
    expect(s.presets[1].options.stripInlineMarkers).toBe(false);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/inlineMarker.test.ts tests/pipeline.test.ts tests/settings.test.ts`
Expected: FAIL. `stripInlineMarkers` is not exported, the pipeline keeps the marker, and `stripInlineMarkers` is undefined in settings.

- [ ] **Step 3: Implement**

Append to `src/transforms/inlineMarker.ts`:

```ts
import { findCodeRanges, inRanges } from "./codeRegions";
import { removeSpan } from "./text";

/** Remove markers written by Inline transclusion (outside code). Other HTML comments are kept. */
export function stripInlineMarkers(text: string): string {
  const code = findCodeRanges(text);
  const spans = [...text.matchAll(INLINE_MARKER_RE)]
    .filter((m) => !inRanges(code, m.index ?? 0))
    .map((m) => ({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length }));
  let out = text;
  for (const s of spans.reverse()) out = removeSpan(out, s.start, s.end);
  return out;
}
```

Move the two `import` lines to the top of the file.

In `src/settings.ts`:
- add `stripInlineMarkers: boolean;` to `ExportOptions` after `stripComments`;
- add `"stripInlineMarkers"` to `OPTION_KEYS` after `"stripComments"`;
- add `stripInlineMarkers: true,` to `PUBLISH` and `stripInlineMarkers: false,` to `SNAPSHOT`, each after their `stripComments` line.

In `src/transforms/pipeline.ts`, import `stripInlineMarkers` from `./inlineMarker` and add it after the comments step:

```ts
  if (opts.stripComments) out = stripComments(out);
  if (opts.stripInlineMarkers) out = stripInlineMarkers(out);
  if (opts.stripBlockIds) out = stripBlockIds(out);
```

Update the docstring to "comments, inline markers, block IDs, frontmatter".

In `src/ui/optionLabels.ts`, change the `stripComments` entry and add the new key:

```ts
  stripComments: ["Strip comments", "Remove %%Obsidian comments%% (including old-style inline markers)."],
  stripInlineMarkers: ["Strip inline markers", "Remove <!-- inlined from … --> comments left by Inline transclusion."],
```

- [ ] **Step 4: Run the tests**

Run: `npm test && npm run build`
Expected: all pass. `tests/fixture.test.ts` still passes, since `Assembled.md` has no inline markers.

- [ ] **Step 5: Commit**

```bash
git add src/transforms/inlineMarker.ts src/settings.ts src/transforms/pipeline.ts src/ui/optionLabels.ts tests/inlineMarker.test.ts tests/pipeline.test.ts tests/settings.test.ts
git commit -m "feat: strip inline markers in Publish exports" -m "Co-Authored-By: Claude <model> <noreply@anthropic.com>"
```

---

### Task 3: Plain-Markdown warnings

**Files:**
- Modify: `src/resolver/expand.ts` (`warning` helper inside `contentFor`)
- Modify: `tests/expand.test.ts:35,54`
- Modify: `test-vault/expected/Assembled (Publish).md:42,44` and `test-vault/expected/Assembled (Snapshot).md:45,47`

**Interfaces:**
- Produces: `warning(label: string, target: string): string`, internal to `contentFor`. Task 5 reuses it for filter failures.

- [ ] **Step 1: Update the tests to the new format (they then fail)**

In `tests/expand.test.ts`:
- replace `"A text\n\nB text\n\n> [!warning] Circular transclusion: A"` with `"A text\n\nB text\n\n> **Circular transclusion:** A"`;
- replace `"A\n\n> [!warning] Missing: Nope#^x"` with `"A\n\n> **Missing:** Nope#^x"`.

In both expected files, replace
- `> [!warning] Circular transclusion: Loop A` with `> **Circular transclusion:** Loop A`
- `> [!warning] Missing: Sources/Missing#^nope` with `> **Missing:** Sources/Missing#^nope`

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/expand.test.ts tests/fixture.test.ts`
Expected: FAIL on the two expand tests and both fixture comparisons, because the output still has `[!warning]`.

- [ ] **Step 3: Implement** in `src/resolver/expand.ts`. Replace the helper and its two uses:

```ts
    // Plain Markdown that renders anywhere; inside a table row a blockquote would break the row.
    const warning = (label: string, target: string) =>
      inTable ? `**${label}: ${target}**` : `> **${label}:** ${target}`;
```

```ts
      return warning("Missing", e.target);
```

```ts
      return warning("Circular transclusion", e.target);
```

- [ ] **Step 4: Run the tests**

Run: `npm test && npm run build`
Expected: all pass. The table-cell tests (`**Missing: Nope**`) are unchanged and pass.

- [ ] **Step 5: Commit**

```bash
git add src/resolver/expand.ts tests/expand.test.ts "test-vault/expected/Assembled (Publish).md" "test-vault/expected/Assembled (Snapshot).md"
git commit -m "feat: write missing/circular warnings as plain Markdown" -m "Co-Authored-By: Claude <model> <noreply@anthropic.com>"
```

---

### Task 4: Content-filter module

**Files:**
- Create: `src/filters/contentFilters.ts`
- Test: `tests/contentFilters.test.ts`

**Interfaces:**
- Produces:
  - `type ContentFilter = (markdown: string) => string`
  - `interface NamedFilter { name: string; filter: ContentFilter }`
  - `interface FilterResult { text: string; failures: string[] }`
  - `getContentFilters(app: unknown): NamedFilter[]`
  - `applyFilters(text: string, filters: NamedFilter[]): FilterResult`
  - `composeFilters(filters: NamedFilter[]): ((markdown: string) => FilterResult) | undefined`

- [ ] **Step 1: Write the failing tests** in `tests/contentFilters.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { applyFilters, composeFilters, getContentFilters } from "../src/filters/contentFilters";

const appWith = (plugin: unknown) => ({ plugins: { getPlugin: (id: string) => (id === "inkling" ? plugin : null) } });
const inkling = { api: { version: 1, toOriginalText: (md: string) => md.replace(/\{\+\+.*?\+\+\}/g, "") } };

describe("getContentFilters", () => {
  it("offers Inkling's toOriginalText when Inkling exposes api v1+", () => {
    const filters = getContentFilters(appWith(inkling));
    expect(filters.map((f) => f.name)).toEqual(["inkling"]);
    expect(filters[0].filter("a{++b++}c")).toBe("ac");
  });
  it("returns nothing when Inkling is absent or disabled", () => {
    expect(getContentFilters(appWith(null))).toEqual([]);
    expect(getContentFilters({})).toEqual([]);
    expect(getContentFilters(null)).toEqual([]);
  });
  it("returns nothing for an old or malformed API", () => {
    expect(getContentFilters(appWith({ api: { version: 0, toOriginalText: () => "" } }))).toEqual([]);
    expect(getContentFilters(appWith({ api: { version: 1 } }))).toEqual([]);
    expect(getContentFilters(appWith({}))).toEqual([]);
  });
  it("turns a non-string result into a thrown error (Review Focus 4)", () => {
    const [f] = getContentFilters(appWith({ api: { version: 1, toOriginalText: () => 42 } }));
    expect(() => f.filter("x")).toThrow();
  });
});

describe("applyFilters", () => {
  it("applies filters in order", () => {
    const r = applyFilters("ab", [
      { name: "one", filter: (s) => s + "1" },
      { name: "two", filter: (s) => s + "2" },
    ]);
    expect(r).toEqual({ text: "ab12", failures: [] });
  });
  it("skips a filter that throws and records its name", () => {
    const r = applyFilters("ab", [
      { name: "bad", filter: () => { throw new Error("boom"); } },
      { name: "ok", filter: (s) => s.toUpperCase() },
    ]);
    expect(r).toEqual({ text: "AB", failures: ["bad"] });
  });
});

describe("composeFilters", () => {
  it("is undefined when there are no filters", () => {
    expect(composeFilters([])).toBeUndefined();
  });
  it("wraps applyFilters", () => {
    expect(composeFilters([{ name: "x", filter: (s) => s.trim() }])?.("  a ")).toEqual({ text: "a", failures: [] });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/contentFilters.test.ts`
Expected: FAIL, cannot resolve the module.

- [ ] **Step 3: Implement `src/filters/contentFilters.ts`**

```ts
/**
 * Text filters other plugins offer for transcluded content. This is the only place that knows about
 * specific plugins; the rest of Transclusion Extractor treats filters as opaque `markdown → markdown`.
 */
export type ContentFilter = (markdown: string) => string;

export interface NamedFilter {
  name: string;
  filter: ContentFilter;
}

export interface FilterResult {
  text: string;
  failures: string[];
}

interface PluginHost {
  plugins?: { getPlugin?: (id: string) => unknown };
}

interface InklingApiLike {
  version?: unknown;
  toOriginalText?: unknown;
}

/** Filters available right now; call per action so enabling/disabling plugins takes effect immediately. */
export function getContentFilters(app: unknown): NamedFilter[] {
  let plugin: unknown;
  try {
    plugin = (app as PluginHost | null | undefined)?.plugins?.getPlugin?.("inkling");
  } catch {
    return [];
  }
  const api = (plugin as { api?: InklingApiLike } | null | undefined)?.api;
  if (!api || typeof api.version !== "number" || api.version < 1 || typeof api.toOriginalText !== "function") return [];
  const toOriginalText = api.toOriginalText as (markdown: string) => unknown;
  return [
    {
      name: "inkling",
      filter: (markdown) => {
        const out = toOriginalText.call(api, markdown);
        if (typeof out !== "string") throw new Error("Inkling's toOriginalText did not return a string");
        return out;
      },
    },
  ];
}

export function applyFilters(text: string, filters: NamedFilter[]): FilterResult {
  let out = text;
  const failures: string[] = [];
  for (const { name, filter } of filters) {
    try {
      out = filter(out);
    } catch {
      failures.push(name);
    }
  }
  return { text: out, failures };
}

export function composeFilters(filters: NamedFilter[]): ((markdown: string) => FilterResult) | undefined {
  return filters.length > 0 ? (markdown) => applyFilters(markdown, filters) : undefined;
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/contentFilters.test.ts && npm test && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/filters/contentFilters.ts tests/contentFilters.test.ts
git commit -m "feat: content-filter module with optional Inkling adapter" -m "Co-Authored-By: Claude <model> <noreply@anthropic.com>"
```

---

### Task 5: Apply filters in export and inline

**Files:**
- Modify: `src/resolver/expand.ts` (`ExpandOptions.filter`, `expandDocument`, `contentFor`)
- Modify: `src/features/exportDocument.ts` (`buildExport`)
- Modify: `src/features/inlineEmbed.ts` (`inlineEmbed`)
- Test: `tests/expand.test.ts`

**Interfaces:**
- Consumes: `FilterResult`, `getContentFilters`, `applyFilters`, `composeFilters` (Task 4); the `warning(label, target)` helper (Task 3).
- Produces: `ExpandOptions.filter?: (markdown: string) => FilterResult`

- [ ] **Step 1: Write the failing tests**, appended inside `describe("expandDocument", …)` in `tests/expand.test.ts`

```ts
  const dropAdditions = (md: string) => ({ text: md.replace(/\{\+\+[\s\S]*?\+\+\}/g, ""), failures: [] as string[] });

  it("filters the parent document before expanding", async () => {
    const r = await expandDocument("Keep {++x++}this", "Root", fakeResolve({}), { ...OPTS, filter: dropAdditions });
    expect(r).toEqual({ text: "Keep this", warnings: 0 });
  });

  it("filters each embed's text", async () => {
    const r = await expandDocument("![[N#^a]]", "Root", fakeResolve({ "N#^a": "Hello {++big ++}world ^a" }), { ...OPTS, filter: dropAdditions });
    expect(r.text).toBe("Hello world");
  });

  it("does not resolve an embed removed by the filter (Review Focus 5)", async () => {
    const seen: string[] = [];
    const base = fakeResolve({ "N#^a": "Hello ^a" });
    const resolve: Resolve = async (ref, src) => (seen.push(ref.target), base(ref, src));
    const r = await expandDocument("A {++![[N#^a]]++}B", "Root", resolve, { ...OPTS, filter: dropAdditions });
    expect(r.text).toBe("A B");
    expect(seen).toEqual([]);
  });

  it("reports a failing filter as a warning and keeps the unfiltered text (Review Focus 4)", async () => {
    const failing = (md: string) => ({ text: md, failures: ["inkling"] });
    const r = await expandDocument("![[N#^a]]", "Root", fakeResolve({ "N#^a": "Hello ^a" }), { ...OPTS, filter: failing });
    expect(r).toEqual({
      text: "> **Filter failed (inkling):** document\n\n> **Filter failed (inkling):** N#^a\n\nHello",
      warnings: 2,
    });
  });

  it("renders a filter failure inside a table row as bold text", async () => {
    const failing = (md: string) => ({ text: md, failures: ["inkling"] });
    const r = await expandDocument("x\n\n| ![[N#^a]] | b |", "Root", fakeResolve({ "N#^a": "Hello ^a" }), { ...OPTS, filter: (md) => (md.startsWith("x") ? { text: md, failures: [] } : failing(md)) });
    expect(r.text).toBe("x\n\n| **Filter failed (inkling): N#^a** Hello | b |");
  });
```

If `Resolve` isn't imported in the test file yet, add `import type { Resolve } from "../src/resolver/types";`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/expand.test.ts`
Expected: FAIL. `filter` is ignored, so the markup stays and there are no warnings.

- [ ] **Step 3: Implement in `src/resolver/expand.ts`**

- Add `import type { FilterResult } from "../filters/contentFilters";`.
- Add `filter?: (markdown: string) => FilterResult;` to `ExpandOptions`.

In `expandDocument`, replace the body handling:

```ts
export async function expandDocument(text: string, sourcePath: string, resolve: Resolve, opts: ExpandOptions): Promise<ExpandResult> {
  const { frontmatter, body } = splitFrontmatter(normalizeNewlines(text));
  const state: State = { warnings: 0 };
  let own = body;
  let notes = "";
  if (opts.filter) {
    const filtered = opts.filter(body);
    own = filtered.text;
    state.warnings += filtered.failures.length;
    notes = filtered.failures.map((name) => `> **Filter failed (${name}):** document\n\n`).join("");
  }
  const expanded = await expandText(own, sourcePath, [sourcePath], resolve, opts, state);
  return { text: frontmatter + notes + expanded, warnings: state.warnings };
}
```

In `contentFor`, replace the line `const raw = normalizeNewlines(r.text);` with:

```ts
    let raw = normalizeNewlines(r.text);
    let failureNotes: string[] = [];
    if (opts.filter) {
      const filtered = opts.filter(raw);
      raw = filtered.text;
      state.warnings += filtered.failures.length;
      failureNotes = filtered.failures.map((name) => warning(`Filter failed (${name})`, e.target));
    }
```

and, just before `return content;` (after the provenance line), add:

```ts
    if (failureNotes.length > 0) content = [...failureNotes, content].join(inTable ? " " : "\n\n");
```

- [ ] **Step 4: Wire the features**

`src/features/exportDocument.ts`: add `import { composeFilters, getContentFilters } from "../filters/contentFilters";`, and pass the filter in `buildExport`:

```ts
  const { text, warnings } = await expandDocument(source, file.path, createResolver(app), {
    shiftHeadings: options.shiftHeadings,
    provenance: options.provenance,
    filter: composeFilters(getContentFilters(app)),
  });
```

`src/features/inlineEmbed.ts`: add `import { applyFilters, getContentFilters } from "../filters/contentFilters";`. After the `if (editor.getLine(hit.line) !== lineText) { … }` block, add:

```ts
  const filtered = applyFilters(result.text, getContentFilters(app));
  if (filtered.failures.length > 0) new Notice("Inkling couldn't clean this transclusion; inlined as-is.");
```

and pass `content: filtered.text` (instead of `content: result.text`) to `buildInlineReplacement`.

- [ ] **Step 5: Run the tests**

Run: `npm test && npm run build`
Expected: all pass. If the table-row test's exact string differs only in spacing produced by `spliceEmbed`'s table flattening, check the flattening rule in `src/transforms/splice.ts` (`toTableCell`) and correct the **expected string** to what that rule specifies, then explain in the report. Do not change `toTableCell`.

- [ ] **Step 6: Commit**

```bash
git add src/resolver/expand.ts src/features/exportDocument.ts src/features/inlineEmbed.ts tests/expand.test.ts
git commit -m "feat: apply content filters to exported and inlined text" -m "Co-Authored-By: Claude <model> <noreply@anthropic.com>"
```

---

### Task 6: Docs and fixtures

**Files:**
- Modify: `README.md`
- Create: `test-vault/Sources/Reviewed.md`
- Modify: `test-vault/Inline playground.md`
- Modify: `test-vault/expected/README.md`

- [ ] **Step 1: README**
  - In the "Inline transclusion" bullet, replace `A hidden \`%% inlined from [[...]] on <date> %%\` marker records where it came from.` with ``An HTML comment marker (`<!-- inlined from "Note#^id" on <date> -->`) records where it came from; Publish exports remove it.``
  - Replace ``Missing or circular embeds become `> [!warning]` callouts in the output`` with ``Missing or circular embeds become plain blockquotes (`> **Missing:** Note#^id`) in the output``.
  - Add this section after "Export presets":

```markdown
## Inkling integration (optional)

If [Inkling](https://github.com/AndrewBroz/obsidian-inkling) 0.11.0 or later is enabled, Transclusion Extractor uses it to show the **original text** of notes under review:

- **Inline transclusion** copies the original text: pending suggestions are left out (shown as rejected), comments are removed, highlights are unwrapped.
- **Every export** (all presets) contains the original text of the parent note and of every transclusion.

Without Inkling, text is copied exactly as written.
```

- [ ] **Step 2: Fixture note** `test-vault/Sources/Reviewed.md`

```markdown
# Reviewed

The {~~cat~>dog~~} sat on the {++red ++}mat. ^r1

{==Important==}{>>Is this right?<<}{>>Yes.<<} findings were {--not --}confirmed.
```

Append to `test-vault/Inline playground.md`:

```markdown

![[Sources/Reviewed#^r1]]

![[Sources/Reviewed]]
```

- [ ] **Step 3: Manual checklist** in `test-vault/expected/README.md`
  - Replace every `%% inlined from [[X]] on <today> %%` example with `<!-- inlined from "X" on <today> -->`, and every `%% inlined … %%` with `<!-- inlined … -->`.
  - Add a section:

```markdown
## Inkling (requires Inkling ≥ 0.11.0 enabled)

- **Inlining the block:** inline `![[Sources/Reviewed#^r1]]`. The result is `<!-- inlined from "Sources/Reviewed#^r1" on <today> -->` followed by `The cat sat on the mat.`
- **Exporting the playground:** export `Inline playground.md` with either preset. The Reviewed paragraphs read "The cat sat on the mat." and "Important findings were not confirmed.", with no `{`, `~>` or `>>` anywhere.
- **Inkling disabled:** disable Inkling and inline again. The raw CriticMarkup is copied unchanged and no notice appears.
```

- [ ] **Step 4: Verify and commit**

Run: `npm test && npm run build`

```bash
git add README.md test-vault/Sources/Reviewed.md "test-vault/Inline playground.md" test-vault/expected/README.md
git commit -m "docs: document portable markers and Inkling integration" -m "Co-Authored-By: Claude <model> <noreply@anthropic.com>"
```

---

### Task 7: Merge (release after go-ahead)

- [ ] **Step 1: Merge directly to `main`** (no PR, per the user's preference)

```bash
cd ~/Code/cri/obsidian-transclusion-extractor && npm test && npm run build && git checkout main && git pull && git merge --no-ff feat/portable-markers -m "Merge feat/portable-markers: portable markers and content filters" && npm test && git push && git branch -d feat/portable-markers
```

- [ ] **Step 2: Release 0.2.0. Ask the user first.** If approved: `npm version minor -m "chore: release %s" && git push --follow-tags`, then confirm the Release workflow attaches `main.js`, `manifest.json` and `styles.css` to `0.2.0`.
