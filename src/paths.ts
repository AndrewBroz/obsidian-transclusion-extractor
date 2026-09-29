import * as nodePath from "path";

/** Vault-relative, forward-slash path of `abs`, or null when it lies outside `base`. */
export function vaultRelative(base: string, abs: string): string | null {
  const rel = nodePath.relative(base, abs);
  if (rel === "" || rel.startsWith("..") || nodePath.isAbsolute(rel)) return null;
  return rel.split(nodePath.sep).join("/");
}
