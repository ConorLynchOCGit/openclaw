import type { AnyAgentTool, OpenClawPluginToolContext } from "../../api.js";
import { getCanonicalCaptureMetadataByCaptureClass } from "../capture-class-metadata.js";
import { DEFAULT_MEMORY_MIDDLEWARE_AUTO_PROMOTION_CONFIG } from "../config.js";
import { withMemoryMiddlewarePgClient } from "../db/pg-pool.js";
import { type CandidateSubmissionInput, type CandidateSubmissionResult } from "../db/runtime.js";
import {
  buildCanonicalMemoryIngestionCandidateFromResolvedIngestion,
  isCanonicalizableResolvedResponseStyleIngestion,
  readCanonicalMemoryIngestionCandidateFromMetadata,
} from "../memory-canonical-compat.js";
import {
  attemptApprovedMemoryObjectCorrectionPromotion,
  resolveMemoryCorrectionPromotionPolicy,
  resolveMemoryCorrectionPlan,
} from "../memory-correction-engine.js";
import { type ResolvedCanonicalizableIngestion } from "../memory-ingestion-resolver.js";
import {
  type OrdinaryTurnAutoCaptureMatch,
  toOrdinaryTurnProjectFactMatch,
  toOrdinaryTurnRecurringProcedureMatch,
} from "../memory-ingestion-types.js";
import {
  buildPendingConfirmationMetadata,
  buildProjectFactPendingConfirmationMetadata,
  buildProjectFactSemanticMetadata,
  buildRecurringProcedurePendingConfirmationMetadata,
  buildRecurringProcedureSemanticMetadata,
  buildResponseStyleSemanticMetadata,
  buildWorkflowImprovementPendingConfirmationMetadata,
  buildWorkflowImprovementSemanticMetadata,
  shouldSkipImmediateConfirmation,
  shouldSkipImmediateProjectFactConfirmation,
  shouldSkipImmediateRecurringProcedureConfirmation,
  shouldSkipImmediateWorkflowImprovementConfirmation,
} from "../memory-lifecycle-metadata.js";
import {
  matchesSubmissionRoutingTarget,
  readSubmissionProfileId,
  readWorkflowSubmissionCaptureCategory,
} from "../memory-profile-routing.js";
import {
  parseAutoCaptureManagedCandidateContent,
  parseOrdinaryTurnAutoCapturePreference,
} from "../ordinary-turn-auto-capture.js";
import {
  inspectProjectFactLifecycle,
  isExpiredPendingProjectFactCandidate,
} from "../project-fact-lifecycle.js";
import {
  isSupportedProjectFactField,
  type ProjectFactFamily,
  type ProjectFactFieldKey,
  type ProjectFactSemanticConfidence,
} from "../project-fact-semantic.js";
import {
  inspectRecurringProcedureLifecycle,
  isExpiredPendingRecurringProcedureCandidate,
  supersedeValidatedProceduresBySubjectKey,
} from "../recurring-procedure-lifecycle.js";
import {
  type RecurringProcedureFamily,
  type RecurringProcedureKey,
  type RecurringProcedureSemanticConfidence,
} from "../recurring-procedure-semantic.js";
import {
  advanceRecurringProcedureCandidateStages,
  buildRecurringProcedureStagedInspection,
} from "../recurring-procedure-staged-substrate.js";
import {
  inspectResponseStyleLifecycle,
  isExpiredPendingResponseStyleCandidate,
} from "../response-style-lifecycle.js";
import { type ResponseStyleFamily } from "../response-style-semantic.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import { storeApprovedProjectWorkflowSemanticEmbedding } from "../semantic-retrieval-routing.js";
import { resolveCanonicalWorkflowAutoReviewProfile } from "../workflow-canonical-policy.js";
import {
  inspectWorkflowImprovementLifecycle,
  isExpiredPendingWorkflowImprovementCandidate,
  supersedeApprovedWorkflowImprovementSubjectEntries,
} from "../workflow-improvement-lifecycle.js";
import {
  type WorkflowImprovementCanonicalMatch,
  type WorkflowImprovementCaptureClass,
  type WorkflowImprovementGuidancePattern,
  type WorkflowImprovementLessonFamily,
  type WorkflowImprovementNeedCategory,
  type WorkflowImprovementSemanticConfidence,
} from "../workflow-improvement-semantic.js";
import {
  buildCandidateWriteExecutionContext,
  runCandidateWriteResolutionStages,
  runCandidateWriteResultStages,
  runWriteResolutionStages,
  submitCandidateWritePlan,
} from "../write-action-stages.js";
import {
  CandidateSubmitToolSchema,
  normalizeCandidateSubmissionInput,
  type CandidateSubmitRawParams,
} from "./candidate-submit-input.js";
import { asJsonToolResult as asJsonToolResultBase } from "./common.js";
export { normalizeCandidateSubmissionInput } from "./candidate-submit-input.js";
import { findExistingAutoCaptureManagedDuplicate } from "./candidate-submit-duplicate-guard.js";
import {
  maybeResolveExistingProjectFactCandidate,
  maybeResolveExistingRecurringProcedureCandidate,
  maybeResolveExistingResponseStyleCandidate,
  maybeResolveExistingWorkflowImprovementCandidate,
} from "./candidate-submit-existing-resolution.js";
import { normalizeManagedToolCandidateInput } from "./candidate-submit-managed-normalization.js";
import {
  resolveManagedCorrectionSubmission,
  resolveManagedProjectFactCorrection,
  resolveManagedProjectFactLearning,
  resolveManagedRecurringProcedureSubmission,
  resolveManagedResponseStyleCorrection,
  resolveManagedResponseStyleLearning,
  resolveManagedWorkflowImprovementSubmission,
  type ManagedProjectFactResolution,
  type ManagedRecurringProcedureResolution,
  type ManagedResponseStyleResolution,
  type ManagedWorkflowImprovementResolution,
} from "./candidate-submit-managed-resolution.js";
import {
  asWorkflowImprovementLessonFamily,
  buildResponseStyleCanonicalMatchFromInput,
  buildToolProjectFactAutoPromotionMetadata,
  buildToolRecurringProcedureAutoPromotionMetadata,
  buildToolResponseStyleAutoPromotionMetadata,
  buildToolWorkflowImprovementAutoPromotionMetadata,
  isExplicitRequirementCaptureClass,
  isPendingCandidateLifecycleState,
  isRecurringProcedureCorrectionCaptureClass,
  isRequirementCorrectionCaptureClass,
  isResponseStyleCanonicalTemplate,
  readAutoCaptureString,
  readNestedMetadataString,
  supportsWorkflowSemanticEmbedding,
} from "./candidate-submit-profile-helpers.js";
import {
  autoPromoteRecurringProcedureCandidateFromTool,
  inspectStagedRecurringProcedureLifecycle,
  maybeAutoPromoteToolSubmittedPreference,
  maybeAutoPromoteToolSubmittedProjectFact,
  maybeAutoPromoteToolSubmittedRecurringProcedure,
  resolveAutoPromotableFeedbackSubmission,
} from "./candidate-submit-tool-auto-promotion.js";

export async function submitCandidateFromTool(params: {
  runtime: MemoryMiddlewareRuntime;
  input: CandidateSubmissionInput;
  context?: OpenClawPluginToolContext;
}): Promise<CandidateSubmissionResult> {
  const normalizedInput = await normalizeManagedToolCandidateInput({
    deps: {
      mergeCandidateMetadata,
      buildFallbackResponseStyleResolution,
      resolveManagedCorrectionSubmission,
      resolveManagedProjectFactCorrection,
      resolveManagedResponseStyleLearning,
      resolveManagedProjectFactLearning,
      resolveManagedRecurringProcedureSubmission,
      resolveManagedWorkflowImprovementSubmission,
      resolveManagedResponseStyleCorrection,
      resolveAutoPromotableFeedbackSubmission,
    },
    runtime: params.runtime,
    input: params.input,
    context: params.context,
  });
  const executionContext = buildCandidateWriteExecutionContext({
    runtime: params.runtime,
    input: normalizedInput,
    ...(params.context ? { context: params.context } : {}),
  });
  const resolvedExisting = await runCandidateWriteResolutionStages({
    context: executionContext,
    stages: [
      {
        id: "resolve_response_style",
        match: {
          lanes: ["user_preference"],
          submissionKinds: ["learning", "correction"],
        },
        resolve: ({ runtime, input, context }) =>
          maybeResolveExistingResponseStyleCandidate({
            runtime,
            input,
            ...(context ? { context } : {}),
          }),
      },
      {
        id: "resolve_project_fact",
        match: {
          lanes: ["project_fact"],
          submissionKinds: ["learning", "correction"],
        },
        resolve: ({ runtime, input }) =>
          maybeResolveExistingProjectFactCandidate({
            runtime,
            input,
          }),
      },
      {
        id: "resolve_recurring_procedure",
        match: {
          lanes: ["recurring_procedure"],
          submissionKinds: ["procedure"],
        },
        resolve: ({ runtime, input }) =>
          maybeResolveExistingRecurringProcedureCandidate({
            runtime,
            input,
          }),
      },
      {
        id: "resolve_workflow_improvement",
        match: {
          lanes: ["workflow_guidance", "project_rule", "unmet_need"],
          submissionKinds: ["improvement"],
        },
        resolve: ({ runtime, input, context }) =>
          maybeResolveExistingWorkflowImprovementCandidate({
            runtime,
            input,
            ...(context ? { context } : {}),
          }),
      },
    ],
  });
  if (resolvedExisting) {
    return resolvedExisting;
  }
  const duplicateGuard = await runCandidateWriteResolutionStages({
    context: executionContext,
    stages: [
      {
        id: "reject_auto_capture_duplicate",
        match: {
          submissionKinds: ["learning", "correction", "improvement"],
          lanes: [
            "user_preference",
            "project_fact",
            "workflow_guidance",
            "project_rule",
            "unmet_need",
          ],
        },
        resolve: async ({ runtime, input, context }) => {
          const duplicate = await findExistingAutoCaptureManagedDuplicate({
            runtime,
            input,
            ...(context ? { context } : {}),
          });
          if (!duplicate) {
            return null;
          }
          return {
            accepted: false as const,
            status: "failed" as const,
            kind: input.kind,
            reason: `ordinary-turn auto-capture already created ${duplicate.reviewState} candidate ${duplicate.id}`,
          };
        },
      },
    ],
  });
  if (duplicateGuard) {
    return duplicateGuard;
  }
  const submitted = await submitCandidateWritePlan({
    runtime: params.runtime,
    plan: executionContext.candidateWritePlan,
  });
  return runCandidateWriteResultStages({
    context: executionContext,
    result: submitted,
    stages: [
      {
        id: "auto_promote_preference",
        match: {
          lanes: ["user_preference"],
          submissionKinds: ["learning", "correction"],
        },
        apply: ({ context, result }) =>
          maybeAutoPromoteToolSubmittedPreference({
            runtime: context.runtime,
            input: context.input,
            result,
          }),
      },
      {
        id: "auto_promote_project_fact",
        match: {
          lanes: ["project_fact"],
          submissionKinds: ["learning", "correction"],
        },
        apply: ({ context, result }) =>
          maybeAutoPromoteToolSubmittedProjectFact({
            runtime: context.runtime,
            input: context.input,
            result,
          }),
      },
      {
        id: "auto_promote_recurring_procedure",
        match: {
          lanes: ["recurring_procedure"],
          submissionKinds: ["procedure"],
        },
        apply: ({ context, result }) =>
          maybeAutoPromoteToolSubmittedRecurringProcedure({
            runtime: context.runtime,
            input: context.input,
            result,
            supersedeValidatedProceduresBySubjectKey,
          }),
      },
    ],
  });
}

function mergeCandidateMetadata(
  input: CandidateSubmissionInput,
  patch: Record<string, unknown>,
): CandidateSubmissionInput {
  return {
    ...input,
    metadata: {
      ...(input.metadata ?? {}),
      ...patch,
    },
  };
}

function resolveCanonicalIngestionModeForSubmissionKind(
  kind: CandidateSubmissionInput["kind"],
): "candidate_learning" | "candidate_correction" | "candidate_procedure" | "candidate_improvement" {
  switch (kind) {
    case "learning":
      return "candidate_learning";
    case "correction":
      return "candidate_correction";
    case "procedure":
      return "candidate_procedure";
    case "improvement":
      return "candidate_improvement";
  }
}

function mergeCanonicalResolvedIngestionMetadata(params: {
  input: CandidateSubmissionInput;
  resolution: ResolvedCanonicalizableIngestion;
  patch: Record<string, unknown>;
}): CandidateSubmissionInput {
  return mergeCandidateMetadata(params.input, {
    ...params.patch,
    canonicalIngestionCandidate: buildCanonicalMemoryIngestionCandidateFromResolvedIngestion({
      ingestion: params.resolution,
      mode: resolveCanonicalIngestionModeForSubmissionKind(params.input.kind),
      ...(params.input.projectId ? { projectId: params.input.projectId } : {}),
      captureSeam: "model_tool_primary",
      captureProfile: "tool-submitted",
      ...(params.input.agentId ? { sourceAgent: params.input.agentId } : {}),
      ...(params.input.sessionId ? { sourceSession: params.input.sessionId } : {}),
    }),
  });
}

function buildFallbackResponseStyleResolution(params: {
  parsed: OrdinaryTurnAutoCaptureMatch;
  source: "content" | "raw";
}): ManagedResponseStyleResolution | null {
  if (
    params.parsed.captureClass !== "explicit_preference" &&
    params.parsed.captureClass !== "explicit_requirement"
  ) {
    return null;
  }
  return {
    action: "capture",
    familyId: "response_style",
    compatibilityProfileId: "response_style",
    parsed: params.parsed,
    responseStyleFamily:
      params.parsed.template === "response_style_generalized_guidance"
        ? "generalized_guidance"
        : "supported_template",
    reviewMode:
      params.parsed.template === "response_style_generalized_guidance"
        ? "hold_for_more_evidence"
        : "direct",
    source: params.source,
    detectionSource: "deterministic",
    confidence: "high",
    evidence: ["managed_content_pattern_match"],
    observedText: params.source === "content" ? params.parsed.content : params.parsed.content,
  };
}

function asJsonToolResult(result: CandidateSubmissionResult) {
  return asJsonToolResultBase(result);
}

export function createCandidateSubmitTool(params: {
  runtime: MemoryMiddlewareRuntime;
  context?: OpenClawPluginToolContext;
}): AnyAgentTool {
  return {
    name: "memory_candidate_submit",
    label: "Memory Candidate Submit",
    description:
      "Submit candidate-only learnings, correction suggestions, procedure suggestions, or improvement notes into the memory middleware ingress seam without creating approved memory.",
    parameters: CandidateSubmitToolSchema,
    async execute(_toolCallId: string, rawParams: CandidateSubmitRawParams) {
      const input = normalizeCandidateSubmissionInput({
        rawParams,
        context: params.context,
      });
      const result = await submitCandidateFromTool({
        runtime: params.runtime,
        input,
        context: params.context,
      });
      return asJsonToolResult(result);
    },
  };
}
