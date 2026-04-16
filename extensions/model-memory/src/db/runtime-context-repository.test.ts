import { describe, expect, it } from "vitest";
import { buildContextArtifact } from "../runtime/context-artifacts.ts";
import { buildContextRunLedger } from "../usage-cache-ledger.ts";
import { ModelMemoryCanonicalRepository } from "./canonical-repository.ts";
import { applyModelMemoryMigrations } from "./migrations.ts";
import { createPgMemTestDatabase } from "./pg-test.ts";
import { RuntimeContextRepository } from "./runtime-context-repository.ts";

describe("runtime-context-repository", () => {
  it("round-trips derived runtime tables through the live schema", async () => {
    const database = await createPgMemTestDatabase();
    try {
      await applyModelMemoryMigrations(database.sql);
      const canonical = new ModelMemoryCanonicalRepository(database.sql);
      const runtime = new RuntimeContextRepository(database.sql);

      const source = await canonical.persistSource({
        id: "ebf420f0-6249-5b07-a33b-64843df7a4c1",
        sourceKind: "document",
        sourceFingerprint: "source-fingerprint-001",
        sourceMetadata: {},
        createdAt: new Date(0),
      });
      const [window] = await canonical.persistSourceWindows([
        {
          id: "f2bd1d6a-cf79-5ef8-9d8f-c8ce083f2ce8",
          sourceId: source.id,
          windowIndex: 0,
          normalizedText: "window-001",
          normalizedFingerprint: "window-fingerprint-001",
          tokenEstimate: 1,
          headingPath: [],
          blockDescriptors: [],
          createdAt: new Date(0),
        },
      ]);
      const memoryObject = await canonical.insertMemoryObject({
        id: "b4865c9e-b912-52c7-a28c-e0f32c0aaf0c",
        sourceWindowId: window.id,
        canonicalClass: "project",
        kind: "fact",
        payload: { subject: "deployment region", value: "region-001" },
        normalizedSubject: "deployment region",
        normalizedTitle: undefined,
        normalizedSearchText: "deployment region region-001",
        scope: { projectId: "project-001" },
        scopeKey: "scope-project-001",
        provenance: [],
        confidence: "strong",
        durability: "durable",
        suggestedReviewMode: "auto_accept",
        executedReviewMode: "auto_accept",
        rationaleCodes: [],
        identityKey: "identity-001",
        slotKey: "slot-project-region",
        contractName: "semantic_extraction",
        contractVersion: "v1",
        modelId: "model-001",
        createdAt: new Date(0),
      });

      const artifact = await runtime.persistContextArtifact(
        buildContextArtifact({
          artifactType: "user_memory_pack",
          scopeKey: "scope-project-001",
          sourceObjectIds: [memoryObject.id],
          sourceSlotKeys: ["slot-project-region"],
          renderedText: "Current project fact: region-001",
          buildPolicyVersion: "v1",
          builtAt: new Date(1000),
        }),
      );
      await runtime.replaceActiveMemorySlots([
        {
          slotKey: "slot-project-region",
          canonicalClass: "project",
          kind: "fact",
          scopeKey: "scope-project-001",
          subjectKey: "deployment region",
          currentObjectId: memoryObject.id,
          currentIdentityKey: "identity-001",
          updatedAt: new Date(1000),
        },
      ]);
      await runtime.replaceActiveMemorySets([
        {
          id: "76f99117-e7d8-5672-914c-00cad2f0a9f8",
          setKey: "project:fact:scope-project-001",
          canonicalClass: "project",
          kind: "fact",
          scopeKey: "scope-project-001",
          memoryObjectId: memoryObject.id,
          sortKey: "deployment region|identity-001",
          updatedAt: new Date(1000),
        },
      ]);
      await runtime.upsertSessionContextState({
        sessionId: "session-001",
        agentId: "agent-main",
        activeProjectIds: ["project-001"],
        openLoops: ["loop-001"],
        unresolvedQuestions: ["question-001"],
        activePlanState: { phase: "active" },
        sessionSummaryArtifactId: artifact.id,
        projectionVersions: { "main/MEMORY.md": "version-001" },
        compactionStatus: "delegated",
        updatedAt: new Date(2000),
      });
      await runtime.upsertProjectionTarget({
        targetId: "main/MEMORY.md",
        targetKind: "memory_md",
        relativePath: "MEMORY.md",
        generatedBlockId: "memory-projection",
        allowedCanonicalClasses: ["project"],
        allowedKinds: ["fact"],
        tokenBudget: 400,
        rankingPolicyId: "default",
        enabled: true,
      });
      await runtime.persistProjectionVersion({
        id: "33cfa909-e893-52c3-a55e-7ba373ee4fea",
        targetId: "main/MEMORY.md",
        contentHash: "projection-hash-001",
        canonicalArtifactPath: "MEMORY.md",
        sourceObjectIds: [memoryObject.id],
        sourceSlotKeys: ["slot-project-region"],
        sourceSetKeys: ["project:fact:scope-project-001"],
        tokenEstimate: 8,
        builtAt: new Date(3000),
      });
      const retrievalRequest = await runtime.persistRetrievalRequest({
        id: "428b3033-3a8a-5f2c-b56d-c3ccf3f90bfd",
        sessionId: "session-001",
        agentId: "agent-main",
        queryText: "Find deployment region",
        requestPurpose: "context_injection",
        scope: { projectId: "project-001" },
        desiredResultCount: 3,
        contractName: "retrieval_request_interpretation",
        contractVersion: "v1",
        modelId: "retrieval-model-001",
        createdAt: new Date(4000),
      });
      const retrievalSet = await runtime.persistRetrievalResultSet({
        id: "c1141eb4-8c43-507b-a665-92ccece6a2a0",
        retrievalRequestId: retrievalRequest.id,
        contentHash: "retrieval-set-hash-001",
        resultCount: 1,
        createdAt: new Date(4000),
      });
      await runtime.replaceRetrievalResultItems(retrievalSet.id, [
        {
          id: "14d3182c-f726-5687-a2ce-bb258ca0dca5",
          retrievalResultSetId: retrievalSet.id,
          memoryObjectId: memoryObject.id,
          rankIndex: 0,
          rankBand: "primary",
          retrievalReasonCodes: ["scope_match"],
          selectedForContext: true,
          createdAt: new Date(4000),
        },
      ]);
      const ledger = buildContextRunLedger({
        sessionId: "session-001",
        agentId: "agent-main",
        provider: "provider-001",
        model: "model-001",
        stableSegments: [
          {
            segmentType: "bootstrap",
            sourceKind: "workspace_projection",
            text: "MEMORY.md projection",
            projectionVersionId: "33cfa909-e893-52c3-a55e-7ba373ee4fea",
          },
        ],
        semiStableSegments: [
          {
            segmentType: "user_pack",
            sourceKind: "context_artifact",
            text: artifact.renderedText ?? "",
            sourceArtifactId: artifact.id,
          },
        ],
        volatileSegments: [
          {
            segmentType: "recent_turns",
            sourceKind: "turn_history",
            text: "user: hello",
            trimmed: true,
            trimReason: "trim_budget",
          },
        ],
        assembledAt: new Date(5000),
      });
      await runtime.persistContextRun(ledger.run, ledger.segments);

      const snapshot = await runtime.snapshot();

      expect(snapshot.activeMemorySlots).toHaveLength(1);
      expect(snapshot.activeMemorySets).toHaveLength(1);
      expect(snapshot.contextArtifacts).toHaveLength(1);
      expect(snapshot.workspaceProjectionTargets).toHaveLength(1);
      expect(snapshot.workspaceProjectionVersions).toHaveLength(1);
      expect(snapshot.retrievalRequests).toHaveLength(1);
      expect(snapshot.retrievalResultSets).toHaveLength(1);
      expect(snapshot.retrievalResultItems).toHaveLength(1);
      expect(snapshot.contextRuns).toHaveLength(1);
      expect(snapshot.contextRunSegments[0]?.projectionVersionId).toBe(
        "33cfa909-e893-52c3-a55e-7ba373ee4fea",
      );
      expect(snapshot.contextRunSegments[2]?.trimReason).toBe("trim_budget");
      expect(snapshot.sessionContextState).toHaveLength(1);
    } finally {
      await database.close();
    }
  });
});
