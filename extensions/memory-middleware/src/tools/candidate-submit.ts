import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { Type } from "@sinclair/typebox";
import { Client } from "pg";
import type { AnyAgentTool, OpenClawPluginToolContext } from "../../api.js";
import { DEFAULT_MEMORY_MIDDLEWARE_AUTO_PROMOTION_CONFIG } from "../config.js";
import {
  CANDIDATE_SUBMISSION_KINDS,
  type CandidateSubmissionInput,
  type CandidateSubmissionKind,
  type CandidateSubmissionResult,
} from "../db/runtime.js";
import {
  parseAutoCaptureManagedCandidateContent,
  parseManagedCorrectionCandidateContent,
  parseOrdinaryTurnAutoCapturePreference,
  type OrdinaryTurnAutoCaptureMatch,
} from "../ordinary-turn-auto-capture.js";
import {
  inspectProjectFactLifecycle,
  isExpiredPendingProjectFactCandidate,
} from "../project-fact-lifecycle.js";
import {
  detectProjectFactSemanticDecision,
  isSupportedProjectFactField,
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
  isSupportedRecurringProcedureKey,
  type RecurringProcedureKey,
  type RecurringProcedureSemanticConfidence,
} from "../recurring-procedure-semantic.js";
import {
  inspectResponseStyleLifecycle,
  isExpiredPendingResponseStyleCandidate,
} from "../response-style-lifecycle.js";
import {
  detectResponseStyleSemanticDecision,
  isResponseStyleCorrectionMatch,
  isResponseStyleLearningMatch,
  type ResponseStyleSemanticConfidence,
} from "../response-style-semantic.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  storeApprovedEnvironmentConstraintSemanticEmbedding,
  storeApprovedWorkflowToolGotchaSemanticEmbedding,
} from "../semantic-retrieval-routing.js";
import {
  inspectWorkflowImprovementLifecycle,
  isExpiredPendingWorkflowImprovementCandidate,
} from "../workflow-improvement-lifecycle.js";
import {
  detectWorkflowImprovementSemanticDecision,
  type WorkflowImprovementCaptureClass,
  isSupportedWorkflowImprovementLessonKey,
  type WorkflowImprovementLessonKey,
  type WorkflowImprovementReasonCode,
  type WorkflowImprovementSemanticConfidence,
  type WorkflowImprovementTemplate,
  type WorkflowImprovementToolKey,
} from "../workflow-improvement-semantic.js";
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
  let cursor: unknown = metadata;
  for (const segment of path) {
    if (!cursor || typeof cursor !== "object" || Array.isArray(cursor)) {
      return undefined;
    }
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return typeof cursor === "string" && cursor.trim().length > 0 ? cursor.trim() : undefined;
}

function isEnvironmentConstraintLessonKey(
  lessonKey: string | undefined,
): lessonKey is "python_command_unavailable" | "gateway_tools_invoke_forbidden" {
  return Boolean(lessonKey && ENVIRONMENT_CONSTRAINT_LESSON_KEYS.has(lessonKey));
}

function isWorkflowToolGotchaSemanticLessonKey(
  lessonKey: string | undefined,
): lessonKey is "vitest_wrapper_required" | "scripts_committer_required" {
  return Boolean(lessonKey && WORKFLOW_TOOL_GOTCHA_SEMANTIC_LESSON_KEYS.has(lessonKey));
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
      value:
        autoCapture && typeof autoCapture === "object" && !Array.isArray(autoCapture)
          ? (autoCapture as { value?: unknown }).value
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
}): Promise<CandidateSubmissionResult | null> {
  if (params.input.kind !== "learning" && params.input.kind !== "correction") {
    return null;
  }
  const template = readNestedMetadataString(params.input.metadata, ["autoCapture", "template"]);
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
      template !== "responses_numbered_steps")
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

  if (inspection.matchingApprovedObjectId) {
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
    if (confirmationState !== "pending_confirmation" && confidence !== "high") {
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
      subject:
        autoCapture && typeof autoCapture === "object" && !Array.isArray(autoCapture)
          ? (autoCapture as { subject?: unknown }).subject
          : undefined,
      value:
        autoCapture && typeof autoCapture === "object" && !Array.isArray(autoCapture)
          ? (autoCapture as { value?: unknown }).value
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
      title:
        autoCapture && typeof autoCapture === "object" && !Array.isArray(autoCapture)
          ? (autoCapture as { title?: unknown }).title
          : undefined,
      steps:
        autoCapture && typeof autoCapture === "object" && !Array.isArray(autoCapture)
          ? (autoCapture as { steps?: unknown }).steps
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
      value:
        autoCapture && typeof autoCapture === "object" && !Array.isArray(autoCapture)
          ? (autoCapture as { value?: unknown }).value
          : undefined,
      guidanceMode: "guidance_only",
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
  const fieldKey = readNestedMetadataString(params.input.metadata, ["autoCapture", "fieldKey"]);
  if (
    template !== "project_fact_named_scope" ||
    !key ||
    !subjectKey ||
    !fieldKey ||
    !isSupportedProjectFactField(fieldKey)
  ) {
    return null;
  }

  const inspection = await inspectProjectFactLifecycle({
    config: params.runtime.config,
    key,
    subjectKey,
  });
  if (!inspection) {
    return null;
  }

  if (
    inspection.pendingCandidate &&
    isExpiredPendingProjectFactCandidate(inspection.pendingCandidate)
  ) {
    await params.runtime.candidateReview.review({
      candidateId: inspection.pendingCandidate.id,
      outcome: "rejected",
      rationale:
        "project-fact candidate confirmation window expired without later confirming evidence",
      metadata: {
        source: "candidate_submit_project_fact_confirmation",
        candidateLifecycle: {
          family: "project_fact",
          state: "rejected",
          subjectKey,
          fieldKey,
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

  if (
    inspection.pendingCandidate &&
    !isExpiredPendingProjectFactCandidate(inspection.pendingCandidate)
  ) {
    if (shouldSkipImmediateProjectFactConfirmation(inspection.pendingCandidate.createdAt)) {
      return {
        accepted: false,
        status: "failed",
        kind: params.input.kind,
        reason: `project-fact confirmation candidate ${inspection.pendingCandidate.id} already exists`,
      };
    }
    const autoPromotion =
      params.runtime.config.autoPromotion ?? DEFAULT_MEMORY_MIDDLEWARE_AUTO_PROMOTION_CONFIG;
    if (autoPromotion.profile !== "explicit-user-preference-v1") {
      return {
        accepted: false,
        status: "failed",
        kind: params.input.kind,
        reason: `project-fact confirmation candidate ${inspection.pendingCandidate.id} is waiting for later evidence`,
      };
    }
    const promotionMetadata = buildToolProjectFactAutoPromotionMetadata({
      input: params.input,
      autoPromotionProfile: "project_fact_confirmation_v1",
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

async function autoPromoteRecurringProcedureCandidateFromTool(params: {
  runtime: MemoryMiddlewareRuntime;
  candidateId: string;
  input: CandidateSubmissionInput;
  title: string;
  subjectKey: string;
  procedureKey: RecurringProcedureKey;
  correctionPromotion: boolean;
  confirmationState?: "confirmed";
}): Promise<CandidateSubmissionResult> {
  const promotionMetadata = buildToolRecurringProcedureAutoPromotionMetadata({
    input: params.input,
    autoPromotionProfile: params.confirmationState
      ? "recurring_procedure_confirmation_v1"
      : params.correctionPromotion
        ? "recurring_procedure_correction_v1"
        : "recurring_procedure_direct_v1",
    ...(params.confirmationState ? { confirmationState: params.confirmationState } : {}),
  });
  const reviewResult = await params.runtime.candidateReview.review({
    candidateId: params.candidateId,
    outcome: "accepted",
    metadata: promotionMetadata,
  });
  if (!reviewResult.accepted) {
    return {
      accepted: false,
      status: "failed",
      kind: "procedure",
      reason: reviewResult.reason,
    };
  }
  const procedurePromotion = await params.runtime.candidatePromotion.promoteToProcedureDraft({
    candidateId: params.candidateId,
    title: params.title,
    metadata: promotionMetadata,
  });
  if (!procedurePromotion.accepted || !procedurePromotion.procedureId) {
    return {
      accepted: false,
      status: "failed",
      kind: "procedure",
      reason: !procedurePromotion.accepted
        ? procedurePromotion.reason
        : "procedure promotion failed",
    };
  }
  const validation = await params.runtime.procedureValidation.validate({
    procedureId: procedurePromotion.procedureId,
    metadata: promotionMetadata,
  });
  if (!validation.accepted || !validation.procedureId) {
    return {
      accepted: false,
      status: "failed",
      kind: "procedure",
      reason: !validation.accepted ? validation.reason : "procedure validation failed",
    };
  }
  if (params.correctionPromotion) {
    const supersedeResult = await supersedeValidatedProceduresBySubjectKey({
      config: params.runtime.config,
      subjectKey: params.subjectKey,
      supersededByProcedureId: validation.procedureId,
      metadata: promotionMetadata,
    });
    if (!supersedeResult.accepted) {
      return {
        accepted: false,
        status: "failed",
        kind: "procedure",
        reason: supersedeResult.reason,
      };
    }
  }
  return {
    accepted: true,
    status: "accepted",
    kind: "procedure",
    storage: "database",
    reviewState: "approved",
    eventId:
      procedurePromotion.sourceEventId ??
      readNestedMetadataString(params.input.metadata, ["sourceEventId"]) ??
      params.candidateId,
    memoryObjectId: validation.procedureId,
  };
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
    template !== "named_recurring_checklist" ||
    !key ||
    !subjectKey ||
    !procedureKey ||
    !isSupportedRecurringProcedureKey(procedureKey) ||
    !title
  ) {
    return null;
  }

  const inspection = await inspectRecurringProcedureLifecycle({
    config: params.runtime.config,
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

  if (inspection.activeValidatedSubjectProcedureIds.length > 0 && !isCorrection) {
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
    const autoPromotion =
      params.runtime.config.autoPromotion ?? DEFAULT_MEMORY_MIDDLEWARE_AUTO_PROMOTION_CONFIG;
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
      procedureKey,
      correctionPromotion: isCorrection,
      confirmationState: "confirmed",
    });
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
  const lessonKey = readNestedMetadataString(params.input.metadata, ["autoCapture", "lessonKey"]);
  if (
    (template !== "workflow_tool_gotcha" &&
      template !== "workflow_environment_constraint" &&
      template !== "workflow_api_workaround") ||
    !key ||
    !subjectKey ||
    !lessonKey ||
    !isSupportedWorkflowImprovementLessonKey(lessonKey)
  ) {
    return null;
  }

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
      rationale:
        "workflow-improvement candidate confirmation window expired without later confirming evidence",
      metadata: {
        source: "candidate_submit_workflow_improvement_confirmation",
        candidateLifecycle: {
          family: "workflow_improvement",
          state: "rejected",
          subjectKey,
          lessonKey,
        },
      },
    });
  }

  if (inspection.matchingApprovedObjectId) {
    return {
      accepted: false,
      status: "failed",
      kind: params.input.kind,
      reason: `approved workflow-improvement memory already exists for key ${key}`,
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
        reason: `workflow-improvement confirmation candidate ${inspection.pendingCandidate.id} already exists`,
      };
    }
    const autoPromotion =
      params.runtime.config.autoPromotion ?? DEFAULT_MEMORY_MIDDLEWARE_AUTO_PROMOTION_CONFIG;
    if (autoPromotion.profile !== "explicit-user-preference-v1") {
      return {
        accepted: false,
        status: "failed",
        kind: params.input.kind,
        reason: `workflow-improvement confirmation candidate ${inspection.pendingCandidate.id} is waiting for later evidence`,
      };
    }
    const promotionMetadata = buildToolWorkflowImprovementAutoPromotionMetadata({
      input: params.input,
      autoPromotionProfile: "workflow_improvement_confirmation_v1",
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
    if (isEnvironmentConstraintLessonKey(lessonKey) && promotionResult.promotedMemoryObjectId) {
      await storeApprovedEnvironmentConstraintSemanticEmbedding({
        config: params.runtime.config,
        cfg: params.context?.runtimeConfig ?? params.context?.config,
        agentId: params.context?.agentId,
        sessionKey: params.context?.sessionKey,
        memoryObjectId: promotionResult.promotedMemoryObjectId,
      });
    } else if (
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
    input: params.input,
    context: params.context,
  });
  const resolvedExisting = await maybeResolveExistingResponseStyleCandidate({
    runtime: params.runtime,
    input: normalizedInput,
  });
  if (resolvedExisting) {
    return resolvedExisting;
  }
  const resolvedExistingProjectFact = await maybeResolveExistingProjectFactCandidate({
    runtime: params.runtime,
    input: normalizedInput,
  });
  if (resolvedExistingProjectFact) {
    return resolvedExistingProjectFact;
  }
  const resolvedExistingRecurringProcedure = await maybeResolveExistingRecurringProcedureCandidate({
    runtime: params.runtime,
    input: normalizedInput,
  });
  if (resolvedExistingRecurringProcedure) {
    return resolvedExistingRecurringProcedure;
  }
  const resolvedExistingWorkflowImprovement =
    await maybeResolveExistingWorkflowImprovementCandidate({
      runtime: params.runtime,
      input: normalizedInput,
      context: params.context,
    });
  if (resolvedExistingWorkflowImprovement) {
    return resolvedExistingWorkflowImprovement;
  }
  if (
    normalizedInput.kind === "learning" ||
    normalizedInput.kind === "correction" ||
    normalizedInput.kind === "improvement"
  ) {
    const duplicate = await findExistingAutoCaptureManagedDuplicate({
      runtime: params.runtime,
      input: normalizedInput,
    });
    if (duplicate) {
      return {
        accepted: false,
        status: "failed",
        kind: normalizedInput.kind,
        reason: `ordinary-turn auto-capture already created ${duplicate.reviewState} candidate ${duplicate.id}`,
      };
    }
  }
  let result: CandidateSubmissionResult;
  switch (normalizedInput.kind) {
    case "learning":
      result = await params.runtime.candidateIngress.submitLearning(normalizedInput);
      break;
    case "correction":
      result = await params.runtime.candidateIngress.submitCorrectionSuggestion(normalizedInput);
      break;
    case "procedure":
      result = await params.runtime.candidateIngress.submitProcedureSuggestion(normalizedInput);
      break;
    case "improvement":
      result = await params.runtime.candidateIngress.submitImprovementNote(normalizedInput);
      break;
  }
  result = await maybeAutoPromoteToolSubmittedPreference({
    runtime: params.runtime,
    input: normalizedInput,
    result,
  });
  result = await maybeAutoPromoteToolSubmittedProjectFact({
    runtime: params.runtime,
    input: normalizedInput,
    result,
  });
  result = await maybeAutoPromoteToolSubmittedRecurringProcedure({
    runtime: params.runtime,
    input: normalizedInput,
    result,
  });
  return result;
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
  fieldKey: ProjectFactFieldKey;
}): Record<string, unknown> {
  return {
    semanticDetection: {
      source: "project_fact_semantic_v1",
      detectionSource: params.detectionSource,
      confidence: params.confidence,
      fieldKey: params.fieldKey,
      evidence: params.evidence,
    },
  };
}

function buildRecurringProcedureSemanticMetadata(params: {
  detectionSource: "semantic";
  confidence: "high" | RecurringProcedureSemanticConfidence;
  evidence: string[];
  procedureKey: RecurringProcedureKey;
}): Record<string, unknown> {
  return {
    semanticDetection: {
      source: "recurring_procedure_semantic_v1",
      detectionSource: params.detectionSource,
      confidence: params.confidence,
      procedureKey: params.procedureKey,
      evidence: params.evidence,
    },
  };
}

function buildWorkflowImprovementSemanticMetadata(params: {
  detectionSource: "semantic";
  confidence: WorkflowImprovementSemanticConfidence;
  evidence: string[];
  lessonKey: WorkflowImprovementLessonKey;
  toolKey: WorkflowImprovementToolKey;
}): Record<string, unknown> {
  return {
    semanticDetection: {
      source: "workflow_improvement_semantic_v1",
      detectionSource: params.detectionSource,
      confidence: params.confidence,
      lessonKey: params.lessonKey,
      toolKey: params.toolKey,
      evidence: params.evidence,
    },
  };
}

function buildPendingConfirmationMetadata(params: {
  confidence: ResponseStyleSemanticConfidence;
  evidence: string[];
}): Record<string, unknown> {
  const observedAt = new Date().toISOString();
  return {
    candidateLifecycle: {
      family: "response_style",
      state: "pending_confirmation",
      confidence: params.confidence,
      evidenceCount: 1,
      observedAt,
      expiresAt: new Date(Date.parse(observedAt) + 72 * 60 * 60 * 1000).toISOString(),
      evidence: params.evidence,
    },
  };
}

function buildProjectFactPendingConfirmationMetadata(params: {
  confidence: ProjectFactSemanticConfidence;
  evidence: string[];
  fieldKey: ProjectFactFieldKey;
}): Record<string, unknown> {
  const observedAt = new Date().toISOString();
  return {
    candidateLifecycle: {
      family: "project_fact",
      state: "pending_confirmation",
      confidence: params.confidence,
      evidenceCount: 1,
      observedAt,
      expiresAt: new Date(Date.parse(observedAt) + 72 * 60 * 60 * 1000).toISOString(),
      fieldKey: params.fieldKey,
      evidence: params.evidence,
    },
  };
}

function buildRecurringProcedurePendingConfirmationMetadata(params: {
  confidence: RecurringProcedureSemanticConfidence;
  evidence: string[];
  procedureKey: RecurringProcedureKey;
  observedAt?: string;
}): Record<string, unknown> {
  const observedAt = params.observedAt ?? new Date().toISOString();
  return {
    candidateLifecycle: {
      family: "recurring_procedure",
      state: "pending_confirmation",
      confidence: params.confidence,
      evidenceCount: 1,
      observedAt,
      expiresAt: new Date(Date.parse(observedAt) + 72 * 60 * 60 * 1000).toISOString(),
      procedureKey: params.procedureKey,
      evidence: params.evidence,
    },
  };
}

function buildWorkflowImprovementPendingConfirmationMetadata(params: {
  confidence: WorkflowImprovementSemanticConfidence;
  evidence: string[];
  lessonKey: WorkflowImprovementLessonKey;
  toolKey: WorkflowImprovementToolKey;
}): Record<string, unknown> {
  const observedAt = new Date().toISOString();
  return {
    candidateLifecycle: {
      family: "workflow_improvement",
      state: "pending_confirmation",
      confidence: params.confidence,
      evidenceCount: 1,
      observedAt,
      expiresAt: new Date(Date.parse(observedAt) + 72 * 60 * 60 * 1000).toISOString(),
      lessonKey: params.lessonKey,
      toolKey: params.toolKey,
      evidence: params.evidence,
    },
  };
}

function toOrdinaryTurnResponseStyleMatch(match: {
  captureClass: "explicit_requirement" | "requirement_correction";
  candidateKind: "learning" | "correction";
  reasonCode: "explicit_requirement_statement" | "explicit_requirement_correction";
  template: OrdinaryTurnAutoCaptureMatch["template"];
  subject: string;
  value: string;
  normalizedSubject: string;
  normalizedValue: string;
  content: string;
  subjectKey: string;
  key: string;
}): OrdinaryTurnAutoCaptureMatch {
  return {
    profile: "user-preference-v2",
    captureClass: match.captureClass,
    candidateKind: match.candidateKind,
    reasonCode: match.reasonCode,
    template: match.template,
    subject: match.subject,
    value: match.value,
    normalizedSubject: match.normalizedSubject,
    normalizedValue: match.normalizedValue,
    content: match.content,
    subjectKey: match.subjectKey,
    key: match.key,
  };
}

function toOrdinaryTurnProjectFactMatch(match: {
  captureClass: "explicit_project_fact" | "project_fact_correction";
  candidateKind: "learning" | "correction";
  reasonCode: "explicit_project_fact_statement" | "explicit_project_fact_correction";
  template: OrdinaryTurnAutoCaptureMatch["template"];
  projectScope: string;
  normalizedProjectScope: string;
  subject: string;
  value: string;
  normalizedSubject: string;
  normalizedValue: string;
  content: string;
  subjectKey: string;
  key: string;
}): OrdinaryTurnAutoCaptureMatch {
  return {
    profile: "user-preference-v2",
    captureClass: match.captureClass,
    candidateKind: match.candidateKind,
    reasonCode: match.reasonCode,
    template: match.template,
    subject: match.subject,
    value: match.value,
    normalizedSubject: match.normalizedSubject,
    normalizedValue: match.normalizedValue,
    content: match.content,
    subjectKey: match.subjectKey,
    key: match.key,
    projectScope: match.projectScope,
    normalizedProjectScope: match.normalizedProjectScope,
  };
}

function toOrdinaryTurnRecurringProcedureMatch(match: {
  captureClass: "explicit_recurring_procedure" | "recurring_procedure_correction";
  candidateKind: "procedure";
  reasonCode: "explicit_recurring_procedure_statement" | "recurring_procedure_correction";
  template: OrdinaryTurnAutoCaptureMatch["template"];
  procedureKey: RecurringProcedureKey;
  title: string;
  body: string;
  steps: string[];
  normalizedTitle: string;
  normalizedBody: string;
  content: string;
  subjectKey: string;
  key: string;
}): OrdinaryTurnAutoCaptureMatch {
  return {
    profile: "user-preference-v2",
    captureClass: match.captureClass,
    candidateKind: match.candidateKind,
    reasonCode: match.reasonCode,
    template: match.template,
    subject: match.title,
    value: match.body,
    normalizedSubject: match.normalizedTitle,
    normalizedValue: match.normalizedBody,
    content: match.content,
    subjectKey: match.subjectKey,
    key: match.key,
    procedureKey: match.procedureKey,
    title: match.title,
    steps: match.steps,
  };
}

function toOrdinaryTurnWorkflowImprovementMatch(match: {
  captureClass: WorkflowImprovementCaptureClass;
  candidateKind: "improvement";
  reasonCode: WorkflowImprovementReasonCode;
  template: WorkflowImprovementTemplate;
  lessonKey: WorkflowImprovementLessonKey;
  toolKey: WorkflowImprovementToolKey;
  subject: string;
  value: string;
  normalizedSubject: string;
  normalizedValue: string;
  content: string;
  subjectKey: string;
  key: string;
}): OrdinaryTurnAutoCaptureMatch {
  return {
    profile: "user-preference-v2",
    captureClass: match.captureClass,
    candidateKind: match.candidateKind,
    reasonCode: match.reasonCode,
    template: match.template,
    subject: match.subject,
    value: match.value,
    normalizedSubject: match.normalizedSubject,
    normalizedValue: match.normalizedValue,
    content: match.content,
    subjectKey: match.subjectKey,
    key: match.key,
    lessonKey: match.lessonKey,
    toolKey: match.toolKey,
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
  parsed: OrdinaryTurnAutoCaptureMatch;
  source: "content" | "raw";
  detectionSource: "deterministic" | "semantic";
  confidence: "high" | ResponseStyleSemanticConfidence;
  evidence: string[];
};

type ManagedProjectFactResolution = {
  parsed: OrdinaryTurnAutoCaptureMatch;
  fieldKey: ProjectFactFieldKey;
  source: "content" | "raw";
  detectionSource: "deterministic" | "semantic";
  confidence: "high" | ProjectFactSemanticConfidence;
  evidence: string[];
};

type ManagedRecurringProcedureResolution = {
  parsed: OrdinaryTurnAutoCaptureMatch;
  procedureKey: RecurringProcedureKey;
  source: "content" | "raw";
  detectionSource: "semantic";
  confidence: "high" | RecurringProcedureSemanticConfidence;
  evidence: string[];
};

type ManagedWorkflowImprovementResolution = {
  parsed: OrdinaryTurnAutoCaptureMatch;
  lessonKey: WorkflowImprovementLessonKey;
  toolKey: WorkflowImprovementToolKey;
  source: "content" | "raw";
  detectionSource: "semantic";
  confidence: WorkflowImprovementSemanticConfidence;
  evidence: string[];
};

function inferProjectFactFieldKeyFromSubject(subject: string): ProjectFactFieldKey | null {
  const fieldLabel = subject.split("/").pop()?.trim().toLowerCase() ?? "";
  return fieldLabel === "default branch"
    ? "default_branch"
    : fieldLabel === "staging branch"
      ? "staging_branch"
      : fieldLabel === "primary package manager"
        ? "primary_package_manager"
        : fieldLabel === "primary environment name"
          ? "primary_environment_name"
          : null;
}

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

function isManagedResponseStyleMatch(
  parsed: OrdinaryTurnAutoCaptureMatch | null,
): parsed is OrdinaryTurnAutoCaptureMatch {
  return Boolean(
    parsed && (isResponseStyleLearningMatch(parsed) || isResponseStyleCorrectionMatch(parsed)),
  );
}

function resolveManagedResponseStyleLearning(
  input: CandidateSubmissionInput,
): ManagedResponseStyleResolution | null {
  const parsedFromContent = parseAutoCaptureManagedCandidateContent(input.content);
  if (isManagedResponseStyleMatch(parsedFromContent)) {
    return {
      parsed: parsedFromContent,
      source: "content",
      detectionSource: "deterministic",
      confidence: "high",
      evidence: ["managed_content_pattern_match"],
    };
  }

  if (typeof input.metadata?.raw === "string" && input.metadata.raw.trim().length > 0) {
    const parsedFromRaw = parseOrdinaryTurnAutoCapturePreference(
      input.metadata.raw,
      "user-preference-v2",
    );
    if (isManagedResponseStyleMatch(parsedFromRaw)) {
      return {
        parsed: parsedFromRaw,
        source: "raw",
        detectionSource: "deterministic",
        confidence: "high",
        evidence: ["raw_turn_pattern_match"],
      };
    }
    const semanticFromRaw = detectResponseStyleSemanticDecision(input.metadata.raw);
    if (semanticFromRaw.action === "capture") {
      return {
        parsed: toOrdinaryTurnResponseStyleMatch(semanticFromRaw.match),
        source: "raw",
        detectionSource: "semantic",
        confidence: semanticFromRaw.confidence,
        evidence: semanticFromRaw.evidence,
      };
    }
  }

  const semanticFromContent = detectResponseStyleSemanticDecision(input.content);
  if (semanticFromContent.action === "capture") {
    return {
      parsed: toOrdinaryTurnResponseStyleMatch(semanticFromContent.match),
      source: "content",
      detectionSource: "semantic",
      confidence: semanticFromContent.confidence,
      evidence: semanticFromContent.evidence,
    };
  }

  return null;
}

function isManagedProjectFactMatch(
  parsed: OrdinaryTurnAutoCaptureMatch | null,
): parsed is OrdinaryTurnAutoCaptureMatch {
  return Boolean(
    parsed &&
    parsed.template === "project_fact_named_scope" &&
    (parsed.captureClass === "explicit_project_fact" ||
      parsed.captureClass === "project_fact_correction"),
  );
}

function resolveManagedProjectFactLearning(
  input: CandidateSubmissionInput,
): ManagedProjectFactResolution | null {
  const parsedFromContent = parseAutoCaptureManagedCandidateContent(input.content);
  if (
    isManagedProjectFactMatch(parsedFromContent) &&
    parsedFromContent.captureClass === "explicit_project_fact"
  ) {
    const fieldKey = inferProjectFactFieldKeyFromSubject(parsedFromContent.subject);
    if (fieldKey && isSupportedProjectFactField(fieldKey)) {
      return {
        parsed: parsedFromContent,
        fieldKey,
        source: "content",
        detectionSource: "deterministic",
        confidence: "high",
        evidence: ["managed_content_pattern_match"],
      };
    }
  }

  if (typeof input.metadata?.raw === "string" && input.metadata.raw.trim().length > 0) {
    const parsedFromRaw = parseOrdinaryTurnAutoCapturePreference(
      input.metadata.raw,
      "user-preference-v2",
    );
    if (
      isManagedProjectFactMatch(parsedFromRaw) &&
      parsedFromRaw.captureClass === "explicit_project_fact"
    ) {
      const fieldKey = inferProjectFactFieldKeyFromSubject(parsedFromRaw.subject);
      if (fieldKey && isSupportedProjectFactField(fieldKey)) {
        return {
          parsed: parsedFromRaw,
          fieldKey,
          source: "raw",
          detectionSource: "deterministic",
          confidence: "high",
          evidence: ["raw_turn_pattern_match"],
        };
      }
    }

    const semanticFromRaw = detectProjectFactSemanticDecision(input.metadata.raw);
    if (
      semanticFromRaw.action === "capture" &&
      semanticFromRaw.match.captureClass === "explicit_project_fact"
    ) {
      return {
        parsed: toOrdinaryTurnProjectFactMatch(semanticFromRaw.match),
        fieldKey: semanticFromRaw.match.fieldKey,
        source: "raw",
        detectionSource: "semantic",
        confidence: semanticFromRaw.confidence,
        evidence: semanticFromRaw.evidence,
      };
    }
  }

  const semanticFromContent = detectProjectFactSemanticDecision(input.content);
  if (
    semanticFromContent.action === "capture" &&
    semanticFromContent.match.captureClass === "explicit_project_fact"
  ) {
    return {
      parsed: toOrdinaryTurnProjectFactMatch(semanticFromContent.match),
      fieldKey: semanticFromContent.match.fieldKey,
      source: "content",
      detectionSource: "semantic",
      confidence: semanticFromContent.confidence,
      evidence: semanticFromContent.evidence,
    };
  }

  return null;
}

async function resolveManagedProjectFactCorrection(params: {
  input: CandidateSubmissionInput;
  context?: OpenClawPluginToolContext;
}): Promise<ManagedProjectFactResolution | null> {
  const { input, context } = params;
  const parsedFromContent = parseManagedCorrectionCandidateContent(input.content);
  if (
    isManagedProjectFactMatch(parsedFromContent) &&
    parsedFromContent.captureClass === "project_fact_correction"
  ) {
    const fieldKey = inferProjectFactFieldKeyFromSubject(parsedFromContent.subject);
    if (fieldKey && isSupportedProjectFactField(fieldKey)) {
      return {
        parsed: parsedFromContent,
        fieldKey,
        source: "content",
        detectionSource: "deterministic",
        confidence: "high",
        evidence: ["managed_content_pattern_match"],
      };
    }
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
    const parsedFromRaw = parseOrdinaryTurnAutoCapturePreference(
      rawCandidate,
      "user-preference-v2",
    );
    if (
      isManagedProjectFactMatch(parsedFromRaw) &&
      parsedFromRaw.captureClass === "project_fact_correction"
    ) {
      const fieldKey = inferProjectFactFieldKeyFromSubject(parsedFromRaw.subject);
      if (fieldKey && isSupportedProjectFactField(fieldKey)) {
        return {
          parsed: parsedFromRaw,
          fieldKey,
          source: "raw",
          detectionSource: "deterministic",
          confidence: "high",
          evidence: ["raw_turn_pattern_match"],
        };
      }
    }

    const semanticFromRaw = detectProjectFactSemanticDecision(rawCandidate);
    if (
      semanticFromRaw.action === "capture" &&
      semanticFromRaw.match.captureClass === "project_fact_correction"
    ) {
      return {
        parsed: toOrdinaryTurnProjectFactMatch(semanticFromRaw.match),
        fieldKey: semanticFromRaw.match.fieldKey,
        source: "raw",
        detectionSource: "semantic",
        confidence: semanticFromRaw.confidence,
        evidence: semanticFromRaw.evidence,
      };
    }
  }

  const semanticFromContent = detectProjectFactSemanticDecision(input.content);
  if (
    semanticFromContent.action === "capture" &&
    semanticFromContent.match.captureClass === "project_fact_correction"
  ) {
    return {
      parsed: toOrdinaryTurnProjectFactMatch(semanticFromContent.match),
      fieldKey: semanticFromContent.match.fieldKey,
      source: "content",
      detectionSource: "semantic",
      confidence: semanticFromContent.confidence,
      evidence: semanticFromContent.evidence,
    };
  }

  return null;
}

async function resolveManagedRecurringProcedureSubmission(params: {
  input: CandidateSubmissionInput;
  context?: OpenClawPluginToolContext;
}): Promise<ManagedRecurringProcedureResolution | null> {
  const { input, context } = params;
  const contentDecision = detectRecurringProcedureSemanticDecision(input.content);
  if (contentDecision.action === "capture") {
    return {
      parsed: toOrdinaryTurnRecurringProcedureMatch(contentDecision.match),
      procedureKey: contentDecision.match.procedureKey,
      source: "content",
      detectionSource: "semantic",
      confidence: contentDecision.confidence,
      evidence: contentDecision.evidence,
    };
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
    const semanticFromRaw = detectRecurringProcedureSemanticDecision(rawCandidate);
    if (semanticFromRaw.action !== "capture") {
      continue;
    }
    return {
      parsed: toOrdinaryTurnRecurringProcedureMatch(semanticFromRaw.match),
      procedureKey: semanticFromRaw.match.procedureKey,
      source: "raw",
      detectionSource: "semantic",
      confidence: semanticFromRaw.confidence,
      evidence: semanticFromRaw.evidence,
    };
  }

  return null;
}

async function resolveManagedWorkflowImprovementSubmission(params: {
  input: CandidateSubmissionInput;
  context?: OpenClawPluginToolContext;
}): Promise<ManagedWorkflowImprovementResolution | null> {
  const { input, context } = params;
  const contentDecision = detectWorkflowImprovementSemanticDecision(input.content);
  if (contentDecision.action === "capture") {
    return {
      parsed: toOrdinaryTurnWorkflowImprovementMatch(contentDecision.match),
      lessonKey: contentDecision.match.lessonKey,
      toolKey: contentDecision.match.toolKey,
      source: "content",
      detectionSource: "semantic",
      confidence: contentDecision.confidence,
      evidence: contentDecision.evidence,
    };
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
    const semanticFromRaw = detectWorkflowImprovementSemanticDecision(rawCandidate);
    if (semanticFromRaw.action !== "capture") {
      continue;
    }
    return {
      parsed: toOrdinaryTurnWorkflowImprovementMatch(semanticFromRaw.match),
      lessonKey: semanticFromRaw.match.lessonKey,
      toolKey: semanticFromRaw.match.toolKey,
      source: "raw",
      detectionSource: "semantic",
      confidence: semanticFromRaw.confidence,
      evidence: semanticFromRaw.evidence,
    };
  }

  return null;
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
        input: normalizedCorrectionInput,
        context,
      });
    }

    const responseStyleResolution = resolveManagedResponseStyleLearning(input);
    if (responseStyleResolution) {
      return mergeCandidateMetadata(input, {
        category: "user_requirement",
        source: "explicit_user_requirement",
        autoCapture: {
          source: "model_tool_candidate_submit",
          captureSeam: "model_tool_primary",
          profile: responseStyleResolution.parsed.profile,
          captureClass: responseStyleResolution.parsed.captureClass,
          reasonCode: responseStyleResolution.parsed.reasonCode,
          template: responseStyleResolution.parsed.template,
          key: responseStyleResolution.parsed.key,
          subjectKey: responseStyleResolution.parsed.subjectKey,
          subject: responseStyleResolution.parsed.subject,
          value: responseStyleResolution.parsed.value,
          toolName: "memory_candidate_submit",
        },
        ...(responseStyleResolution.detectionSource === "semantic"
          ? buildResponseStyleSemanticMetadata({
              detectionSource: responseStyleResolution.detectionSource,
              confidence: responseStyleResolution.confidence,
              evidence: responseStyleResolution.evidence,
            })
          : {}),
        ...(responseStyleResolution.confidence === "medium"
          ? buildPendingConfirmationMetadata({
              confidence: responseStyleResolution.confidence,
              evidence: responseStyleResolution.evidence,
            })
          : {}),
      });
    }

    const projectFactResolution = resolveManagedProjectFactLearning(input);
    if (projectFactResolution) {
      return mergeCandidateMetadata(input, {
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
          fieldKey: projectFactResolution.fieldKey,
          key: projectFactResolution.parsed.key,
          subjectKey: projectFactResolution.parsed.subjectKey,
          subject: projectFactResolution.parsed.subject,
          value: projectFactResolution.parsed.value,
          ...(projectFactResolution.parsed.projectScope
            ? { projectScope: projectFactResolution.parsed.projectScope }
            : {}),
          toolName: "memory_candidate_submit",
        },
        ...(projectFactResolution.detectionSource === "semantic"
          ? buildProjectFactSemanticMetadata({
              detectionSource: projectFactResolution.detectionSource,
              confidence: projectFactResolution.confidence,
              evidence: projectFactResolution.evidence,
              fieldKey: projectFactResolution.fieldKey,
            })
          : {}),
        ...buildProjectFactPendingConfirmationMetadata({
          confidence: projectFactResolution.confidence,
          evidence: projectFactResolution.evidence,
          fieldKey: projectFactResolution.fieldKey,
        }),
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
    return mergeCandidateMetadata(
      {
        ...input,
        content: procedureResolution.parsed.content,
      },
      {
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
          procedureKey: procedureResolution.procedureKey,
          key: procedureResolution.parsed.key,
          subjectKey: procedureResolution.parsed.subjectKey,
          subject: procedureResolution.parsed.subject,
          title:
            procedureResolution.parsed.title ??
            getRecurringProcedureTitle(procedureResolution.procedureKey),
          steps: procedureResolution.parsed.steps ?? [],
          value: procedureResolution.parsed.value,
          toolName: "memory_candidate_submit",
        },
        ...buildRecurringProcedureSemanticMetadata({
          detectionSource: procedureResolution.detectionSource,
          confidence: procedureResolution.confidence,
          evidence: procedureResolution.evidence,
          procedureKey: procedureResolution.procedureKey,
        }),
        ...(procedureResolution.confidence === "medium"
          ? buildRecurringProcedurePendingConfirmationMetadata({
              confidence: procedureResolution.confidence,
              evidence: procedureResolution.evidence,
              procedureKey: procedureResolution.procedureKey,
            })
          : {}),
      },
    );
  }

  if (input.kind === "improvement") {
    const workflowImprovementResolution = await resolveManagedWorkflowImprovementSubmission({
      input,
      context,
    });
    if (!workflowImprovementResolution) {
      return input;
    }
    return mergeCandidateMetadata(
      {
        ...input,
        content: workflowImprovementResolution.parsed.content,
      },
      {
        category: "workflow_improvement",
        source: "explicit_workflow_improvement",
        subject_key: workflowImprovementResolution.parsed.subjectKey,
        autoCapture: {
          source: "model_tool_candidate_submit",
          captureSeam: "model_tool_primary",
          profile: workflowImprovementResolution.parsed.profile,
          captureClass: workflowImprovementResolution.parsed.captureClass,
          reasonCode: workflowImprovementResolution.parsed.reasonCode,
          template: workflowImprovementResolution.parsed.template,
          lessonKey: workflowImprovementResolution.lessonKey,
          toolKey: workflowImprovementResolution.toolKey,
          key: workflowImprovementResolution.parsed.key,
          subjectKey: workflowImprovementResolution.parsed.subjectKey,
          subject: workflowImprovementResolution.parsed.subject,
          value: workflowImprovementResolution.parsed.value,
          guidanceMode: "guidance_only",
          toolName: "memory_candidate_submit",
        },
        ...buildWorkflowImprovementSemanticMetadata({
          detectionSource: workflowImprovementResolution.detectionSource,
          confidence: workflowImprovementResolution.confidence,
          evidence: workflowImprovementResolution.evidence,
          lessonKey: workflowImprovementResolution.lessonKey,
          toolKey: workflowImprovementResolution.toolKey,
        }),
        ...buildWorkflowImprovementPendingConfirmationMetadata({
          confidence: workflowImprovementResolution.confidence,
          evidence: workflowImprovementResolution.evidence,
          lessonKey: workflowImprovementResolution.lessonKey,
          toolKey: workflowImprovementResolution.toolKey,
        }),
      },
    );
  }

  if (input.kind === "correction") {
    const projectFactCorrection = await resolveManagedProjectFactCorrection({
      input,
      context,
    });
    if (projectFactCorrection) {
      return mergeCandidateMetadata(input, {
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
          fieldKey: projectFactCorrection.fieldKey,
          key: projectFactCorrection.parsed.key,
          subjectKey: projectFactCorrection.parsed.subjectKey,
          subject: projectFactCorrection.parsed.subject,
          value: projectFactCorrection.parsed.value,
          ...(projectFactCorrection.parsed.projectScope
            ? { projectScope: projectFactCorrection.parsed.projectScope }
            : {}),
          toolName: "memory_candidate_submit",
        },
        ...(projectFactCorrection.detectionSource === "semantic"
          ? buildProjectFactSemanticMetadata({
              detectionSource: projectFactCorrection.detectionSource,
              confidence: projectFactCorrection.confidence,
              evidence: projectFactCorrection.evidence,
              fieldKey: projectFactCorrection.fieldKey,
            })
          : {}),
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
        value: parsed.value,
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
  const isSupportedResponseStyleTemplate =
    template === "responses_concise" ||
    template === "responses_bullets" ||
    template === "responses_plain_english" ||
    template === "responses_no_tables" ||
    template === "responses_numbered_steps";
  if (
    pendingConfirmationState === "pending_confirmation" ||
    (!parsedGeneral &&
      (!isSupportedResponseStyleTemplate ||
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
  const fieldKey = readNestedMetadataString(params.input.metadata, ["autoCapture", "fieldKey"]);
  if (
    template !== "project_fact_named_scope" ||
    !key ||
    !subjectKey ||
    !fieldKey ||
    !isSupportedProjectFactField(fieldKey)
  ) {
    return params.result;
  }

  const inspection = await inspectProjectFactLifecycle({
    config: params.runtime.config,
    key,
    subjectKey,
  });
  if (!inspection || inspection.activeApprovedSubjectObjectIds.length === 0) {
    return params.result;
  }

  const promotionMetadata = buildToolProjectFactAutoPromotionMetadata({
    input: params.input,
    autoPromotionProfile: "project_fact_correction_v1",
  });
  const reviewResult = await params.runtime.candidateReview.review({
    candidateId: params.result.memoryObjectId,
    outcome: "accepted",
    metadata: promotionMetadata,
  });
  if (!reviewResult.accepted) {
    return params.result;
  }
  const promotionResult = await params.runtime.candidatePromotion.promoteToMemory({
    candidateId: params.result.memoryObjectId,
    metadata: promotionMetadata,
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
    template !== "named_recurring_checklist" ||
    !subjectKey ||
    !procedureKey ||
    !isSupportedRecurringProcedureKey(procedureKey) ||
    !title ||
    pendingConfirmationState === "pending_confirmation"
  ) {
    return params.result;
  }

  const inspection = await inspectRecurringProcedureLifecycle({
    config: params.runtime.config,
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
      procedureKey,
      correctionPromotion: false,
    });
  }

  if (
    inspection.activeValidatedSubjectProcedureIds.length > 0 &&
    captureClass !== "recurring_procedure_correction"
  ) {
    return params.result;
  }

  return autoPromoteRecurringProcedureCandidateFromTool({
    runtime: params.runtime,
    candidateId: params.result.memoryObjectId,
    input: params.input,
    title,
    subjectKey,
    procedureKey,
    correctionPromotion: captureClass === "recurring_procedure_correction",
  });
}

function resolveManagedAutoCaptureKey(input: CandidateSubmissionInput): string | null {
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
    const semanticDecision =
      detectWorkflowImprovementSemanticDecision(input.content).action === "capture"
        ? detectWorkflowImprovementSemanticDecision(input.content)
        : typeof metadata?.raw === "string"
          ? detectWorkflowImprovementSemanticDecision(metadata.raw)
          : null;
    return semanticDecision && semanticDecision.action === "capture"
      ? semanticDecision.match.key
      : null;
  }

  return null;
}

async function findExistingAutoCaptureManagedDuplicate(params: {
  runtime: MemoryMiddlewareRuntime;
  input: CandidateSubmissionInput;
}): Promise<{ id: string; reviewState: string } | null> {
  const key = resolveManagedAutoCaptureKey(params.input);
  const databaseUrl = params.runtime.config.database.url;
  if (!key || !databaseUrl) {
    return null;
  }

  const schema = params.runtime.config.database.schema ?? "memory_middleware";
  const client = new Client({ connectionString: databaseUrl });
  const projectScopedWorkflowImprovement =
    params.input.kind === "improvement" && typeof params.input.projectId === "string"
      ? params.input.projectId
      : null;
  try {
    await client.connect();
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
      [key, projectScopedWorkflowImprovement],
    );
    const row = result.rows[0];
    return row ? { id: row.id, reviewState: row.review_state } : null;
  } catch {
    return null;
  } finally {
    await client.end().catch(() => {});
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
