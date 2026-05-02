import type {
  CapturedMemoryObject,
  DocumentIngestionInput,
  DocumentIngestionResult,
  DocumentWindowIngestionResult,
  SharedIngestionResult,
} from "../document-ingestion-contracts.ts";
import type { ModelMemoryObject, MemoryScope, Provenance } from "../semantic-schema.ts";
import { adaptDocumentSource } from "../source-adapters/document-source-adapter.ts";
import {
  adaptOrdinaryTurnSource,
  type OrdinaryTurnSourceInput,
} from "../source-adapters/ordinary-turn-source-adapter.ts";
import {
  SourceAuthorityMetadataSchema,
  type SourceAuthorityMetadata,
} from "../source-authority.ts";
import type {
  ModelMemorySourceKind,
  ModelMemorySourceRecord,
} from "../storage-database-contract.ts";
import { sanitizeCompositePayloadForRetention } from "./composite-policy.ts";
import type { CanonicalCandidate, ReconciliationDecision } from "./contracts.ts";
import {
  ingestDocumentV2Core,
  ingestSourceEnvelopeV2Core,
  type MmV2CoreIngestionResult,
  type MmV2SourceEnvelopeWindow,
  type ReconciliationNeighborProvider,
} from "./document-shadow-ingestion.ts";
import { recordLiveMemoryBatch, type LiveMemoryBatch } from "./recording.ts";

export const MMV2_LIVE_DOCUMENT_CONTRACT_VERSION = "mmv2-live-adapter-v1";

export type MmV2SharedLiveStorageIngestionResult<
  TSource extends ModelMemorySourceRecord,
  TWindow extends MmV2SourceEnvelopeWindow,
> = SharedIngestionResult<TSource, TWindow> & {
  mmv2LiveRecording: LiveMemoryBatch;
  mmv2ShadowRecording: LiveMemoryBatch;
  mmv2Core: MmV2CoreIngestionResult;
};

export type MmV2LiveStorageIngestionResult = DocumentIngestionResult &
  MmV2SharedLiveStorageIngestionResult<
    ReturnType<typeof adaptDocumentSource>["source"],
    ReturnType<typeof adaptDocumentSource>["windows"][number]
  >;

export type MmV2LiveOrdinaryTurnStorageResult = MmV2SharedLiveStorageIngestionResult<
  ReturnType<typeof adaptOrdinaryTurnSource>["source"],
  ReturnType<typeof adaptOrdinaryTurnSource>["windows"][number]
>;

export type MmV2LiveDailyContinuityStorageResult = MmV2SharedLiveStorageIngestionResult<
  ReturnType<typeof adaptDocumentSource>["source"],
  ReturnType<typeof adaptDocumentSource>["windows"][number]
>;

const GENERIC_FACT_SUBJECTS = new Set([
  "project",
  "current project",
  "workspace",
  "current workspace",
  "system",
  "assistant",
  "user",
  "team",
  "repository",
  "repo",
]);

function readSourceAuthorityMetadata(
  source: ModelMemorySourceRecord,
): SourceAuthorityMetadata | undefined {
  const parsed = SourceAuthorityMetadataSchema.safeParse(source.sourceMetadata.sourceAuthority);
  return parsed.success ? parsed.data : undefined;
}

const TRIVIAL_FACT_PREDICATES = new Set([
  "is",
  "are",
  "was",
  "were",
  "has",
  "have",
  "uses",
  "use",
  "contains",
  "include",
  "includes",
]);

function cleanText(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.。]+$/, "");
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

function toLegacyConfidence(value: number): "weak" | "medium" | "strong" {
  if (value >= 0.85) {
    return "strong";
  }
  if (value >= 0.65) {
    return "medium";
  }
  return "weak";
}

function toLegacyScope(candidate: CanonicalCandidate): MemoryScope | undefined {
  const scope: MemoryScope = {};
  if (candidate.scope.project_id) {
    scope.projectId = candidate.scope.project_id;
    scope.projectScope = candidate.scope.project_id;
  }
  if (candidate.scope.workspace_id) {
    scope.workflowScope = candidate.scope.workspace_id;
  }
  if (candidate.scope.subject_type === "user") {
    const userScope =
      candidate.scope.subject_id ??
      (candidate.scope.user_id !== "unknown-user" ? candidate.scope.user_id : undefined);
    if (userScope) {
      scope.userScope = userScope;
    }
  }
  return Object.keys(scope).length > 0 ? scope : undefined;
}

function toLegacyProvenance(candidate: CanonicalCandidate): Provenance {
  return [
    {
      sourceId: candidate.source.source_id,
      blockId: candidate.source.segment_id,
      headingPath: [],
    },
  ];
}

function buildCapturedObject(input: {
  sourceWindowId: string;
  sourceKind: ModelMemorySourceKind;
  object: ModelMemoryObject;
  modelId: string;
}): CapturedMemoryObject {
  return {
    sourceWindowId: input.sourceWindowId,
    sourceKind: input.sourceKind,
    object: input.object,
    contractName: "semantic_extraction",
    contractVersion: MMV2_LIVE_DOCUMENT_CONTRACT_VERSION,
    modelId: input.modelId,
  };
}

function derivePreferenceOperation(predicate: string): string {
  const normalized = cleanText(predicate).toLowerCase();
  if (normalized.includes("prefer") || normalized.includes("default")) {
    return "prefer";
  }
  if (
    normalized.includes("avoid") ||
    normalized.includes("dislike") ||
    normalized.includes("forbid") ||
    normalized.includes("do not")
  ) {
    return "avoid";
  }
  if (
    normalized.includes("require") ||
    normalized.includes("must") ||
    normalized.includes("need")
  ) {
    return "require";
  }
  return pickFirstNonEmpty(predicate, "prefer")!;
}

function adaptClaimToFact(candidate: CanonicalCandidate): ModelMemoryObject {
  const subject = cleanText(candidate.payload.subject);
  const predicate = cleanText(candidate.payload.predicate);
  const object = pickFirstNonEmpty(candidate.payload.object, candidate.canonical_text)!;
  const normalizedSubject = subject.toLowerCase();
  const factSubject =
    !subject || GENERIC_FACT_SUBJECTS.has(normalizedSubject)
      ? pickFirstNonEmpty(predicate, candidate.canonical_text, "document fact")!
      : TRIVIAL_FACT_PREDICATES.has(predicate.toLowerCase())
        ? subject
        : pickFirstNonEmpty(`${subject} ${predicate}`, subject)!;

  return {
    canonicalClass: "project",
    kind: "fact",
    payload: {
      subject: factSubject,
      value: object,
    },
    scope: toLegacyScope(candidate),
    provenance: toLegacyProvenance(candidate),
    confidence: toLegacyConfidence(candidate.confidence),
    durability: "durable",
    reviewMode: "auto_accept",
  };
}

function adaptPreferenceClaim(candidate: CanonicalCandidate): ModelMemoryObject {
  return {
    canonicalClass: "user",
    kind: "preference",
    payload: {
      subject: pickFirstNonEmpty(candidate.payload.subject, "user preference")!,
      instruction: pickFirstNonEmpty(candidate.payload.object, candidate.canonical_text)!,
      operation: derivePreferenceOperation(
        pickFirstNonEmpty(candidate.payload.predicate, "") ?? "",
      ),
    },
    scope: toLegacyScope(candidate),
    provenance: toLegacyProvenance(candidate),
    confidence: toLegacyConfidence(candidate.confidence),
    durability: "durable",
    reviewMode: "auto_accept",
  };
}

function deriveDirectiveSubject(candidate: CanonicalCandidate): string {
  const trigger = cleanText(candidate.payload.trigger).replace(/^when\s+/i, "");
  if (
    trigger &&
    trigger.toLowerCase() !== "always" &&
    trigger.toLowerCase() !== "when appropriate" &&
    trigger.toLowerCase() !== "when needed"
  ) {
    return trigger;
  }
  return pickFirstNonEmpty(candidate.payload.action, candidate.canonical_text, "standing rule")!;
}

function deriveRuleCanonicalClass(candidate: CanonicalCandidate): "user" | "feedback" | "project" {
  if (candidate.scope.subject_type === "user" || candidate.payload.target === "user") {
    return "user";
  }
  if (
    candidate.scope.subject_type === "project" ||
    candidate.payload.target === "project" ||
    candidate.scope.applies_to === "current_project"
  ) {
    return "project";
  }
  return "feedback";
}

function adaptDirective(candidate: CanonicalCandidate): ModelMemoryObject {
  const action = pickFirstNonEmpty(candidate.payload.action, candidate.canonical_text)!;
  const negativeMatch = action.match(/^(do not|don't|avoid|never)\s+(.*)$/i);
  return {
    canonicalClass: deriveRuleCanonicalClass(candidate),
    kind: "rule",
    payload: negativeMatch
      ? {
          subject: deriveDirectiveSubject(candidate),
          avoidAction: pickFirstNonEmpty(negativeMatch[2], action)!,
        }
      : {
          subject: deriveDirectiveSubject(candidate),
          recommendedAction: action,
        },
    scope: toLegacyScope(candidate),
    provenance: toLegacyProvenance(candidate),
    confidence: toLegacyConfidence(candidate.confidence),
    durability: "durable",
    reviewMode: "auto_accept",
  };
}

function adaptSourceRef(candidate: CanonicalCandidate): ModelMemoryObject {
  return {
    canonicalClass: "reference",
    kind: "reference",
    payload: {
      task: pickFirstNonEmpty(candidate.payload.label, candidate.canonical_text, "reference")!,
      primaryResource: pickFirstNonEmpty(
        candidate.payload.locator,
        candidate.payload.label,
        candidate.canonical_text,
      )!,
      companionResources: pickFirstNonEmpty(candidate.payload.access_hint)
        ? [pickFirstNonEmpty(candidate.payload.access_hint)!]
        : undefined,
    },
    scope: toLegacyScope(candidate),
    provenance: toLegacyProvenance(candidate),
    confidence: toLegacyConfidence(candidate.confidence),
    durability: "durable",
    reviewMode: "auto_accept",
  };
}

function adaptEpisode(candidate: CanonicalCandidate): ModelMemoryObject {
  return {
    canonicalClass: "project",
    kind: "fact",
    payload: {
      subject: pickFirstNonEmpty(
        [candidate.payload.actor, candidate.payload.action].filter(Boolean).join(" "),
        candidate.canonical_text,
        "project event",
      )!,
      value: pickFirstNonEmpty(
        [candidate.payload.object, candidate.payload.outcome, candidate.payload.event_time]
          .filter(Boolean)
          .join(" | "),
        candidate.canonical_text,
      )!,
    },
    scope: toLegacyScope(candidate),
    provenance: toLegacyProvenance(candidate),
    confidence: toLegacyConfidence(candidate.confidence),
    durability: "durable",
    reviewMode: "auto_accept",
  };
}

function readRetainedCompositeComponents(candidate: CanonicalCandidate): Array<{
  orderIndex: number;
  content: string;
}> {
  const sanitizedPayload = sanitizeCompositePayloadForRetention(candidate);
  const rawComponents = Array.isArray(sanitizedPayload.components)
    ? sanitizedPayload.components
    : [];
  return rawComponents
    .flatMap((component) => {
      if (!component || typeof component !== "object") {
        return [];
      }
      const content = cleanText((component as { content?: unknown }).content);
      if (!content) {
        return [];
      }
      return [
        {
          orderIndex:
            typeof (component as { order_index?: unknown }).order_index === "number"
              ? (component as { order_index: number }).order_index
              : Number.MAX_SAFE_INTEGER,
          content,
        },
      ];
    })
    .toSorted((left, right) => left.orderIndex - right.orderIndex);
}

function adaptCompositeProcedure(candidate: CanonicalCandidate): ModelMemoryObject {
  const components = readRetainedCompositeComponents(candidate);
  return {
    canonicalClass: "feedback",
    kind: "procedure",
    payload: {
      title: pickFirstNonEmpty(candidate.payload.title, candidate.canonical_text, "procedure")!,
      steps:
        components
          .map((component) => component.content)
          .filter(Boolean)
          .slice(0, 50).length > 0
          ? components
              .map((component) => component.content)
              .filter(Boolean)
              .slice(0, 50)
          : [pickFirstNonEmpty(candidate.payload.summary, candidate.canonical_text)!],
      successShape: pickFirstNonEmpty(candidate.payload.summary),
    },
    scope: toLegacyScope(candidate),
    provenance: toLegacyProvenance(candidate),
    confidence: toLegacyConfidence(candidate.confidence),
    durability: "durable",
    reviewMode: "auto_accept",
  };
}

function adaptCompositeReference(candidate: CanonicalCandidate): ModelMemoryObject {
  const components = readRetainedCompositeComponents(candidate);
  return {
    canonicalClass: "reference",
    kind: "reference",
    payload: {
      task: pickFirstNonEmpty(
        candidate.payload.title,
        candidate.canonical_text,
        "reference bundle",
      )!,
      primaryResource: pickFirstNonEmpty(
        components[0]?.content,
        candidate.payload.summary,
        candidate.canonical_text,
      )!,
      companionResources:
        components.length > 1
          ? components.slice(1, 8).map((component) => component.content)
          : undefined,
    },
    scope: toLegacyScope(candidate),
    provenance: toLegacyProvenance(candidate),
    confidence: toLegacyConfidence(candidate.confidence),
    durability: "durable",
    reviewMode: "auto_accept",
  };
}

function adaptCompositeFact(candidate: CanonicalCandidate): ModelMemoryObject {
  return {
    canonicalClass: "project",
    kind: "fact",
    payload: {
      subject: pickFirstNonEmpty(
        candidate.payload.title,
        candidate.artifact_type,
        "document artifact",
      )!,
      value: pickFirstNonEmpty(
        candidate.payload.summary,
        candidate.payload.purpose,
        candidate.canonical_text,
      )!,
    },
    scope: toLegacyScope(candidate),
    provenance: toLegacyProvenance(candidate),
    confidence: toLegacyConfidence(candidate.confidence),
    durability: "durable",
    reviewMode: "auto_accept",
  };
}

function adaptCanonicalCandidate(candidate: CanonicalCandidate): ModelMemoryObject {
  if (candidate.kind === "claim") {
    if (candidate.payload.claim_type === "preference_state") {
      return adaptPreferenceClaim(candidate);
    }
    return adaptClaimToFact(candidate);
  }
  if (candidate.kind === "directive") {
    return adaptDirective(candidate);
  }
  if (candidate.kind === "source_ref") {
    return adaptSourceRef(candidate);
  }
  if (candidate.kind === "episode") {
    return adaptEpisode(candidate);
  }

  switch (candidate.artifact_type) {
    case "procedure":
    case "checklist":
      return adaptCompositeProcedure(candidate);
    case "source_bundle":
    case "lesson_pack":
      return adaptCompositeReference(candidate);
    case "decision_record":
    case "project_state":
    case "profile":
    default:
      return adaptCompositeFact(candidate);
  }
}

function shouldPersistThroughLegacyWritePath(
  candidate: CanonicalCandidate,
  reconciliationById: Map<string, ReconciliationDecision>,
): boolean {
  const reconciliation = reconciliationById.get(candidate.candidate_id);
  if (!reconciliation) {
    return true;
  }
  return (
    reconciliation.decision === "insert_new" || reconciliation.decision === "supersede_existing"
  );
}

function buildLegacySharedIngestionResultFromRun<
  TSource extends ModelMemorySourceRecord,
  TWindow extends MmV2SourceEnvelopeWindow,
>(
  run: MmV2CoreIngestionResult<TSource, TWindow>,
  modelId: string,
): SharedIngestionResult<TSource, TWindow> {
  const sourceWindowId = run.windows[0].id;
  const sourceWindowIdBySegmentId = new Map(
    (run.windowRuns ?? []).flatMap((windowRun) =>
      windowRun.segmentIds.map((segmentId) => [segmentId, windowRun.sourceWindowId] as const),
    ),
  );
  const admissionById = new Map(
    run.admission.decisions.map((decision) => [decision.candidate_id, decision]),
  );
  const reconciliationById = new Map(
    run.reconciliation.map((decision) => [decision.candidate_id, decision]),
  );

  const capturedObjects = run.canonicalization.canonical_candidates
    .filter((candidate) => admissionById.get(candidate.candidate_id)?.decision === "admit")
    .filter((candidate) => shouldPersistThroughLegacyWritePath(candidate, reconciliationById))
    .map((candidate) =>
      buildCapturedObject({
        sourceWindowId:
          sourceWindowIdBySegmentId.get(candidate.source.segment_id) ?? sourceWindowId,
        sourceKind: run.source.sourceKind,
        object: adaptCanonicalCandidate(candidate),
        modelId,
      }),
    );

  const objectsByWindowId = new Map<string, CapturedMemoryObject[]>();
  for (const object of capturedObjects) {
    const windowObjects = objectsByWindowId.get(object.sourceWindowId) ?? [];
    windowObjects.push(object);
    objectsByWindowId.set(object.sourceWindowId, windowObjects);
  }
  const windowResults: DocumentWindowIngestionResult[] = run.windows.map((window) => {
    const objects = objectsByWindowId.get(window.id) ?? [];
    return objects.length > 0
      ? {
          sourceWindowId: window.id,
          action: "capture",
          objects,
        }
      : {
          sourceWindowId: window.id,
          action: "ignore",
        };
  });

  return {
    source: run.source,
    windows: run.windows,
    windowResults,
    capturedObjects,
  };
}

export async function ingestDocumentV2ForLivePath(
  input: DocumentIngestionInput,
): Promise<DocumentIngestionResult> {
  const run = await ingestDocumentV2Core({
    document: input.document,
    modelId: input.modelId,
    interpreter: input.interpreter,
  });
  return buildLegacySharedIngestionResultFromRun(run, input.modelId);
}

export async function ingestDocumentV2ForLiveStorage(
  input: DocumentIngestionInput & {
    reconciliationNeighbors?: Parameters<typeof ingestDocumentV2Core>[0]["reconciliationNeighbors"];
    reconciliationNeighborsByCandidateId?: Parameters<
      typeof ingestDocumentV2Core
    >[0]["reconciliationNeighborsByCandidateId"];
    reconciliationNeighborProvider?: ReconciliationNeighborProvider;
  },
): Promise<MmV2LiveStorageIngestionResult> {
  const run = await ingestDocumentV2Core({
    document: input.document,
    modelId: input.modelId,
    interpreter: input.interpreter,
    reconciliationNeighbors: input.reconciliationNeighbors,
    reconciliationNeighborsByCandidateId: input.reconciliationNeighborsByCandidateId,
    reconciliationNeighborProvider: input.reconciliationNeighborProvider,
  });
  const legacy = buildLegacySharedIngestionResultFromRun(run, input.modelId);
  const mmv2LiveRecording = recordLiveMemoryBatch({
    eventId: run.rawEvent.event_id,
    canonicalBatch: run.canonicalization,
    admissionBatch: run.admission,
    reconciliationDecisions: run.reconciliation,
    sourceAuthority: readSourceAuthorityMetadata(run.source),
  });

  return {
    ...legacy,
    mmv2LiveRecording,
    mmv2ShadowRecording: mmv2LiveRecording,
    mmv2Core: run,
  };
}

export async function captureOrdinaryTurnV2ForLiveStorage(input: {
  capture: OrdinaryTurnSourceInput;
  modelId: string;
  interpreter: DocumentIngestionInput["interpreter"];
  reconciliationNeighbors?: Parameters<
    typeof ingestSourceEnvelopeV2Core
  >[0]["reconciliationNeighbors"];
  reconciliationNeighborsByCandidateId?: Parameters<
    typeof ingestSourceEnvelopeV2Core
  >[0]["reconciliationNeighborsByCandidateId"];
  reconciliationNeighborProvider?: ReconciliationNeighborProvider;
}): Promise<MmV2LiveOrdinaryTurnStorageResult> {
  const envelope = adaptOrdinaryTurnSource({
    ...input.capture,
  });
  const run = await ingestSourceEnvelopeV2Core({
    envelope,
    rawEventSourceType: "conversation_turn",
    rawEventSpeaker: input.capture.currentTurnSpeaker ?? "user",
    rawEventChannel: "ordinary_turn_live",
    rawEventMetadata: {
      project_id: input.capture.projectId ?? null,
      sensitivity_hint: "unknown",
    },
    modelId: input.modelId,
    interpreter: input.interpreter,
    reconciliationNeighbors: input.reconciliationNeighbors,
    reconciliationNeighborsByCandidateId: input.reconciliationNeighborsByCandidateId,
    reconciliationNeighborProvider: input.reconciliationNeighborProvider,
  });
  const legacy = buildLegacySharedIngestionResultFromRun(run, input.modelId);
  const mmv2LiveRecording = recordLiveMemoryBatch({
    eventId: run.rawEvent.event_id,
    canonicalBatch: run.canonicalization,
    admissionBatch: run.admission,
    reconciliationDecisions: run.reconciliation,
    sourceAuthority: readSourceAuthorityMetadata(run.source),
  });

  return {
    ...legacy,
    mmv2LiveRecording,
    mmv2ShadowRecording: mmv2LiveRecording,
    mmv2Core: run,
  };
}

export async function recoverDailyContinuityV2ForLiveStorage(input: {
  dailyRecord: {
    externalSourceId: string;
    text: string;
    projectId?: string;
    sourceMetadata?: Record<string, unknown>;
    maxWordsPerWindow?: number;
    createdAt?: Date;
  };
  modelId: string;
  interpreter: DocumentIngestionInput["interpreter"];
  reconciliationNeighbors?: Parameters<
    typeof ingestSourceEnvelopeV2Core
  >[0]["reconciliationNeighbors"];
  reconciliationNeighborsByCandidateId?: Parameters<
    typeof ingestSourceEnvelopeV2Core
  >[0]["reconciliationNeighborsByCandidateId"];
  reconciliationNeighborProvider?: ReconciliationNeighborProvider;
}): Promise<MmV2LiveDailyContinuityStorageResult> {
  const envelope = adaptDocumentSource({
    ...input.dailyRecord,
    sourceKind: "daily_continuity",
  });
  const run = await ingestSourceEnvelopeV2Core({
    envelope,
    rawEventSourceType: "manual_note",
    rawEventChannel: "daily_continuity_live",
    rawEventMetadata: {
      project_id: input.dailyRecord.projectId ?? null,
      sensitivity_hint: "unknown",
    },
    modelId: input.modelId,
    interpreter: input.interpreter,
    reconciliationNeighbors: input.reconciliationNeighbors,
    reconciliationNeighborsByCandidateId: input.reconciliationNeighborsByCandidateId,
    reconciliationNeighborProvider: input.reconciliationNeighborProvider,
  });
  const legacy = buildLegacySharedIngestionResultFromRun(run, input.modelId);
  const mmv2LiveRecording = recordLiveMemoryBatch({
    eventId: run.rawEvent.event_id,
    canonicalBatch: run.canonicalization,
    admissionBatch: run.admission,
    reconciliationDecisions: run.reconciliation,
    sourceAuthority: readSourceAuthorityMetadata(run.source),
  });

  return {
    ...legacy,
    mmv2LiveRecording,
    mmv2ShadowRecording: mmv2LiveRecording,
    mmv2Core: run,
  };
}
