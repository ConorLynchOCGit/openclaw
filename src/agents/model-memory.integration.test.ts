import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORKSPACE_PROJECTION_TARGETS,
  buildContextArtifact,
  buildWorkspaceProjectionVersion,
} from "../../extensions/model-memory/runtime-api.ts";
import { integrateModelMemoryWithHarness } from "./model-memory.integration.ts";

describe("model-memory harness integration", () => {
  it("projects model-memory outputs into real bootstrap file surfaces and normalized usage", () => {
    const projectionTargets = DEFAULT_WORKSPACE_PROJECTION_TARGETS;
    const projectionOutputs = {
      "agents-md": "# AGENTS\n- obey rule-001",
      "memory-md": "# MEMORY\n- project fact",
      "user-md": "# USER\n- response preference",
    };
    const projectionVersions = [
      buildWorkspaceProjectionVersion({
        targetId: "agents-md",
        renderedText: projectionOutputs["agents-md"],
        sourceObjectIds: [],
        sourceSlotKeys: [],
        sourceSetKeys: [],
      }),
      buildWorkspaceProjectionVersion({
        targetId: "memory-md",
        renderedText: projectionOutputs["memory-md"],
        sourceObjectIds: [],
        sourceSlotKeys: [],
        sourceSetKeys: [],
      }),
      buildWorkspaceProjectionVersion({
        targetId: "user-md",
        renderedText: projectionOutputs["user-md"],
        sourceObjectIds: [],
        sourceSlotKeys: [],
        sourceSetKeys: [],
      }),
    ];

    const result = integrateModelMemoryWithHarness({
      sessionId: "session-001",
      agentId: "agent-main",
      projectionTargets,
      projectionVersions,
      projectionOutputs,
      artifacts: [
        buildContextArtifact({
          artifactType: "user_memory_pack",
          renderedText: "User pack body",
          buildPolicyVersion: "v1",
        }),
      ],
      recentTurns: [{ role: "user", text: "hello" }],
      toolResults: [],
      currentTurn: "current turn",
      maxTokens: 200,
      provider: "provider-001",
      model: "model-001",
      rawUsage: {
        prompt_tokens: 40,
        completion_tokens: 10,
        cache_read_input_tokens: 7,
      },
    });

    expect(result.bootstrapFiles.map((file) => file.name).toSorted()).toEqual([
      "AGENTS.md",
      "MEMORY.md",
      "USER.md",
    ]);
    expect(result.normalizedUsage?.input).toBe(40);
    expect(result.normalizedUsage?.output).toBe(10);
    expect(result.normalizedUsage?.cacheRead).toBe(7);
    expect(result.engine.ledger.run.cacheReadTokens).toBe(7);
  });

  it("keeps retrieval-pack inclusion explicit at the harness boundary", () => {
    const projectionOutputs = {
      "memory-md": "# MEMORY\n- project fact",
    };
    const projectionVersions = [
      buildWorkspaceProjectionVersion({
        targetId: "memory-md",
        renderedText: projectionOutputs["memory-md"],
        sourceObjectIds: [],
        sourceSlotKeys: [],
        sourceSetKeys: [],
      }),
    ];
    const retrievalArtifact = buildContextArtifact({
      artifactType: "retrieval_pack",
      renderedText: "Retrieved procedure",
      buildPolicyVersion: "v1",
    });

    const withoutRetrieval = integrateModelMemoryWithHarness({
      sessionId: "session-001",
      agentId: "agent-main",
      projectionTargets: DEFAULT_WORKSPACE_PROJECTION_TARGETS,
      projectionVersions,
      projectionOutputs,
      artifacts: [retrievalArtifact],
      recentTurns: [],
      toolResults: [],
      currentTurn: "current turn",
      maxTokens: 200,
      provider: "provider-001",
      model: "model-001",
    });
    const withRetrieval = integrateModelMemoryWithHarness({
      sessionId: "session-001",
      agentId: "agent-main",
      projectionTargets: DEFAULT_WORKSPACE_PROJECTION_TARGETS,
      projectionVersions,
      projectionOutputs,
      artifacts: [retrievalArtifact],
      recentTurns: [],
      toolResults: [],
      currentTurn: "current turn",
      maxTokens: 200,
      provider: "provider-001",
      model: "model-001",
      includeRetrievalPacks: true,
    });

    expect(
      withoutRetrieval.engine.assembled.orderedSegments.some(
        (segment) => segment.segmentType === "retrieval_pack" && !segment.dropped,
      ),
    ).toBe(false);
    expect(
      withRetrieval.engine.assembled.orderedSegments.some(
        (segment) => segment.segmentType === "retrieval_pack",
      ),
    ).toBe(true);
  });
});
