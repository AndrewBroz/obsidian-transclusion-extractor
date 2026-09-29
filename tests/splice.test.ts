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

describe("spliceEmbed — inside a table row", () => {
  it("joins paragraphs with <br> in a single cell", () => {
    expect(at("| ![[x]] | b |", "p1\n\np2")).toEqual(["| p1<br>p2 | b |"]);
  });

  it("joins soft-wrapped lines with a space and strips quote markers", () => {
    expect(at("| a | ![[x]] |", "> [!note] T\n> one\n> two\n>\n> three")).toEqual(["| a | [!note] T one two<br>three |"]);
  });

  it("never breaks out, even when the embed ends the row", () => {
    expect(at("| a | ![[x]]", "p1\np2")).toEqual(["| a | p1 p2"]);
  });
});
