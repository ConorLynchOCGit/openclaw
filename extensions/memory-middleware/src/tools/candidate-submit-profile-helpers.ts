import type { CandidateSubmissionInput } from "../db/runtime.js";
import {
  readCanonicalMemoryIngestionCandidateFromMetadata,
  readCanonicalFirstMetadataString,
} from "../memory-canonical-compat.js";
import { type CompatibilityMemoryProfileId } from "../memory-compatibility-profile.js";
import {
  readSubmissionProfileId,
  readWorkflowSubmissionCaptureCategory,
} from "../memory-profile-routing.js";
import {
  createResponseStyleCanonicalMatch,
  type ResponseStyleFamily,
} from "../response-style-semantic.js";
import { resolveCanonicalWorkflowAutoReviewProfile } from "../workflow-canonical-policy.js";
import { type WorkflowImprovementLessonFamily } from "../workflow-improvement-semantic.js";

const RESPONSE_STYLE_CANONICAL_TEMPLATES = new Set([
  "responses_concise",
  "responses_bullets",
  "responses_plain_english",
  "responses_no_tables",
  "responses_numbered_steps",
  "response_style_generalized_guidance",
]);

const WORKFLOW_SEMANTIC_EMBEDDING_CAPTURE_CLASSES = new Set([
  "workflow_environment_constraint",
  "workflow_tool_gotcha",
  "workflow_api_workaround",
]);

export type ResponseStyleCanonicalTemplate =
  | "responses_concise"
  | "responses_bullets"
  | "responses_plain_english"
  | "responses_no_tables"
  | "responses_numbered_steps"
  | "response_style_generalized_guidance";

export type SubmissionCompatibilityProfileId = CompatibilityMemoryProfileId;

export function isPendingCandidateLifecycleState(value: string | undefined): boolean {
  return value === "pending_confirmation" || value === "hold_for_more_evidence";
}

export function isResponseStyleCanonicalTemplate(
  value: string | undefined,
): value is ResponseStyleCanonicalTemplate {
  return Boolean(value && RESPONSE_STYLE_CANONICAL_TEMPLATES.has(value));
}

export function isExplicitRequirementCaptureClass(value: string | undefined): boolean {
  return value === "explicit_requirement";
}

export function isRequirementCorrectionCaptureClass(value: string | undefined): boolean {
  return value === "requirement_correction";
}

export function isRecurringProcedureCorrectionCaptureClass(value: string | undefined): boolean {
  return value === "recurring_procedure_correction";
}

export function supportsWorkflowSemanticEmbedding(value: string | undefined): boolean {
  return Boolean(value && WORKFLOW_SEMANTIC_EMBEDDING_CAPTURE_CLASSES.has(value));
}

export function readNestedMetadataString(
  metadata: Record<string, unknown> | undefined,
  path: string[],
): string | undefined {
  return readCanonicalFirstMetadataString(metadata, path);
}

function readLegacyAutoCaptureRecord(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> | null {
  const autoCapture = metadata?.autoCapture;
  return autoCapture && typeof autoCapture === "object" && !Array.isArray(autoCapture)
    ? (autoCapture as Record<string, unknown>)
    : null;
}

export function readAutoCaptureString(
  metadata: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  if (key === "title") {
    const canonicalCandidate = readCanonicalMemoryIngestionCandidateFromMetadata(metadata);
    const procedureTitle = canonicalCandidate?.record.facets.procedureTitle;
    if (typeof procedureTitle === "string" && procedureTitle.trim().length > 0) {
      return procedureTitle.trim();
    }
  }
  return readNestedMetadataString(metadata, ["autoCapture", key]);
}

export function readSubmissionCompatibilityProfileId(
  metadata: Record<string, unknown> | undefined,
): SubmissionCompatibilityProfileId | null {
  return readSubmissionProfileId(metadata) as SubmissionCompatibilityProfileId | null;
}

/**
 * @deprecated Active runtime code should use `readSubmissionCompatibilityProfileId`.
 */
export const readSubmissionCompatibilityFamilyId = readSubmissionCompatibilityProfileId;

/**
 * @deprecated Active runtime code should use `SubmissionCompatibilityProfileId`.
 */
export type SubmissionCompatibilityFamilyId = SubmissionCompatibilityProfileId;

export function buildToolResponseStyleAutoPromotionMetadata(params: {
  input: CandidateSubmissionInput;
  autoPromotionProfile: string;
  confirmationState?: "confirmed";
}): Record<string, unknown> {
  const semanticDetection = params.input.metadata?.semanticDetection;
  return {
    autoPromotion: {
      source: "candidate_submit_auto_promotion",
      captureSeam: "model_tool_primary",
      profile: params.autoPromotionProfile,
      captureProfile: "tool-submitted",
      captureClass: readNestedMetadataString(params.input.metadata, [
        "autoCapture",
        "captureClass",
      ]),
      reasonCode: readNestedMetadataString(params.input.metadata, ["autoCapture", "reasonCode"]),
      template: readNestedMetadataString(params.input.metadata, ["autoCapture", "template"]),
      key: readNestedMetadataString(params.input.metadata, ["autoCapture", "key"]),
      subjectKey: readNestedMetadataString(params.input.metadata, ["autoCapture", "subjectKey"]),
      subject: readNestedMetadataString(params.input.metadata, ["autoCapture", "subject"]),
      normalizedSubject: readNestedMetadataString(params.input.metadata, [
        "autoCapture",
        "normalizedSubject",
      ]),
      value: readNestedMetadataString(params.input.metadata, ["autoCapture", "value"]),
      normalizedValue: readNestedMetadataString(params.input.metadata, [
        "autoCapture",
        "normalizedValue",
      ]),
      responseStyleFamily: readNestedMetadataString(params.input.metadata, [
        "autoCapture",
        "responseStyleFamily",
      ]),
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

export function buildToolProjectFactAutoPromotionMetadata(params: {
  input: CandidateSubmissionInput;
  autoPromotionProfile: string;
  confirmationState?: "confirmed";
  confirmationMethod?: "repeat_subject_signal" | "generalized_cluster_auto_review";
}): Record<string, unknown> {
  const semanticDetection = params.input.metadata?.semanticDetection;
  const clusterKey = readAutoCaptureString(params.input.metadata, "key");
  return {
    autoPromotion: {
      source: "candidate_submit_auto_promotion",
      captureSeam: "model_tool_primary",
      profile: params.autoPromotionProfile,
      captureProfile: readAutoCaptureString(params.input.metadata, "profile"),
      captureClass: readAutoCaptureString(params.input.metadata, "captureClass"),
      reasonCode: readAutoCaptureString(params.input.metadata, "reasonCode"),
      factFamily: readAutoCaptureString(params.input.metadata, "factFamily"),
      fieldKey: readAutoCaptureString(params.input.metadata, "fieldKey"),
      key: clusterKey,
      subjectKey: readAutoCaptureString(params.input.metadata, "subjectKey"),
      projectScope: readAutoCaptureString(params.input.metadata, "projectScope"),
      normalizedProjectScope: readAutoCaptureString(
        params.input.metadata,
        "normalizedProjectScope",
      ),
      subject: readAutoCaptureString(params.input.metadata, "subject"),
      normalizedSubject: readAutoCaptureString(params.input.metadata, "normalizedSubject"),
      value: readAutoCaptureString(params.input.metadata, "value"),
      normalizedValue: readAutoCaptureString(params.input.metadata, "normalizedValue"),
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
              ? { clusterKey }
              : {}),
          },
        }
      : {}),
  };
}

export function buildToolRecurringProcedureAutoPromotionMetadata(params: {
  input: CandidateSubmissionInput;
  autoPromotionProfile: string;
  confirmationState?: "confirmed";
}): Record<string, unknown> {
  const semanticDetection = params.input.metadata?.semanticDetection;
  const legacyAutoCapture = readLegacyAutoCaptureRecord(params.input.metadata);
  return {
    autoPromotion: {
      source: "candidate_submit_auto_promotion",
      captureSeam: "model_tool_primary",
      profile: params.autoPromotionProfile,
      captureProfile: "tool-submitted",
      captureClass: readAutoCaptureString(params.input.metadata, "captureClass"),
      reasonCode: readAutoCaptureString(params.input.metadata, "reasonCode"),
      procedureFamily: readAutoCaptureString(params.input.metadata, "procedureFamily"),
      procedureKey: readAutoCaptureString(params.input.metadata, "procedureKey"),
      key: readAutoCaptureString(params.input.metadata, "key"),
      subjectKey: readAutoCaptureString(params.input.metadata, "subjectKey"),
      subject: readAutoCaptureString(params.input.metadata, "subject"),
      normalizedSubject: readAutoCaptureString(params.input.metadata, "normalizedSubject"),
      title: readAutoCaptureString(params.input.metadata, "title"),
      steps:
        legacyAutoCapture && Array.isArray(legacyAutoCapture.steps)
          ? legacyAutoCapture.steps
          : undefined,
      value: readAutoCaptureString(params.input.metadata, "value"),
      normalizedValue: readAutoCaptureString(params.input.metadata, "normalizedValue"),
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

export function asWorkflowImprovementLessonFamily(
  value: string | null | undefined,
): WorkflowImprovementLessonFamily | undefined {
  return value === "generalized_workflow_lesson" ||
    value === "generalized_project_rule" ||
    value === "generalized_unmet_need"
    ? value
    : undefined;
}

export function buildToolWorkflowImprovementAutoPromotionMetadata(params: {
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
  const semanticDetection = params.input.metadata?.semanticDetection;
  const lessonFamily = readAutoCaptureString(params.input.metadata, "lessonFamily");
  const workflowCaptureCategory = readWorkflowSubmissionCaptureCategory(params.input.metadata);
  const canonicalAutoReviewProfile = resolveCanonicalWorkflowAutoReviewProfile({
    captureClass: readAutoCaptureString(params.input.metadata, "captureClass"),
    ...(workflowCaptureCategory ? { captureCategory: workflowCaptureCategory } : {}),
    ...(lessonFamily ? { lessonFamily: asWorkflowImprovementLessonFamily(lessonFamily) } : {}),
    template: readAutoCaptureString(params.input.metadata, "template"),
  });
  const clusterKey = readAutoCaptureString(params.input.metadata, "key");
  return {
    autoPromotion: {
      source: "candidate_submit_auto_promotion",
      captureSeam: "model_tool_primary",
      profile: params.autoPromotionProfile,
      captureProfile: "tool-submitted",
      captureClass: readAutoCaptureString(params.input.metadata, "captureClass"),
      reasonCode: readAutoCaptureString(params.input.metadata, "reasonCode"),
      lessonFamily,
      key: clusterKey,
      subjectKey: readAutoCaptureString(params.input.metadata, "subjectKey"),
      subject: readAutoCaptureString(params.input.metadata, "subject"),
      projectScope: readAutoCaptureString(params.input.metadata, "projectScope"),
      normalizedProjectScope: readAutoCaptureString(
        params.input.metadata,
        "normalizedProjectScope",
      ),
      normalizedSubject: readAutoCaptureString(params.input.metadata, "normalizedSubject"),
      value: readAutoCaptureString(params.input.metadata, "value"),
      normalizedValue: readAutoCaptureString(params.input.metadata, "normalizedValue"),
      guidancePattern: readAutoCaptureString(params.input.metadata, "guidancePattern"),
      needCategory: readAutoCaptureString(params.input.metadata, "needCategory"),
      neededCapability: readAutoCaptureString(params.input.metadata, "neededCapability"),
      normalizedNeededCapability: readAutoCaptureString(
        params.input.metadata,
        "normalizedNeededCapability",
      ),
      recommendedAction: readAutoCaptureString(params.input.metadata, "recommendedAction"),
      normalizedRecommendedAction: readAutoCaptureString(
        params.input.metadata,
        "normalizedRecommendedAction",
      ),
      avoidAction: readAutoCaptureString(params.input.metadata, "avoidAction"),
      normalizedAvoidAction: readAutoCaptureString(params.input.metadata, "normalizedAvoidAction"),
      rationale: readAutoCaptureString(params.input.metadata, "rationale"),
      normalizedRationale: readAutoCaptureString(params.input.metadata, "normalizedRationale"),
      ...(canonicalAutoReviewProfile?.modeMetadata ?? { guidanceMode: "guidance_only" }),
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

export function buildResponseStyleCanonicalMatchFromInput(input: CandidateSubmissionInput) {
  const template = readNestedMetadataString(input.metadata, ["autoCapture", "template"]);
  const family =
    (readNestedMetadataString(input.metadata, [
      "autoCapture",
      "responseStyleFamily",
    ]) as ResponseStyleFamily | null) ?? "supported_template";
  const subject = readNestedMetadataString(input.metadata, ["autoCapture", "subject"]);
  const value = readNestedMetadataString(input.metadata, ["autoCapture", "value"]);
  if (!template || !subject || !value || !isResponseStyleCanonicalTemplate(template)) {
    return null;
  }
  return createResponseStyleCanonicalMatch({
    template,
    family,
    subject,
    value,
  });
}
