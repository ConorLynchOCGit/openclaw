import { derivePromptTokens, type NormalizedUsage } from "../../agents/usage.js";
import type { ProviderUsageSnapshot } from "./types.js";

function recordFromUnknown(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function shouldPreferActualUsageCompaction(params: {
  provider: string;
  modelId: string;
  model?: { compat?: unknown; baseUrl?: unknown; provider?: unknown };
}): boolean {
  const provider = params.provider.trim().toLowerCase();
  const modelId = params.modelId.trim().toLowerCase();
  const modelProvider =
    typeof params.model?.provider === "string" ? params.model.provider.trim().toLowerCase() : "";
  const baseUrl =
    typeof params.model?.baseUrl === "string" ? params.model.baseUrl.trim().toLowerCase() : "";
  const compat = recordFromUnknown(params.model?.compat);
  return (
    compat?.supportsUsageInStreaming === true ||
    provider === "openrouter" ||
    modelProvider === "openrouter" ||
    baseUrl.includes("openrouter.ai") ||
    (provider.includes("kimi") && modelId.includes("kimi"))
  );
}

export function usageSnapshotFromNormalizedUsage(
  usage?: NormalizedUsage | null,
): ProviderUsageSnapshot | undefined {
  const promptTokens = derivePromptTokens(usage ?? undefined);
  if (
    promptTokens === undefined &&
    usage?.total === undefined &&
    usage?.cacheRead === undefined &&
    usage?.cacheWrite === undefined
  ) {
    return undefined;
  }
  return {
    source: "provider",
    ...(promptTokens !== undefined ? { promptTokens } : {}),
    ...(usage?.total !== undefined ? { totalTokens: usage.total } : {}),
    ...(usage?.cacheRead !== undefined ? { cacheRead: usage.cacheRead } : {}),
    ...(usage?.cacheWrite !== undefined ? { cacheWrite: usage.cacheWrite } : {}),
  };
}
