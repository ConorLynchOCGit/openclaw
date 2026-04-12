import { describe, expect, it } from "vitest";
import { createMemoryContextOutcomeTracker } from "./memory-context-outcome-tracker.js";

describe("memory context outcome tracker", () => {
  it("stores generated run ids in observations when prompt attachments omit them", () => {
    const tracker = createMemoryContextOutcomeTracker();

    const observations = tracker.recordPromptAttachment({
      sessionId: "session-1",
      sessionKey: "agent:main:main",
      agentId: "main",
      compiled: {
        text: "memory",
        hash: "pack-hash-1",
        attachedSlotCount: 1,
        omittedSlotCount: 0,
        packs: [
          {
            kind: "user",
            title: "User Memory Pack",
            text: "- Prefer concise answers.",
            hash: "user-pack-1",
            chars: 24,
            approxTokens: 6,
            slotKeys: ["user_preference|shared|||user_response_concise"],
            semanticKeys: ["shared||||user_response_concise"],
            omittedSlotKeys: [],
            sourceIds: ["memory-1"],
          },
        ],
      },
    });

    expect(observations).toHaveLength(1);
    expect(observations[0]?.outcome).toBe("pack_attached");
    expect(observations[0]?.runId).toMatch(/^memory-context-run:/u);
  });
});
