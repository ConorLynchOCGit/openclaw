export const MEMORY_FAMILY_IDS = [
  "response_style",
  "project_fact",
  "recurring_procedure",
  "workflow_improvement",
  "project_rule",
  "unmet_need",
] as const;

export type MemoryFamilyId = (typeof MEMORY_FAMILY_IDS)[number];

export const MEMORY_PROOF_INSPECTABLE_FAMILY_IDS = MEMORY_FAMILY_IDS;

export type MemoryProofInspectableFamilyId = (typeof MEMORY_PROOF_INSPECTABLE_FAMILY_IDS)[number];

export type MemoryFamilyStorageKind =
  | "memory_object"
  | "procedure_candidate"
  | "validated_procedure"
  | "phrase_pattern";

export type MemoryFamilyScopeModel =
  | { kind: "global" }
  | { kind: "project"; projectRequired: boolean }
  | { kind: "mixed_project"; projectPreferred: boolean };

export type MemoryFamilyCanonicalField =
  | "scope"
  | "subject"
  | "value"
  | "recommended_action"
  | "avoid_action"
  | "needed_capability"
  | "guidance_pattern"
  | "procedure_title"
  | "procedure_steps"
  | "rationale";

export type MemoryFamilyLifecycleMode =
  | "bounded_auto_confirm"
  | "clustered_hold_auto_review"
  | "procedure_validation";

export type MemoryFamilyCorrectionMode = "held_correction" | "immediate_supersede_when_targeted";

export type MemoryFamilyPhraseMode = "unsupported" | "approved_pattern_reviewed";

export type MemoryFamilyRetrievalMode =
  | "approved_hybrid"
  | "validated_procedure_hybrid"
  | "approved_hybrid_with_semantic_gate";

export type MemoryFamilyApplicationMode =
  | "shape_reply"
  | "guidance_only"
  | "recommendation_only"
  | "suggestion_first"
  | "direct_answer";

export type MemoryFamilySemanticRoutingMode =
  | "disabled"
  | "family_gated_approved_only"
  | "validated_procedure_only";

export type MemoryFamilyProofInspectionMode =
  | "response_style_lifecycle"
  | "project_fact_lifecycle"
  | "recurring_procedure_lifecycle"
  | "workflow_improvement_lifecycle";

export type MemoryFamilyCaptureMetadata = {
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

export type MemoryFamilyDefinition = {
  id: MemoryFamilyId;
  displayName: string;
  storageKinds: readonly MemoryFamilyStorageKind[];
  scopeModel: MemoryFamilyScopeModel;
  canonicalFields: readonly MemoryFamilyCanonicalField[];
  typedFastPaths: readonly string[];
  lifecyclePolicy: {
    mode: MemoryFamilyLifecycleMode;
    clusterKeyFields: readonly MemoryFamilyCanonicalField[];
    subjectKeyFields: readonly MemoryFamilyCanonicalField[];
    pendingCandidateStates: readonly string[];
    approvalThreshold: number;
    staleWindowDays: number;
  };
  correctionPolicy: {
    mode: MemoryFamilyCorrectionMode;
    targetFields: readonly MemoryFamilyCanonicalField[];
    explicitCorrectionRequired: boolean;
  };
  phrasePolicy: {
    mode: MemoryFamilyPhraseMode;
    sourceStorageKind?: MemoryFamilyStorageKind;
    approvalStorageKind?: MemoryFamilyStorageKind;
  };
  retrievalPolicy: {
    mode: MemoryFamilyRetrievalMode;
    featureSet: readonly string[];
    directIntentClass?: "fact" | "rule" | "need" | "procedure" | "style";
    suppressAdjacentFamilies?: boolean;
  };
  applicationPolicy: {
    mode: MemoryFamilyApplicationMode;
    guidanceOnly: boolean;
    directUseOnlyOnClearAsk: boolean;
    promptSection: "behavior" | "project" | "procedure";
  };
  semanticRoutingPolicy: {
    mode: MemoryFamilySemanticRoutingMode;
    enabledQueryClasses: readonly string[];
  };
  proofPolicy: {
    inspectionMode: MemoryFamilyProofInspectionMode;
  };
  captureMetadata?: MemoryFamilyCaptureMetadata;
  workflowLessonFamilies?: readonly string[];
  captureClasses?: readonly string[];
};

const FAMILY_DEFINITIONS: Record<MemoryFamilyId, MemoryFamilyDefinition> = {
  response_style: {
    id: "response_style",
    displayName: "Response Style",
    storageKinds: ["memory_object", "phrase_pattern"],
    scopeModel: { kind: "global" },
    canonicalFields: ["subject", "value"],
    typedFastPaths: [
      "responses_concise",
      "responses_bullets",
      "responses_plain_english",
      "responses_no_tables",
      "responses_numbered_steps",
    ],
    lifecyclePolicy: {
      mode: "clustered_hold_auto_review",
      clusterKeyFields: ["subject", "value"],
      subjectKeyFields: ["subject"],
      pendingCandidateStates: ["pending_confirmation", "hold_for_more_evidence"],
      approvalThreshold: 2,
      staleWindowDays: 3,
    },
    correctionPolicy: {
      mode: "immediate_supersede_when_targeted",
      targetFields: ["subject", "value"],
      explicitCorrectionRequired: true,
    },
    phrasePolicy: {
      mode: "approved_pattern_reviewed",
      sourceStorageKind: "memory_object",
      approvalStorageKind: "phrase_pattern",
    },
    retrievalPolicy: {
      mode: "approved_hybrid",
      featureSet: ["response_style_subject_match", "response_style_value_match"],
      directIntentClass: "style",
    },
    applicationPolicy: {
      mode: "shape_reply",
      guidanceOnly: false,
      directUseOnlyOnClearAsk: false,
      promptSection: "behavior",
    },
    semanticRoutingPolicy: {
      mode: "disabled",
      enabledQueryClasses: [],
    },
    proofPolicy: {
      inspectionMode: "response_style_lifecycle",
    },
  },
  project_fact: {
    id: "project_fact",
    displayName: "Project Fact",
    storageKinds: ["memory_object"],
    scopeModel: { kind: "project", projectRequired: true },
    canonicalFields: ["scope", "subject", "value"],
    typedFastPaths: ["project_fact_named_scope", "project_fact_generalized_named_scope"],
    lifecyclePolicy: {
      mode: "clustered_hold_auto_review",
      clusterKeyFields: ["scope", "subject", "value"],
      subjectKeyFields: ["scope", "subject"],
      pendingCandidateStates: ["pending_confirmation", "hold_for_more_evidence"],
      approvalThreshold: 2,
      staleWindowDays: 3,
    },
    correctionPolicy: {
      mode: "immediate_supersede_when_targeted",
      targetFields: ["scope", "subject", "value"],
      explicitCorrectionRequired: true,
    },
    phrasePolicy: {
      mode: "unsupported",
    },
    retrievalPolicy: {
      mode: "approved_hybrid",
      featureSet: ["project_scope_match", "subject_match", "value_match"],
      directIntentClass: "fact",
      suppressAdjacentFamilies: true,
    },
    applicationPolicy: {
      mode: "direct_answer",
      guidanceOnly: false,
      directUseOnlyOnClearAsk: false,
      promptSection: "project",
    },
    semanticRoutingPolicy: {
      mode: "disabled",
      enabledQueryClasses: [],
    },
    proofPolicy: {
      inspectionMode: "project_fact_lifecycle",
    },
    captureMetadata: {
      category: "project_fact",
      source: "explicit_project_fact",
      subjectKeyMetadata: "subject_key",
    },
    captureClasses: ["explicit_project_fact"],
  },
  recurring_procedure: {
    id: "recurring_procedure",
    displayName: "Recurring Procedure",
    storageKinds: ["procedure_candidate", "validated_procedure"],
    scopeModel: { kind: "mixed_project", projectPreferred: true },
    canonicalFields: ["subject", "value", "procedure_title", "procedure_steps"],
    typedFastPaths: ["supported_key"],
    lifecyclePolicy: {
      mode: "procedure_validation",
      clusterKeyFields: ["subject", "value"],
      subjectKeyFields: ["subject"],
      pendingCandidateStates: ["pending_confirmation", "hold_for_more_evidence"],
      approvalThreshold: 2,
      staleWindowDays: 3,
    },
    correctionPolicy: {
      mode: "immediate_supersede_when_targeted",
      targetFields: ["subject", "value", "procedure_title"],
      explicitCorrectionRequired: true,
    },
    phrasePolicy: {
      mode: "unsupported",
    },
    retrievalPolicy: {
      mode: "validated_procedure_hybrid",
      featureSet: ["procedure_title_match", "subject_match"],
      directIntentClass: "procedure",
    },
    applicationPolicy: {
      mode: "suggestion_first",
      guidanceOnly: false,
      directUseOnlyOnClearAsk: true,
      promptSection: "procedure",
    },
    semanticRoutingPolicy: {
      mode: "validated_procedure_only",
      enabledQueryClasses: ["clear_checklist_ask", "nearby_procedure_ask"],
    },
    proofPolicy: {
      inspectionMode: "recurring_procedure_lifecycle",
    },
    captureMetadata: {
      category: "recurring_procedure",
      source: "explicit_recurring_procedure",
      subjectKeyMetadata: "subject_key",
    },
    captureClasses: ["explicit_recurring_procedure"],
  },
  workflow_improvement: {
    id: "workflow_improvement",
    displayName: "Workflow Improvement",
    storageKinds: ["memory_object", "phrase_pattern"],
    scopeModel: { kind: "project", projectRequired: true },
    canonicalFields: [
      "scope",
      "subject",
      "guidance_pattern",
      "recommended_action",
      "avoid_action",
      "rationale",
    ],
    typedFastPaths: [
      "workflow_tool_gotcha",
      "workflow_environment_constraint",
      "workflow_api_workaround",
      "workflow_generalized_guidance",
    ],
    lifecyclePolicy: {
      mode: "clustered_hold_auto_review",
      clusterKeyFields: [
        "scope",
        "subject",
        "guidance_pattern",
        "recommended_action",
        "avoid_action",
      ],
      subjectKeyFields: ["scope", "subject"],
      pendingCandidateStates: ["pending_confirmation", "review_required", "hold_for_more_evidence"],
      approvalThreshold: 2,
      staleWindowDays: 3,
    },
    correctionPolicy: {
      mode: "immediate_supersede_when_targeted",
      targetFields: ["scope", "subject", "recommended_action", "avoid_action"],
      explicitCorrectionRequired: true,
    },
    phrasePolicy: {
      mode: "approved_pattern_reviewed",
      sourceStorageKind: "memory_object",
      approvalStorageKind: "phrase_pattern",
    },
    retrievalPolicy: {
      mode: "approved_hybrid_with_semantic_gate",
      featureSet: [
        "project_scope_match",
        "subject_match",
        "recommended_action_match",
        "avoid_action_match",
      ],
    },
    applicationPolicy: {
      mode: "guidance_only",
      guidanceOnly: true,
      directUseOnlyOnClearAsk: false,
      promptSection: "behavior",
    },
    semanticRoutingPolicy: {
      mode: "family_gated_approved_only",
      enabledQueryClasses: ["nearby_workflow_guidance_ask"],
    },
    proofPolicy: {
      inspectionMode: "workflow_improvement_lifecycle",
    },
    captureMetadata: {
      category: "workflow_improvement",
      source: "explicit_workflow_improvement",
      subjectKeyMetadata: "subject_key",
    },
    workflowLessonFamilies: ["supported_lesson", "generalized_workflow_lesson"],
    captureClasses: [
      "workflow_tool_gotcha",
      "workflow_environment_constraint",
      "workflow_api_workaround",
      "workflow_generalized_guidance",
    ],
  },
  project_rule: {
    id: "project_rule",
    displayName: "Project Rule",
    storageKinds: ["memory_object"],
    scopeModel: { kind: "project", projectRequired: true },
    canonicalFields: ["scope", "subject", "guidance_pattern", "recommended_action", "avoid_action"],
    typedFastPaths: ["project_rule_guidance"],
    lifecyclePolicy: {
      mode: "clustered_hold_auto_review",
      clusterKeyFields: [
        "scope",
        "subject",
        "guidance_pattern",
        "recommended_action",
        "avoid_action",
      ],
      subjectKeyFields: ["scope", "subject"],
      pendingCandidateStates: ["pending_confirmation", "review_required", "hold_for_more_evidence"],
      approvalThreshold: 2,
      staleWindowDays: 3,
    },
    correctionPolicy: {
      mode: "immediate_supersede_when_targeted",
      targetFields: ["scope", "subject", "recommended_action", "avoid_action"],
      explicitCorrectionRequired: true,
    },
    phrasePolicy: {
      mode: "unsupported",
    },
    retrievalPolicy: {
      mode: "approved_hybrid",
      featureSet: [
        "project_scope_match",
        "subject_match",
        "recommended_action_match",
        "avoid_action_match",
      ],
      directIntentClass: "rule",
      suppressAdjacentFamilies: true,
    },
    applicationPolicy: {
      mode: "guidance_only",
      guidanceOnly: true,
      directUseOnlyOnClearAsk: false,
      promptSection: "project",
    },
    semanticRoutingPolicy: {
      mode: "disabled",
      enabledQueryClasses: [],
    },
    proofPolicy: {
      inspectionMode: "workflow_improvement_lifecycle",
    },
    captureMetadata: {
      category: "project_rule",
      source: "explicit_project_rule",
      subjectKeyMetadata: "subject_key",
    },
    workflowLessonFamilies: ["generalized_project_rule"],
    captureClasses: ["project_rule_guidance"],
  },
  unmet_need: {
    id: "unmet_need",
    displayName: "Unmet Need",
    storageKinds: ["memory_object"],
    scopeModel: { kind: "project", projectRequired: true },
    canonicalFields: ["scope", "subject", "needed_capability"],
    typedFastPaths: ["unmet_need_recommendation"],
    lifecyclePolicy: {
      mode: "clustered_hold_auto_review",
      clusterKeyFields: ["scope", "subject", "needed_capability"],
      subjectKeyFields: ["scope", "subject", "needed_capability"],
      pendingCandidateStates: ["pending_confirmation", "review_required", "hold_for_more_evidence"],
      approvalThreshold: 2,
      staleWindowDays: 3,
    },
    correctionPolicy: {
      mode: "held_correction",
      targetFields: ["scope", "subject", "needed_capability"],
      explicitCorrectionRequired: true,
    },
    phrasePolicy: {
      mode: "unsupported",
    },
    retrievalPolicy: {
      mode: "approved_hybrid",
      featureSet: ["project_scope_match", "subject_match", "needed_capability_match"],
      directIntentClass: "need",
      suppressAdjacentFamilies: true,
    },
    applicationPolicy: {
      mode: "recommendation_only",
      guidanceOnly: true,
      directUseOnlyOnClearAsk: false,
      promptSection: "project",
    },
    semanticRoutingPolicy: {
      mode: "disabled",
      enabledQueryClasses: [],
    },
    proofPolicy: {
      inspectionMode: "workflow_improvement_lifecycle",
    },
    captureMetadata: {
      category: "unmet_need",
      source: "explicit_unmet_need",
      subjectKeyMetadata: "subject_key",
    },
    workflowLessonFamilies: ["generalized_unmet_need"],
    captureClasses: ["unmet_need_recommendation"],
  },
};

const CAPTURE_CLASS_TO_FAMILY_ID = new Map<string, MemoryFamilyId>();
const WORKFLOW_LESSON_FAMILY_TO_FAMILY_ID = new Map<string, MemoryFamilyId>();

for (const definition of Object.values(FAMILY_DEFINITIONS)) {
  for (const captureClass of definition.captureClasses ?? []) {
    CAPTURE_CLASS_TO_FAMILY_ID.set(captureClass, definition.id);
  }
  for (const lessonFamily of definition.workflowLessonFamilies ?? []) {
    WORKFLOW_LESSON_FAMILY_TO_FAMILY_ID.set(lessonFamily, definition.id);
  }
}

export function listMemoryFamilyDefinitions(): MemoryFamilyDefinition[] {
  return MEMORY_FAMILY_IDS.map((id) => FAMILY_DEFINITIONS[id]);
}

export function getMemoryFamilyDefinition(familyId: MemoryFamilyId): MemoryFamilyDefinition {
  return FAMILY_DEFINITIONS[familyId];
}

export function getMemoryFamilyDefinitionByCaptureClass(
  captureClass: string,
): MemoryFamilyDefinition | null {
  const familyId = CAPTURE_CLASS_TO_FAMILY_ID.get(captureClass);
  return familyId ? getMemoryFamilyDefinition(familyId) : null;
}

export function getMemoryFamilyDefinitionByWorkflowLessonFamily(
  lessonFamily: string,
): MemoryFamilyDefinition | null {
  const familyId = WORKFLOW_LESSON_FAMILY_TO_FAMILY_ID.get(lessonFamily);
  return familyId ? getMemoryFamilyDefinition(familyId) : null;
}

export function isMemoryProofInspectableFamily(
  value: string,
): value is MemoryProofInspectableFamilyId {
  return MEMORY_PROOF_INSPECTABLE_FAMILY_IDS.includes(value as MemoryProofInspectableFamilyId);
}

export function getCaptureMetadataByCaptureClass(
  captureClass: string,
): MemoryFamilyCaptureMetadata | null {
  return getMemoryFamilyDefinitionByCaptureClass(captureClass)?.captureMetadata ?? null;
}

export function getCaptureMetadataByWorkflowLessonFamily(
  lessonFamily: string,
): MemoryFamilyCaptureMetadata | null {
  return getMemoryFamilyDefinitionByWorkflowLessonFamily(lessonFamily)?.captureMetadata ?? null;
}
