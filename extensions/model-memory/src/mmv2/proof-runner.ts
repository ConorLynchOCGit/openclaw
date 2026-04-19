import type {
  SemanticInterpreter,
  SemanticInterpreterInput,
  SemanticInterpreterResult,
} from "../semantic-interpreter.ts";
import type {
  AdmissionDecision,
  AtomicCandidate,
  CanonicalCandidate,
  CaptureRoutingDecision,
  CompositeCandidate,
  ExistingMemorySummary,
  ReconciliationDecision,
  SegmentedIngestSegment,
} from "./contracts.ts";
import {
  ingestDocumentV2Shadow,
  type DocumentV2ShadowIngestionResult,
} from "./document-shadow-ingestion.ts";
import { compareAdmissionPhase } from "./proof-compare-admission.ts";
import { compareAtomicPhase } from "./proof-compare-atomic.ts";
import { compareAuditPhase } from "./proof-compare-audit.ts";
import { compareCanonicalizationPhase } from "./proof-compare-canonicalization.ts";
import { compareCompositePhase } from "./proof-compare-composite.ts";
import { compareReconciliationPhase } from "./proof-compare-reconciliation.ts";
import { compareRecordingPhase } from "./proof-compare-recording.ts";
import { compareRoutingPhase } from "./proof-compare-routing.ts";
import { compareSegmentationPhase } from "./proof-compare-segmentation.ts";
import { type MmV2PhaseComparisonResult, type MmV2PhaseName } from "./proof-compare-shared.ts";
import { compareSuppressionPhase } from "./proof-compare-suppression.ts";
import {
  MMV2_DOCUMENT_PROOF_CASES,
  type MmV2DocumentProofCase,
  type MmV2ScriptedAtomicCandidate,
  type MmV2ScriptedCanonicalCandidate,
  type MmV2ScriptedCompositeCandidate,
  type MmV2ScriptedReconciliationDecision,
} from "./proof-corpus.ts";

export type MmV2ProofCaseResult = {
  caseId: string;
  status: "pass" | "comparison_failed" | "execution_failed";
  pass: boolean;
  seededNeighborCount: number;
  mismatchCount: number;
  failedPhases: MmV2PhaseName[];
  phaseResults: MmV2PhaseComparisonResult[];
  error?: {
    kind: "runner_execution_failure";
    message: string;
  };
};

export type MmV2ProofCorpusSummary = {
  totalCases: number;
  passedCases: number;
  comparisonFailedCases: number;
  executionFailedCases: number;
  failedCases: number;
  phaseSummary: Record<
    MmV2PhaseName,
    {
      passed: number;
      failed: number;
      mismatches: number;
    }
  >;
};

export type MmV2ProofCorpusResult = {
  generatedAt: string;
  results: MmV2ProofCaseResult[];
  summary: MmV2ProofCorpusSummary;
};

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
  segments: Array<{
    segment_id: string;
    text: string;
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

export const MMV2_PROOF_PHASES: MmV2PhaseName[] = [
  "segmentation",
  "routing",
  "atomic",
  "composite",
  "suppression",
  "canonicalization",
  "admission",
  "reconciliation",
  "recording",
  "audit",
];

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
    };
  });
}

function resolveAtomicCandidates(
  scripted: MmV2ScriptedAtomicCandidate[],
  payload: AtomicPromptPayload,
): AtomicCandidate[] {
  return scripted.map((candidate) => {
    const segment = findSegmentByText(payload.segments, candidate.sourceSegmentTextIncludes);
    return {
      candidate_id: candidate.candidate_id,
      source_segment_id: segment.segment_id,
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
    const segment = findSegmentByText(payload.segments, candidate.sourceSegmentTextIncludes);
    return {
      candidate_id: candidate.candidate_id,
      source_segment_id: segment.segment_id,
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
  return {
    async interpret(input: SemanticInterpreterInput): Promise<SemanticInterpreterResult> {
      const contractVersion = input.prompt.contract.contractVersion;
      if (
        contractVersion === "mmv2-capture-routing-v1" ||
        contractVersion === "mmv2-capture-routing-repair-v1"
      ) {
        const payload = JSON.parse(input.prompt.userPrompt) as RoutingPromptPayload;
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
        const payload = JSON.parse(input.prompt.userPrompt) as AtomicPromptPayload;
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
        const payload = JSON.parse(input.prompt.userPrompt) as AtomicPromptPayload;
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
        const payload = JSON.parse(input.prompt.userPrompt) as CanonicalPromptPayload;
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
        const payload = JSON.parse(input.prompt.userPrompt) as AdmissionPromptPayload;
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
        const payload = JSON.parse(input.prompt.userPrompt) as ReconciliationPromptPayload;
        return captureOne(
          resolveReconciliationDecision(caseInput.scripted.reconciliation, payload),
        );
      }
      throw new Error(`Unsupported MMV2 proof contract version: ${contractVersion}`);
    },
  };
}

function countSeededNeighbors(proofCase: MmV2DocumentProofCase): number {
  return (
    (proofCase.seededNeighbors?.length ?? 0) +
    Object.values(proofCase.seededNeighborsByCandidateId ?? {}).reduce(
      (total, neighbors) => total + neighbors.length,
      0,
    )
  );
}

export type MmV2ProofCaseRunResult = MmV2ProofCaseResult & {
  run?: DocumentV2ShadowIngestionResult;
};

async function executeMmV2ProofCase(
  proofCase: MmV2DocumentProofCase,
): Promise<MmV2ProofCaseRunResult> {
  const interpreter = createScriptedMmV2ProofInterpreter(proofCase);
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

  const phaseResults: MmV2PhaseComparisonResult[] = [
    compareSegmentationPhase(run.segmented, proofCase.expected.segmentation),
    compareRoutingPhase(run.routing, run.segmented, proofCase.expected.routing),
    compareAtomicPhase(run.atomicExtractionRaw, run.segmented, proofCase.expected.atomic),
    compareCompositePhase(run.compositeExtraction, run.segmented, proofCase.expected.composite),
    compareSuppressionPhase(
      run.atomicExtractionRaw,
      run.atomicExtraction,
      proofCase.expected.suppression,
    ),
    compareCanonicalizationPhase(run.canonicalization, proofCase.expected.canonicalization),
    compareAdmissionPhase(run.admission, run.canonicalization, proofCase.expected.admission),
    compareReconciliationPhase(
      run.reconciliation,
      run.canonicalization,
      proofCase.expected.reconciliation,
    ),
    compareRecordingPhase(run.shadowRecording, proofCase.expected.recording),
    compareAuditPhase(run.postWriteAudit, proofCase.expected.audit),
  ];

  const mismatchCount = phaseResults.reduce((total, result) => total + result.mismatches.length, 0);
  const failedPhases = phaseResults.filter((result) => !result.pass).map((result) => result.phase);
  return {
    caseId: proofCase.id,
    status: failedPhases.length === 0 ? "pass" : "comparison_failed",
    pass: failedPhases.length === 0,
    seededNeighborCount: countSeededNeighbors(proofCase),
    mismatchCount,
    failedPhases,
    phaseResults,
    run,
  };
}

export async function runMmV2ProofCase(
  proofCase: MmV2DocumentProofCase,
): Promise<MmV2ProofCaseRunResult> {
  try {
    return await executeMmV2ProofCase(proofCase);
  } catch (error) {
    return {
      caseId: proofCase.id,
      status: "execution_failed",
      pass: false,
      seededNeighborCount: countSeededNeighbors(proofCase),
      mismatchCount: 0,
      failedPhases: [],
      phaseResults: [],
      error: {
        kind: "runner_execution_failure",
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

export async function runMmV2ProofCorpus(
  proofCases: MmV2DocumentProofCase[] = MMV2_DOCUMENT_PROOF_CASES,
): Promise<MmV2ProofCorpusResult & { resultsWithRuns: MmV2ProofCaseRunResult[] }> {
  const resultsWithRuns: MmV2ProofCaseRunResult[] = [];
  for (const proofCase of proofCases) {
    resultsWithRuns.push(await runMmV2ProofCase(proofCase));
  }

  const phaseSummary = Object.fromEntries(
    MMV2_PROOF_PHASES.map((phase) => [phase, { passed: 0, failed: 0, mismatches: 0 }]),
  ) as MmV2ProofCorpusSummary["phaseSummary"];

  for (const result of resultsWithRuns) {
    for (const phaseResult of result.phaseResults) {
      if (phaseResult.pass) {
        phaseSummary[phaseResult.phase].passed += 1;
      } else {
        phaseSummary[phaseResult.phase].failed += 1;
      }
      phaseSummary[phaseResult.phase].mismatches += phaseResult.mismatches.length;
    }
  }

  const results: MmV2ProofCaseResult[] = resultsWithRuns.map(({ run: _run, ...result }) => result);
  const passedCases = results.filter((result) => result.status === "pass").length;
  const comparisonFailedCases = results.filter(
    (result) => result.status === "comparison_failed",
  ).length;
  const executionFailedCases = results.filter(
    (result) => result.status === "execution_failed",
  ).length;
  return {
    generatedAt: new Date().toISOString(),
    results,
    resultsWithRuns,
    summary: {
      totalCases: results.length,
      passedCases,
      comparisonFailedCases,
      executionFailedCases,
      failedCases: comparisonFailedCases + executionFailedCases,
      phaseSummary,
    },
  };
}
