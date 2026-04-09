import { getCanonicalCaptureMetadataByCaptureClass } from "./capture-class-metadata.js";
import type {
  WorkflowImprovementCaptureClass,
  WorkflowImprovementLessonFamily,
  WorkflowImprovementTemplate,
} from "./workflow-improvement-semantic.js";

export type CanonicalWorkflowCaptureCategory =
  | "workflow_improvement"
  | "project_rule"
  | "unmet_need";

export type CanonicalWorkflowAutoReviewProfile = {
  captureCategory: CanonicalWorkflowCaptureCategory;
  compatibilityCategory: CanonicalWorkflowCaptureCategory;
  lessonFamily: Extract<
    WorkflowImprovementLessonFamily,
    "generalized_workflow_lesson" | "generalized_project_rule" | "generalized_unmet_need"
  >;
  template: Extract<
    WorkflowImprovementTemplate,
    "workflow_generalized_guidance" | "project_rule_guidance" | "unmet_need_recommendation"
  >;
  semanticDetectionSource:
    | "workflow_improvement_semantic_v2"
    | "project_rule_semantic_v1"
    | "unmet_need_semantic_v1";
  autoReviewSource:
    | "candidate_submit_workflow_improvement_generic_auto_review"
    | "candidate_submit_project_rule_auto_review"
    | "candidate_submit_unmet_need_auto_review";
  autoReviewProfile:
    | "workflow_generalized_auto_review_v1"
    | "project_rule_auto_review_v1"
    | "unmet_need_auto_review_v1";
  clusterLabel:
    | "generalized workflow lesson cluster"
    | "project-rule cluster"
    | "unmet-need cluster";
  approvedLabel:
    | "approved workflow-improvement memory"
    | "approved project rule"
    | "approved unmet-need recommendation";
  supportsPhraseInduction: boolean;
  modeMetadata: { guidanceMode: "guidance_only" } | { recommendationMode: "recommendation_only" };
};

const WORKFLOW_AUTO_REVIEW_PROFILES = {
  workflow_improvement: {
    captureCategory: "workflow_improvement",
    compatibilityCategory: "workflow_improvement",
    lessonFamily: "generalized_workflow_lesson",
    template: "workflow_generalized_guidance",
    semanticDetectionSource: "workflow_improvement_semantic_v2",
    autoReviewSource: "candidate_submit_workflow_improvement_generic_auto_review",
    autoReviewProfile: "workflow_generalized_auto_review_v1",
    clusterLabel: "generalized workflow lesson cluster",
    approvedLabel: "approved workflow-improvement memory",
    supportsPhraseInduction: true,
    modeMetadata: { guidanceMode: "guidance_only" },
  },
  project_rule: {
    captureCategory: "project_rule",
    compatibilityCategory: "project_rule",
    lessonFamily: "generalized_project_rule",
    template: "project_rule_guidance",
    semanticDetectionSource: "project_rule_semantic_v1",
    autoReviewSource: "candidate_submit_project_rule_auto_review",
    autoReviewProfile: "project_rule_auto_review_v1",
    clusterLabel: "project-rule cluster",
    approvedLabel: "approved project rule",
    supportsPhraseInduction: false,
    modeMetadata: { guidanceMode: "guidance_only" },
  },
  unmet_need: {
    captureCategory: "unmet_need",
    compatibilityCategory: "unmet_need",
    lessonFamily: "generalized_unmet_need",
    template: "unmet_need_recommendation",
    semanticDetectionSource: "unmet_need_semantic_v1",
    autoReviewSource: "candidate_submit_unmet_need_auto_review",
    autoReviewProfile: "unmet_need_auto_review_v1",
    clusterLabel: "unmet-need cluster",
    approvedLabel: "approved unmet-need recommendation",
    supportsPhraseInduction: false,
    modeMetadata: { recommendationMode: "recommendation_only" },
  },
} as const satisfies Record<CanonicalWorkflowCaptureCategory, CanonicalWorkflowAutoReviewProfile>;

function resolveCanonicalWorkflowCaptureCategory(params: {
  captureCategory?: string;
  captureClass?: string;
  familyId?: string | null;
  lessonFamily?: WorkflowImprovementLessonFamily;
}): CanonicalWorkflowCaptureCategory | null {
  if (
    params.captureCategory === "workflow_improvement" ||
    params.captureCategory === "project_rule" ||
    params.captureCategory === "unmet_need"
  ) {
    return params.captureCategory;
  }
  const captureClassCategory = params.captureClass
    ? getCanonicalCaptureMetadataByCaptureClass(params.captureClass)?.category
    : undefined;
  if (
    captureClassCategory === "workflow_improvement" ||
    captureClassCategory === "project_rule" ||
    captureClassCategory === "unmet_need"
  ) {
    return captureClassCategory;
  }
  if (
    params.familyId === "workflow_improvement" ||
    params.familyId === "project_rule" ||
    params.familyId === "unmet_need"
  ) {
    return params.familyId;
  }
  if (params.lessonFamily === "generalized_project_rule") {
    return "project_rule";
  }
  if (params.lessonFamily === "generalized_unmet_need") {
    return "unmet_need";
  }
  if (params.lessonFamily === "generalized_workflow_lesson") {
    return "workflow_improvement";
  }
  return null;
}

export function resolveCanonicalWorkflowAutoReviewProfile(params: {
  captureCategory?: string;
  captureClass?: WorkflowImprovementCaptureClass | string;
  familyId?: string | null;
  lessonFamily?: WorkflowImprovementLessonFamily;
  template?: string;
}): CanonicalWorkflowAutoReviewProfile | null {
  const captureCategory = resolveCanonicalWorkflowCaptureCategory(params);
  if (!captureCategory) {
    return null;
  }
  const profile = WORKFLOW_AUTO_REVIEW_PROFILES[captureCategory];
  if (params.template && params.template !== profile.template) {
    return null;
  }
  if (params.lessonFamily && params.lessonFamily !== profile.lessonFamily) {
    return null;
  }
  return profile;
}

export function resolveWorkflowSemanticDetectionSource(params: {
  detectionSource: "semantic" | "deterministic";
  captureCategory?: string;
  captureClass?: WorkflowImprovementCaptureClass | string;
  lessonFamily?: WorkflowImprovementLessonFamily;
}):
  | "workflow_phrase_induction_v1"
  | "workflow_improvement_semantic_v2"
  | "project_rule_semantic_v1"
  | "unmet_need_semantic_v1" {
  if (params.detectionSource === "deterministic") {
    return "workflow_phrase_induction_v1";
  }
  return (
    resolveCanonicalWorkflowAutoReviewProfile({
      captureCategory: params.captureCategory,
      captureClass: params.captureClass,
      lessonFamily: params.lessonFamily,
    })?.semanticDetectionSource ?? "workflow_improvement_semantic_v2"
  );
}
