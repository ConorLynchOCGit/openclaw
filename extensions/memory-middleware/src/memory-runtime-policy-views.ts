import {
  getMemoryProfile,
  listMemoryProfiles,
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
  mode: "disabled" | "profile_gated_approved_only" | "validated_procedure_only";
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

const APPROVED_MEMORY_RETRIEVAL_RUNTIME_POLICIES: ApprovedMemoryRetrievalRuntimeDefinition[] =
  listMemoryProfiles()
    .filter(
      (
        profile,
      ): profile is ReturnType<typeof getMemoryProfile> & {
        id: ApprovedMemoryRetrievalRuntimeDefinition["id"];
      } =>
        profile.id !== "recurring_procedure" &&
        profile.storageKinds.includes("memory_object") &&
        Object.keys(profile.retrieval.featureWeights).length > 0,
    )
    .map((profile) => ({
      id: profile.id,
      storageKinds: profile.storageKinds.filter(
        (
          storageKind,
        ): storageKind is ApprovedMemoryRetrievalRuntimeDefinition["storageKinds"][number] =>
          storageKind === "memory_object" || storageKind === "phrase_pattern",
      ),
      derivedViews: profile.derivedViews,
      retrievalPolicy: buildRetrievalPolicy(profile.id),
    }));

export function getMemoryLifecycleRuntimePolicy(
  profileId: MemoryRuntimePolicyKey,
): MemoryLifecycleRuntimePolicy {
  return buildLifecyclePolicy(profileId);
}

export function getMemoryCorrectionRuntimePolicy(
  profileId: MemoryRuntimePolicyKey,
): MemoryCorrectionRuntimePolicy {
  return buildCorrectionPolicy(profileId);
}

export function getMemoryRetrievalRuntimePolicy(
  profileId: MemoryRuntimePolicyKey,
): MemoryRetrievalRuntimePolicy {
  return buildRetrievalPolicy(profileId);
}

export function getMemorySemanticRoutingRuntimePolicy(
  profileId: MemoryRuntimePolicyKey,
): MemorySemanticRoutingRuntimePolicy {
  return buildSemanticRoutingPolicy(profileId);
}

export function listApprovedMemoryRetrievalRuntimeDefinitions(): ApprovedMemoryRetrievalRuntimeDefinition[] {
  return APPROVED_MEMORY_RETRIEVAL_RUNTIME_POLICIES;
}

export function listApprovedMemoryRetrievalRuntimePolicies(): ApprovedMemoryRetrievalRuntimeDefinition[] {
  return listApprovedMemoryRetrievalRuntimeDefinitions();
}
