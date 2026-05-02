import type {
  SemanticInterpreter,
  SemanticInterpreterInput,
  SemanticInterpreterResult,
} from "../semantic-interpreter.ts";
import type {
  AdmissionDecision,
  AtomicCandidate,
  AtomicRoutedCandidate,
  CanonicalCandidate,
  CaptureRoutingDecision,
  CompositeRoutedCandidate,
  CompositeCandidate,
  ExistingMemorySummary,
  ReconciliationDecision,
  SegmentedIngestSegment,
} from "./contracts.ts";
import { ingestDocumentV2Shadow } from "./document-shadow-ingestion.ts";
import { captureOrdinaryTurnV2ForLiveStorage } from "./live-document-ingestion.ts";
import { runPostWriteAudit } from "./post-write-audit.ts";
import {
  MMV2_DOCUMENT_PROOF_CASES,
  type MmV2DocumentProofCase,
  type MmV2ScriptedAtomicCandidate,
  type MmV2ScriptedCanonicalCandidate,
  type MmV2ScriptedCompositeCandidate,
  type MmV2ScriptedReconciliationDecision,
} from "./proof-corpus.ts";
import {
  buildMmV2ExecutionFailure,
  compareMmV2ProofRun,
  summarizeMmV2ProofResults,
  type MmV2ModelMetadata,
  type MmV2ProofCaseRunResult,
  type MmV2ProofCorpusResult,
} from "./proof-runner-core.ts";

type RoutingPromptPayload = {
  raw_event: { event_id: string };
  segments: Array<{
    segment_id: string;
    text: string;
    detected_shape: SegmentedIngestSegment["detected_shape"];
  }>;
};

type AtomicPromptPayload = {
  raw_event: {
    event_id: string;
  };
  routed_candidates: Array<{
    segment_id: string;
    text: string;
    source_route: "atomic_candidate" | "composite_candidate";
  }>;
};

type CanonicalPromptPayload = {
  raw_event: {
    event_id: string;
    tenant_id: string;
    user_id: string;
    source_type: string;
    source_id: string;
    speaker: string;
    created_at: string;
  };
  extracted_candidates: Array<{
    candidate_id: string;
    source_segment_id: string;
    evidence_quote?: string;
    scope?: Record<string, unknown>;
  }>;
};

type AdmissionPromptPayload = {
  raw_event: {
    event_id: string;
  };
  canonical_candidates: Array<{
    candidate_id: string;
  }>;
};

type ReconciliationPromptPayload = {
  event_id: string;
  candidate: {
    candidate_id: string;
    canonical_text: string;
  };
  neighbors: ExistingMemorySummary[];
};

function captureOne(object: unknown): SemanticInterpreterResult {
  return { action: "capture", objects: [object] };
}

function findSegmentByText<T extends { text: string }>(segments: T[], textIncludes: string): T {
  const segment = segments.find((candidate) => candidate.text.includes(textIncludes));
  if (!segment) {
    throw new Error(`Unable to resolve segment by text selector: ${textIncludes}`);
  }
  return segment;
}

function resolveRoutingDecisions(
  caseInput: MmV2DocumentProofCase,
  payload: RoutingPromptPayload,
): CaptureRoutingDecision[] {
  return caseInput.scripted.routing.map((decision) => {
    const segment = findSegmentByText(payload.segments, decision.segmentTextIncludes);
    return {
      segment_id: segment.segment_id,
      route: decision.route,
      candidate_summary: decision.candidate_summary,
      memory_likelihood: decision.memory_likelihood,
      durability_likelihood: decision.durability_likelihood,
      composite_likelihood: decision.composite_likelihood,
      reason_codes: decision.reason_codes,
      evidence_quote: decision.evidence_quote,
      confidence: decision.confidence,
      allow_multiple_top_level_atomic: decision.allow_multiple_top_level_atomic === true,
    };
  });
}

function resolveAtomicCandidates(
  scripted: MmV2ScriptedAtomicCandidate[],
  payload: AtomicPromptPayload,
): AtomicCandidate[] {
  return scripted.map((candidate) => {
    const routedCandidate = findSegmentByText(
      payload.routed_candidates as AtomicRoutedCandidate[],
      candidate.sourceSegmentTextIncludes,
    );
    return {
      candidate_id: candidate.candidate_id,
      source_segment_id: routedCandidate.segment_id,
      kind: candidate.kind,
      raw_statement: candidate.raw_statement,
      normalized_statement: candidate.normalized_statement,
      evidence_quote: candidate.evidence_quote,
      source_grounding: candidate.source_grounding,
      scope: candidate.scope,
      payload: candidate.payload,
      confidence: candidate.confidence,
      risk_flags: candidate.risk_flags,
    };
  });
}

function resolveCompositeCandidates(
  scripted: MmV2ScriptedCompositeCandidate[],
  payload: AtomicPromptPayload,
): CompositeCandidate[] {
  return scripted.map((candidate) => {
    const routedCandidate = findSegmentByText(
      payload.routed_candidates as CompositeRoutedCandidate[],
      candidate.sourceSegmentTextIncludes,
    );
    return {
      candidate_id: candidate.candidate_id,
      source_segment_id: routedCandidate.segment_id,
      artifact_type: candidate.artifact_type,
      title: candidate.title,
      purpose: candidate.purpose,
      activation_triggers: candidate.activation_triggers,
      summary: candidate.summary,
      evidence_quote: candidate.evidence_quote,
      components: candidate.components,
      scope: candidate.scope,
      confidence: candidate.confidence,
      risk_flags: candidate.risk_flags,
    };
  });
}

function resolveCanonicalCandidates(
  scripted: MmV2ScriptedCanonicalCandidate[],
  payload: CanonicalPromptPayload,
): CanonicalCandidate[] {
  return scripted.map((candidate) => {
    const extractedCandidate =
      payload.extracted_candidates.find((entry) => entry.candidate_id === candidate.candidate_id) ??
      payload.extracted_candidates.find(
        (entry) => entry.evidence_quote === candidate.sourceEvidenceQuote,
      );
    if (!extractedCandidate) {
      throw new Error(`Unable to resolve extracted candidate for ${candidate.candidate_id}`);
    }
    return {
      candidate_id: candidate.candidate_id,
      unit_type: candidate.unit_type,
      kind: candidate.kind,
      artifact_type: candidate.artifact_type,
      canonical_text: candidate.canonical_text,
      search_text: candidate.search_text,
      source: {
        event_id: payload.raw_event.event_id,
        source_type: payload.raw_event.source_type,
        source_id: payload.raw_event.source_id,
        speaker: payload.raw_event.speaker,
        created_at: payload.raw_event.created_at,
        segment_id: extractedCandidate.source_segment_id,
        start_char: 0,
        end_char: candidate.sourceEvidenceQuote.length,
        evidence_quote: candidate.sourceEvidenceQuote,
      },
      scope: candidate.scope,
      validity: candidate.validity,
      payload: candidate.payload,
      parent_candidate_id: candidate.parent_candidate_id,
      component_candidate_id: candidate.component_candidate_id,
      promotion: candidate.promotion,
      confidence: candidate.confidence,
      quality: candidate.quality,
      risk_flags: candidate.risk_flags,
      content_hash: candidate.content_hash,
    };
  });
}

function resolveAdmissionDecisions(
  scripted: AdmissionDecision[],
  payload: AdmissionPromptPayload,
): AdmissionDecision[] {
  return scripted.map((decision) => {
    const candidate = payload.canonical_candidates.find(
      (entry) => entry.candidate_id === decision.candidate_id,
    );
    if (!candidate) {
      throw new Error(
        `Unable to resolve canonical candidate for admission ${decision.candidate_id}`,
      );
    }
    return {
      ...decision,
      candidate_id: candidate.candidate_id,
    };
  });
}

function resolveReconciliationDecision(
  scripted: MmV2ScriptedReconciliationDecision[] | undefined,
  payload: ReconciliationPromptPayload,
): ReconciliationDecision {
  const resolved =
    scripted?.find((decision) => decision.candidateId === payload.candidate.candidate_id) ??
    scripted?.find(
      (decision) =>
        decision.candidateCanonicalTextIncludes !== undefined &&
        payload.candidate.canonical_text.includes(decision.candidateCanonicalTextIncludes),
    );
  if (!resolved) {
    return {
      schema_version: "reconciliation_decision.v1",
      event_id: payload.event_id,
      candidate_id: payload.candidate.candidate_id,
      decision: "insert_new",
      target_memory_ids: [],
      merged_canonical_text: null,
      conflict_type: "none",
      supersedes_memory_ids: [],
      rationale: "No seeded reconciliation override supplied.",
      confidence: 0.9,
    };
  }
  return {
    schema_version: "reconciliation_decision.v1",
    event_id: payload.event_id,
    candidate_id: payload.candidate.candidate_id,
    decision: resolved.decision,
    target_memory_ids: resolved.target_memory_ids,
    merged_canonical_text: resolved.merged_canonical_text,
    conflict_type: resolved.conflict_type,
    supersedes_memory_ids: resolved.supersedes_memory_ids,
    rationale: resolved.rationale,
    confidence: resolved.confidence,
  };
}

export function createScriptedMmV2ProofInterpreter(
  caseInput: MmV2DocumentProofCase,
): SemanticInterpreter {
  const readPromptPayload = <T>(input: SemanticInterpreterInput): T => {
    if (input.prompt.promptPayload !== undefined) {
      return input.prompt.promptPayload as T;
    }
    return JSON.parse(input.prompt.userPrompt) as T;
  };

  return {
    async interpret(input: SemanticInterpreterInput): Promise<SemanticInterpreterResult> {
      const contractVersion = input.prompt.contract.contractVersion;
      if (
        contractVersion === "mmv2-capture-routing-v1" ||
        contractVersion === "mmv2-capture-routing-repair-v1"
      ) {
        const payload = readPromptPayload<RoutingPromptPayload>(input);
        return captureOne({
          schema_version: "capture_routing.v1",
          event_id: payload.raw_event.event_id,
          routing_decisions: resolveRoutingDecisions(caseInput, payload),
        });
      }
      if (
        contractVersion === "mmv2-atomic-extraction-v1" ||
        contractVersion === "mmv2-atomic-repair-v1" ||
        contractVersion === "mmv2-atomic-evidence-repair-v1"
      ) {
        const payload = readPromptPayload<AtomicPromptPayload>(input);
        return captureOne({
          schema_version: "atomic_extraction.v1",
          event_id: payload.raw_event.event_id,
          atomic_candidates: resolveAtomicCandidates(caseInput.scripted.atomic, payload),
        });
      }
      if (
        contractVersion === "mmv2-composite-extraction-v1" ||
        contractVersion === "mmv2-composite-repair-v1" ||
        contractVersion === "mmv2-composite-evidence-repair-v1"
      ) {
        const payload = readPromptPayload<AtomicPromptPayload>(input);
        return captureOne({
          schema_version: "composite_extraction.v1",
          event_id: payload.raw_event.event_id,
          composite_candidates: resolveCompositeCandidates(caseInput.scripted.composite, payload),
        });
      }
      if (
        contractVersion === "mmv2-canonicalization-v1" ||
        contractVersion === "mmv2-canonicalization-repair-v1"
      ) {
        const payload = readPromptPayload<CanonicalPromptPayload>(input);
        return captureOne({
          schema_version: "canonical_candidates.v1",
          event_id: payload.raw_event.event_id,
          canonical_candidates: resolveCanonicalCandidates(
            caseInput.scripted.canonicalization,
            payload,
          ),
        });
      }
      if (
        contractVersion === "mmv2-admission-v1" ||
        contractVersion === "mmv2-admission-repair-v1"
      ) {
        const payload = readPromptPayload<AdmissionPromptPayload>(input);
        return captureOne({
          schema_version: "admission_decision.v1",
          event_id: payload.raw_event.event_id,
          decisions: resolveAdmissionDecisions(caseInput.scripted.admission, payload),
        });
      }
      if (
        contractVersion === "mmv2-reconciliation-v1" ||
        contractVersion === "mmv2-reconciliation-repair-v1"
      ) {
        const payload = readPromptPayload<ReconciliationPromptPayload>(input);
        return captureOne(
          resolveReconciliationDecision(caseInput.scripted.reconciliation, payload),
        );
      }
      throw new Error(`Unsupported MMV2 proof contract version: ${contractVersion}`);
    },
  };
}

const SCRIPTED_MODEL_METADATA: MmV2ModelMetadata = {
  requestedModelId: "mmv2-proof-model-001",
  resolvedModelIds: ["mmv2-proof-model-001"],
  provider: null,
  executorKind: "scripted",
};

async function executeMmV2ProofCase(
  proofCase: MmV2DocumentProofCase,
): Promise<MmV2ProofCaseRunResult> {
  const interpreter = createScriptedMmV2ProofInterpreter(proofCase);
  if (proofCase.sourceKind === "ordinary_turn") {
    const ordinaryTurnResult = await captureOrdinaryTurnV2ForLiveStorage({
      capture: {
        currentTurnText: proofCase.text,
        currentTurnSpeaker: "user",
        projectId: proofCase.metadata?.tags?.includes("project-fact") ? "project-001" : undefined,
        sessionId: `mmv2-proof-${proofCase.id}`,
        sourceMetadata: {
          proof_case_id: proofCase.id,
          proof_source_kind: proofCase.sourceKind,
        },
      },
      modelId: "mmv2-proof-model-001",
      interpreter,
      reconciliationNeighbors: proofCase.seededNeighbors,
      reconciliationNeighborsByCandidateId: proofCase.seededNeighborsByCandidateId,
    });
    const shadowRecording = ordinaryTurnResult.mmv2ShadowRecording;
    return compareMmV2ProofRun({
      proofCase,
      runMode: "scripted",
      modelMetadata: SCRIPTED_MODEL_METADATA,
      run: {
        ...ordinaryTurnResult.mmv2Core,
        shadowRecording,
        postWriteAudit: runPostWriteAudit({
          eventId: ordinaryTurnResult.mmv2Core.rawEvent.event_id,
          ...shadowRecording,
        }),
      },
    });
  }

  const run = await ingestDocumentV2Shadow({
    document: {
      externalSourceId: proofCase.id,
      text: proofCase.text,
    },
    modelId: "mmv2-proof-model-001",
    interpreter,
    reconciliationNeighbors: proofCase.seededNeighbors,
    reconciliationNeighborsByCandidateId: proofCase.seededNeighborsByCandidateId,
  });
  return compareMmV2ProofRun({
    proofCase,
    runMode: "scripted",
    modelMetadata: SCRIPTED_MODEL_METADATA,
    run,
  });
}

export async function runMmV2ProofCase(
  proofCase: MmV2DocumentProofCase,
): Promise<MmV2ProofCaseRunResult> {
  try {
    return await executeMmV2ProofCase(proofCase);
  } catch (error) {
    return buildMmV2ExecutionFailure({
      proofCase,
      runMode: "scripted",
      modelMetadata: SCRIPTED_MODEL_METADATA,
      error,
    });
  }
}

export async function runMmV2ProofCorpus(
  proofCases: MmV2DocumentProofCase[] = MMV2_DOCUMENT_PROOF_CASES,
): Promise<MmV2ProofCorpusResult & { resultsWithRuns: MmV2ProofCaseRunResult[] }> {
  const resultsWithRuns: MmV2ProofCaseRunResult[] = [];
  for (const proofCase of proofCases) {
    resultsWithRuns.push(await runMmV2ProofCase(proofCase));
  }
  const summary = summarizeMmV2ProofResults({
    runMode: "scripted",
    modelMetadata: SCRIPTED_MODEL_METADATA,
    resultsWithRuns,
  });
  return {
    ...summary,
    resultsWithRuns,
  };
}
