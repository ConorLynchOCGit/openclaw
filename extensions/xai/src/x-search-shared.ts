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

export const XAI_X_SEARCH_RESEARCH_PROFILES = [
  "full_hybrid_per_subject_v2",
  "reduced_probe_v2",
] as const;

export const XAI_X_SEARCH_RESEARCH_STAGES = [
  "question_discovery",
  "question_verified_analysis",
  "topic_discovery",
  "influence_discovery",
  "influence_challenge",
  "format_analysis",
] as const;

export type XaiXSearchResearchProfile = (typeof XAI_X_SEARCH_RESEARCH_PROFILES)[number];
export type XaiXSearchResearchStage = (typeof XAI_X_SEARCH_RESEARCH_STAGES)[number];

export type XaiXSearchResearchPolicy = {
  researchProfile: XaiXSearchResearchProfile;
  researchStage: XaiXSearchResearchStage;
  maxSelectedEvidenceBytes: number;
  maxSerializedRequestBytes: number;
  maxOutputTokens: number;
  maxElapsedMs: number;
  maxRetries: 0;
  maxProviderDispatches: 1;
  maxDeliveredCitations: number;
  searchEnabled: boolean;
  maxTotalResults?: number;
};

export type XaiXSearchCacheControl =
  | { mode: "ordinary"; scope: "ordinary" }
  | { mode: "bypass"; scope: "bypass" };

export function resolveXaiXSearchCacheControl(value: unknown): XaiXSearchCacheControl {
  if (value === undefined) {
    return { mode: "ordinary", scope: "ordinary" };
  }
  if (!isRecord(value) || typeof value.mode !== "string") {
    throw new Error("research_cache_control must select a closed cache mode");
  }
  if (value.mode === "bypass" && Object.keys(value).length === 1) {
    return { mode: "bypass", scope: "bypass" };
  }
  throw new Error("research_cache_control must use explicit bypass");
}

const FULL_HYBRID_V2_POLICIES: Record<XaiXSearchResearchStage, XaiXSearchResearchPolicy> = {
  question_discovery: {
    researchProfile: "full_hybrid_per_subject_v2",
    researchStage: "question_discovery",
    maxSelectedEvidenceBytes: 12 * 1024,
    maxSerializedRequestBytes: 12 * 1024,
    maxOutputTokens: 2_500,
    maxElapsedMs: 50_000,
    maxRetries: 0,
    maxProviderDispatches: 1,
    maxDeliveredCitations: 20,
    searchEnabled: true,
    maxTotalResults: 20,
  },
  question_verified_analysis: {
    researchProfile: "full_hybrid_per_subject_v2",
    researchStage: "question_verified_analysis",
    maxSelectedEvidenceBytes: 24 * 1024,
    maxSerializedRequestBytes: 24 * 1024,
    maxOutputTokens: 2_500,
    maxElapsedMs: 50_000,
    maxRetries: 0,
    maxProviderDispatches: 1,
    maxDeliveredCitations: 8,
    searchEnabled: false,
  },
  topic_discovery: {
    researchProfile: "full_hybrid_per_subject_v2",
    researchStage: "topic_discovery",
    maxSelectedEvidenceBytes: 12 * 1024,
    maxSerializedRequestBytes: 12 * 1024,
    maxOutputTokens: 2_500,
    maxElapsedMs: 50_000,
    maxRetries: 0,
    maxProviderDispatches: 1,
    maxDeliveredCitations: 15,
    searchEnabled: true,
    maxTotalResults: 15,
  },
  influence_discovery: {
    researchProfile: "full_hybrid_per_subject_v2",
    researchStage: "influence_discovery",
    maxSelectedEvidenceBytes: 12 * 1024,
    maxSerializedRequestBytes: 12 * 1024,
    maxOutputTokens: 3_000,
    maxElapsedMs: 55_000,
    maxRetries: 0,
    maxProviderDispatches: 1,
    maxDeliveredCitations: 30,
    searchEnabled: true,
    maxTotalResults: 30,
  },
  influence_challenge: {
    researchProfile: "full_hybrid_per_subject_v2",
    researchStage: "influence_challenge",
    maxSelectedEvidenceBytes: 24 * 1024,
    maxSerializedRequestBytes: 24 * 1024,
    maxOutputTokens: 2_500,
    maxElapsedMs: 50_000,
    maxRetries: 0,
    maxProviderDispatches: 1,
    maxDeliveredCitations: 10,
    searchEnabled: false,
  },
  format_analysis: {
    researchProfile: "full_hybrid_per_subject_v2",
    researchStage: "format_analysis",
    maxSelectedEvidenceBytes: 24 * 1024,
    maxSerializedRequestBytes: 24 * 1024,
    maxOutputTokens: 2_500,
    maxElapsedMs: 50_000,
    maxRetries: 0,
    maxProviderDispatches: 1,
    maxDeliveredCitations: 10,
    searchEnabled: false,
  },
};

const REDUCED_PROBE_V2_POLICIES: Partial<
  Record<XaiXSearchResearchStage, XaiXSearchResearchPolicy>
> = {
  question_discovery: {
    researchProfile: "reduced_probe_v2",
    researchStage: "question_discovery",
    maxSelectedEvidenceBytes: 8 * 1024,
    maxSerializedRequestBytes: 8 * 1024,
    maxOutputTokens: 1_500,
    maxElapsedMs: 50_000,
    maxRetries: 0,
    maxProviderDispatches: 1,
    maxDeliveredCitations: 8,
    searchEnabled: true,
    maxTotalResults: 8,
  },
  topic_discovery: {
    researchProfile: "reduced_probe_v2",
    researchStage: "topic_discovery",
    maxSelectedEvidenceBytes: 8 * 1024,
    maxSerializedRequestBytes: 8 * 1024,
    maxOutputTokens: 1_500,
    maxElapsedMs: 50_000,
    maxRetries: 0,
    maxProviderDispatches: 1,
    maxDeliveredCitations: 8,
    searchEnabled: true,
    maxTotalResults: 8,
  },
  influence_discovery: {
    researchProfile: "reduced_probe_v2",
    researchStage: "influence_discovery",
    maxSelectedEvidenceBytes: 8 * 1024,
    maxSerializedRequestBytes: 8 * 1024,
    maxOutputTokens: 2_000,
    maxElapsedMs: 55_000,
    maxRetries: 0,
    maxProviderDispatches: 1,
    maxDeliveredCitations: 12,
    searchEnabled: true,
    maxTotalResults: 12,
  },
};

export function resolveXaiXSearchResearchPolicy(params: {
  researchProfile?: string;
  researchStage?: string;
}): XaiXSearchResearchPolicy | undefined {
  if (!params.researchProfile && !params.researchStage) {
    return undefined;
  }
  if (!params.researchProfile || !params.researchStage) {
    throw new Error(
      "research_profile and research_stage must be provided together for v2 x_search",
    );
  }
  if (
    !XAI_X_SEARCH_RESEARCH_PROFILES.includes(params.researchProfile as XaiXSearchResearchProfile)
  ) {
    throw new Error("research_profile must select a closed v2 profile");
  }
  if (!XAI_X_SEARCH_RESEARCH_STAGES.includes(params.researchStage as XaiXSearchResearchStage)) {
    throw new Error("research_stage must select a closed v2 stage");
  }
  const policy =
    params.researchProfile === "full_hybrid_per_subject_v2"
      ? FULL_HYBRID_V2_POLICIES[params.researchStage as XaiXSearchResearchStage]
      : REDUCED_PROBE_V2_POLICIES[params.researchStage as XaiXSearchResearchStage];
  if (!policy) {
    throw new Error("research_stage is not authorized by the selected research_profile");
  }
  return policy;
}

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
  localRequestReceipt?: {
    selectedEvidenceBytes: number;
    serializedRequestBytes: number;
    elapsedMs: number;
  };
};

export type XaiXSearchTerminalReceipt = {
  sourceLayer: "configuration" | "provider" | "transport";
  status: "failed" | "timed_out";
  code: string;
  retryable: false;
  elapsedMs: number;
  dispatches: 0 | 1;
  maxRetries: 0;
  providerRequestId: string | "unknown";
  providerResponseStatus: string | "unknown";
  observedResults: number | "unknown";
  outputTokens: number | "unknown";
  providerCostUsd: number | "unknown";
};

export class XaiXSearchTerminalError extends Error {
  readonly receipt: XaiXSearchTerminalReceipt;

  constructor(message: string, receipt: XaiXSearchTerminalReceipt) {
    super(redactProviderErrorMessage(message));
    this.name = "XaiXSearchTerminalError";
    this.receipt = receipt;
  }
}

function terminalError(params: {
  message: string;
  sourceLayer: XaiXSearchTerminalReceipt["sourceLayer"];
  status?: XaiXSearchTerminalReceipt["status"];
  code: string;
  elapsedMs: number;
  dispatches: 0 | 1;
  result?: XaiXSearchResult;
  response?: XaiWebSearchResponse;
}): XaiXSearchTerminalError {
  const responseUsage = params.response ? projectXaiXSearchUsage(params.response.usage) : undefined;
  const usage = params.result?.usage ?? responseUsage;
  const providerRequestId =
    params.result?.responseId ??
    readBoundedString(params.response?.request_id) ??
    readBoundedString(params.response?.id);
  const providerResponseStatus =
    params.result?.responseStatus ?? readBoundedString(params.response?.status);
  return new XaiXSearchTerminalError(params.message, {
    sourceLayer: params.sourceLayer,
    status: params.status ?? "failed",
    code: params.code,
    retryable: false,
    elapsedMs: params.elapsedMs,
    dispatches: params.dispatches,
    maxRetries: 0,
    providerRequestId: providerRequestId ?? "unknown",
    providerResponseStatus: providerResponseStatus ?? "unknown",
    observedResults: "unknown",
    outputTokens: usage?.outputTokens ?? "unknown",
    providerCostUsd: usage?.costUsd ?? "unknown",
  });
}

function isTransportTimeout(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return (
    [
      "AbortError",
      "TimeoutError",
      "ConnectTimeoutError",
      "HeadersTimeoutError",
      "BodyTimeoutError",
    ].includes(error.name) || error.message === "This operation was aborted"
  );
}

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

function redactCredentialValueAfterMarker(value: string, marker: string): string {
  let output = value;
  let searchFrom = 0;
  while (searchFrom < output.length) {
    const start = output.toLowerCase().indexOf(marker, searchFrom);
    if (start < 0) {
      break;
    }
    let valueStart = start + marker.length;
    while (valueStart < output.length && output[valueStart]?.trim().length === 0) {
      valueStart += 1;
    }
    let valueEnd = valueStart;
    while (valueEnd < output.length) {
      const character = output[valueEnd];
      if (!character || character.trim().length === 0 || character === "," || character === ";") {
        break;
      }
      valueEnd += 1;
    }
    if (valueEnd === valueStart) {
      searchFrom = valueStart;
      continue;
    }
    output = `${output.slice(0, valueStart)}[REDACTED]${output.slice(valueEnd)}`;
    searchFrom = valueStart + "[REDACTED]".length;
  }
  return output;
}

function redactProviderErrorMessage(value: string): string {
  let redacted = redactToolPayloadText(value);
  for (const marker of [
    "bearer ",
    "authorization=",
    "authorization:",
    "api_key=",
    "api-key=",
    "apikey=",
    "access_token=",
    "access-token=",
  ]) {
    redacted = redactCredentialValueAfterMarker(redacted, marker);
  }
  return redacted.slice(0, MAX_X_SEARCH_ERROR_MESSAGE_CHARS);
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
  deliveredCitationLimit = MAX_X_SEARCH_CITATIONS,
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
  const responseId = readBoundedString(data.request_id) ?? readBoundedString(data.id);
  const responseModel = readBoundedString(data.model);
  const incompleteReason = readBoundedString(data.incomplete_details?.reason);
  const explicitTermination =
    readBoundedString(data.termination) ?? readBoundedString(data.finish_reason);
  const responseTermination = explicitTermination ?? incompleteReason ?? responseStatus;
  const appliedServiceTier = readBoundedString(data.service_tier);
  const projectedUsage = projectXaiXSearchUsage(data.usage);
  return {
    content,
    citations: citationUrls.slice(0, deliveredCitationLimit),
    citationCount: citationUrls.length,
    citationsTruncated: citationUrls.length > deliveredCitationLimit,
    ...(inlineCitationsEnabled && inline.values.length
      ? { inlineCitations: inline.values.slice(0, deliveredCitationLimit) }
      : {}),
    inlineCitationCount: inline.count,
    inlineCitationsTruncated: inline.truncated || inline.values.length > deliveredCitationLimit,
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
  researchPolicy?: XaiXSearchResearchPolicy;
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
    ...(params.researchPolicy
      ? {
          requestPolicy: params.researchPolicy,
          providerReceipt: {
            dispatches: 1,
            maxRetries: 0,
            elapsedMs: params.result.localRequestReceipt?.elapsedMs ?? params.tookMs,
            selectedEvidenceBytes:
              params.result.localRequestReceipt?.selectedEvidenceBytes ?? "unknown",
            serializedRequestBytes:
              params.result.localRequestReceipt?.serializedRequestBytes ?? "unknown",
            outputTokens: params.result.usage?.outputTokens ?? "unknown",
            providerCostUsd: params.result.usage?.costUsd ?? "unknown",
            providerRequestId: params.result.responseId ?? "unknown",
            providerResponseStatus: params.result.responseStatus ?? "unknown",
            observedSearchActions: {
              responseToolCalls: params.result.xSearchCallCount,
              providerWebSearchRequests: params.result.usage?.webSearchRequests ?? "unknown",
            },
            observedResults: "unknown",
            delivered: {
              citations: params.result.citations.length,
              citationCount: params.result.citationCount,
              citationsTruncated: params.result.citationsTruncated,
              inlineCitations: params.result.inlineCitations?.length ?? 0,
              inlineCitationCount: params.result.inlineCitationCount,
              inlineCitationsTruncated: params.result.inlineCitationsTruncated,
            },
          },
        }
      : {}),
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
  researchPolicy?: XaiXSearchResearchPolicy;
}): Promise<XaiXSearchResult> {
  const provider = params.provider ?? "xai";
  const providerLabel = provider === "openrouter" ? "OpenRouter" : "xAI";
  const startedAt = Date.now();
  if (params.researchPolicy && provider !== "openrouter") {
    throw terminalError({
      message: "v2 x_search requires the OpenRouter xAI route with no fallback",
      sourceLayer: "configuration",
      code: "v2_route_required",
      elapsedMs: Date.now() - startedAt,
      dispatches: 0,
    });
  }
  if (params.researchPolicy && !params.model.startsWith("x-ai/grok-")) {
    throw terminalError({
      message: "v2 x_search requires an OpenRouter xAI/Grok model with no fallback",
      sourceLayer: "configuration",
      code: "v2_model_required",
      elapsedMs: Date.now() - startedAt,
      dispatches: 0,
    });
  }
  const body =
    provider === "openrouter"
      ? {
          model: params.model,
          input: [{ role: "user", content: params.options.query }],
          ...(params.researchPolicy?.searchEnabled === false
            ? {}
            : {
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
              }),
          ...(params.researchPolicy
            ? { max_output_tokens: params.researchPolicy.maxOutputTokens }
            : {}),
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
  const selectedEvidenceBytes = new TextEncoder().encode(params.options.query).byteLength;
  const serializedRequestBytes = new TextEncoder().encode(JSON.stringify(body)).byteLength;
  if (params.researchPolicy) {
    if (selectedEvidenceBytes > params.researchPolicy.maxSelectedEvidenceBytes) {
      throw terminalError({
        message: "v2 x_search selected evidence exceeds the closed stage byte limit",
        sourceLayer: "configuration",
        code: "selected_evidence_limit_exceeded",
        elapsedMs: Date.now() - startedAt,
        dispatches: 0,
      });
    }
    if (serializedRequestBytes > params.researchPolicy.maxSerializedRequestBytes) {
      throw terminalError({
        message: "v2 x_search serialized request exceeds the closed stage byte limit",
        sourceLayer: "configuration",
        code: "serialized_request_limit_exceeded",
        elapsedMs: Date.now() - startedAt,
        dispatches: 0,
      });
    }
  }
  try {
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
        let result: XaiXSearchResult;
        try {
          result = projectXaiXSearchResponse(
            data,
            params.inlineCitations,
            providerLabel,
            params.researchPolicy?.maxDeliveredCitations,
          );
        } catch (error) {
          throw terminalError({
            message: error instanceof Error ? error.message : String(error),
            sourceLayer: "provider",
            code: "provider_response_failed",
            elapsedMs: Date.now() - startedAt,
            dispatches: 1,
            response: data,
          });
        }
        if (
          params.researchPolicy?.searchEnabled === false &&
          (result.xSearchCallCount > 0 ||
            (result.usage?.webSearchRequests ?? 0) > 0 ||
            result.citationCount > 0 ||
            result.inlineCitationCount > 0)
        ) {
          throw terminalError({
            message:
              "v2 x_search configuration failure: search activity or citations returned for a search-disabled stage",
            sourceLayer: "configuration",
            code: "search_disabled_activity_or_citations",
            elapsedMs: Date.now() - startedAt,
            dispatches: 1,
            result,
          });
        }
        if (
          params.researchPolicy &&
          result.usage?.outputTokens !== undefined &&
          result.usage.outputTokens > params.researchPolicy.maxOutputTokens
        ) {
          throw terminalError({
            message: "v2 x_search provider exceeded the closed stage output token limit",
            sourceLayer: "configuration",
            code: "output_token_limit_exceeded",
            elapsedMs: Date.now() - startedAt,
            dispatches: 1,
            result,
          });
        }
        const elapsedMs = Date.now() - startedAt;
        if (params.researchPolicy && elapsedMs > params.researchPolicy.maxElapsedMs) {
          throw terminalError({
            message: "v2 x_search provider exceeded the closed stage elapsed time limit",
            sourceLayer: "transport",
            status: "timed_out",
            code: "stage_elapsed_limit_exceeded",
            elapsedMs,
            dispatches: 1,
            result,
          });
        }
        return {
          ...result,
          ...(params.researchPolicy
            ? {
                localRequestReceipt: {
                  selectedEvidenceBytes,
                  serializedRequestBytes,
                  elapsedMs,
                },
              }
            : {}),
        };
      },
    );
  } catch (error) {
    if (error instanceof XaiXSearchTerminalError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    const isTimeout = isTransportTimeout(error);
    throw terminalError({
      message,
      sourceLayer: isTimeout ? "transport" : "provider",
      status: isTimeout ? "timed_out" : "failed",
      code: isTimeout ? "provider_timeout" : "provider_request_failed",
      elapsedMs: Date.now() - startedAt,
      dispatches: 1,
    });
  }
}
