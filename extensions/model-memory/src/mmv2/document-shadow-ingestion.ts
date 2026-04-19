import type { SemanticInterpreter } from "../semantic-interpreter.ts";
import {
  adaptDocumentSource,
  type DocumentSourceInput,
} from "../source-adapters/document-source-adapter.ts";
import { scoreAdmission } from "./admission.ts";
import { extractAtomicCandidates } from "./atomic-extraction.ts";
import { canonicalizeCandidates } from "./canonicalization.ts";
import { routeCaptureCandidates } from "./capture-routing.ts";
import {
  extractCompositeCandidates,
  suppressAtomicCandidatesOwnedByComposites,
} from "./composite-extraction.ts";
import type {
  AdmissionDecisionBatch,
  CanonicalCandidateBatch,
  CaptureRoutingBatch,
  CompositeExtractionBatch,
  ExistingMemorySummary,
  PostWriteAudit,
  RawIngestEvent,
  ReconciliationDecision,
  SegmentedIngestEvent,
} from "./contracts.ts";
import { runPostWriteAudit } from "./post-write-audit.ts";
import { createRawIngestEvent } from "./raw-ingest.ts";
import { reconcileCandidate } from "./reconciliation.ts";
import { recordShadowMemoryBatch, type ShadowMemoryBatch } from "./recording.ts";
import { segmentRawIngestEvent } from "./segmentation.ts";

export type DocumentV2ShadowIngestionInput = {
  document: DocumentSourceInput;
  modelId: string;
  interpreter: SemanticInterpreter;
  reconciliationNeighbors?: ExistingMemorySummary[];
  reconciliationNeighborsByCandidateId?: Record<string, ExistingMemorySummary[]>;
};

export type DocumentV2ShadowIngestionResult = {
  rawEvent: RawIngestEvent;
  segmented: SegmentedIngestEvent;
  routing: CaptureRoutingBatch;
  atomicExtractionRaw: Awaited<ReturnType<typeof extractAtomicCandidates>>;
  atomicExtraction: ReturnType<typeof suppressAtomicCandidatesOwnedByComposites>;
  compositeExtraction: CompositeExtractionBatch;
  canonicalization: CanonicalCandidateBatch;
  admission: AdmissionDecisionBatch;
  reconciliation: ReconciliationDecision[];
  shadowRecording: ShadowMemoryBatch;
  postWriteAudit: PostWriteAudit;
};

export async function ingestDocumentV2Shadow(
  input: DocumentV2ShadowIngestionInput,
): Promise<DocumentV2ShadowIngestionResult> {
  const envelope = adaptDocumentSource({
    ...input.document,
    maxWordsPerWindow: Number.MAX_SAFE_INTEGER,
    sourceKind: "document",
  });
  const sourceWindow = envelope.windows[0];
  const rawEvent = createRawIngestEvent({
    sourceId: envelope.source.id,
    rawText: envelope.normalizedText,
    createdAt: envelope.source.createdAt,
    sourceType: "document",
    metadata: {
      project_id: input.document.projectId ?? null,
      channel: "document_ingest_shadow",
      locale: "en",
      workspace_id: null,
      conversation_title: null,
      sensitivity_hint: "unknown",
    },
  });
  const segmented = segmentRawIngestEvent(rawEvent);
  const routing = await routeCaptureCandidates({
    rawEvent,
    segmented,
    sourceKind: "document",
    sourceId: envelope.source.id,
    sourceWindow,
    modelId: input.modelId,
    interpreter: input.interpreter,
  });
  const atomicSegments = segmented.segments.filter((segment) =>
    routing.routing_decisions.some(
      (decision) =>
        decision.segment_id === segment.segment_id && decision.route === "atomic_candidate",
    ),
  );
  const compositeSegments = segmented.segments.filter((segment) =>
    routing.routing_decisions.some(
      (decision) =>
        decision.segment_id === segment.segment_id && decision.route === "composite_candidate",
    ),
  );
  const atomicExtractionRaw = await extractAtomicCandidates({
    rawEvent,
    sourceKind: "document",
    sourceId: envelope.source.id,
    sourceWindow,
    modelId: input.modelId,
    interpreter: input.interpreter,
    segments: atomicSegments,
  });
  const compositeExtraction = await extractCompositeCandidates({
    rawEvent,
    sourceKind: "document",
    sourceId: envelope.source.id,
    sourceWindow,
    modelId: input.modelId,
    interpreter: input.interpreter,
    segments: compositeSegments,
  });
  const atomicExtraction = suppressAtomicCandidatesOwnedByComposites(
    atomicExtractionRaw,
    compositeExtraction,
  );
  const canonicalization = await canonicalizeCandidates({
    rawEvent,
    sourceKind: "document",
    sourceId: envelope.source.id,
    sourceWindow,
    modelId: input.modelId,
    interpreter: input.interpreter,
    atomicBatch: atomicExtraction,
    compositeBatch: compositeExtraction,
  });
  const admission = await scoreAdmission({
    rawEvent,
    sourceKind: "document",
    sourceId: envelope.source.id,
    sourceWindow,
    modelId: input.modelId,
    interpreter: input.interpreter,
    canonicalBatch: canonicalization,
  });
  const reconciliation: ReconciliationDecision[] = [];
  for (const candidate of canonicalization.canonical_candidates) {
    const decision = admission.decisions.find(
      (entry) => entry.candidate_id === candidate.candidate_id,
    );
    if (!decision || decision.decision !== "admit") {
      continue;
    }
    const neighbors =
      input.reconciliationNeighborsByCandidateId?.[candidate.candidate_id] ??
      input.reconciliationNeighbors ??
      [];
    reconciliation.push(
      await reconcileCandidate({
        eventId: rawEvent.event_id,
        candidate,
        neighbors,
        sourceKind: "document",
        sourceId: envelope.source.id,
        sourceWindow,
        modelId: input.modelId,
        interpreter: input.interpreter,
      }),
    );
  }
  const shadowRecording = recordShadowMemoryBatch({
    eventId: rawEvent.event_id,
    canonicalBatch: canonicalization,
    admissionBatch: admission,
    reconciliationDecisions: reconciliation,
  });
  const postWriteAudit = runPostWriteAudit({
    eventId: rawEvent.event_id,
    ...shadowRecording,
  });

  return {
    rawEvent,
    segmented,
    routing,
    atomicExtractionRaw,
    atomicExtraction,
    compositeExtraction,
    canonicalization,
    admission,
    reconciliation,
    shadowRecording,
    postWriteAudit,
  };
}
