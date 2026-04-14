import { describe, expect, it } from "vitest";
import { bootstrapContext } from "./bootstrap.ts";

describe("context bootstrap", () => {
  it("loads deterministic projection versions and the session summary artifact", () => {
    const result = bootstrapContext({
      sessionId: "session-001",
      agentId: "agent-main",
      sessionState: {
        sessionId: "session-001",
        agentId: "agent-main",
        activeProjectIds: ["project-002", "project-001"],
        openLoops: [],
        unresolvedQuestions: [],
        activePlanState: {},
        sessionSummaryArtifactId: "artifact-summary",
        projectionVersions: {},
        compactionStatus: "delegated",
        updatedAt: new Date(0),
      },
      projectionVersions: [
        {
          id: "proj-user",
          targetId: "user-md",
          contentHash: "hash-user",
          canonicalArtifactPath: ".openclaw/model-memory/projections/user.md",
          sourceObjectIds: [],
          sourceSlotKeys: [],
          sourceSetKeys: [],
          tokenEstimate: 12,
          builtAt: new Date(0),
        },
        {
          id: "proj-memory",
          targetId: "memory-md",
          contentHash: "hash-memory",
          canonicalArtifactPath: ".openclaw/model-memory/projections/memory.md",
          sourceObjectIds: [],
          sourceSlotKeys: [],
          sourceSetKeys: [],
          tokenEstimate: 20,
          builtAt: new Date(0),
        },
      ],
      artifacts: [
        {
          id: "artifact-summary",
          artifactType: "session_summary_pack",
          scopeKey: "scope-session-001",
          sourceObjectIds: [],
          sourceSlotKeys: [],
          renderedText: "Summary",
          contentHash: "artifact-hash",
          tokenEstimate: 1,
          buildPolicyVersion: "v1",
          builtAt: new Date(0),
        },
      ],
    });

    expect(result.activeProjectIds).toEqual(["project-001", "project-002"]);
    expect(result.projectionVersions.map((entry) => entry.targetId)).toEqual([
      "memory-md",
      "user-md",
    ]);
    expect(result.sessionSummaryArtifact?.id).toBe("artifact-summary");
  });
});
