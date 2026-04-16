import { describe, expect, it } from "vitest";
import { countRuntimeTokens } from "../../runtime-read-models.ts";
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

  it("limits retrieval packs to the current session scope and excludes broad derived packs by default", () => {
    const result = assembleContext({
      projectionVersions: [],
      projectionTexts: {},
      artifacts: [
        {
          id: "artifact-procedure",
          artifactType: "procedure_memory_pack",
          scopeKey: "scope-project-001",
          sourceObjectIds: [],
          sourceSlotKeys: [],
          renderedText: "Procedure pack",
          contentHash: "hash-procedure",
          tokenEstimate: 2,
          buildPolicyVersion: "v1",
          builtAt: new Date(0),
        },
        {
          id: "artifact-retrieval-other",
          artifactType: "retrieval_pack",
          scopeKey: "other-session",
          sourceObjectIds: [],
          sourceSlotKeys: [],
          renderedText: "Should stay out",
          contentHash: "hash-other",
          tokenEstimate: 3,
          buildPolicyVersion: "v1",
          builtAt: new Date(0),
        },
        {
          id: "artifact-retrieval-current",
          artifactType: "retrieval_pack",
          scopeKey: "current-session",
          sourceObjectIds: [],
          sourceSlotKeys: [],
          renderedText: "Keep me",
          contentHash: "hash-current",
          tokenEstimate: 3,
          buildPolicyVersion: "v1",
          builtAt: new Date(1000),
        },
      ],
      recentTurns: [],
      toolResults: [],
      currentTurn: "Current turn",
      maxTokens: 100,
      includeRetrievalPacks: true,
      retrievalPackScopeKeys: ["current-session"],
    });

    expect(result.semiStableSegments.map((entry) => entry.segmentType)).toEqual(["retrieval_pack"]);
    expect(result.semiStableSegments.map((entry) => entry.sourceArtifactId)).toEqual([
      "artifact-retrieval-current",
    ]);
  });

  it("applies projection target budgets before final trimming", () => {
    const oversizedProjection = Array.from({ length: 800 }, () => "memory").join(" ");
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
          tokenEstimate: 800,
          builtAt: new Date(0),
        },
      ],
      projectionTexts: {
        "memory-md": oversizedProjection,
      },
      artifacts: [],
      recentTurns: [],
      toolResults: [],
      currentTurn: "Current turn",
      maxTokens: 1000,
    });

    expect(countRuntimeTokens(result.stableSegments[0]?.text ?? "")).toBeLessThanOrEqual(600);
  });

  it("keeps only the latest derived artifact version per type and scope", () => {
    const result = assembleContext({
      projectionVersions: [],
      projectionTexts: {},
      artifacts: [
        {
          id: "artifact-user-old",
          artifactType: "user_memory_pack",
          scopeKey: "scope-user-001",
          sourceObjectIds: [],
          sourceSlotKeys: [],
          renderedText: "Old user pack",
          contentHash: "hash-old",
          tokenEstimate: 3,
          buildPolicyVersion: "v1",
          builtAt: new Date(0),
        },
        {
          id: "artifact-user-new",
          artifactType: "user_memory_pack",
          scopeKey: "scope-user-001",
          sourceObjectIds: [],
          sourceSlotKeys: [],
          renderedText: "New user pack",
          contentHash: "hash-new",
          tokenEstimate: 3,
          buildPolicyVersion: "v1",
          builtAt: new Date(1000),
        },
      ],
      recentTurns: [],
      toolResults: [],
      currentTurn: "Current turn",
      maxTokens: 100,
    });

    expect(result.semiStableSegments).toHaveLength(1);
    expect(result.semiStableSegments[0]?.sourceArtifactId).toBe("artifact-user-new");
  });
});
