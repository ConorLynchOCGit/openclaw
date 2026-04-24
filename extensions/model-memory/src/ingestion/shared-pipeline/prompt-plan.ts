import { sha256JsonValue } from "../../hashing.ts";
import type {
  MemoryModelCallTelemetry,
  MemoryPromptCacheHealthReport,
  MemoryPromptPlan,
} from "./types.ts";

function average(values: number[]): number | undefined {
  if (values.length === 0) {
    return undefined;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stableHash(value: unknown): string {
  return sha256JsonValue(value);
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function buildMemoryPromptCacheHealthReport(
  calls: MemoryModelCallTelemetry[],
): MemoryPromptCacheHealthReport {
  const cacheableCalls = calls.filter((call) => call.promptCacheKey || call.prefixHash);
  const cacheHits = calls.filter((call) => (call.cachedTokens ?? 0) > 0);
  const totalPromptTokens = calls.reduce((sum, call) => sum + (call.promptTokens ?? 0), 0);
  const totalCachedTokens = calls.reduce((sum, call) => sum + (call.cachedTokens ?? 0), 0);
  const cachedLatencies = calls
    .filter((call) => (call.cachedTokens ?? 0) > 0 && call.latencyMs !== undefined)
    .map((call) => call.latencyMs as number);
  const uncachedLatencies = calls
    .filter((call) => (call.cachedTokens ?? 0) === 0 && call.latencyMs !== undefined)
    .map((call) => call.latencyMs as number);
  return {
    totalCalls: calls.length,
    cacheableCalls: cacheableCalls.length,
    cacheHits: cacheHits.length,
    cacheHitRate: cacheableCalls.length > 0 ? cacheHits.length / cacheableCalls.length : 0,
    totalPromptTokens,
    totalCachedTokens,
    cachedTokenPercentage: totalPromptTokens > 0 ? totalCachedTokens / totalPromptTokens : 0,
    averageCachedTokensPerCall: calls.length > 0 ? totalCachedTokens / calls.length : 0,
    averageLatencyMsCached: average(cachedLatencies),
    averageLatencyMsUncached: average(uncachedLatencies),
  };
}

export function buildMemoryPromptPlan(input: {
  path: MemoryPromptPlan["path"];
  contractName: string;
  staticPrefix: string;
  dynamicSourceTail: string;
  expectedOutputTokens: number;
  maxContextTokens: number;
  maxOutputTokens: number;
  cacheEligible?: boolean;
}): MemoryPromptPlan {
  return {
    path: input.path,
    contractName: input.contractName,
    staticPrefixHash: stableHash(input.staticPrefix),
    dynamicTailHash: stableHash(input.dynamicSourceTail),
    estimatedInputTokens:
      estimateTokens(input.staticPrefix) + estimateTokens(input.dynamicSourceTail),
    expectedOutputTokens: input.expectedOutputTokens,
    maxContextTokens: input.maxContextTokens,
    maxOutputTokens: input.maxOutputTokens,
    cacheEligible: input.cacheEligible ?? true,
  };
}
