// Projects X-search provider evidence into the stable model-facing payload.
import { normalizeWebSearchOutput } from "openclaw/plugin-sdk/provider-web-search";
import type { XSearchToolProvider } from "./tool-auth-shared.js";

export type XaiXSearchOptions = {
  query: string;
  allowedXHandles?: string[];
  excludedXHandles?: string[];
  fromDate?: string;
  toDate?: string;
  enableImageUnderstanding?: boolean;
  enableVideoUnderstanding?: boolean;
};

export type XaiXSearchFilters = {
  allowedXHandles?: string[];
  excludedXHandles?: string[];
  fromDate?: string;
  toDate?: string;
  enableImageUnderstanding?: boolean;
  enableVideoUnderstanding?: boolean;
};

export type XaiXSearchCall = {
  type: "x_search_call" | "web_search_call";
  id?: string;
  callId?: string;
  status?: string;
  name?: string;
  arguments?: string;
  argumentsTruncated?: boolean;
  query?: string;
  queries?: string[];
  filters?: XaiXSearchFilters;
};

export type XaiMediaUnderstandingCall = {
  id?: string;
  callId?: string;
  status?: string;
  name?: string;
  arguments?: string;
  argumentsTruncated?: boolean;
  type: "x_search_call" | "view_image" | "view_image_call" | "view_x_video" | "view_x_video_call";
};

export type XaiProviderError = {
  source: "response" | "x_search_call" | "media_understanding";
  callId?: string;
  callName?: string;
  code?: string;
  type?: string;
  message?: string;
  param?: string;
};

export type XaiInlineCitation = {
  type: string;
  url: string;
  title?: string;
  startIndex?: number;
  endIndex?: number;
  outputIndex?: number;
  contentIndex?: number;
};

export type XaiXSearchUsage = {
  inputTokens?: number;
  cachedInputTokens?: number;
  freshInputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
  serverSideToolCalls?: number;
  webSearchRequests?: number;
  costUsd?: number;
  costInUsdTicks?: number;
};

export type XaiXSearchResult = {
  content: string;
  citations: string[];
  citationCount: number;
  citationsTruncated: boolean;
  inlineCitations?: XaiInlineCitation[];
  inlineCitationCount: number;
  inlineCitationsTruncated: boolean;
  responseId?: string;
  responseModel?: string;
  responseStatus?: string;
  responseTermination?: string;
  incompleteReason?: string;
  appliedServiceTier?: string;
  usage?: XaiXSearchUsage;
  xSearchCalls: XaiXSearchCall[];
  xSearchCallCount: number;
  xSearchCallsTruncated: boolean;
  mediaUnderstandingCalls: XaiMediaUnderstandingCall[];
  mediaUnderstandingCallCount: number;
  mediaUnderstandingCallsTruncated: boolean;
  providerErrors: XaiProviderError[];
  providerErrorsTruncated: boolean;
};

export function buildOpenRouterXSearchFilter(options: XaiXSearchOptions): Record<string, unknown> {
  return {
    ...(options.allowedXHandles?.length ? { allowed_x_handles: options.allowedXHandles } : {}),
    ...(options.excludedXHandles?.length ? { excluded_x_handles: options.excludedXHandles } : {}),
    ...(options.fromDate ? { from_date: options.fromDate } : {}),
    ...(options.toDate ? { to_date: options.toDate } : {}),
    ...(options.enableImageUnderstanding ? { enable_image_understanding: true } : {}),
    ...(options.enableVideoUnderstanding ? { enable_video_understanding: true } : {}),
  };
}

function projectRequestedXSearchFilters(options: XaiXSearchOptions): XaiXSearchFilters {
  return {
    ...(options.allowedXHandles?.length ? { allowedXHandles: options.allowedXHandles } : {}),
    ...(options.excludedXHandles?.length ? { excludedXHandles: options.excludedXHandles } : {}),
    ...(options.fromDate ? { fromDate: options.fromDate } : {}),
    ...(options.toDate ? { toDate: options.toDate } : {}),
    ...(options.enableImageUnderstanding ? { enableImageUnderstanding: true } : {}),
    ...(options.enableVideoUnderstanding ? { enableVideoUnderstanding: true } : {}),
  };
}

export function buildXaiXSearchPayload(params: {
  provider?: XSearchToolProvider;
  query: string;
  model: string;
  tookMs: number;
  content: string;
  result: XaiXSearchResult;
  options?: XaiXSearchOptions;
  serviceTier?: "default" | "priority";
}): Record<string, unknown> {
  const provider = params.provider ?? "xai";
  const normalized = normalizeWebSearchOutput({
    result: {
      content: params.content,
      citations: params.result.citations,
      tookMs: params.tookMs,
    },
    provider,
    query: params.query,
  });
  if (normalized.kind !== "answer") {
    throw new Error("x_search response could not be normalized as an answer.");
  }
  const appliedServiceTier =
    provider === "xai" &&
    (params.result.appliedServiceTier === "default" ||
      params.result.appliedServiceTier === "priority")
      ? params.result.appliedServiceTier
      : undefined;
  return {
    ...normalized,
    semanticProvider: "xai",
    ...(provider === "openrouter"
      ? { providerRouting: { order: ["xai/zdr"], allowFallbacks: false } }
      : {}),
    model: params.model,
    latencyMs: params.tookMs,
    citationCount: normalized.citations?.length ?? 0,
    ...(params.result.citationsTruncated ? { citationsTruncated: true } : {}),
    ...(provider === "xai" && (params.serviceTier || appliedServiceTier)
      ? {
          serviceTier: {
            ...(params.serviceTier ? { requested: params.serviceTier } : {}),
            ...(appliedServiceTier ? { applied: appliedServiceTier } : {}),
          },
        }
      : {}),
    ...(params.result.usage ? { usage: params.result.usage } : {}),
    xFilters: {
      requested: projectRequestedXSearchFilters(params.options ?? { query: params.query }),
    },
    xSearchCallCount: params.result.xSearchCallCount,
    ...(params.result.xSearchCallsTruncated ? { xSearchCallsTruncated: true } : {}),
    mediaUnderstandingCallCount: params.result.mediaUnderstandingCallCount,
    ...(params.result.mediaUnderstandingCallsTruncated
      ? { mediaUnderstandingCallsTruncated: true }
      : {}),
    providerErrorCount: params.result.providerErrors.length,
    ...(params.result.providerErrorsTruncated ? { providerErrorsTruncated: true } : {}),
  };
}
