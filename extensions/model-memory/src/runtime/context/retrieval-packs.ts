import { summarizeModelMemoryPayload } from "../../payload-summary.ts";
import type {
  RuntimeCompatibleMemoryRecord,
  RetrievalRequestRecord,
  RetrievalResultItemRecord,
  RetrievalResultSetRecord,
  RuntimeMemoryRecord,
  WorkspaceProjectionVersionRecord,
} from "../../runtime-read-models.ts";
import {
  hashRuntimeValue,
  projectLegacyRecordToRuntimeMemoryRecord,
} from "../../runtime-read-models.ts";
import { readMemoryTraceIdFromScope } from "../../trace-id.ts";
import { buildContextArtifact } from "../context-artifacts.ts";
import type {
  ProjectStateCapsuleRetrievalShadowResult,
  ProjectionDigest,
  RetrievalCandidate,
  RetrievalExclusion,
  RetrievalPlan,
} from "../retrieval/index.ts";
import {
  buildMemoryPacks,
  buildProjectionDigests,
  buildRetrievalPlan,
  buildRetrievalRun,
  deriveRuntimeMemoryStatus,
  renderMemoryPacks,
} from "../retrieval/index.ts";
import {
  buildProjectStateCapsuleContext,
  type ProjectStateCapsuleContextMode,
} from "./project-state-capsule-context.ts";

function summarizeProvenance(object: RuntimeMemoryRecord): string {
  const firstSpan = object.provenance?.[0];
  if (!firstSpan || typeof firstSpan !== "object" || !("sourceId" in firstSpan)) {
    return "source unavailable";
  }
  return String(firstSpan.sourceId);
}

function boundSummary(value: string, maxLength = 320): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function getQueryHash(request: RetrievalRequestRecord): string {
  const scopedHash = request.scope.retrievalRuntimeQueryHash;
  if (typeof scopedHash === "string" && scopedHash.length > 0) {
    return scopedHash;
  }
  if (request.queryText.startsWith("sha256:")) {
    return request.queryText.slice("sha256:".length);
  }
  return hashRuntimeValue(request.queryText);
}

function defaultRetrievalPlan(input: {
  retrievalRequest: RetrievalRequestRecord;
  queryTextHash: string;
}): RetrievalPlan {
  return buildRetrievalPlan({
    request: {
      goal: input.retrievalRequest.requestPurpose,
      canonicalClasses: [],
      kinds: undefined,
      scopeConstraints: Object.fromEntries(
        Object.entries(input.retrievalRequest.scope).flatMap(([key, value]) =>
          typeof value === "string" && !key.startsWith("retrievalRuntime")
            ? [[key, value] as const]
            : [],
        ),
      ),
      subjectHints: undefined,
      contentHints: undefined,
      desiredResultCount: input.retrievalRequest.desiredResultCount,
      requestConfidence: "weak",
    },
    queryTextHash: input.queryTextHash,
    requestPurpose: input.retrievalRequest.requestPurpose,
    sessionId: input.retrievalRequest.sessionId,
  });
}

export function buildRetrievalPackArtifact(input: {
  retrievalRequest: RetrievalRequestRecord;
  retrievalResultSet: RetrievalResultSetRecord;
  retrievalResultItems: RetrievalResultItemRecord[];
  memoryObjects: RuntimeCompatibleMemoryRecord[];
  buildPolicyVersion: string;
  retrievalPlan?: RetrievalPlan;
  retrievalCandidates?: RetrievalCandidate[];
  retrievalExclusions?: RetrievalExclusion[];
  selectedProjectionDigests?: ProjectionDigest[];
  projectionVersions?: WorkspaceProjectionVersionRecord[];
  capsuleRetrievalShadow?: ProjectStateCapsuleRetrievalShadowResult;
  capsuleContextMode?: ProjectStateCapsuleContextMode;
  includeConflictAwareCapsuleContext?: boolean;
  includeInspectionCapsuleContext?: boolean;
  projectPageProjectionAvailable?: boolean;
}) {
  const objectById = new Map(
    input.memoryObjects
      .map(projectLegacyRecordToRuntimeMemoryRecord)
      .map((object) => [object.id, object] as const),
  );
  const selectedItems = input.retrievalResultItems
    .filter((item) => item.selectedForContext)
    .toSorted((left, right) => left.rankIndex - right.rankIndex);
  const results = selectedItems
    .map((item) => {
      const object = objectById.get(item.memoryObjectId);
      if (!object) {
        return undefined;
      }
      return {
        objectId: object.id,
        canonicalClass: object.canonicalClass,
        kind: object.kind,
        payloadSummary: boundSummary(
          summarizeModelMemoryPayload({
            kind: object.kind,
            payload: object.payload,
          }),
        ),
        scope: object.scope,
        provenanceSummary: summarizeProvenance(object),
        retrievalReasonCodes: item.retrievalReasonCodes,
        rankBand: item.rankBand,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => !!entry);

  const queryTextHash = getQueryHash(input.retrievalRequest);
  const retrievalPlan =
    input.retrievalPlan ??
    defaultRetrievalPlan({
      retrievalRequest: input.retrievalRequest,
      queryTextHash,
    });
  const memoryObjects = [...objectById.values()];
  const activeMemoryIds = new Set(
    memoryObjects
      .filter((object) => deriveRuntimeMemoryStatus(object) === "active")
      .map((object) => object.id),
  );
  const projectionDigests =
    input.selectedProjectionDigests ??
    buildProjectionDigests({
      projectionVersions: input.projectionVersions,
      activeMemoryIds,
    });
  const memoryPacks = buildMemoryPacks({
    retrievalRequest: input.retrievalRequest,
    retrievalResultItems: input.retrievalResultItems,
    memoryObjects,
    retrievalPlan,
    candidates: input.retrievalCandidates,
    exclusions: input.retrievalExclusions,
    projectionDigests,
  });
  const retrievalRun = buildRetrievalRun({
    retrievalRequest: input.retrievalRequest,
    queryTextHash,
    retrievalPlanId: retrievalPlan.planId,
    corpora: retrievalPlan.corpora,
    indexesUsed: retrievalPlan.queries.flatMap((query) => query.indexes),
    candidateCount: input.retrievalCandidates?.length ?? results.length,
    retrievalResultItems: input.retrievalResultItems,
    selectedProjectionIds: projectionDigests.map((digest) => digest.projectionId),
    selectedProjectionDigests: projectionDigests,
    exclusions: input.retrievalExclusions ?? [],
    memoryPacks,
  });

  const baseRenderedText = renderMemoryPacks({
    request: input.retrievalRequest,
    queryTextHash,
    memoryPacks,
  });
  const projectStateCapsuleContext =
    input.capsuleRetrievalShadow || input.capsuleContextMode
      ? buildProjectStateCapsuleContext({
          capsuleRetrievalShadow: input.capsuleRetrievalShadow,
          mode: input.capsuleContextMode ?? "disabled",
          includeConflictAware: input.includeConflictAwareCapsuleContext,
          includeInspection: input.includeInspectionCapsuleContext,
          projectPageProjectionAvailable: input.projectPageProjectionAvailable,
        })
      : undefined;
  const renderedText = projectStateCapsuleContext?.renderedText
    ? `${baseRenderedText}\n${projectStateCapsuleContext.renderedText}`
    : baseRenderedText;
  const memoryTraceId = readMemoryTraceIdFromScope(input.retrievalRequest.scope);

  return buildContextArtifact({
    artifactType: "retrieval_pack",
    scopeKey: input.retrievalRequest.sessionId ?? input.retrievalRequest.agentId,
    sourceObjectIds: results.map((result) => result.objectId),
    renderedText,
    structuredPayload: {
      schemaVersion: "memory_retrieval_runtime.v1",
      ...(memoryTraceId ? { memoryTraceId } : {}),
      retrievalRequestId: input.retrievalRequest.id,
      retrievalResultSetId: input.retrievalResultSet.id,
      retrievalPlan,
      retrievalRun,
      memoryPacks,
      ...(input.capsuleRetrievalShadow
        ? { capsuleRetrievalShadow: input.capsuleRetrievalShadow }
        : {}),
      ...(projectStateCapsuleContext ? { projectStateCapsuleContext } : {}),
      recallProof: {
        eligible: results.length > 0 || projectionDigests.length > 0,
        acceptedSources: ["mmv2_runtime_memory", "mmv2_projection_digest"],
        rejectedSources: ["root_USER_md", "root_MEMORY_md", "daily_note_only"],
      },
      results,
    },
    buildPolicyVersion: input.buildPolicyVersion,
  });
}
