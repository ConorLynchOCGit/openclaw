import { createHash } from "node:crypto";
import { buildDeterministicUuid } from "./deterministic-uuid.ts";
import type { DurableMemoryRecord, MemoryEdge, MemoryEvent } from "./mmv2/contracts.ts";
import type { ModelMemoryObject, MemoryScope, Provenance } from "./semantic-schema.ts";
import {
  SourceAuthorityMetadataSchema,
  type SourceAuthorityTier,
  type SourceProfileId,
} from "./source-authority.ts";
import type {
  ModelMemoryActivationBasis,
  ModelMemoryLifecycleState,
  ModelMemoryObjectRecord,
  TableContract,
} from "./storage-database-contract.ts";

export type ActiveMemorySlotRecord = {
  slotKey: string;
  canonicalClass: string;
  kind: string;
  scopeKey?: string;
  subjectKey?: string;
  currentObjectId: string;
  currentIdentityKey: string;
  updatedAt: Date;
};

export type ActiveMemorySetRecord = {
  id: string;
  setKey: string;
  canonicalClass: string;
  kind: string;
  scopeKey?: string;
  memoryObjectId: string;
  sortKey: string;
  updatedAt: Date;
};

export type CompactionStatus = "delegated" | "dirty" | "current";

export type SessionContextStateRecord = {
  sessionId: string;
  agentId: string;
  activeProjectIds: string[];
  openLoops: string[];
  unresolvedQuestions: string[];
  activePlanState: Record<string, unknown>;
  sessionSummaryArtifactId?: string;
  projectionVersions: Record<string, string>;
  compactionStatus: CompactionStatus;
  updatedAt: Date;
};

export type ContextArtifactType =
  | "user_memory_pack"
  | "project_memory_pack"
  | "procedure_memory_pack"
  | "session_summary_pack"
  | "bootstrap_section"
  | "retrieval_pack";

export type WorkspaceProjectionTargetKind = "memory_md" | "user_md" | "agents_md";

export type MemoryProjectionType =
  | "user_profile_page"
  | "project_page"
  | "procedure_page"
  | "source_page"
  | "decision_log"
  | "timeline_page"
  | "entity_page"
  | "dashboard"
  | "agent_digest"
  | "projection_digest"
  | "workspace_projection";

export type WorkspaceProjectionTargetRecord = {
  targetId: string;
  targetKind: WorkspaceProjectionTargetKind;
  relativePath: string;
  generatedBlockId?: string;
  allowedCanonicalClasses: string[];
  allowedKinds: string[];
  tokenBudget: number;
  rankingPolicyId: string;
  enabled: boolean;
};

export type WorkspaceProjectionVersionRecord = {
  id: string;
  targetId: string;
  projectionType?: MemoryProjectionType;
  contentHash: string;
  canonicalArtifactPath: string;
  sourceObjectIds: string[];
  sourceEventIds?: string[];
  sourceEdgeIds?: string[];
  sourceSlotKeys: string[];
  sourceSetKeys: string[];
  tokenEstimate: number;
  builtAt: Date;
  freshness?: {
    status: "fresh" | "stale";
    reason?: string | null;
  };
  staleMarkers?: string[];
  conflictMarkers?: string[];
  retrievalDigest?: {
    title: string;
    summary: string;
    sourceMemoryIds: string[];
    sourceEventIds: string[];
    contentHash: string;
  };
};

export type ContextRunRecord = {
  id: string;
  sessionId: string;
  agentId: string;
  provider: string;
  model: string;
  stableLayerHash: string;
  semiStableLayerHash: string;
  volatileLayerHash: string;
  estimatedInputTokens: number;
  actualInputTokens?: number;
  actualOutputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  estimatedCost?: number;
  cacheRetentionMode?: string;
  promptCacheKey?: string;
  compactionUsed: boolean;
  pruningUsed: boolean;
  assembledAt: Date;
};

export type ContextRunSegmentRecord = {
  id: string;
  runId: string;
  segmentOrder: number;
  segmentType:
    | "bootstrap"
    | "user_pack"
    | "project_pack"
    | "procedure_pack"
    | "session_summary"
    | "retrieval_pack"
    | "recent_turns"
    | "tool_results"
    | "system_addition";
  sourceArtifactId?: string;
  projectionVersionId?: string;
  sourceKind: string;
  segmentHash: string;
  estimatedTokens: number;
  dropped: boolean;
  trimmed: boolean;
  trimReason?: string;
};

export type RetrievalRequestRecord = {
  id: string;
  sessionId?: string;
  agentId?: string;
  queryText: string;
  requestPurpose: string;
  scope: Record<string, unknown>;
  desiredResultCount: number;
  contractName: string;
  contractVersion: string;
  modelId: string;
  createdAt: Date;
};

export type RetrievalResultSetRecord = {
  id: string;
  retrievalRequestId: string;
  contentHash: string;
  resultCount: number;
  createdAt: Date;
};

export type RetrievalResultItemRecord = {
  id: string;
  retrievalResultSetId: string;
  memoryObjectId: string;
  rankIndex: number;
  rankBand: "primary" | "secondary" | "overflow";
  retrievalReasonCodes: string[];
  selectedForContext: boolean;
  packedArtifactId?: string;
  createdAt: Date;
};

export type ContextArtifactRecord = {
  id: string;
  artifactType: ContextArtifactType;
  scopeKey?: string;
  sourceObjectIds: string[];
  sourceSlotKeys: string[];
  structuredPayload?: Record<string, unknown>;
  renderedText?: string;
  contentHash: string;
  tokenEstimate: number;
  buildPolicyVersion: string;
  contractName?: string;
  contractVersion?: string;
  modelId?: string;
  builtAt: Date;
};

type RuntimeProjectedMemoryObject = {
  canonicalClass: string;
  kind: string;
  payload: Record<string, unknown>;
  scope?: MemoryScope;
  provenance: Provenance;
  confidence: ModelMemoryObject["confidence"];
  durability: ModelMemoryObject["durability"];
  reviewMode: ModelMemoryObject["reviewMode"];
  rationaleCodes?: string[];
};

export type RuntimeMemoryRecord = {
  id: string;
  sourceWindowId?: string;
  canonicalClass: string;
  kind: string;
  payload: Record<string, unknown>;
  normalizedSubject?: string;
  normalizedTitle?: string;
  normalizedSearchText: string;
  sourceEvidenceSearchText?: string;
  scope: Record<string, unknown>;
  scopeKey?: string;
  provenance?: Array<Record<string, unknown>>;
  lifecycleState?: ModelMemoryLifecycleState;
  activationBasis?: ModelMemoryActivationBasis;
  confidence: string;
  durability: string;
  suggestedReviewMode: string;
  executedReviewMode: string;
  rationaleCodes: string[];
  identityKey: string;
  slotKey?: string;
  contractName: string;
  contractVersion: string;
  modelId: string;
  createdAt: Date;
  activatedAt?: Date;
  expiredAt?: Date;
  supersededAt?: Date;
  sourceAuthorityTier?: SourceAuthorityTier;
  sourceProfileId?: SourceProfileId;
};

export type RuntimeCompatibleMemoryRecord = RuntimeMemoryRecord | ModelMemoryObjectRecord;

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function pickFirstNonEmpty(...values: Array<unknown>): string | undefined {
  for (const value of values) {
    const cleaned = cleanText(value);
    if (cleaned.length > 0) {
      return cleaned;
    }
  }
  return undefined;
}

function confidenceToLegacy(value: number): ModelMemoryObject["confidence"] {
  if (value >= 0.85) {
    return "strong";
  }
  if (value >= 0.65) {
    return "medium";
  }
  return "weak";
}

function normalizeRuntimeIdentityText(value: unknown): string {
  return typeof value === "string"
    ? value
        .normalize("NFKC")
        .replace(/[^a-z0-9_./:#-]+/gi, " ")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase()
    : "";
}

function collectPayloadStrings(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap(collectPayloadStrings);
  }
  if (!value || typeof value !== "object") {
    return [];
  }
  return Object.values(value as Record<string, unknown>).flatMap(collectPayloadStrings);
}

function stableScopeKey(scope: MemoryScope | undefined): string {
  const entries = Object.entries(scope ?? {})
    .filter(([, value]) => typeof value === "string" && value.trim().length > 0)
    .map(([key, value]) => [key, normalizeRuntimeIdentityText(value)] as const)
    .toSorted(([left], [right]) => left.localeCompare(right));
  return entries.length > 0 ? entries.map(([key, value]) => `${key}:${value}`).join("|") : "global";
}

function deriveRuntimeMemoryIdentity(object: RuntimeProjectedMemoryObject): {
  identityKey: string;
  slotKey?: string;
  scopeKey: string;
  normalizedSubject?: string;
  normalizedTitle?: string;
  normalizedSearchText: string;
} {
  const payload = object.payload;
  const normalizedSubject = pickFirstNonEmpty(
    payload.subject,
    payload.target,
    payload.task,
    payload.title,
    payload.primaryResource,
  );
  const normalizedTitle = pickFirstNonEmpty(payload.title, payload.task, payload.subject);
  const scopeKey = stableScopeKey(object.scope);
  const normalizedPayloadText = collectPayloadStrings(payload)
    .map(normalizeRuntimeIdentityText)
    .filter(Boolean)
    .join(" ");
  const normalizedSearchText = [
    object.canonicalClass,
    object.kind,
    normalizeRuntimeIdentityText(normalizedSubject),
    normalizeRuntimeIdentityText(normalizedTitle),
    normalizedPayloadText,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  const subjectKey = normalizeRuntimeIdentityText(normalizedSubject) || "none";
  const identityInput = [
    object.canonicalClass,
    object.kind,
    scopeKey,
    subjectKey,
    normalizedSearchText,
  ].join("|");
  return {
    identityKey: hashRuntimeValue(identityInput),
    slotKey: `${object.canonicalClass}:${object.kind}:${scopeKey}:${subjectKey}`,
    scopeKey,
    normalizedSubject: normalizeRuntimeIdentityText(normalizedSubject) || undefined,
    normalizedTitle: normalizeRuntimeIdentityText(normalizedTitle) || undefined,
    normalizedSearchText,
  };
}

function buildRuntimeSearchText(input: {
  identitySearchText: string;
  canonicalText?: string;
  durableSearchText?: string;
}): string {
  const seen = new Set<string>();
  return [input.identitySearchText, input.canonicalText, input.durableSearchText]
    .map((value) => normalizeRuntimeIdentityText(value))
    .filter((value) => {
      if (!value || seen.has(value)) {
        return false;
      }
      seen.add(value);
      return true;
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function mapLifecycleStatus(status: DurableMemoryRecord["status"]): ModelMemoryLifecycleState {
  switch (status) {
    case "active":
      return "active";
    case "superseded":
      return "superseded";
    case "conflicted":
      return "conflict_hold";
    case "deleted":
      return "expired";
    case "inactive":
    case "quarantined":
    default:
      return "provisional";
  }
}

function canonicalScopeToRuntimeScope(
  scope: DurableMemoryRecord["scope"],
): MemoryScope | undefined {
  const projected: MemoryScope = {};
  if (scope.project_id) {
    projected.projectId = scope.project_id;
    projected.projectScope = scope.project_id;
  }
  if (scope.workspace_id) {
    projected.workflowScope = scope.workspace_id;
  }
  if (scope.subject_type === "user") {
    const userScope =
      scope.subject_id ?? (scope.user_id !== "unknown-user" ? scope.user_id : undefined);
    if (userScope) {
      projected.userScope = userScope;
    }
  }
  return Object.keys(projected).length > 0 ? projected : undefined;
}

function sourceRefsToRuntimeProvenance(sourceRefs: DurableMemoryRecord["source_refs"]): Provenance {
  return sourceRefs.map((ref) => ({
    sourceId: ref.source_id,
    blockId: ref.segment_id,
    lineStart: ref.start_char > 0 ? ref.start_char : undefined,
    lineEnd: ref.end_char > 0 ? ref.end_char : undefined,
    headingPath: [],
  }));
}

function deriveRuntimeCanonicalClass(
  record: DurableMemoryRecord,
): ModelMemoryObject["canonicalClass"] {
  if (record.unit_type === "composite") {
    if (record.artifact_type === "source_bundle" || record.artifact_type === "lesson_pack") {
      return "reference";
    }
    if (record.scope.project_id || record.scope.applies_to === "current_project") {
      return "project";
    }
    return "feedback";
  }

  if (record.kind === "source_ref") {
    return "reference";
  }

  if (record.kind === "directive") {
    if (record.scope.subject_type === "user") {
      return "user";
    }
    if (record.scope.project_id || record.scope.applies_to === "current_project") {
      return "project";
    }
    return "feedback";
  }

  const claimType = cleanText(
    (record.payload as { claim_type?: unknown }).claim_type,
  ).toLowerCase();
  if (claimType === "preference_state") {
    return "user";
  }
  return "project";
}

function buildRuntimeObject(record: DurableMemoryRecord): RuntimeProjectedMemoryObject {
  const runtimeScope = canonicalScopeToRuntimeScope(record.scope);
  const provenance = sourceRefsToRuntimeProvenance(record.source_refs);
  const confidence = confidenceToLegacy(record.confidence);
  const reviewMode =
    record.status === "conflicted" || record.status === "quarantined"
      ? "manual_review"
      : "auto_accept";

  if (record.unit_type === "composite") {
    const payload = record.payload as {
      title?: unknown;
      purpose?: unknown;
      summary?: unknown;
      components?: Array<{ content?: unknown }>;
    };
    const components = Array.isArray(payload.components)
      ? payload.components.map((component) => cleanText(component?.content)).filter(Boolean)
      : [];

    if (record.artifact_type === "source_bundle" || record.artifact_type === "lesson_pack") {
      return {
        canonicalClass: "reference",
        kind: "reference",
        payload: {
          task: pickFirstNonEmpty(payload.title, record.canonical_text, "reference bundle")!,
          primaryResource: pickFirstNonEmpty(
            components[0],
            payload.summary,
            record.canonical_text,
          )!,
          companionResources: components.length > 1 ? components.slice(1) : undefined,
        },
        scope: runtimeScope,
        provenance,
        confidence,
        durability: "durable",
        reviewMode,
      };
    }

    if (record.artifact_type === "procedure" || record.artifact_type === "checklist") {
      return {
        canonicalClass: record.scope.project_id ? "project" : "feedback",
        kind: "procedure",
        payload: {
          title: pickFirstNonEmpty(payload.title, record.canonical_text, "procedure")!,
          steps:
            components.length > 0
              ? components
              : [pickFirstNonEmpty(payload.summary, record.canonical_text)!],
          successShape: pickFirstNonEmpty(payload.summary),
        },
        scope: runtimeScope,
        provenance,
        confidence,
        durability: "durable",
        reviewMode,
      };
    }

    return {
      canonicalClass: record.scope.project_id ? "project" : "feedback",
      kind: "fact",
      payload: {
        subject: pickFirstNonEmpty(payload.title, record.artifact_type, "document artifact")!,
        value: pickFirstNonEmpty(payload.summary, payload.purpose, record.canonical_text)!,
      },
      scope: runtimeScope,
      provenance,
      confidence,
      durability: "durable",
      reviewMode,
    };
  }

  if (record.kind === "source_ref") {
    const payload = record.payload as { locator?: unknown; label?: unknown; access_hint?: unknown };
    return {
      canonicalClass: "reference",
      kind: "reference",
      payload: {
        task: pickFirstNonEmpty(payload.label, record.canonical_text, "reference")!,
        primaryResource: pickFirstNonEmpty(payload.locator, record.canonical_text)!,
        companionResources: pickFirstNonEmpty(payload.access_hint)
          ? [pickFirstNonEmpty(payload.access_hint)!]
          : undefined,
      },
      scope: runtimeScope,
      provenance,
      confidence,
      durability: "durable",
      reviewMode,
    };
  }

  if (record.kind === "directive") {
    const payload = record.payload as { action?: unknown; trigger?: unknown };
    const action = pickFirstNonEmpty(payload.action, record.canonical_text, "follow this rule")!;
    const negativeMatch = action.match(/^(do not|don't|avoid|never)\s+(.*)$/i);
    return {
      canonicalClass: deriveRuntimeCanonicalClass(record),
      kind: "rule",
      payload: negativeMatch
        ? {
            subject: pickFirstNonEmpty(payload.trigger, "standing rule")!,
            avoidAction: pickFirstNonEmpty(negativeMatch[2], action)!,
          }
        : {
            subject: pickFirstNonEmpty(payload.trigger, "standing rule")!,
            recommendedAction: action,
          },
      scope: runtimeScope,
      provenance,
      confidence,
      durability: "durable",
      reviewMode,
    };
  }

  const claimPayload = record.payload as {
    claim_type?: unknown;
    subject?: unknown;
    predicate?: unknown;
    object?: unknown;
    actor?: unknown;
    action?: unknown;
    outcome?: unknown;
    event_time?: unknown;
  };
  const claimType = cleanText(claimPayload.claim_type).toLowerCase();
  if (claimType === "preference_state") {
    return {
      canonicalClass: "user",
      kind: "preference",
      payload: {
        subject: pickFirstNonEmpty(claimPayload.subject, "user preference")!,
        instruction: pickFirstNonEmpty(claimPayload.object, record.canonical_text)!,
        operation: pickFirstNonEmpty(claimPayload.predicate, "prefer")!,
      },
      scope: runtimeScope,
      provenance,
      confidence,
      durability: "durable",
      reviewMode,
    };
  }

  const factSubject =
    record.kind === "episode"
      ? pickFirstNonEmpty(
          [claimPayload.actor, claimPayload.action].filter(Boolean).join(" "),
          record.canonical_text,
          "project event",
        )!
      : pickFirstNonEmpty(claimPayload.subject, record.canonical_text, "project fact")!;
  const factValue =
    record.kind === "episode"
      ? pickFirstNonEmpty(
          [claimPayload.object, claimPayload.outcome, claimPayload.event_time]
            .filter(Boolean)
            .join(" | "),
          record.canonical_text,
        )!
      : pickFirstNonEmpty(claimPayload.object, record.canonical_text)!;

  return {
    canonicalClass: deriveRuntimeCanonicalClass(record),
    kind: "fact",
    payload: {
      subject: factSubject,
      value: factValue,
    },
    scope: runtimeScope,
    provenance,
    confidence,
    durability: "durable",
    reviewMode,
  };
}

function readRuntimeSourceAuthority(record: DurableMemoryRecord): {
  sourceAuthorityTier?: SourceAuthorityTier;
  sourceProfileId?: SourceProfileId;
} {
  const parsed = SourceAuthorityMetadataSchema.safeParse(
    (record.payload as { sourceAuthority?: unknown }).sourceAuthority,
  );
  if (parsed.success) {
    return {
      sourceAuthorityTier: parsed.data.authorityTier,
      sourceProfileId: parsed.data.sourceProfileId,
    };
  }
  const payload = record.payload as { authorityTier?: unknown; sourceProfileId?: unknown };
  if (typeof payload.authorityTier === "string" && typeof payload.sourceProfileId === "string") {
    const fallback = SourceAuthorityMetadataSchema.safeParse({
      sourceProfileId: payload.sourceProfileId,
      authorityTier: payload.authorityTier,
      allowedMemoryKinds: [],
      rawContentRetentionMode: "hash_only",
      riskPolicy: "normal",
      retrievalPackEligibility: [],
      authorityPromotionRule: "no_promotion",
    });
    if (fallback.success) {
      return {
        sourceAuthorityTier: fallback.data.authorityTier,
        sourceProfileId: fallback.data.sourceProfileId,
      };
    }
  }
  return {};
}

export function buildRuntimeMemoryRecordFromDurable(
  record: DurableMemoryRecord,
): RuntimeMemoryRecord {
  const object = buildRuntimeObject(record);
  const identity = deriveRuntimeMemoryIdentity(object);
  const primarySourceRef = record.source_refs[0];
  const sourceAuthority = readRuntimeSourceAuthority(record);
  return {
    id: record.memory_id,
    sourceWindowId: primarySourceRef?.segment_id ?? primarySourceRef?.source_id ?? undefined,
    canonicalClass: object.canonicalClass,
    kind: object.kind,
    payload: object.payload,
    normalizedSubject: identity.normalizedSubject,
    normalizedTitle: identity.normalizedTitle,
    normalizedSearchText: buildRuntimeSearchText({
      identitySearchText: identity.normalizedSearchText,
      canonicalText: record.canonical_text,
      durableSearchText: record.search_text,
    }),
    sourceEvidenceSearchText: record.source_refs
      .map((ref) => [ref.source_id, ref.segment_id, ref.evidence_quote].filter(Boolean).join(" "))
      .join(" "),
    scope: object.scope ?? {},
    scopeKey: identity.scopeKey,
    provenance: object.provenance,
    lifecycleState: mapLifecycleStatus(record.status),
    activationBasis: record.status === "conflicted" ? "collision_conflict" : "primary_capture",
    confidence: object.confidence,
    durability: object.durability,
    suggestedReviewMode: object.reviewMode,
    executedReviewMode: object.reviewMode,
    rationaleCodes: [],
    identityKey: identity.identityKey,
    slotKey: identity.slotKey,
    contractName: "mmv2_runtime_projection",
    contractVersion: "mmv2-native-runtime-v1",
    modelId: "mmv2-storage",
    createdAt: new Date(record.created_at),
    activatedAt: record.status === "active" ? new Date(record.updated_at) : undefined,
    expiredAt: record.status === "deleted" ? new Date(record.updated_at) : undefined,
    supersededAt: record.status === "superseded" ? new Date(record.updated_at) : undefined,
    sourceAuthorityTier: sourceAuthority.sourceAuthorityTier,
    sourceProfileId: sourceAuthority.sourceProfileId,
  };
}

export function buildRuntimeMemoryRecordsFromDurable(
  durableMemories: DurableMemoryRecord[],
): RuntimeMemoryRecord[] {
  return durableMemories.map(buildRuntimeMemoryRecordFromDurable);
}

export function projectLegacyRecordToRuntimeMemoryRecord(
  record: RuntimeCompatibleMemoryRecord,
): RuntimeMemoryRecord {
  return {
    id: record.id,
    sourceWindowId: record.sourceWindowId,
    canonicalClass: record.canonicalClass,
    kind: record.kind,
    payload: record.payload,
    normalizedSubject: record.normalizedSubject,
    normalizedTitle: record.normalizedTitle,
    normalizedSearchText: record.normalizedSearchText,
    sourceEvidenceSearchText:
      "sourceEvidenceSearchText" in record ? record.sourceEvidenceSearchText : undefined,
    scope: record.scope,
    scopeKey: record.scopeKey,
    provenance: record.provenance,
    lifecycleState: record.lifecycleState,
    activationBasis: record.activationBasis,
    confidence: record.confidence,
    durability: record.durability,
    suggestedReviewMode: record.suggestedReviewMode,
    executedReviewMode: record.executedReviewMode,
    rationaleCodes: record.rationaleCodes,
    identityKey: record.identityKey,
    slotKey: record.slotKey,
    contractName: record.contractName,
    contractVersion: record.contractVersion,
    modelId: record.modelId,
    createdAt: record.createdAt,
    activatedAt: record.activatedAt,
    expiredAt: record.expiredAt,
    supersededAt: record.supersededAt,
    sourceAuthorityTier: "sourceAuthorityTier" in record ? record.sourceAuthorityTier : undefined,
    sourceProfileId: "sourceProfileId" in record ? record.sourceProfileId : undefined,
  };
}

type RuntimeReadCanonicalRepository = {
  listDurableMemories?: () => Promise<DurableMemoryRecord[]>;
  listMemoryEvents?: () => Promise<MemoryEvent[]>;
  listMemoryEdges?: () => Promise<MemoryEdge[]>;
  listMemoryObjects?: () => Promise<ModelMemoryObjectRecord[]>;
};

function enrichRuntimeMemoryRecordsWithMmv2Lineage(params: {
  records: RuntimeMemoryRecord[];
  events: MemoryEvent[];
  edges: MemoryEdge[];
}): RuntimeMemoryRecord[] {
  const eventIdsByMemoryId = new Map<string, string[]>();
  for (const event of params.events) {
    if (event.memory_id) {
      const next = eventIdsByMemoryId.get(event.memory_id) ?? [];
      next.push(event.memory_event_id);
      eventIdsByMemoryId.set(event.memory_id, next);
    }
    for (const targetMemoryId of event.target_memory_ids ?? []) {
      const next = eventIdsByMemoryId.get(targetMemoryId) ?? [];
      next.push(event.memory_event_id);
      eventIdsByMemoryId.set(targetMemoryId, next);
    }
  }

  const edgeIdsByMemoryId = new Map<string, string[]>();
  for (const edge of params.edges) {
    for (const memoryId of [edge.from_memory_id, edge.to_memory_id]) {
      const next = edgeIdsByMemoryId.get(memoryId) ?? [];
      next.push(edge.edge_id);
      edgeIdsByMemoryId.set(memoryId, next);
    }
  }

  return params.records.map((record) => {
    const eventIds = [...new Set(eventIdsByMemoryId.get(record.id) ?? [])].toSorted((left, right) =>
      left.localeCompare(right),
    );
    const edgeIds = [...new Set(edgeIdsByMemoryId.get(record.id) ?? [])].toSorted((left, right) =>
      left.localeCompare(right),
    );
    if (eventIds.length === 0 && edgeIds.length === 0) {
      return record;
    }
    return {
      ...record,
      provenance: [
        ...(record.provenance ?? []),
        ...eventIds.map((memoryEventId) => ({ memoryEventId })),
        ...edgeIds.map((memoryEdgeId) => ({ memoryEdgeId })),
      ],
    };
  });
}

export async function listRuntimeMemoryRecords(
  canonicalRepository: RuntimeReadCanonicalRepository,
): Promise<RuntimeMemoryRecord[]> {
  if (typeof canonicalRepository.listDurableMemories === "function") {
    const records = buildRuntimeMemoryRecordsFromDurable(
      await canonicalRepository.listDurableMemories(),
    );
    const [events, edges] = await Promise.all([
      typeof canonicalRepository.listMemoryEvents === "function"
        ? canonicalRepository.listMemoryEvents()
        : Promise.resolve([]),
      typeof canonicalRepository.listMemoryEdges === "function"
        ? canonicalRepository.listMemoryEdges()
        : Promise.resolve([]),
    ]);
    return enrichRuntimeMemoryRecordsWithMmv2Lineage({ records, events, edges });
  }
  if (typeof canonicalRepository.listMemoryObjects === "function") {
    return (await canonicalRepository.listMemoryObjects()).map(
      projectLegacyRecordToRuntimeMemoryRecord,
    );
  }
  throw new Error(
    "canonical repository cannot list MMV2 durable memories or legacy memory objects",
  );
}

export const RUNTIME_CONTEXT_TABLE_CONTRACTS = {
  activeMemorySlots: {
    schemaName: "runtime_context",
    tableName: "active_memory_slots",
    columns: [
      "slot_key",
      "canonical_class",
      "kind",
      "scope_key",
      "subject_key",
      "current_identity_key",
      "updated_at",
      "current_object_id",
    ],
  },
  activeMemorySets: {
    schemaName: "runtime_context",
    tableName: "active_memory_sets",
    columns: [
      "id",
      "set_key",
      "canonical_class",
      "kind",
      "scope_key",
      "sort_key",
      "updated_at",
      "memory_object_id",
    ],
  },
  sessionContextState: {
    schemaName: "runtime_context",
    tableName: "session_context_state",
    columns: [
      "session_id",
      "agent_id",
      "active_project_ids",
      "open_loops",
      "unresolved_questions",
      "active_plan_state",
      "session_summary_artifact_id",
      "projection_versions",
      "compaction_status",
      "updated_at",
    ],
  },
  contextArtifacts: {
    schemaName: "runtime_context",
    tableName: "context_artifacts",
    columns: [
      "id",
      "artifact_type",
      "scope_key",
      "source_slot_keys",
      "structured_payload",
      "rendered_text",
      "content_hash",
      "token_estimate",
      "build_policy_version",
      "contract_name",
      "contract_version",
      "model_id",
      "built_at",
      "source_object_ids",
    ],
  },
  workspaceProjectionTargets: {
    schemaName: "runtime_context",
    tableName: "workspace_projection_targets",
    columns: [
      "target_id",
      "target_kind",
      "relative_path",
      "generated_block_id",
      "allowed_canonical_classes",
      "allowed_kinds",
      "token_budget",
      "ranking_policy_id",
      "enabled",
    ],
  },
  workspaceProjectionVersions: {
    schemaName: "runtime_context",
    tableName: "workspace_projection_versions",
    columns: [
      "id",
      "target_id",
      "content_hash",
      "canonical_artifact_path",
      "source_slot_keys",
      "source_set_keys",
      "token_estimate",
      "built_at",
      "source_object_ids",
    ],
  },
  contextRuns: {
    schemaName: "runtime_context",
    tableName: "context_runs",
    columns: [
      "id",
      "session_id",
      "agent_id",
      "provider",
      "model",
      "assembled_at",
      "stable_layer_hash",
      "semi_stable_layer_hash",
      "volatile_layer_hash",
      "estimated_input_tokens",
      "actual_input_tokens",
      "actual_output_tokens",
      "cache_read_tokens",
      "cache_write_tokens",
      "estimated_cost",
      "cache_retention_mode",
      "prompt_cache_key",
      "compaction_used",
      "pruning_used",
    ],
  },
  contextRunSegments: {
    schemaName: "runtime_context",
    tableName: "context_run_segments",
    columns: [
      "id",
      "run_id",
      "segment_order",
      "segment_type",
      "source_artifact_id",
      "projection_version_id",
      "source_kind",
      "segment_hash",
      "estimated_tokens",
      "dropped",
      "trimmed",
      "trim_reason",
    ],
  },
  retrievalRequests: {
    schemaName: "runtime_context",
    tableName: "retrieval_requests",
    columns: [
      "id",
      "session_id",
      "agent_id",
      "query_text",
      "request_purpose",
      "scope",
      "desired_result_count",
      "contract_name",
      "contract_version",
      "model_id",
      "created_at",
    ],
  },
  retrievalResultSets: {
    schemaName: "runtime_context",
    tableName: "retrieval_result_sets",
    columns: ["id", "retrieval_request_id", "content_hash", "result_count", "created_at"],
  },
  retrievalResultItems: {
    schemaName: "runtime_context",
    tableName: "retrieval_result_items",
    columns: [
      "id",
      "retrieval_result_set_id",
      "rank_index",
      "rank_band",
      "retrieval_reason_codes",
      "selected_for_context",
      "packed_artifact_id",
      "created_at",
      "memory_object_id",
    ],
  },
} satisfies Record<string, TableContract>;

export function hashRuntimeValue(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function buildRuntimeId(prefix: string, input: string): string {
  return buildDeterministicUuid(prefix, input);
}

export function getCurrentMemoryObjects(
  memoryObjects: RuntimeMemoryRecord[],
): RuntimeMemoryRecord[] {
  return memoryObjects.filter(
    (record) => !record.supersededAt && (record.lifecycleState ?? "active") === "active",
  );
}

export function countRuntimeTokens(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) {
    return 0;
  }
  return trimmed.split(/\s+/).length;
}
