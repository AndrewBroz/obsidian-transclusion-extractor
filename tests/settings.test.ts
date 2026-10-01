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

  it("fills saved Snapshot preset from SNAPSHOT, not PUBLISH", () => {
    const s = loadSettings({
      presets: [{ name: "Snapshot", options: { stripBlockIds: false, stripComments: false, shiftHeadings: true } }],
    });
    expect(s.presets[0].options).toEqual(SNAPSHOT);
  });

  it("loadSettings(null) returns default presets with lastPreset Publish", () => {
    const s = loadSettings(null);
    expect(s.presets.map((p) => p.name)).toEqual(["Publish", "Snapshot"]);
    expect(s.lastPreset).toBe("Publish");
  });

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

  it("back-fills a custom preset's stripInlineMarkers from its own stripComments", () => {
    const s = loadSettings({
      presets: [{ name: "Archive", options: { stripComments: false } }],
    });
    expect(s.presets[0].options.stripInlineMarkers).toBe(false);
  });

  it("back-fills a custom preset's stripInlineMarkers from its own stripComments (true)", () => {
    const s = loadSettings({
      presets: [{ name: "Mine", options: { stripComments: true } }],
    });
    expect(s.presets[0].options.stripInlineMarkers).toBe(true);
  });
});

describe("uniqueName", () => {
  it("appends a counter when the name is taken", () => {
    expect(uniqueName(["New preset"], "New preset")).toBe("New preset 2");
    expect(uniqueName(["New preset", "New preset 2"], "New preset")).toBe("New preset 3");
    expect(uniqueName([], "New preset")).toBe("New preset");
  });
});
