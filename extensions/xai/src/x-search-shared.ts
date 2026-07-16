import { redactToolPayloadText } from "openclaw/plugin-sdk/logging-core";
// Xai plugin module implements x search shared behavior.
import { readProviderJsonObjectResponse } from "openclaw/plugin-sdk/provider-http";
import { postTrustedWebToolsJson, wrapWebContent } from "openclaw/plugin-sdk/provider-web-search";
import {
  buildXaiResponsesToolBody,
  extractXaiWebSearchContent,
  requireXaiResponseTextCitationsAndInline,
  resolveXaiResponsesEndpoint,
} from "./responses-tool-shared.js";
import type { XSearchToolProvider } from "./tool-auth-shared.js";
import {
  coerceXaiToolConfig,
  resolveNormalizedXaiToolModel,
  resolvePositiveIntegerToolConfig,
} from "./tool-config-shared.js";
import type { XaiWebSearchResponse } from "./web-search-shared.js";

export const XAI_DEFAULT_X_SEARCH_MODEL = "grok-4-1-fast-non-reasoning";
export const OPENROUTER_DEFAULT_X_SEARCH_MODEL = "x-ai/grok-4.5";
const OPENROUTER_RESPONSES_BASE_URL = "https://openrouter.ai/api/v1";

type XaiXSearchConfig = {
  apiKey?: unknown;
  baseUrl?: unknown;
  provider?: unknown;
  model?: unknown;
  inlineCitations?: unknown;
  maxTurns?: unknown;
  maxTotalResults?: unknown;
  serviceTier?: unknown;
};

export type XaiXSearchOptions = {
  query: string;
  allowedXHandles?: string[];
  excludedXHandles?: string[];
  fromDate?: string;
  toDate?: string;
  enableImageUnderstanding?: boolean;
  enableVideoUnderstanding?: boolean;
};

const MAX_X_SEARCH_EVIDENCE_ITEMS = 20;
const MAX_X_SEARCH_CITATIONS = 100;
const MAX_X_SEARCH_PROVIDER_ERRORS = 10;
const MAX_X_SEARCH_ERROR_MESSAGE_CHARS = 500;
const MAX_X_SEARCH_CITATION_URL_LENGTH = 4096;
const MAX_X_SEARCH_CALL_ARGUMENT_CHARS = 4096;
const MAX_X_SEARCH_HTTP_ERROR_BYTES = 4096;

type XaiXSearchFilters = {
  allowedXHandles?: string[];
  excludedXHandles?: string[];
  fromDate?: string;
  toDate?: string;
  enableImageUnderstanding?: boolean;
  enableVideoUnderstanding?: boolean;
};

type XaiXSearchCall = {
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

type XaiMediaUnderstandingCall = {
  id?: string;
  callId?: string;
  status?: string;
  name?: string;
  arguments?: string;
  argumentsTruncated?: boolean;
  type: "x_search_call" | "view_image" | "view_image_call" | "view_x_video" | "view_x_video_call";
};

type XaiResponseOutputItem = NonNullable<NonNullable<XaiWebSearchResponse["output"]>[number]>;

type XaiXSearchCallOutput = XaiResponseOutputItem & {
  type: XaiXSearchCall["type"];
};

type XaiMediaUnderstandingOutput = XaiResponseOutputItem & {
  type: XaiMediaUnderstandingCall["type"];
};

type XaiProviderError = {
  source: "response" | "x_search_call" | "media_understanding";
  callId?: string;
  callName?: string;
  code?: string;
  type?: string;
  message?: string;
  param?: string;
};

type XaiInlineCitation = {
  type: string;
  url: string;
  title?: string;
  startIndex?: number;
  endIndex?: number;
  outputIndex?: number;
  contentIndex?: number;
};

type XaiXSearchUsage = {
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

type XaiXSearchResult = {
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

function resolveXaiXSearchConfig(config?: Record<string, unknown>): XaiXSearchConfig {
  return coerceXaiToolConfig(config) as XaiXSearchConfig;
}

export function resolveXaiXSearchModel(
  config?: Record<string, unknown>,
  provider: XSearchToolProvider = "xai",
): string {
  return resolveNormalizedXaiToolModel({
    config,
    defaultModel:
      provider === "openrouter" ? OPENROUTER_DEFAULT_X_SEARCH_MODEL : XAI_DEFAULT_X_SEARCH_MODEL,
  });
}

export function resolveXaiXSearchEndpoint(
  config?: Record<string, unknown>,
  provider: XSearchToolProvider = "xai",
): string {
  const configuredBaseUrl = resolveXaiXSearchConfig(config).baseUrl;
  return resolveXaiResponsesEndpoint(
    configuredBaseUrl ?? (provider === "openrouter" ? OPENROUTER_RESPONSES_BASE_URL : undefined),
  );
}

export function resolveXaiXSearchInlineCitations(config?: Record<string, unknown>): boolean {
  return resolveXaiXSearchConfig(config).inlineCitations === true;
}

export function resolveXaiXSearchMaxTurns(config?: Record<string, unknown>): number | undefined {
  return resolvePositiveIntegerToolConfig(config, "maxTurns");
}

export function resolveOpenRouterXSearchMaxTotalResults(config?: Record<string, unknown>): number {
  return Math.min(resolvePositiveIntegerToolConfig(config, "maxTotalResults") ?? 20, 50);
}

export function resolveXaiXSearchServiceTier(
  config?: Record<string, unknown>,
): "default" | "priority" | undefined {
  const value = resolveXaiXSearchConfig(config).serviceTier;
  return value === "default" || value === "priority" ? value : undefined;
}

function buildXSearchTool(options: XaiXSearchOptions): Record<string, unknown> {
  return {
    type: "x_search",
    ...(options.allowedXHandles?.length ? { allowed_x_handles: options.allowedXHandles } : {}),
    ...(options.excludedXHandles?.length ? { excluded_x_handles: options.excludedXHandles } : {}),
    ...(options.fromDate ? { from_date: options.fromDate } : {}),
    ...(options.toDate ? { to_date: options.toDate } : {}),
    ...(options.enableImageUnderstanding ? { enable_image_understanding: true } : {}),
    ...(options.enableVideoUnderstanding ? { enable_video_understanding: true } : {}),
  };
}

function buildOpenRouterXSearchFilter(options: XaiXSearchOptions): Record<string, unknown> {
  return {
    ...(options.allowedXHandles?.length ? { allowed_x_handles: options.allowedXHandles } : {}),
    ...(options.excludedXHandles?.length ? { excluded_x_handles: options.excludedXHandles } : {}),
    ...(options.fromDate ? { from_date: options.fromDate } : {}),
    ...(options.toDate ? { to_date: options.toDate } : {}),
    ...(options.enableImageUnderstanding ? { enable_image_understanding: true } : {}),
    ...(options.enableVideoUnderstanding ? { enable_video_understanding: true } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readBoundedString(value: unknown, maxLength = 256): string | undefined {
  return typeof value === "string" && value.length <= maxLength ? value : undefined;
}

function readNonNegativeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function projectBoundedToolText(
  value: unknown,
  maxLength: number,
): { value: string; truncated: boolean } | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const redacted = redactToolPayloadText(value);
  return {
    value: redacted.slice(0, maxLength),
    truncated: redacted.length > maxLength,
  };
}

function parseBoundedJsonRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "string" || value.length > MAX_X_SEARCH_CALL_ARGUMENT_CHARS) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function readBoundedStringArray(
  value: unknown,
  maxItems = MAX_X_SEARCH_EVIDENCE_ITEMS,
): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const entries = value
    .filter((entry): entry is string => typeof entry === "string" && entry.length <= 256)
    .slice(0, maxItems);
  return entries.length > 0 ? entries : undefined;
}

function readXSearchFilters(value: unknown): XaiXSearchFilters | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const allowedXHandles = readBoundedStringArray(value.allowed_x_handles);
  const excludedXHandles = readBoundedStringArray(value.excluded_x_handles);
  const fromDate = readBoundedString(value.from_date, 32);
  const toDate = readBoundedString(value.to_date, 32);
  const filters: XaiXSearchFilters = {
    ...(allowedXHandles ? { allowedXHandles } : {}),
    ...(excludedXHandles ? { excludedXHandles } : {}),
    ...(fromDate ? { fromDate } : {}),
    ...(toDate ? { toDate } : {}),
    ...(typeof value.enable_image_understanding === "boolean"
      ? { enableImageUnderstanding: value.enable_image_understanding }
      : {}),
    ...(typeof value.enable_video_understanding === "boolean"
      ? { enableVideoUnderstanding: value.enable_video_understanding }
      : {}),
  };
  return Object.keys(filters).length > 0 ? filters : undefined;
}

function isXSearchCallOutput(item: XaiResponseOutputItem | null): item is XaiXSearchCallOutput {
  return item?.type === "x_search_call" || item?.type === "web_search_call";
}

function isMediaUnderstandingOutput(
  item: XaiResponseOutputItem | null,
): item is XaiMediaUnderstandingOutput {
  return (
    item?.type === "view_image" ||
    item?.type === "view_image_call" ||
    item?.type === "view_x_video" ||
    item?.type === "view_x_video_call"
  );
}

function isMediaUnderstandingXSearchCall(
  item: XaiXSearchCallOutput,
): item is XaiXSearchCallOutput & { type: "x_search_call" } {
  return (
    item.type === "x_search_call" && (item.name === "view_image" || item.name === "view_x_video")
  );
}

function projectXSearchCall(item: XaiXSearchCallOutput): XaiXSearchCall {
  const call: XaiXSearchCall = { type: item.type };
  const id = readBoundedString(item.id);
  const callId = readBoundedString(item.call_id);
  const status = readBoundedString(item.status);
  const name = readBoundedString(item.name);
  const projectedArguments = projectBoundedToolText(
    item.arguments,
    MAX_X_SEARCH_CALL_ARGUMENT_CHARS,
  );
  const parsedArguments = parseBoundedJsonRecord(item.arguments);
  const query =
    readBoundedString(item.query, 1024) ?? readBoundedString(parsedArguments?.query, 1024);
  const queries =
    readBoundedStringArray(item.queries) ?? readBoundedStringArray(parsedArguments?.queries);
  const filters =
    readXSearchFilters(item) ??
    readXSearchFilters(item.action) ??
    readXSearchFilters(parsedArguments);
  if (id) {
    call.id = id;
  }
  if (callId) {
    call.callId = callId;
  }
  if (status) {
    call.status = status;
  }
  if (name) {
    call.name = name;
  }
  if (projectedArguments) {
    call.arguments = projectedArguments.value;
    if (projectedArguments.truncated) {
      call.argumentsTruncated = true;
    }
  }
  if (query) {
    call.query = query;
  }
  if (queries) {
    call.queries = queries;
  }
  if (filters) {
    call.filters = filters;
  }
  return call;
}

function projectMediaUnderstandingCall(
  item: XaiMediaUnderstandingOutput | (XaiXSearchCallOutput & { type: "x_search_call" }),
): XaiMediaUnderstandingCall {
  const call: XaiMediaUnderstandingCall = { type: item.type };
  const id = readBoundedString(item.id);
  const callId = readBoundedString(item.call_id);
  const status = readBoundedString(item.status);
  const name = readBoundedString(item.name);
  const projectedArguments = projectBoundedToolText(
    item.arguments,
    MAX_X_SEARCH_CALL_ARGUMENT_CHARS,
  );
  if (id) {
    call.id = id;
  }
  if (callId) {
    call.callId = callId;
  }
  if (status) {
    call.status = status;
  }
  if (name) {
    call.name = name;
  }
  if (projectedArguments) {
    call.arguments = projectedArguments.value;
    if (projectedArguments.truncated) {
      call.argumentsTruncated = true;
    }
  }
  return call;
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

function redactProviderErrorMessage(value: string): string {
  return redactToolPayloadText(value)
    .replace(/\bbearer\s+[^\s,;]+/gi, "Bearer [REDACTED]")
    .replace(
      /\b(authorization|api[_-]?key|access[_-]?token)\s*([=:])\s*[^\s,;]+/gi,
      "$1$2[REDACTED]",
    )
    .slice(0, MAX_X_SEARCH_ERROR_MESSAGE_CHARS);
}

function projectProviderError(
  value: unknown,
  source: XaiProviderError["source"],
  call?: XaiResponseOutputItem,
): XaiProviderError | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const callId = readBoundedString(call?.call_id) ?? readBoundedString(call?.id);
  const callName = readBoundedString(call?.name);
  const code = readBoundedString(value.code);
  const type = readBoundedString(value.type);
  const param = readBoundedString(value.param);
  const message =
    typeof value.message === "string" ? redactProviderErrorMessage(value.message) : undefined;
  return code || type || message || param
    ? {
        source,
        ...(callId ? { callId } : {}),
        ...(callName ? { callName } : {}),
        ...(code ? { code } : {}),
        ...(type ? { type } : {}),
        ...(message ? { message } : {}),
        ...(param ? { param } : {}),
      }
    : undefined;
}

function projectInlineCitation(params: {
  annotation: unknown;
  outputIndex?: number;
  contentIndex?: number;
}): XaiInlineCitation | undefined {
  if (!isRecord(params.annotation)) {
    return undefined;
  }
  const url = params.annotation.url;
  if (
    typeof url !== "string" ||
    url.length === 0 ||
    url.length > MAX_X_SEARCH_CITATION_URL_LENGTH
  ) {
    return undefined;
  }
  const type = readBoundedString(params.annotation.type) ?? "url_citation";
  const title = readBoundedString(params.annotation.title, 1024);
  const startIndex = readNonNegativeNumber(params.annotation.start_index);
  const endIndex = readNonNegativeNumber(params.annotation.end_index);
  return {
    type,
    url,
    ...(title ? { title } : {}),
    ...(startIndex !== undefined ? { startIndex } : {}),
    ...(endIndex !== undefined ? { endIndex } : {}),
    ...(params.outputIndex !== undefined ? { outputIndex: params.outputIndex } : {}),
    ...(params.contentIndex !== undefined ? { contentIndex: params.contentIndex } : {}),
  };
}

function inlineCitationKey(citation: XaiInlineCitation): string {
  return JSON.stringify([
    citation.type,
    citation.url,
    citation.title ?? null,
    citation.startIndex ?? null,
    citation.endIndex ?? null,
  ]);
}

function projectInlineCitations(data: XaiWebSearchResponse) {
  const citations: XaiInlineCitation[] = [];
  for (const [outputIndex, output] of (data.output ?? []).entries()) {
    if (!output || output.type !== "message" || !Array.isArray(output.content)) {
      continue;
    }
    for (const [contentIndex, block] of output.content.entries()) {
      if (!block || block.type !== "output_text" || !Array.isArray(block.annotations)) {
        continue;
      }
      for (const annotation of block.annotations) {
        const projected = projectInlineCitation({ annotation, outputIndex, contentIndex });
        if (projected) {
          citations.push(projected);
        }
      }
    }
  }
  for (const annotation of data.inline_citations ?? []) {
    const projected = projectInlineCitation({ annotation });
    if (projected) {
      citations.push(projected);
    }
  }
  const seen = new Set<string>();
  const valid = citations.filter((citation) => {
    const key = inlineCitationKey(citation);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
  return {
    values: valid.slice(0, MAX_X_SEARCH_CITATIONS),
    count: valid.length,
    truncated: valid.length > MAX_X_SEARCH_CITATIONS,
  };
}

function projectXaiXSearchUsage(usage: XaiWebSearchResponse["usage"]): XaiXSearchUsage | undefined {
  if (!usage) {
    return undefined;
  }
  const inputTokens = readNonNegativeNumber(usage.input_tokens);
  const cachedInputTokens =
    readNonNegativeNumber(usage.cached_input_tokens) ??
    readNonNegativeNumber(usage.input_tokens_details?.cached_tokens);
  const outputTokens = readNonNegativeNumber(usage.output_tokens);
  const reasoningTokens = readNonNegativeNumber(usage.output_tokens_details?.reasoning_tokens);
  const totalTokens = readNonNegativeNumber(usage.total_tokens);
  const serverSideToolCalls = readNonNegativeNumber(usage.num_server_side_tools_used);
  const webSearchRequests = readNonNegativeNumber(usage.server_tool_use?.web_search_requests);
  const costUsd = readNonNegativeNumber(usage.cost);
  const costInUsdTicks = readNonNegativeNumber(usage.cost_in_usd_ticks);
  const projected: XaiXSearchUsage = {
    ...(inputTokens !== undefined ? { inputTokens } : {}),
    ...(cachedInputTokens !== undefined ? { cachedInputTokens } : {}),
    ...(inputTokens !== undefined &&
    cachedInputTokens !== undefined &&
    cachedInputTokens <= inputTokens
      ? { freshInputTokens: inputTokens - cachedInputTokens }
      : {}),
    ...(outputTokens !== undefined ? { outputTokens } : {}),
    ...(reasoningTokens !== undefined ? { reasoningTokens } : {}),
    ...(totalTokens !== undefined ? { totalTokens } : {}),
    ...(serverSideToolCalls !== undefined ? { serverSideToolCalls } : {}),
    ...(webSearchRequests !== undefined ? { webSearchRequests } : {}),
    ...(costUsd !== undefined ? { costUsd } : {}),
    ...(costInUsdTicks !== undefined ? { costInUsdTicks } : {}),
  };
  return Object.keys(projected).length > 0 ? projected : undefined;
}

function buildXaiResponseFailureMessage(
  data: XaiWebSearchResponse,
  errors: XaiProviderError[],
  providerLabel = "xAI",
): string {
  const status = readBoundedString(data.status);
  const incompleteReason = readBoundedString(data.incomplete_details?.reason);
  const primaryError = errors[0];
  const details = [
    status ? `status=${status}` : undefined,
    incompleteReason ? `reason=${incompleteReason}` : undefined,
    primaryError?.code ? `code=${primaryError.code}` : undefined,
    primaryError?.type ? `type=${primaryError.type}` : undefined,
    primaryError?.param ? `param=${primaryError.param}` : undefined,
    primaryError?.message,
  ].filter((entry): entry is string => Boolean(entry));
  return redactProviderErrorMessage(
    details.length > 0
      ? `${providerLabel} X search failed: ${details.join("; ")}`
      : `${providerLabel} X search failed: malformed JSON response`,
  );
}

function projectXaiXSearchResponse(
  data: XaiWebSearchResponse,
  inlineCitationsEnabled: boolean,
  providerLabel = "xAI",
): XaiXSearchResult {
  const xSearchCallItems = (data.output ?? []).filter(isXSearchCallOutput);
  const xSearchCalls = xSearchCallItems
    .slice(0, MAX_X_SEARCH_EVIDENCE_ITEMS)
    .map(projectXSearchCall);
  const namedMediaCallItems = xSearchCallItems.filter(isMediaUnderstandingXSearchCall);
  const directMediaCallItems = (data.output ?? []).filter(isMediaUnderstandingOutput);
  const mediaCallItems = [...namedMediaCallItems, ...directMediaCallItems];
  const mediaUnderstandingCalls = mediaCallItems
    .slice(0, MAX_X_SEARCH_EVIDENCE_ITEMS)
    .map(projectMediaUnderstandingCall);
  const providerErrors = [
    projectProviderError(data.error, "response"),
    ...xSearchCallItems.map((item) =>
      projectProviderError(
        item.error,
        isMediaUnderstandingXSearchCall(item) ? "media_understanding" : "x_search_call",
        item,
      ),
    ),
    ...directMediaCallItems.map((item) =>
      projectProviderError(item.error, "media_understanding", item),
    ),
  ].filter((error): error is XaiProviderError => Boolean(error));
  const responseStatus = readBoundedString(data.status);
  const responseText = extractXaiWebSearchContent(data).text;
  if (
    !responseText &&
    (providerErrors.length > 0 || responseStatus === "failed" || responseStatus === "incomplete")
  ) {
    throw new Error(buildXaiResponseFailureMessage(data, providerErrors, providerLabel));
  }
  const { content, citations } = requireXaiResponseTextCitationsAndInline(
    data,
    `${providerLabel} X search failed`,
    false,
  );
  const citationUrls = [...new Set(citations)].filter(
    (url): url is string =>
      typeof url === "string" && url.length > 0 && url.length <= MAX_X_SEARCH_CITATION_URL_LENGTH,
  );
  const inline = projectInlineCitations(data);
  const responseId = readBoundedString(data.id);
  const responseModel = readBoundedString(data.model);
  const incompleteReason = readBoundedString(data.incomplete_details?.reason);
  const explicitTermination =
    readBoundedString(data.termination) ?? readBoundedString(data.finish_reason);
  const responseTermination = explicitTermination ?? incompleteReason ?? responseStatus;
  const appliedServiceTier = readBoundedString(data.service_tier);
  const projectedUsage = projectXaiXSearchUsage(data.usage);
  return {
    content,
    citations: citationUrls.slice(0, MAX_X_SEARCH_CITATIONS),
    citationCount: citationUrls.length,
    citationsTruncated: citationUrls.length > MAX_X_SEARCH_CITATIONS,
    ...(inlineCitationsEnabled && inline.values.length ? { inlineCitations: inline.values } : {}),
    inlineCitationCount: inline.count,
    inlineCitationsTruncated: inline.truncated,
    ...(responseId ? { responseId } : {}),
    ...(responseModel ? { responseModel } : {}),
    ...(responseStatus ? { responseStatus } : {}),
    ...(responseTermination ? { responseTermination } : {}),
    ...(incompleteReason ? { incompleteReason } : {}),
    ...(appliedServiceTier ? { appliedServiceTier } : {}),
    ...(projectedUsage ? { usage: projectedUsage } : {}),
    xSearchCalls,
    xSearchCallCount: xSearchCallItems.length,
    xSearchCallsTruncated: xSearchCallItems.length > MAX_X_SEARCH_EVIDENCE_ITEMS,
    mediaUnderstandingCalls,
    mediaUnderstandingCallCount: mediaCallItems.length,
    mediaUnderstandingCallsTruncated: mediaCallItems.length > MAX_X_SEARCH_EVIDENCE_ITEMS,
    providerErrors: providerErrors.slice(0, MAX_X_SEARCH_PROVIDER_ERRORS),
    providerErrorsTruncated: providerErrors.length > MAX_X_SEARCH_PROVIDER_ERRORS,
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
  const appliedFilters = params.result.xSearchCalls.flatMap((call) =>
    call.filters ? [call.filters] : [],
  );
  return {
    query: params.query,
    provider,
    semanticProvider: "xai",
    ...(provider === "openrouter"
      ? { providerRouting: { order: ["xai/zdr"], allowFallbacks: false } }
      : {}),
    model: params.model,
    tookMs: params.tookMs,
    latencyMs: params.tookMs,
    externalContent: {
      untrusted: true,
      source: "x_search",
      provider,
      wrapped: true,
    },
    content: wrapWebContent(params.content, "web_search"),
    citations: params.result.citations,
    citationCount: params.result.citationCount,
    ...(params.result.citationsTruncated ? { citationsTruncated: true } : {}),
    ...(params.result.inlineCitations ? { inlineCitations: params.result.inlineCitations } : {}),
    inlineCitationCount: params.result.inlineCitationCount,
    ...(params.result.inlineCitationsTruncated ? { inlineCitationsTruncated: true } : {}),
    ...(params.result.responseId ? { responseId: params.result.responseId } : {}),
    ...(params.result.responseModel ? { responseModel: params.result.responseModel } : {}),
    ...(params.result.responseStatus ? { responseStatus: params.result.responseStatus } : {}),
    ...(params.result.responseTermination
      ? { responseTermination: params.result.responseTermination }
      : {}),
    ...(params.result.incompleteReason ? { incompleteReason: params.result.incompleteReason } : {}),
    ...(params.serviceTier || params.result.appliedServiceTier
      ? {
          serviceTier: {
            ...(params.serviceTier ? { requested: params.serviceTier } : {}),
            ...(params.result.appliedServiceTier
              ? { applied: params.result.appliedServiceTier }
              : {}),
          },
        }
      : {}),
    ...(params.result.usage ? { usage: params.result.usage } : {}),
    xFilters: {
      requested: projectRequestedXSearchFilters(params.options ?? { query: params.query }),
      applied: appliedFilters,
    },
    xSearchCalls: params.result.xSearchCalls,
    xSearchCallCount: params.result.xSearchCallCount,
    ...(params.result.xSearchCallsTruncated ? { xSearchCallsTruncated: true } : {}),
    mediaUnderstandingCalls: params.result.mediaUnderstandingCalls,
    mediaUnderstandingCallCount: params.result.mediaUnderstandingCallCount,
    ...(params.result.mediaUnderstandingCallsTruncated
      ? { mediaUnderstandingCallsTruncated: true }
      : {}),
    ...(params.result.providerErrors.length
      ? { providerErrors: params.result.providerErrors }
      : {}),
    ...(params.result.providerErrorsTruncated ? { providerErrorsTruncated: true } : {}),
    ...(params.options?.allowedXHandles?.length
      ? { allowedXHandles: params.options.allowedXHandles }
      : {}),
    ...(params.options?.excludedXHandles?.length
      ? { excludedXHandles: params.options.excludedXHandles }
      : {}),
    ...(params.options?.fromDate ? { fromDate: params.options.fromDate } : {}),
    ...(params.options?.toDate ? { toDate: params.options.toDate } : {}),
    ...(params.options?.enableImageUnderstanding ? { enableImageUnderstanding: true } : {}),
    ...(params.options?.enableVideoUnderstanding ? { enableVideoUnderstanding: true } : {}),
  };
}

export async function requestXaiXSearch(params: {
  provider?: XSearchToolProvider;
  apiKey: string;
  endpoint: string;
  model: string;
  timeoutSeconds: number;
  inlineCitations: boolean;
  maxTurns?: number;
  maxTotalResults?: number;
  serviceTier?: "default" | "priority";
  options: XaiXSearchOptions;
}): Promise<XaiXSearchResult> {
  const provider = params.provider ?? "xai";
  const providerLabel = provider === "openrouter" ? "OpenRouter" : "xAI";
  const body =
    provider === "openrouter"
      ? {
          model: params.model,
          input: [{ role: "user", content: params.options.query }],
          tools: [
            {
              type: "openrouter:web_search",
              parameters: {
                engine: "native",
                max_total_results: params.maxTotalResults ?? 20,
              },
            },
          ],
          x_search_filter: buildOpenRouterXSearchFilter(params.options),
          provider: {
            order: ["xai/zdr"],
            allow_fallbacks: false,
          },
          store: false,
        }
      : buildXaiResponsesToolBody({
          model: params.model,
          inputText: params.options.query,
          tools: [buildXSearchTool(params.options)],
          maxTurns: params.maxTurns,
          serviceTier: params.serviceTier,
        });
  return await postTrustedWebToolsJson(
    {
      url: params.endpoint,
      timeoutSeconds: params.timeoutSeconds,
      apiKey: params.apiKey,
      body,
      errorLabel: providerLabel,
      maxErrorBytes: MAX_X_SEARCH_HTTP_ERROR_BYTES,
    },
    async (response) => {
      const data = (await readProviderJsonObjectResponse(
        response,
        `${providerLabel} X search failed`,
      )) as XaiWebSearchResponse;
      return projectXaiXSearchResponse(data, params.inlineCitations, providerLabel);
    },
  ).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(redactProviderErrorMessage(message), {
      cause: error instanceof Error ? error : undefined,
    });
  });
}
