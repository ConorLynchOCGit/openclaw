import { describe, expect, it } from "vitest";
import { assembleContext } from "./assemble.ts";

describe("context assemble", () => {
  it("segments stable, semi-stable, and volatile context without retrieval packs", () => {
    const result = assembleContext({
      projectionVersions: [
        {
          id: "proj-memory",
          targetId: "memory-md",
          contentHash: "hash-memory",
          canonicalArtifactPath: ".openclaw/model-memory/projections/memory.md",
          sourceObjectIds: [],
          sourceSlotKeys: [],
          sourceSetKeys: [],
          tokenEstimate: 10,
          builtAt: new Date(0),
        },
      ],
      projectionTexts: {
        "memory-md": "# MEMORY.md\n\n- item",
      },
      artifacts: [
        {
          id: "artifact-user",
          artifactType: "user_memory_pack",
          scopeKey: "scope-user-001",
          sourceObjectIds: [],
          sourceSlotKeys: [],
          renderedText: "User pack",
          contentHash: "hash-user",
          tokenEstimate: 2,
          buildPolicyVersion: "v1",
          builtAt: new Date(0),
        },
        {
          id: "artifact-retrieval",
          artifactType: "retrieval_pack",
          scopeKey: "scope-user-001",
          sourceObjectIds: [],
          sourceSlotKeys: [],
          renderedText: "Should stay out",
          contentHash: "hash-retrieval",
          tokenEstimate: 3,
          buildPolicyVersion: "v1",
          builtAt: new Date(0),
        },
      ],
      recentTurns: [{ role: "assistant", text: "What format should I use?" }],
      toolResults: ["tool result"],
      currentTurn: "Please keep explanations high level.",
      maxTokens: 100,
    });

    expect(result.stableSegments).toHaveLength(1);
    expect(result.semiStableSegments).toHaveLength(1);
    expect(result.semiStableSegments[0].text).toBe("User pack");
    expect(
      result.semiStableSegments.some((entry) => entry.sourceArtifactId === "artifact-retrieval"),
    ).toBe(false);
    expect(result.volatileSegments.some((entry) => entry.segmentType === "recent_turns")).toBe(
      true,
    );
  });
});
