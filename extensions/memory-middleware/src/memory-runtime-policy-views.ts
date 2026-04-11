import {
  getMemoryProfile,
  MEMORY_PROFILE_IDS,
  type MemoryProfileId,
  type MemoryProfileRetrievalFeature,
} from "openclaw/plugin-sdk/memory-profile-registry";

export const MEMORY_RUNTIME_POLICY_KEYS = MEMORY_PROFILE_IDS;

export type MemoryRuntimePolicyKey = MemoryProfileId;

export type MemoryRetrievalRuntimeFeature = MemoryProfileRetrievalFeature;

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

function buildLifecyclePolicy(id: MemoryRuntimePolicyKey): MemoryLifecycleRuntimePolicy {
  const profile = getMemoryProfile(id);
  return {
    pendingCandidateStates: profile.lifecycle.pendingCandidateStates,
    staleWindowDays: profile.lifecycle.staleWindowDays,
  };
}

function buildCorrectionPolicy(id: MemoryRuntimePolicyKey): MemoryCorrectionRuntimePolicy {
  const profile = getMemoryProfile(id);
  return {
    mode: profile.correction.mode,
    targetKind: profile.correction.targetKind,
    requiresExistingTarget: profile.correction.requiresExistingTarget,
  };
}

function buildRetrievalPolicy(id: MemoryRuntimePolicyKey): MemoryRetrievalRuntimePolicy {
  const profile = getMemoryProfile(id);
  return {
    featureWeights: profile.retrieval.featureWeights,
    ...(profile.retrieval.directIntentClass
      ? { directIntentClass: profile.retrieval.directIntentClass }
      : {}),
    ...(profile.retrieval.matchedFieldPrefix
      ? { matchedFieldPrefix: profile.retrieval.matchedFieldPrefix }
      : {}),
  };
}

function buildSemanticRoutingPolicy(
  id: MemoryRuntimePolicyKey,
): MemorySemanticRoutingRuntimePolicy {
  return {
    mode: getMemoryProfile(id).semanticRouting.mode,
  };
}

const APPROVED_MEMORY_RETRIEVAL_RUNTIME_POLICIES: ApprovedMemoryRetrievalRuntimeDefinition[] = (
  ["response_style", "project_fact", "workflow_improvement", "project_rule", "unmet_need"] as const
).map((id) => {
  const profile = getMemoryProfile(id);
  return {
    id,
    storageKinds: profile.storageKinds.filter(
      (
        storageKind,
      ): storageKind is ApprovedMemoryRetrievalRuntimeDefinition["storageKinds"][number] =>
        storageKind === "memory_object" || storageKind === "phrase_pattern",
    ),
    derivedViews: profile.derivedViews,
    retrievalPolicy: buildRetrievalPolicy(id),
  };
});

export function getMemoryLifecycleRuntimePolicy(
  familyId: MemoryRuntimePolicyKey,
): MemoryLifecycleRuntimePolicy {
  return buildLifecyclePolicy(familyId);
}

export function getMemoryCorrectionRuntimePolicy(
  familyId: MemoryRuntimePolicyKey,
): MemoryCorrectionRuntimePolicy {
  return buildCorrectionPolicy(familyId);
}

export function getMemoryRetrievalRuntimePolicy(
  familyId: MemoryRuntimePolicyKey,
): MemoryRetrievalRuntimePolicy {
  return buildRetrievalPolicy(familyId);
}

export function getMemorySemanticRoutingRuntimePolicy(
  familyId: MemoryRuntimePolicyKey,
): MemorySemanticRoutingRuntimePolicy {
  return buildSemanticRoutingPolicy(familyId);
}

export function listApprovedMemoryRetrievalRuntimeDefinitions(): ApprovedMemoryRetrievalRuntimeDefinition[] {
  return APPROVED_MEMORY_RETRIEVAL_RUNTIME_POLICIES;
}

export function listApprovedMemoryRetrievalRuntimePolicies(): ApprovedMemoryRetrievalRuntimeDefinition[] {
  return listApprovedMemoryRetrievalRuntimeDefinitions();
}
