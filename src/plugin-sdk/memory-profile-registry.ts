import type { CanonicalMemoryFacetMap, CanonicalMemoryKind } from "./memory-canonical-core.js";

export const MEMORY_PROFILE_IDS = [
  "response_style",
  "project_fact",
  "recurring_procedure",
  "workflow_improvement",
  "project_rule",
  "unmet_need",
] as const;

export type MemoryProfileId = (typeof MEMORY_PROFILE_IDS)[number];

export type MemoryProfileStorageKind =
  | "memory_object"
  | "procedure_candidate"
  | "validated_procedure"
  | "phrase_pattern";

export type MemoryProfileCanonicalField =
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

export type MemoryProfileCaptureCategory =
  | "project_fact"
  | "recurring_procedure"
  | "workflow_improvement"
  | "project_rule"
  | "unmet_need";

export type MemoryProfileCaptureSource =
  | "explicit_project_fact"
  | "explicit_recurring_procedure"
  | "explicit_workflow_improvement"
  | "explicit_project_rule"
  | "explicit_unmet_need";

export type MemoryProfileProofPhrasePatternId =
  | "workflow_phrase_pattern"
  | "response_style_phrase_pattern";

export type MemoryProfilePromptSection = "behavior" | "project" | "procedure";

export type MemoryProfileDirectIntentClass = "fact" | "rule" | "need" | "procedure" | "style";

export type MemoryProfileRetrievalFeature =
  | "family_intent_match"
  | "project_scope_match"
  | "subject_match"
  | "value_match"
  | "recommended_action_match"
  | "avoid_action_match"
  | "needed_capability_match"
  | "guidance_pattern_match"
  | "procedure_title_match";

export type MemoryProfileDefinition = {
  id: MemoryProfileId;
  displayName: string;
  canonicalKind: CanonicalMemoryKind;
  defaultTags: readonly string[];
  defaultFacets: CanonicalMemoryFacetMap;
  derivedViews: readonly string[];
  storageKinds: readonly MemoryProfileStorageKind[];
  scopeModel: "global" | "project" | "mixed";
  canonicalFields: readonly MemoryProfileCanonicalField[];
  lifecycle: {
    mode: "bounded_auto_confirm" | "clustered_hold_auto_review" | "procedure_validation";
    clusterKeyFields: readonly MemoryProfileCanonicalField[];
    subjectKeyFields: readonly MemoryProfileCanonicalField[];
    pendingCandidateStates: readonly string[];
    approvalThreshold: number;
    staleWindowDays: number;
  };
  correction: {
    mode:
      | "held_correction"
      | "approved_memory_object_supersede_when_targeted"
      | "validated_procedure_supersede_when_targeted";
    targetKind: "approved_memory_object" | "validated_procedure";
    targetFields: readonly MemoryProfileCanonicalField[];
    explicitCorrectionRequired: boolean;
    requiresExistingTarget: boolean;
  };
  phrase: {
    mode: "unsupported" | "approved_pattern_reviewed";
    sourceStorageKind?: MemoryProfileStorageKind;
    approvalStorageKind?: MemoryProfileStorageKind;
  };
  retrieval: {
    mode: "approved_hybrid" | "validated_procedure_hybrid" | "approved_hybrid_with_semantic_gate";
    featureWeights: Partial<Record<MemoryProfileRetrievalFeature, number>>;
    directIntentClass?: MemoryProfileDirectIntentClass;
    suppressAdjacentFamilies?: boolean;
    matchedFieldPrefix?: string;
  };
  application: {
    mode:
      | "shape_reply"
      | "guidance_only"
      | "recommendation_only"
      | "suggestion_first"
      | "direct_answer";
    guidanceOnly: boolean;
    directUseOnlyOnClearAsk: boolean;
    promptSection: MemoryProfilePromptSection;
  };
  semanticRouting: {
    mode: "disabled" | "family_gated_approved_only" | "validated_procedure_only";
    enabledQueryClasses: readonly string[];
  };
  proof: {
    inspectionMode:
      | "response_style_lifecycle"
      | "project_fact_lifecycle"
      | "recurring_procedure_lifecycle"
      | "workflow_improvement_lifecycle"
      | "workflow_phrase_pattern_lifecycle"
      | "response_style_phrase_pattern_lifecycle";
    artifactMode: "approved_memory_object" | "phrase_pattern" | "validated_procedure";
    phrasePattern?: {
      familyId: MemoryProfileProofPhrasePatternId;
      inspectionMode:
        | "workflow_phrase_pattern_lifecycle"
        | "response_style_phrase_pattern_lifecycle";
    };
  };
  capture?: {
    category: MemoryProfileCaptureCategory;
    source: MemoryProfileCaptureSource;
    subjectKeyMetadata?: "subject_key";
    captureClasses: readonly string[];
  };
  workflowAutoReview?: {
    lessonFamily:
      | "generalized_workflow_lesson"
      | "generalized_project_rule"
      | "generalized_unmet_need";
    template:
      | "workflow_generalized_guidance"
      | "project_rule_guidance"
      | "unmet_need_recommendation";
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
};

const MEMORY_PROFILE_DEFINITIONS: Record<MemoryProfileId, MemoryProfileDefinition> = {
  response_style: {
    id: "response_style",
    displayName: "Response Style",
    canonicalKind: "user",
    defaultTags: ["response_style", "preference", "user"],
    defaultFacets: {
      response_style: true,
      preference: true,
    },
    derivedViews: ["response_style"],
    storageKinds: ["memory_object", "phrase_pattern"],
    scopeModel: "global",
    canonicalFields: ["subject", "value"],
    lifecycle: {
      mode: "clustered_hold_auto_review",
      clusterKeyFields: ["subject", "value"],
      subjectKeyFields: ["subject"],
      pendingCandidateStates: ["pending_confirmation", "hold_for_more_evidence"],
      approvalThreshold: 2,
      staleWindowDays: 3,
    },
    correction: {
      mode: "approved_memory_object_supersede_when_targeted",
      targetKind: "approved_memory_object",
      targetFields: ["subject", "value"],
      explicitCorrectionRequired: true,
      requiresExistingTarget: true,
    },
    phrase: {
      mode: "approved_pattern_reviewed",
      sourceStorageKind: "memory_object",
      approvalStorageKind: "phrase_pattern",
    },
    retrieval: {
      mode: "approved_hybrid",
      featureWeights: {
        subject_match: 170,
        value_match: 105,
      },
      directIntentClass: "style",
      matchedFieldPrefix: "response_style",
    },
    application: {
      mode: "shape_reply",
      guidanceOnly: false,
      directUseOnlyOnClearAsk: false,
      promptSection: "behavior",
    },
    semanticRouting: {
      mode: "disabled",
      enabledQueryClasses: [],
    },
    proof: {
      inspectionMode: "response_style_lifecycle",
      artifactMode: "approved_memory_object",
      phrasePattern: {
        familyId: "response_style_phrase_pattern",
        inspectionMode: "response_style_phrase_pattern_lifecycle",
      },
    },
  },
  project_fact: {
    id: "project_fact",
    displayName: "Project Fact",
    canonicalKind: "project",
    defaultTags: ["project_fact", "fact", "project"],
    defaultFacets: {
      fact: true,
      project_scope: true,
    },
    derivedViews: ["project_fact"],
    storageKinds: ["memory_object"],
    scopeModel: "project",
    canonicalFields: ["scope", "subject", "value"],
    lifecycle: {
      mode: "clustered_hold_auto_review",
      clusterKeyFields: ["scope", "subject", "value"],
      subjectKeyFields: ["scope", "subject"],
      pendingCandidateStates: ["pending_confirmation", "hold_for_more_evidence"],
      approvalThreshold: 2,
      staleWindowDays: 3,
    },
    correction: {
      mode: "approved_memory_object_supersede_when_targeted",
      targetKind: "approved_memory_object",
      targetFields: ["scope", "subject", "value"],
      explicitCorrectionRequired: true,
      requiresExistingTarget: true,
    },
    phrase: {
      mode: "unsupported",
    },
    retrieval: {
      mode: "approved_hybrid",
      featureWeights: {
        family_intent_match: 90,
        project_scope_match: 205,
        subject_match: 180,
        value_match: 100,
      },
      directIntentClass: "fact",
      suppressAdjacentFamilies: true,
      matchedFieldPrefix: "project_fact",
    },
    application: {
      mode: "direct_answer",
      guidanceOnly: false,
      directUseOnlyOnClearAsk: false,
      promptSection: "project",
    },
    semanticRouting: {
      mode: "disabled",
      enabledQueryClasses: [],
    },
    proof: {
      inspectionMode: "project_fact_lifecycle",
      artifactMode: "approved_memory_object",
    },
    capture: {
      category: "project_fact",
      source: "explicit_project_fact",
      subjectKeyMetadata: "subject_key",
      captureClasses: ["explicit_project_fact"],
    },
  },
  recurring_procedure: {
    id: "recurring_procedure",
    displayName: "Recurring Procedure",
    canonicalKind: "feedback",
    defaultTags: ["recurring_procedure", "procedure", "validated_approach", "feedback"],
    defaultFacets: {
      procedure: true,
      validated_approach: true,
    },
    derivedViews: ["procedure"],
    storageKinds: ["procedure_candidate", "validated_procedure"],
    scopeModel: "mixed",
    canonicalFields: ["subject", "value", "procedure_title", "procedure_steps"],
    lifecycle: {
      mode: "procedure_validation",
      clusterKeyFields: ["subject", "value"],
      subjectKeyFields: ["subject"],
      pendingCandidateStates: ["pending_confirmation", "hold_for_more_evidence"],
      approvalThreshold: 2,
      staleWindowDays: 3,
    },
    correction: {
      mode: "validated_procedure_supersede_when_targeted",
      targetKind: "validated_procedure",
      targetFields: ["subject", "value", "procedure_title"],
      explicitCorrectionRequired: true,
      requiresExistingTarget: false,
    },
    phrase: {
      mode: "unsupported",
    },
    retrieval: {
      mode: "validated_procedure_hybrid",
      featureWeights: {
        procedure_title_match: 0,
        subject_match: 200,
      },
      directIntentClass: "procedure",
      matchedFieldPrefix: "procedure",
    },
    application: {
      mode: "suggestion_first",
      guidanceOnly: false,
      directUseOnlyOnClearAsk: true,
      promptSection: "procedure",
    },
    semanticRouting: {
      mode: "validated_procedure_only",
      enabledQueryClasses: ["clear_checklist_ask", "nearby_procedure_ask"],
    },
    proof: {
      inspectionMode: "recurring_procedure_lifecycle",
      artifactMode: "validated_procedure",
    },
    capture: {
      category: "recurring_procedure",
      source: "explicit_recurring_procedure",
      subjectKeyMetadata: "subject_key",
      captureClasses: ["explicit_recurring_procedure"],
    },
  },
  workflow_improvement: {
    id: "workflow_improvement",
    displayName: "Workflow Improvement",
    canonicalKind: "feedback",
    defaultTags: ["workflow_improvement", "workflow_guidance", "feedback"],
    defaultFacets: {
      workflow_guidance: true,
      validated_approach: true,
    },
    derivedViews: ["workflow_guidance", "learned_guidance"],
    storageKinds: ["memory_object", "phrase_pattern"],
    scopeModel: "project",
    canonicalFields: [
      "scope",
      "subject",
      "guidance_pattern",
      "recommended_action",
      "avoid_action",
      "rationale",
    ],
    lifecycle: {
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
    correction: {
      mode: "approved_memory_object_supersede_when_targeted",
      targetKind: "approved_memory_object",
      targetFields: ["scope", "subject", "recommended_action", "avoid_action"],
      explicitCorrectionRequired: true,
      requiresExistingTarget: true,
    },
    phrase: {
      mode: "approved_pattern_reviewed",
      sourceStorageKind: "memory_object",
      approvalStorageKind: "phrase_pattern",
    },
    retrieval: {
      mode: "approved_hybrid_with_semantic_gate",
      featureWeights: {
        subject_match: 170,
        recommended_action_match: 95,
        avoid_action_match: 90,
        guidance_pattern_match: 40,
      },
      matchedFieldPrefix: "generalized",
    },
    application: {
      mode: "guidance_only",
      guidanceOnly: true,
      directUseOnlyOnClearAsk: false,
      promptSection: "behavior",
    },
    semanticRouting: {
      mode: "family_gated_approved_only",
      enabledQueryClasses: ["nearby_workflow_guidance_ask"],
    },
    proof: {
      inspectionMode: "workflow_improvement_lifecycle",
      artifactMode: "approved_memory_object",
      phrasePattern: {
        familyId: "workflow_phrase_pattern",
        inspectionMode: "workflow_phrase_pattern_lifecycle",
      },
    },
    capture: {
      category: "workflow_improvement",
      source: "explicit_workflow_improvement",
      subjectKeyMetadata: "subject_key",
      captureClasses: [
        "workflow_tool_gotcha",
        "workflow_environment_constraint",
        "workflow_api_workaround",
        "workflow_generalized_guidance",
      ],
    },
    workflowAutoReview: {
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
  },
  project_rule: {
    id: "project_rule",
    displayName: "Project Rule",
    canonicalKind: "feedback",
    defaultTags: ["project_rule", "rule", "feedback"],
    defaultFacets: {
      project_rule: true,
      rule: true,
    },
    derivedViews: ["project_rule"],
    storageKinds: ["memory_object"],
    scopeModel: "project",
    canonicalFields: ["scope", "subject", "guidance_pattern", "recommended_action", "avoid_action"],
    lifecycle: {
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
    correction: {
      mode: "approved_memory_object_supersede_when_targeted",
      targetKind: "approved_memory_object",
      targetFields: ["scope", "subject", "recommended_action", "avoid_action"],
      explicitCorrectionRequired: true,
      requiresExistingTarget: true,
    },
    phrase: {
      mode: "unsupported",
    },
    retrieval: {
      mode: "approved_hybrid",
      featureWeights: {
        family_intent_match: 95,
        project_scope_match: 210,
        subject_match: 165,
        recommended_action_match: 95,
        avoid_action_match: 90,
        guidance_pattern_match: 40,
      },
      directIntentClass: "rule",
      suppressAdjacentFamilies: true,
      matchedFieldPrefix: "project_rule",
    },
    application: {
      mode: "guidance_only",
      guidanceOnly: true,
      directUseOnlyOnClearAsk: false,
      promptSection: "project",
    },
    semanticRouting: {
      mode: "disabled",
      enabledQueryClasses: [],
    },
    proof: {
      inspectionMode: "workflow_improvement_lifecycle",
      artifactMode: "approved_memory_object",
    },
    capture: {
      category: "project_rule",
      source: "explicit_project_rule",
      subjectKeyMetadata: "subject_key",
      captureClasses: ["project_rule_guidance"],
    },
    workflowAutoReview: {
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
  },
  unmet_need: {
    id: "unmet_need",
    displayName: "Unmet Need",
    canonicalKind: "project",
    defaultTags: ["unmet_need", "open_need", "project"],
    defaultFacets: {
      open_need: true,
      project_scope: true,
    },
    derivedViews: ["unmet_need"],
    storageKinds: ["memory_object"],
    scopeModel: "project",
    canonicalFields: ["scope", "subject", "needed_capability"],
    lifecycle: {
      mode: "clustered_hold_auto_review",
      clusterKeyFields: ["scope", "subject", "needed_capability"],
      subjectKeyFields: ["scope", "subject", "needed_capability"],
      pendingCandidateStates: ["pending_confirmation", "review_required", "hold_for_more_evidence"],
      approvalThreshold: 2,
      staleWindowDays: 3,
    },
    correction: {
      mode: "held_correction",
      targetKind: "approved_memory_object",
      targetFields: ["scope", "subject", "needed_capability"],
      explicitCorrectionRequired: true,
      requiresExistingTarget: true,
    },
    phrase: {
      mode: "unsupported",
    },
    retrieval: {
      mode: "approved_hybrid",
      featureWeights: {
        family_intent_match: 130,
        project_scope_match: 205,
        subject_match: 160,
        needed_capability_match: 110,
      },
      directIntentClass: "need",
      suppressAdjacentFamilies: true,
      matchedFieldPrefix: "unmet_need",
    },
    application: {
      mode: "recommendation_only",
      guidanceOnly: true,
      directUseOnlyOnClearAsk: false,
      promptSection: "project",
    },
    semanticRouting: {
      mode: "disabled",
      enabledQueryClasses: [],
    },
    proof: {
      inspectionMode: "workflow_improvement_lifecycle",
      artifactMode: "approved_memory_object",
    },
    capture: {
      category: "unmet_need",
      source: "explicit_unmet_need",
      subjectKeyMetadata: "subject_key",
      captureClasses: ["unmet_need_recommendation"],
    },
    workflowAutoReview: {
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
  },
};

const MEMORY_PROFILE_BY_CAPTURE_CLASS = new Map<string, MemoryProfileDefinition>();
const MEMORY_PROFILE_BY_WORKFLOW_LESSON_FAMILY = new Map<string, MemoryProfileDefinition>();

for (const profile of Object.values(MEMORY_PROFILE_DEFINITIONS)) {
  for (const captureClass of profile.capture?.captureClasses ?? []) {
    MEMORY_PROFILE_BY_CAPTURE_CLASS.set(captureClass, profile);
  }
  if (profile.workflowAutoReview) {
    MEMORY_PROFILE_BY_WORKFLOW_LESSON_FAMILY.set(profile.workflowAutoReview.lessonFamily, profile);
  }
}

export function listMemoryProfiles(): MemoryProfileDefinition[] {
  return MEMORY_PROFILE_IDS.map((id) => MEMORY_PROFILE_DEFINITIONS[id]);
}

export function getMemoryProfile(profileId: MemoryProfileId): MemoryProfileDefinition {
  return MEMORY_PROFILE_DEFINITIONS[profileId];
}

export function getMemoryProfileByCaptureClass(
  captureClass: string,
): MemoryProfileDefinition | null {
  return MEMORY_PROFILE_BY_CAPTURE_CLASS.get(captureClass) ?? null;
}

export function getMemoryProfileIdByWorkflowLessonFamily(
  lessonFamily: string,
): Extract<MemoryProfileId, "workflow_improvement" | "project_rule" | "unmet_need"> | null {
  const id = MEMORY_PROFILE_BY_WORKFLOW_LESSON_FAMILY.get(lessonFamily)?.id;
  return id === "workflow_improvement" || id === "project_rule" || id === "unmet_need" ? id : null;
}

export function getMemoryProfileByWorkflowLessonFamily(
  lessonFamily: string,
): MemoryProfileDefinition | null {
  return MEMORY_PROFILE_BY_WORKFLOW_LESSON_FAMILY.get(lessonFamily) ?? null;
}
