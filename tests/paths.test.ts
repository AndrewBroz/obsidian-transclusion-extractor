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
