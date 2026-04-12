import type { OpenClawPluginToolContext } from "../../api.js";
import { DEFAULT_MEMORY_MIDDLEWARE_AUTO_PROMOTION_CONFIG } from "../config.js";
import type { CandidateSubmissionInput, CandidateSubmissionResult } from "../db/runtime.js";
import {
  attemptApprovedMemoryObjectCorrectionPromotion,
  resolveMemoryCorrectionPromotionPolicy,
  resolveMemoryCorrectionPlan,
} from "../memory-correction-engine.js";
import type { OrdinaryTurnAutoCaptureMatch } from "../memory-ingestion-types.js";
import {
  shouldSkipImmediateConfirmation,
  shouldSkipImmediateProjectFactConfirmation,
  shouldSkipImmediateRecurringProcedureConfirmation,
  shouldSkipImmediateWorkflowImprovementConfirmation,
} from "../memory-lifecycle-metadata.js";
import { readWorkflowSubmissionCaptureCategory } from "../memory-profile-routing.js";
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
  isSupportedRecurringProcedureKey,
  type RecurringProcedureFamily,
  type RecurringProcedureKey,
  type RecurringProcedureSemanticConfidence,
} from "../recurring-procedure-semantic.js";
import {
  inspectResponseStyleLifecycle,
  isExpiredPendingResponseStyleCandidate,
} from "../response-style-lifecycle.js";
import { maybeInduceResponseStylePhrasePattern } from "../response-style-phrase-induction.js";
import {
  createResponseStyleCanonicalMatch,
  isResponseStyleCorrectionMatch,
  isResponseStyleLearningMatch,
  type ResponseStyleFamily,
} from "../response-style-semantic.js";
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
import { maybeInduceWorkflowPhrasePattern } from "../workflow-phrase-induction.js";
import {
  asWorkflowImprovementLessonFamily,
  buildResponseStyleCanonicalMatchFromInput,
  buildToolProjectFactAutoPromotionMetadata,
  buildToolRecurringProcedureAutoPromotionMetadata,
  buildToolResponseStyleAutoPromotionMetadata,
  buildToolWorkflowImprovementAutoPromotionMetadata,
  isRequirementCorrectionCaptureClass,
  readNestedMetadataString,
  readSubmissionCompatibilityProfileId,
  supportsWorkflowSemanticEmbedding,
} from "./candidate-submit-profile-helpers.js";
import {
  autoPromoteRecurringProcedureCandidateFromTool,
  inspectStagedRecurringProcedureLifecycle as inspectRecurringProcedureStagedLifecycle,
} from "./candidate-submit-tool-auto-promotion.js";

export async function maybeResolveExistingResponseStyleCandidate(params: {
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

export async function maybeResolveExistingProjectFactCandidate(params: {
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

export async function maybeResolveExistingRecurringProcedureCandidate(params: {
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

  const inspection = await inspectRecurringProcedureStagedLifecycle({
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
      supersedeValidatedProceduresBySubjectKey,
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

export async function maybeResolveExistingWorkflowImprovementCandidate(params: {
  runtime: MemoryMiddlewareRuntime;
  input: CandidateSubmissionInput;
  context?: OpenClawPluginToolContext;
}): Promise<CandidateSubmissionResult | null> {
  if (params.input.kind !== "improvement") {
    return null;
  }

  const template = readNestedMetadataString(params.input.metadata, ["autoCapture", "template"]);
  const captureClass = readNestedMetadataString(params.input.metadata, [
    "autoCapture",
    "captureClass",
  ]);
  const key = readNestedMetadataString(params.input.metadata, ["autoCapture", "key"]);
  const subjectKey = readNestedMetadataString(params.input.metadata, ["autoCapture", "subjectKey"]);
  const lessonFamily = asWorkflowImprovementLessonFamily(
    readNestedMetadataString(params.input.metadata, ["autoCapture", "lessonFamily"]),
  );
  const guidancePattern = readNestedMetadataString(params.input.metadata, [
    "autoCapture",
    "guidancePattern",
  ]);
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
  const workflowCaptureCategory = readWorkflowSubmissionCaptureCategory(params.input.metadata);
  const workflowAutoReviewProfile = resolveCanonicalWorkflowAutoReviewProfile({
    ...(captureClass ? { captureClass } : {}),
    ...(workflowCaptureCategory ? { captureCategory: workflowCaptureCategory } : {}),
    ...(lessonFamily ? { lessonFamily } : {}),
    template,
  });
  const isAutoReviewedFamily = Boolean(workflowAutoReviewProfile);
  const supportsPhraseInduction = workflowAutoReviewProfile?.supportsPhraseInduction ?? false;
  const workflowAutoReviewSource =
    workflowAutoReviewProfile?.autoReviewSource ??
    "candidate_submit_workflow_improvement_generic_auto_review";
  const workflowAutoReviewProfileId =
    workflowAutoReviewProfile?.autoReviewProfile ?? "workflow_generalized_auto_review_v1";
  const workflowClusterLabel =
    workflowAutoReviewProfile?.clusterLabel ?? "generalized workflow lesson cluster";
  const approvedWorkflowLabel =
    workflowAutoReviewProfile?.approvedLabel ?? "approved workflow-improvement memory";
  const workflowCorrectionFamilyId =
    readSubmissionCompatibilityProfileId(params.input.metadata) ??
    workflowAutoReviewProfile?.compatibilityCategory ??
    "workflow_improvement";
  if (
    (!isSupportedTemplate && !workflowAutoReviewProfile) ||
    !key ||
    !subjectKey ||
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
        ? `${workflowClusterLabel} expired without enough compatible evidence`
        : "workflow-improvement candidate confirmation window expired without later confirming evidence",
      metadata: {
        source: isAutoReviewedFamily
          ? workflowAutoReviewSource
          : "candidate_submit_workflow_improvement_confirmation",
        candidateLifecycle: {
          family: "workflow_improvement",
          state: "rejected",
          subjectKey,
          ...(lessonFamily ? { lessonFamily } : {}),
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
        rationale: `older ${workflowClusterLabel} expired without enough compatible evidence`,
        metadata: {
          source: workflowAutoReviewSource,
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
      reason: `${approvedWorkflowLabel} already exists for key ${key}`,
    };
  }

  if (
    inspection.pendingCandidate &&
    !isExpiredPendingWorkflowImprovementCandidate(inspection.pendingCandidate)
  ) {
    const pendingCandidateId = inspection.pendingCandidate.id;
    const pendingCandidateSourceEventId = inspection.pendingCandidate.sourceEventId;
    if (shouldSkipImmediateWorkflowImprovementConfirmation(inspection.pendingCandidate.createdAt)) {
      return {
        accepted: false,
        status: "failed",
        kind: params.input.kind,
        reason: isAutoReviewedFamily
          ? `${workflowClusterLabel} ${inspection.pendingCandidate.id} is still gathering evidence`
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
          ? `${workflowClusterLabel} ${inspection.pendingCandidate.id} is waiting for later evidence`
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
          rationale: `older ${workflowClusterLabel} was replaced by stronger newer conflicting evidence for the same scoped subject`,
          metadata: {
            source: workflowAutoReviewSource,
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
    const conflictingApprovedObjectIds = conflictingApprovedGeneralizedEntries.map(
      (entry) => entry.id,
    );
    const workflowCorrectionPlan = isAutoReviewedFamily
      ? resolveMemoryCorrectionPlan({
          familyId: workflowCorrectionFamilyId,
          trigger: "cluster_auto_review",
          conflictingApprovedObjectIds,
        })
      : null;
    const supersedeTargetIds =
      workflowCorrectionPlan?.status === "execute" ? workflowCorrectionPlan.supersedeTargetIds : [];
    const promotionMetadata = buildToolWorkflowImprovementAutoPromotionMetadata({
      input: params.input,
      autoPromotionProfile: isAutoReviewedFamily
        ? workflowAutoReviewProfileId
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
    const promotionResult:
      | { accepted: false; reason?: string }
      | { accepted: true; promotedMemoryObjectId?: string | null; sourceEventId?: string } =
      isAutoReviewedFamily
        ? await (async () => {
            const correctionAttempt = await attemptApprovedMemoryObjectCorrectionPromotion({
              familyId: workflowCorrectionFamilyId,
              trigger: "cluster_auto_review",
              conflictingApprovedObjectIds,
              candidateId: pendingCandidateId,
              reviewCandidate: params.runtime.candidateReview.review,
              promoteToMemory: params.runtime.candidatePromotion.promoteToMemory,
              promotionMetadata,
              reviewerAgentId: params.input.agentId ?? params.context?.agentId,
              config: params.runtime.config,
              schema: params.runtime.config.database?.schema ?? "memory_middleware",
              logContext: {
                key,
                subjectKey,
                lessonFamily,
                correctionPromotion: true,
              },
              logLabel: "workflow-improvement auto-review",
              supersedeRationale:
                "older approved workflow guidance was superseded by reviewed clustered evidence for the same scoped subject",
              supersedeSource: "workflow-improvement-cluster-auto-review",
              supersedeReason: "candidate_cluster_auto_review",
              supersedeMetadata: {
                clusterKey: key,
                subjectKey,
                ...(guidancePattern ? { guidancePattern } : {}),
                evidenceCount: 2,
              },
              supersedeTargets: async ({ promotedMemoryObjectId, supersedeTargetIds }) =>
                supersedeApprovedWorkflowImprovementSubjectEntries({
                  config: params.runtime.config,
                  targetObjectIds: [...supersedeTargetIds],
                  supersededByObjectId: promotedMemoryObjectId,
                  reviewerAgentId: params.context?.agentId,
                  metadata: {
                    clusterKey: key,
                    subjectKey,
                    ...(guidancePattern ? { guidancePattern } : {}),
                    evidenceCount: 2,
                  },
                }),
            });
            if (correctionAttempt.kind === "executed") {
              return correctionAttempt;
            }
            const reviewResult = await params.runtime.candidateReview.review({
              candidateId: pendingCandidateId,
              outcome: "accepted",
              metadata: promotionMetadata,
            });
            if (!reviewResult.accepted) {
              return {
                accepted: false as const,
                reason: reviewResult.reason ?? "workflow improvement review rejected",
              };
            }
            const fallbackPromotionResult = await params.runtime.candidatePromotion.promoteToMemory(
              {
                candidateId: pendingCandidateId,
                metadata: promotionMetadata,
              },
            );
            return {
              ...fallbackPromotionResult,
              sourceEventId: pendingCandidateSourceEventId,
            };
          })()
        : await (async () => {
            const reviewResult = await params.runtime.candidateReview.review({
              candidateId: pendingCandidateId,
              outcome: "accepted",
              metadata: promotionMetadata,
            });
            if (!reviewResult.accepted) {
              return {
                accepted: false as const,
                reason: reviewResult.reason ?? "workflow improvement review rejected",
              };
            }
            const fallbackPromotionResult = await params.runtime.candidatePromotion.promoteToMemory(
              {
                candidateId: pendingCandidateId,
                metadata: promotionMetadata,
              },
            );
            return {
              ...fallbackPromotionResult,
              sourceEventId: pendingCandidateSourceEventId,
            };
          })();
    if (!promotionResult.accepted) {
      return {
        accepted: false,
        status: "failed",
        kind: params.input.kind,
        reason: promotionResult.reason ?? "workflow improvement promotion failed",
      };
    }
    if (!promotionResult.promotedMemoryObjectId) {
      return {
        accepted: false,
        status: "failed",
        kind: params.input.kind,
        reason: "workflow improvement promotion did not return a memory object id",
      };
    }
    const promotedMemoryObjectId = promotionResult.promotedMemoryObjectId;
    if (
      captureClass === "workflow_environment_constraint" ||
      captureClass === "workflow_tool_gotcha" ||
      captureClass === "workflow_api_workaround"
    ) {
      await storeApprovedProjectWorkflowSemanticEmbedding({
        config: params.runtime.config,
        cfg: params.context?.runtimeConfig ?? params.context?.config,
        agentId: params.context?.agentId,
        sessionKey: params.context?.sessionKey,
        memoryObjectId: promotedMemoryObjectId,
      });
    }
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
      accepted: true,
      status: "accepted",
      kind: params.input.kind,
      storage: "database",
      reviewState: "approved",
      eventId: promotionResult.sourceEventId ?? pendingCandidateSourceEventId ?? pendingCandidateId,
      memoryObjectId: promotedMemoryObjectId,
    };
  }

  return null;
}
