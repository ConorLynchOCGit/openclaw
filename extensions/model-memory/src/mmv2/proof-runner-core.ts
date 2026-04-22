import { JsonModelOutputError } from "../model-execution.ts";
import type {
  DocumentV2ShadowIngestionResult,
  MmV2CoreIngestionResult,
} from "./document-shadow-ingestion.ts";
import type { MmV2ModelCallTrace } from "./model-call-trace.ts";
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
  compareWriteSimulation,
  type MmV2WritePolicyComparisonResult,
} from "./proof-compare-write-simulation.ts";
import type { MmV2DocumentProofCase } from "./proof-corpus.ts";
import { simulateWritePolicy, type MmV2WriteSimulationResult } from "./write-simulation.ts";

export type MmV2RunMode = "scripted" | "real-model";

export type MmV2ModelMetadata = {
  requestedModelId: string;
  resolvedModelIds: string[];
  provider: string | null;
  executorKind: "scripted" | "executor-backed";
};

export type MmV2Score = {
  passed: number;
  total: number;
  ratio: number;
};

export type MmV2ProofCaseResult = {
  caseId: string;
  runMode: MmV2RunMode;
  modelMetadata: MmV2ModelMetadata;
  status: "pass" | "comparison_failed" | "execution_failed";
  pass: boolean;
  seededNeighborCount: number;
  mismatchCount: number;
  failedPhases: MmV2PhaseName[];
  failedChecks: Array<MmV2PhaseName | "write_policy_realism">;
  phaseResults: MmV2PhaseComparisonResult[];
  writeSimulation: MmV2WriteSimulationResult;
  writePolicyComparison: MmV2WritePolicyComparisonResult;
  scores: {
    phaseCorrectness: MmV2Score;
    writePolicyRealism: MmV2Score;
  };
  modelCallCount?: number;
  modelCallTraces?: MmV2ModelCallTrace[];
  error?: {
    kind:
      | "runner_execution_failure"
      | "model_execution_failure"
      | "parser_schema_failure"
      | "write_simulation_failure"
      | "adjudication_failure";
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
  scores: {
    phaseCorrectness: MmV2Score;
    writePolicyRealism: MmV2Score;
  };
  writePolicySummary: {
    passedCases: number;
    failedCases: number;
    overstatementCases: number;
  };
};

export type MmV2ProofCorpusResult = {
  generatedAt: string;
  runMode: MmV2RunMode;
  modelMetadata: MmV2ModelMetadata;
  results: MmV2ProofCaseResult[];
  summary: MmV2ProofCorpusSummary;
};

export type MmV2ComparableIngestionResult = MmV2CoreIngestionResult & {
  shadowRecording: DocumentV2ShadowIngestionResult["shadowRecording"];
  postWriteAudit: DocumentV2ShadowIngestionResult["postWriteAudit"];
};

export type MmV2ProofCaseRunResult = MmV2ProofCaseResult & {
  run?: MmV2ComparableIngestionResult;
};

export type MmV2ProofReport = MmV2ProofCorpusResult & {
  commitHash: string;
  command: {
    cwd: string;
    argv: string[];
  };
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

function createScore(passed: number, total: number): MmV2Score {
  return {
    passed,
    total,
    ratio: total === 0 ? 1 : passed / total,
  };
}

export function countSeededNeighbors(proofCase: MmV2DocumentProofCase): number {
  return (
    (proofCase.seededNeighbors?.length ?? 0) +
    Object.values(proofCase.seededNeighborsByCandidateId ?? {}).reduce(
      (total, neighbors) => total + neighbors.length,
      0,
    )
  );
}

function classifyRunnerError(error: unknown): NonNullable<MmV2ProofCaseResult["error"]>["kind"] {
  if (error instanceof JsonModelOutputError) {
    return "parser_schema_failure";
  }
  if (
    error instanceof Error &&
    (error.name === "ModelMemoryLiveExecutionError" ||
      error.message.includes("requires an API key") ||
      error.message.includes("provider"))
  ) {
    return "model_execution_failure";
  }
  return "runner_execution_failure";
}

export function compareMmV2ProofRun(input: {
  proofCase: MmV2DocumentProofCase;
  runMode: MmV2RunMode;
  modelMetadata: MmV2ModelMetadata;
  run: MmV2ComparableIngestionResult;
  modelCallCount?: number;
  modelCallTraces?: MmV2ModelCallTrace[];
}): MmV2ProofCaseRunResult {
  const phaseResults: MmV2PhaseComparisonResult[] = [
    compareSegmentationPhase(input.run.segmented, input.proofCase.expected.segmentation),
    compareRoutingPhase(input.run.routing, input.run.segmented, input.proofCase.expected.routing),
    compareAtomicPhase(
      input.run.atomicExtractionRaw,
      input.run.segmented,
      input.proofCase.expected.atomic,
    ),
    compareCompositePhase(
      input.run.compositeExtraction,
      input.run.segmented,
      input.proofCase.expected.composite,
    ),
    compareSuppressionPhase(
      input.run.atomicExtractionRaw,
      input.run.atomicExtraction,
      input.proofCase.expected.suppression,
    ),
    compareCanonicalizationPhase(
      input.run.canonicalization,
      input.proofCase.expected.canonicalization,
    ),
    compareAdmissionPhase(
      input.run.admission,
      input.run.canonicalization,
      input.proofCase.expected.admission,
    ),
    compareReconciliationPhase(
      input.run.reconciliation,
      input.run.canonicalization,
      input.proofCase.expected.reconciliation,
    ),
    compareRecordingPhase(input.run.shadowRecording, input.proofCase.expected.recording),
    compareAuditPhase(input.run.postWriteAudit, input.proofCase.expected.audit),
  ];

  const writeSimulation = simulateWritePolicy({
    canonicalBatch: input.run.canonicalization,
    admissionBatch: input.run.admission,
    reconciliationDecisions: input.run.reconciliation,
    shadowRecording: input.run.shadowRecording,
  });
  const writePolicyComparison = compareWriteSimulation(
    writeSimulation,
    input.proofCase.expected.writeSimulation,
  );

  const phaseMismatchCount = phaseResults.reduce(
    (total, result) => total + result.mismatches.length,
    0,
  );
  const writePolicyMismatchCount = writePolicyComparison.mismatches.length;
  const failedPhases = phaseResults.filter((result) => !result.pass).map((result) => result.phase);
  const failedChecks: Array<MmV2PhaseName | "write_policy_realism"> = [...failedPhases];
  if (!writePolicyComparison.pass) {
    failedChecks.push("write_policy_realism");
  }

  const passedPhaseCount = phaseResults.filter((result) => result.pass).length;
  const phaseCorrectness = createScore(passedPhaseCount, phaseResults.length);
  const writePolicyRealism = createScore(writePolicyComparison.pass ? 1 : 0, 1);

  return {
    caseId: input.proofCase.id,
    runMode: input.runMode,
    modelMetadata: input.modelMetadata,
    status: failedChecks.length === 0 ? "pass" : "comparison_failed",
    pass: failedChecks.length === 0,
    seededNeighborCount: countSeededNeighbors(input.proofCase),
    mismatchCount: phaseMismatchCount + writePolicyMismatchCount,
    failedPhases,
    failedChecks,
    phaseResults,
    writeSimulation,
    writePolicyComparison,
    scores: {
      phaseCorrectness,
      writePolicyRealism,
    },
    modelCallCount: input.modelCallCount,
    modelCallTraces: input.modelCallTraces,
    run: input.run,
  };
}

export function buildMmV2ExecutionFailure(input: {
  proofCase: MmV2DocumentProofCase;
  runMode: MmV2RunMode;
  modelMetadata: MmV2ModelMetadata;
  error: unknown;
  modelCallCount?: number;
  modelCallTraces?: MmV2ModelCallTrace[];
}): MmV2ProofCaseRunResult {
  return {
    caseId: input.proofCase.id,
    runMode: input.runMode,
    modelMetadata: input.modelMetadata,
    status: "execution_failed",
    pass: false,
    seededNeighborCount: countSeededNeighbors(input.proofCase),
    mismatchCount: 0,
    failedPhases: [],
    failedChecks: [],
    phaseResults: [],
    writeSimulation: {
      candidates: [],
      summary: {
        candidateCount: 0,
        shadowDurableMemoryCount: 0,
        realisticDurableMemoryCount: 0,
        overstatementCount: 0,
        dispositionCounts: {
          create_new_memory: 0,
          logical_merge_existing: 0,
          keep_existing_noop: 0,
          create_superseding_memory: 0,
          create_conflict_record: 0,
          quarantine: 0,
          reject: 0,
          embed_only: 0,
        },
      },
    },
    writePolicyComparison: {
      pass: false,
      mismatches: [],
    },
    scores: {
      phaseCorrectness: createScore(0, 0),
      writePolicyRealism: createScore(0, 0),
    },
    modelCallCount: input.modelCallCount,
    modelCallTraces: input.modelCallTraces,
    error: {
      kind: classifyRunnerError(input.error),
      message: input.error instanceof Error ? input.error.message : String(input.error),
    },
  };
}

export function summarizeMmV2ProofResults(input: {
  generatedAt?: string;
  runMode: MmV2RunMode;
  modelMetadata: MmV2ModelMetadata;
  resultsWithRuns: MmV2ProofCaseRunResult[];
}): MmV2ProofCorpusResult {
  const phaseSummary = Object.fromEntries(
    MMV2_PROOF_PHASES.map((phase) => [phase, { passed: 0, failed: 0, mismatches: 0 }]),
  ) as MmV2ProofCorpusSummary["phaseSummary"];

  let passedPhases = 0;
  let totalPhases = 0;
  let passedWritePolicyCases = 0;
  let totalWritePolicyCases = 0;
  let overstatementCases = 0;

  for (const result of input.resultsWithRuns) {
    for (const phaseResult of result.phaseResults) {
      totalPhases += 1;
      if (phaseResult.pass) {
        passedPhases += 1;
        phaseSummary[phaseResult.phase].passed += 1;
      } else {
        phaseSummary[phaseResult.phase].failed += 1;
      }
      phaseSummary[phaseResult.phase].mismatches += phaseResult.mismatches.length;
    }

    if (result.status !== "execution_failed") {
      totalWritePolicyCases += 1;
      if (result.writePolicyComparison.pass) {
        passedWritePolicyCases += 1;
      }
      if (result.writeSimulation.summary.overstatementCount > 0) {
        overstatementCases += 1;
      }
    }
  }

  const results: MmV2ProofCaseResult[] = input.resultsWithRuns.map(
    ({ run: _run, ...result }) => result,
  );
  const passedCases = results.filter((result) => result.status === "pass").length;
  const comparisonFailedCases = results.filter(
    (result) => result.status === "comparison_failed",
  ).length;
  const executionFailedCases = results.filter(
    (result) => result.status === "execution_failed",
  ).length;

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    runMode: input.runMode,
    modelMetadata: input.modelMetadata,
    results,
    summary: {
      totalCases: results.length,
      passedCases,
      comparisonFailedCases,
      executionFailedCases,
      failedCases: comparisonFailedCases + executionFailedCases,
      phaseSummary,
      scores: {
        phaseCorrectness: createScore(passedPhases, totalPhases),
        writePolicyRealism: createScore(passedWritePolicyCases, totalWritePolicyCases),
      },
      writePolicySummary: {
        passedCases: passedWritePolicyCases,
        failedCases: totalWritePolicyCases - passedWritePolicyCases,
        overstatementCases,
      },
    },
  };
}
