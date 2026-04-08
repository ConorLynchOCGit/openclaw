export type HybridMemoryObjectSurfaceKind = "approved" | "reviewable_candidate";

export type HybridMemoryObjectSurfaceScaffolding = {
  readSurface: "approved_memory_view" | "reviewable_candidates_view";
  reviewStateExpression: string;
  autoCaptureTemplateExpression: string;
  autoCaptureFieldKeyExpression: string;
  autoCaptureFactFamilyExpression: string;
  autoCaptureLessonKeyExpression: string;
  autoCaptureLessonFamilyExpression: string;
  autoCaptureGuidancePatternExpression: string;
  autoCaptureNormalizedSubjectExpression: string;
  autoCaptureNormalizedProjectFactLabelExpression: string;
  autoCaptureNormalizedProjectScopeExpression: string;
  autoCaptureNormalizedRecommendedActionExpression: string;
  autoCaptureNormalizedAvoidActionExpression: string;
  autoCaptureNormalizedNeededCapabilityExpression: string;
  autoCaptureNormalizedValueExpression: string;
};

function buildAutoCaptureMetadataExpression(params: {
  alias: string;
  key: string;
  includePromotionMetadata?: boolean;
  fallback?: string;
}): string {
  const sources = [
    `${params.alias}.metadata->'autoCapture'->>'${params.key}'`,
    `${params.alias}.metadata->'candidateMetadata'->'autoCapture'->>'${params.key}'`,
  ];
  if (params.includePromotionMetadata !== false) {
    sources.push(
      `${params.alias}.metadata->'promotionMetadata'->'autoPromotion'->>'${params.key}'`,
      `${params.alias}.metadata->'autoPromotion'->>'${params.key}'`,
    );
  }
  return ["coalesce(", ...sources.map((value) => `${value},`), params.fallback ?? "''", ")"].join(
    " ",
  );
}

export function buildHybridMemoryObjectSurfaceScaffolding(params: {
  alias: string;
  surfaceKind: HybridMemoryObjectSurfaceKind;
}): HybridMemoryObjectSurfaceScaffolding {
  const autoCaptureNormalizedSubjectExpression = buildAutoCaptureMetadataExpression({
    alias: params.alias,
    key: "normalizedSubject",
  });

  const autoCaptureFieldKeyExpression = buildAutoCaptureMetadataExpression({
    alias: params.alias,
    key: "fieldKey",
  });

  return {
    readSurface:
      params.surfaceKind === "approved" ? "approved_memory_view" : "reviewable_candidates_view",
    reviewStateExpression:
      params.surfaceKind === "approved" ? "'approved'::text" : `${params.alias}.review_state::text`,
    autoCaptureTemplateExpression: buildAutoCaptureMetadataExpression({
      alias: params.alias,
      key: "template",
      includePromotionMetadata: params.surfaceKind === "approved",
    }),
    autoCaptureFieldKeyExpression,
    autoCaptureFactFamilyExpression: [
      "coalesce(",
      `${params.alias}.metadata->'autoCapture'->>'factFamily',`,
      `${params.alias}.metadata->'candidateMetadata'->'autoCapture'->>'factFamily',`,
      `${params.alias}.metadata->'promotionMetadata'->'autoPromotion'->>'factFamily',`,
      `${params.alias}.metadata->'autoPromotion'->>'factFamily',`,
      "case when",
      `  ${autoCaptureFieldKeyExpression} <> '' then 'supported_field' else '' end`,
      ")",
    ].join(" "),
    autoCaptureLessonKeyExpression: buildAutoCaptureMetadataExpression({
      alias: params.alias,
      key: "lessonKey",
    }),
    autoCaptureLessonFamilyExpression: buildAutoCaptureMetadataExpression({
      alias: params.alias,
      key: "lessonFamily",
    }),
    autoCaptureGuidancePatternExpression: buildAutoCaptureMetadataExpression({
      alias: params.alias,
      key: "guidancePattern",
    }),
    autoCaptureNormalizedSubjectExpression,
    autoCaptureNormalizedProjectFactLabelExpression: [
      "case",
      `when position(' :: ' in ${autoCaptureNormalizedSubjectExpression}) > 0`,
      `then split_part(${autoCaptureNormalizedSubjectExpression}, ' :: ', 2)`,
      `else ${autoCaptureNormalizedSubjectExpression}`,
      "end",
    ].join(" "),
    autoCaptureNormalizedProjectScopeExpression: buildAutoCaptureMetadataExpression({
      alias: params.alias,
      key: "normalizedProjectScope",
    }),
    autoCaptureNormalizedRecommendedActionExpression: buildAutoCaptureMetadataExpression({
      alias: params.alias,
      key: "normalizedRecommendedAction",
    }),
    autoCaptureNormalizedAvoidActionExpression: buildAutoCaptureMetadataExpression({
      alias: params.alias,
      key: "normalizedAvoidAction",
    }),
    autoCaptureNormalizedNeededCapabilityExpression: buildAutoCaptureMetadataExpression({
      alias: params.alias,
      key: "normalizedNeededCapability",
    }),
    autoCaptureNormalizedValueExpression: buildAutoCaptureMetadataExpression({
      alias: params.alias,
      key: "normalizedValue",
    }),
  };
}
