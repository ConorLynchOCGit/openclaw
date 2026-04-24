import { describe, expect, it } from "vitest";
import type { InterpretedRetrievalRequest } from "../../retrieval-request-interpreter.ts";
import type {
  RetrievalRequestRecord,
  RetrievalResultItemRecord,
  RuntimeMemoryRecord,
  WorkspaceProjectionVersionRecord,
} from "../../runtime-read-models.ts";
import {
  buildMemoryPacks,
  buildRetrievalPlan,
  buildRetrievalRun,
  recallCanonicalCandidates,
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

function buildRequest(
  overrides: Partial<InterpretedRetrievalRequest> = {},
): InterpretedRetrievalRequest {
  return {
    goal: overrides.goal ?? "deployment memory",
    canonicalClasses: overrides.canonicalClasses ?? [],
    kinds: overrides.kinds,
    scopeConstraints: overrides.scopeConstraints ?? { projectId: "project-001" },
    subjectHints: overrides.subjectHints ?? ["deployment"],
    contentHints: overrides.contentHints ?? ["region"],
    desiredResultCount: overrides.desiredResultCount ?? 5,
    requestConfidence: overrides.requestConfidence ?? "strong",
  };
}

function buildRequestRecord(request: InterpretedRetrievalRequest): RetrievalRequestRecord {
  return {
    id: "retrieval-request-001",
    sessionId: "session-001",
    agentId: "main",
    queryText: "sha256:query",
    requestPurpose: "context_injection",
    scope: {
      ...request.scopeConstraints,
      retrievalRuntimeQueryHash: "query-hash-001",
      rawQueryPersisted: false,
    },
    desiredResultCount: request.desiredResultCount,
    contractName: "retrieval_request_interpretation",
    contractVersion: "v1",
    modelId: "openai-codex/gpt-5.4-mini",
    createdAt: new Date(0),
  };
}

function evaluateCase(input: {
  request?: InterpretedRetrievalRequest;
  memoryObjects?: RuntimeMemoryRecord[];
  projectionVersions?: WorkspaceProjectionVersionRecord[];
}) {
  const request = input.request ?? buildRequest();
  const recalled = recallCanonicalCandidates({
    request,
    memoryObjects: input.memoryObjects ?? [],
    projectionVersions: input.projectionVersions,
  });
  const retrievalRequest = buildRequestRecord(request);
  const retrievalPlan = buildRetrievalPlan({
    request,
    queryTextHash: "query-hash-001",
    requestPurpose: retrievalRequest.requestPurpose,
    sessionId: retrievalRequest.sessionId ?? undefined,
  });
  const retrievalResultItems: RetrievalResultItemRecord[] = recalled.selectedMemoryCandidates.map(
    (candidate, index) => ({
      id: `retrieval-item-${index}`,
      retrievalResultSetId: "retrieval-result-set-001",
      memoryObjectId: candidate.memoryId!,
      rankIndex: index,
      rankBand: index === 0 ? "primary" : "secondary",
      retrievalReasonCodes: candidate.reasonCodes,
      selectedForContext: true,
      createdAt: new Date(0),
    }),
  );
  const memoryPacks = buildMemoryPacks({
    retrievalRequest,
    retrievalResultItems,
    memoryObjects: input.memoryObjects ?? [],
    retrievalPlan,
    candidates: [...recalled.selectedMemoryCandidates, ...recalled.conflictCandidates],
    exclusions: recalled.exclusions,
    projectionDigests: recalled.selectedProjectionDigests,
  });
  const retrievalRun = buildRetrievalRun({
    retrievalRequest,
    retrievalPlanId: retrievalPlan.planId,
    corpora: retrievalPlan.corpora,
    indexesUsed: retrievalPlan.queries[0]?.indexes ?? [],
    candidateCount: recalled.retrievalCandidates.length,
    retrievalResultItems,
    selectedProjectionIds: recalled.selectedProjectionDigests.map((digest) => digest.projectionId),
    selectedProjectionDigests: recalled.selectedProjectionDigests,
    exclusions: recalled.exclusions,
    memoryPacks,
  });
  return { recalled, memoryPacks, retrievalRun };
}

describe("retrieval eval corpus", () => {
  it("distinguishes no candidates, excluded candidates, and suppression-only empty retrievals", () => {
    const noCandidates = evaluateCase({
      request: buildRequest({
        goal: "calendar memory",
        subjectHints: ["calendar"],
        contentHints: ["timezone"],
      }),
      memoryObjects: [],
    });
    const excludedCandidates = evaluateCase({
      memoryObjects: [
        memory({
          id: "memory-scope-mismatch",
          scope: { projectId: "project-999" },
        }),
      ],
    });
    const suppressionOnly = evaluateCase({
      memoryObjects: [memory({ id: "memory-conflicted", lifecycleState: "conflict_hold" })],
      projectionVersions: [
        {
          id: "projection-hash-invalid",
          targetId: "memory-md",
          projectionType: "projection_digest",
          contentHash: "hash-invalid",
          canonicalArtifactPath: ".openclaw/model-memory/projections/memory.md",
          sourceObjectIds: ["memory-conflicted"],
          sourceSlotKeys: [],
          sourceSetKeys: [],
          tokenEstimate: 12,
          builtAt: new Date(0),
          freshness: { status: "stale", reason: "hash_validation_failed" },
          staleMarkers: ["content_hash_invalid"],
          conflictMarkers: [],
        },
      ],
    });

    expect(noCandidates.retrievalRun.metrics.emptyRetrievalReason).toBe("no_candidates_found");
    expect(excludedCandidates.retrievalRun.metrics.emptyRetrievalReason).toBe(
      "candidates_found_but_excluded",
    );
    expect(suppressionOnly.retrievalRun.metrics.emptyRetrievalReason).toBe(
      "stale_conflict_suppression",
    );
  });

  it("emits memory_existed_but_excluded diagnostics for superseded, inactive, conflicted, and projection exclusion paths", () => {
    const evaluated = evaluateCase({
      memoryObjects: [
        memory({
          id: "memory-superseded",
          lifecycleState: "superseded",
          supersededAt: new Date(1),
        }),
        memory({ id: "memory-inactive", lifecycleState: "provisional" }),
        memory({ id: "memory-conflicted", lifecycleState: "conflict_hold" }),
      ],
      projectionVersions: [
        {
          id: "projection-hash-invalid",
          targetId: "project-page",
          projectionType: "project_page",
          contentHash: "hash-invalid",
          canonicalArtifactPath: ".openclaw/model-memory/projections/project/page.md",
          sourceObjectIds: ["memory-superseded"],
          sourceSlotKeys: [],
          sourceSetKeys: [],
          tokenEstimate: 8,
          builtAt: new Date(0),
          freshness: { status: "stale", reason: "hash_validation_failed" },
          staleMarkers: ["content_hash_invalid"],
          conflictMarkers: [],
        },
      ],
    });

    expect(evaluated.retrievalRun.metrics.missDiagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          diagnosticType: "memory_existed_but_excluded",
          id: "memory-superseded",
          reason: "superseded",
        }),
        expect.objectContaining({
          diagnosticType: "memory_existed_but_excluded",
          id: "memory-inactive",
          reason: "inactive",
        }),
        expect.objectContaining({
          diagnosticType: "memory_existed_but_excluded",
          id: "memory-conflicted",
          reason: "conflicted",
        }),
        expect.objectContaining({
          diagnosticType: "memory_existed_but_excluded",
          id: "projection-hash-invalid",
          reason: "inactive",
          detail: "projection_digest_has_no_active_source_memory_ids",
        }),
      ]),
    );
  });

  it("prefers fresh projection digests backed by active MMV2 ids and records selected backing ids", () => {
    const evaluated = evaluateCase({
      memoryObjects: [memory({ id: "memory-active" })],
      projectionVersions: [
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
            summary: "fresh projection digest for deployment region",
            sourceMemoryIds: ["memory-active"],
            sourceEventIds: ["event-active"],
            contentHash: "hash-active",
          },
        },
      ],
    });

    expect(
      evaluated.recalled.selectedProjectionDigests.map((digest) => digest.projectionId),
    ).toEqual(["projection-active"]);
    expect(evaluated.retrievalRun.metrics.selectedProjectionIds).toEqual(["projection-active"]);
    expect(evaluated.retrievalRun.metrics.selectedSourceMemoryIds).toEqual(["memory-active"]);
    expect(evaluated.retrievalRun.metrics.emptyRetrievalReason).toBe("none");
  });
});
