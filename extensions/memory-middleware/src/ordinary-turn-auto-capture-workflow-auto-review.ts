import type { OrdinaryTurnAutoCaptureMatch } from "./memory-ingestion-types.js";
import { resolveCanonicalWorkflowAutoReviewProfile } from "./workflow-canonical-policy.js";
import type { WorkflowImprovementLessonFamily } from "./workflow-improvement-semantic.js";

export type GeneralizedWorkflowAutoReviewSource =
  | "workflow_improvement_generic_auto_review"
  | "project_rule_generic_auto_review"
  | "unmet_need_generic_auto_review";

export type GeneralizedWorkflowAutoReviewContext = {
  profile: ReturnType<typeof resolveCanonicalWorkflowAutoReviewProfile>;
  isAutoReviewed: boolean;
  autoReviewSource: GeneralizedWorkflowAutoReviewSource;
  clusterLabel: string;
  supersedeFailureLabel: string;
};

export function resolveGeneralizedWorkflowAutoReviewContext(params: {
  lessonFamily: WorkflowImprovementLessonFamily;
  captureClass: string;
}): GeneralizedWorkflowAutoReviewContext {
  const profile = resolveCanonicalWorkflowAutoReviewProfile({
    lessonFamily: params.lessonFamily,
    captureClass: params.captureClass,
  });
  const captureCategory = profile?.captureCategory;
  return {
    profile,
    isAutoReviewed: Boolean(profile),
    autoReviewSource:
      captureCategory === "project_rule"
        ? "project_rule_generic_auto_review"
        : captureCategory === "unmet_need"
          ? "unmet_need_generic_auto_review"
          : "workflow_improvement_generic_auto_review",
    clusterLabel: profile?.clusterLabel ?? "generalized workflow lesson cluster",
    supersedeFailureLabel:
      captureCategory === "project_rule"
        ? "memory-middleware project-rule supersede failed"
        : captureCategory === "unmet_need"
          ? "memory-middleware unmet-need supersede failed"
          : "memory-middleware generalized workflow supersede failed",
  };
}

export function buildWorkflowImprovementAutoPromotionMetadata(params: {
  source: string;
  match: OrdinaryTurnAutoCaptureMatch;
  lessonFamily: WorkflowImprovementLessonFamily;
  agentExternalKey: string;
  sessionKey: string;
  transcriptFile: string;
  autoPromotionProfile: string;
  timestamp?: string;
  semanticMetadata?: Record<string, unknown>;
  candidateConfirmation?: Record<string, unknown>;
}): Record<string, unknown> {
  const workflowContext = resolveGeneralizedWorkflowAutoReviewContext({
    lessonFamily: params.lessonFamily,
    captureClass: params.match.captureClass,
  });
  return {
    autoPromotion: {
      source: params.source,
      captureSeam: "transcript_subscriber_fallback",
      profile: params.autoPromotionProfile,
      captureProfile: params.match.profile,
      captureClass: params.match.captureClass,
      reasonCode: params.match.reasonCode,
      lessonFamily: params.lessonFamily,
      key: params.match.key,
      subjectKey: params.match.subjectKey,
      subject: params.match.subject,
      value: params.match.value,
      ...(params.match.projectScope ? { projectScope: params.match.projectScope } : {}),
      ...(params.match.normalizedProjectScope
        ? { normalizedProjectScope: params.match.normalizedProjectScope }
        : {}),
      ...(params.match.guidancePattern ? { guidancePattern: params.match.guidancePattern } : {}),
      ...(params.match.needCategory ? { needCategory: params.match.needCategory } : {}),
      ...(params.match.neededCapability ? { neededCapability: params.match.neededCapability } : {}),
      ...(params.match.normalizedNeededCapability
        ? { normalizedNeededCapability: params.match.normalizedNeededCapability }
        : {}),
      ...(params.match.recommendedAction
        ? { recommendedAction: params.match.recommendedAction }
        : {}),
      ...(params.match.avoidAction ? { avoidAction: params.match.avoidAction } : {}),
      ...(params.match.rationale ? { rationale: params.match.rationale } : {}),
      ...(workflowContext.profile?.modeMetadata ?? { guidanceMode: "guidance_only" }),
      agentExternalKey: params.agentExternalKey,
      sessionKey: params.sessionKey,
      transcriptFile: params.transcriptFile,
      ...(params.timestamp ? { transcriptTimestamp: params.timestamp } : {}),
    },
    ...(params.semanticMetadata ?? {}),
    ...(params.candidateConfirmation
      ? { candidateConfirmation: params.candidateConfirmation }
      : {}),
  };
}

export function buildWorkflowImprovementAutoReviewMetadata(params: {
  source: string;
  match: OrdinaryTurnAutoCaptureMatch;
  lessonFamily: WorkflowImprovementLessonFamily;
  agentExternalKey: string;
  sessionKey: string;
  transcriptFile: string;
  autoPromotionProfile: string;
  outcome: "approve" | "supersede_existing";
  evidenceCount: number;
  contradictionCount: number;
  supersedeTargetIds: string[];
  rejectedCandidateIds: string[];
  timestamp?: string;
  semanticMetadata?: Record<string, unknown>;
}): Record<string, unknown> {
  const workflowContext = resolveGeneralizedWorkflowAutoReviewContext({
    lessonFamily: params.lessonFamily,
    captureClass: params.match.captureClass,
  });
  return {
    autoPromotion: {
      source: params.source,
      captureSeam: "transcript_subscriber_fallback",
      profile: params.autoPromotionProfile,
      captureProfile: params.match.profile,
      captureClass: params.match.captureClass,
      reasonCode: params.match.reasonCode,
      lessonFamily: params.lessonFamily,
      key: params.match.key,
      subjectKey: params.match.subjectKey,
      subject: params.match.subject,
      normalizedSubject: params.match.normalizedSubject,
      value: params.match.value,
      normalizedValue: params.match.normalizedValue,
      ...(params.match.projectScope ? { projectScope: params.match.projectScope } : {}),
      ...(params.match.normalizedProjectScope
        ? { normalizedProjectScope: params.match.normalizedProjectScope }
        : {}),
      ...(params.match.guidancePattern ? { guidancePattern: params.match.guidancePattern } : {}),
      ...(params.match.needCategory ? { needCategory: params.match.needCategory } : {}),
      ...(params.match.neededCapability ? { neededCapability: params.match.neededCapability } : {}),
      ...(params.match.normalizedNeededCapability
        ? { normalizedNeededCapability: params.match.normalizedNeededCapability }
        : {}),
      ...(params.match.recommendedAction
        ? { recommendedAction: params.match.recommendedAction }
        : {}),
      ...(params.match.normalizedRecommendedAction
        ? { normalizedRecommendedAction: params.match.normalizedRecommendedAction }
        : {}),
      ...(params.match.avoidAction ? { avoidAction: params.match.avoidAction } : {}),
      ...(params.match.normalizedAvoidAction
        ? { normalizedAvoidAction: params.match.normalizedAvoidAction }
        : {}),
      ...(params.match.rationale ? { rationale: params.match.rationale } : {}),
      ...(params.match.normalizedRationale
        ? { normalizedRationale: params.match.normalizedRationale }
        : {}),
      ...(workflowContext.profile?.modeMetadata ?? { guidanceMode: "guidance_only" }),
      agentExternalKey: params.agentExternalKey,
      sessionKey: params.sessionKey,
      transcriptFile: params.transcriptFile,
      ...(params.timestamp ? { transcriptTimestamp: params.timestamp } : {}),
    },
    ...(params.semanticMetadata ?? {}),
    candidateConfirmation: {
      state: "confirmed",
      method: "generalized_cluster_auto_review",
      confirmationEvidenceCount: params.evidenceCount,
      contradictionCount: params.contradictionCount,
      clusterKey: params.match.key,
    },
    workflowAutoReview: {
      family: workflowContext.profile?.captureCategory ?? "workflow_improvement",
      lessonFamily: params.lessonFamily,
      clusterKey: params.match.key,
      outcome: params.outcome,
      evidenceCount: params.evidenceCount,
      contradictionCount: params.contradictionCount,
      supersedeTargetIds: params.supersedeTargetIds,
      rejectedCandidateIds: params.rejectedCandidateIds,
    },
  };
}
