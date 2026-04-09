export type CanonicalCaptureClassMetadata = {
  category:
    | "project_fact"
    | "recurring_procedure"
    | "workflow_improvement"
    | "project_rule"
    | "unmet_need";
  source:
    | "explicit_project_fact"
    | "explicit_recurring_procedure"
    | "explicit_workflow_improvement"
    | "explicit_project_rule"
    | "explicit_unmet_need";
  subjectKeyMetadata?: "subject_key";
};

const CANONICAL_CAPTURE_CLASS_METADATA: Record<string, CanonicalCaptureClassMetadata> = {
  explicit_project_fact: {
    category: "project_fact",
    source: "explicit_project_fact",
    subjectKeyMetadata: "subject_key",
  },
  explicit_recurring_procedure: {
    category: "recurring_procedure",
    source: "explicit_recurring_procedure",
    subjectKeyMetadata: "subject_key",
  },
  workflow_tool_gotcha: {
    category: "workflow_improvement",
    source: "explicit_workflow_improvement",
    subjectKeyMetadata: "subject_key",
  },
  workflow_environment_constraint: {
    category: "workflow_improvement",
    source: "explicit_workflow_improvement",
    subjectKeyMetadata: "subject_key",
  },
  workflow_api_workaround: {
    category: "workflow_improvement",
    source: "explicit_workflow_improvement",
    subjectKeyMetadata: "subject_key",
  },
  workflow_generalized_guidance: {
    category: "workflow_improvement",
    source: "explicit_workflow_improvement",
    subjectKeyMetadata: "subject_key",
  },
  project_rule_guidance: {
    category: "project_rule",
    source: "explicit_project_rule",
    subjectKeyMetadata: "subject_key",
  },
  unmet_need_recommendation: {
    category: "unmet_need",
    source: "explicit_unmet_need",
    subjectKeyMetadata: "subject_key",
  },
};

export function getCanonicalCaptureMetadataByCaptureClass(
  captureClass: string,
): CanonicalCaptureClassMetadata | null {
  return CANONICAL_CAPTURE_CLASS_METADATA[captureClass] ?? null;
}
