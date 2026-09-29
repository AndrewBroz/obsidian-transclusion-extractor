const FRONTMATTER = /^---[ \t]*\r?\n(?:[\s\S]*?\r?\n)?---[ \t]*(?:\r?\n|$)/;

export function splitFrontmatter(text: string): { frontmatter: string; body: string } {
  const m = FRONTMATTER.exec(text);
  return m ? { frontmatter: m[0], body: text.slice(m[0].length) } : { frontmatter: "", body: text };
}

export function stripFrontmatter(text: string): string {
  return splitFrontmatter(text).body;
}
