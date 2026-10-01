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

/**
 * Replaces every code range in `text` with a unique `<n>` placeholder, and returns a function that
 * restores each placeholder still present in a later string back to its original code span. A
 * placeholder a filter removed stays removed; filters are code-blind, so the code itself never
 * reaches them and can't be mis-rewritten.
 */
function protectCode(text: string): { masked: string; restore: (s: string) => string } {
  const ranges = findCodeRanges(text);
  if (ranges.length === 0) return { masked: text, restore: (s) => s };
  const originals: string[] = [];
  let masked = "";
  let last = 0;
  ranges.forEach((r, i) => {
    originals.push(text.slice(r.start, r.end));
    masked += text.slice(last, r.start) + `<${i}>`;
    last = r.end;
  });
  masked += text.slice(last);
  const restore = (s: string) => originals.reduce((acc, original, i) => acc.split(`<${i}>`).join(original), s);
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
