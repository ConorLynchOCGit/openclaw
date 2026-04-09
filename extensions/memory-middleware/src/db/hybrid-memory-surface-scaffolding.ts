export type HybridMemoryObjectSurfaceKind = "approved" | "reviewable_candidate";

export type HybridMemoryObjectSurfaceScaffolding = {
  readSurface: "approved_memory_view" | "reviewable_candidates_view";
  reviewStateExpression: string;
  compatibilityFamilyIdExpression: string;
  autoCaptureTemplateExpression: string;
  autoCaptureFieldKeyExpression: string;
  autoCaptureFactFamilyExpression: string;
  autoCaptureCaptureClassExpression: string;
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

  const autoCaptureFieldKeyExpression = buildCanonicalFirstMetadataExpression({
    alias: params.alias,
    canonicalPath: ["record", "facets", "fieldKey"],
    legacyKey: "fieldKey",
    includePromotionMetadata,
  });

  const autoCaptureCaptureClassExpression = buildCanonicalFirstMetadataExpression({
    alias: params.alias,
    canonicalPath: ["record", "facets", "captureClass"],
    legacyKey: "captureClass",
    includePromotionMetadata,
  });

  const compatibilityFamilyIdExpression = buildCoalescedMetadataExpression({
    expressions: [
      buildLegacyAutoCaptureMetadataExpression({
        alias: params.alias,
        key: "family",
        includePromotionMetadata,
      }),
      [
        "case",
        "when",
        autoCaptureCaptureClassExpression,
        "in ('workflow_tool_gotcha', 'workflow_environment_constraint', 'workflow_api_workaround', 'workflow_generalized_guidance') then 'workflow_improvement'",
        "when",
        autoCaptureCaptureClassExpression,
        "= 'project_rule_guidance' then 'project_rule'",
        "when",
        autoCaptureCaptureClassExpression,
        "= 'unmet_need_recommendation' then 'unmet_need'",
        "else '' end",
      ].join(" "),
    ],
    fallback: "''",
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
    autoCaptureCaptureClassExpression,
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
