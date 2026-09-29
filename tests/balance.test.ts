import { describe, expect, it } from "vitest";
import { balanceEmbed } from "../src/transforms/balance";

describe("balanceEmbed", () => {
  it("leaves balanced text alone", () => {
    const text = "a %%c%% b\n\n```\nx\n```";
    expect(balanceEmbed(text)).toBe(text);
  });

  it("closes an unclosed fence with a matching fence line", () => {
    expect(balanceEmbed("a\n````js\nx")).toBe("a\n````js\nx\n````");
    expect(balanceEmbed("~~~\nx")).toBe("~~~\nx\n~~~");
  });

  it("closes an unclosed fence inside a quote with a quoted fence line", () => {
    expect(balanceEmbed("> ```\n> x")).toBe("> ```\n> x\n> ```");
  });

  it("does not treat a fence closed on the last line as unclosed", () => {
    expect(balanceEmbed("```\nx\n```")).toBe("```\nx\n```");
  });

  it("closes an unmatched %% outside code", () => {
    expect(balanceEmbed("a %% hidden\nmore")).toBe("a %% hidden\nmore\n%%");
    expect(balanceEmbed("`%%` and %%")).toBe("`%%` and %%\n%%");
  });

  it("ignores %% inside code, including a fence it closes", () => {
    expect(balanceEmbed("`%%` x")).toBe("`%%` x");
    expect(balanceEmbed("```\n%%")).toBe("```\n%%\n```");
  });

  it("closes both, fence first", () => {
    expect(balanceEmbed("%% c\n```\nx")).toBe("%% c\n```\nx\n```\n%%");
  });
});
