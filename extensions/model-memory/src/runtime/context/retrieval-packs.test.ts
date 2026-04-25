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
        scope: {
          projectId: "project-001",
          memoryTraceId: "memory_trace_turn_tracepack001",
        },
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
    expect(artifact.renderedText).toContain("sha256:");
    expect(artifact.renderedText).not.toContain("Find deployment information");
    expect(artifact.structuredPayload?.schemaVersion).toBe("memory_retrieval_runtime.v1");
    expect(artifact.structuredPayload?.memoryTraceId).toBe("memory_trace_turn_tracepack001");
    expect(artifact.structuredPayload?.capsuleRetrievalShadow).toBeUndefined();
    expect(artifact.structuredPayload?.projectStateCapsuleContext).toBeUndefined();
    expect(artifact.structuredPayload?.retrievalRun).toEqual(
      expect.objectContaining({
        rawQueryPersisted: false,
        selectedMemoryIds: ["memory-001"],
      }),
    );
    expect(artifact.structuredPayload?.memoryPacks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          packType: "project_state_pack",
          sources: [expect.objectContaining({ memoryId: "memory-001" })],
        }),
      ]),
    );
    expect(artifact.structuredPayload?.recallProof).toEqual(
      expect.objectContaining({
        acceptedSources: ["mmv2_runtime_memory", "mmv2_projection_digest"],
        rejectedSources: ["root_USER_md", "root_MEMORY_md", "daily_note_only"],
      }),
    );

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

  it("lifts operating packs into system prompt additions without root workspace file proof", () => {
    const artifact = buildRetrievalPackArtifact({
      retrievalRequest: {
        id: "retrieval-request-rule",
        sessionId: "session-rule",
        queryText: "sha256:query-hash",
        requestPurpose: "context_injection",
        scope: { projectId: "project-001", retrievalRuntimeQueryHash: "query-hash" },
        desiredResultCount: 1,
        contractName: "retrieval_request_interpretation",
        contractVersion: "v1",
        modelId: "retrieval-model-001",
        createdAt: new Date(0),
      },
      retrievalResultSet: {
        id: "retrieval-set-rule",
        retrievalRequestId: "retrieval-request-rule",
        contentHash: "hash-rule",
        resultCount: 1,
        createdAt: new Date(0),
      },
      retrievalResultItems: [
        {
          id: "retrieval-item-rule",
          retrievalResultSetId: "retrieval-set-rule",
          memoryObjectId: "memory-rule",
          rankIndex: 0,
          rankBand: "primary",
          retrievalReasonCodes: ["kind_match", "rerank_selected"],
          selectedForContext: true,
          createdAt: new Date(0),
        },
      ],
      memoryObjects: [
        {
          id: "memory-rule",
          canonicalClass: "project",
          kind: "rule",
          payload: { subject: "deployment", recommendedAction: "ask before deploying" },
          normalizedSubject: "deployment",
          normalizedTitle: undefined,
          normalizedSearchText: "deployment ask before deploying",
          scope: { projectId: "project-001" },
          scopeKey: "project-001",
          provenance: [{ sourceId: "source-rule", blockId: "segment-rule" }],
          confidence: "strong",
          durability: "durable",
          suggestedReviewMode: "auto_accept",
          executedReviewMode: "auto_accept",
          rationaleCodes: [],
          identityKey: "rule-001",
          contractName: "mmv2_runtime_projection",
          contractVersion: "v1",
          modelId: "mmv2-storage",
          createdAt: new Date(0),
          lifecycleState: "active",
          activationBasis: "primary_capture",
        },
      ],
      buildPolicyVersion: "v1",
    });

    const assembled = assembleContext({
      projectionVersions: [],
      projectionTexts: {},
      artifacts: [artifact],
      recentTurns: [],
      toolResults: [],
      currentTurn: "Can you deploy?",
      maxTokens: 100,
      includeRetrievalPacks: true,
      retrievalPackScopeKeys: ["session-rule"],
    });

    expect(assembled.systemPromptAddition).toContain("<operating-memory>");
    expect(assembled.systemPromptAddition).toContain("ask before deploying");
    expect(assembled.systemPromptAddition).not.toContain("USER.md");
    expect(assembled.systemPromptAddition).not.toContain("MEMORY.md");
  });

  it("injects selected projection digests into runtime memory packs with active source ids", () => {
    const artifact = buildRetrievalPackArtifact({
      retrievalRequest: {
        id: "retrieval-request-projection",
        sessionId: "session-projection",
        queryText: "sha256:projection-query",
        requestPurpose: "context_injection",
        scope: { projectId: "project-001", retrievalRuntimeQueryHash: "projection-query" },
        desiredResultCount: 1,
        contractName: "retrieval_request_interpretation",
        contractVersion: "v1",
        modelId: "retrieval-model-001",
        createdAt: new Date(0),
      },
      retrievalResultSet: {
        id: "retrieval-set-projection",
        retrievalRequestId: "retrieval-request-projection",
        contentHash: "hash-projection",
        resultCount: 0,
        createdAt: new Date(0),
      },
      retrievalResultItems: [],
      memoryObjects: [
        {
          id: "memory-project",
          canonicalClass: "project",
          kind: "fact",
          payload: { subject: "active project", value: "projection backed" },
          normalizedSubject: "active project",
          normalizedSearchText: "active project projection backed",
          scope: { projectId: "project-001" },
          provenance: [{ sourceId: "source-project", blockId: "segment-project" }],
          confidence: "strong",
          durability: "durable",
          suggestedReviewMode: "auto_accept",
          executedReviewMode: "auto_accept",
          rationaleCodes: [],
          identityKey: "memory-project",
          contractName: "mmv2_runtime_projection",
          contractVersion: "v1",
          modelId: "mmv2-storage",
          createdAt: new Date(0),
          lifecycleState: "active",
        },
      ],
      projectionVersions: [
        {
          id: "projection-project-page",
          targetId: "catalog-project_page",
          projectionType: "project_page",
          contentHash: "hash-project-page",
          canonicalArtifactPath: ".openclaw/model-memory/projections/projects/page.md",
          sourceObjectIds: ["memory-project"],
          sourceEventIds: ["event-project"],
          sourceEdgeIds: ["edge-project"],
          sourceSlotKeys: [],
          sourceSetKeys: [],
          tokenEstimate: 10,
          builtAt: new Date(0),
          freshness: { status: "fresh" },
          staleMarkers: [],
          conflictMarkers: [],
          retrievalDigest: {
            title: "project page",
            summary: "gives concise active project state, blockers, and recent decisions",
            sourceMemoryIds: ["memory-project"],
            sourceEventIds: ["event-project"],
            contentHash: "hash-project-page",
          },
        },
      ],
      buildPolicyVersion: "v1",
    });

    const payload = artifact.structuredPayload as Record<string, any>;
    expect(payload.retrievalRun.selectedProjectionIds).toEqual(["projection-project-page"]);
    expect(payload.retrievalRun.metrics.selectedSourceMemoryIds).toEqual(["memory-project"]);
    expect(payload.memoryPacks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          packType: "projection_digest_pack",
          sources: [expect.objectContaining({ projectionId: "projection-project-page" })],
        }),
      ]),
    );

    const assembled = assembleContext({
      projectionVersions: [],
      projectionTexts: {},
      artifacts: [artifact],
      recentTurns: [],
      toolResults: [],
      currentTurn: "What is the active project state?",
      maxTokens: 100,
      includeRetrievalPacks: true,
      retrievalPackScopeKeys: ["session-projection"],
    });

    expect(assembled.semiStableSegments[0]?.text).toContain("catalog-project_page");
    expect(assembled.semiStableSegments[0]?.text).toContain("active project state");
    expect(assembled.semiStableSegments[0]?.text).toContain(
      ".openclaw/model-memory/projections/projects/page.md",
    );
  });

  it("records capsule retrieval shadow telemetry only when explicitly provided", () => {
    const artifact = buildRetrievalPackArtifact({
      retrievalRequest: {
        id: "retrieval-request-capsule-shadow",
        sessionId: "session-capsule-shadow",
        queryText: "sha256:capsule-query",
        requestPurpose: "context_injection",
        scope: { projectId: "project-001", retrievalRuntimeQueryHash: "capsule-query" },
        desiredResultCount: 1,
        contractName: "retrieval_request_interpretation",
        contractVersion: "v1",
        modelId: "retrieval-model-001",
        createdAt: new Date(0),
      },
      retrievalResultSet: {
        id: "retrieval-set-capsule-shadow",
        retrievalRequestId: "retrieval-request-capsule-shadow",
        contentHash: "hash-capsule-shadow",
        resultCount: 0,
        createdAt: new Date(0),
      },
      retrievalResultItems: [],
      memoryObjects: [],
      buildPolicyVersion: "v1",
      capsuleRetrievalShadow: {
        candidates: [],
        exclusions: [],
        packs: [
          {
            schemaVersion: "project_state_capsule_shadow_pack.v1",
            packId: "capsule-pack-1",
            shadow: true,
            injected: false,
            packType: "project_state_pack",
            capsuleId: "capsule-1",
            capsuleType: "project_state",
            projectId: "project-001",
            contentHash: "hash-capsule",
            sourceMemoryIds: ["memory-project"],
            sourceRefs: [{ sourceId: "source-project" }],
            authorityTiers: ["curated_authoritative"],
            sourceProfileIds: ["curated_corpus"],
            freshness: { status: "fresh" },
            staleMarkers: [],
            conflictMarkers: [],
            graphNodeIds: [],
            graphEdgeIds: [],
            sections: [],
            estimatedTokens: 0,
          },
        ],
        telemetry: {
          schemaVersion: "project_state_capsule_shadow_telemetry.v1",
          mode: "shadow_report_only",
          wouldSelectCapsuleIds: ["capsule-1"],
          excludedCapsuleIds: [],
          exclusionReasons: {
            shadow_disabled: 0,
            scope_mismatch: 0,
            stale: 0,
            conflicted: 0,
            inspection_only: 0,
            no_source_memory_ids: 0,
            not_generation_context_authority: 0,
          },
          capsuleSourceMemoryIds: ["memory-project"],
          capsuleContentHashes: ["hash-capsule"],
          projectPageBypassed: true,
          projectPageBypassReason: "project_state_capsule_available",
          defaultContextInjectionChanged: false,
        },
      },
    });

    expect(artifact.renderedText).not.toContain("capsule-1");
    expect(artifact.structuredPayload?.capsuleRetrievalShadow).toEqual(
      expect.objectContaining({
        telemetry: expect.objectContaining({
          wouldSelectCapsuleIds: ["capsule-1"],
          defaultContextInjectionChanged: false,
        }),
      }),
    );
    expect(artifact.structuredPayload?.projectStateCapsuleContext).toEqual(
      expect.objectContaining({
        telemetry: expect.objectContaining({
          mode: "disabled",
          injected: false,
          defaultContextInjectionChanged: false,
        }),
      }),
    );
  });

  it("injects project-state capsule context only under the explicit gate", () => {
    const capsuleRetrievalShadow = {
      candidates: [],
      exclusions: [],
      packs: [
        {
          schemaVersion: "project_state_capsule_shadow_pack.v1" as const,
          packId: "capsule-pack-explicit",
          shadow: true as const,
          injected: false as const,
          packType: "project_state_pack" as const,
          capsuleId: "capsule-explicit",
          capsuleType: "project_state" as const,
          projectId: "project-001",
          contentHash: "hash-capsule-explicit",
          sourceMemoryIds: ["memory-project"],
          sourceRefs: [{ sourceId: "source-project", segmentId: "segment-project" }],
          authorityTiers: ["tool_grounded" as const],
          sourceProfileIds: ["tool_result_capture" as const],
          freshness: { status: "fresh" as const },
          staleMarkers: [],
          conflictMarkers: [],
          graphNodeIds: [],
          graphEdgeIds: [],
          sections: [
            {
              sectionId: "section-current",
              sectionType: "current_state" as const,
              title: "Current State",
              itemCount: 1,
              sourceMemoryIds: ["memory-project"],
              authorityTiers: ["tool_grounded" as const],
              sourceProfileIds: ["tool_result_capture" as const],
              items: [
                {
                  itemId: "item-current",
                  sectionType: "current_state" as const,
                  text: "Project capsule context may be injected only by explicit gate.",
                  sourceMemoryIds: ["memory-project"],
                  authorityTier: "tool_grounded" as const,
                  sourceProfileId: "tool_result_capture" as const,
                },
              ],
            },
          ],
          estimatedTokens: 10,
        },
      ],
      telemetry: {
        schemaVersion: "project_state_capsule_shadow_telemetry.v1" as const,
        mode: "shadow_report_only" as const,
        wouldSelectCapsuleIds: ["capsule-explicit"],
        excludedCapsuleIds: [],
        exclusionReasons: {
          shadow_disabled: 0,
          scope_mismatch: 0,
          stale: 0,
          conflicted: 0,
          inspection_only: 0,
          no_source_memory_ids: 0,
          not_generation_context_authority: 0,
        },
        capsuleSourceMemoryIds: ["memory-project"],
        capsuleContentHashes: ["hash-capsule-explicit"],
        projectPageBypassed: true,
        projectPageBypassReason: "project_state_capsule_available" as const,
        defaultContextInjectionChanged: false as const,
      },
    };

    const artifact = buildRetrievalPackArtifact({
      retrievalRequest: {
        id: "retrieval-request-capsule-explicit",
        sessionId: "session-capsule-explicit",
        queryText: "sha256:capsule-explicit-query",
        requestPurpose: "context_injection",
        scope: { projectId: "project-001", retrievalRuntimeQueryHash: "capsule-explicit-query" },
        desiredResultCount: 1,
        contractName: "retrieval_request_interpretation",
        contractVersion: "v1",
        modelId: "retrieval-model-001",
        createdAt: new Date(0),
      },
      retrievalResultSet: {
        id: "retrieval-set-capsule-explicit",
        retrievalRequestId: "retrieval-request-capsule-explicit",
        contentHash: "hash-capsule-explicit-set",
        resultCount: 0,
        createdAt: new Date(0),
      },
      retrievalResultItems: [],
      memoryObjects: [],
      buildPolicyVersion: "v1",
      capsuleRetrievalShadow,
      capsuleContextMode: "explicit_injection",
      projectPageProjectionAvailable: true,
    });

    expect(artifact.renderedText).toContain("<project-state-capsule-context");
    expect(artifact.renderedText).toContain("Project capsule context may be injected");
    expect(artifact.renderedText).toContain("label:lower_authority");
    expect(artifact.structuredPayload?.projectStateCapsuleContext).toEqual(
      expect.objectContaining({
        blocks: [
          expect.objectContaining({
            capsuleId: "capsule-explicit",
            packId: "capsule-pack-explicit",
            sourceMemoryIds: ["memory-project"],
            authorityTiers: ["tool_grounded"],
            sourceProfileIds: ["tool_result_capture"],
          }),
        ],
        telemetry: expect.objectContaining({
          mode: "explicit_injection",
          injected: true,
          defaultContextInjectionChanged: false,
          projectPageBypassed: true,
        }),
      }),
    );

    const assembled = assembleContext({
      projectionVersions: [],
      projectionTexts: {},
      artifacts: [artifact],
      recentTurns: [],
      toolResults: [],
      currentTurn: "What is the project state?",
      maxTokens: 200,
      includeRetrievalPacks: true,
      retrievalPackScopeKeys: ["session-capsule-explicit"],
    });

    expect(assembled.semiStableSegments[0]?.text).toContain("<project-state-capsule-context");
    expect(assembled.semiStableSegments[0]?.text).toContain("tool_grounded");
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
