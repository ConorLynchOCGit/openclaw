export const MEMORY_RUNTIME_POLICY_KEYS = [
  "response_style",
  "project_fact",
  "recurring_procedure",
  "workflow_improvement",
  "project_rule",
  "unmet_need",
] as const;

export type MemoryRuntimePolicyKey = (typeof MEMORY_RUNTIME_POLICY_KEYS)[number];

export type MemoryRetrievalRuntimeFeature =
  | "family_intent_match"
  | "project_scope_match"
  | "subject_match"
  | "value_match"
  | "recommended_action_match"
  | "avoid_action_match"
  | "needed_capability_match"
  | "guidance_pattern_match"
  | "procedure_title_match";

export type MemoryLifecycleRuntimePolicy = {
  pendingCandidateStates: readonly string[];
  staleWindowDays: number;
};

export type MemoryCorrectionRuntimePolicy = {
  mode:
    | "held_correction"
    | "approved_memory_object_supersede_when_targeted"
    | "validated_procedure_supersede_when_targeted";
  targetKind: "approved_memory_object" | "validated_procedure";
  requiresExistingTarget: boolean;
};

export type MemoryRetrievalRuntimePolicy = {
  featureWeights: Partial<Record<MemoryRetrievalRuntimeFeature, number>>;
  directIntentClass?: "fact" | "rule" | "need" | "procedure" | "style";
  matchedFieldPrefix?: string;
};

export type MemorySemanticRoutingRuntimePolicy = {
  mode: "disabled" | "family_gated_approved_only" | "validated_procedure_only";
};

export type ApprovedMemoryRetrievalRuntimeDefinition = {
  id: Exclude<MemoryRuntimePolicyKey, "recurring_procedure">;
  storageKinds: readonly ("memory_object" | "phrase_pattern")[];
  derivedViews: readonly string[];
  retrievalPolicy: MemoryRetrievalRuntimePolicy;
};

const MEMORY_RUNTIME_POLICY_TABLE: Record<
  MemoryRuntimePolicyKey,
  {
    lifecycle: MemoryLifecycleRuntimePolicy;
    correction: MemoryCorrectionRuntimePolicy;
    retrieval: MemoryRetrievalRuntimePolicy;
    semantic: MemorySemanticRoutingRuntimePolicy;
    derivedViews: readonly string[];
    storageKinds: readonly (
      | "memory_object"
      | "procedure_candidate"
      | "validated_procedure"
      | "phrase_pattern"
    )[];
  }
> = {
  response_style: {
    lifecycle: {
      pendingCandidateStates: ["pending_confirmation", "hold_for_more_evidence"],
      staleWindowDays: 3,
    },
    correction: {
      mode: "approved_memory_object_supersede_when_targeted",
      targetKind: "approved_memory_object",
      requiresExistingTarget: true,
    },
    retrieval: {
      featureWeights: {
        subject_match: 170,
        value_match: 105,
      },
      directIntentClass: "style",
      matchedFieldPrefix: "response_style",
    },
    semantic: {
      mode: "disabled",
    },
    derivedViews: ["response_style"],
    storageKinds: ["memory_object", "phrase_pattern"],
  },
  project_fact: {
    lifecycle: {
      pendingCandidateStates: ["pending_confirmation", "hold_for_more_evidence"],
      staleWindowDays: 3,
    },
    correction: {
      mode: "approved_memory_object_supersede_when_targeted",
      targetKind: "approved_memory_object",
      requiresExistingTarget: true,
    },
    retrieval: {
      featureWeights: {
        family_intent_match: 90,
        project_scope_match: 205,
        subject_match: 180,
        value_match: 100,
      },
      directIntentClass: "fact",
      matchedFieldPrefix: "project_fact",
    },
    semantic: {
      mode: "disabled",
    },
    derivedViews: ["project_fact"],
    storageKinds: ["memory_object"],
  },
  recurring_procedure: {
    lifecycle: {
      pendingCandidateStates: ["pending_confirmation", "hold_for_more_evidence"],
      staleWindowDays: 3,
    },
    correction: {
      mode: "validated_procedure_supersede_when_targeted",
      targetKind: "validated_procedure",
      requiresExistingTarget: false,
    },
    retrieval: {
      featureWeights: {
        procedure_title_match: 0,
        subject_match: 200,
      },
      directIntentClass: "procedure",
      matchedFieldPrefix: "procedure",
    },
    semantic: {
      mode: "validated_procedure_only",
    },
    derivedViews: ["procedure"],
    storageKinds: ["procedure_candidate", "validated_procedure"],
  },
  workflow_improvement: {
    lifecycle: {
      pendingCandidateStates: ["pending_confirmation", "review_required", "hold_for_more_evidence"],
      staleWindowDays: 3,
    },
    correction: {
      mode: "approved_memory_object_supersede_when_targeted",
      targetKind: "approved_memory_object",
      requiresExistingTarget: true,
    },
    retrieval: {
      featureWeights: {
        subject_match: 170,
        recommended_action_match: 95,
        avoid_action_match: 90,
        guidance_pattern_match: 40,
      },
      matchedFieldPrefix: "generalized",
    },
    semantic: {
      mode: "family_gated_approved_only",
    },
    derivedViews: ["workflow_guidance", "learned_guidance"],
    storageKinds: ["memory_object", "phrase_pattern"],
  },
  project_rule: {
    lifecycle: {
      pendingCandidateStates: ["pending_confirmation", "review_required", "hold_for_more_evidence"],
      staleWindowDays: 3,
    },
    correction: {
      mode: "approved_memory_object_supersede_when_targeted",
      targetKind: "approved_memory_object",
      requiresExistingTarget: true,
    },
    retrieval: {
      featureWeights: {
        family_intent_match: 95,
        project_scope_match: 210,
        subject_match: 165,
        recommended_action_match: 95,
        avoid_action_match: 90,
        guidance_pattern_match: 40,
      },
      directIntentClass: "rule",
      matchedFieldPrefix: "project_rule",
    },
    semantic: {
      mode: "disabled",
    },
    derivedViews: ["project_rule"],
    storageKinds: ["memory_object"],
  },
  unmet_need: {
    lifecycle: {
      pendingCandidateStates: ["pending_confirmation", "review_required", "hold_for_more_evidence"],
      staleWindowDays: 3,
    },
    correction: {
      mode: "held_correction",
      targetKind: "approved_memory_object",
      requiresExistingTarget: true,
    },
    retrieval: {
      featureWeights: {
        family_intent_match: 130,
        project_scope_match: 205,
        subject_match: 160,
        needed_capability_match: 110,
      },
      directIntentClass: "need",
      matchedFieldPrefix: "unmet_need",
    },
    semantic: {
      mode: "disabled",
    },
    derivedViews: ["unmet_need"],
    storageKinds: ["memory_object"],
  },
};

const APPROVED_MEMORY_RETRIEVAL_RUNTIME_POLICIES: ApprovedMemoryRetrievalRuntimeDefinition[] = (
  ["response_style", "project_fact", "workflow_improvement", "project_rule", "unmet_need"] as const
).map((id) => ({
  id,
  storageKinds: MEMORY_RUNTIME_POLICY_TABLE[id].storageKinds.filter(
    (
      storageKind,
    ): storageKind is ApprovedMemoryRetrievalRuntimeDefinition["storageKinds"][number] =>
      storageKind === "memory_object" || storageKind === "phrase_pattern",
  ),
  derivedViews: MEMORY_RUNTIME_POLICY_TABLE[id].derivedViews,
  retrievalPolicy: MEMORY_RUNTIME_POLICY_TABLE[id].retrieval,
}));

export function getMemoryLifecycleRuntimePolicy(
  familyId: MemoryRuntimePolicyKey,
): MemoryLifecycleRuntimePolicy {
  return MEMORY_RUNTIME_POLICY_TABLE[familyId].lifecycle;
}

export function getMemoryCorrectionRuntimePolicy(
  familyId: MemoryRuntimePolicyKey,
): MemoryCorrectionRuntimePolicy {
  return MEMORY_RUNTIME_POLICY_TABLE[familyId].correction;
}

export function getMemoryRetrievalRuntimePolicy(
  familyId: MemoryRuntimePolicyKey,
): MemoryRetrievalRuntimePolicy {
  return MEMORY_RUNTIME_POLICY_TABLE[familyId].retrieval;
}

export function getMemorySemanticRoutingRuntimePolicy(
  familyId: MemoryRuntimePolicyKey,
): MemorySemanticRoutingRuntimePolicy {
  return MEMORY_RUNTIME_POLICY_TABLE[familyId].semantic;
}

export function listApprovedMemoryRetrievalRuntimePolicies(): ApprovedMemoryRetrievalRuntimeDefinition[] {
  return APPROVED_MEMORY_RETRIEVAL_RUNTIME_POLICIES.map((definition) => ({
    id: definition.id,
    storageKinds: [...definition.storageKinds],
    derivedViews: [...definition.derivedViews],
    retrievalPolicy: {
      featureWeights: { ...definition.retrievalPolicy.featureWeights },
      ...(definition.retrievalPolicy.directIntentClass
        ? { directIntentClass: definition.retrievalPolicy.directIntentClass }
        : {}),
      ...(definition.retrievalPolicy.matchedFieldPrefix
        ? { matchedFieldPrefix: definition.retrievalPolicy.matchedFieldPrefix }
        : {}),
    },
  }));
}
