import {
  getMemoryCorrectionPolicyView,
  getMemoryLifecyclePolicyView,
  getMemoryRetrievalPolicyView,
  getMemorySemanticRoutingPolicyView,
  listApprovedMemoryRetrievalPolicyViews,
  type ApprovedMemoryRetrievalPolicyView,
  type MemoryCorrectionPolicyView,
  type MemoryFamilyId,
  type MemoryLifecyclePolicyView,
  type MemoryRetrievalPolicyView,
  type MemorySemanticRoutingPolicyView,
} from "openclaw/plugin-sdk/memory-family-policy";

export type MemoryLifecycleRuntimePolicy = MemoryLifecyclePolicyView;
export type MemoryCorrectionRuntimePolicy = MemoryCorrectionPolicyView;
export type MemoryRetrievalRuntimePolicy = MemoryRetrievalPolicyView;
export type MemorySemanticRoutingRuntimePolicy = MemorySemanticRoutingPolicyView;
export type ApprovedMemoryRetrievalRuntimeDefinition = ApprovedMemoryRetrievalPolicyView;

export function getMemoryLifecycleRuntimePolicy(
  familyId: MemoryFamilyId,
): MemoryLifecycleRuntimePolicy {
  return getMemoryLifecyclePolicyView(familyId);
}

export function getMemoryCorrectionRuntimePolicy(
  familyId: MemoryFamilyId,
): MemoryCorrectionRuntimePolicy {
  return getMemoryCorrectionPolicyView(familyId);
}

export function getMemoryRetrievalRuntimePolicy(
  familyId: MemoryFamilyId,
): MemoryRetrievalRuntimePolicy {
  return getMemoryRetrievalPolicyView(familyId);
}

export function getMemorySemanticRoutingRuntimePolicy(
  familyId: MemoryFamilyId,
): MemorySemanticRoutingRuntimePolicy {
  return getMemorySemanticRoutingPolicyView(familyId);
}

export function listApprovedMemoryRetrievalRuntimePolicies(): ApprovedMemoryRetrievalRuntimeDefinition[] {
  return listApprovedMemoryRetrievalPolicyViews();
}
