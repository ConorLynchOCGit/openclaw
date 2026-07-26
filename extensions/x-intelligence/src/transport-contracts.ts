import type { SecretInput } from "openclaw/plugin-sdk/secret-input";

export const X_API_BASE_URL = "https://api.x.com";

export const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 25;
const MAX_QUERY_LENGTH = 1_024;
const MAX_TOKEN_LENGTH = 1_024;
const MAX_ID_LENGTH = 256;
export const MAX_OWNED_METRICS_WINDOW_MS = 30 * 24 * 60 * 60 * 1_000;
const X_RECENT_SEARCH_WINDOW_MS = 7 * 24 * 60 * 60 * 1_000;

type JsonPrimitive = boolean | number | string | null;
export type XJson = JsonPrimitive | XJson[] | { [key: string]: XJson };

export type XReceipt = {
  status: number;
  serializedBytes?: number;
  rateLimit: {
    limit?: string;
    remaining?: string;
    reset?: string;
  };
  retryAfter?: string;
  resourceId?: string;
  requestId?: string;
};

export type XRetryEvent = Readonly<{
  attempt: number;
  kind: "rate_limited" | "server";
  delayMs: number;
  status?: number;
  retryAfter?: string;
  reset?: string;
}>;

export type XRetryTelemetry = Readonly<{
  attempts: number;
  retries: readonly XRetryEvent[];
  totalDelayMs: number;
}>;

export type XReadResult<T extends XJson = XJson> = {
  data: T;
  receipt: XReceipt;
  receipts?: readonly XReceipt[];
  retry?: XRetryTelemetry;
  nextToken?: string;
  trustedOwnership?: XTrustedOwnership;
  trustedOwnedAnalytics?: XTrustedOwnedAnalytics;
};

export type XTrustedOwnership = Readonly<{
  provider: "x";
  accountId: string;
  verifiedPostIds: readonly string[];
  verification: "authenticated_user_and_post_authors";
}>;

export type XTrustedOwnedAnalytics = Readonly<{
  provider: "x";
  providerMetricClass: "analytics";
  startTime: string;
  endTime: string;
  granularity: "hourly" | "daily" | "weekly" | "total";
  requestedMetrics: readonly string[];
}>;

export type XTransportErrorKind =
  | "bad_request"
  | "recent_window_outside_horizon"
  | "authentication"
  | "rate_limited"
  | "server"
  | "malformed_response"
  | "aborted"
  | "timeout"
  | "network"
  | "unexpected_response"
  | "owned_attribution_unsupported"
  | "owned_post_author_mismatch"
  | "owned_metrics_entitlement"
  | "owned_metrics_configuration"
  | "owned_metrics_post_ids_required"
  | "owned_metrics_window_required"
  | "owned_metrics_fields_required"
  | "owned_metrics_unsupported_field";

export type XTransportErrorCategory =
  | "request"
  | "configuration"
  | "ownership"
  | "unsupported"
  | "entitlement"
  | "provider";

type XTransportErrorOptions = Readonly<{
  category?: XTransportErrorCategory;
  receipt?: XReceipt;
  receipts?: readonly XReceipt[];
  retry?: XRetryTelemetry;
  requestCount?: number;
}>;

export class XTransportError extends Error {
  readonly kind: XTransportErrorKind;
  readonly category: XTransportErrorCategory;
  readonly receipt?: XReceipt;
  readonly receipts: readonly XReceipt[];
  readonly retry?: XRetryTelemetry;
  readonly requestCount: number;

  constructor(kind: XTransportErrorKind, options: XTransportErrorOptions = {}) {
    super(messageFor(kind));
    this.name = "XTransportError";
    this.kind = kind;
    this.category = options.category ?? categoryFor(kind);
    this.receipt = options.receipt;
    this.receipts = options.receipts ?? (options.receipt ? [options.receipt] : []);
    this.retry = options.retry;
    this.requestCount = options.requestCount ?? this.receipts.length;
  }

  toJSON() {
    return {
      kind: this.kind,
      category: this.category,
      message: this.message,
      receipt: this.receipt,
      retry: this.retry,
      requestCount: this.requestCount,
    };
  }
}

export type XRequestOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
};

export type XPageOptions = XRequestOptions & {
  maxResults?: number;
  paginationToken?: string;
};

export type XPostSearchInput = XPageOptions & {
  query: string;
  startTime?: string;
  endTime?: string;
  sinceId?: string;
  untilId?: string;
  sortOrder?: "recency" | "relevancy";
  tweetFields?: string[];
  expansions?: string[];
  userFields?: string[];
  mediaFields?: string[];
  pollFields?: string[];
  placeFields?: string[];
};

export type XCountInput = Omit<XPostSearchInput, "maxResults" | "sortOrder"> & {
  granularity?: "minute" | "hour" | "day";
};

export type XPostByIdInput = XRequestOptions & {
  id: string;
  tweetFields?: string[];
  expansions?: string[];
  userFields?: string[];
  mediaFields?: string[];
  pollFields?: string[];
  placeFields?: string[];
};

/**
 * The XDK exposes PostsClient.getByIds as the supported multi-post read seam.
 * Keep the caller's exact, already-bounded batch intact so provider receipts
 * count the requested primary posts before any analytical deduplication.
 */
export type XPostBatchInput = XRequestOptions & {
  ids: string[];
  tweetFields?: string[];
  expansions?: string[];
  userFields?: string[];
  mediaFields?: string[];
  pollFields?: string[];
  placeFields?: string[];
};

export type XPostCollectionInput = XPageOptions & {
  id: string;
  tweetFields?: string[];
  expansions?: string[];
  userFields?: string[];
  mediaFields?: string[];
  pollFields?: string[];
  placeFields?: string[];
};

export type XUserSearchInput = XPageOptions & {
  query: string;
  userFields?: string[];
  expansions?: string[];
  tweetFields?: string[];
};

export type XUserIdentityInput = XRequestOptions & {
  id?: string;
  username?: string;
  userFields?: string[];
  expansions?: string[];
  tweetFields?: string[];
};

export type XUserBatchInput = XRequestOptions & {
  ids?: string[];
  usernames?: string[];
  userFields?: string[];
  expansions?: string[];
  tweetFields?: string[];
};

export type XRelationshipInput = XPageOptions & {
  id: string;
  userFields?: string[];
  expansions?: string[];
  tweetFields?: string[];
};

export type XTimelineInput = XPageOptions & {
  id: string;
  startTime?: string;
  endTime?: string;
  sinceId?: string;
  untilId?: string;
  tweetFields?: string[];
  expansions?: string[];
  userFields?: string[];
  mediaFields?: string[];
  pollFields?: string[];
  placeFields?: string[];
};

export type XTrendInput = XPageOptions & {
  woeid?: number;
  trendFields?: string[];
};

export type XPublicMetricsInput = XRequestOptions & {
  ids: string[];
};

export type XOwnedMetricsInput = XRequestOptions & {
  tweetIds: string[];
  startTime: string;
  endTime: string;
  granularity: string;
  requestedMetrics: string[];
  engagementFields?: string[];
};

export type XUsageInput = XRequestOptions & {
  days?: number;
};

export type XReadTransportOptions = {
  apiKey?: SecretInput;
  ownedMetricsApiKey?: SecretInput;
  resolveOwnedMetricsApiKey?: () => Promise<string>;
  env?: Readonly<Record<string, string | undefined>>;
  baseUrl?: string;
  timeoutMs?: number;
  retrySleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
};

export function assertXRecentWindow(
  input: Pick<XPostSearchInput, "startTime" | "endTime">,
  now = Date.now(),
): void {
  if (input.startTime === undefined) {
    return;
  }
  const startTime = Date.parse(input.startTime);
  const endTime = input.endTime === undefined ? undefined : Date.parse(input.endTime);
  if (
    !Number.isFinite(startTime) ||
    (endTime !== undefined && (!Number.isFinite(endTime) || startTime >= endTime))
  ) {
    throw new XTransportError("bad_request");
  }
  if (startTime <= now - X_RECENT_SEARCH_WINDOW_MS) {
    throw new XTransportError("recent_window_outside_horizon");
  }
}

export function normalizeBaseUrl(baseUrl: string | undefined): string {
  let value = (baseUrl ?? X_API_BASE_URL).trim();
  while (value.endsWith("/")) {
    value = value.slice(0, -1);
  }
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error("invalid protocol");
    }
    return value;
  } catch {
    throw new XTransportError("bad_request");
  }
}

export function normalizeOptionalTimeout(value: number | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Number.isFinite(value) || value < 1) {
    throw new XTransportError("bad_request");
  }
  return Math.floor(value);
}

export function boundedQuery(value: string): string {
  const query = value.trim();
  if (!query || query.length > MAX_QUERY_LENGTH) {
    throw new XTransportError("bad_request");
  }
  return query;
}

export function boundedId(value: string): string {
  return boundedString(value, "id", MAX_ID_LENGTH);
}

export function boundedString(value: string, _label: string, maxLength = MAX_TOKEN_LENGTH): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new XTransportError("bad_request");
  }
  return normalized;
}

export function boundedFields(values: string[] | undefined): string[] {
  if (!values) {
    return [];
  }
  if (values.length > 25) {
    throw new XTransportError("bad_request");
  }
  return values.map((value) => boundedString(value, "field", 128));
}

function pageOptions(input: XPageOptions, minimum = 1) {
  const maxResults = input.maxResults ?? DEFAULT_PAGE_SIZE;
  if (!Number.isSafeInteger(maxResults) || maxResults < minimum || maxResults > MAX_PAGE_SIZE) {
    throw new XTransportError("bad_request");
  }
  return {
    maxResults,
    ...(input.paginationToken
      ? { paginationToken: boundedString(input.paginationToken, "pagination token") }
      : {}),
  };
}

function optionalBounded(value: string | undefined, label: string, maxLength = MAX_TOKEN_LENGTH) {
  return value === undefined ? undefined : boundedString(value, label, maxLength);
}

function fieldOptions(input: {
  tweetFields?: string[];
  expansions?: string[];
  userFields?: string[];
  mediaFields?: string[];
  pollFields?: string[];
  placeFields?: string[];
}) {
  return {
    tweetFields: boundedFields(input.tweetFields),
    expansions: boundedFields(input.expansions),
    userFields: boundedFields(input.userFields),
    mediaFields: boundedFields(input.mediaFields),
    pollFields: boundedFields(input.pollFields),
    placeFields: boundedFields(input.placeFields),
  };
}

export function postSearchOptions(input: XPostSearchInput) {
  return {
    ...pageOptions(input, 10),
    ...fieldOptions(input),
    startTime: optionalBounded(input.startTime, "start time"),
    endTime: optionalBounded(input.endTime, "end time"),
    sinceId: optionalBounded(input.sinceId, "since id", MAX_ID_LENGTH),
    untilId: optionalBounded(input.untilId, "until id", MAX_ID_LENGTH),
    sortOrder: input.sortOrder,
  };
}

export function countOptions(input: XCountInput) {
  return {
    startTime: optionalBounded(input.startTime, "start time"),
    endTime: optionalBounded(input.endTime, "end time"),
    sinceId: optionalBounded(input.sinceId, "since id", MAX_ID_LENGTH),
    untilId: optionalBounded(input.untilId, "until id", MAX_ID_LENGTH),
    paginationToken: optionalBounded(input.paginationToken, "pagination token"),
    granularity: input.granularity,
  };
}

export function postFieldOptions(
  input: Pick<
    XPostByIdInput,
    "tweetFields" | "expansions" | "userFields" | "mediaFields" | "pollFields" | "placeFields"
  >,
) {
  return fieldOptions(input);
}

export function collectionOptions(input: XPostCollectionInput) {
  return { ...pageOptions(input, 10), ...fieldOptions(input) };
}

export function userSearchOptions(input: XUserSearchInput) {
  return {
    ...pageOptions(input),
    userFields: boundedFields(input.userFields),
    expansions: boundedFields(input.expansions),
    tweetFields: boundedFields(input.tweetFields),
  };
}

export function appendFields(params: URLSearchParams, key: string, values: string[]): void {
  if (values.length > 0) {
    params.set(key, values.join(","));
  }
}

export function userFieldOptions(input: XUserIdentityInput | XUserBatchInput) {
  return {
    userFields: boundedFields(input.userFields),
    expansions: boundedFields(input.expansions),
    tweetFields: boundedFields(input.tweetFields),
  };
}

export function relationshipOptions(input: XRelationshipInput) {
  return {
    ...pageOptions(input),
    userFields: boundedFields(input.userFields),
    expansions: boundedFields(input.expansions),
    tweetFields: boundedFields(input.tweetFields),
  };
}

export function timelineOptions(input: XTimelineInput) {
  return {
    ...pageOptions(input, 5),
    ...fieldOptions(input),
    startTime: optionalBounded(input.startTime, "start time"),
    endTime: optionalBounded(input.endTime, "end time"),
    sinceId: optionalBounded(input.sinceId, "since id", MAX_ID_LENGTH),
    untilId: optionalBounded(input.untilId, "until id", MAX_ID_LENGTH),
  };
}

export function trendOptions(input: XTrendInput) {
  const maxTrends = input.maxResults ?? DEFAULT_PAGE_SIZE;
  if (!Number.isSafeInteger(maxTrends) || maxTrends < 1 || maxTrends > MAX_PAGE_SIZE) {
    throw new XTransportError("bad_request");
  }
  return { maxTrends, trendFields: boundedFields(input.trendFields) };
}

export function normalizeAnalyticsGranularity(
  value: string,
): "hourly" | "daily" | "weekly" | "total" {
  const aliases: Record<string, "hourly" | "daily" | "weekly"> = {
    hour: "hourly",
    day: "daily",
    week: "weekly",
  };
  const normalized = aliases[value] ?? value;
  if (!["hourly", "daily", "weekly", "total"].includes(normalized)) {
    throw new XTransportError("bad_request");
  }
  return normalized as "hourly" | "daily" | "weekly" | "total";
}

function messageFor(kind: XTransportErrorKind): string {
  switch (kind) {
    case "bad_request":
      return "X rejected the read request.";
    case "recent_window_outside_horizon":
      return "X recent search cannot read a window outside the rolling seven-day horizon.";
    case "authentication":
      return "X rejected the configured credential.";
    case "rate_limited":
      return "X rate limit reached.";
    case "server":
      return "X is temporarily unavailable.";
    case "malformed_response":
      return "X returned an invalid JSON response.";
    case "aborted":
      return "X request was aborted.";
    case "timeout":
      return "X request timed out.";
    case "unexpected_response":
      return "X returned an unexpected response.";
    case "network":
      return "X request failed before a response was received.";
    case "owned_attribution_unsupported":
      return "X could not provide the identity fields required to verify owned analytics.";
    case "owned_post_author_mismatch":
      return "One or more requested X posts do not belong to the authenticated user.";
    case "owned_metrics_entitlement":
      return "The authenticated X user is not entitled to this owned analytics operation.";
    case "owned_metrics_configuration":
      return "X owned analytics user authentication is not configured.";
    case "owned_metrics_post_ids_required":
      return "X owned analytics requires at least one post ID.";
    case "owned_metrics_window_required":
      return "X owned analytics requires exact start and end timestamps.";
    case "owned_metrics_fields_required":
      return "X owned analytics requires at least one supported metric field.";
    case "owned_metrics_unsupported_field":
      return "X owned analytics requested an unsupported metric field.";
    default: {
      const exhaustiveKind: never = kind;
      return exhaustiveKind;
    }
  }
}

function categoryFor(kind: XTransportErrorKind): XTransportErrorCategory {
  switch (kind) {
    case "bad_request":
    case "recent_window_outside_horizon":
    case "owned_metrics_post_ids_required":
    case "owned_metrics_window_required":
    case "owned_metrics_fields_required":
    case "owned_metrics_unsupported_field":
      return "request";
    case "owned_metrics_configuration":
      return "configuration";
    case "owned_post_author_mismatch":
      return "ownership";
    case "owned_attribution_unsupported":
      return "unsupported";
    case "owned_metrics_entitlement":
      return "entitlement";
    default:
      return "provider";
  }
}
