export type ProviderUsageCostSource =
  | "provider_reported"
  | "estimated_from_catalog"
  | "unavailable";

export type ProviderUsageEstimationConfidence = "exact" | "partial" | "unavailable";

export type ProviderUsageCostNormalization = {
  artifactKind: "provider_usage_cost_normalization";
  modelId: string;
  inputTokenCount: number | null;
  outputTokenCount: number | null;
  totalTokenCount: number | null;
  providerReportedCostUsd: number | null;
  estimatedCostUsd: number | null;
  costSource: ProviderUsageCostSource;
  usageComplete: boolean;
  estimationConfidence: ProviderUsageEstimationConfidence;
  pricingRef: string | null;
};

export type OpenRouterCatalogPricing = {
  promptUsdPerMillionTokens?: number | null;
  completionUsdPerMillionTokens?: number | null;
  requestUsd?: number | null;
  pricingRef?: string | null;
};

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readUsageNumber(
  usage: Record<string, unknown> | null | undefined,
  keys: string[],
): number | null {
  for (const key of keys) {
    const value = finiteNumber(usage?.[key]);
    if (value !== null) {
      return value;
    }
  }
  return null;
}

export function normalizeProviderUsageCost(input: {
  modelId: string;
  usage?: Record<string, unknown> | null;
  inputTokenCount?: number | null;
  outputTokenCount?: number | null;
  totalTokenCount?: number | null;
  estimatedCostUsd?: number | null;
  catalogPricing?: OpenRouterCatalogPricing | null;
}): ProviderUsageCostNormalization {
  const inputTokenCount =
    input.inputTokenCount ??
    readUsageNumber(input.usage, ["prompt_tokens", "input_tokens", "inputTokenCount"]);
  const outputTokenCount =
    input.outputTokenCount ??
    readUsageNumber(input.usage, ["completion_tokens", "output_tokens", "outputTokenCount"]);
  const totalTokenCount =
    input.totalTokenCount ??
    readUsageNumber(input.usage, ["total_tokens", "totalTokenCount"]) ??
    (inputTokenCount !== null && outputTokenCount !== null
      ? inputTokenCount + outputTokenCount
      : null);
  const providerReportedCostUsd =
    finiteNumber(input.estimatedCostUsd) ?? readUsageNumber(input.usage, ["cost", "total_cost"]);
  const promptRate = input.catalogPricing?.promptUsdPerMillionTokens ?? null;
  const completionRate = input.catalogPricing?.completionUsdPerMillionTokens ?? null;
  const requestCost = input.catalogPricing?.requestUsd ?? null;
  const estimateFromCatalog =
    providerReportedCostUsd === null &&
    inputTokenCount !== null &&
    outputTokenCount !== null &&
    (promptRate !== null || completionRate !== null || requestCost !== null)
      ? (inputTokenCount * (promptRate ?? 0) + outputTokenCount * (completionRate ?? 0)) /
          1_000_000 +
        (requestCost ?? 0)
      : null;
  const estimatedCostUsd = providerReportedCostUsd ?? estimateFromCatalog;
  const costSource: ProviderUsageCostSource =
    providerReportedCostUsd !== null
      ? "provider_reported"
      : estimateFromCatalog !== null
        ? "estimated_from_catalog"
        : "unavailable";
  const usageComplete =
    inputTokenCount !== null &&
    outputTokenCount !== null &&
    totalTokenCount !== null &&
    estimatedCostUsd !== null;
  return {
    artifactKind: "provider_usage_cost_normalization",
    modelId: input.modelId,
    inputTokenCount,
    outputTokenCount,
    totalTokenCount,
    providerReportedCostUsd,
    estimatedCostUsd,
    costSource,
    usageComplete,
    estimationConfidence:
      costSource === "provider_reported" && usageComplete
        ? "exact"
        : costSource === "estimated_from_catalog"
          ? "partial"
          : "unavailable",
    pricingRef: input.catalogPricing?.pricingRef ?? null,
  };
}
