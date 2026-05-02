import type { InterpreterSourceWindow, SemanticInterpreter } from "../semantic-interpreter.ts";
import {
  adaptDocumentSource,
  type DocumentSourceInput,
} from "../source-adapters/document-source-adapter.ts";
import type { ModelMemorySourceRecord } from "../storage-database-contract.ts";
import { scoreAdmissionRuntime } from "./admission.ts";
import { extractAtomicCandidates } from "./atomic-extraction.ts";
import { canonicalizeCandidatesRuntime } from "./canonicalization.ts";
import { materializeRoutedCandidates, routeCaptureCandidatesRuntime } from "./capture-routing.ts";
import {
  extractCompositeCandidates,
  suppressAtomicCandidatesOwnedByComposites,
} from "./composite-extraction.ts";
import {
  buildCompositePolicySummary,
  type MmV2CompositePolicySummary,
} from "./composite-policy.ts";
import type {
  AdmissionDecisionBatch,
  AtomicRoutedCandidate,
  AtomicExtractionBatch,
  CaptureRoutingBatch,
  CanonicalCandidate,
  CanonicalCandidateBatch,
  CompositeExtractionBatch,
  CompositeRoutedCandidate,
  ExistingMemorySummary,
  PostWriteAudit,
  RawIngestEvent,
  ReconciliationDecision,
  RoutedCandidateBatch,
  SegmentedIngestEvent,
} from "./contracts.ts";
import { runPostWriteAudit } from "./post-write-audit.ts";
import type { MmV2PromptResponseMode } from "./prompt-contracts.ts";
import { createRawIngestEvent } from "./raw-ingest.ts";
import { reconcileCandidate } from "./reconciliation.ts";
import { recordShadowMemoryBatch, type ShadowMemoryBatch } from "./recording.ts";
import { segmentRawIngestEvent } from "./segmentation.ts";

export type ReconciliationNeighborProvider = (
  candidate: CanonicalCandidate,
) => ExistingMemorySummary[] | Promise<ExistingMemorySummary[]>;

export type DocumentV2ShadowIngestionInput = {
  document: DocumentSourceInput;
  modelId: string;
  interpreter: SemanticInterpreter;
  reconciliationNeighbors?: ExistingMemorySummary[];
  reconciliationNeighborsByCandidateId?: Record<string, ExistingMemorySummary[]>;
  reconciliationNeighborProvider?: ReconciliationNeighborProvider;
  responseMode?: MmV2PromptResponseMode;
};

export type MmV2SourceEnvelopeWindow = InterpreterSourceWindow & {
  createdAt: Date;
};

export type MmV2SourceEnvelope<
  TSource extends ModelMemorySourceRecord = ModelMemorySourceRecord,
  TWindow extends MmV2SourceEnvelopeWindow = MmV2SourceEnvelopeWindow,
> = {
  source: TSource;
  normalizedText: string;
  windows: TWindow[];
};

export type MmV2SourceEnvelopeCoreIngestionInput<
  TSource extends ModelMemorySourceRecord = ModelMemorySourceRecord,
  TWindow extends MmV2SourceEnvelopeWindow = MmV2SourceEnvelopeWindow,
> = {
  envelope: MmV2SourceEnvelope<TSource, TWindow>;
  rawEventSourceType: RawIngestEvent["source_type"];
  rawEventSpeaker?: RawIngestEvent["speaker"];
  rawEventChannel: string;
  rawEventMetadata?: Partial<RawIngestEvent["metadata"]>;
  modelId: string;
  interpreter: SemanticInterpreter;
  reconciliationNeighbors?: ExistingMemorySummary[];
  reconciliationNeighborsByCandidateId?: Record<string, ExistingMemorySummary[]>;
  reconciliationNeighborProvider?: ReconciliationNeighborProvider;
  responseMode?: MmV2PromptResponseMode;
};

export type MmV2CoreIngestionResult<
  TSource extends ModelMemorySourceRecord = ModelMemorySourceRecord,
  TWindow extends MmV2SourceEnvelopeWindow = MmV2SourceEnvelopeWindow,
> = {
  source: TSource;
  windows: TWindow[];
  rawEvent: RawIngestEvent;
  segmented: SegmentedIngestEvent;
  routing: CaptureRoutingBatch;
  routedCandidates: RoutedCandidateBatch;
  atomicExtractionRaw: Awaited<ReturnType<typeof extractAtomicCandidates>>;
  atomicExtraction: ReturnType<typeof suppressAtomicCandidatesOwnedByComposites>;
  compositeExtraction: CompositeExtractionBatch;
  canonicalization: CanonicalCandidateBatch;
  compositePolicy: MmV2CompositePolicySummary;
  admission: AdmissionDecisionBatch;
  reconciliation: ReconciliationDecision[];
  windowRuns: Array<{
    sourceWindowId: string;
    rawEventId: string;
    segmentIds: string[];
  }>;
};

export type DocumentV2CoreIngestionResult = MmV2CoreIngestionResult<
  ReturnType<typeof adaptDocumentSource>["source"],
  ReturnType<typeof adaptDocumentSource>["windows"][number]
>;

export type DocumentV2ShadowIngestionResult = DocumentV2CoreIngestionResult & {
  shadowRecording: ShadowMemoryBatch;
  postWriteAudit: PostWriteAudit;
};

const ATOMIC_EXTRACTION_BATCH_SIZE = 8;
const COMPOSITE_EXTRACTION_BATCH_SIZE = 6;
const ADMISSION_BATCH_SIZE = 8;

function chunkArray<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

async function buildCandidateNeighborMap(input: {
  canonicalBatch: CanonicalCandidateBatch;
  reconciliationNeighbors?: ExistingMemorySummary[];
  reconciliationNeighborsByCandidateId?: Record<string, ExistingMemorySummary[]>;
  reconciliationNeighborProvider?: ReconciliationNeighborProvider;
}): Promise<Record<string, ExistingMemorySummary[]>> {
  const candidateScopedNeighborSets = Object.values(
    input.reconciliationNeighborsByCandidateId ?? {},
  );
  return Object.fromEntries(
    await Promise.all(
      input.canonicalBatch.canonical_candidates.map(async (candidate) => {
        const exactCandidateNeighbors =
          input.reconciliationNeighborsByCandidateId?.[candidate.candidate_id];
        const singleCandidateFallbackNeighbors =
          exactCandidateNeighbors === undefined &&
          input.reconciliationNeighbors === undefined &&
          input.reconciliationNeighborProvider === undefined &&
          input.canonicalBatch.canonical_candidates.length === 1 &&
          candidateScopedNeighborSets.length === 1
            ? candidateScopedNeighborSets[0]
            : undefined;
        const neighbors =
          exactCandidateNeighbors ??
          singleCandidateFallbackNeighbors ??
          (input.reconciliationNeighborProvider
            ? await input.reconciliationNeighborProvider(candidate)
            : undefined) ??
          input.reconciliationNeighbors ??
          [];
        return [candidate.candidate_id, neighbors];
      }),
    ),
  );
}

function prefixAtomicExtractionBatch(
  batch: AtomicExtractionBatch,
  prefix: string,
): AtomicExtractionBatch {
  const remappedIds = new Map<string, string>();
  batch.atomic_candidates.forEach((candidate, index) => {
    remappedIds.set(candidate.candidate_id, `${prefix}${index}:${candidate.candidate_id}`);
  });

  return {
    ...batch,
    atomic_candidates: batch.atomic_candidates.map((candidate, index) => {
      const candidateId =
        remappedIds.get(candidate.candidate_id) ?? `${prefix}${index}:${candidate.candidate_id}`;
      const payload =
        candidate.payload.payload_type === "directive"
          ? {
              ...candidate.payload,
              derived_from_claim_candidate_ids:
                candidate.payload.derived_from_claim_candidate_ids.map(
                  (derivedId) => remappedIds.get(derivedId) ?? derivedId,
                ),
            }
          : candidate.payload;
      return {
        ...candidate,
        candidate_id: candidateId,
        payload,
      };
    }),
  };
}

function prefixCompositeExtractionBatch(
  batch: CompositeExtractionBatch,
  prefix: string,
): CompositeExtractionBatch {
  return {
    ...batch,
    composite_candidates: batch.composite_candidates.map((candidate, candidateIndex) => ({
      ...candidate,
      candidate_id: `${prefix}${candidateIndex}:${candidate.candidate_id}`,
      components: candidate.components.map((component, componentIndex) => ({
        ...component,
        component_id: `${prefix}${candidateIndex}.component-${componentIndex}:${component.component_id}`,
      })),
    })),
  };
}

function prefixCanonicalCandidateBatch(
  batch: CanonicalCandidateBatch,
  prefix: string,
): CanonicalCandidateBatch {
  const remappedIds = new Map<string, string>();
  batch.canonical_candidates.forEach((candidate) => {
    remappedIds.set(candidate.candidate_id, `${prefix}${candidate.candidate_id}`);
  });

  return {
    ...batch,
    canonical_candidates: batch.canonical_candidates.map((candidate) => ({
      ...candidate,
      candidate_id: remappedIds.get(candidate.candidate_id) ?? `${prefix}${candidate.candidate_id}`,
      parent_candidate_id: candidate.parent_candidate_id
        ? (remappedIds.get(candidate.parent_candidate_id) ?? candidate.parent_candidate_id)
        : null,
      component_candidate_id: candidate.component_candidate_id
        ? (remappedIds.get(candidate.component_candidate_id) ?? candidate.component_candidate_id)
        : null,
    })),
  };
}

function prefixAdmissionBatch(
  batch: AdmissionDecisionBatch,
  prefix: string,
): AdmissionDecisionBatch {
  return {
    ...batch,
    decisions: batch.decisions.map((decision) => ({
      ...decision,
      candidate_id: `${prefix}${decision.candidate_id}`,
    })),
  };
}

function prefixReconciliationDecisions(
  decisions: ReconciliationDecision[],
  prefix: string,
): ReconciliationDecision[] {
  return decisions.map((decision) => ({
    ...decision,
    candidate_id: `${prefix}${decision.candidate_id}`,
  }));
}

function mergeAtomicExtractionBatches(
  eventId: string,
  batches: AtomicExtractionBatch[],
): AtomicExtractionBatch {
  return {
    schema_version: "atomic_extraction.v1",
    event_id: eventId,
    atomic_candidates: batches.flatMap((batch) => batch.atomic_candidates),
  };
}

function mergeCompositeExtractionBatches(
  eventId: string,
  batches: CompositeExtractionBatch[],
): CompositeExtractionBatch {
  return {
    schema_version: "composite_extraction.v1",
    event_id: eventId,
    composite_candidates: batches.flatMap((batch) => batch.composite_candidates),
  };
}

function mergeAdmissionBatches(
  eventId: string,
  batches: AdmissionDecisionBatch[],
): AdmissionDecisionBatch {
  return {
    schema_version: "admission_decision.v1",
    event_id: eventId,
    decisions: batches.flatMap((batch) => batch.decisions),
  };
}

function mergeCanonicalCandidateBatches(
  eventId: string,
  batches: CanonicalCandidateBatch[],
): CanonicalCandidateBatch {
  return {
    schema_version: "canonical_candidates.v1",
    event_id: eventId,
    canonical_candidates: batches.flatMap((batch) => batch.canonical_candidates),
  };
}

async function canonicalizeCandidatesBatched(input: {
  rawEvent: RawIngestEvent;
  segmented: SegmentedIngestEvent;
  sourceId: string;
  sourceWindow: InterpreterSourceWindow;
  modelId: string;
  interpreter: SemanticInterpreter;
  atomicBatch: AtomicExtractionBatch;
  compositeBatch: CompositeExtractionBatch;
  responseMode?: MmV2PromptResponseMode;
}): Promise<CanonicalCandidateBatch> {
  if (
    input.atomicBatch.atomic_candidates.length === 0 &&
    input.compositeBatch.composite_candidates.length === 0
  ) {
    return {
      schema_version: "canonical_candidates.v1",
      event_id: input.rawEvent.event_id,
      canonical_candidates: [],
    };
  }
  return canonicalizeCandidatesRuntime({
    rawEvent: input.rawEvent,
    segmented: input.segmented,
    sourceKind: "document",
    sourceId: input.sourceId,
    sourceWindow: input.sourceWindow,
    modelId: input.modelId,
    interpreter: input.interpreter,
    atomicBatch: input.atomicBatch,
    compositeBatch: input.compositeBatch,
    responseMode: input.responseMode,
  });
}

async function scoreAdmissionBatched(input: {
  rawEvent: RawIngestEvent;
  sourceId: string;
  sourceWindow: InterpreterSourceWindow;
  modelId: string;
  interpreter: SemanticInterpreter;
  canonicalBatch: CanonicalCandidateBatch;
  candidateNeighborsById: Record<string, ExistingMemorySummary[]>;
  responseMode?: MmV2PromptResponseMode;
}): Promise<AdmissionDecisionBatch> {
  if (input.canonicalBatch.canonical_candidates.length === 0) {
    return {
      schema_version: "admission_decision.v1",
      event_id: input.rawEvent.event_id,
      decisions: [],
    };
  }

  const batches: AdmissionDecisionBatch[] = [];
  for (const candidateBatch of chunkArray(
    input.canonicalBatch.canonical_candidates,
    ADMISSION_BATCH_SIZE,
  )) {
    const candidateIds = new Set(candidateBatch.map((candidate) => candidate.candidate_id));
    const candidateNeighborsById = Object.fromEntries(
      Object.entries(input.candidateNeighborsById).filter(([candidateId]) =>
        candidateIds.has(candidateId),
      ),
    );
    batches.push(
      await scoreAdmissionRuntime({
        rawEvent: input.rawEvent,
        sourceKind: "document",
        sourceId: input.sourceId,
        sourceWindow: input.sourceWindow,
        modelId: input.modelId,
        interpreter: input.interpreter,
        canonicalBatch: {
          schema_version: "canonical_candidates.v1",
          event_id: input.rawEvent.event_id,
          canonical_candidates: candidateBatch,
        },
        candidateNeighborsById,
        responseMode: input.responseMode,
      }),
    );
  }

  return mergeAdmissionBatches(input.rawEvent.event_id, batches);
}

async function extractAtomicCandidatesBatched(input: {
  rawEvent: RawIngestEvent;
  sourceId: string;
  sourceWindow: InterpreterSourceWindow;
  modelId: string;
  interpreter: SemanticInterpreter;
  routedCandidates: AtomicRoutedCandidate[];
  responseMode?: MmV2PromptResponseMode;
}): Promise<AtomicExtractionBatch> {
  if (input.routedCandidates.length === 0) {
    return {
      schema_version: "atomic_extraction.v1",
      event_id: input.rawEvent.event_id,
      atomic_candidates: [],
    };
  }

  const routedBatches = chunkArray(input.routedCandidates, ATOMIC_EXTRACTION_BATCH_SIZE);
  const batches: AtomicExtractionBatch[] = [];
  for (const [batchIndex, routedBatch] of routedBatches.entries()) {
    const extracted = await extractAtomicCandidates({
      rawEvent: input.rawEvent,
      sourceKind: "document",
      sourceId: input.sourceId,
      sourceWindow: input.sourceWindow,
      modelId: input.modelId,
      interpreter: input.interpreter,
      routedCandidates: routedBatch,
      responseMode: input.responseMode,
    });
    batches.push(
      routedBatches.length > 1
        ? prefixAtomicExtractionBatch(extracted, `atomic-${batchIndex}:`)
        : extracted,
    );
  }

  return mergeAtomicExtractionBatches(input.rawEvent.event_id, batches);
}

async function extractCompositeCandidatesBatched(input: {
  rawEvent: RawIngestEvent;
  sourceId: string;
  sourceWindow: InterpreterSourceWindow;
  modelId: string;
  interpreter: SemanticInterpreter;
  routedCandidates: CompositeRoutedCandidate[];
  responseMode?: MmV2PromptResponseMode;
}): Promise<CompositeExtractionBatch> {
  if (input.routedCandidates.length === 0) {
    return {
      schema_version: "composite_extraction.v1",
      event_id: input.rawEvent.event_id,
      composite_candidates: [],
    };
  }

  const routedBatches = chunkArray(input.routedCandidates, COMPOSITE_EXTRACTION_BATCH_SIZE);
  const batches: CompositeExtractionBatch[] = [];
  for (const [batchIndex, routedBatch] of routedBatches.entries()) {
    const extracted = await extractCompositeCandidates({
      rawEvent: input.rawEvent,
      sourceKind: "document",
      sourceId: input.sourceId,
      sourceWindow: input.sourceWindow,
      modelId: input.modelId,
      interpreter: input.interpreter,
      routedCandidates: routedBatch,
      anchoringCandidates: input.routedCandidates,
      responseMode: input.responseMode,
    });
    batches.push(
      routedBatches.length > 1
        ? prefixCompositeExtractionBatch(extracted, `composite-${batchIndex}:`)
        : extracted,
    );
  }

  return mergeCompositeExtractionBatches(input.rawEvent.event_id, batches);
}

async function ingestSourceWindowV2Core<
  TSource extends ModelMemorySourceRecord,
  TWindow extends MmV2SourceEnvelopeWindow,
>(
  input: MmV2SourceEnvelopeCoreIngestionInput<TSource, TWindow> & {
    sourceWindow: TWindow;
  },
): Promise<MmV2CoreIngestionResult<TSource, TWindow>> {
  const { envelope } = input;
  const sourceWindow = input.sourceWindow;
  const rawEvent = createRawIngestEvent({
    sourceId: envelope.source.id,
    rawText: sourceWindow.normalizedText,
    createdAt: envelope.source.createdAt,
    sessionId: envelope.source.sessionId,
    sourceType: input.rawEventSourceType,
    speaker: input.rawEventSpeaker,
    metadata: {
      project_id: envelope.source.projectId ?? null,
      channel: input.rawEventChannel,
      locale: "en",
      workspace_id: null,
      conversation_title: null,
      sensitivity_hint: "unknown",
      ...input.rawEventMetadata,
    },
  });
  const segmented = segmentRawIngestEvent(rawEvent);
  const routing = await routeCaptureCandidatesRuntime({
    rawEvent,
    segmented,
    sourceKind: envelope.source.sourceKind,
    sourceId: envelope.source.id,
    sourceWindow,
    modelId: input.modelId,
    interpreter: input.interpreter,
    responseMode: input.responseMode,
  });
  const routedCandidates = materializeRoutedCandidates({
    segmented,
    routing,
  });
  const atomicRoutedCandidates = routedCandidates.routed_candidates.filter(
    (
      candidate,
    ): candidate is Extract<
      RoutedCandidateBatch["routed_candidates"][number],
      { source_route: "atomic_candidate" }
    > => candidate.source_route === "atomic_candidate",
  );
  const compositeRoutedCandidates = routedCandidates.routed_candidates.filter(
    (
      candidate,
    ): candidate is Extract<
      RoutedCandidateBatch["routed_candidates"][number],
      { source_route: "composite_candidate" }
    > => candidate.source_route === "composite_candidate",
  );

  const [atomicExtractionRaw, compositeExtraction] = await Promise.all([
    extractAtomicCandidatesBatched({
      rawEvent,
      sourceId: envelope.source.id,
      sourceWindow,
      modelId: input.modelId,
      interpreter: input.interpreter,
      routedCandidates: atomicRoutedCandidates,
      responseMode: input.responseMode,
    }),
    extractCompositeCandidatesBatched({
      rawEvent,
      sourceId: envelope.source.id,
      sourceWindow,
      modelId: input.modelId,
      interpreter: input.interpreter,
      routedCandidates: compositeRoutedCandidates,
      responseMode: input.responseMode,
    }),
  ]);

  const atomicExtraction = suppressAtomicCandidatesOwnedByComposites(
    atomicExtractionRaw,
    compositeExtraction,
  );
  const canonicalization = await canonicalizeCandidatesBatched({
    rawEvent,
    segmented,
    sourceId: envelope.source.id,
    sourceWindow,
    modelId: input.modelId,
    interpreter: input.interpreter,
    atomicBatch: atomicExtraction,
    compositeBatch: compositeExtraction,
    responseMode: input.responseMode,
  });
  const candidateNeighborsById = await buildCandidateNeighborMap({
    canonicalBatch: canonicalization,
    reconciliationNeighbors: input.reconciliationNeighbors,
    reconciliationNeighborsByCandidateId: input.reconciliationNeighborsByCandidateId,
    reconciliationNeighborProvider: input.reconciliationNeighborProvider,
  });
  const admission = await scoreAdmissionBatched({
    rawEvent,
    sourceId: envelope.source.id,
    sourceWindow,
    modelId: input.modelId,
    interpreter: input.interpreter,
    canonicalBatch: canonicalization,
    candidateNeighborsById,
    responseMode: input.responseMode,
  });
  const compositePolicy = buildCompositePolicySummary(canonicalization.canonical_candidates);
  const admittedCandidates = canonicalization.canonical_candidates.filter((candidate) => {
    const decision = admission.decisions.find(
      (entry) => entry.candidate_id === candidate.candidate_id,
    );
    return decision?.decision === "admit";
  });
  const reconciliation = await Promise.all(
    admittedCandidates.map((candidate) =>
      reconcileCandidate({
        eventId: rawEvent.event_id,
        candidate,
        neighbors: candidateNeighborsById[candidate.candidate_id] ?? [],
        sourceKind: envelope.source.sourceKind,
        sourceId: envelope.source.id,
        sourceWindow,
        modelId: input.modelId,
        interpreter: input.interpreter,
        responseMode: input.responseMode,
      }),
    ),
  );

  return {
    source: envelope.source,
    windows: [sourceWindow],
    rawEvent,
    segmented,
    routing,
    routedCandidates,
    atomicExtractionRaw,
    atomicExtraction,
    compositeExtraction,
    canonicalization,
    compositePolicy,
    admission,
    reconciliation,
    windowRuns: [
      {
        sourceWindowId: sourceWindow.id,
        rawEventId: rawEvent.event_id,
        segmentIds: segmented.segments.map((segment) => segment.segment_id),
      },
    ],
  };
}

function prefixCoreRunCandidates<
  TSource extends ModelMemorySourceRecord,
  TWindow extends MmV2SourceEnvelopeWindow,
>(
  run: MmV2CoreIngestionResult<TSource, TWindow>,
  prefix: string,
): MmV2CoreIngestionResult<TSource, TWindow> {
  return {
    ...run,
    atomicExtractionRaw: prefixAtomicExtractionBatch(run.atomicExtractionRaw, prefix),
    atomicExtraction: prefixAtomicExtractionBatch(run.atomicExtraction, prefix),
    compositeExtraction: prefixCompositeExtractionBatch(run.compositeExtraction, prefix),
    canonicalization: prefixCanonicalCandidateBatch(run.canonicalization, prefix),
    admission: prefixAdmissionBatch(run.admission, prefix),
    reconciliation: prefixReconciliationDecisions(run.reconciliation, prefix),
  };
}

function mergeCoreRuns<
  TSource extends ModelMemorySourceRecord,
  TWindow extends MmV2SourceEnvelopeWindow,
>(
  envelope: MmV2SourceEnvelope<TSource, TWindow>,
  runs: Array<MmV2CoreIngestionResult<TSource, TWindow>>,
): MmV2CoreIngestionResult<TSource, TWindow> {
  const first = runs[0];
  const eventId = first.rawEvent.event_id;
  return {
    source: envelope.source,
    windows: envelope.windows,
    rawEvent: {
      ...first.rawEvent,
      raw_text: envelope.normalizedText,
    },
    segmented: {
      schema_version: "segmented_ingest.v1",
      event_id: eventId,
      raw_text_sha256: first.segmented.raw_text_sha256,
      segments: runs.flatMap((run) => run.segmented.segments),
    },
    routing: {
      schema_version: "capture_routing.v1",
      event_id: eventId,
      routing_decisions: runs.flatMap((run) => run.routing.routing_decisions),
    },
    routedCandidates: {
      schema_version: "capture_routing.v1",
      event_id: eventId,
      routed_candidates: runs.flatMap((run) => run.routedCandidates.routed_candidates),
    },
    atomicExtractionRaw: mergeAtomicExtractionBatches(
      eventId,
      runs.map((run) => run.atomicExtractionRaw),
    ),
    atomicExtraction: mergeAtomicExtractionBatches(
      eventId,
      runs.map((run) => run.atomicExtraction),
    ),
    compositeExtraction: mergeCompositeExtractionBatches(
      eventId,
      runs.map((run) => run.compositeExtraction),
    ),
    canonicalization: mergeCanonicalCandidateBatches(
      eventId,
      runs.map((run) => run.canonicalization),
    ),
    compositePolicy: buildCompositePolicySummary(
      runs.flatMap((run) => run.canonicalization.canonical_candidates),
    ),
    admission: mergeAdmissionBatches(
      eventId,
      runs.map((run) => run.admission),
    ),
    reconciliation: runs.flatMap((run) => run.reconciliation),
    windowRuns: runs.flatMap((run) => run.windowRuns),
  };
}

export async function ingestSourceEnvelopeV2Core<
  TSource extends ModelMemorySourceRecord,
  TWindow extends MmV2SourceEnvelopeWindow,
>(
  input: MmV2SourceEnvelopeCoreIngestionInput<TSource, TWindow>,
): Promise<MmV2CoreIngestionResult<TSource, TWindow>> {
  const runs: Array<MmV2CoreIngestionResult<TSource, TWindow>> = [];
  for (const [windowIndex, sourceWindow] of input.envelope.windows.entries()) {
    const run = await ingestSourceWindowV2Core({
      ...input,
      sourceWindow,
    });
    runs.push(
      input.envelope.windows.length > 1
        ? prefixCoreRunCandidates(run, `window-${windowIndex}:`)
        : run,
    );
  }

  if (runs.length === 0) {
    throw new Error("MMV2 source envelope must include at least one window");
  }
  return runs.length === 1 ? runs[0] : mergeCoreRuns(input.envelope, runs);
}

export async function ingestDocumentV2Core(
  input: DocumentV2ShadowIngestionInput,
): Promise<DocumentV2CoreIngestionResult> {
  const envelope = adaptDocumentSource({
    ...input.document,
    sourceKind: "document",
  });
  return ingestSourceEnvelopeV2Core({
    envelope,
    rawEventSourceType: "document",
    rawEventChannel: "document_ingest_shadow",
    modelId: input.modelId,
    interpreter: input.interpreter,
    reconciliationNeighbors: input.reconciliationNeighbors,
    reconciliationNeighborsByCandidateId: input.reconciliationNeighborsByCandidateId,
    reconciliationNeighborProvider: input.reconciliationNeighborProvider,
    responseMode: input.responseMode,
  });
}

export async function ingestDocumentV2Shadow(
  input: DocumentV2ShadowIngestionInput,
): Promise<DocumentV2ShadowIngestionResult> {
  const core = await ingestDocumentV2Core(input);
  const shadowRecording = recordShadowMemoryBatch({
    eventId: core.rawEvent.event_id,
    canonicalBatch: core.canonicalization,
    admissionBatch: core.admission,
    reconciliationDecisions: core.reconciliation,
  });
  const postWriteAudit = runPostWriteAudit({
    eventId: core.rawEvent.event_id,
    ...shadowRecording,
  });

  return {
    ...core,
    shadowRecording,
    postWriteAudit,
  };
}
