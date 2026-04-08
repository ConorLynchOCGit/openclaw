export type MemoryObjectSurfaceReadKind = "approved" | "reviewable_candidate";

export type MemoryObjectSurfaceReadScaffolding = {
  internalViewName: "internal_approved_memory_v" | "internal_reviewable_candidates_v";
  readSurface: "approved_memory_view" | "reviewable_candidates_view";
  reviewStateExpression: string;
  baseConditions: string[];
};

function buildApprovedMemoryArtifactVisibilityCondition(params: {
  alias: string;
  hiddenArtifactFamilies: readonly string[];
}): string {
  const hiddenArtifacts = params.hiddenArtifactFamilies.map((value) => `'${value}'`).join(", ");
  const artifactFamilyExpression = [
    "coalesce(",
    `${params.alias}.metadata->>'artifactFamily',`,
    `${params.alias}.metadata->'candidateMetadata'->>'artifactFamily',`,
    `${params.alias}.metadata->'promotionMetadata'->>'artifactFamily',`,
    "''",
    ")",
  ].join(" ");
  return `${artifactFamilyExpression} not in (${hiddenArtifacts})`;
}

export function buildMemoryObjectSurfaceReadScaffolding(params: {
  alias: string;
  surfaceKind: MemoryObjectSurfaceReadKind;
  hiddenApprovedArtifactFamilies: readonly string[];
}): MemoryObjectSurfaceReadScaffolding {
  if (params.surfaceKind === "approved") {
    return {
      internalViewName: "internal_approved_memory_v",
      readSurface: "approved_memory_view",
      reviewStateExpression: "'approved'::text",
      baseConditions: [
        buildApprovedMemoryArtifactVisibilityCondition({
          alias: params.alias,
          hiddenArtifactFamilies: params.hiddenApprovedArtifactFamilies,
        }),
      ],
    };
  }

  return {
    internalViewName: "internal_reviewable_candidates_v",
    readSurface: "reviewable_candidates_view",
    reviewStateExpression: `${params.alias}.review_state::text`,
    baseConditions: [`${params.alias}.review_state = 'candidate'`],
  };
}
