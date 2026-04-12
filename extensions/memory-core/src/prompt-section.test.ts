import { describe, expect, it } from "vitest";
import { buildPromptSection } from "./prompt-section.js";

describe("memory prompt section", () => {
  it("keeps workspace-memory recall guidance but adds a mounted source-of-truth exception", () => {
    const lines = buildPromptSection({
      availableTools: new Set(["memory_search", "memory_get"]),
      citationsMode: "on",
    });
    const prompt = lines.join("\n");

    expect(prompt).toContain("## Memory Recall");
    expect(prompt).toContain("workspace continuity");
    expect(prompt).toContain("imports/*/content");
    expect(prompt).toContain("implementation truth");
    expect(prompt).toContain("mixed continuity-plus-implementation truth");
    expect(prompt).toContain("If memory_search returns nothing");
  });
});
