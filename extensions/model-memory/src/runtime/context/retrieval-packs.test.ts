import { describe, expect, it } from "vitest";
import { assembleContext } from "./assemble.ts";
import { buildRetrievalPackArtifact } from "./retrieval-packs.ts";

describe("retrieval packs", () => {
  it("materializes retrieval outputs into derived context artifacts and injects them explicitly", () => {
    const artifact = buildRetrievalPackArtifact({
      retrievalRequest: {
        id: "retrieval-request-001",
        sessionId: "session-001",
        queryText: "Find deployment information",
        requestPurpose: "context_injection",
        scope: { projectId: "project-001" },
        desiredResultCount: 2,
        contractName: "retrieval_request_interpretation",
        contractVersion: "v1",
        modelId: "retrieval-model-001",
        createdAt: new Date(0),
      },
      retrievalResultSet: {
        id: "retrieval-set-001",
        retrievalRequestId: "retrieval-request-001",
        contentHash: "hash-001",
        resultCount: 1,
        createdAt: new Date(0),
      },
      retrievalResultItems: [
        {
          id: "retrieval-item-001",
          retrievalResultSetId: "retrieval-set-001",
          memoryObjectId: "memory-001",
          rankIndex: 0,
          rankBand: "primary",
          retrievalReasonCodes: ["scope_match", "subject_match", "rerank_selected"],
          selectedForContext: true,
          createdAt: new Date(0),
        },
      ],
      memoryObjects: [
        {
          id: "memory-001",
          sourceWindowId: "window-001",
          canonicalClass: "project",
          kind: "fact",
          payload: { subject: "deployment region", value: "region-001" },
          normalizedSubject: "deployment region",
          normalizedTitle: undefined,
          normalizedSearchText: "deployment region region-001",
          scope: { projectId: "project-001", projectScope: "project-001" },
          scopeKey: "scope-project-001",
          provenance: [{ sourceId: "window-001", segmentIndex: 0, headingPath: [] }],
          confidence: "strong",
          durability: "durable",
          suggestedReviewMode: "auto_accept",
          executedReviewMode: "auto_accept",
          rationaleCodes: [],
          identityKey: "fact-001",
          slotKey: "slot-001",
          contractName: "semantic_extraction",
          contractVersion: "v1",
          modelId: "model-001",
          createdAt: new Date(0),
        },
      ],
      buildPolicyVersion: "v1",
    });

    expect(artifact.artifactType).toBe("retrieval_pack");
    expect(artifact.sourceObjectIds).toEqual(["memory-001"]);

    const assembled = assembleContext({
      projectionVersions: [],
      projectionTexts: {},
      artifacts: [artifact],
      recentTurns: [],
      toolResults: [],
      currentTurn: "What is the deployment region?",
      maxTokens: 100,
      includeRetrievalPacks: true,
    });

    expect(assembled.semiStableSegments).toHaveLength(1);
    expect(assembled.semiStableSegments[0]?.segmentType).toBe("retrieval_pack");
    expect(assembled.semiStableSegments[0]?.text).toContain("deployment region");
  });

  it("keeps only the latest retrieval pack for the active scope", () => {
    const assembled = assembleContext({
      projectionVersions: [],
      projectionTexts: {},
      artifacts: [
        {
          id: "artifact-old",
          artifactType: "retrieval_pack",
          scopeKey: "session-001",
          sourceObjectIds: [],
          sourceSlotKeys: [],
          renderedText: "old retrieval pack",
          contentHash: "hash-old",
          tokenEstimate: 3,
          buildPolicyVersion: "v1",
          builtAt: new Date(0),
        },
        {
          id: "artifact-new",
          artifactType: "retrieval_pack",
          scopeKey: "session-001",
          sourceObjectIds: [],
          sourceSlotKeys: [],
          renderedText: "new retrieval pack",
          contentHash: "hash-new",
          tokenEstimate: 3,
          buildPolicyVersion: "v1",
          builtAt: new Date(1000),
        },
      ],
      recentTurns: [],
      toolResults: [],
      currentTurn: "What is the deployment region?",
      maxTokens: 100,
      includeRetrievalPacks: true,
      retrievalPackScopeKeys: ["session-001"],
    });

    expect(assembled.semiStableSegments).toHaveLength(1);
    expect(assembled.semiStableSegments[0]?.sourceArtifactId).toBe("artifact-new");
  });
});
