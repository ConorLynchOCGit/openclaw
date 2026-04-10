import type { CandidateIngressPort } from "./candidate-ingress.js";
import type { CandidateLearningInput } from "./candidate-ingress.js";
import type { CandidatePromotionPort } from "./candidate-promotion.js";
import type { CandidateQueryPort } from "./candidate-query.js";
import type { CandidateReviewPort } from "./candidate-review.js";
import type { CompactionPlanningPort } from "./compaction-planning.js";
import type { CandidateRecord } from "./db/runtime.js";
import {
  type MemorySoakTelemetryPort,
  deriveCorpusDemandSignalsFromCompaction,
  deriveCorpusDemandSignalsFromSessionMemory,
  MEMORY_SOAK_TELEMETRY_SCHEMA_VERSION,
  resolveMemorySoakTelemetryFamilyFromMetadata,
  resolveMemorySoakTelemetryScopeFromCandidate,
} from "./memory-soak-telemetry.js";
import type { SessionMemoryPort } from "./session-memory.js";

function candidateFamily(input: CandidateLearningInput) {
  return resolveMemorySoakTelemetryFamilyFromMetadata(input.metadata);
}

function candidateScope(input: CandidateLearningInput) {
  return resolveMemorySoakTelemetryScopeFromCandidate({
    projectId: input.projectId,
    agentId: input.agentId,
    metadata: input.metadata,
  });
}

function isDeferredOverflowCandidate(
  candidate: Pick<CandidateRecord, "candidateMetadata"> | undefined,
): boolean {
  const metadata =
    candidate?.candidateMetadata &&
    typeof candidate.candidateMetadata === "object" &&
    !Array.isArray(candidate.candidateMetadata)
      ? candidate.candidateMetadata
      : undefined;
  const autoCapture =
    metadata && typeof metadata.autoCapture === "object" && !Array.isArray(metadata.autoCapture)
      ? (metadata.autoCapture as Record<string, unknown>)
      : undefined;
  const deferredOverflow =
    metadata &&
    typeof metadata.deferredOverflow === "object" &&
    !Array.isArray(metadata.deferredOverflow)
      ? (metadata.deferredOverflow as Record<string, unknown>)
      : undefined;
  return (
    autoCapture?.submissionMode === "deferred_overflow" ||
    deferredOverflow?.state === "pending_confirmation" ||
    deferredOverflow?.state === "hold_for_more_evidence"
  );
}

async function loadCandidate(
  candidateQuery: CandidateQueryPort,
  candidateId: string,
): Promise<CandidateRecord | undefined> {
  const result = await candidateQuery.get({ candidateId });
  return result.accepted ? result.candidate : undefined;
}

export function observeCandidateIngressPort(params: {
  port: CandidateIngressPort;
  telemetry: MemorySoakTelemetryPort;
}): CandidateIngressPort {
  async function observeSubmission(
    input: CandidateLearningInput,
    kind: "learning" | "correction" | "procedure" | "improvement",
    submit: (input: CandidateLearningInput) => ReturnType<CandidateIngressPort["submitLearning"]>,
  ) {
    const result = await submit(input);
    await params.telemetry.record({
      schemaVersion: MEMORY_SOAK_TELEMETRY_SCHEMA_VERSION,
      recordedAt: new Date().toISOString(),
      category: "capture",
      action: result.accepted ? "candidate_submission" : "candidate_submission_rejected",
      source: "candidate_ingress",
      submissionKind: kind,
      family: candidateFamily(input),
      scope: candidateScope(input),
      accepted: result.accepted,
      status: result.status,
      ...(result.accepted
        ? { eventId: result.eventId, memoryObjectId: result.memoryObjectId }
        : {}),
      ...(result.accepted ? {} : { reason: result.reason }),
    });
    return result;
  }

  return {
    submitLearning: (input) => observeSubmission(input, "learning", params.port.submitLearning),
    submitCorrectionSuggestion: (input) =>
      observeSubmission(input, "correction", params.port.submitCorrectionSuggestion),
    submitProcedureSuggestion: (input) =>
      observeSubmission(input, "procedure", params.port.submitProcedureSuggestion),
    submitImprovementNote: (input) =>
      observeSubmission(input, "improvement", params.port.submitImprovementNote),
  };
}

export function observeCandidateReviewPort(params: {
  port: CandidateReviewPort;
  candidateQuery: CandidateQueryPort;
  telemetry: MemorySoakTelemetryPort;
}): CandidateReviewPort {
  return {
    async review(input) {
      const candidate = await loadCandidate(params.candidateQuery, input.candidateId);
      const result = await params.port.review(input);
      await params.telemetry.record({
        schemaVersion: MEMORY_SOAK_TELEMETRY_SCHEMA_VERSION,
        recordedAt: new Date().toISOString(),
        category: "review",
        action: "candidate_review",
        source: "candidate_review",
        accepted: result.accepted,
        status: result.status,
        candidateId: input.candidateId,
        family: resolveMemorySoakTelemetryFamilyFromMetadata(candidate?.candidateMetadata),
        scope: resolveMemorySoakTelemetryScopeFromCandidate({ candidate }),
        deferredOverflowCandidate: isDeferredOverflowCandidate(candidate),
        ...(result.accepted
          ? {
              outcome: result.outcome,
              reviewState: result.reviewState,
              memoryObjectStateChanged: result.memoryObjectStateChanged,
            }
          : { reason: result.reason }),
      });
      return result;
    },
  };
}

export function observeCandidatePromotionPort(params: {
  port: CandidatePromotionPort;
  candidateQuery: CandidateQueryPort;
  telemetry: MemorySoakTelemetryPort;
}): CandidatePromotionPort {
  return {
    async promoteToMemory(input) {
      const candidate = await loadCandidate(params.candidateQuery, input.candidateId);
      const result = await params.port.promoteToMemory(input);
      await params.telemetry.record({
        schemaVersion: MEMORY_SOAK_TELEMETRY_SCHEMA_VERSION,
        recordedAt: new Date().toISOString(),
        category: "review",
        action: "candidate_promotion",
        source: "candidate_promotion",
        accepted: result.accepted,
        status: result.status,
        candidateId: input.candidateId,
        family: resolveMemorySoakTelemetryFamilyFromMetadata(candidate?.candidateMetadata),
        scope: resolveMemorySoakTelemetryScopeFromCandidate({ candidate }),
        deferredOverflowCandidate: isDeferredOverflowCandidate(candidate),
        promotionTarget: "memory",
        ...(result.accepted
          ? {
              promotedObjectId: result.promotedMemoryObjectId,
              promotedMemoryKind: result.promotedMemoryKind,
            }
          : { reason: result.reason }),
      });
      return result;
    },
    async promoteToProcedureDraft(input) {
      const candidate = await loadCandidate(params.candidateQuery, input.candidateId);
      const result = await params.port.promoteToProcedureDraft(input);
      await params.telemetry.record({
        schemaVersion: MEMORY_SOAK_TELEMETRY_SCHEMA_VERSION,
        recordedAt: new Date().toISOString(),
        category: "review",
        action: "candidate_promotion",
        source: "candidate_promotion",
        accepted: result.accepted,
        status: result.status,
        candidateId: input.candidateId,
        family: resolveMemorySoakTelemetryFamilyFromMetadata(candidate?.candidateMetadata),
        scope: resolveMemorySoakTelemetryScopeFromCandidate({ candidate }),
        deferredOverflowCandidate: isDeferredOverflowCandidate(candidate),
        promotionTarget: "procedure",
        ...(result.accepted ? { promotedObjectId: result.procedureId } : { reason: result.reason }),
      });
      return result;
    },
  };
}

export function observeSessionMemoryPort(params: {
  port: SessionMemoryPort;
  telemetry: MemorySoakTelemetryPort;
}): SessionMemoryPort {
  return {
    get: params.port.get,
    async update(input) {
      const result = await params.port.update(input);
      const importantFactsCount = input.importantFactsLearned?.length ?? 0;
      await params.telemetry.record({
        schemaVersion: MEMORY_SOAK_TELEMETRY_SCHEMA_VERSION,
        recordedAt: new Date().toISOString(),
        category: "orchestration",
        action: "session_memory_update",
        source: "session_memory",
        sessionId: input.sessionId,
        agentId: input.agentId,
        updateReason: input.updateReason,
        ...(result.accepted ? { importantFactsCount } : {}),
        demandSignals: deriveCorpusDemandSignalsFromSessionMemory({ importantFactsCount }),
      });
      return result;
    },
  };
}

export function observeCompactionPlanningPort(params: {
  port: CompactionPlanningPort;
  telemetry: MemorySoakTelemetryPort;
}): CompactionPlanningPort {
  return {
    async plan(input) {
      const result = await params.port.plan(input);
      await params.telemetry.record({
        schemaVersion: MEMORY_SOAK_TELEMETRY_SCHEMA_VERSION,
        recordedAt: new Date().toISOString(),
        category: "orchestration",
        action: "compaction_plan",
        source: "compaction_planning",
        sessionId: input.sessionId,
        agentId: input.agentId,
        ...(result.accepted
          ? {
              outcome: result.outcome,
              estimatedPromptTokens: result.estimatedPromptTokens,
              estimatedPromptTokenThreshold: result.estimatedPromptTokenThreshold,
              clearCandidateCount: result.clearCandidates.length,
              sessionMemoryStatus: result.sessionMemoryStatus,
              demandSignals: deriveCorpusDemandSignalsFromCompaction({
                estimatedPromptTokens: result.estimatedPromptTokens,
                estimatedPromptTokenThreshold: result.estimatedPromptTokenThreshold,
              }),
            }
          : {}),
      });
      return result;
    },
  };
}
