import {
  createCanonicalMemoryRecord,
  mergeCanonicalMemoryFacets,
  type CanonicalMemoryApplicability,
  type CanonicalMemoryCompatibility,
  type CanonicalMemoryConfidence,
  type CanonicalMemoryFacetMap,
  type CanonicalMemoryKind,
  type CanonicalMemoryProvenance,
  type CanonicalMemoryRecord,
  type CanonicalMemoryRecency,
  type CanonicalMemoryScope,
  type CanonicalMemoryStability,
  type CanonicalMemoryValidationStatus,
} from "./memory-canonical-core.js";

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

export const MEMORY_PHRASE_PATTERN_PROOF_FAMILY_IDS = [
  "workflow_phrase_pattern",
  "response_style_phrase_pattern",
] as const;

export type MemoryPhrasePatternProofFamilyId =
  (typeof MEMORY_PHRASE_PATTERN_PROOF_FAMILY_IDS)[number];

export const MEMORY_PROOF_FAMILY_IDS = [
  ...MEMORY_FAMILY_IDS,
  ...MEMORY_PHRASE_PATTERN_PROOF_FAMILY_IDS,
] as const;

export type MemoryProofFamilyId = (typeof MEMORY_PROOF_FAMILY_IDS)[number];

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

export type MemoryFamilyCorrectionMode =
  | "held_correction"
  | "approved_memory_object_supersede_when_targeted"
  | "validated_procedure_supersede_when_targeted";

export type MemoryFamilyCorrectionTargetKind = "approved_memory_object" | "validated_procedure";

export type MemoryFamilyPhraseMode = "unsupported" | "approved_pattern_reviewed";

export type MemoryFamilyRetrievalMode =
  | "approved_hybrid"
  | "validated_procedure_hybrid"
  | "approved_hybrid_with_semantic_gate";

export type MemoryFamilyRetrievalFeature =
  | "family_intent_match"
  | "project_scope_match"
  | "subject_match"
  | "value_match"
  | "recommended_action_match"
  | "avoid_action_match"
  | "needed_capability_match"
  | "guidance_pattern_match"
  | "procedure_title_match";

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
  | "workflow_improvement_lifecycle"
  | "workflow_phrase_pattern_lifecycle"
  | "response_style_phrase_pattern_lifecycle";

export type MemoryProofArtifactMode =
  | "approved_memory_object"
  | "phrase_pattern"
  | "validated_procedure";

export type MemoryProofDefinition = {
  id: MemoryProofFamilyId;
  inspectionMode: MemoryFamilyProofInspectionMode;
  artifactMode: MemoryProofArtifactMode;
};

export type MemoryFamilyPhrasePatternProofPolicy = {
  familyId: MemoryPhrasePatternProofFamilyId;
  inspectionMode: Extract<
    MemoryFamilyProofInspectionMode,
    "workflow_phrase_pattern_lifecycle" | "response_style_phrase_pattern_lifecycle"
  >;
};

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

export type MemoryFamilyCanonicalProjection = {
  kind: CanonicalMemoryKind;
  defaultTags: readonly string[];
  defaultFacets: CanonicalMemoryFacetMap;
  derivedViews: readonly string[];
  compatibilityStatus: "transitional_family_adapter";
};

export type MemoryFamilyDefinition = {
  id: MemoryFamilyId;
  displayName: string;
  canonicalProjection: MemoryFamilyCanonicalProjection;
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
    targetKind: MemoryFamilyCorrectionTargetKind;
    targetFields: readonly MemoryFamilyCanonicalField[];
    explicitCorrectionRequired: boolean;
    requiresExistingTarget: boolean;
  };
  phrasePolicy: {
    mode: MemoryFamilyPhraseMode;
    sourceStorageKind?: MemoryFamilyStorageKind;
    approvalStorageKind?: MemoryFamilyStorageKind;
  };
  retrievalPolicy: {
    mode: MemoryFamilyRetrievalMode;
    featureWeights: Partial<Record<MemoryFamilyRetrievalFeature, number>>;
    directIntentClass?: "fact" | "rule" | "need" | "procedure" | "style";
    suppressAdjacentFamilies?: boolean;
    matchedFieldPrefix?: string;
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
    artifactMode: MemoryProofArtifactMode;
    phrasePattern?: MemoryFamilyPhrasePatternProofPolicy;
  };
  captureMetadata?: MemoryFamilyCaptureMetadata;
  workflowLessonFamilies?: readonly string[];
  captureClasses?: readonly string[];
};

const FAMILY_DEFINITIONS: Record<MemoryFamilyId, MemoryFamilyDefinition> = {
  response_style: {
    id: "response_style",
    displayName: "Response Style",
    canonicalProjection: {
      kind: "user",
      defaultTags: ["response_style", "preference", "user"],
      defaultFacets: {
        response_style: true,
        preference: true,
      },
      derivedViews: ["response_style"],
      compatibilityStatus: "transitional_family_adapter",
    },
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
      mode: "approved_memory_object_supersede_when_targeted",
      targetKind: "approved_memory_object",
      targetFields: ["subject", "value"],
      explicitCorrectionRequired: true,
      requiresExistingTarget: true,
    },
    phrasePolicy: {
      mode: "approved_pattern_reviewed",
      sourceStorageKind: "memory_object",
      approvalStorageKind: "phrase_pattern",
    },
    retrievalPolicy: {
      mode: "approved_hybrid",
      featureWeights: {
        subject_match: 170,
        value_match: 105,
      },
      directIntentClass: "style",
      matchedFieldPrefix: "response_style",
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
    canonicalProjection: {
      kind: "project",
      defaultTags: ["project_fact", "fact", "project"],
      defaultFacets: {
        fact: true,
        project_scope: true,
      },
      derivedViews: ["project_fact"],
      compatibilityStatus: "transitional_family_adapter",
    },
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
      mode: "approved_memory_object_supersede_when_targeted",
      targetKind: "approved_memory_object",
      targetFields: ["scope", "subject", "value"],
      explicitCorrectionRequired: true,
      requiresExistingTarget: true,
    },
    phrasePolicy: {
      mode: "unsupported",
    },
    retrievalPolicy: {
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
      artifactMode: "approved_memory_object",
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
    canonicalProjection: {
      kind: "feedback",
      defaultTags: ["recurring_procedure", "procedure", "validated_approach", "feedback"],
      defaultFacets: {
        procedure: true,
        validated_approach: true,
      },
      derivedViews: ["procedure"],
      compatibilityStatus: "transitional_family_adapter",
    },
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
      mode: "validated_procedure_supersede_when_targeted",
      targetKind: "validated_procedure",
      targetFields: ["subject", "value", "procedure_title"],
      explicitCorrectionRequired: true,
      requiresExistingTarget: false,
    },
    phrasePolicy: {
      mode: "unsupported",
    },
    retrievalPolicy: {
      mode: "validated_procedure_hybrid",
      featureWeights: {
        procedure_title_match: 0,
        subject_match: 200,
      },
      directIntentClass: "procedure",
      matchedFieldPrefix: "procedure",
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
      artifactMode: "validated_procedure",
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
    canonicalProjection: {
      kind: "feedback",
      defaultTags: ["workflow_improvement", "workflow_guidance", "feedback"],
      defaultFacets: {
        workflow_guidance: true,
        validated_approach: true,
      },
      derivedViews: ["workflow_guidance", "learned_guidance"],
      compatibilityStatus: "transitional_family_adapter",
    },
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
      mode: "approved_memory_object_supersede_when_targeted",
      targetKind: "approved_memory_object",
      targetFields: ["scope", "subject", "recommended_action", "avoid_action"],
      explicitCorrectionRequired: true,
      requiresExistingTarget: true,
    },
    phrasePolicy: {
      mode: "approved_pattern_reviewed",
      sourceStorageKind: "memory_object",
      approvalStorageKind: "phrase_pattern",
    },
    retrievalPolicy: {
      mode: "approved_hybrid_with_semantic_gate",
      featureWeights: {
        subject_match: 170,
        recommended_action_match: 95,
        avoid_action_match: 90,
        guidance_pattern_match: 40,
      },
      matchedFieldPrefix: "generalized",
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
      artifactMode: "approved_memory_object",
      phrasePattern: {
        familyId: "workflow_phrase_pattern",
        inspectionMode: "workflow_phrase_pattern_lifecycle",
      },
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
    canonicalProjection: {
      kind: "feedback",
      defaultTags: ["project_rule", "rule", "feedback"],
      defaultFacets: {
        project_rule: true,
        rule: true,
      },
      derivedViews: ["project_rule"],
      compatibilityStatus: "transitional_family_adapter",
    },
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
      mode: "approved_memory_object_supersede_when_targeted",
      targetKind: "approved_memory_object",
      targetFields: ["scope", "subject", "recommended_action", "avoid_action"],
      explicitCorrectionRequired: true,
      requiresExistingTarget: true,
    },
    phrasePolicy: {
      mode: "unsupported",
    },
    retrievalPolicy: {
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
      artifactMode: "approved_memory_object",
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
    canonicalProjection: {
      kind: "project",
      defaultTags: ["unmet_need", "open_need", "project"],
      defaultFacets: {
        open_need: true,
        project_scope: true,
      },
      derivedViews: ["unmet_need"],
      compatibilityStatus: "transitional_family_adapter",
    },
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
      targetKind: "approved_memory_object",
      targetFields: ["scope", "subject", "needed_capability"],
      explicitCorrectionRequired: true,
      requiresExistingTarget: true,
    },
    phrasePolicy: {
      mode: "unsupported",
    },
    retrievalPolicy: {
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
      artifactMode: "approved_memory_object",
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
const PHRASE_PATTERN_PROOF_FAMILY_TO_DEFINITION = new Map<
  MemoryPhrasePatternProofFamilyId,
  MemoryProofDefinition
>();

for (const definition of Object.values(FAMILY_DEFINITIONS)) {
  for (const captureClass of definition.captureClasses ?? []) {
    CAPTURE_CLASS_TO_FAMILY_ID.set(captureClass, definition.id);
  }
  for (const lessonFamily of definition.workflowLessonFamilies ?? []) {
    WORKFLOW_LESSON_FAMILY_TO_FAMILY_ID.set(lessonFamily, definition.id);
  }
  if (definition.proofPolicy.phrasePattern) {
    PHRASE_PATTERN_PROOF_FAMILY_TO_DEFINITION.set(definition.proofPolicy.phrasePattern.familyId, {
      id: definition.proofPolicy.phrasePattern.familyId,
      inspectionMode: definition.proofPolicy.phrasePattern.inspectionMode,
      artifactMode: "phrase_pattern",
    });
  }
}

export function listMemoryFamilyDefinitions(): MemoryFamilyDefinition[] {
  return MEMORY_FAMILY_IDS.map((id) => FAMILY_DEFINITIONS[id]);
}

export function listMemoryFamilyPolicies(): MemoryFamilyDefinition[] {
  return listMemoryFamilyDefinitions();
}

export function getMemoryFamilyDefinition(familyId: MemoryFamilyId): MemoryFamilyDefinition {
  return FAMILY_DEFINITIONS[familyId];
}

export function getMemoryFamilyPolicy(familyId: MemoryFamilyId): MemoryFamilyDefinition {
  return getMemoryFamilyDefinition(familyId);
}

export function getMemoryFamilyCanonicalProjection(
  familyId: MemoryFamilyId,
): MemoryFamilyCanonicalProjection {
  return getMemoryFamilyDefinition(familyId).canonicalProjection;
}

export function memoryFamilyProjectsToDerivedView(
  familyId: MemoryFamilyId,
  derivedView: string,
): boolean {
  return getMemoryFamilyCanonicalProjection(familyId).derivedViews.includes(derivedView);
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

export function getMemoryFamilyIdByWorkflowLessonFamily(
  lessonFamily: string,
): MemoryFamilyId | null {
  return WORKFLOW_LESSON_FAMILY_TO_FAMILY_ID.get(lessonFamily) ?? null;
}

export function isMemoryProofInspectableFamily(
  value: string,
): value is MemoryProofInspectableFamilyId {
  return MEMORY_PROOF_INSPECTABLE_FAMILY_IDS.includes(value as MemoryProofInspectableFamilyId);
}

export function isMemoryProofFamily(value: string): value is MemoryProofFamilyId {
  return MEMORY_PROOF_FAMILY_IDS.includes(value as MemoryProofFamilyId);
}

export function getMemoryProofDefinition(familyId: MemoryProofFamilyId): MemoryProofDefinition {
  if (MEMORY_FAMILY_IDS.includes(familyId as MemoryFamilyId)) {
    const definition = getMemoryFamilyDefinition(familyId as MemoryFamilyId);
    return {
      id: familyId,
      inspectionMode: definition.proofPolicy.inspectionMode,
      artifactMode: definition.proofPolicy.artifactMode,
    };
  }
  const phrasePatternDefinition = PHRASE_PATTERN_PROOF_FAMILY_TO_DEFINITION.get(
    familyId as MemoryPhrasePatternProofFamilyId,
  );
  if (!phrasePatternDefinition) {
    throw new Error(`unknown proof family ${familyId}`);
  }
  return phrasePatternDefinition;
}

export function getPhrasePatternProofFamilyId(
  familyId: MemoryFamilyId,
): MemoryPhrasePatternProofFamilyId | null {
  return getMemoryFamilyDefinition(familyId).proofPolicy.phrasePattern?.familyId ?? null;
}

export function supportsMemoryFamilyReviewedPhrasePatterns(familyId: MemoryFamilyId): boolean {
  return getMemoryFamilyDefinition(familyId).phrasePolicy.mode === "approved_pattern_reviewed";
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

function resolveCanonicalScope(
  definition: MemoryFamilyDefinition,
  projectId?: string,
): CanonicalMemoryScope {
  switch (definition.scopeModel.kind) {
    case "global":
      return { kind: "global" };
    case "project":
      return projectId ? { kind: "project", projectId } : { kind: "project" };
    case "mixed_project":
      return projectId ? { kind: "mixed", projectId } : { kind: "mixed" };
  }
}

function mergeCanonicalTags(
  defaultTags: readonly string[],
  tags: readonly string[] | undefined,
): readonly string[] {
  return [...new Set([...defaultTags, ...(tags ?? [])])];
}

function buildCanonicalCompatibility(
  definition: MemoryFamilyDefinition,
  overrides: Partial<CanonicalMemoryCompatibility> | undefined,
): CanonicalMemoryCompatibility {
  return {
    transitionalFamilyId: definition.id,
    storageKinds: definition.storageKinds,
    workflowLessonFamilies: definition.workflowLessonFamilies,
    captureClasses: definition.captureClasses,
    captureCategory: definition.captureMetadata?.category,
    captureSource: definition.captureMetadata?.source,
    phrasePatternProofFamilyId: definition.proofPolicy.phrasePattern?.familyId,
    ...overrides,
  };
}

function buildCanonicalApplicability(
  definition: MemoryFamilyDefinition,
  overrides: CanonicalMemoryApplicability | undefined,
): CanonicalMemoryApplicability {
  return {
    promptSections: [definition.applicationPolicy.promptSection],
    ...(definition.retrievalPolicy.directIntentClass
      ? { directIntentClasses: [definition.retrievalPolicy.directIntentClass] }
      : {}),
    ...(definition.semanticRoutingPolicy.enabledQueryClasses.length > 0
      ? { queryClasses: definition.semanticRoutingPolicy.enabledQueryClasses }
      : {}),
    ...overrides,
  };
}

export type BuildCanonicalMemoryRecordForFamilyParams = {
  familyId: MemoryFamilyId;
  subject: string;
  statement: string;
  projectId?: string;
  confidence?: CanonicalMemoryConfidence;
  validationStatus?: CanonicalMemoryValidationStatus;
  stability?: CanonicalMemoryStability;
  recency?: CanonicalMemoryRecency;
  provenance?: CanonicalMemoryProvenance;
  tags?: readonly string[];
  facets?: CanonicalMemoryFacetMap;
  applicability?: CanonicalMemoryApplicability;
  compatibility?: Partial<CanonicalMemoryCompatibility>;
};

export function buildCanonicalMemoryRecordForFamily(
  params: BuildCanonicalMemoryRecordForFamilyParams,
): CanonicalMemoryRecord {
  const definition = getMemoryFamilyDefinition(params.familyId);
  return createCanonicalMemoryRecord({
    kind: definition.canonicalProjection.kind,
    subject: params.subject,
    statement: params.statement,
    scope: resolveCanonicalScope(definition, params.projectId),
    confidence: params.confidence,
    validationStatus: params.validationStatus,
    stability: params.stability,
    recency: params.recency,
    provenance: params.provenance,
    tags: mergeCanonicalTags(definition.canonicalProjection.defaultTags, params.tags),
    facets: mergeCanonicalMemoryFacets(definition.canonicalProjection.defaultFacets, params.facets),
    applicability: buildCanonicalApplicability(definition, params.applicability),
    compatibility: buildCanonicalCompatibility(definition, params.compatibility),
  });
}
