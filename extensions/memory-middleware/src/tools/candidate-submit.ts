import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { Type } from "@sinclair/typebox";
import type { AnyAgentTool, OpenClawPluginToolContext } from "../../api.js";
import { DEFAULT_MEMORY_MIDDLEWARE_AUTO_PROMOTION_CONFIG } from "../config.js";
import { withMemoryMiddlewarePgClient } from "../db/pg-pool.js";
import {
  CANDIDATE_SUBMISSION_KINDS,
  type CandidateSubmissionInput,
  type CandidateSubmissionKind,
  type CandidateSubmissionResult,
} from "../db/runtime.js";
import {
  buildCanonicalMemoryIngestionCandidateFromResolvedIngestion,
  isCanonicalizableResolvedResponseStyleIngestion,
  readCanonicalFirstMetadataString,
} from "../memory-canonical-compat.js";
import {
  executeMemoryObjectCorrectionPlan,
  isExecutableMemoryObjectCorrectionPlan,
  resolveMemoryCorrectionPromotionPolicy,
  resolveMemoryCorrectionPlan,
} from "../memory-correction-engine.js";
import {
  getCaptureMetadataByWorkflowLessonFamily,
  getMemoryFamilyIdByWorkflowLessonFamily,
} from "../memory-family-registry.js";
import {
  resolveProjectFactIngestion,
  type ResolvedCanonicalizableIngestion,
  resolveRecurringProcedureIngestion,
  resolveResponseStyleIngestion,
  resolveWorkflowImprovementIngestion,
} from "../memory-ingestion-resolver.js";
import {
  type OrdinaryTurnAutoCaptureMatch,
  toOrdinaryTurnProjectFactMatch,
  toOrdinaryTurnRecurringProcedureMatch,
  toOrdinaryTurnResponseStyleMatch,
} from "../memory-ingestion-types.js";
import {
  parseAutoCaptureManagedCandidateContent,
  parseManagedCorrectionCandidateContent,
  parseOrdinaryTurnAutoCapturePreference,
} from "../ordinary-turn-auto-capture.js";
import {
  inspectProjectFactLifecycle,
  isExpiredPendingProjectFactCandidate,
} from "../project-fact-lifecycle.js";
import {
  detectGenericProjectFactSemanticDecision,
  detectProjectFactSemanticDecision,
  isBoundedGenericProjectFactReference,
  isSupportedProjectFactField,
  normalizeGenericProjectFactSubjectLabel,
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
  detectRecurringProcedureSemanticDecision,
  getRecurringProcedureTitle,
  type RecurringProcedureFamily,
  isSupportedRecurringProcedureKey,
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
import {
  findApprovedResponseStylePhrasePatternMatch,
  maybeInduceResponseStylePhrasePattern,
} from "../response-style-phrase-induction.js";
import {
  createResponseStyleCanonicalMatch,
  detectResponseStyleSemanticDecision,
  isResponseStyleCorrectionMatch,
  isResponseStyleLearningMatch,
  type ResponseStyleFamily,
  type ResponseStyleSemanticConfidence,
} from "../response-style-semantic.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  storeApprovedApiWorkaroundSemanticEmbedding,
  storeApprovedEnvironmentConstraintSemanticEmbedding,
  storeApprovedWorkflowToolGotchaSemanticEmbedding,
} from "../semantic-retrieval-routing.js";
import {
  inspectWorkflowImprovementLifecycle,
  isExpiredPendingWorkflowImprovementCandidate,
  supersedeApprovedWorkflowImprovementSubjectEntries,
} from "../workflow-improvement-lifecycle.js";
import {
  type WorkflowImprovementCanonicalMatch,
  type WorkflowImprovementGuidancePattern,
  type WorkflowImprovementLessonFamily,
  isSupportedWorkflowImprovementLessonKey,
  type WorkflowImprovementLessonKey,
  type WorkflowImprovementNeedCategory,
  type WorkflowImprovementSemanticConfidence,
  type WorkflowImprovementToolKey,
} from "../workflow-improvement-semantic.js";
import { maybeInduceWorkflowPhrasePattern } from "../workflow-phrase-induction.js";
import {
  runWriteResolutionStages,
  runWriteResultStages,
  submitCandidateByKind,
} from "../write-action-stages.js";
import {
  asJsonToolResult as asJsonToolResultBase,
  readContextUuid,
  readCandidateKind as readCandidateKindBase,
  readOptionalObject,
  readOptionalString as readOptionalStringBase,
  readRequiredString as readRequiredStringBase,
  type ToolRawParams,
} from "./common.js";

type CandidateSubmitRawParams = ToolRawParams;

const RESPONSE_STYLE_CONFIRMATION_MIN_AGE_MS = 5_000;
const PROJECT_FACT_CONFIRMATION_MIN_AGE_MS = 5_000;
const PROCEDURE_CONFIRMATION_MIN_AGE_MS = 5_000;
const WORKFLOW_IMPROVEMENT_CONFIRMATION_MIN_AGE_MS = 5_000;
const ENVIRONMENT_CONSTRAINT_LESSON_KEYS = new Set([
  "python_command_unavailable",
  "gateway_tools_invoke_forbidden",
]);
const WORKFLOW_TOOL_GOTCHA_SEMANTIC_LESSON_KEYS = new Set([
  "vitest_wrapper_required",
  "scripts_committer_required",
  "git_stash_unsafe",
]);
const API_WORKAROUND_SEMANTIC_LESSON_KEYS = new Set([
  "openai_embeddings_api_key_required",
  "anthropic_context1m_eligible_credential_required",
]);

function candidateKindSchema() {
  return Type.Unsafe<CandidateSubmissionKind>({
    type: "string",
    enum: [...CANDIDATE_SUBMISSION_KINDS],
    description: "Candidate submission kind: learning, correction, procedure, or improvement.",
  });
}

const CandidateSubmitToolSchema = Type.Object(
  {
    kind: candidateKindSchema(),
    content: Type.String({
      description: "Candidate-only content to submit into the memory middleware seam.",
      minLength: 1,
    }),
    sessionId: Type.Optional(
      Type.String({
        description:
          "Optional explicit memory-middleware session UUID. Omit for ordinary live submissions unless you know the backing memory session row exists.",
      }),
    ),
    projectId: Type.Optional(Type.String({ description: "Optional project id." })),
    agentId: Type.Optional(
      Type.String({
        description:
          "Optional explicit memory-middleware agent UUID. Omit for ordinary live submissions unless you know the backing memory agent row exists.",
      }),
    ),
    metadata: Type.Optional(
      Type.Object({}, { additionalProperties: true, description: "Optional candidate metadata." }),
    ),
  },
  { additionalProperties: false },
);

function readRequiredString(params: CandidateSubmitRawParams, key: string): string {
  return readRequiredStringBase(params, key);
}

function readOptionalString(params: CandidateSubmitRawParams, key: string): string | undefined {
  return readOptionalStringBase(params, key);
}

function readCandidateKind(params: CandidateSubmitRawParams): CandidateSubmissionKind {
  return readCandidateKindBase(params);
}

function readOptionalMetadata(
  params: CandidateSubmitRawParams,
): Record<string, unknown> | undefined {
  return readOptionalObject(params, "metadata");
}

export function normalizeCandidateSubmissionInput(params: {
  rawParams: CandidateSubmitRawParams;
  context?: OpenClawPluginToolContext;
}): CandidateSubmissionInput {
  const sessionId = readContextUuid(readOptionalString(params.rawParams, "sessionId"));
  const projectId = readContextUuid(readOptionalString(params.rawParams, "projectId"));
  const agentId = readContextUuid(readOptionalString(params.rawParams, "agentId"));
  const metadata = readOptionalMetadata(params.rawParams);

  return {
    kind: readCandidateKind(params.rawParams),
    content: readRequiredString(params.rawParams, "content"),
    ...(sessionId ? { sessionId } : {}),
    ...(projectId ? { projectId } : {}),
    ...(agentId ? { agentId } : {}),
    ...(metadata ? { metadata } : {}),
  };
}

function readNestedMetadataString(
  metadata: Record<string, unknown> | undefined,
  path: string[],
): string | undefined {
  return readCanonicalFirstMetadataString(metadata, path);
}

function isEnvironmentConstraintLessonKey(
  lessonKey: string | undefined,
): lessonKey is "python_command_unavailable" | "gateway_tools_invoke_forbidden" {
  return Boolean(lessonKey && ENVIRONMENT_CONSTRAINT_LESSON_KEYS.has(lessonKey));
}

function isWorkflowToolGotchaSemanticLessonKey(
  lessonKey: string | undefined,
): lessonKey is "vitest_wrapper_required" | "scripts_committer_required" | "git_stash_unsafe" {
  return Boolean(lessonKey && WORKFLOW_TOOL_GOTCHA_SEMANTIC_LESSON_KEYS.has(lessonKey));
}

function isApiWorkaroundSemanticLessonKey(
  lessonKey: string | undefined,
): lessonKey is
  | "openai_embeddings_api_key_required"
  | "anthropic_context1m_eligible_credential_required" {
  return Boolean(lessonKey && API_WORKAROUND_SEMANTIC_LESSON_KEYS.has(lessonKey));
}

function buildToolResponseStyleAutoPromotionMetadata(params: {
  input: CandidateSubmissionInput;
  autoPromotionProfile: string;
  confirmationState?: "confirmed";
}): Record<string, unknown> {
  const autoCapture = params.input.metadata?.autoCapture;
  const semanticDetection = params.input.metadata?.semanticDetection;
  return {
    autoPromotion: {
      source: "candidate_submit_auto_promotion",
      captureSeam: "model_tool_primary",
      profile: params.autoPromotionProfile,
      captureProfile: "tool-submitted",
      captureClass:
        autoCapture && typeof autoCapture === "object" && !Array.isArray(autoCapture)
          ? (autoCapture as { captureClass?: unknown }).captureClass
          : undefined,
      reasonCode:
        autoCapture && typeof autoCapture === "object" && !Array.isArray(autoCapture)
          ? (autoCapture as { reasonCode?: unknown }).reasonCode
          : undefined,
      template:
        autoCapture && typeof autoCapture === "object" && !Array.isArray(autoCapture)
          ? (autoCapture as { template?: unknown }).template
          : undefined,
      key:
        autoCapture && typeof autoCapture === "object" && !Array.isArray(autoCapture)
          ? (autoCapture as { key?: unknown }).key
          : undefined,
      subjectKey:
        autoCapture && typeof autoCapture === "object" && !Array.isArray(autoCapture)
          ? (autoCapture as { subjectKey?: unknown }).subjectKey
          : undefined,
      subject:
        autoCapture && typeof autoCapture === "object" && !Array.isArray(autoCapture)
          ? (autoCapture as { subject?: unknown }).subject
          : undefined,
      normalizedSubject:
        autoCapture && typeof autoCapture === "object" && !Array.isArray(autoCapture)
          ? (autoCapture as { normalizedSubject?: unknown }).normalizedSubject
          : undefined,
      value:
        autoCapture && typeof autoCapture === "object" && !Array.isArray(autoCapture)
          ? (autoCapture as { value?: unknown }).value
          : undefined,
      normalizedValue:
        autoCapture && typeof autoCapture === "object" && !Array.isArray(autoCapture)
          ? (autoCapture as { normalizedValue?: unknown }).normalizedValue
          : undefined,
      responseStyleFamily:
        autoCapture && typeof autoCapture === "object" && !Array.isArray(autoCapture)
          ? (autoCapture as { responseStyleFamily?: unknown }).responseStyleFamily
          : undefined,
      toolName: "memory_candidate_submit",
    },
    ...(semanticDetection &&
    typeof semanticDetection === "object" &&
    !Array.isArray(semanticDetection)
      ? { semanticDetection }
      : {}),
    ...(params.confirmationState
      ? {
          candidateConfirmation: {
            state: params.confirmationState,
            method: "repeat_subject_signal",
            confirmationEvidenceCount: 2,
          },
        }
      : {}),
  };
}

async function maybeResolveExistingResponseStyleCandidate(params: {
  runtime: MemoryMiddlewareRuntime;
  input: CandidateSubmissionInput;
  context?: OpenClawPluginToolContext;
}): Promise<CandidateSubmissionResult | null> {
  if (params.input.kind !== "learning" && params.input.kind !== "correction") {
    return null;
  }
  const template = readNestedMetadataString(params.input.metadata, ["autoCapture", "template"]);
  const responseStyleFamily =
    (readNestedMetadataString(params.input.metadata, [
      "autoCapture",
      "responseStyleFamily",
    ]) as ResponseStyleFamily | null) ?? "supported_template";
  const key = readNestedMetadataString(params.input.metadata, ["autoCapture", "key"]);
  const subjectKey = readNestedMetadataString(params.input.metadata, ["autoCapture", "subjectKey"]);
  const confirmationState = readNestedMetadataString(params.input.metadata, [
    "candidateLifecycle",
    "state",
  ]);
  const confidence =
    readNestedMetadataString(params.input.metadata, ["semanticDetection", "confidence"]) ?? "high";
  if (
    !template ||
    !key ||
    !subjectKey ||
    (template !== "responses_concise" &&
      template !== "responses_bullets" &&
      template !== "responses_plain_english" &&
      template !== "responses_no_tables" &&
      template !== "responses_numbered_steps" &&
      template !== "response_style_generalized_guidance")
  ) {
    return null;
  }

  const inspection = await inspectResponseStyleLifecycle({
    config: params.runtime.config,
    key,
    subjectKey,
  });
  if (!inspection) {
    return null;
  }

  if (
    inspection.pendingCandidate &&
    isExpiredPendingResponseStyleCandidate(inspection.pendingCandidate)
  ) {
    await params.runtime.candidateReview.review({
      candidateId: inspection.pendingCandidate.id,
      outcome: "rejected",
      rationale:
        "response-style candidate confirmation window expired without later confirming evidence",
      metadata: {
        source: "candidate_submit_response_style_confirmation",
        candidateLifecycle: {
          family: "response_style",
          state: "rejected",
          subjectKey,
        },
      },
    });
  }

  const observedText =
    (typeof params.input.metadata?.raw === "string" && params.input.metadata.raw.trim()) ||
    params.input.content;
  const canonicalMatch = buildResponseStyleCanonicalMatchFromInput(params.input);

  if (inspection.matchingApprovedObjectId) {
    if (observedText && canonicalMatch) {
      await maybeInduceResponseStylePhrasePattern({
        config: params.runtime.config,
        candidateIngress: params.runtime.candidateIngress,
        candidateReview: params.runtime.candidateReview,
        candidatePromotion: params.runtime.candidatePromotion,
        text: observedText,
        ...(params.input.projectId ? { projectId: params.input.projectId } : {}),
        ...(params.input.sessionId
          ? { sessionId: params.input.sessionId }
          : params.context?.sessionId
            ? { sessionId: params.context.sessionId }
            : {}),
        ...(params.input.agentId
          ? { agentId: params.input.agentId }
          : params.context?.agentId
            ? { agentId: params.context.agentId }
            : {}),
        detectionSource:
          readNestedMetadataString(params.input.metadata, [
            "semanticDetection",
            "detectionSource",
          ]) === "deterministic"
            ? "deterministic"
            : "semantic",
        targetMatch: canonicalMatch,
        source: "response_style_phrase_induction_candidate_submit",
      });
    }
    return {
      accepted: false,
      status: "failed",
      kind: params.input.kind,
      reason: `approved response-style memory already exists for key ${key}`,
    };
  }

  if (
    inspection.pendingCandidate &&
    !isExpiredPendingResponseStyleCandidate(inspection.pendingCandidate)
  ) {
    if (shouldSkipImmediateConfirmation(inspection.pendingCandidate.createdAt)) {
      return {
        accepted: false,
        status: "failed",
        kind: params.input.kind,
        reason: `response-style confirmation candidate ${inspection.pendingCandidate.id} already exists`,
      };
    }
    const autoPromotion =
      params.runtime.config.autoPromotion ?? DEFAULT_MEMORY_MIDDLEWARE_AUTO_PROMOTION_CONFIG;
    if (autoPromotion.profile !== "explicit-user-preference-v1") {
      return {
        accepted: false,
        status: "failed",
        kind: params.input.kind,
        reason: `response-style confirmation candidate ${inspection.pendingCandidate.id} is waiting for later evidence`,
      };
    }
    if (params.input.kind === "correction" && inspection.pendingSubjectCandidateIds.length > 0) {
      for (const candidateId of inspection.pendingSubjectCandidateIds) {
        if (candidateId === inspection.pendingCandidate.id) {
          continue;
        }
        await params.runtime.candidateReview.review({
          candidateId,
          outcome: "rejected",
          rationale: "high-confidence response-style correction superseded pending candidate state",
          metadata: {
            source: "candidate_submit_response_style_confirmation",
            candidateLifecycle: {
              family: "response_style",
              state: "rejected",
              subjectKey,
            },
          },
        });
      }
    }
    if (
      !(
        responseStyleFamily === "generalized_guidance" &&
        confirmationState === "hold_for_more_evidence"
      ) &&
      confirmationState !== "pending_confirmation" &&
      confidence !== "high"
    ) {
      return null;
    }
    const promotionMetadata = buildToolResponseStyleAutoPromotionMetadata({
      input: params.input,
      autoPromotionProfile: "response_style_confirmation_v1",
      confirmationState: "confirmed",
    });
    const reviewResult = await params.runtime.candidateReview.review({
      candidateId: inspection.pendingCandidate.id,
      outcome: "accepted",
      metadata: promotionMetadata,
    });
    if (!reviewResult.accepted) {
      return {
        accepted: false,
        status: "failed",
        kind: params.input.kind,
        reason: reviewResult.reason,
      };
    }
    const promotionResult = await params.runtime.candidatePromotion.promoteToMemory({
      candidateId: inspection.pendingCandidate.id,
      metadata: promotionMetadata,
    });
    if (!promotionResult.accepted) {
      return {
        accepted: false,
        status: "failed",
        kind: params.input.kind,
        reason: promotionResult.reason,
      };
    }
    if (observedText && canonicalMatch && promotionResult.promotedMemoryObjectId) {
      await maybeInduceResponseStylePhrasePattern({
        config: params.runtime.config,
        candidateIngress: params.runtime.candidateIngress,
        candidateReview: params.runtime.candidateReview,
        candidatePromotion: params.runtime.candidatePromotion,
        text: observedText,
        ...(params.input.projectId ? { projectId: params.input.projectId } : {}),
        ...(params.input.sessionId
          ? { sessionId: params.input.sessionId }
          : params.context?.sessionId
            ? { sessionId: params.context.sessionId }
            : {}),
        ...(params.input.agentId
          ? { agentId: params.input.agentId }
          : params.context?.agentId
            ? { agentId: params.context.agentId }
            : {}),
        detectionSource:
          readNestedMetadataString(params.input.metadata, [
            "semanticDetection",
            "detectionSource",
          ]) === "deterministic"
            ? "deterministic"
            : "semantic",
        targetMatch: canonicalMatch,
        source: "response_style_phrase_induction_candidate_submit",
      });
    }
    return {
      accepted: true,
      status: "accepted",
      kind: params.input.kind,
      storage: "database",
      reviewState: "approved",
      eventId: promotionResult.sourceEventId ?? inspection.pendingCandidate.sourceEventId,
      memoryObjectId: promotionResult.promotedMemoryObjectId,
    };
  }

  return null;
}

function buildToolProjectFactAutoPromotionMetadata(params: {
  input: CandidateSubmissionInput;
  autoPromotionProfile: string;
  confirmationState?: "confirmed";
  confirmationMethod?: "repeat_subject_signal" | "generalized_cluster_auto_review";
}): Record<string, unknown> {
  const autoCapture = params.input.metadata?.autoCapture;
  const semanticDetection = params.input.metadata?.semanticDetection;
  return {
    autoPromotion: {
      source: "candidate_submit_auto_promotion",
      captureSeam: "model_tool_primary",
      profile: params.autoPromotionProfile,
      captureProfile:
        autoCapture && typeof autoCapture === "object" && !Array.isArray(autoCapture)
          ? (autoCapture as { profile?: unknown }).profile
          : undefined,
      captureClass:
        autoCapture && typeof autoCapture === "object" && !Array.isArray(autoCapture)
          ? (autoCapture as { captureClass?: unknown }).captureClass
          : undefined,
      reasonCode:
        autoCapture && typeof autoCapture === "object" && !Array.isArray(autoCapture)
          ? (autoCapture as { reasonCode?: unknown }).reasonCode
          : undefined,
      factFamily:
        autoCapture && typeof autoCapture === "object" && !Array.isArray(autoCapture)
          ? (autoCapture as { factFamily?: unknown }).factFamily
          : undefined,
      fieldKey:
        autoCapture && typeof autoCapture === "object" && !Array.isArray(autoCapture)
          ? (autoCapture as { fieldKey?: unknown }).fieldKey
          : undefined,
      key:
        autoCapture && typeof autoCapture === "object" && !Array.isArray(autoCapture)
          ? (autoCapture as { key?: unknown }).key
          : undefined,
      subjectKey:
        autoCapture && typeof autoCapture === "object" && !Array.isArray(autoCapture)
          ? (autoCapture as { subjectKey?: unknown }).subjectKey
          : undefined,
      projectScope:
        autoCapture && typeof autoCapture === "object" && !Array.isArray(autoCapture)
          ? (autoCapture as { projectScope?: unknown }).projectScope
          : undefined,
      normalizedProjectScope:
        autoCapture && typeof autoCapture === "object" && !Array.isArray(autoCapture)
          ? (autoCapture as { normalizedProjectScope?: unknown }).normalizedProjectScope
          : undefined,
      subject:
        autoCapture && typeof autoCapture === "object" && !Array.isArray(autoCapture)
          ? (autoCapture as { subject?: unknown }).subject
          : undefined,
      normalizedSubject:
        autoCapture && typeof autoCapture === "object" && !Array.isArray(autoCapture)
          ? (autoCapture as { normalizedSubject?: unknown }).normalizedSubject
          : undefined,
      value:
        autoCapture && typeof autoCapture === "object" && !Array.isArray(autoCapture)
          ? (autoCapture as { value?: unknown }).value
          : undefined,
      normalizedValue:
        autoCapture && typeof autoCapture === "object" && !Array.isArray(autoCapture)
          ? (autoCapture as { normalizedValue?: unknown }).normalizedValue
          : undefined,
      toolName: "memory_candidate_submit",
    },
    ...(semanticDetection &&
    typeof semanticDetection === "object" &&
    !Array.isArray(semanticDetection)
      ? { semanticDetection }
      : {}),
    ...(params.confirmationState
      ? {
          candidateConfirmation: {
            state: params.confirmationState,
            method: params.confirmationMethod ?? "repeat_subject_signal",
            confirmationEvidenceCount: 2,
            ...(params.confirmationMethod === "generalized_cluster_auto_review"
              ? {
                  clusterKey:
                    autoCapture && typeof autoCapture === "object" && !Array.isArray(autoCapture)
                      ? (autoCapture as { key?: unknown }).key
                      : undefined,
                }
              : {}),
          },
        }
      : {}),
  };
}

function buildToolRecurringProcedureAutoPromotionMetadata(params: {
  input: CandidateSubmissionInput;
  autoPromotionProfile: string;
  confirmationState?: "confirmed";
}): Record<string, unknown> {
  const autoCapture = params.input.metadata?.autoCapture;
  const semanticDetection = params.input.metadata?.semanticDetection;
  return {
    autoPromotion: {
      source: "candidate_submit_auto_promotion",
      captureSeam: "model_tool_primary",
      profile: params.autoPromotionProfile,
      captureProfile: "tool-submitted",
      captureClass:
        autoCapture && typeof autoCapture === "object" && !Array.isArray(autoCapture)
          ? (autoCapture as { captureClass?: unknown }).captureClass
          : undefined,
      reasonCode:
        autoCapture && typeof autoCapture === "object" && !Array.isArray(autoCapture)
          ? (autoCapture as { reasonCode?: unknown }).reasonCode
          : undefined,
      procedureFamily:
        autoCapture && typeof autoCapture === "object" && !Array.isArray(autoCapture)
          ? (autoCapture as { procedureFamily?: unknown }).procedureFamily
          : undefined,
      procedureKey:
        autoCapture && typeof autoCapture === "object" && !Array.isArray(autoCapture)
          ? (autoCapture as { procedureKey?: unknown }).procedureKey
          : undefined,
      key:
        autoCapture && typeof autoCapture === "object" && !Array.isArray(autoCapture)
          ? (autoCapture as { key?: unknown }).key
          : undefined,
      subjectKey:
        autoCapture && typeof autoCapture === "object" && !Array.isArray(autoCapture)
          ? (autoCapture as { subjectKey?: unknown }).subjectKey
          : undefined,
      subject:
        autoCapture && typeof autoCapture === "object" && !Array.isArray(autoCapture)
          ? (autoCapture as { subject?: unknown }).subject
          : undefined,
      normalizedSubject:
        autoCapture && typeof autoCapture === "object" && !Array.isArray(autoCapture)
          ? (autoCapture as { normalizedSubject?: unknown }).normalizedSubject
          : undefined,
      title:
        autoCapture && typeof autoCapture === "object" && !Array.isArray(autoCapture)
          ? (autoCapture as { title?: unknown }).title
          : undefined,
      steps:
        autoCapture && typeof autoCapture === "object" && !Array.isArray(autoCapture)
          ? (autoCapture as { steps?: unknown }).steps
          : undefined,
      value:
        autoCapture && typeof autoCapture === "object" && !Array.isArray(autoCapture)
          ? (autoCapture as { value?: unknown }).value
          : undefined,
      normalizedValue:
        autoCapture && typeof autoCapture === "object" && !Array.isArray(autoCapture)
          ? (autoCapture as { normalizedValue?: unknown }).normalizedValue
          : undefined,
      toolName: "memory_candidate_submit",
    },
    ...(semanticDetection &&
    typeof semanticDetection === "object" &&
    !Array.isArray(semanticDetection)
      ? { semanticDetection }
      : {}),
    ...(params.confirmationState
      ? {
          candidateConfirmation: {
            state: params.confirmationState,
            method: "repeat_subject_signal",
            confirmationEvidenceCount: 2,
          },
        }
      : {}),
  };
}

function buildToolWorkflowImprovementAutoPromotionMetadata(params: {
  input: CandidateSubmissionInput;
  autoPromotionProfile: string;
  confirmationState?: "confirmed";
  autoReview?: {
    outcome: "approve" | "supersede_existing";
    contradictionCount: number;
    supersedeTargetIds: string[];
    rejectedCandidateIds: string[];
  };
}): Record<string, unknown> {
  const autoCapture = params.input.metadata?.autoCapture;
  const semanticDetection = params.input.metadata?.semanticDetection;
  const clusterKey =
    autoCapture && typeof autoCapture === "object" && !Array.isArray(autoCapture)
      ? (autoCapture as { key?: unknown }).key
      : undefined;
  return {
    autoPromotion: {
      source: "candidate_submit_auto_promotion",
      captureSeam: "model_tool_primary",
      profile: params.autoPromotionProfile,
      captureProfile: "tool-submitted",
      captureClass:
        autoCapture && typeof autoCapture === "object" && !Array.isArray(autoCapture)
          ? (autoCapture as { captureClass?: unknown }).captureClass
          : undefined,
      reasonCode:
        autoCapture && typeof autoCapture === "object" && !Array.isArray(autoCapture)
          ? (autoCapture as { reasonCode?: unknown }).reasonCode
          : undefined,
      lessonFamily:
        autoCapture && typeof autoCapture === "object" && !Array.isArray(autoCapture)
          ? (autoCapture as { lessonFamily?: unknown }).lessonFamily
          : undefined,
      lessonKey:
        autoCapture && typeof autoCapture === "object" && !Array.isArray(autoCapture)
          ? (autoCapture as { lessonKey?: unknown }).lessonKey
          : undefined,
      toolKey:
        autoCapture && typeof autoCapture === "object" && !Array.isArray(autoCapture)
          ? (autoCapture as { toolKey?: unknown }).toolKey
          : undefined,
      key:
        autoCapture && typeof autoCapture === "object" && !Array.isArray(autoCapture)
          ? (autoCapture as { key?: unknown }).key
          : undefined,
      subjectKey:
        autoCapture && typeof autoCapture === "object" && !Array.isArray(autoCapture)
          ? (autoCapture as { subjectKey?: unknown }).subjectKey
          : undefined,
      subject:
        autoCapture && typeof autoCapture === "object" && !Array.isArray(autoCapture)
          ? (autoCapture as { subject?: unknown }).subject
          : undefined,
      projectScope:
        autoCapture && typeof autoCapture === "object" && !Array.isArray(autoCapture)
          ? (autoCapture as { projectScope?: unknown }).projectScope
          : undefined,
      normalizedProjectScope:
        autoCapture && typeof autoCapture === "object" && !Array.isArray(autoCapture)
          ? (autoCapture as { normalizedProjectScope?: unknown }).normalizedProjectScope
          : undefined,
      normalizedSubject:
        autoCapture && typeof autoCapture === "object" && !Array.isArray(autoCapture)
          ? (autoCapture as { normalizedSubject?: unknown }).normalizedSubject
          : undefined,
      value:
        autoCapture && typeof autoCapture === "object" && !Array.isArray(autoCapture)
          ? (autoCapture as { value?: unknown }).value
          : undefined,
      normalizedValue:
        autoCapture && typeof autoCapture === "object" && !Array.isArray(autoCapture)
          ? (autoCapture as { normalizedValue?: unknown }).normalizedValue
          : undefined,
      guidancePattern:
        autoCapture && typeof autoCapture === "object" && !Array.isArray(autoCapture)
          ? (autoCapture as { guidancePattern?: unknown }).guidancePattern
          : undefined,
      needCategory:
        autoCapture && typeof autoCapture === "object" && !Array.isArray(autoCapture)
          ? (autoCapture as { needCategory?: unknown }).needCategory
          : undefined,
      neededCapability:
        autoCapture && typeof autoCapture === "object" && !Array.isArray(autoCapture)
          ? (autoCapture as { neededCapability?: unknown }).neededCapability
          : undefined,
      normalizedNeededCapability:
        autoCapture && typeof autoCapture === "object" && !Array.isArray(autoCapture)
          ? (autoCapture as { normalizedNeededCapability?: unknown }).normalizedNeededCapability
          : undefined,
      recommendedAction:
        autoCapture && typeof autoCapture === "object" && !Array.isArray(autoCapture)
          ? (autoCapture as { recommendedAction?: unknown }).recommendedAction
          : undefined,
      normalizedRecommendedAction:
        autoCapture && typeof autoCapture === "object" && !Array.isArray(autoCapture)
          ? (autoCapture as { normalizedRecommendedAction?: unknown }).normalizedRecommendedAction
          : undefined,
      avoidAction:
        autoCapture && typeof autoCapture === "object" && !Array.isArray(autoCapture)
          ? (autoCapture as { avoidAction?: unknown }).avoidAction
          : undefined,
      normalizedAvoidAction:
        autoCapture && typeof autoCapture === "object" && !Array.isArray(autoCapture)
          ? (autoCapture as { normalizedAvoidAction?: unknown }).normalizedAvoidAction
          : undefined,
      rationale:
        autoCapture && typeof autoCapture === "object" && !Array.isArray(autoCapture)
          ? (autoCapture as { rationale?: unknown }).rationale
          : undefined,
      normalizedRationale:
        autoCapture && typeof autoCapture === "object" && !Array.isArray(autoCapture)
          ? (autoCapture as { normalizedRationale?: unknown }).normalizedRationale
          : undefined,
      ...(autoCapture &&
      typeof autoCapture === "object" &&
      !Array.isArray(autoCapture) &&
      (autoCapture as { lessonFamily?: unknown }).lessonFamily === "generalized_unmet_need"
        ? { recommendationMode: "recommendation_only" }
        : { guidanceMode: "guidance_only" }),
      toolName: "memory_candidate_submit",
    },
    ...(semanticDetection &&
    typeof semanticDetection === "object" &&
    !Array.isArray(semanticDetection)
      ? { semanticDetection }
      : {}),
    ...(params.confirmationState
      ? {
          candidateConfirmation: {
            state: params.confirmationState,
            method: params.autoReview ? "generalized_cluster_auto_review" : "repeat_subject_signal",
            confirmationEvidenceCount: 2,
            ...(typeof params.autoReview?.contradictionCount === "number"
              ? { contradictionCount: params.autoReview.contradictionCount }
              : {}),
            ...(typeof clusterKey === "string" && clusterKey.trim().length > 0
              ? { clusterKey: clusterKey.trim() }
              : {}),
          },
        }
      : {}),
    ...(params.autoReview
      ? {
          workflowAutoReview: {
            family: "workflow_improvement",
            outcome: params.autoReview.outcome,
            contradictionCount: params.autoReview.contradictionCount,
            supersedeTargetIds: params.autoReview.supersedeTargetIds,
            rejectedCandidateIds: params.autoReview.rejectedCandidateIds,
            ...(typeof clusterKey === "string" && clusterKey.trim().length > 0
              ? { clusterKey: clusterKey.trim() }
              : {}),
          },
        }
      : {}),
  };
}

async function maybeResolveExistingProjectFactCandidate(params: {
  runtime: MemoryMiddlewareRuntime;
  input: CandidateSubmissionInput;
}): Promise<CandidateSubmissionResult | null> {
  if (params.input.kind !== "learning" && params.input.kind !== "correction") {
    return null;
  }
  const template = readNestedMetadataString(params.input.metadata, ["autoCapture", "template"]);
  const key = readNestedMetadataString(params.input.metadata, ["autoCapture", "key"]);
  const subjectKey = readNestedMetadataString(params.input.metadata, ["autoCapture", "subjectKey"]);
  const normalizedValue =
    readNestedMetadataString(params.input.metadata, ["autoCapture", "normalizedValue"]) ??
    readNestedMetadataString(params.input.metadata, ["autoCapture", "value"]);
  const factFamily =
    readNestedMetadataString(params.input.metadata, ["autoCapture", "factFamily"]) ??
    (readNestedMetadataString(params.input.metadata, ["autoCapture", "fieldKey"])
      ? "supported_field"
      : undefined);
  const fieldKey = readNestedMetadataString(params.input.metadata, ["autoCapture", "fieldKey"]);
  if (
    (template !== "project_fact_named_scope" &&
      template !== "project_fact_generalized_named_scope") ||
    !key ||
    !subjectKey ||
    !factFamily ||
    (fieldKey && !isSupportedProjectFactField(fieldKey))
  ) {
    return null;
  }

  const inspection = await inspectProjectFactLifecycle({
    config: params.runtime.config,
    key,
    subjectKey,
    ...(params.input.projectId ? { projectId: params.input.projectId } : {}),
  });
  if (!inspection) {
    return null;
  }

  const matchingPendingCandidate =
    inspection.pendingCandidate ??
    inspection.pendingSubjectCandidates.find(
      (candidate) =>
        candidate.reviewState === "candidate" &&
        (candidate.factFamily ?? (candidate.fieldKey ? "supported_field" : undefined)) ===
          factFamily &&
        (!fieldKey || candidate.fieldKey === fieldKey) &&
        normalizedValue !== undefined &&
        candidate.normalizedValue === normalizedValue,
    );

  if (matchingPendingCandidate && isExpiredPendingProjectFactCandidate(matchingPendingCandidate)) {
    await params.runtime.candidateReview.review({
      candidateId: matchingPendingCandidate.id,
      outcome: "rejected",
      rationale:
        "project-fact candidate confirmation window expired without later confirming evidence",
      metadata: {
        source: "candidate_submit_project_fact_confirmation",
        candidateLifecycle: {
          family: "project_fact",
          state: "rejected",
          subjectKey,
          factFamily,
          ...(fieldKey ? { fieldKey } : {}),
        },
      },
    });
  }

  if (inspection.matchingApprovedObjectId && params.input.kind === "learning") {
    return {
      accepted: false,
      status: "failed",
      kind: params.input.kind,
      reason: `approved project fact already exists for key ${key}`,
    };
  }

  if (matchingPendingCandidate && !isExpiredPendingProjectFactCandidate(matchingPendingCandidate)) {
    if (shouldSkipImmediateProjectFactConfirmation(matchingPendingCandidate.createdAt)) {
      return {
        accepted: false,
        status: "failed",
        kind: params.input.kind,
        reason: `project-fact confirmation candidate ${matchingPendingCandidate.id} already exists`,
      };
    }
    const autoPromotion =
      params.runtime.config.autoPromotion ?? DEFAULT_MEMORY_MIDDLEWARE_AUTO_PROMOTION_CONFIG;
    if (autoPromotion.profile !== "explicit-user-preference-v1") {
      return {
        accepted: false,
        status: "failed",
        kind: params.input.kind,
        reason: `project-fact confirmation candidate ${matchingPendingCandidate.id} is waiting for later evidence`,
      };
    }
    const promotionMetadata = buildToolProjectFactAutoPromotionMetadata({
      input: params.input,
      autoPromotionProfile:
        factFamily === "generalized_reference"
          ? "project_fact_generalized_confirmation_v1"
          : "project_fact_confirmation_v1",
      confirmationState: "confirmed",
      confirmationMethod:
        factFamily === "generalized_reference"
          ? "generalized_cluster_auto_review"
          : "repeat_subject_signal",
    });
    const reviewResult = await params.runtime.candidateReview.review({
      candidateId: matchingPendingCandidate.id,
      outcome: "accepted",
      metadata: promotionMetadata,
    });
    if (!reviewResult.accepted) {
      return {
        accepted: false,
        status: "failed",
        kind: params.input.kind,
        reason: reviewResult.reason,
      };
    }
    const promotionResult = await params.runtime.candidatePromotion.promoteToMemory({
      candidateId: matchingPendingCandidate.id,
      metadata: promotionMetadata,
    });
    if (!promotionResult.accepted) {
      return {
        accepted: false,
        status: "failed",
        kind: params.input.kind,
        reason: promotionResult.reason,
      };
    }
    return {
      accepted: true,
      status: "accepted",
      kind: params.input.kind,
      storage: "database",
      reviewState: "approved",
      eventId: promotionResult.sourceEventId ?? matchingPendingCandidate.sourceEventId,
      memoryObjectId: promotionResult.promotedMemoryObjectId,
    };
  }

  if (
    params.input.kind === "learning" &&
    factFamily === "generalized_reference" &&
    inspection.activeApprovedSubjectObjectIds.length > 0 &&
    !inspection.matchingApprovedObjectId
  ) {
    return {
      accepted: false,
      status: "failed",
      kind: params.input.kind,
      reason: `conflicting approved generic project fact already exists for subject ${subjectKey}; use correction phrasing to replace it`,
    };
  }

  return null;
}

async function autoPromoteRecurringProcedureCandidateFromTool(params: {
  runtime: MemoryMiddlewareRuntime;
  candidateId: string;
  input: CandidateSubmissionInput;
  title: string;
  subjectKey: string;
  procedureFamily: RecurringProcedureFamily;
  procedureKey?: RecurringProcedureKey;
  correctionPlan?: ReturnType<typeof resolveMemoryCorrectionPlan> | null;
  confirmationState?: "confirmed";
}): Promise<CandidateSubmissionResult> {
  const promotionMetadata = buildToolRecurringProcedureAutoPromotionMetadata({
    input: params.input,
    autoPromotionProfile: params.confirmationState
      ? params.procedureFamily === "generalized_named_checklist"
        ? "recurring_procedure_generalized_confirmation_v1"
        : "recurring_procedure_confirmation_v1"
      : params.correctionPlan?.status === "execute" &&
          params.correctionPlan.executionKind === "validated_procedure_supersede"
        ? params.procedureFamily === "generalized_named_checklist"
          ? "recurring_procedure_generalized_correction_v1"
          : "recurring_procedure_correction_v1"
        : "recurring_procedure_direct_v1",
    ...(params.confirmationState ? { confirmationState: params.confirmationState } : {}),
  });
  const transition = await advanceRecurringProcedureCandidateStages({
    config: params.runtime.config,
    candidateId: params.candidateId,
    title: params.title,
    subjectKey: params.subjectKey,
    correctionPlan: params.correctionPlan,
    agentExternalKey: params.input.agentId,
    sessionKey: params.input.sessionId,
    reviewCandidate: (input) => params.runtime.candidateReview.review(input),
    promoteToProcedureDraft: (input) =>
      params.runtime.candidatePromotion.promoteToProcedureDraft(input),
    validateProcedure: (input) => params.runtime.procedureValidation.validate(input),
    supersedeValidatedProceduresBySubjectKey,
    metadata: promotionMetadata,
    logLabel: "recurring-procedure tool",
    logContext: {
      candidateId: params.candidateId,
      subjectKey: params.subjectKey,
      correctionPromotion:
        params.correctionPlan?.status === "execute" &&
        params.correctionPlan.executionKind === "validated_procedure_supersede",
      ...(params.procedureKey ? { procedureKey: params.procedureKey } : {}),
    },
  });
  if (!transition.accepted || !transition.artifacts.validatedProcedureId) {
    return {
      accepted: false,
      status: "failed",
      kind: "procedure",
      reason: transition.accepted
        ? "validated procedure stage transition did not produce a validated procedure id"
        : transition.reason,
    };
  }
  return {
    accepted: true,
    status: "accepted",
    kind: "procedure",
    storage: "database",
    reviewState: "approved",
    eventId:
      transition.artifacts.candidateEventId ??
      readNestedMetadataString(params.input.metadata, ["sourceEventId"]) ??
      params.candidateId,
    memoryObjectId: transition.artifacts.validatedProcedureId,
  };
}

async function inspectStagedRecurringProcedureLifecycle(params: {
  runtime: MemoryMiddlewareRuntime;
  key: string;
  subjectKey: string;
}): Promise<ReturnType<typeof buildRecurringProcedureStagedInspection>> {
  return buildRecurringProcedureStagedInspection(
    await inspectRecurringProcedureLifecycle({
      config: params.runtime.config,
      key: params.key,
      subjectKey: params.subjectKey,
    }),
  );
}

async function maybeResolveExistingRecurringProcedureCandidate(params: {
  runtime: MemoryMiddlewareRuntime;
  input: CandidateSubmissionInput;
}): Promise<CandidateSubmissionResult | null> {
  if (params.input.kind !== "procedure") {
    return null;
  }
  const template = readNestedMetadataString(params.input.metadata, ["autoCapture", "template"]);
  const key = readNestedMetadataString(params.input.metadata, ["autoCapture", "key"]);
  const subjectKey = readNestedMetadataString(params.input.metadata, ["autoCapture", "subjectKey"]);
  const procedureFamily = readNestedMetadataString(params.input.metadata, [
    "autoCapture",
    "procedureFamily",
  ]) as RecurringProcedureFamily | undefined;
  const procedureKey = readNestedMetadataString(params.input.metadata, [
    "autoCapture",
    "procedureKey",
  ]);
  const title =
    readNestedMetadataString(params.input.metadata, ["autoCapture", "title"]) ??
    (procedureKey && isSupportedRecurringProcedureKey(procedureKey)
      ? getRecurringProcedureTitle(procedureKey)
      : undefined);
  const confidence =
    readNestedMetadataString(params.input.metadata, ["semanticDetection", "confidence"]) ?? "high";
  if (
    (template !== "named_recurring_checklist" && template !== "generalized_recurring_checklist") ||
    !key ||
    !subjectKey ||
    !procedureFamily ||
    (procedureKey !== undefined && !isSupportedRecurringProcedureKey(procedureKey)) ||
    !title
  ) {
    return null;
  }

  const inspection = await inspectStagedRecurringProcedureLifecycle({
    runtime: params.runtime,
    key,
    subjectKey,
  });
  if (!inspection) {
    return null;
  }

  if (
    inspection.pendingCandidate &&
    isExpiredPendingRecurringProcedureCandidate(inspection.pendingCandidate)
  ) {
    await params.runtime.candidateReview.review({
      candidateId: inspection.pendingCandidate.id,
      outcome: "rejected",
      rationale:
        "recurring-procedure candidate confirmation window expired without later confirming evidence",
      metadata: {
        source: "candidate_submit_recurring_procedure_confirmation",
        candidateLifecycle: {
          family: "recurring_procedure",
          state: "rejected",
          subjectKey,
          procedureKey,
        },
      },
    });
  }

  if (inspection.matchingValidatedProcedureId) {
    return {
      accepted: false,
      status: "failed",
      kind: params.input.kind,
      reason: `validated recurring procedure already exists for key ${key}`,
    };
  }

  const captureClass = readNestedMetadataString(params.input.metadata, [
    "autoCapture",
    "captureClass",
  ]);
  const isCorrection = captureClass === "recurring_procedure_correction";
  const autoPromotion =
    params.runtime.config.autoPromotion ?? DEFAULT_MEMORY_MIDDLEWARE_AUTO_PROMOTION_CONFIG;
  const recurringProcedureCorrectionPlan = isCorrection
    ? resolveMemoryCorrectionPlan({
        familyId: "recurring_procedure",
        trigger: "explicit_correction",
        promotionPolicy: resolveMemoryCorrectionPromotionPolicy(autoPromotion.profile),
        activeValidatedSubjectProcedureIds: inspection.activeValidatedSubjectProcedureIds,
      })
    : null;

  if (inspection.hasActiveValidatedSubjectTargets && !isCorrection) {
    return {
      accepted: false,
      status: "failed",
      kind: params.input.kind,
      reason: `validated recurring procedure already exists for title ${title}; use correction phrasing to replace it`,
    };
  }

  if (
    inspection.pendingCandidate &&
    !isExpiredPendingRecurringProcedureCandidate(inspection.pendingCandidate)
  ) {
    if (shouldSkipImmediateRecurringProcedureConfirmation(inspection.pendingCandidate.createdAt)) {
      return {
        accepted: false,
        status: "failed",
        kind: params.input.kind,
        reason: `recurring-procedure confirmation candidate ${inspection.pendingCandidate.id} already exists`,
      };
    }
    if (autoPromotion.profile !== "explicit-user-preference-v1") {
      return {
        accepted: false,
        status: "failed",
        kind: params.input.kind,
        reason: `recurring-procedure confirmation candidate ${inspection.pendingCandidate.id} is waiting for later evidence`,
      };
    }
    return autoPromoteRecurringProcedureCandidateFromTool({
      runtime: params.runtime,
      candidateId: inspection.pendingCandidate.id,
      input: params.input,
      title,
      subjectKey,
      procedureFamily,
      ...(procedureKey && isSupportedRecurringProcedureKey(procedureKey) ? { procedureKey } : {}),
      correctionPlan: recurringProcedureCorrectionPlan,
      confirmationState: "confirmed",
    });
  }

  if (procedureFamily === "generalized_named_checklist" && !isCorrection) {
    return null;
  }

  if (confidence !== "high" && !isCorrection) {
    return null;
  }

  return null;
}

async function maybeResolveExistingWorkflowImprovementCandidate(params: {
  runtime: MemoryMiddlewareRuntime;
  input: CandidateSubmissionInput;
  context?: OpenClawPluginToolContext;
}): Promise<CandidateSubmissionResult | null> {
  if (params.input.kind !== "improvement") {
    return null;
  }

  const template = readNestedMetadataString(params.input.metadata, ["autoCapture", "template"]);
  const key = readNestedMetadataString(params.input.metadata, ["autoCapture", "key"]);
  const subjectKey = readNestedMetadataString(params.input.metadata, ["autoCapture", "subjectKey"]);
  const lessonFamily = readNestedMetadataString(params.input.metadata, [
    "autoCapture",
    "lessonFamily",
  ]);
  const guidancePattern = readNestedMetadataString(params.input.metadata, [
    "autoCapture",
    "guidancePattern",
  ]);
  const lessonKey = readNestedMetadataString(params.input.metadata, ["autoCapture", "lessonKey"]);
  const subject = readNestedMetadataString(params.input.metadata, ["autoCapture", "subject"]);
  const value = readNestedMetadataString(params.input.metadata, ["autoCapture", "value"]);
  const normalizedSubject = readNestedMetadataString(params.input.metadata, [
    "autoCapture",
    "normalizedSubject",
  ]);
  const normalizedValue = readNestedMetadataString(params.input.metadata, [
    "autoCapture",
    "normalizedValue",
  ]);
  const recommendedAction = readNestedMetadataString(params.input.metadata, [
    "autoCapture",
    "recommendedAction",
  ]);
  const normalizedRecommendedAction = readNestedMetadataString(params.input.metadata, [
    "autoCapture",
    "normalizedRecommendedAction",
  ]);
  const avoidAction = readNestedMetadataString(params.input.metadata, [
    "autoCapture",
    "avoidAction",
  ]);
  const normalizedAvoidAction = readNestedMetadataString(params.input.metadata, [
    "autoCapture",
    "normalizedAvoidAction",
  ]);
  const rationale = readNestedMetadataString(params.input.metadata, ["autoCapture", "rationale"]);
  const normalizedRationale = readNestedMetadataString(params.input.metadata, [
    "autoCapture",
    "normalizedRationale",
  ]);
  const needCategory = readNestedMetadataString(params.input.metadata, [
    "autoCapture",
    "needCategory",
  ]);
  const neededCapability = readNestedMetadataString(params.input.metadata, [
    "autoCapture",
    "neededCapability",
  ]);
  const normalizedNeededCapability = readNestedMetadataString(params.input.metadata, [
    "autoCapture",
    "normalizedNeededCapability",
  ]);
  const observedText =
    readNestedMetadataString(params.input.metadata, ["workflowPhraseInduction", "observedText"]) ??
    params.input.content;
  const isSupportedTemplate =
    template === "workflow_tool_gotcha" ||
    template === "workflow_environment_constraint" ||
    template === "workflow_api_workaround";
  const isGenericTemplate = template === "workflow_generalized_guidance";
  const isProjectRuleTemplate = template === "project_rule_guidance";
  const isUnmetNeedTemplate = template === "unmet_need_recommendation";
  const isAutoReviewedFamily =
    (isGenericTemplate && lessonFamily === "generalized_workflow_lesson") ||
    (isProjectRuleTemplate && lessonFamily === "generalized_project_rule") ||
    (isUnmetNeedTemplate && lessonFamily === "generalized_unmet_need");
  const supportsPhraseInduction =
    isGenericTemplate && lessonFamily === "generalized_workflow_lesson";
  if (
    (!isSupportedTemplate &&
      !isGenericTemplate &&
      !isProjectRuleTemplate &&
      !isUnmetNeedTemplate) ||
    !key ||
    !subjectKey ||
    (isSupportedTemplate && (!lessonKey || !isSupportedWorkflowImprovementLessonKey(lessonKey))) ||
    !lessonFamily
  ) {
    return null;
  }
  const canonicalMatchForPhraseInduction: WorkflowImprovementCanonicalMatch | null =
    isAutoReviewedFamily &&
    lessonFamily === "generalized_workflow_lesson" &&
    subject &&
    value &&
    normalizedSubject &&
    normalizedValue
      ? {
          captureClass: "workflow_generalized_guidance" as const,
          candidateKind: "improvement" as const,
          reasonCode: "workflow_generalized_guidance_statement" as const,
          template: "workflow_generalized_guidance" as const,
          lessonFamily: "generalized_workflow_lesson" as const,
          ...(guidancePattern
            ? { guidancePattern: guidancePattern as WorkflowImprovementGuidancePattern }
            : {}),
          subject,
          value,
          normalizedSubject,
          normalizedValue,
          content: value,
          subjectKey,
          key,
          ...(needCategory
            ? { needCategory: needCategory as WorkflowImprovementNeedCategory }
            : {}),
          ...(neededCapability ? { neededCapability } : {}),
          ...(normalizedNeededCapability ? { normalizedNeededCapability } : {}),
          ...(recommendedAction ? { recommendedAction } : {}),
          ...(normalizedRecommendedAction ? { normalizedRecommendedAction } : {}),
          ...(avoidAction ? { avoidAction } : {}),
          ...(normalizedAvoidAction ? { normalizedAvoidAction } : {}),
          ...(rationale ? { rationale } : {}),
          ...(normalizedRationale ? { normalizedRationale } : {}),
        }
      : null;

  const inspection = await inspectWorkflowImprovementLifecycle({
    config: params.runtime.config,
    key,
    subjectKey,
    ...(params.input.projectId ? { projectId: params.input.projectId } : {}),
  });
  if (!inspection) {
    return null;
  }

  if (
    inspection.pendingCandidate &&
    isExpiredPendingWorkflowImprovementCandidate(inspection.pendingCandidate)
  ) {
    await params.runtime.candidateReview.review({
      candidateId: inspection.pendingCandidate.id,
      outcome: "rejected",
      rationale: isAutoReviewedFamily
        ? lessonFamily === "generalized_project_rule"
          ? "project-rule cluster expired without enough compatible evidence"
          : lessonFamily === "generalized_unmet_need"
            ? "unmet-need cluster expired without enough compatible evidence"
            : "generalized workflow lesson cluster expired without enough compatible evidence"
        : "workflow-improvement candidate confirmation window expired without later confirming evidence",
      metadata: {
        source: isAutoReviewedFamily
          ? lessonFamily === "generalized_project_rule"
            ? "candidate_submit_project_rule_auto_review"
            : lessonFamily === "generalized_unmet_need"
              ? "candidate_submit_unmet_need_auto_review"
              : "candidate_submit_workflow_improvement_generic_auto_review"
          : "candidate_submit_workflow_improvement_confirmation",
        candidateLifecycle: {
          family: "workflow_improvement",
          state: "rejected",
          subjectKey,
          ...(lessonFamily ? { lessonFamily } : {}),
          ...(lessonKey ? { lessonKey } : {}),
          ...(guidancePattern ? { guidancePattern } : {}),
        },
      },
    });
  }

  const conflictingApprovedGeneralizedEntries = isAutoReviewedFamily
    ? inspection.activeApprovedSubjectEntries.filter(
        (entry) => entry.lessonFamily === lessonFamily && entry.key && entry.key !== key,
      )
    : [];
  const conflictingPendingGeneralizedEntries = isAutoReviewedFamily
    ? inspection.pendingSubjectCandidates.filter(
        (entry) =>
          entry.lessonFamily === lessonFamily &&
          entry.key &&
          entry.key !== key &&
          entry.id !== inspection.pendingCandidate?.id,
      )
    : [];

  if (isAutoReviewedFamily && conflictingPendingGeneralizedEntries.length > 0) {
    for (const pendingEntry of conflictingPendingGeneralizedEntries) {
      if (!isExpiredPendingWorkflowImprovementCandidate(pendingEntry)) {
        continue;
      }
      await params.runtime.candidateReview.review({
        candidateId: pendingEntry.id,
        outcome: "rejected",
        rationale:
          lessonFamily === "generalized_project_rule"
            ? "older project-rule cluster expired without enough compatible evidence"
            : lessonFamily === "generalized_unmet_need"
              ? "older unmet-need cluster expired without enough compatible evidence"
              : "older generalized workflow lesson cluster expired without enough compatible evidence",
        metadata: {
          source:
            lessonFamily === "generalized_project_rule"
              ? "candidate_submit_project_rule_auto_review"
              : lessonFamily === "generalized_unmet_need"
                ? "candidate_submit_unmet_need_auto_review"
                : "candidate_submit_workflow_improvement_generic_auto_review",
          candidateLifecycle: {
            family: "workflow_improvement",
            state: "rejected",
            subjectKey,
            lessonFamily,
          },
        },
      });
    }
  }

  if (inspection.matchingApprovedObjectId) {
    if (params.input.projectId && supportsPhraseInduction && canonicalMatchForPhraseInduction) {
      await maybeInduceWorkflowPhrasePattern({
        config: params.runtime.config,
        candidateIngress: params.runtime.candidateIngress,
        candidateReview: params.runtime.candidateReview,
        candidatePromotion: params.runtime.candidatePromotion,
        text: observedText,
        projectId: params.input.projectId,
        ...(params.input.sessionId ? { sessionId: params.input.sessionId } : {}),
        ...(params.input.agentId ? { agentId: params.input.agentId } : {}),
        detectionSource:
          readNestedMetadataString(params.input.metadata, [
            "semanticDetection",
            "detectionSource",
          ]) === "deterministic"
            ? "deterministic"
            : "semantic",
        targetMatch: canonicalMatchForPhraseInduction,
        source: "workflow_phrase_induction_candidate_submit",
      });
    }
    return {
      accepted: false,
      status: "failed",
      kind: params.input.kind,
      reason:
        lessonFamily === "generalized_project_rule"
          ? `approved project rule already exists for key ${key}`
          : lessonFamily === "generalized_unmet_need"
            ? `approved unmet-need recommendation already exists for key ${key}`
            : `approved workflow-improvement memory already exists for key ${key}`,
    };
  }

  if (
    inspection.pendingCandidate &&
    !isExpiredPendingWorkflowImprovementCandidate(inspection.pendingCandidate)
  ) {
    if (shouldSkipImmediateWorkflowImprovementConfirmation(inspection.pendingCandidate.createdAt)) {
      return {
        accepted: false,
        status: "failed",
        kind: params.input.kind,
        reason: isAutoReviewedFamily
          ? lessonFamily === "generalized_project_rule"
            ? `project-rule cluster ${inspection.pendingCandidate.id} is still gathering evidence`
            : lessonFamily === "generalized_unmet_need"
              ? `unmet-need cluster ${inspection.pendingCandidate.id} is still gathering evidence`
              : `generalized workflow lesson cluster ${inspection.pendingCandidate.id} is still gathering evidence`
          : `workflow-improvement confirmation candidate ${inspection.pendingCandidate.id} already exists`,
      };
    }
    const autoPromotion =
      params.runtime.config.autoPromotion ?? DEFAULT_MEMORY_MIDDLEWARE_AUTO_PROMOTION_CONFIG;
    if (autoPromotion.profile !== "explicit-user-preference-v1") {
      return {
        accepted: false,
        status: "failed",
        kind: params.input.kind,
        reason: isAutoReviewedFamily
          ? lessonFamily === "generalized_project_rule"
            ? `project-rule cluster ${inspection.pendingCandidate.id} is waiting for later evidence`
            : lessonFamily === "generalized_unmet_need"
              ? `unmet-need cluster ${inspection.pendingCandidate.id} is waiting for later evidence`
              : `generalized workflow lesson cluster ${inspection.pendingCandidate.id} is waiting for later evidence`
          : `workflow-improvement confirmation candidate ${inspection.pendingCandidate.id} is waiting for later evidence`,
      };
    }
    const contradictoryPendingCandidateIds = conflictingPendingGeneralizedEntries
      .filter((entry) => !isExpiredPendingWorkflowImprovementCandidate(entry))
      .map((entry) => entry.id);
    if (isAutoReviewedFamily) {
      for (const candidateId of contradictoryPendingCandidateIds) {
        await params.runtime.candidateReview.review({
          candidateId,
          outcome: "rejected",
          rationale:
            lessonFamily === "generalized_project_rule"
              ? "older project-rule cluster was replaced by stronger newer conflicting evidence for the same scoped subject"
              : lessonFamily === "generalized_unmet_need"
                ? "older unmet-need cluster was replaced by stronger newer conflicting evidence for the same scoped subject"
                : "older generalized workflow lesson cluster was replaced by stronger newer conflicting evidence for the same scoped subject",
          metadata: {
            source:
              lessonFamily === "generalized_project_rule"
                ? "candidate_submit_project_rule_auto_review"
                : lessonFamily === "generalized_unmet_need"
                  ? "candidate_submit_unmet_need_auto_review"
                  : "candidate_submit_workflow_improvement_generic_auto_review",
            candidateLifecycle: {
              family: "workflow_improvement",
              state: "rejected",
              subjectKey,
              lessonFamily,
            },
          },
        });
      }
    }
    const workflowCorrectionPlan = isAutoReviewedFamily
      ? resolveMemoryCorrectionPlan({
          familyId: getMemoryFamilyIdByWorkflowLessonFamily(lessonFamily) ?? "workflow_improvement",
          trigger: "cluster_auto_review",
          conflictingApprovedObjectIds: conflictingApprovedGeneralizedEntries.map(
            (entry) => entry.id,
          ),
        })
      : null;
    const supersedeTargetIds =
      workflowCorrectionPlan?.status === "execute" ? workflowCorrectionPlan.supersedeTargetIds : [];
    const promotionMetadata = buildToolWorkflowImprovementAutoPromotionMetadata({
      input: params.input,
      autoPromotionProfile: isAutoReviewedFamily
        ? lessonFamily === "generalized_project_rule"
          ? "project_rule_auto_review_v1"
          : lessonFamily === "generalized_unmet_need"
            ? "unmet_need_auto_review_v1"
            : "workflow_generalized_auto_review_v1"
        : "workflow_improvement_confirmation_v1",
      confirmationState: "confirmed",
      ...(isAutoReviewedFamily
        ? {
            autoReview: {
              outcome: supersedeTargetIds.length > 0 ? "supersede_existing" : "approve",
              contradictionCount:
                supersedeTargetIds.length + contradictoryPendingCandidateIds.length,
              supersedeTargetIds,
              rejectedCandidateIds: contradictoryPendingCandidateIds,
            },
          }
        : {}),
    });
    const reviewResult = await params.runtime.candidateReview.review({
      candidateId: inspection.pendingCandidate.id,
      outcome: "accepted",
      metadata: promotionMetadata,
    });
    if (!reviewResult.accepted) {
      return {
        accepted: false,
        status: "failed",
        kind: params.input.kind,
        reason: reviewResult.reason,
      };
    }
    const promotionResult = await params.runtime.candidatePromotion.promoteToMemory({
      candidateId: inspection.pendingCandidate.id,
      metadata: promotionMetadata,
    });
    if (!promotionResult.accepted) {
      return {
        accepted: false,
        status: "failed",
        kind: params.input.kind,
        reason: promotionResult.reason,
      };
    }
    if (
      lessonKey &&
      isEnvironmentConstraintLessonKey(lessonKey) &&
      promotionResult.promotedMemoryObjectId
    ) {
      await storeApprovedEnvironmentConstraintSemanticEmbedding({
        config: params.runtime.config,
        cfg: params.context?.runtimeConfig ?? params.context?.config,
        agentId: params.context?.agentId,
        sessionKey: params.context?.sessionKey,
        memoryObjectId: promotionResult.promotedMemoryObjectId,
      });
    } else if (
      lessonKey &&
      isWorkflowToolGotchaSemanticLessonKey(lessonKey) &&
      promotionResult.promotedMemoryObjectId
    ) {
      await storeApprovedWorkflowToolGotchaSemanticEmbedding({
        config: params.runtime.config,
        cfg: params.context?.runtimeConfig ?? params.context?.config,
        agentId: params.context?.agentId,
        sessionKey: params.context?.sessionKey,
        memoryObjectId: promotionResult.promotedMemoryObjectId,
      });
    } else if (
      lessonKey &&
      isApiWorkaroundSemanticLessonKey(lessonKey) &&
      promotionResult.promotedMemoryObjectId
    ) {
      await storeApprovedApiWorkaroundSemanticEmbedding({
        config: params.runtime.config,
        cfg: params.context?.runtimeConfig ?? params.context?.config,
        agentId: params.context?.agentId,
        sessionKey: params.context?.sessionKey,
        memoryObjectId: promotionResult.promotedMemoryObjectId,
      });
    }
    if (
      isAutoReviewedFamily &&
      promotionResult.promotedMemoryObjectId &&
      supersedeTargetIds.length > 0
    ) {
      const supersedeResult = await supersedeApprovedWorkflowImprovementSubjectEntries({
        config: params.runtime.config,
        targetObjectIds: supersedeTargetIds,
        supersededByObjectId: promotionResult.promotedMemoryObjectId,
        reviewerAgentId: params.context?.agentId,
        metadata: {
          clusterKey: key,
          subjectKey,
          guidancePattern,
          evidenceCount: 2,
        },
      });
      if (!supersedeResult.accepted) {
        return {
          accepted: false,
          status: "failed",
          kind: params.input.kind,
          reason: supersedeResult.reason ?? "workflow improvement supersede failed",
        };
      }
    }
    if (
      params.input.projectId &&
      supportsPhraseInduction &&
      promotionResult.promotedMemoryObjectId &&
      canonicalMatchForPhraseInduction
    ) {
      await maybeInduceWorkflowPhrasePattern({
        config: params.runtime.config,
        candidateIngress: params.runtime.candidateIngress,
        candidateReview: params.runtime.candidateReview,
        candidatePromotion: params.runtime.candidatePromotion,
        text: observedText,
        projectId: params.input.projectId,
        ...(params.input.sessionId ? { sessionId: params.input.sessionId } : {}),
        ...(params.input.agentId ? { agentId: params.input.agentId } : {}),
        detectionSource:
          readNestedMetadataString(params.input.metadata, [
            "semanticDetection",
            "detectionSource",
          ]) === "deterministic"
            ? "deterministic"
            : "semantic",
        targetMatch: canonicalMatchForPhraseInduction,
        source: "workflow_phrase_induction_candidate_submit",
      });
    }
    return {
      accepted: true,
      status: "accepted",
      kind: params.input.kind,
      storage: "database",
      reviewState: "approved",
      eventId: promotionResult.sourceEventId ?? inspection.pendingCandidate.sourceEventId,
      memoryObjectId: promotionResult.promotedMemoryObjectId,
    };
  }

  return null;
}

export async function submitCandidateFromTool(params: {
  runtime: MemoryMiddlewareRuntime;
  input: CandidateSubmissionInput;
  context?: OpenClawPluginToolContext;
}): Promise<CandidateSubmissionResult> {
  const normalizedInput = await normalizeManagedToolCandidateInput({
    runtime: params.runtime,
    input: params.input,
    context: params.context,
  });
  const executionContext = {
    runtime: params.runtime,
    input: normalizedInput,
    ...(params.context ? { context: params.context } : {}),
  };
  const resolvedExisting = await runWriteResolutionStages({
    context: executionContext,
    stages: [
      {
        id: "resolve_response_style",
        resolve: ({ runtime, input, context }) =>
          maybeResolveExistingResponseStyleCandidate({
            runtime,
            input,
            ...(context ? { context } : {}),
          }),
      },
      {
        id: "resolve_project_fact",
        resolve: ({ runtime, input }) =>
          maybeResolveExistingProjectFactCandidate({
            runtime,
            input,
          }),
      },
      {
        id: "resolve_recurring_procedure",
        resolve: ({ runtime, input }) =>
          maybeResolveExistingRecurringProcedureCandidate({
            runtime,
            input,
          }),
      },
      {
        id: "resolve_workflow_improvement",
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
  const duplicateGuard = await runWriteResolutionStages({
    context: executionContext,
    stages:
      normalizedInput.kind === "learning" ||
      normalizedInput.kind === "correction" ||
      normalizedInput.kind === "improvement"
        ? [
            {
              id: "reject_auto_capture_duplicate",
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
          ]
        : [],
  });
  if (duplicateGuard) {
    return duplicateGuard;
  }
  const submitted = await submitCandidateByKind({
    runtime: params.runtime,
    input: normalizedInput,
  });
  return runWriteResultStages({
    context: executionContext,
    result: submitted,
    stages: [
      {
        id: "auto_promote_preference",
        apply: ({ context, result }) =>
          maybeAutoPromoteToolSubmittedPreference({
            runtime: context.runtime,
            input: context.input,
            result,
          }),
      },
      {
        id: "auto_promote_project_fact",
        apply: ({ context, result }) =>
          maybeAutoPromoteToolSubmittedProjectFact({
            runtime: context.runtime,
            input: context.input,
            result,
          }),
      },
      {
        id: "auto_promote_recurring_procedure",
        apply: ({ context, result }) =>
          maybeAutoPromoteToolSubmittedRecurringProcedure({
            runtime: context.runtime,
            input: context.input,
            result,
          }),
      },
    ],
  });
}

function resolveAutoPromotableFeedbackSubmission(
  input: CandidateSubmissionInput,
): ReturnType<typeof parseAutoCaptureManagedCandidateContent> | null {
  if (input.kind !== "learning") {
    return null;
  }
  const metadata = input.metadata ?? {};
  const parsedFromContent = parseAutoCaptureManagedCandidateContent(input.content);
  if (
    parsedFromContent &&
    (parsedFromContent.captureClass === "explicit_preference" ||
      parsedFromContent.captureClass === "explicit_requirement")
  ) {
    return parsedFromContent;
  }
  if (typeof metadata.raw === "string") {
    const rawCandidates = [
      metadata.raw,
      metadata.raw.replace(/^(?:going forward|from now on),\s*/i, ""),
    ];
    for (const rawCandidate of rawCandidates) {
      const parsedFromRaw = parseOrdinaryTurnAutoCapturePreference(
        rawCandidate,
        "user-preference-v2",
      );
      if (
        parsedFromRaw &&
        (parsedFromRaw.captureClass === "explicit_preference" ||
          parsedFromRaw.captureClass === "explicit_requirement")
      ) {
        return parsedFromRaw;
      }
    }
  }
  return null;
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

function normalizeCorrectionPreferenceKey(raw: unknown): string | null {
  if (typeof raw !== "string") {
    return null;
  }
  const normalized = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (!normalized) {
    return null;
  }
  return normalized;
}

function resolveResponseStyleLearningParaphraseKey(
  content: string,
): OrdinaryTurnAutoCaptureMatch["key"] | null {
  const normalized = content.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const canonicalRaw =
    /^(?:user|[a-z][a-z0-9_-]*) prefers bullet points\b.*\b(?:reply|replies|response|responses|list|listing|structured)\b.*[.!?]?$/i.test(
      content,
    )
      ? "Use bullet points for me."
      : /^(?:user|[a-z][a-z0-9_-]*) prefers plain english\b.*(?:jargon)?.*[.!?]?$/i.test(content)
        ? "Use plain English, not jargon."
        : null;
  if (!canonicalRaw) {
    return null;
  }

  return parseOrdinaryTurnAutoCapturePreference(canonicalRaw, "user-preference-v2")?.key ?? null;
}

function extractAutoCaptureKey(metadata: Record<string, unknown> | undefined): string | null {
  const autoCapture = metadata?.autoCapture;
  if (!autoCapture || typeof autoCapture !== "object" || Array.isArray(autoCapture)) {
    return null;
  }
  const key = (autoCapture as { key?: unknown }).key;
  return typeof key === "string" ? key : null;
}

function stripTranscriptTimestampPrefix(value: string): string {
  return value.replace(/^\[[^\]\n]{1,80}\]\s*/, "");
}

function stripGatewaySenderMetadataPrefix(value: string): string {
  return value.replace(/^Sender \(untrusted metadata\):\n```json[\s\S]*?```\n\n/, "");
}

function normalizeTranscriptUserText(value: string): string | null {
  const stripped = stripTranscriptTimestampPrefix(
    stripGatewaySenderMetadataPrefix(value).trim(),
  ).trim();
  return stripped.length > 0 ? stripped : null;
}

function buildResponseStyleSemanticMetadata(params: {
  detectionSource: "deterministic" | "semantic";
  confidence: "high" | ResponseStyleSemanticConfidence;
  evidence: string[];
}): Record<string, unknown> {
  return {
    semanticDetection: {
      source: "response_style_semantic_v1",
      detectionSource: params.detectionSource,
      confidence: params.confidence,
      evidence: params.evidence,
    },
  };
}

function buildProjectFactSemanticMetadata(params: {
  detectionSource: "deterministic" | "semantic";
  confidence: "high" | ProjectFactSemanticConfidence;
  evidence: string[];
  factFamily: ProjectFactFamily;
  fieldKey?: ProjectFactFieldKey;
}): Record<string, unknown> {
  return {
    semanticDetection: {
      source: "project_fact_semantic_v1",
      detectionSource: params.detectionSource,
      confidence: params.confidence,
      factFamily: params.factFamily,
      ...(params.fieldKey ? { fieldKey: params.fieldKey } : {}),
      evidence: params.evidence,
    },
  };
}

function buildRecurringProcedureSemanticMetadata(params: {
  detectionSource: "semantic";
  confidence: "high" | RecurringProcedureSemanticConfidence;
  evidence: string[];
  procedureFamily: RecurringProcedureFamily;
  procedureKey?: RecurringProcedureKey;
}): Record<string, unknown> {
  return {
    semanticDetection: {
      source: "recurring_procedure_semantic_v1",
      detectionSource: params.detectionSource,
      confidence: params.confidence,
      procedureFamily: params.procedureFamily,
      ...(params.procedureKey ? { procedureKey: params.procedureKey } : {}),
      evidence: params.evidence,
    },
  };
}

function buildWorkflowImprovementSemanticMetadata(params: {
  detectionSource: "semantic" | "deterministic";
  confidence: WorkflowImprovementSemanticConfidence;
  evidence: string[];
  lessonFamily: WorkflowImprovementLessonFamily;
  lessonKey?: WorkflowImprovementLessonKey;
  toolKey?: WorkflowImprovementToolKey;
  guidancePattern?: WorkflowImprovementGuidancePattern;
}): Record<string, unknown> {
  return {
    semanticDetection: {
      source:
        params.detectionSource === "deterministic"
          ? "workflow_phrase_induction_v1"
          : params.lessonFamily === "generalized_project_rule"
            ? "project_rule_semantic_v1"
            : params.lessonFamily === "generalized_unmet_need"
              ? "unmet_need_semantic_v1"
              : "workflow_improvement_semantic_v2",
      detectionSource: params.detectionSource,
      confidence: params.confidence,
      lessonFamily: params.lessonFamily,
      ...(params.lessonKey ? { lessonKey: params.lessonKey } : {}),
      ...(params.toolKey ? { toolKey: params.toolKey } : {}),
      ...(params.guidancePattern ? { guidancePattern: params.guidancePattern } : {}),
      evidence: params.evidence,
    },
  };
}

function buildPendingConfirmationMetadata(params: {
  confidence: ResponseStyleSemanticConfidence;
  evidence: string[];
  responseStyleFamily: ResponseStyleFamily;
  state?: "pending_confirmation" | "hold_for_more_evidence";
}): Record<string, unknown> {
  const observedAt = new Date().toISOString();
  return {
    candidateLifecycle: {
      family: "response_style",
      state: params.state ?? "pending_confirmation",
      confidence: params.confidence,
      evidenceCount: 1,
      observedAt,
      expiresAt: new Date(Date.parse(observedAt) + 72 * 60 * 60 * 1000).toISOString(),
      responseStyleFamily: params.responseStyleFamily,
      evidence: params.evidence,
    },
  };
}

function buildProjectFactPendingConfirmationMetadata(params: {
  confidence: ProjectFactSemanticConfidence;
  evidence: string[];
  factFamily: ProjectFactFamily;
  state?: "pending_confirmation" | "hold_for_more_evidence";
  fieldKey?: ProjectFactFieldKey;
  clusterKey?: string;
}): Record<string, unknown> {
  const observedAt = new Date().toISOString();
  return {
    candidateLifecycle: {
      family: "project_fact",
      state: params.state ?? "pending_confirmation",
      confidence: params.confidence,
      evidenceCount: 1,
      observedAt,
      expiresAt: new Date(Date.parse(observedAt) + 72 * 60 * 60 * 1000).toISOString(),
      factFamily: params.factFamily,
      ...(params.fieldKey ? { fieldKey: params.fieldKey } : {}),
      ...(params.clusterKey ? { clusterKey: params.clusterKey } : {}),
      evidence: params.evidence,
    },
  };
}

function buildRecurringProcedurePendingConfirmationMetadata(params: {
  confidence: RecurringProcedureSemanticConfidence;
  evidence: string[];
  procedureFamily: RecurringProcedureFamily;
  procedureKey?: RecurringProcedureKey;
  state?: "pending_confirmation" | "hold_for_more_evidence";
  observedAt?: string;
}): Record<string, unknown> {
  const observedAt = params.observedAt ?? new Date().toISOString();
  return {
    candidateLifecycle: {
      family: "recurring_procedure",
      state: params.state ?? "pending_confirmation",
      confidence: params.confidence,
      evidenceCount: 1,
      observedAt,
      expiresAt: new Date(Date.parse(observedAt) + 72 * 60 * 60 * 1000).toISOString(),
      procedureFamily: params.procedureFamily,
      ...(params.procedureKey ? { procedureKey: params.procedureKey } : {}),
      evidence: params.evidence,
    },
  };
}

function buildWorkflowImprovementPendingConfirmationMetadata(params: {
  confidence: WorkflowImprovementSemanticConfidence;
  evidence: string[];
  lessonFamily: WorkflowImprovementLessonFamily;
  state?: "pending_confirmation" | "hold_for_more_evidence";
  lessonKey?: WorkflowImprovementLessonKey;
  toolKey?: WorkflowImprovementToolKey;
  guidancePattern?: WorkflowImprovementGuidancePattern;
  clusterKey?: string;
  contradictionCount?: number;
}): Record<string, unknown> {
  const observedAt = new Date().toISOString();
  return {
    candidateLifecycle: {
      family: "workflow_improvement",
      state: params.state ?? "pending_confirmation",
      confidence: params.confidence,
      evidenceCount: 1,
      observedAt,
      expiresAt: new Date(Date.parse(observedAt) + 72 * 60 * 60 * 1000).toISOString(),
      lessonFamily: params.lessonFamily,
      ...(params.lessonKey ? { lessonKey: params.lessonKey } : {}),
      ...(params.toolKey ? { toolKey: params.toolKey } : {}),
      ...(params.guidancePattern ? { guidancePattern: params.guidancePattern } : {}),
      ...(params.clusterKey ? { clusterKey: params.clusterKey } : {}),
      ...(typeof params.contradictionCount === "number"
        ? { contradictionCount: params.contradictionCount }
        : {}),
      evidence: params.evidence,
    },
  };
}

type TranscriptUserMessage = {
  role?: unknown;
  content?: unknown;
};

type SessionStoreEntry = {
  sessionId?: unknown;
  sessionFile?: unknown;
};

type ManagedResponseStyleResolution = {
  action: "capture";
  familyId: "response_style";
  parsed: OrdinaryTurnAutoCaptureMatch;
  responseStyleFamily: ResponseStyleFamily;
  reviewMode: "direct" | "pending_confirmation" | "hold_for_more_evidence";
  source: "content" | "raw";
  detectionSource: "deterministic" | "semantic";
  confidence: "high" | ResponseStyleSemanticConfidence;
  evidence: string[];
  observedText: string;
};

type ManagedProjectFactResolution = {
  familyId: "project_fact";
  parsed: OrdinaryTurnAutoCaptureMatch;
  factFamily: ProjectFactFamily;
  fieldKey?: ProjectFactFieldKey;
  reviewMode: "pending_confirmation" | "hold_for_more_evidence";
  source: "content" | "raw";
  detectionSource: "deterministic" | "semantic";
  confidence: "high" | ProjectFactSemanticConfidence;
  evidence: string[];
  observedText: string;
};

type ManagedRecurringProcedureResolution = {
  familyId: "recurring_procedure";
  parsed: OrdinaryTurnAutoCaptureMatch;
  procedureFamily: RecurringProcedureFamily;
  procedureKey?: RecurringProcedureKey;
  reviewMode: "pending_confirmation" | "hold_for_more_evidence";
  source: "content" | "raw";
  detectionSource: "semantic";
  confidence: "high" | RecurringProcedureSemanticConfidence;
  evidence: string[];
  observedText: string;
};

type ManagedWorkflowImprovementResolution = {
  familyId: "workflow_improvement" | "project_rule" | "unmet_need";
  parsed: OrdinaryTurnAutoCaptureMatch;
  lessonFamily: WorkflowImprovementLessonFamily;
  reviewMode: "pending_confirmation" | "hold_for_more_evidence";
  lessonKey?: WorkflowImprovementLessonKey;
  toolKey?: WorkflowImprovementToolKey;
  guidancePattern?: WorkflowImprovementGuidancePattern;
  source: "content" | "raw";
  detectionSource: "semantic" | "deterministic";
  confidence: WorkflowImprovementSemanticConfidence;
  evidence: string[];
  observedText: string;
};

function extractTranscriptUserText(message: TranscriptUserMessage | null): string | null {
  if (!message || message.role !== "user") {
    return null;
  }
  if (typeof message.content === "string") {
    return normalizeTranscriptUserText(message.content);
  }
  if (!Array.isArray(message.content)) {
    return null;
  }
  const parts = message.content
    .map((block) =>
      block && typeof block === "object" && "text" in block
        ? (block as { text?: unknown }).text
        : undefined,
    )
    .filter((text): text is string => typeof text === "string")
    .map((text) => normalizeTranscriptUserText(text))
    .filter((text): text is string => typeof text === "string");
  return parts.length > 0 ? parts.join(" ") : null;
}

function parseSessionHeaderId(raw: string): string | null {
  const firstLine = raw
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstLine) {
    return null;
  }
  try {
    const parsed = JSON.parse(firstLine) as { type?: unknown; id?: unknown };
    return parsed.type === "session" && typeof parsed.id === "string" && parsed.id.trim().length > 0
      ? parsed.id.trim()
      : null;
  } catch {
    return null;
  }
}

function readLatestTranscriptUserTextFromRaw(raw: string): string | null {
  const lines = raw.split("\n");
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]?.trim();
    if (!line) {
      continue;
    }
    try {
      const parsed = JSON.parse(line) as { message?: TranscriptUserMessage | null };
      const text = extractTranscriptUserText(parsed.message ?? null);
      if (text) {
        return text;
      }
    } catch {
      continue;
    }
  }
  return null;
}

async function resolveLatestUserTurnFromContext(
  context: OpenClawPluginToolContext | undefined,
): Promise<string | null> {
  const agentDir = context?.agentDir?.trim();
  const sessionId = context?.sessionId?.trim();
  const sessionKey = context?.sessionKey?.trim();
  if (!agentDir || (!sessionId && !sessionKey)) {
    return null;
  }
  const sessionsDir = path.join(agentDir, "sessions");

  if (sessionKey) {
    try {
      const rawStore = await readFile(path.join(sessionsDir, "sessions.json"), "utf8");
      const parsedStore = JSON.parse(rawStore) as Record<string, SessionStoreEntry>;
      const entry = parsedStore[sessionKey];
      const sessionFile =
        typeof entry?.sessionFile === "string" && entry.sessionFile.trim().length > 0
          ? entry.sessionFile.trim()
          : null;
      if (sessionFile) {
        const candidatePaths = [sessionFile, path.join(sessionsDir, path.basename(sessionFile))];
        for (const candidatePath of candidatePaths) {
          try {
            const raw = await readFile(candidatePath, "utf8");
            const text = readLatestTranscriptUserTextFromRaw(raw);
            if (text) {
              return text;
            }
          } catch {
            continue;
          }
        }
      }
    } catch {
      // Fall through to sessionId scan when the session registry is unavailable.
    }
  }

  if (!agentDir || !sessionId) {
    return null;
  }
  let entries: string[];
  try {
    entries = await readdir(sessionsDir);
  } catch {
    return null;
  }

  for (const entry of entries) {
    if (!entry.endsWith(".jsonl") || entry === "sessions.json") {
      continue;
    }
    const sessionFile = path.join(sessionsDir, entry);
    let raw: string;
    try {
      raw = await readFile(sessionFile, "utf8");
    } catch {
      continue;
    }
    if (parseSessionHeaderId(raw) !== sessionId) {
      continue;
    }
    return readLatestTranscriptUserTextFromRaw(raw);
  }
  return null;
}

function shouldSkipImmediateConfirmation(createdAt: string, now = Date.now()): boolean {
  const createdAtMs = Date.parse(createdAt);
  return Number.isFinite(createdAtMs) && now - createdAtMs < RESPONSE_STYLE_CONFIRMATION_MIN_AGE_MS;
}

function shouldSkipImmediateProjectFactConfirmation(createdAt: string, now = Date.now()): boolean {
  const createdAtMs = Date.parse(createdAt);
  return Number.isFinite(createdAtMs) && now - createdAtMs < PROJECT_FACT_CONFIRMATION_MIN_AGE_MS;
}

function shouldSkipImmediateRecurringProcedureConfirmation(
  createdAt: string,
  now = Date.now(),
): boolean {
  const createdAtMs = Date.parse(createdAt);
  return Number.isFinite(createdAtMs) && now - createdAtMs < PROCEDURE_CONFIRMATION_MIN_AGE_MS;
}

function shouldSkipImmediateWorkflowImprovementConfirmation(
  createdAt: string,
  now = Date.now(),
): boolean {
  const createdAtMs = Date.parse(createdAt);
  return (
    Number.isFinite(createdAtMs) && now - createdAtMs < WORKFLOW_IMPROVEMENT_CONFIRMATION_MIN_AGE_MS
  );
}

function isManagedCorrectionMatch(
  parsed: ReturnType<typeof parseManagedCorrectionCandidateContent> | null,
): parsed is NonNullable<ReturnType<typeof parseManagedCorrectionCandidateContent>> {
  return Boolean(
    parsed &&
    (parsed.captureClass === "preference_correction" ||
      parsed.captureClass === "requirement_correction"),
  );
}

function buildResponseStyleCanonicalMatchFromInput(input: CandidateSubmissionInput) {
  const template = readNestedMetadataString(input.metadata, ["autoCapture", "template"]);
  const family =
    (readNestedMetadataString(input.metadata, [
      "autoCapture",
      "responseStyleFamily",
    ]) as ResponseStyleFamily | null) ?? "supported_template";
  const subject = readNestedMetadataString(input.metadata, ["autoCapture", "subject"]);
  const value = readNestedMetadataString(input.metadata, ["autoCapture", "value"]);
  if (
    !template ||
    !subject ||
    !value ||
    (template !== "responses_concise" &&
      template !== "responses_bullets" &&
      template !== "responses_plain_english" &&
      template !== "responses_no_tables" &&
      template !== "responses_numbered_steps" &&
      template !== "response_style_generalized_guidance")
  ) {
    return null;
  }
  return createResponseStyleCanonicalMatch({
    template,
    family,
    subject,
    value,
  });
}

async function resolveManagedResponseStyleLearning(params: {
  runtime: MemoryMiddlewareRuntime;
  input: CandidateSubmissionInput;
}): Promise<ManagedResponseStyleResolution | null> {
  const rawCandidates =
    typeof params.input.metadata?.raw === "string" && params.input.metadata.raw.trim().length > 0
      ? [params.input.metadata.raw]
      : [];
  const resolution = await resolveResponseStyleIngestion({
    config: params.runtime.config,
    content: params.input.content,
    primarySource: "content",
    rawCandidates,
    mode: "candidate_learning",
    allowPhrasePatternMatch: true,
  });
  return resolution?.action === "capture"
    ? {
        ...resolution,
        source: resolution.source === "transcript" ? "content" : resolution.source,
      }
    : null;
}

async function resolveManagedProjectFactLearning(
  input: CandidateSubmissionInput,
): Promise<ManagedProjectFactResolution | null> {
  const rawCandidates =
    typeof input.metadata?.raw === "string" && input.metadata.raw.trim().length > 0
      ? [input.metadata.raw]
      : [];
  return resolveProjectFactIngestion({
    content: input.content,
    primarySource: "content",
    rawCandidates,
    mode: "candidate_learning",
  }).then((resolution) =>
    resolution
      ? {
          ...resolution,
          source: resolution.source === "transcript" ? "content" : resolution.source,
        }
      : null,
  );
}

async function resolveManagedProjectFactCorrection(params: {
  input: CandidateSubmissionInput;
  context?: OpenClawPluginToolContext;
}): Promise<ManagedProjectFactResolution | null> {
  const { input, context } = params;
  const rawCandidates: string[] = [];
  if (typeof input.metadata?.raw === "string" && input.metadata.raw.trim().length > 0) {
    rawCandidates.push(input.metadata.raw);
  }
  const rawFromContext = await resolveLatestUserTurnFromContext(context);
  if (rawFromContext && !rawCandidates.includes(rawFromContext)) {
    rawCandidates.push(rawFromContext);
  }
  return resolveProjectFactIngestion({
    content: input.content,
    primarySource: "content",
    rawCandidates,
    mode: "candidate_correction",
  }).then((resolution) =>
    resolution
      ? {
          ...resolution,
          source: resolution.source === "transcript" ? "content" : resolution.source,
        }
      : null,
  );
}

async function resolveManagedRecurringProcedureSubmission(params: {
  input: CandidateSubmissionInput;
  context?: OpenClawPluginToolContext;
}): Promise<ManagedRecurringProcedureResolution | null> {
  const { input, context } = params;
  const rawCandidates: string[] = [];
  if (typeof input.metadata?.raw === "string" && input.metadata.raw.trim().length > 0) {
    rawCandidates.push(input.metadata.raw);
  }
  const rawFromContext = await resolveLatestUserTurnFromContext(context);
  if (rawFromContext && !rawCandidates.includes(rawFromContext)) {
    rawCandidates.push(rawFromContext);
  }
  return resolveRecurringProcedureIngestion({
    content: input.content,
    primarySource: "content",
    rawCandidates,
  }).then((resolution) =>
    resolution
      ? {
          ...resolution,
          source: resolution.source === "transcript" ? "content" : resolution.source,
        }
      : null,
  );
}

async function resolveManagedWorkflowImprovementSubmission(params: {
  runtime: MemoryMiddlewareRuntime;
  input: CandidateSubmissionInput;
  context?: OpenClawPluginToolContext;
}): Promise<ManagedWorkflowImprovementResolution | null> {
  const { input, context } = params;
  const rawCandidates: string[] = [];
  if (typeof input.metadata?.raw === "string" && input.metadata.raw.trim().length > 0) {
    rawCandidates.push(input.metadata.raw);
  }
  const rawFromContext = await resolveLatestUserTurnFromContext(context);
  if (rawFromContext && !rawCandidates.includes(rawFromContext)) {
    rawCandidates.push(rawFromContext);
  }
  const resolution = await resolveWorkflowImprovementIngestion({
    config: params.runtime.config,
    content: input.content,
    primarySource: "content",
    rawCandidates,
    projectId: input.projectId,
    allowPhrasePatternMatch: true,
  });
  if (!resolution) {
    return null;
  }

  return {
    familyId: resolution.familyId,
    parsed: resolution.parsed,
    lessonFamily: resolution.lessonFamily,
    reviewMode: resolution.reviewMode,
    ...(resolution.lessonKey ? { lessonKey: resolution.lessonKey } : {}),
    ...(resolution.toolKey ? { toolKey: resolution.toolKey } : {}),
    ...(resolution.guidancePattern ? { guidancePattern: resolution.guidancePattern } : {}),
    source: resolution.source === "transcript" ? "content" : resolution.source,
    detectionSource: resolution.detectionSource,
    confidence: resolution.confidence,
    evidence: resolution.evidence,
    observedText: resolution.observedText,
  };
}

async function resolveManagedCorrectionSubmission(params: {
  input: CandidateSubmissionInput;
  context?: OpenClawPluginToolContext;
}): Promise<{
  parsed: NonNullable<ReturnType<typeof parseManagedCorrectionCandidateContent>>;
  source: "content" | "raw";
  detectionSource?: "semantic";
  confidence?: ResponseStyleSemanticConfidence;
  evidence?: string[];
} | null> {
  const { input, context } = params;
  const parsedFromContent = parseManagedCorrectionCandidateContent(input.content);
  if (isManagedCorrectionMatch(parsedFromContent)) {
    return { parsed: parsedFromContent, source: "content" };
  }

  const rawCandidates: string[] = [];
  if (typeof input.metadata?.raw === "string" && input.metadata.raw.trim().length > 0) {
    rawCandidates.push(input.metadata.raw);
  }
  const rawFromContext = await resolveLatestUserTurnFromContext(context);
  if (rawFromContext && !rawCandidates.includes(rawFromContext)) {
    rawCandidates.push(rawFromContext);
  }

  for (const rawCandidate of rawCandidates) {
    const parsedFromRawContent = parseManagedCorrectionCandidateContent(rawCandidate);
    if (isManagedCorrectionMatch(parsedFromRawContent)) {
      return { parsed: parsedFromRawContent, source: "raw" };
    }

    const parsedFromRawTurn = parseOrdinaryTurnAutoCapturePreference(
      rawCandidate,
      "user-preference-v2",
    );
    if (isManagedCorrectionMatch(parsedFromRawTurn)) {
      return { parsed: parsedFromRawTurn, source: "raw" };
    }

    const semanticFromRaw = detectResponseStyleSemanticDecision(rawCandidate);
    if (
      semanticFromRaw.action === "capture" &&
      semanticFromRaw.match.captureClass === "requirement_correction"
    ) {
      return {
        parsed: toOrdinaryTurnResponseStyleMatch(semanticFromRaw.match) as NonNullable<
          ReturnType<typeof parseManagedCorrectionCandidateContent>
        >,
        source: "raw",
        detectionSource: "semantic",
        confidence: semanticFromRaw.confidence,
        evidence: semanticFromRaw.evidence,
      };
    }
  }

  const semanticFromContent = detectResponseStyleSemanticDecision(input.content);
  if (
    semanticFromContent.action === "capture" &&
    semanticFromContent.match.captureClass === "requirement_correction"
  ) {
    return {
      parsed: toOrdinaryTurnResponseStyleMatch(semanticFromContent.match) as NonNullable<
        ReturnType<typeof parseManagedCorrectionCandidateContent>
      >,
      source: "content",
      detectionSource: "semantic",
      confidence: semanticFromContent.confidence,
      evidence: semanticFromContent.evidence,
    };
  }

  return null;
}

async function normalizeManagedToolCandidateInput(params: {
  runtime: MemoryMiddlewareRuntime;
  input: CandidateSubmissionInput;
  context?: OpenClawPluginToolContext;
}): Promise<CandidateSubmissionInput> {
  const { input, context } = params;
  const correctionOverride = await resolveManagedCorrectionSubmission({
    input,
    context,
  });

  if (input.kind === "learning") {
    if (correctionOverride) {
      const normalizedCorrectionInput = mergeCandidateMetadata(
        {
          ...input,
          kind: "correction",
          content: correctionOverride.parsed.content,
        },
        {
          classificationAdjustment: {
            source: "candidate_submit_normalizer",
            matchedFrom: correctionOverride.source,
            fromKind: "learning",
            toKind: "correction",
            reason: "bounded_correction_match",
          },
        },
      );
      return await normalizeManagedToolCandidateInput({
        runtime: params.runtime,
        input: normalizedCorrectionInput,
        context,
      });
    }

    const projectFactCorrectionOverride = await resolveManagedProjectFactCorrection({
      input,
      context,
    });
    if (projectFactCorrectionOverride) {
      const normalizedCorrectionInput = mergeCandidateMetadata(
        {
          ...input,
          kind: "correction",
          content: projectFactCorrectionOverride.parsed.content,
        },
        {
          classificationAdjustment: {
            source: "candidate_submit_normalizer",
            matchedFrom: projectFactCorrectionOverride.source,
            fromKind: "learning",
            toKind: "correction",
            reason: "bounded_project_fact_correction_match",
          },
        },
      );
      return await normalizeManagedToolCandidateInput({
        runtime: params.runtime,
        input: normalizedCorrectionInput,
        context,
      });
    }

    const responseStyleResolution = await resolveManagedResponseStyleLearning({
      runtime: params.runtime,
      input,
    });
    if (responseStyleResolution) {
      const patch = {
        category: "user_requirement",
        source: "explicit_user_requirement",
        autoCapture: {
          source: "model_tool_candidate_submit",
          captureSeam: "model_tool_primary",
          profile: responseStyleResolution.parsed.profile,
          captureClass: responseStyleResolution.parsed.captureClass,
          reasonCode: responseStyleResolution.parsed.reasonCode,
          template: responseStyleResolution.parsed.template,
          responseStyleFamily: responseStyleResolution.responseStyleFamily,
          key: responseStyleResolution.parsed.key,
          subjectKey: responseStyleResolution.parsed.subjectKey,
          subject: responseStyleResolution.parsed.subject,
          normalizedSubject: responseStyleResolution.parsed.normalizedSubject,
          value: responseStyleResolution.parsed.value,
          normalizedValue: responseStyleResolution.parsed.normalizedValue,
          toolName: "memory_candidate_submit",
        },
        ...buildResponseStyleSemanticMetadata({
          detectionSource: responseStyleResolution.detectionSource,
          confidence: responseStyleResolution.confidence,
          evidence: responseStyleResolution.evidence,
        }),
        ...(responseStyleResolution.reviewMode !== "direct"
          ? buildPendingConfirmationMetadata({
              confidence: responseStyleResolution.confidence,
              evidence: responseStyleResolution.evidence,
              responseStyleFamily: responseStyleResolution.responseStyleFamily,
              state: responseStyleResolution.reviewMode,
            })
          : {}),
      };
      return isCanonicalizableResolvedResponseStyleIngestion(responseStyleResolution)
        ? mergeCanonicalResolvedIngestionMetadata({
            input,
            resolution: responseStyleResolution,
            patch,
          })
        : mergeCandidateMetadata(input, patch);
    }

    const projectFactResolution = await resolveManagedProjectFactLearning(input);
    if (projectFactResolution) {
      return mergeCanonicalResolvedIngestionMetadata({
        input,
        resolution: projectFactResolution,
        patch: {
          category: "project_fact",
          source: "explicit_project_fact",
          subject_key: projectFactResolution.parsed.subjectKey,
          autoCapture: {
            source: "model_tool_candidate_submit",
            captureSeam: "model_tool_primary",
            profile: projectFactResolution.parsed.profile,
            captureClass: projectFactResolution.parsed.captureClass,
            reasonCode: projectFactResolution.parsed.reasonCode,
            template: projectFactResolution.parsed.template,
            factFamily: projectFactResolution.factFamily,
            ...(projectFactResolution.fieldKey ? { fieldKey: projectFactResolution.fieldKey } : {}),
            key: projectFactResolution.parsed.key,
            subjectKey: projectFactResolution.parsed.subjectKey,
            subject: projectFactResolution.parsed.subject,
            normalizedSubject: projectFactResolution.parsed.normalizedSubject,
            value: projectFactResolution.parsed.value,
            normalizedValue: projectFactResolution.parsed.normalizedValue,
            ...(projectFactResolution.parsed.projectScope
              ? { projectScope: projectFactResolution.parsed.projectScope }
              : {}),
            ...(projectFactResolution.parsed.normalizedProjectScope
              ? { normalizedProjectScope: projectFactResolution.parsed.normalizedProjectScope }
              : {}),
            toolName: "memory_candidate_submit",
          },
          ...(projectFactResolution.detectionSource === "semantic"
            ? buildProjectFactSemanticMetadata({
                detectionSource: projectFactResolution.detectionSource,
                confidence: projectFactResolution.confidence,
                evidence: projectFactResolution.evidence,
                factFamily: projectFactResolution.factFamily,
                ...(projectFactResolution.fieldKey
                  ? { fieldKey: projectFactResolution.fieldKey }
                  : {}),
              })
            : {}),
          ...buildProjectFactPendingConfirmationMetadata({
            confidence: projectFactResolution.confidence,
            evidence: projectFactResolution.evidence,
            factFamily: projectFactResolution.factFamily,
            state:
              projectFactResolution.factFamily === "generalized_reference"
                ? "hold_for_more_evidence"
                : "pending_confirmation",
            ...(projectFactResolution.fieldKey ? { fieldKey: projectFactResolution.fieldKey } : {}),
            ...(projectFactResolution.factFamily === "generalized_reference"
              ? { clusterKey: projectFactResolution.parsed.key }
              : {}),
          }),
        },
      });
    }

    const parsed =
      resolveAutoPromotableFeedbackSubmission(input) ??
      (typeof input.metadata?.raw === "string"
        ? parseOrdinaryTurnAutoCapturePreference(input.metadata.raw, "user-preference-v2")
        : null);
    if (!parsed) {
      return input;
    }
    return mergeCandidateMetadata(input, {
      category:
        parsed.captureClass === "explicit_requirement"
          ? "user_requirement"
          : parsed.captureClass === "explicit_project_fact"
            ? "project_fact"
            : "user_preference",
      source:
        parsed.captureClass === "explicit_requirement"
          ? "explicit_user_requirement"
          : parsed.captureClass === "explicit_project_fact"
            ? "explicit_project_fact"
            : "explicit_user_statement",
      autoCapture: {
        source: "model_tool_candidate_submit",
        captureSeam: "model_tool_primary",
        profile: parsed.profile,
        captureClass: parsed.captureClass,
        reasonCode: parsed.reasonCode,
        template: parsed.template,
        key: parsed.key,
        subjectKey: parsed.subjectKey,
        subject: parsed.subject,
        value: parsed.value,
        ...(parsed.responseStyleFamily ? { responseStyleFamily: parsed.responseStyleFamily } : {}),
        ...(parsed.projectScope ? { projectScope: parsed.projectScope } : {}),
        toolName: "memory_candidate_submit",
      },
    });
  }

  if (input.kind === "procedure") {
    const procedureResolution = await resolveManagedRecurringProcedureSubmission({
      input,
      context,
    });
    if (!procedureResolution) {
      return input;
    }
    return mergeCanonicalResolvedIngestionMetadata({
      input: {
        ...input,
        content: procedureResolution.parsed.content,
      },
      resolution: procedureResolution,
      patch: {
        category:
          procedureResolution.parsed.captureClass === "recurring_procedure_correction"
            ? "recurring_procedure_correction"
            : "recurring_procedure",
        source:
          procedureResolution.parsed.captureClass === "recurring_procedure_correction"
            ? "conversational_recurring_procedure_correction"
            : "explicit_recurring_procedure",
        subject_key: procedureResolution.parsed.subjectKey,
        autoCapture: {
          source: "model_tool_candidate_submit",
          captureSeam: "model_tool_primary",
          profile: procedureResolution.parsed.profile,
          captureClass: procedureResolution.parsed.captureClass,
          reasonCode: procedureResolution.parsed.reasonCode,
          template: procedureResolution.parsed.template,
          procedureFamily: procedureResolution.procedureFamily,
          ...(procedureResolution.procedureKey
            ? { procedureKey: procedureResolution.procedureKey }
            : {}),
          key: procedureResolution.parsed.key,
          subjectKey: procedureResolution.parsed.subjectKey,
          subject: procedureResolution.parsed.subject,
          normalizedSubject: procedureResolution.parsed.normalizedSubject,
          title: procedureResolution.parsed.title,
          steps: procedureResolution.parsed.steps ?? [],
          value: procedureResolution.parsed.value,
          normalizedValue: procedureResolution.parsed.normalizedValue,
          toolName: "memory_candidate_submit",
        },
        ...buildRecurringProcedureSemanticMetadata({
          detectionSource: procedureResolution.detectionSource,
          confidence: procedureResolution.confidence,
          evidence: procedureResolution.evidence,
          procedureFamily: procedureResolution.procedureFamily,
          ...(procedureResolution.procedureKey
            ? { procedureKey: procedureResolution.procedureKey }
            : {}),
        }),
        ...(procedureResolution.parsed.captureClass !== "recurring_procedure_correction" &&
        (procedureResolution.confidence === "medium" ||
          procedureResolution.reviewMode === "hold_for_more_evidence")
          ? buildRecurringProcedurePendingConfirmationMetadata({
              confidence: procedureResolution.confidence,
              evidence: procedureResolution.evidence,
              procedureFamily: procedureResolution.procedureFamily,
              ...(procedureResolution.procedureKey
                ? { procedureKey: procedureResolution.procedureKey }
                : {}),
              state: procedureResolution.reviewMode,
            })
          : {}),
      },
    });
  }

  if (input.kind === "improvement") {
    const workflowImprovementResolution = await resolveManagedWorkflowImprovementSubmission({
      runtime: params.runtime,
      input,
      context,
    });
    if (!workflowImprovementResolution) {
      return input;
    }
    const workflowCaptureMetadata = getCaptureMetadataByWorkflowLessonFamily(
      workflowImprovementResolution.lessonFamily,
    );
    return mergeCanonicalResolvedIngestionMetadata({
      input: {
        ...input,
        content: workflowImprovementResolution.parsed.content,
      },
      resolution: workflowImprovementResolution,
      patch: {
        ...(workflowCaptureMetadata
          ? {
              category: workflowCaptureMetadata.category,
              source: workflowCaptureMetadata.source,
            }
          : {
              category: "workflow_improvement",
              source: "explicit_workflow_improvement",
            }),
        subject_key: workflowImprovementResolution.parsed.subjectKey,
        workflowPhraseInduction: {
          observedText: workflowImprovementResolution.observedText,
        },
        autoCapture: {
          source: "model_tool_candidate_submit",
          captureSeam: "model_tool_primary",
          profile: workflowImprovementResolution.parsed.profile,
          captureClass: workflowImprovementResolution.parsed.captureClass,
          reasonCode: workflowImprovementResolution.parsed.reasonCode,
          template: workflowImprovementResolution.parsed.template,
          lessonFamily: workflowImprovementResolution.lessonFamily,
          ...(workflowImprovementResolution.lessonKey
            ? { lessonKey: workflowImprovementResolution.lessonKey }
            : {}),
          ...(workflowImprovementResolution.toolKey
            ? { toolKey: workflowImprovementResolution.toolKey }
            : {}),
          ...(workflowImprovementResolution.guidancePattern
            ? { guidancePattern: workflowImprovementResolution.guidancePattern }
            : {}),
          ...(workflowImprovementResolution.parsed.needCategory
            ? { needCategory: workflowImprovementResolution.parsed.needCategory }
            : {}),
          key: workflowImprovementResolution.parsed.key,
          subjectKey: workflowImprovementResolution.parsed.subjectKey,
          subject: workflowImprovementResolution.parsed.subject,
          ...(workflowImprovementResolution.parsed.projectScope
            ? { projectScope: workflowImprovementResolution.parsed.projectScope }
            : {}),
          ...(workflowImprovementResolution.parsed.normalizedProjectScope
            ? {
                normalizedProjectScope: workflowImprovementResolution.parsed.normalizedProjectScope,
              }
            : {}),
          normalizedSubject: workflowImprovementResolution.parsed.normalizedSubject,
          value: workflowImprovementResolution.parsed.value,
          normalizedValue: workflowImprovementResolution.parsed.normalizedValue,
          ...(workflowImprovementResolution.parsed.neededCapability
            ? { neededCapability: workflowImprovementResolution.parsed.neededCapability }
            : {}),
          ...(workflowImprovementResolution.parsed.normalizedNeededCapability
            ? {
                normalizedNeededCapability:
                  workflowImprovementResolution.parsed.normalizedNeededCapability,
              }
            : {}),
          ...(workflowImprovementResolution.parsed.recommendedAction
            ? { recommendedAction: workflowImprovementResolution.parsed.recommendedAction }
            : {}),
          ...(workflowImprovementResolution.parsed.normalizedRecommendedAction
            ? {
                normalizedRecommendedAction:
                  workflowImprovementResolution.parsed.normalizedRecommendedAction,
              }
            : {}),
          ...(workflowImprovementResolution.parsed.avoidAction
            ? { avoidAction: workflowImprovementResolution.parsed.avoidAction }
            : {}),
          ...(workflowImprovementResolution.parsed.normalizedAvoidAction
            ? {
                normalizedAvoidAction: workflowImprovementResolution.parsed.normalizedAvoidAction,
              }
            : {}),
          ...(workflowImprovementResolution.parsed.rationale
            ? { rationale: workflowImprovementResolution.parsed.rationale }
            : {}),
          ...(workflowImprovementResolution.parsed.normalizedRationale
            ? { normalizedRationale: workflowImprovementResolution.parsed.normalizedRationale }
            : {}),
          ...(workflowImprovementResolution.lessonFamily === "generalized_unmet_need"
            ? { recommendationMode: "recommendation_only" }
            : { guidanceMode: "guidance_only" }),
          toolName: "memory_candidate_submit",
        },
        ...buildWorkflowImprovementSemanticMetadata({
          detectionSource: workflowImprovementResolution.detectionSource,
          confidence: workflowImprovementResolution.confidence,
          evidence: workflowImprovementResolution.evidence,
          lessonFamily: workflowImprovementResolution.lessonFamily,
          ...(workflowImprovementResolution.lessonKey
            ? { lessonKey: workflowImprovementResolution.lessonKey }
            : {}),
          ...(workflowImprovementResolution.toolKey
            ? { toolKey: workflowImprovementResolution.toolKey }
            : {}),
          ...(workflowImprovementResolution.guidancePattern
            ? { guidancePattern: workflowImprovementResolution.guidancePattern }
            : {}),
        }),
        ...buildWorkflowImprovementPendingConfirmationMetadata({
          confidence: workflowImprovementResolution.confidence,
          evidence: workflowImprovementResolution.evidence,
          lessonFamily: workflowImprovementResolution.lessonFamily,
          state: workflowImprovementResolution.reviewMode,
          ...(workflowImprovementResolution.lessonKey
            ? { lessonKey: workflowImprovementResolution.lessonKey }
            : {}),
          ...(workflowImprovementResolution.toolKey
            ? { toolKey: workflowImprovementResolution.toolKey }
            : {}),
          ...(workflowImprovementResolution.guidancePattern
            ? { guidancePattern: workflowImprovementResolution.guidancePattern }
            : {}),
          ...(workflowImprovementResolution.lessonFamily !== "supported_lesson"
            ? { clusterKey: workflowImprovementResolution.parsed.key }
            : {}),
        }),
      },
    });
  }

  if (input.kind === "correction") {
    const projectFactCorrection = await resolveManagedProjectFactCorrection({
      input,
      context,
    });
    if (projectFactCorrection) {
      return mergeCanonicalResolvedIngestionMetadata({
        input,
        resolution: projectFactCorrection,
        patch: {
          category: "project_fact_correction",
          source: "conversational_project_fact_correction",
          subject_key: projectFactCorrection.parsed.subjectKey,
          autoCapture: {
            source: "model_tool_candidate_submit",
            captureSeam: "model_tool_primary",
            profile: projectFactCorrection.parsed.profile,
            captureClass: projectFactCorrection.parsed.captureClass,
            reasonCode: projectFactCorrection.parsed.reasonCode,
            template: projectFactCorrection.parsed.template,
            factFamily: projectFactCorrection.factFamily,
            ...(projectFactCorrection.fieldKey ? { fieldKey: projectFactCorrection.fieldKey } : {}),
            key: projectFactCorrection.parsed.key,
            subjectKey: projectFactCorrection.parsed.subjectKey,
            subject: projectFactCorrection.parsed.subject,
            normalizedSubject: projectFactCorrection.parsed.normalizedSubject,
            value: projectFactCorrection.parsed.value,
            normalizedValue: projectFactCorrection.parsed.normalizedValue,
            ...(projectFactCorrection.parsed.projectScope
              ? { projectScope: projectFactCorrection.parsed.projectScope }
              : {}),
            ...(projectFactCorrection.parsed.normalizedProjectScope
              ? { normalizedProjectScope: projectFactCorrection.parsed.normalizedProjectScope }
              : {}),
            toolName: "memory_candidate_submit",
          },
          ...(projectFactCorrection.detectionSource === "semantic"
            ? buildProjectFactSemanticMetadata({
                detectionSource: projectFactCorrection.detectionSource,
                confidence: projectFactCorrection.confidence,
                evidence: projectFactCorrection.evidence,
                factFamily: projectFactCorrection.factFamily,
                ...(projectFactCorrection.fieldKey
                  ? { fieldKey: projectFactCorrection.fieldKey }
                  : {}),
              })
            : {}),
        },
      });
    }

    const parsedCorrectionOverride = correctionOverride?.parsed ?? null;
    const normalizedPreferenceKey = normalizeCorrectionPreferenceKey(input.metadata?.preferenceKey);
    const normalizedValue =
      typeof input.metadata?.value === "string" ? input.metadata.value.trim().toLowerCase() : null;
    const parsed =
      parsedCorrectionOverride ??
      (normalizedPreferenceKey && normalizedValue
        ? parseManagedCorrectionCandidateContent(
            `User correction: preferred ${normalizedPreferenceKey} is ${normalizedValue}.`,
          )
        : null) ??
      (typeof input.metadata?.raw === "string"
        ? parseOrdinaryTurnAutoCapturePreference(input.metadata.raw, "user-preference-v2")
        : null);
    if (
      !parsed ||
      (parsed.captureClass !== "preference_correction" &&
        parsed.captureClass !== "requirement_correction" &&
        parsed.captureClass !== "project_fact_correction")
    ) {
      return input;
    }
    return mergeCandidateMetadata(input, {
      category:
        parsed.captureClass === "project_fact_correction"
          ? "project_fact_correction"
          : parsed.captureClass === "requirement_correction"
            ? "user_requirement_correction"
            : "user_preference_correction",
      source:
        parsed.captureClass === "project_fact_correction"
          ? "conversational_project_fact_correction"
          : parsed.captureClass === "requirement_correction"
            ? "conversational_user_requirement_correction"
            : "conversational_user_correction",
      subject_key: parsed.subjectKey,
      ...(parsed.captureClass === "preference_correction"
        ? { preference_key: parsed.subjectKey }
        : {}),
      autoCapture: {
        source: "model_tool_candidate_submit",
        captureSeam: "model_tool_primary",
        profile: parsed.profile,
        captureClass: parsed.captureClass,
        reasonCode: parsed.reasonCode,
        template: parsed.template,
        key: parsed.key,
        subjectKey: parsed.subjectKey,
        subject: parsed.subject,
        ...(typeof parsed.normalizedSubject === "string"
          ? { normalizedSubject: parsed.normalizedSubject }
          : {}),
        value: parsed.value,
        ...(typeof parsed.normalizedValue === "string"
          ? { normalizedValue: parsed.normalizedValue }
          : {}),
        ...(parsed.responseStyleFamily ? { responseStyleFamily: parsed.responseStyleFamily } : {}),
        ...(parsed.projectScope ? { projectScope: parsed.projectScope } : {}),
        toolName: "memory_candidate_submit",
      },
      ...(correctionOverride?.detectionSource === "semantic" &&
      correctionOverride.confidence &&
      correctionOverride.evidence
        ? buildResponseStyleSemanticMetadata({
            detectionSource: correctionOverride.detectionSource,
            confidence: correctionOverride.confidence,
            evidence: correctionOverride.evidence,
          })
        : {}),
      ...(correctionOverride?.confidence === "medium" && correctionOverride.evidence
        ? buildPendingConfirmationMetadata({
            confidence: correctionOverride.confidence,
            evidence: correctionOverride.evidence,
            responseStyleFamily:
              correctionOverride.parsed.responseStyleFamily ?? "supported_template",
          })
        : {}),
    });
  }

  return input;
}

async function maybeAutoPromoteToolSubmittedPreference(params: {
  runtime: MemoryMiddlewareRuntime;
  input: CandidateSubmissionInput;
  result: CandidateSubmissionResult;
}): Promise<CandidateSubmissionResult> {
  const autoPromotion =
    params.runtime.config.autoPromotion ?? DEFAULT_MEMORY_MIDDLEWARE_AUTO_PROMOTION_CONFIG;
  if (
    autoPromotion.profile !== "explicit-user-preference-v1" ||
    !params.result.accepted ||
    !params.result.memoryObjectId
  ) {
    return params.result;
  }
  const parsedGeneral = resolveAutoPromotableFeedbackSubmission(params.input);
  const template = readNestedMetadataString(params.input.metadata, ["autoCapture", "template"]);
  const captureClass = readNestedMetadataString(params.input.metadata, [
    "autoCapture",
    "captureClass",
  ]);
  const pendingConfirmationState = readNestedMetadataString(params.input.metadata, [
    "candidateLifecycle",
    "state",
  ]);
  const isAutoPromotableResponseStyleTemplate =
    template === "responses_concise" ||
    template === "responses_bullets" ||
    template === "responses_plain_english" ||
    template === "responses_no_tables" ||
    template === "responses_numbered_steps" ||
    template === "response_style_generalized_guidance";
  if (
    pendingConfirmationState === "pending_confirmation" ||
    pendingConfirmationState === "hold_for_more_evidence" ||
    (!parsedGeneral &&
      (!isAutoPromotableResponseStyleTemplate ||
        (captureClass !== "explicit_requirement" && captureClass !== "requirement_correction")))
  ) {
    return params.result;
  }
  const autoPromotionMetadata = parsedGeneral
    ? {
        autoPromotion: {
          source: "candidate_submit_auto_promotion",
          captureSeam: "model_tool_primary",
          profile: autoPromotion.profile,
          captureProfile: "tool-submitted",
          captureClass: parsedGeneral.captureClass,
          reasonCode: parsedGeneral.reasonCode,
          key: parsedGeneral.key,
          subjectKey: parsedGeneral.subjectKey,
          subject: parsedGeneral.subject,
          value: parsedGeneral.value,
          toolName: "memory_candidate_submit",
        },
      }
    : buildToolResponseStyleAutoPromotionMetadata({
        input: params.input,
        autoPromotionProfile: autoPromotion.profile,
      });
  const reviewResult = await params.runtime.candidateReview.review({
    candidateId: params.result.memoryObjectId,
    outcome: "accepted",
    metadata: autoPromotionMetadata,
  });
  if (!reviewResult.accepted) {
    return params.result;
  }
  const promotionResult = await params.runtime.candidatePromotion.promoteToMemory({
    candidateId: params.result.memoryObjectId,
    metadata: autoPromotionMetadata,
  });
  if (!promotionResult.accepted) {
    return params.result;
  }
  return {
    ...params.result,
    memoryObjectId: promotionResult.promotedMemoryObjectId,
    reviewState: "approved",
  };
}

async function maybeAutoPromoteToolSubmittedProjectFact(params: {
  runtime: MemoryMiddlewareRuntime;
  input: CandidateSubmissionInput;
  result: CandidateSubmissionResult;
}): Promise<CandidateSubmissionResult> {
  const autoPromotion =
    params.runtime.config.autoPromotion ?? DEFAULT_MEMORY_MIDDLEWARE_AUTO_PROMOTION_CONFIG;
  if (
    autoPromotion.profile !== "explicit-user-preference-v1" ||
    !params.result.accepted ||
    !params.result.memoryObjectId ||
    params.input.kind !== "correction"
  ) {
    return params.result;
  }

  const template = readNestedMetadataString(params.input.metadata, ["autoCapture", "template"]);
  const key = readNestedMetadataString(params.input.metadata, ["autoCapture", "key"]);
  const subjectKey = readNestedMetadataString(params.input.metadata, ["autoCapture", "subjectKey"]);
  const factFamily =
    readNestedMetadataString(params.input.metadata, ["autoCapture", "factFamily"]) ??
    (readNestedMetadataString(params.input.metadata, ["autoCapture", "fieldKey"])
      ? "supported_field"
      : undefined);
  const fieldKey = readNestedMetadataString(params.input.metadata, ["autoCapture", "fieldKey"]);
  if (
    (template !== "project_fact_named_scope" &&
      template !== "project_fact_generalized_named_scope") ||
    !key ||
    !subjectKey ||
    !factFamily ||
    (fieldKey && !isSupportedProjectFactField(fieldKey))
  ) {
    return params.result;
  }

  const inspection = await inspectProjectFactLifecycle({
    config: params.runtime.config,
    key,
    subjectKey,
    ...(params.input.projectId ? { projectId: params.input.projectId } : {}),
  });
  if (!inspection) {
    return params.result;
  }

  const correctionPlan = resolveMemoryCorrectionPlan({
    familyId: "project_fact",
    trigger: "explicit_correction",
    promotionPolicy: resolveMemoryCorrectionPromotionPolicy(autoPromotion.profile),
    activeApprovedSubjectObjectIds: inspection.activeApprovedSubjectObjectIds,
  });
  if (!isExecutableMemoryObjectCorrectionPlan(correctionPlan)) {
    return params.result;
  }
  const correctionResult = await executeMemoryObjectCorrectionPlan({
    familyId: "project_fact",
    plan: correctionPlan,
    candidateId: params.result.memoryObjectId,
    reviewCandidate: params.runtime.candidateReview.review,
    promoteToMemory: params.runtime.candidatePromotion.promoteToMemory,
    promotionMetadata: buildToolProjectFactAutoPromotionMetadata({
      input: params.input,
      autoPromotionProfile:
        factFamily === "generalized_reference"
          ? "project_fact_generalized_correction_v1"
          : "project_fact_correction_v1",
    }),
    reviewerAgentId: params.input.agentId,
    config: params.runtime.config,
    schema: params.runtime.config.database?.schema ?? "memory_middleware",
    logContext: {
      key,
      subjectKey,
      factFamily,
      correctionPromotion: true,
    },
    logLabel: "project-fact correction",
    supersedeRationale:
      "older approved memory was superseded by a reviewed correction promotion for the same bounded subject",
    supersedeSource: "project-fact-correction-promotion",
    supersedeReason: "candidate_correction_promotion",
    supersedeMetadata: {
      subjectKey,
    },
  });
  if (!correctionResult.accepted || !correctionResult.promotedMemoryObjectId) {
    return params.result;
  }

  return {
    ...params.result,
    memoryObjectId: correctionResult.promotedMemoryObjectId,
    reviewState: "approved",
  };
}

async function maybeAutoPromoteToolSubmittedRecurringProcedure(params: {
  runtime: MemoryMiddlewareRuntime;
  input: CandidateSubmissionInput;
  result: CandidateSubmissionResult;
}): Promise<CandidateSubmissionResult> {
  const autoPromotion =
    params.runtime.config.autoPromotion ?? DEFAULT_MEMORY_MIDDLEWARE_AUTO_PROMOTION_CONFIG;
  if (
    autoPromotion.profile !== "explicit-user-preference-v1" ||
    !params.result.accepted ||
    !params.result.memoryObjectId ||
    params.input.kind !== "procedure"
  ) {
    return params.result;
  }

  const template = readNestedMetadataString(params.input.metadata, ["autoCapture", "template"]);
  const subjectKey = readNestedMetadataString(params.input.metadata, ["autoCapture", "subjectKey"]);
  const procedureFamily = readNestedMetadataString(params.input.metadata, [
    "autoCapture",
    "procedureFamily",
  ]) as RecurringProcedureFamily | undefined;
  const procedureKey = readNestedMetadataString(params.input.metadata, [
    "autoCapture",
    "procedureKey",
  ]);
  const title =
    readNestedMetadataString(params.input.metadata, ["autoCapture", "title"]) ??
    (procedureKey && isSupportedRecurringProcedureKey(procedureKey)
      ? getRecurringProcedureTitle(procedureKey)
      : undefined);
  const pendingConfirmationState = readNestedMetadataString(params.input.metadata, [
    "candidateLifecycle",
    "state",
  ]);
  const captureClass = readNestedMetadataString(params.input.metadata, [
    "autoCapture",
    "captureClass",
  ]);
  if (
    (template !== "named_recurring_checklist" && template !== "generalized_recurring_checklist") ||
    !subjectKey ||
    !procedureFamily ||
    (procedureKey !== undefined && !isSupportedRecurringProcedureKey(procedureKey)) ||
    !title ||
    pendingConfirmationState === "pending_confirmation" ||
    pendingConfirmationState === "hold_for_more_evidence"
  ) {
    return params.result;
  }

  const inspection = await inspectStagedRecurringProcedureLifecycle({
    runtime: params.runtime,
    key:
      readNestedMetadataString(params.input.metadata, ["autoCapture", "key"]) ??
      params.result.memoryObjectId,
    subjectKey,
  });
  if (!inspection) {
    if (captureClass === "recurring_procedure_correction") {
      return params.result;
    }
    return autoPromoteRecurringProcedureCandidateFromTool({
      runtime: params.runtime,
      candidateId: params.result.memoryObjectId,
      input: params.input,
      title,
      subjectKey,
      procedureFamily,
      ...(procedureKey && isSupportedRecurringProcedureKey(procedureKey) ? { procedureKey } : {}),
      correctionPlan: null,
    });
  }

  if (
    inspection.hasActiveValidatedSubjectTargets &&
    captureClass !== "recurring_procedure_correction"
  ) {
    return params.result;
  }

  if (
    procedureFamily === "generalized_named_checklist" &&
    captureClass !== "recurring_procedure_correction"
  ) {
    return params.result;
  }

  const recurringProcedureCorrectionPlan =
    captureClass === "recurring_procedure_correction"
      ? resolveMemoryCorrectionPlan({
          familyId: "recurring_procedure",
          trigger: "explicit_correction",
          promotionPolicy: resolveMemoryCorrectionPromotionPolicy(autoPromotion.profile),
          activeValidatedSubjectProcedureIds: inspection.activeValidatedSubjectProcedureIds,
        })
      : null;

  return autoPromoteRecurringProcedureCandidateFromTool({
    runtime: params.runtime,
    candidateId: params.result.memoryObjectId,
    input: params.input,
    title,
    subjectKey,
    procedureFamily,
    ...(procedureKey && isSupportedRecurringProcedureKey(procedureKey) ? { procedureKey } : {}),
    correctionPlan: recurringProcedureCorrectionPlan,
  });
}

async function resolveManagedAutoCaptureKey(params: {
  runtime: MemoryMiddlewareRuntime;
  input: CandidateSubmissionInput;
  context?: OpenClawPluginToolContext;
}): Promise<string | null> {
  const { input, context } = params;
  const metadata = input.metadata;
  const directKey = extractAutoCaptureKey(metadata);
  if (directKey) {
    return directKey;
  }

  if (input.kind === "learning") {
    const parsed =
      parseAutoCaptureManagedCandidateContent(input.content) ??
      (typeof metadata?.raw === "string"
        ? parseOrdinaryTurnAutoCapturePreference(metadata.raw, "user-preference-v2")
        : null);
    return parsed?.key ?? resolveResponseStyleLearningParaphraseKey(input.content);
  }

  if (input.kind === "correction") {
    const parsed =
      parseManagedCorrectionCandidateContent(input.content) ??
      (typeof metadata?.raw === "string"
        ? parseOrdinaryTurnAutoCapturePreference(metadata.raw, "user-preference-v2")
        : null);
    return parsed?.key ?? null;
  }

  if (input.kind === "improvement") {
    const rawCandidates: string[] = [];
    if (typeof metadata?.raw === "string" && metadata.raw.trim().length > 0) {
      rawCandidates.push(metadata.raw);
    }
    const rawFromContext = await resolveLatestUserTurnFromContext(context);
    if (rawFromContext && !rawCandidates.includes(rawFromContext)) {
      rawCandidates.push(rawFromContext);
    }
    const resolution = await resolveWorkflowImprovementIngestion({
      config: params.runtime.config,
      content: input.content,
      primarySource: "content",
      rawCandidates,
      projectId: input.projectId,
      allowPhrasePatternMatch: true,
    });
    return resolution?.parsed.key ?? null;
  }

  return null;
}

async function findExistingAutoCaptureManagedDuplicate(params: {
  runtime: MemoryMiddlewareRuntime;
  input: CandidateSubmissionInput;
  context?: OpenClawPluginToolContext;
}): Promise<{ id: string; reviewState: string } | null> {
  const key = await resolveManagedAutoCaptureKey({
    runtime: params.runtime,
    input: params.input,
    context: params.context,
  });
  const databaseUrl = params.runtime.config.database.url;
  if (!key || !databaseUrl) {
    return null;
  }

  const schema = params.runtime.config.database.schema ?? "memory_middleware";
  const inputCategory = readNestedMetadataString(params.input.metadata, ["category"]);
  const projectScopedAutoCaptureProjectId =
    typeof params.input.projectId === "string" &&
    (params.input.kind === "improvement" ||
      inputCategory === "project_fact" ||
      inputCategory === "project_fact_correction")
      ? params.input.projectId
      : null;
  try {
    return await withMemoryMiddlewarePgClient({
      config: params.runtime.config,
      run: async (client) => {
        const result = await client.query<{ id: string; review_state: string }>(
          `
        select id::text as id, review_state::text as review_state
        from "${schema}"."memory_objects"
        where (
          metadata->'candidateMetadata'->'autoCapture'->>'key' = $1
          or metadata->'autoCapture'->>'key' = $1
        )
          and ($2::uuid is null or project_id = $2::uuid)
          and review_state in ('candidate', 'approved', 'corrected')
        order by created_at desc
        limit 1
          `,
          [key, projectScopedAutoCaptureProjectId],
        );
        const row = result.rows[0];
        return row ? { id: row.id, reviewState: row.review_state } : null;
      },
    });
  } catch {
    return null;
  }
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
