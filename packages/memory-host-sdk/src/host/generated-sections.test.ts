import { describe, expect, it } from "vitest";
import {
  buildGeneratedSectionMarkers,
  containsGeneratedSectionBlock,
  renderGeneratedSectionBlock,
  stripGeneratedSectionBlocks,
  upsertGeneratedSectionBlock,
} from "./generated-sections.js";

describe("generated memory projection sections", () => {
  it("renders deterministic markers for a block id", () => {
    expect(buildGeneratedSectionMarkers("memory-digest")).toEqual({
      start: "<!-- OPENCLAW:MEMORY-PROJECTION:START memory-digest -->",
      end: "<!-- OPENCLAW:MEMORY-PROJECTION:END memory-digest -->",
    });
  });

  it("upserts a generated block into empty content", () => {
    const result = upsertGeneratedSectionBlock({
      content: "",
      blockId: "user-profile",
      body: "## Compiled User Memory\n- Prefer concise answers",
    });

    expect(result.changed).toBe(true);
    expect(result.content).toContain("## Compiled User Memory");
    expect(containsGeneratedSectionBlock(result.content, "user-profile")).toBe(true);
  });

  it("replaces an existing generated block without changing manual content", () => {
    const existing = [
      "# USER",
      "",
      "Manual section",
      "",
      renderGeneratedSectionBlock({
        blockId: "user-profile",
        body: "Old body",
      }),
      "",
    ].join("\n");

    const result = upsertGeneratedSectionBlock({
      content: existing,
      blockId: "user-profile",
      body: "New body",
    });

    expect(result.content).toContain("Manual section");
    expect(result.content).toContain("New body");
    expect(result.content).not.toContain("Old body");
  });

  it("treats malformed trailing generated blocks as replaceable tails", () => {
    const existing = [
      "# MEMORY",
      "",
      "Manual section",
      "",
      "<!-- OPENCLAW:MEMORY-PROJECTION:START memory-digest -->",
      "broken",
    ].join("\n");

    const result = upsertGeneratedSectionBlock({
      content: existing,
      blockId: "memory-digest",
      body: "Fresh block",
    });

    expect(result.content).toContain("Manual section");
    expect(result.content).toContain("Fresh block");
    expect(result.content).not.toContain("broken");
  });

  it("strips generated blocks while leaving manual content intact", () => {
    const content = [
      "# MEMORY",
      "",
      "Manual memory",
      "",
      renderGeneratedSectionBlock({
        blockId: "memory-digest",
        body: "Generated memory",
      }),
      "",
      "Manual footer",
    ].join("\n");

    expect(stripGeneratedSectionBlocks(content)).toBe(
      ["# MEMORY", "", "Manual memory", "", "Manual footer"].join("\n"),
    );
  });
});
