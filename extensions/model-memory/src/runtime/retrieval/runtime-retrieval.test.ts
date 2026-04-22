import { describe, expect, it } from "vitest";
import type { InterpretedRetrievalRequest } from "../../retrieval-request-interpreter.ts";
import type {
  RetrievalResultItemRecord,
  RuntimeMemoryRecord,
  WorkspaceProjectionVersionRecord,
} from "../../runtime-read-models.ts";
import {
  buildMemoryPacks,
  buildProjectionDigests,
  buildRetrievalPlan,
  buildRetrievalRun,
  recallCanonicalCandidates,
  redactRetrievalQueryForStorage,
} from "./index.ts";

function memory(
  overrides: Partial<RuntimeMemoryRecord> & Pick<RuntimeMemoryRecord, "id">,
): RuntimeMemoryRecord {
  return {
    id: overrides.id,
    canonicalClass: overrides.canonicalClass ?? "project",
    kind: overrides.kind ?? "fact",
    payload: overrides.payload ?? { subject: "deployment region", value: "region-001" },
    normalizedSubject: overrides.normalizedSubject ?? "deployment region",
    normalizedTitle: overrides.normalizedTitle,
    normalizedSearchText: overrides.normalizedSearchText ?? "deployment region region-001",
    sourceEvidenceSearchText: overrides.sourceEvidenceSearchText,
    scope: overrides.scope ?? { projectId: "project-001" },
    scopeKey: overrides.scopeKey ?? "project-001",
    provenance: overrides.provenance ?? [{ sourceId: "source-001", blockId: "segment-001" }],
    lifecycleState: overrides.lifecycleState ?? "active",
    activationBasis: overrides.activationBasis ?? "primary_capture",
    confidence: overrides.confidence ?? "strong",
    durability: overrides.durability ?? "durable",
    suggestedReviewMode: overrides.suggestedReviewMode ?? "auto_accept",
    executedReviewMode: overrides.executedReviewMode ?? "auto_accept",
    rationaleCodes: overrides.rationaleCodes ?? [],
    identityKey: overrides.identityKey ?? overrides.id,
    contractName: overrides.contractName ?? "mmv2_runtime_projection",
    contractVersion: overrides.contractVersion ?? "v1",
    modelId: overrides.modelId ?? "mmv2-storage",
    createdAt: overrides.createdAt ?? new Date(0),
    activatedAt: overrides.activatedAt ?? new Date(0),
    expiredAt: overrides.expiredAt,
    supersededAt: overrides.supersededAt,
    sourceWindowId: overrides.sourceWindowId,
    slotKey: overrides.slotKey,
  };
}

const request: InterpretedRetrievalRequest = {
  goal: "deployment memory",
  canonicalClasses: [],
  kinds: undefined,
  scopeConstraints: { projectId: "project-001" },
  subjectHints: ["deployment"],
  contentHints: ["region"],
  desiredResultCount: 10,
  requestConfidence: "strong",
};

describe("memory retrieval runtime", () => {
  it("selects active candidates and excludes superseded, deleted, and conflicted records by lane", () => {
    const recalled = recallCanonicalCandidates({
      request,
      memoryObjects: [
        memory({ id: "memory-active" }),
        memory({
          id: "memory-superseded",
          lifecycleState: "superseded",
          supersededAt: new Date(1),
        }),
        memory({ id: "memory-deleted", lifecycleState: "expired", expiredAt: new Date(1) }),
        memory({ id: "memory-conflicted", lifecycleState: "conflict_hold" }),
      ],
    });

    expect(recalled.selectedMemoryCandidates.map((candidate) => candidate.memoryId)).toEqual([
      "memory-active",
    ]);
    expect(recalled.exclusions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "memory-superseded", reason: "superseded" }),
        expect.objectContaining({ id: "memory-deleted", reason: "deleted" }),
        expect.objectContaining({ id: "memory-conflicted", reason: "conflicted" }),
      ]),
    );
    expect(recalled.conflictCandidates.map((candidate) => candidate.memoryId)).toEqual([
      "memory-conflicted",
    ]);
  });

  it("prioritizes scoped memories ahead of broader active memories", () => {
    const recalled = recallCanonicalCandidates({
      request,
      memoryObjects: [
        memory({
          id: "memory-global",
          canonicalClass: "user",
          kind: "preference",
          payload: { subject: "validation reports", instruction: "include evidence" },
          normalizedSubject: "validation reports",
          normalizedSearchText: "validation reports include evidence",
          scope: {},
        }),
        memory({
          id: "memory-project",
          canonicalClass: "user",
          kind: "preference",
          payload: { subject: "validation reports", instruction: "include exact artifact paths" },
          normalizedSubject: "validation reports",
          normalizedSearchText: "validation reports include exact artifact paths region",
          scope: { projectId: "project-001" },
        }),
      ],
    });

    expect(recalled.selectedMemoryCandidates[0]?.memoryId).toBe("memory-project");
    expect(recalled.selectedMemoryCandidates[0]?.scopeMatch).toBe("exact");
    expect(recalled.selectedMemoryCandidates[1]?.scopeMatch).toBe("broad");
  });

  it("selects projection digests only when backed by active source memory ids", () => {
    const projectionVersions: WorkspaceProjectionVersionRecord[] = [
      {
        id: "projection-active",
        targetId: "memory-md",
        projectionType: "projection_digest",
        contentHash: "hash-active",
        canonicalArtifactPath: ".openclaw/model-memory/projections/memory.md",
        sourceObjectIds: ["memory-active"],
        sourceEventIds: ["event-active"],
        sourceEdgeIds: ["edge-active"],
        sourceSlotKeys: [],
        sourceSetKeys: [],
        tokenEstimate: 10,
        builtAt: new Date(0),
        freshness: { status: "fresh" },
        staleMarkers: [],
        conflictMarkers: [],
        retrievalDigest: {
          title: "memory-md",
          summary: "active projection digest",
          sourceMemoryIds: ["memory-active"],
          sourceEventIds: ["event-active"],
          contentHash: "hash-active",
        },
      },
      {
        id: "projection-stale",
        targetId: "user-md",
        contentHash: "hash-stale",
        canonicalArtifactPath: ".openclaw/model-memory/projections/user.md",
        sourceObjectIds: ["missing-memory"],
        sourceSlotKeys: [],
        sourceSetKeys: [],
        tokenEstimate: 10,
        builtAt: new Date(0),
      },
    ];

    const digests = buildProjectionDigests({
      projectionVersions,
      activeMemoryIds: new Set(["memory-active"]),
    });

    expect(digests.map((digest) => digest.projectionId)).toEqual(["projection-active"]);
    expect(digests[0]?.sourceMemoryIds).toEqual(["memory-active"]);
    expect(digests[0]?.sourceEventIds).toEqual(["event-active"]);
    expect(digests[0]?.freshness?.status).toBe("fresh");
  });

  it("emits projection exclusion telemetry and fresh digest reason codes", () => {
    const projectionVersions: WorkspaceProjectionVersionRecord[] = [
      {
        id: "projection-fresh",
        targetId: "memory-md",
        projectionType: "projection_digest",
        contentHash: "hash-fresh",
        canonicalArtifactPath: ".openclaw/model-memory/projections/memory-md-hash.md",
        sourceObjectIds: ["memory-active"],
        sourceEventIds: ["event-active"],
        sourceEdgeIds: [],
        sourceSlotKeys: [],
        sourceSetKeys: [],
        tokenEstimate: 10,
        builtAt: new Date(0),
        freshness: { status: "fresh" },
        staleMarkers: [],
        conflictMarkers: [],
        retrievalDigest: {
          title: "memory-md",
          summary: "deployment region projection digest",
          sourceMemoryIds: ["memory-active"],
          sourceEventIds: ["event-active"],
          contentHash: "hash-fresh",
        },
      },
      {
        id: "projection-inactive-source",
        targetId: "user-md",
        contentHash: "hash-inactive",
        canonicalArtifactPath: ".openclaw/model-memory/projections/user-md-hash.md",
        sourceObjectIds: ["memory-superseded"],
        sourceSlotKeys: [],
        sourceSetKeys: [],
        tokenEstimate: 10,
        builtAt: new Date(0),
      },
      {
        id: "projection-stale",
        targetId: "agents-md",
        contentHash: "hash-stale",
        canonicalArtifactPath: ".openclaw/model-memory/projections/agents-md-hash.md",
        sourceObjectIds: ["memory-active"],
        sourceSlotKeys: [],
        sourceSetKeys: [],
        tokenEstimate: 10,
        builtAt: new Date(0),
        freshness: { status: "stale", reason: "source_hash_changed" },
        staleMarkers: ["source_hash_changed"],
      },
    ];

    const recalled = recallCanonicalCandidates({
      request,
      memoryObjects: [
        memory({ id: "memory-active" }),
        memory({ id: "memory-superseded", lifecycleState: "superseded" }),
      ],
      projectionVersions,
    });

    expect(recalled.selectedProjectionDigests.map((digest) => digest.projectionId)).toEqual([
      "projection-fresh",
    ]);
    expect(
      recalled.retrievalCandidates.find(
        (candidate) => candidate.projectionId === "projection-fresh",
      )?.reasonCodes,
    ).toEqual(expect.arrayContaining(["fresh_projection_digest", "projection_lexical_match"]));
    expect(recalled.exclusions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "memory-superseded",
          idType: "memory",
          reason: "superseded",
        }),
        expect.objectContaining({
          id: "projection-inactive-source",
          idType: "projection",
          reason: "inactive",
        }),
        expect.objectContaining({
          id: "projection-stale",
          idType: "projection",
          reason: "stale",
        }),
      ]),
    );
  });

  it("prioritizes bounded tool-result proof memories for explicit tool-result recall", () => {
    const toolResultRequest: InterpretedRetrievalRequest = {
      goal: "what bounded tool-result evidence was captured",
      canonicalClasses: ["project"],
      kinds: ["fact"],
      scopeConstraints: {},
      subjectHints: ["bounded", "tool-result", "evidence"],
      contentHints: ["captured", "tool", "evidence"],
      desiredResultCount: 5,
      requestConfidence: "strong",
    };
    const recalled = recallCanonicalCandidates({
      request: toolResultRequest,
      memoryObjects: [
        memory({
          id: "memory-runtime-fact",
          canonicalClass: "project",
          kind: "fact",
          normalizedSearchText: "model memory runtime hardening projection retrieval",
          sourceEvidenceSearchText: "runtime hardening evidence",
          createdAt: new Date(),
        }),
        memory({
          id: "memory-tool-proof",
          canonicalClass: "reference",
          kind: "reference",
          payload: {
            task: "Tool result artifact from exec",
            primaryResource: "/home/node/.openclaw/workspace/.openclaw/model-memory/projections",
          },
          normalizedSubject: "tool result artifact from exec",
          normalizedSearchText:
            "tool result artifact from exec /home/node/.openclaw/workspace/.openclaw/model-memory/projections",
          sourceEvidenceSearchText:
            "Tool result proof: exec completed with status success. Artifact paths: /home/node/.openclaw/workspace/.openclaw/model-memory/projections.",
          createdAt: new Date(),
        }),
      ],
    });

    expect(recalled.selectedMemoryCandidates[0]?.memoryId).toBe("memory-tool-proof");
    expect(recalled.selectedMemoryCandidates[0]?.reasonCodes).toEqual(
      expect.arrayContaining(["tool_result_proof_match", "source_lineage_match"]),
    );
  });

  it("assembles typed packs with selected ids, conflict pack entries, and exclusion reasons", () => {
    const recalled = recallCanonicalCandidates({
      request,
      memoryObjects: [
        memory({
          id: "memory-rule",
          kind: "rule",
          payload: { subject: "deploy", recommendedAction: "ask first" },
        }),
        memory({
          id: "memory-pref",
          canonicalClass: "user",
          kind: "preference",
          payload: { subject: "validation reports", instruction: "concise outcome first" },
          normalizedSearchText: "validation reports concise outcome first region",
        }),
        memory({ id: "memory-conflict", lifecycleState: "conflict_hold" }),
      ],
    });
    const plan = buildRetrievalPlan({
      request,
      queryTextHash: "hash-001",
      requestPurpose: "context_injection",
      sessionId: "session-001",
    });
    const resultItems: RetrievalResultItemRecord[] = recalled.selectedMemoryCandidates.map(
      (candidate, index) => ({
        id: `item-${index}`,
        retrievalResultSetId: "result-set-001",
        memoryObjectId: candidate.memoryId!,
        rankIndex: index,
        rankBand: index === 0 ? "primary" : "secondary",
        retrievalReasonCodes: candidate.reasonCodes,
        selectedForContext: true,
        createdAt: new Date(0),
      }),
    );

    const packs = buildMemoryPacks({
      retrievalRequest: {
        id: "request-001",
        sessionId: "session-001",
        queryText: redactRetrievalQueryForStorage("raw prompt should not persist"),
        requestPurpose: "context_injection",
        scope: { projectId: "project-001", retrievalRuntimeQueryHash: "hash-001" },
        desiredResultCount: 10,
        contractName: "retrieval_request_interpretation",
        contractVersion: "v1",
        modelId: "model-001",
        createdAt: new Date(0),
      },
      retrievalResultItems: resultItems,
      memoryObjects: [
        memory({
          id: "memory-rule",
          kind: "rule",
          payload: { subject: "deploy", recommendedAction: "ask first" },
        }),
        memory({
          id: "memory-pref",
          canonicalClass: "user",
          kind: "preference",
          payload: { subject: "validation reports", instruction: "concise outcome first" },
          normalizedSearchText: "validation reports concise outcome first region",
        }),
        memory({ id: "memory-conflict", lifecycleState: "conflict_hold" }),
      ],
      retrievalPlan: plan,
      candidates: [...recalled.selectedMemoryCandidates, ...recalled.conflictCandidates],
      exclusions: recalled.exclusions,
    });

    expect(packs.map((pack) => pack.packType)).toEqual(
      expect.arrayContaining(["operating_pack", "user_profile_pack", "conflict_pack"]),
    );
    expect(packs.flatMap((pack) => pack.sources.map((source) => source.memoryId))).toEqual(
      expect.arrayContaining(["memory-rule", "memory-pref", "memory-conflict"]),
    );
    expect(packs.flatMap((pack) => pack.exclusions)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "memory-conflict", reason: "conflicted" }),
      ]),
    );
    expect(packs.every((pack) => pack.telemetry.metrics.exclusionReasons.conflicted === 1)).toBe(
      true,
    );
    expect(packs.every((pack) => pack.telemetry.metrics.selectedIds.includes("memory-rule"))).toBe(
      true,
    );
  });

  it("emits empty retrieval metrics when no candidate is selected", () => {
    const plan = buildRetrievalPlan({
      request,
      queryTextHash: "hash-empty",
      requestPurpose: "context_injection",
      sessionId: "session-empty",
    });
    const retrievalRequest = {
      id: "request-empty",
      sessionId: "session-empty",
      queryText: redactRetrievalQueryForStorage("query with no matching memory"),
      requestPurpose: "context_injection",
      scope: { projectId: "project-001", retrievalRuntimeQueryHash: "hash-empty" },
      desiredResultCount: 10,
      contractName: "retrieval_request_interpretation",
      contractVersion: "v1",
      modelId: "model-001",
      createdAt: new Date(0),
    };
    const packs = buildMemoryPacks({
      retrievalRequest,
      retrievalResultItems: [],
      memoryObjects: [],
      retrievalPlan: plan,
      candidates: [],
      exclusions: [],
    });

    expect(packs).toEqual([]);
    const run = buildRetrievalRun({
      retrievalRequest,
      queryTextHash: "hash-empty",
      retrievalPlanId: plan.planId,
      corpora: plan.corpora,
      indexesUsed: plan.queries.flatMap((query) => query.indexes),
      candidateCount: 0,
      retrievalResultItems: [],
      selectedProjectionIds: [],
      exclusions: [],
      memoryPacks: packs,
    });

    expect(run.emptyRetrieval).toBe(true);
    expect(run.metrics).toEqual(
      expect.objectContaining({
        candidateCount: 0,
        selectedCount: 0,
        injectedCount: 0,
        emptyRetrieval: true,
      }),
    );
  });
});
