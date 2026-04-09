export const DURABLE_MEMORY_GUIDANCE_FAMILY_IDS = [
  "response_style",
  "project_fact",
  "recurring_procedure",
  "workflow_improvement",
  "project_rule",
  "unmet_need",
] as const;

export type DurableMemoryGuidanceFamilyId = (typeof DURABLE_MEMORY_GUIDANCE_FAMILY_IDS)[number];

export type DurableMemoryGuidanceFamilyDefinition = {
  familyId: DurableMemoryGuidanceFamilyId;
  applicationMode:
    | "shape_reply"
    | "guidance_only"
    | "recommendation_only"
    | "suggestion_first"
    | "direct_answer";
  directUseOnlyOnClearAsk: boolean;
  retrievalMode:
    | "approved_hybrid"
    | "validated_procedure_hybrid"
    | "approved_hybrid_with_semantic_gate";
  promptSection: "behavior" | "project" | "procedure";
};

const DURABLE_MEMORY_GUIDANCE_FAMILIES: Record<
  DurableMemoryGuidanceFamilyId,
  DurableMemoryGuidanceFamilyDefinition
> = {
  response_style: {
    familyId: "response_style",
    applicationMode: "shape_reply",
    directUseOnlyOnClearAsk: false,
    retrievalMode: "approved_hybrid",
    promptSection: "behavior",
  },
  project_fact: {
    familyId: "project_fact",
    applicationMode: "direct_answer",
    directUseOnlyOnClearAsk: false,
    retrievalMode: "approved_hybrid",
    promptSection: "project",
  },
  recurring_procedure: {
    familyId: "recurring_procedure",
    applicationMode: "suggestion_first",
    directUseOnlyOnClearAsk: true,
    retrievalMode: "validated_procedure_hybrid",
    promptSection: "procedure",
  },
  workflow_improvement: {
    familyId: "workflow_improvement",
    applicationMode: "guidance_only",
    directUseOnlyOnClearAsk: false,
    retrievalMode: "approved_hybrid_with_semantic_gate",
    promptSection: "behavior",
  },
  project_rule: {
    familyId: "project_rule",
    applicationMode: "guidance_only",
    directUseOnlyOnClearAsk: false,
    retrievalMode: "approved_hybrid",
    promptSection: "project",
  },
  unmet_need: {
    familyId: "unmet_need",
    applicationMode: "recommendation_only",
    directUseOnlyOnClearAsk: false,
    retrievalMode: "approved_hybrid",
    promptSection: "project",
  },
};

export function getDurableMemoryGuidanceFamilyDefinition(
  familyId: DurableMemoryGuidanceFamilyId,
): DurableMemoryGuidanceFamilyDefinition {
  return DURABLE_MEMORY_GUIDANCE_FAMILIES[familyId];
}
