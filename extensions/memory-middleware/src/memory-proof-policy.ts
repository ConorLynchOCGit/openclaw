export const MEMORY_PROOF_INSPECTABLE_FAMILY_IDS = [
  "response_style",
  "project_fact",
  "recurring_procedure",
  "workflow_improvement",
  "project_rule",
  "unmet_need",
] as const;

export type MemoryProofInspectableFamilyId = (typeof MEMORY_PROOF_INSPECTABLE_FAMILY_IDS)[number];

export const MEMORY_PHRASE_PATTERN_PROOF_FAMILY_IDS = [
  "workflow_phrase_pattern",
  "response_style_phrase_pattern",
] as const;

export type MemoryPhrasePatternProofFamilyId =
  (typeof MEMORY_PHRASE_PATTERN_PROOF_FAMILY_IDS)[number];

export const MEMORY_PROOF_FAMILY_IDS = [
  ...MEMORY_PROOF_INSPECTABLE_FAMILY_IDS,
  ...MEMORY_PHRASE_PATTERN_PROOF_FAMILY_IDS,
] as const;

export type MemoryProofFamilyId = (typeof MEMORY_PROOF_FAMILY_IDS)[number];

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

const MEMORY_PROOF_DEFINITIONS = {
  response_style: {
    id: "response_style",
    inspectionMode: "response_style_lifecycle",
    artifactMode: "approved_memory_object",
  },
  project_fact: {
    id: "project_fact",
    inspectionMode: "project_fact_lifecycle",
    artifactMode: "approved_memory_object",
  },
  recurring_procedure: {
    id: "recurring_procedure",
    inspectionMode: "recurring_procedure_lifecycle",
    artifactMode: "validated_procedure",
  },
  workflow_improvement: {
    id: "workflow_improvement",
    inspectionMode: "workflow_improvement_lifecycle",
    artifactMode: "approved_memory_object",
  },
  project_rule: {
    id: "project_rule",
    inspectionMode: "workflow_improvement_lifecycle",
    artifactMode: "approved_memory_object",
  },
  unmet_need: {
    id: "unmet_need",
    inspectionMode: "workflow_improvement_lifecycle",
    artifactMode: "approved_memory_object",
  },
  workflow_phrase_pattern: {
    id: "workflow_phrase_pattern",
    inspectionMode: "workflow_phrase_pattern_lifecycle",
    artifactMode: "phrase_pattern",
  },
  response_style_phrase_pattern: {
    id: "response_style_phrase_pattern",
    inspectionMode: "response_style_phrase_pattern_lifecycle",
    artifactMode: "phrase_pattern",
  },
} as const satisfies Record<MemoryProofFamilyId, MemoryProofDefinition>;

const PHRASE_PATTERN_PROOF_FAMILY_BY_SOURCE = {
  workflow_improvement: "workflow_phrase_pattern",
  response_style: "response_style_phrase_pattern",
} as const satisfies Partial<
  Record<MemoryProofInspectableFamilyId, MemoryPhrasePatternProofFamilyId>
>;

const REVIEWED_PHRASE_PATTERN_FAMILIES = new Set<MemoryProofInspectableFamilyId>([
  "workflow_improvement",
  "response_style",
]);

export function isMemoryProofFamily(value: string): value is MemoryProofFamilyId {
  return MEMORY_PROOF_FAMILY_IDS.includes(value as MemoryProofFamilyId);
}

export function getMemoryProofDefinition(familyId: MemoryProofFamilyId): MemoryProofDefinition {
  return MEMORY_PROOF_DEFINITIONS[familyId];
}

export function getPhrasePatternProofFamilyId(
  familyId: MemoryProofInspectableFamilyId,
): MemoryPhrasePatternProofFamilyId | null {
  return familyId === "workflow_improvement"
    ? "workflow_phrase_pattern"
    : familyId === "response_style"
      ? "response_style_phrase_pattern"
      : null;
}

export function supportsMemoryFamilyReviewedPhrasePatterns(
  familyId: MemoryProofInspectableFamilyId,
): boolean {
  return REVIEWED_PHRASE_PATTERN_FAMILIES.has(familyId);
}
