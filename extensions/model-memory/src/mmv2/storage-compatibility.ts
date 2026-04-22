import { buildDeterministicUuid } from "../deterministic-uuid.ts";
import type { ModelMemoryObject, MemoryScope, Provenance } from "../semantic-schema.ts";
import type {
  ModelMemoryLifecycleState,
  ModelMemoryObjectRecord,
  ModelMemorySourceKind,
  ModelMemorySupportItemRecord,
  ModelMemorySupersessionLinkRecord,
  ModelMemoryWriteEventRecord,
} from "../storage-database-contract.ts";
import type {
  CanonicalScope,
  DurableMemoryRecord,
  ExistingMemorySummary,
  MemoryEdge,
  MemoryEvent,
} from "./contracts.ts";

type CompatibilityIdentity = {
  normalizedSubject: string;
  normalizedTitle?: string;
  normalizedSearchText: string;
  scopeKey: string;
  identityKey: string;
  slotKey: string;
};

function cleanText(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.replace(/\s+/g, " ").trim();
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

function collectPayloadText(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") {
    const cleaned = cleanText(value);
    if (cleaned.length > 0) {
      out.push(cleaned);
    }
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => collectPayloadText(entry, out));
    return out;
  }
  if (value && typeof value === "object") {
    Object.keys(value as Record<string, unknown>)
      .toSorted((left, right) => left.localeCompare(right))
      .forEach((key) => collectPayloadText((value as Record<string, unknown>)[key], out));
  }
  return out;
}

function stableHash(value: unknown): string {
  return buildDeterministicUuid("compat-identity", JSON.stringify(value));
}

function deriveCompatibilityIdentity(object: ModelMemoryObject): CompatibilityIdentity {
  const payload = object.payload as Record<string, unknown>;
  const normalizedSubject =
    pickFirstNonEmpty(
      payload.subject,
      payload.title,
      payload.task,
      payload.primaryResource,
      payload.value,
      object.kind,
    ) ?? "unknown";
  const normalizedTitle = pickFirstNonEmpty(payload.title, payload.summary, normalizedSubject);
  const normalizedSearchText = [
    normalizedSubject,
    normalizedTitle,
    ...collectPayloadText(object.payload),
  ]
    .join(" ")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase();
  const scopeKey = stableHash({
    canonicalClass: object.canonicalClass,
    scope: object.scope ?? {},
  });
  const identityKey = stableHash({
    canonicalClass: object.canonicalClass,
    kind: object.kind,
    scope: object.scope ?? {},
    payload: object.payload,
  });
  const slotKey = stableHash({
    canonicalClass: object.canonicalClass,
    kind: object.kind,
    scope: object.scope ?? {},
    subject: normalizedSubject,
  });
  return {
    normalizedSubject,
    normalizedTitle,
    normalizedSearchText,
    scopeKey,
    identityKey,
    slotKey,
  };
}

function confidenceFromLegacy(value: ModelMemoryObject["confidence"]): number {
  if (value === "strong") {
    return 0.92;
  }
  if (value === "medium") {
    return 0.74;
  }
  return 0.56;
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

function mapSourceTypeToKind(value: string | undefined): ModelMemorySourceKind {
  if (value === "ordinary_turn" || value === "conversation_turn" || value === "chat_message") {
    return "ordinary_turn";
  }
  if (value === "daily_continuity" || value === "manual_note") {
    return "daily_continuity";
  }
  return "document";
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

function deriveLegacyCanonicalClass(
  record: DurableMemoryRecord,
): ModelMemoryObject["canonicalClass"] {
  if (record.unit_type === "composite") {
    if (record.artifact_type === "source_bundle") {
      return "reference";
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

function canonicalScopeToLegacyScope(scope: CanonicalScope): MemoryScope | undefined {
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

function legacyScopeToCanonicalScope(input: {
  scope: MemoryScope | undefined;
  canonicalClass: ModelMemoryObject["canonicalClass"];
}): CanonicalScope {
  const projectId = input.scope?.projectId ?? input.scope?.projectScope ?? null;
  const workspaceId = input.scope?.workflowScope ?? null;
  const userScope = input.scope?.userScope ?? null;

  if (userScope) {
    return {
      tenant_id: "openclaw",
      user_id: userScope,
      project_id: projectId,
      workspace_id: workspaceId,
      subject_type: "user",
      subject_id: userScope,
      applies_to: "specific_entity",
    };
  }

  if (projectId) {
    return {
      tenant_id: "openclaw",
      user_id: "unknown-user",
      project_id: projectId,
      workspace_id: workspaceId,
      subject_type: "project",
      subject_id: projectId,
      applies_to: "current_project",
    };
  }

  if (workspaceId) {
    return {
      tenant_id: "openclaw",
      user_id: "unknown-user",
      project_id: null,
      workspace_id: workspaceId,
      subject_type: "workspace",
      subject_id: workspaceId,
      applies_to: "current_workspace",
    };
  }

  if (input.canonicalClass === "user") {
    return {
      tenant_id: "openclaw",
      user_id: "current-user",
      project_id: null,
      workspace_id: null,
      subject_type: "user",
      subject_id: "current-user",
      applies_to: "specific_entity",
    };
  }

  if (input.canonicalClass === "reference") {
    return {
      tenant_id: "openclaw",
      user_id: "unknown-user",
      project_id: null,
      workspace_id: null,
      subject_type: "external_entity",
      subject_id: null,
      applies_to: "unknown",
    };
  }

  return {
    tenant_id: "openclaw",
    user_id: "unknown-user",
    project_id: null,
    workspace_id: null,
    subject_type: input.canonicalClass === "project" ? "project" : "assistant",
    subject_id: null,
    applies_to: "unknown",
  };
}

function legacyProvenanceToSourceRefs(input: {
  provenance: Provenance;
  sourceKind: ModelMemorySourceKind;
  sourceWindowId: string;
  createdAt: string;
  evidenceQuote: string;
}): DurableMemoryRecord["source_refs"] {
  return input.provenance.map((span, index) => ({
    source_ingest_event_id: buildDeterministicUuid(
      "mmv2-source-event",
      `${input.sourceWindowId}:${index}:${span.sourceId}`,
    ),
    source_type: input.sourceKind,
    source_id: span.sourceId,
    speaker: "unknown",
    created_at: input.createdAt,
    segment_id: span.blockId ?? `${input.sourceWindowId}:segment-${index}`,
    start_char: span.lineStart ?? 0,
    end_char: span.lineEnd ?? 0,
    evidence_quote: input.evidenceQuote,
  }));
}

function sourceRefsToLegacyProvenance(sourceRefs: DurableMemoryRecord["source_refs"]): Provenance {
  return sourceRefs.map((ref) => ({
    sourceId: ref.source_id,
    blockId: ref.segment_id,
    lineStart: ref.start_char > 0 ? ref.start_char : undefined,
    lineEnd: ref.end_char > 0 ? ref.end_char : undefined,
    headingPath: [],
  }));
}

function buildDurableTags(object: ModelMemoryObject): string[] {
  return [object.canonicalClass, object.kind];
}

function buildDurableQuality(object: ModelMemoryObject): DurableMemoryRecord["quality"] {
  const confidence = confidenceFromLegacy(object.confidence);
  const durable = object.durability === "durable" ? 0.9 : 0.45;
  const actionability = object.kind === "procedure" || object.kind === "rule" ? 0.92 : 0.72;
  return {
    atomicity: object.kind === "procedure" ? 0.82 : 0.97,
    specificity: confidence,
    durability: durable,
    actionability,
    grounding: 0.88,
  };
}

function buildDurableValidity(createdAtIso: string): DurableMemoryRecord["validity"] {
  return {
    valid_at: createdAtIso,
    invalid_at: null,
    ttl_seconds: null,
    temporal_status: "current",
  };
}

function buildLegacyCanonicalText(object: ModelMemoryObject): string {
  switch (object.kind) {
    case "preference":
      return `${object.payload.subject} ${object.payload.operation} ${object.payload.instruction}.`;
    case "fact":
      return `${object.payload.subject} is ${object.payload.value}.`;
    case "rule":
      return (
        pickFirstNonEmpty(
          object.payload.recommendedAction &&
            `${object.payload.subject}: ${object.payload.recommendedAction}.`,
          object.payload.avoidAction &&
            `${object.payload.subject}: avoid ${object.payload.avoidAction}.`,
          object.payload.neededCapability &&
            `${object.payload.subject}: needs ${object.payload.neededCapability}.`,
        ) ?? "Standing rule."
      );
    case "procedure":
      return `${object.payload.title}: ${object.payload.steps.join(" ")}`;
    case "reference":
      return `${object.payload.task}: ${object.payload.primaryResource}`;
  }
  return "Memory object.";
}

export function adaptLegacyObjectToDurableMemory(input: {
  memoryId: string;
  object: ModelMemoryObject;
  sourceWindowId: string;
  sourceKind: ModelMemorySourceKind;
  createdAt: Date;
  status?: DurableMemoryRecord["status"];
  supersedesMemoryIds?: string[];
  supersededByMemoryId?: string | null;
}): DurableMemoryRecord {
  const createdAtIso = input.createdAt.toISOString();
  const canonicalText = buildLegacyCanonicalText(input.object);
  const searchText = canonicalText;
  const scope = legacyScopeToCanonicalScope({
    scope: input.object.scope,
    canonicalClass: input.object.canonicalClass,
  });

  let unitType: DurableMemoryRecord["unit_type"] = "atomic";
  let kind: DurableMemoryRecord["kind"] = null;
  let artifactType: DurableMemoryRecord["artifact_type"] = null;
  let payload: DurableMemoryRecord["payload"] = {};

  switch (input.object.kind) {
    case "preference":
      kind = "claim";
      payload = {
        payload_type: "claim",
        claim_type: "preference_state",
        subject: input.object.payload.subject,
        predicate: input.object.payload.operation,
        object: input.object.payload.instruction,
        qualifiers: [],
        temporal_status: "currently_true",
      };
      break;
    case "fact":
      kind = "claim";
      payload = {
        payload_type: "claim",
        claim_type: "project_fact",
        subject: input.object.payload.subject,
        predicate: "is",
        object: input.object.payload.value,
        qualifiers: [],
        temporal_status: "currently_true",
      };
      break;
    case "rule":
      kind = "directive";
      payload = {
        payload_type: "directive",
        directive_type: input.object.canonicalClass === "user" ? "response_style" : "project_rule",
        authority: "user",
        target: input.object.canonicalClass === "project" ? "project" : "assistant",
        strength: input.object.payload.avoidAction ? "hard_constraint" : "soft_default",
        trigger: "always",
        action:
          input.object.payload.recommendedAction ??
          (input.object.payload.avoidAction
            ? `do not ${input.object.payload.avoidAction}`
            : (input.object.payload.neededCapability ?? canonicalText)),
        exceptions: [],
        overridable: false,
        derived_from_claim_candidate_ids: [],
      };
      break;
    case "procedure":
      unitType = "composite";
      artifactType = "procedure";
      payload = {
        artifact_type: "procedure",
        title: input.object.payload.title,
        purpose: input.object.payload.title,
        summary: pickFirstNonEmpty(
          input.object.payload.successShape,
          input.object.payload.failureShape,
          input.object.payload.steps[0],
          canonicalText,
        ),
        components: input.object.payload.steps.map((step, index) => ({
          component_id: `${input.memoryId}:step-${index}`,
          order_index: index,
          role: "step",
          content: step,
          embedded_atomic_kind: "none",
          promotion: "embedded_only",
          evidence_quote: step,
          required: true,
          conditions: [],
          outputs: [],
        })),
      };
      break;
    case "reference":
      kind = "source_ref";
      payload = {
        payload_type: "source_ref",
        ref_type: "document_title",
        locator: input.object.payload.primaryResource,
        label: input.object.payload.task,
        access_hint: input.object.payload.companionResources?.[0] ?? null,
        relation: "relevant_to_task",
      };
      break;
  }

  return {
    memory_id: input.memoryId,
    schema_version: "durable_memory.v1",
    status: input.status ?? "active",
    unit_type: unitType,
    kind,
    artifact_type: artifactType,
    canonical_text: canonicalText,
    search_text: searchText,
    scope,
    payload,
    validity: buildDurableValidity(createdAtIso),
    confidence: confidenceFromLegacy(input.object.confidence),
    quality: buildDurableQuality(input.object),
    source_refs: legacyProvenanceToSourceRefs({
      provenance: input.object.provenance,
      sourceKind: input.sourceKind,
      sourceWindowId: input.sourceWindowId,
      createdAt: createdAtIso,
      evidenceQuote: canonicalText,
    }),
    lineage: {
      candidate_ids: [],
      derived_from_memory_ids: [],
      supersedes_memory_ids: input.supersedesMemoryIds ?? [],
      superseded_by_memory_id: input.supersededByMemoryId ?? null,
      conflicts_with_memory_ids: [],
      parent_memory_id: null,
      child_memory_ids: [],
    },
    created_at: createdAtIso,
    updated_at: createdAtIso,
    last_accessed_at: null,
    access_count: 0,
    tags: buildDurableTags(input.object),
  };
}

function buildRuleObject(record: DurableMemoryRecord): ModelMemoryObject {
  const directivePayload = record.payload as {
    action?: unknown;
    trigger?: unknown;
    target?: unknown;
  };
  const action = pickFirstNonEmpty(
    directivePayload.action,
    record.canonical_text,
    "follow this rule",
  )!;
  const negativeMatch = action.match(/^(do not|don't|avoid|never)\s+(.*)$/i);
  return {
    canonicalClass: deriveLegacyCanonicalClass(record),
    kind: "rule",
    payload: negativeMatch
      ? {
          subject: pickFirstNonEmpty(directivePayload.trigger, "standing rule")!,
          avoidAction: pickFirstNonEmpty(negativeMatch[2], action)!,
        }
      : {
          subject: pickFirstNonEmpty(directivePayload.trigger, "standing rule")!,
          recommendedAction: action,
        },
    scope: canonicalScopeToLegacyScope(record.scope),
    provenance: sourceRefsToLegacyProvenance(record.source_refs),
    confidence: confidenceToLegacy(record.confidence),
    durability: "durable",
    reviewMode:
      record.status === "conflicted" || record.status === "quarantined"
        ? "manual_review"
        : "auto_accept",
  } as ModelMemoryObject;
}

function buildProcedureObject(record: DurableMemoryRecord): ModelMemoryObject {
  const payload = record.payload as {
    title?: unknown;
    summary?: unknown;
    components?: Array<{ content?: unknown }>;
  };
  const steps = Array.isArray(payload.components)
    ? payload.components
        .map((component) => cleanText(component?.content))
        .filter((value) => value.length > 0)
    : [];
  return {
    canonicalClass: record.artifact_type === "source_bundle" ? "reference" : "feedback",
    kind: record.artifact_type === "source_bundle" ? "reference" : "procedure",
    payload:
      record.artifact_type === "source_bundle"
        ? {
            task: pickFirstNonEmpty(payload.title, record.canonical_text, "reference bundle")!,
            primaryResource: pickFirstNonEmpty(payload.summary, record.canonical_text)!,
            companionResources: steps.length > 0 ? steps : undefined,
          }
        : {
            title: pickFirstNonEmpty(payload.title, record.canonical_text, "procedure")!,
            steps: steps.length > 0 ? steps : [record.canonical_text],
            successShape: pickFirstNonEmpty(payload.summary),
          },
    scope: canonicalScopeToLegacyScope(record.scope),
    provenance: sourceRefsToLegacyProvenance(record.source_refs),
    confidence: confidenceToLegacy(record.confidence),
    durability: "durable",
    reviewMode:
      record.status === "conflicted" || record.status === "quarantined"
        ? "manual_review"
        : "auto_accept",
  } as ModelMemoryObject;
}

export function projectDurableMemoryToLegacyObject(record: DurableMemoryRecord): ModelMemoryObject {
  if (record.unit_type === "composite") {
    return buildProcedureObject(record);
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
      scope: canonicalScopeToLegacyScope(record.scope),
      provenance: sourceRefsToLegacyProvenance(record.source_refs),
      confidence: confidenceToLegacy(record.confidence),
      durability: "durable",
      reviewMode:
        record.status === "conflicted" || record.status === "quarantined"
          ? "manual_review"
          : "auto_accept",
    };
  }

  if (record.kind === "directive") {
    return buildRuleObject(record);
  }

  const claimPayload = record.payload as {
    claim_type?: unknown;
    subject?: unknown;
    predicate?: unknown;
    object?: unknown;
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
      scope: canonicalScopeToLegacyScope(record.scope),
      provenance: sourceRefsToLegacyProvenance(record.source_refs),
      confidence: confidenceToLegacy(record.confidence),
      durability: "durable",
      reviewMode:
        record.status === "conflicted" || record.status === "quarantined"
          ? "manual_review"
          : "auto_accept",
    };
  }

  return {
    canonicalClass: "project",
    kind: "fact",
    payload: {
      subject: pickFirstNonEmpty(claimPayload.subject, record.canonical_text, "project fact")!,
      value: pickFirstNonEmpty(claimPayload.object, record.canonical_text)!,
    },
    scope: canonicalScopeToLegacyScope(record.scope),
    provenance: sourceRefsToLegacyProvenance(record.source_refs),
    confidence: confidenceToLegacy(record.confidence),
    durability: "durable",
    reviewMode:
      record.status === "conflicted" || record.status === "quarantined"
        ? "manual_review"
        : "auto_accept",
  };
}

export function projectDurableMemoryToLegacyRecord(
  record: DurableMemoryRecord,
): ModelMemoryObjectRecord {
  const object = projectDurableMemoryToLegacyObject(record);
  const identity = deriveCompatibilityIdentity(object);
  return {
    id: record.memory_id,
    canonicalClass: object.canonicalClass,
    kind: object.kind,
    payload: object.payload,
    normalizedSubject: identity.normalizedSubject,
    normalizedTitle: identity.normalizedTitle,
    normalizedSearchText: identity.normalizedSearchText,
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
    contractName: "mmv2_compat_projection",
    contractVersion: "mmv2-native-storage-v1",
    modelId: "mmv2-storage",
    createdAt: new Date(record.created_at),
    activatedAt: record.status === "active" ? new Date(record.updated_at) : undefined,
    expiredAt: record.status === "deleted" ? new Date(record.updated_at) : undefined,
    supersededAt: record.status === "superseded" ? new Date(record.updated_at) : undefined,
  };
}

export function projectDurableMemoryToSupportItems(
  record: DurableMemoryRecord,
): ModelMemorySupportItemRecord[] {
  return record.source_refs.map((ref, index) => ({
    id: buildDeterministicUuid(
      "support",
      `${record.memory_id}:${ref.source_id}:${ref.segment_id}:${index}`,
    ),
    memoryObjectId: record.memory_id,
    sourceWindowId: ref.segment_id,
    provenance: sourceRefsToLegacyProvenance([ref]),
    supportFingerprint: `${ref.source_type}:${ref.source_id}:${ref.segment_id}`,
    supportKind: index === 0 ? "origin_capture" : "independent_reinforcement",
    countsForReinforcement: mapSourceTypeToKind(ref.source_type) !== "daily_continuity",
    derivedFromSourceKind: mapSourceTypeToKind(ref.source_type),
    createdAt: new Date(ref.created_at),
  }));
}

export function projectMemoryEventToLegacyWriteEvent(
  event: MemoryEvent,
): ModelMemoryWriteEventRecord {
  let decision = "ignore";
  if (
    event.event_type === "memory_inserted" ||
    event.event_type === "artifact_inserted" ||
    event.event_type === "conflict_recorded"
  ) {
    decision = "write";
  } else if (event.event_type === "memory_superseded") {
    decision = "supersede";
  } else if (event.event_type === "memory_merged" || event.event_type === "artifact_updated") {
    decision = "attach_support";
  } else if (event.event_type === "candidate_quarantined") {
    decision = "quarantine";
  } else if (event.event_type === "candidate_rejected") {
    decision = "reject";
  }

  return {
    id: event.memory_event_id,
    sourceWindowId: cleanText(event.source_ingest_event_id) || event.memory_event_id,
    candidateIdentityKey: event.candidate_id ?? undefined,
    decision,
    memoryObjectId: event.memory_id ?? undefined,
    supersededObjectId:
      decision === "supersede" && event.target_memory_ids.length > 0
        ? event.target_memory_ids[0]
        : undefined,
    supportItemId: undefined,
    decisionCodes: [],
    contractName: "mmv2_compat_projection",
    contractVersion: "mmv2-native-storage-v1",
    modelId: "mmv2-storage",
    createdAt: new Date(event.occurred_at),
  };
}

export function projectMemoryEdgeToSupersessionLink(
  edge: MemoryEdge,
): ModelMemorySupersessionLinkRecord | undefined {
  if (edge.edge_type !== "supersedes") {
    return undefined;
  }
  return {
    id: edge.edge_id,
    priorObjectId: edge.to_memory_id,
    replacementObjectId: edge.from_memory_id,
    reasonCode: "slot_supersession",
    createdAt: new Date(edge.created_at),
  };
}

export function buildExistingMemorySummary(record: DurableMemoryRecord): ExistingMemorySummary {
  return {
    memory_id: record.memory_id,
    unit_type: record.unit_type,
    kind: record.kind,
    artifact_type: record.artifact_type,
    canonical_text: record.canonical_text,
    scope: record.scope,
    payload: record.payload,
    validity: record.validity,
    confidence: record.confidence,
    created_at: record.created_at,
    updated_at: record.updated_at,
  };
}
