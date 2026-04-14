import { describe, expect, it } from "vitest";
import { adaptOrdinaryTurnSource } from "./ordinary-turn-source-adapter.ts";

describe("ordinary-turn-source-adapter", () => {
  it("preserves speaker boundaries in deterministic normalized windows", () => {
    const result = adaptOrdinaryTurnSource({
      recentContext: [{ speaker: "assistant", text: "What format should I use?" }],
      currentTurnText: "Please keep explanations high level by default.",
      sessionId: "session-001",
      projectId: "project-001",
    });

    expect(result.source.sourceKind).toBe("ordinary_turn");
    expect(result.windows).toHaveLength(1);
    expect(result.windows[0].normalizedText).toContain("assistant: What format should I use?");
    expect(result.windows[0].normalizedText).toContain(
      "user: Please keep explanations high level by default.",
    );
  });

  it("splits only by structural message boundaries when the word budget requires it", () => {
    const result = adaptOrdinaryTurnSource({
      recentContext: [
        { speaker: "assistant", text: "Context one." },
        { speaker: "assistant", text: "Context two." },
      ],
      currentTurnText: "Please keep explanations high level by default.",
      maxWordsPerWindow: 4,
    });

    expect(result.windows.length).toBeGreaterThan(1);
    expect(
      result.windows.every((window) =>
        window.blockDescriptors.every((block) => block.kind === "message"),
      ),
    ).toBe(true);
  });
});
