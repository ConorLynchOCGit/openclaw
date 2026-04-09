export type HybridMemoryObjectSurfaceKind = "approved" | "reviewable_candidate";

export type HybridMemoryObjectSurfaceScaffolding = {
  readSurface: "approved_memory_view" | "reviewable_candidates_view";
  reviewStateExpression: string;
  compatibilityFamilyIdExpression: string;
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

function buildJsonbPathExpression(params: { alias: string; path: readonly string[] }): string {
  const [first, ...rest] = params.path;
  if (!first) {
    throw new Error("jsonb path must include at least one segment");
  }
  return `${params.alias}.metadata${[first, ...rest]
    .map((segment, index, parts) =>
      index === parts.length - 1 ? `->>'${segment}'` : `->'${segment}'`,
    )
    .join("")}`;
}

function buildCoalescedMetadataExpression(params: {
  expressions: readonly string[];
  fallback?: string;
}): string {
  return [
    "coalesce(",
    ...params.expressions.map((expression) => `${expression},`),
    params.fallback ?? "''",
    ")",
  ].join(" ");
}

function buildCanonicalCandidateMetadataExpression(params: {
  alias: string;
  path: readonly string[];
  includePromotionMetadata?: boolean;
}): string {
  const expressions = [
    buildJsonbPathExpression({
      alias: params.alias,
      path: ["canonicalIngestionCandidate", ...params.path],
    }),
    buildJsonbPathExpression({
      alias: params.alias,
      path: ["candidateMetadata", "canonicalIngestionCandidate", ...params.path],
    }),
  ];
  if (params.includePromotionMetadata !== false) {
    expressions.push(
      buildJsonbPathExpression({
        alias: params.alias,
        path: ["promotionMetadata", "canonicalIngestionCandidate", ...params.path],
      }),
      buildJsonbPathExpression({
        alias: params.alias,
        path: ["autoPromotion", "canonicalIngestionCandidate", ...params.path],
      }),
    );
  }
  return buildCoalescedMetadataExpression({ expressions });
}

function buildLegacyAutoCaptureMetadataExpression(params: {
  alias: string;
  key: string;
  includePromotionMetadata?: boolean;
}): string {
  const expressions = [
    buildJsonbPathExpression({
      alias: params.alias,
      path: ["autoCapture", params.key],
    }),
    buildJsonbPathExpression({
      alias: params.alias,
      path: ["candidateMetadata", "autoCapture", params.key],
    }),
  ];
  if (params.includePromotionMetadata !== false) {
    expressions.push(
      buildJsonbPathExpression({
        alias: params.alias,
        path: ["promotionMetadata", "autoPromotion", params.key],
      }),
      buildJsonbPathExpression({
        alias: params.alias,
        path: ["autoPromotion", params.key],
      }),
    );
  }
  return buildCoalescedMetadataExpression({ expressions });
}

function buildCanonicalFirstMetadataExpression(params: {
  alias: string;
  canonicalPath: readonly string[];
  legacyKey: string;
  includePromotionMetadata?: boolean;
  fallback?: string;
}): string {
  return buildCoalescedMetadataExpression({
    expressions: [
      buildCanonicalCandidateMetadataExpression({
        alias: params.alias,
        path: params.canonicalPath,
        includePromotionMetadata: params.includePromotionMetadata,
      }),
      buildLegacyAutoCaptureMetadataExpression({
        alias: params.alias,
        key: params.legacyKey,
        includePromotionMetadata: params.includePromotionMetadata,
      }),
    ],
    fallback: params.fallback,
  });
}

export function buildHybridMemoryObjectSurfaceScaffolding(params: {
  alias: string;
  surfaceKind: HybridMemoryObjectSurfaceKind;
}): HybridMemoryObjectSurfaceScaffolding {
  const includePromotionMetadata = params.surfaceKind === "approved";
  const autoCaptureNormalizedSubjectExpression = buildCoalescedMetadataExpression({
    expressions: [
      `lower(${buildCanonicalCandidateMetadataExpression({
        alias: params.alias,
        path: ["record", "facets", "normalizedSubject"],
        includePromotionMetadata,
      })})`,
      `lower(${buildCanonicalCandidateMetadataExpression({
        alias: params.alias,
        path: ["record", "subject"],
        includePromotionMetadata,
      })})`,
      `lower(${buildLegacyAutoCaptureMetadataExpression({
        alias: params.alias,
        key: "normalizedSubject",
        includePromotionMetadata,
      })})`,
    ],
    fallback: "''",
  });

  const compatibilityFamilyIdExpression = buildCoalescedMetadataExpression({
    expressions: [
      buildCanonicalCandidateMetadataExpression({
        alias: params.alias,
        path: ["record", "compatibility", "transitionalFamilyId"],
        includePromotionMetadata,
      }),
      buildLegacyAutoCaptureMetadataExpression({
        alias: params.alias,
        key: "family",
        includePromotionMetadata,
      }),
      [
        "case",
        "when",
        buildLegacyAutoCaptureMetadataExpression({
          alias: params.alias,
          key: "template",
          includePromotionMetadata,
        }),
        "= 'response_style_generalized_guidance' then 'response_style'",
        "when",
        buildLegacyAutoCaptureMetadataExpression({
          alias: params.alias,
          key: "factFamily",
          includePromotionMetadata,
        }),
        "in ('supported_field', 'generalized_reference') then 'project_fact'",
        "when",
        buildLegacyAutoCaptureMetadataExpression({
          alias: params.alias,
          key: "lessonFamily",
          includePromotionMetadata,
        }),
        "= 'generalized_workflow_lesson' then 'workflow_improvement'",
        "when",
        buildLegacyAutoCaptureMetadataExpression({
          alias: params.alias,
          key: "lessonFamily",
          includePromotionMetadata,
        }),
        "= 'generalized_project_rule' then 'project_rule'",
        "when",
        buildLegacyAutoCaptureMetadataExpression({
          alias: params.alias,
          key: "lessonFamily",
          includePromotionMetadata,
        }),
        "= 'generalized_unmet_need' then 'unmet_need'",
        "else '' end",
      ].join(" "),
    ],
    fallback: "''",
  });

  const autoCaptureFieldKeyExpression = buildCanonicalFirstMetadataExpression({
    alias: params.alias,
    canonicalPath: ["record", "facets", "fieldKey"],
    legacyKey: "fieldKey",
    includePromotionMetadata,
  });

  return {
    readSurface:
      params.surfaceKind === "approved" ? "approved_memory_view" : "reviewable_candidates_view",
    reviewStateExpression:
      params.surfaceKind === "approved" ? "'approved'::text" : `${params.alias}.review_state::text`,
    compatibilityFamilyIdExpression,
    autoCaptureTemplateExpression: buildCanonicalFirstMetadataExpression({
      alias: params.alias,
      canonicalPath: ["record", "compatibility", "template"],
      legacyKey: "template",
      includePromotionMetadata,
    }),
    autoCaptureFieldKeyExpression,
    autoCaptureFactFamilyExpression: buildCoalescedMetadataExpression({
      expressions: [
        buildCanonicalFirstMetadataExpression({
          alias: params.alias,
          canonicalPath: ["record", "facets", "factFamily"],
          legacyKey: "factFamily",
          includePromotionMetadata,
        }),
        [
          "case when",
          `${autoCaptureFieldKeyExpression} <> '' then 'supported_field'`,
          "else '' end",
        ].join(" "),
      ],
      fallback: "''",
    }),
    autoCaptureLessonKeyExpression: buildCanonicalFirstMetadataExpression({
      alias: params.alias,
      canonicalPath: ["record", "facets", "lessonKey"],
      legacyKey: "lessonKey",
      includePromotionMetadata,
    }),
    autoCaptureLessonFamilyExpression: buildCanonicalFirstMetadataExpression({
      alias: params.alias,
      canonicalPath: ["record", "facets", "lessonFamily"],
      legacyKey: "lessonFamily",
      includePromotionMetadata,
    }),
    autoCaptureGuidancePatternExpression: buildCanonicalFirstMetadataExpression({
      alias: params.alias,
      canonicalPath: ["record", "facets", "guidancePattern"],
      legacyKey: "guidancePattern",
      includePromotionMetadata,
    }),
    autoCaptureNormalizedSubjectExpression,
    autoCaptureNormalizedProjectFactLabelExpression: [
      "case",
      `when position(' :: ' in ${autoCaptureNormalizedSubjectExpression}) > 0`,
      `then split_part(${autoCaptureNormalizedSubjectExpression}, ' :: ', 2)`,
      `else ${autoCaptureNormalizedSubjectExpression}`,
      "end",
    ].join(" "),
    autoCaptureNormalizedProjectScopeExpression: buildCoalescedMetadataExpression({
      expressions: [
        `lower(${buildCanonicalCandidateMetadataExpression({
          alias: params.alias,
          path: ["record", "facets", "projectScope"],
          includePromotionMetadata,
        })})`,
        `lower(${buildLegacyAutoCaptureMetadataExpression({
          alias: params.alias,
          key: "normalizedProjectScope",
          includePromotionMetadata,
        })})`,
      ],
      fallback: "''",
    }),
    autoCaptureNormalizedRecommendedActionExpression: buildCoalescedMetadataExpression({
      expressions: [
        `lower(${buildCanonicalCandidateMetadataExpression({
          alias: params.alias,
          path: ["record", "facets", "recommendedAction"],
          includePromotionMetadata,
        })})`,
        `lower(${buildLegacyAutoCaptureMetadataExpression({
          alias: params.alias,
          key: "normalizedRecommendedAction",
          includePromotionMetadata,
        })})`,
      ],
      fallback: "''",
    }),
    autoCaptureNormalizedAvoidActionExpression: buildCoalescedMetadataExpression({
      expressions: [
        `lower(${buildCanonicalCandidateMetadataExpression({
          alias: params.alias,
          path: ["record", "facets", "avoidAction"],
          includePromotionMetadata,
        })})`,
        `lower(${buildLegacyAutoCaptureMetadataExpression({
          alias: params.alias,
          key: "normalizedAvoidAction",
          includePromotionMetadata,
        })})`,
      ],
      fallback: "''",
    }),
    autoCaptureNormalizedNeededCapabilityExpression: buildCoalescedMetadataExpression({
      expressions: [
        `lower(${buildCanonicalCandidateMetadataExpression({
          alias: params.alias,
          path: ["record", "facets", "neededCapability"],
          includePromotionMetadata,
        })})`,
        `lower(${buildLegacyAutoCaptureMetadataExpression({
          alias: params.alias,
          key: "normalizedNeededCapability",
          includePromotionMetadata,
        })})`,
      ],
      fallback: "''",
    }),
    autoCaptureNormalizedValueExpression: buildCoalescedMetadataExpression({
      expressions: [
        `lower(${buildCanonicalCandidateMetadataExpression({
          alias: params.alias,
          path: ["record", "statement"],
          includePromotionMetadata,
        })})`,
        `lower(${buildLegacyAutoCaptureMetadataExpression({
          alias: params.alias,
          key: "normalizedValue",
          includePromotionMetadata,
        })})`,
      ],
      fallback: "''",
    }),
  };
}
