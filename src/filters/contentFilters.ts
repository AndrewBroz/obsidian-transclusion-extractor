import { findCodeRanges } from "../transforms/codeRegions";

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

// Private-use characters bracketing the placeholder's decimal index, e.g. " 3 ". Private-use
// code points don't occur in ordinary Markdown, so (barring the escape hatch below) they can't collide
// with surrounding prose or code the way ASCII brackets like `<1>` could.
const PLACEHOLDER_OPEN = "";
const PLACEHOLDER_CLOSE = "";
const PLACEHOLDER_RE = /(\d+)/;

/**
 * Replaces every code range in `text` with a unique placeholder, and returns a function that restores
 * each placeholder still present in a later string back to its original code span in a single pass (so
 * restored code is never re-scanned for more placeholders, and duplicated or reordered placeholders are
 * handled correctly). A placeholder a filter removed stays removed; filters are code-blind, so the code
 * itself never reaches them and can't be mis-rewritten.
 *
 * If `text` already contains one of the placeholder's private-use characters (vanishingly unlikely, but
 * not impossible), masking is skipped entirely and filters run on the text unprotected, rather than risk
 * a false restore.
 */
function protectCode(text: string): { masked: string; restore: (s: string) => string } {
  const ranges = findCodeRanges(text);
  const identity = { masked: text, restore: (s: string) => s };
  if (ranges.length === 0) return identity;
  if (text.includes(PLACEHOLDER_OPEN) || text.includes(PLACEHOLDER_CLOSE)) return identity;
  const originals: string[] = [];
  let masked = "";
  let last = 0;
  ranges.forEach((r, i) => {
    originals.push(text.slice(r.start, r.end));
    masked += text.slice(last, r.start) + `${PLACEHOLDER_OPEN}${i}${PLACEHOLDER_CLOSE}`;
    last = r.end;
  });
  masked += text.slice(last);
  const restore = (s: string) =>
    s.replace(new RegExp(PLACEHOLDER_RE.source, "g"), (m, i: string) => originals[Number(i)] ?? m);
  return { masked, restore };
}

export function applyFilters(text: string, filters: NamedFilter[]): FilterResult {
  const { masked, restore } = protectCode(text);
  let out = masked;
  const failures: string[] = [];
  for (const { name, filter } of filters) {
    try {
      out = filter(out);
    } catch {
      failures.push(name);
    }
  }
  return { text: restore(out), failures };
}

export function composeFilters(filters: NamedFilter[]): ((markdown: string) => FilterResult) | undefined {
  return filters.length > 0 ? (markdown) => applyFilters(markdown, filters) : undefined;
}
