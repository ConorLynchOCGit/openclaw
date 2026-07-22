import { readResponseWithLimit } from "@openclaw/media-core/read-response-with-limit";
import {
  Client,
  type PostsClient,
  type TrendsClient,
  type UsageClient,
  type UsersClient,
} from "@xdevplatform/xdk";
import type { SecretInput } from "openclaw/plugin-sdk/secret-input";
import { requireOwnedMetricsCredential, requirePublicCredential } from "./auth.js";
import { requireXOwnedMetricDefinition } from "./owned-metric-definitions.js";

export const X_API_BASE_URL = "https://api.x.com";

const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_TIMEOUT_MS = 120_000;
const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 25;
const MAX_QUERY_LENGTH = 1_024;
const MAX_TOKEN_LENGTH = 1_024;
const MAX_ID_LENGTH = 256;
const MAX_OWNED_METRICS_WINDOW_MS = 30 * 24 * 60 * 60 * 1_000;

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
  resourceId?: string;
  requestId?: string;
};

export type XReadResult<T extends XJson = XJson> = {
  data: T;
  receipt: XReceipt;
  receipts?: readonly XReceipt[];
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
  requestCount?: number;
}>;

export class XTransportError extends Error {
  readonly kind: XTransportErrorKind;
  readonly category: XTransportErrorCategory;
  readonly receipt?: XReceipt;
  readonly receipts: readonly XReceipt[];
  readonly requestCount: number;

  constructor(kind: XTransportErrorKind, options: XTransportErrorOptions = {}) {
    super(messageFor(kind));
    this.name = "XTransportError";
    this.kind = kind;
    this.category = options.category ?? categoryFor(kind);
    this.receipt = options.receipt;
    this.receipts = options.receipts ?? (options.receipt ? [options.receipt] : []);
    this.requestCount = options.requestCount ?? this.receipts.length;
  }

  toJSON() {
    return {
      kind: this.kind,
      category: this.category,
      message: this.message,
      receipt: this.receipt,
      requestCount: this.requestCount,
    };
  }
}

export type XRequestOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
  maxResponseBytes?: number;
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
 * Keep the caller's exact, already-bounded batch intact: billing and admission
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
};

type XdkReadClient = {
  readonly request: Client["request"];
  readonly posts: Pick<
    PostsClient,
    | "getAnalytics"
    | "getById"
    | "getByIds"
    | "getCountsAll"
    | "getCountsRecent"
    | "getQuoted"
    | "searchAll"
    | "searchRecent"
  >;
  readonly trends: Pick<TrendsClient, "getByWoeid" | "getPersonalized">;
  readonly usage: Pick<UsageClient, "get">;
  readonly users: Pick<
    UsersClient,
    | "getById"
    | "getByIds"
    | "getByUsername"
    | "getByUsernames"
    | "getFollowers"
    | "getFollowing"
    | "getPosts"
    | "getTimeline"
    | "getMe"
    | "search"
  >;
};

type XdkRawRequestOptions = {
  raw: true;
  signal?: AbortSignal;
  timeout: number;
};

export class XReadTransport {
  readonly posts: {
    recent: (input: XPostSearchInput) => Promise<XReadResult>;
    archive: (input: XPostSearchInput) => Promise<XReadResult>;
    exact: (input: XPostByIdInput) => Promise<XReadResult>;
    batch: (input: XPostBatchInput) => Promise<XReadResult>;
    thread: (input: XPostCollectionInput) => Promise<XReadResult>;
    quotes: (input: XPostCollectionInput) => Promise<XReadResult>;
    replies: (input: XPostCollectionInput) => Promise<XReadResult>;
  };
  readonly counts: {
    recent: (input: XCountInput) => Promise<XReadResult>;
    all: (input: XCountInput) => Promise<XReadResult>;
  };
  readonly users: {
    search: (input: XUserSearchInput) => Promise<XReadResult>;
    identity: (input: XUserIdentityInput) => Promise<XReadResult>;
    identityBatch: (input: XUserBatchInput) => Promise<XReadResult>;
    followers: (input: XRelationshipInput) => Promise<XReadResult>;
    following: (input: XRelationshipInput) => Promise<XReadResult>;
  };
  readonly timelines: {
    authored: (input: XTimelineInput) => Promise<XReadResult>;
    reverseChronological: (input: XTimelineInput) => Promise<XReadResult>;
  };
  readonly trends: {
    byLocation: (input: XTrendInput & { woeid: number }) => Promise<XReadResult>;
    personalized: (input?: XTrendInput) => Promise<XReadResult>;
  };
  readonly metrics: {
    public: (input: XPublicMetricsInput) => Promise<XReadResult>;
    owned: (input: XOwnedMetricsInput) => Promise<XReadResult>;
    usage: (input?: XUsageInput) => Promise<XReadResult>;
  };

  private readonly publicClient: XdkReadClient;
  private readonly secretValues: string[];
  private readonly ownedMetricsApiKey: SecretInput | undefined;
  private readonly resolveOwnedMetricsApiKey: (() => Promise<string>) | undefined;
  private readonly baseUrl: string;
  private readonly env: Readonly<Record<string, string | undefined>>;
  private readonly timeoutMs: number;

  constructor(options: XReadTransportOptions = {}) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.env = options.env ?? process.env;
    this.timeoutMs = normalizeTimeout(options.timeoutMs);
    this.ownedMetricsApiKey = options.ownedMetricsApiKey;
    this.resolveOwnedMetricsApiKey = options.resolveOwnedMetricsApiKey;
    const publicCredential = requirePublicCredential(options.apiKey, this.env);
    this.secretValues = [publicCredential];
    this.publicClient = new Client({
      baseUrl: this.baseUrl,
      bearerToken: publicCredential,
      timeout: this.timeoutMs,
      retry: false,
    });

    this.posts = {
      recent: (input) => this.search("recent", input),
      archive: (input) => this.search("archive", input),
      exact: (input) => this.readPostById(input),
      batch: (input) => this.readPostsByIds(input),
      thread: (input) =>
        this.search("recent", {
          ...input,
          query: `conversation_id:${boundedId(input.id)}`,
          sortOrder: "recency",
        }),
      quotes: (input) => this.readPostCollection(input),
      replies: (input) =>
        this.search("recent", {
          ...input,
          query: `conversation_id:${boundedId(input.id)} is:reply`,
          sortOrder: "recency",
        }),
    };
    this.counts = {
      recent: (input) => this.count("recent", input),
      all: (input) => this.count("all", input),
    };
    this.users = {
      search: (input) => this.userSearch(input),
      identity: (input) => this.userIdentity(input),
      identityBatch: (input) => this.userIdentityBatch(input),
      followers: (input) => this.relationship("followers", input),
      following: (input) => this.relationship("following", input),
    };
    this.timelines = {
      authored: (input) => this.timeline("authored", input),
      reverseChronological: (input) => this.timeline("reverse_chronological", input),
    };
    this.trends = {
      byLocation: (input) => this.trendByLocation(input),
      personalized: (input = {}) => this.personalizedTrends(input),
    };
    this.metrics = {
      public: (input) => this.publicMetrics(input),
      owned: (input) => this.ownedMetrics(input),
      usage: (input = {}) => this.usage(input),
    };
  }

  private search(kind: "recent" | "archive", input: XPostSearchInput): Promise<XReadResult> {
    const query = boundedQuery(input.query);
    const options = postSearchOptions(input);
    return this.readPublic(input, (requestOptions) =>
      kind === "recent"
        ? this.publicClient.posts.searchRecent(query, { ...options, requestOptions })
        : this.publicClient.posts.searchAll(query, { ...options, requestOptions }),
    );
  }

  private count(kind: "recent" | "all", input: XCountInput): Promise<XReadResult> {
    const query = boundedQuery(input.query);
    const options = countOptions(input);
    return this.readPublic(input, (requestOptions) =>
      kind === "recent"
        ? this.publicClient.posts.getCountsRecent(query, { ...options, requestOptions })
        : this.publicClient.posts.getCountsAll(query, { ...options, requestOptions }),
    );
  }

  private readPostById(input: XPostByIdInput): Promise<XReadResult> {
    const id = boundedId(input.id);
    const options = postFieldOptions(input);
    return this.readPublic(input, (requestOptions) =>
      this.publicClient.posts.getById(id, { ...options, requestOptions }),
    );
  }

  private readPostsByIds(input: XPostBatchInput): Promise<XReadResult> {
    if (input.ids.length < 1 || input.ids.length > MAX_PAGE_SIZE) {
      throw new XTransportError("bad_request");
    }
    const ids = input.ids.map(boundedId);
    if (new Set(ids).size !== ids.length) {
      throw new XTransportError("bad_request");
    }
    const options = postFieldOptions(input);
    return this.readPublic(input, (requestOptions) =>
      this.publicClient.posts.getByIds(ids, { ...options, requestOptions }),
    );
  }

  private readPostCollection(input: XPostCollectionInput): Promise<XReadResult> {
    const id = boundedId(input.id);
    const options = collectionOptions(input);
    return this.readPublic(input, (requestOptions) =>
      this.publicClient.posts.getQuoted(id, { ...options, requestOptions }),
    );
  }

  private userSearch(input: XUserSearchInput): Promise<XReadResult> {
    const query = boundedString(input.query, "user search query", 50);
    const options = userSearchOptions(input);
    const params = new URLSearchParams({ query, max_results: String(options.maxResults) });
    if (options.paginationToken) {
      params.set("next_token", options.paginationToken);
    }
    appendFields(params, "user.fields", options.userFields);
    appendFields(params, "expansions", options.expansions);
    appendFields(params, "tweet.fields", options.tweetFields);
    // XDK 0.5's generated users.search metadata omits current app-only Bearer
    // auth. Keep the official XDK client/HTTP path and supply the endpoint's
    // documented security requirement through its generic request method.
    return this.readPublic(input, (requestOptions) =>
      this.publicClient.request<Response>("GET", `/2/users/search?${params.toString()}`, {
        ...requestOptions,
        security: [{ BearerToken: [] }],
      }),
    );
  }

  private userIdentity(input: XUserIdentityInput): Promise<XReadResult> {
    if (Boolean(input.id) === Boolean(input.username)) {
      throw new XTransportError("bad_request");
    }
    const options = userFieldOptions(input);
    return this.readPublic(input, (requestOptions) =>
      input.id
        ? this.publicClient.users.getById(boundedId(input.id), { ...options, requestOptions })
        : this.publicClient.users.getByUsername(boundedId(input.username as string), {
            ...options,
            requestOptions,
          }),
    );
  }

  private userIdentityBatch(input: XUserBatchInput): Promise<XReadResult> {
    if (Boolean(input.ids) === Boolean(input.usernames)) {
      throw new XTransportError("bad_request");
    }
    const values = (input.ids ?? input.usernames ?? []).map(boundedId);
    if (
      values.length < 1 ||
      values.length > MAX_PAGE_SIZE ||
      new Set(values).size !== values.length
    ) {
      throw new XTransportError("bad_request");
    }
    const options = userFieldOptions(input);
    return this.readPublic(input, (requestOptions) =>
      input.ids
        ? this.publicClient.users.getByIds(values, { ...options, requestOptions })
        : this.publicClient.users.getByUsernames(values, { ...options, requestOptions }),
    );
  }

  private relationship(
    kind: "followers" | "following",
    input: XRelationshipInput,
  ): Promise<XReadResult> {
    const id = boundedId(input.id);
    const options = relationshipOptions(input);
    return this.readPublic(input, (requestOptions) =>
      kind === "followers"
        ? this.publicClient.users.getFollowers(id, { ...options, requestOptions })
        : this.publicClient.users.getFollowing(id, { ...options, requestOptions }),
    );
  }

  private timeline(
    kind: "authored" | "reverse_chronological",
    input: XTimelineInput,
  ): Promise<XReadResult> {
    const id = boundedId(input.id);
    const options = timelineOptions(input);
    return this.readPublic(input, (requestOptions) =>
      kind === "authored"
        ? this.publicClient.users.getPosts(id, { ...options, requestOptions })
        : this.publicClient.users.getTimeline(id, { ...options, requestOptions }),
    );
  }

  private trendByLocation(input: XTrendInput & { woeid: number }): Promise<XReadResult> {
    if (!Number.isSafeInteger(input.woeid) || input.woeid < 1) {
      throw new XTransportError("bad_request");
    }
    const options = trendOptions(input);
    return this.readPublic(input, (requestOptions) =>
      this.publicClient.trends.getByWoeid(input.woeid, { ...options, requestOptions }),
    );
  }

  private personalizedTrends(input: XTrendInput): Promise<XReadResult> {
    const personalizedTrendFields = boundedFields(input.trendFields);
    return this.readPublic(input, (requestOptions) =>
      this.publicClient.trends.getPersonalized({ personalizedTrendFields, requestOptions }),
    );
  }

  private publicMetrics(input: XPublicMetricsInput): Promise<XReadResult> {
    if (input.ids.length < 1 || input.ids.length > MAX_PAGE_SIZE) {
      throw new XTransportError("bad_request");
    }
    const ids = input.ids.map(boundedId);
    return this.readPublic(input, (requestOptions) =>
      this.publicClient.posts.getByIds(ids, {
        tweetFields: ["author_id", "created_at", "public_metrics"],
        requestOptions,
      }),
    );
  }

  private async ownedMetrics(input: XOwnedMetricsInput): Promise<XReadResult> {
    if (
      input.tweetIds.length < 1 ||
      input.tweetIds.length > MAX_PAGE_SIZE ||
      input.requestedMetrics.length < 1 ||
      input.requestedMetrics.length > MAX_PAGE_SIZE
    ) {
      throw new XTransportError("bad_request");
    }
    const ids = Array.from(new Set(input.tweetIds.map(boundedId)));
    const startTime = boundedString(input.startTime, "start time");
    const endTime = boundedString(input.endTime, "end time");
    const startEpoch = Date.parse(startTime);
    const endEpoch = Date.parse(endTime);
    if (
      !Number.isFinite(startEpoch) ||
      !Number.isFinite(endEpoch) ||
      startEpoch > endEpoch ||
      endEpoch - startEpoch > MAX_OWNED_METRICS_WINDOW_MS
    ) {
      throw new XTransportError("bad_request");
    }
    const granularity = normalizeAnalyticsGranularity(input.granularity);
    const analyticsFields = boundedFields(input.requestedMetrics);
    try {
      analyticsFields.forEach(requireXOwnedMetricDefinition);
    } catch {
      throw new XTransportError("owned_metrics_unsupported_field");
    }
    boundedFields(input.engagementFields);
    let ownedCredential: string;
    try {
      ownedCredential = this.resolveOwnedMetricsApiKey
        ? await this.resolveOwnedMetricsApiKey()
        : requireOwnedMetricsCredential(this.ownedMetricsApiKey, this.env);
    } catch {
      throw new XTransportError("owned_metrics_configuration");
    }
    const client: XdkReadClient = new Client({
      baseUrl: this.baseUrl,
      accessToken: ownedCredential,
      timeout: this.timeoutMs,
      retry: false,
    });
    const receipts: XReceipt[] = [];
    let remainingResponseBytes = input.maxResponseBytes;
    const readOwned = async (
      request: (requestOptions: XdkRawRequestOptions) => Promise<Response>,
    ): Promise<XReadResult> => {
      if (remainingResponseBytes !== undefined && remainingResponseBytes < 1) {
        throw new XTransportError("unexpected_response", {
          category: "provider",
          receipts: [...receipts],
          requestCount: receipts.length,
        });
      }
      try {
        const result = await this.read(
          request,
          {
            ...input,
            ...(remainingResponseBytes !== undefined
              ? { maxResponseBytes: remainingResponseBytes }
              : {}),
          },
          [ownedCredential],
        );
        receipts.push(result.receipt);
        if (remainingResponseBytes !== undefined) {
          remainingResponseBytes -= result.receipt.serializedBytes ?? 0;
        }
        return result;
      } catch (error) {
        if (error instanceof XTransportError) {
          throw classifyOwnedRequestError(error, receipts);
        }
        throw error;
      }
    };

    const identity = await readOwned((requestOptions) =>
      client.users.getMe({ userFields: ["id"], requestOptions }),
    );
    const accountId = providerDataId(identity.data);
    if (!accountId) {
      throw ownedValidationError("owned_attribution_unsupported", receipts);
    }

    const posts = await readOwned((requestOptions) =>
      client.posts.getByIds(ids, { tweetFields: ["author_id"], requestOptions }),
    );
    const ownership = verifyPostOwnership(posts.data, ids, accountId);
    if (ownership !== "verified") {
      throw ownedValidationError(
        ownership === "mismatch" ? "owned_post_author_mismatch" : "owned_attribution_unsupported",
        receipts,
      );
    }

    const analytics = await readOwned((requestOptions) =>
      client.posts.getAnalytics(ids, endTime, startTime, granularity, {
        analyticsFields,
        requestOptions,
      }),
    );
    return {
      ...analytics,
      receipts,
      trustedOwnership: {
        provider: "x",
        accountId,
        verifiedPostIds: ids,
        verification: "authenticated_user_and_post_authors",
      },
      trustedOwnedAnalytics: {
        provider: "x",
        providerMetricClass: "analytics",
        startTime,
        endTime,
        granularity,
        requestedMetrics: analyticsFields,
      },
    };
  }

  private usage(input: XUsageInput): Promise<XReadResult> {
    const days = input.days ?? 7;
    if (!Number.isInteger(days) || days < 1 || days > 90) {
      throw new XTransportError("bad_request");
    }
    return this.readPublic(input, (requestOptions) =>
      this.publicClient.usage.get({ days, requestOptions }),
    );
  }

  private readPublic(
    options: XRequestOptions,
    request: (requestOptions: XdkRawRequestOptions) => Promise<Response>,
  ): Promise<XReadResult> {
    return this.read(request, options);
  }

  private async read(
    request: (requestOptions: XdkRawRequestOptions) => Promise<Response>,
    options: XRequestOptions,
    additionalSecrets: readonly string[] = [],
  ): Promise<XReadResult> {
    const signal = options.signal;
    const timeout = normalizeTimeout(options.timeoutMs ?? this.timeoutMs);
    try {
      const requestOptions: XdkRawRequestOptions = {
        raw: true,
        timeout,
        ...(signal ? { signal } : {}),
      };
      const response = await request(requestOptions);
      if (!isRawResponse(response)) {
        throw new XTransportError("unexpected_response", {
          category: "provider",
          requestCount: 1,
        });
      }
      const receipt = receiptFrom(response.status, response.headers);
      if (!response.ok) {
        throw new XTransportError(errorKindForStatus(response.status), {
          category: "provider",
          receipt,
          requestCount: 1,
        });
      }
      let body: Buffer;
      try {
        body = options.maxResponseBytes
          ? await readResponseWithLimit(response, options.maxResponseBytes, {
              onOverflow: ({ size }) =>
                new XTransportError("unexpected_response", {
                  category: "provider",
                  receipt: { ...receipt, serializedBytes: size },
                  requestCount: 1,
                }),
            })
          : Buffer.from(await response.arrayBuffer());
      } catch (error) {
        if (error instanceof XTransportError) {
          throw error;
        }
        throw new XTransportError("malformed_response", {
          category: "provider",
          receipt,
          requestCount: 1,
        });
      }
      const receivedReceipt: XReceipt = { ...receipt, serializedBytes: body.byteLength };
      let data: XJson;
      try {
        data = JSON.parse(body.toString("utf8")) as XJson;
      } catch {
        throw new XTransportError("malformed_response", {
          category: "provider",
          receipt: receivedReceipt,
          requestCount: 1,
        });
      }
      const redactedData = redactJson(data, [...this.secretValues, ...additionalSecrets]);
      return {
        data: redactedData,
        receipt: receivedReceipt,
        receipts: [receivedReceipt],
        nextToken: readNextToken(redactedData),
      };
    } catch (error) {
      if (error instanceof XTransportError) {
        throw error;
      }
      if (signal?.aborted) {
        throw new XTransportError("aborted", { category: "provider", requestCount: 1 });
      }
      const xdkError = error as { status?: unknown; headers?: unknown; message?: unknown };
      const status = typeof xdkError.status === "number" ? xdkError.status : undefined;
      if (status !== undefined && status > 0) {
        throw new XTransportError(errorKindForStatus(status), {
          category: "provider",
          receipt: receiptFrom(status, xdkError.headers),
          requestCount: 1,
        });
      }
      if (isTimeoutError(error)) {
        throw new XTransportError("timeout", { category: "provider", requestCount: 1 });
      }
      if (isXdkAuthenticationConfigurationError(error)) {
        throw new XTransportError("authentication", { category: "configuration" });
      }
      throw new XTransportError("network", { category: "provider", requestCount: 1 });
    }
  }
}

function isXdkAuthenticationConfigurationError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const configurationSuffix = " Please configure the appropriate authentication method.";
  const message = error.message.endsWith(configurationSuffix)
    ? `${error.message.slice(0, -configurationSuffix.length)}.`
    : error.message;
  return (
    message.startsWith("Authentication required for ") &&
    message.includes(". Required: ") &&
    message.includes(". Available: ") &&
    message.endsWith(".")
  );
}

export function createXReadTransport(options?: XReadTransportOptions): XReadTransport {
  return new XReadTransport(options);
}

function messageFor(kind: XTransportErrorKind): string {
  switch (kind) {
    case "bad_request":
      return "X rejected the read request.";
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

function classifyOwnedRequestError(
  error: XTransportError,
  completedReceipts: readonly XReceipt[],
): XTransportError {
  const receipts = [...completedReceipts, ...error.receipts];
  const options = {
    receipt: error.receipt,
    receipts,
    requestCount: completedReceipts.length + error.requestCount,
  };
  if (error.receipt?.status === 403) {
    return new XTransportError("owned_metrics_entitlement", options);
  }
  if ([404, 405, 501].includes(error.receipt?.status ?? 0)) {
    return new XTransportError("owned_attribution_unsupported", options);
  }
  return new XTransportError(error.kind, { ...options, category: "provider" });
}

function ownedValidationError(
  kind: "owned_attribution_unsupported" | "owned_post_author_mismatch",
  receipts: readonly XReceipt[],
): XTransportError {
  return new XTransportError(kind, { receipts: [...receipts], requestCount: receipts.length });
}

function providerDataId(data: XJson): string | undefined {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return undefined;
  }
  const value = data.data;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return typeof value.id === "string" && value.id.trim() ? value.id.trim() : undefined;
}

function verifyPostOwnership(
  data: XJson,
  requestedIds: readonly string[],
  accountId: string,
): "verified" | "mismatch" | "unsupported" {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return "unsupported";
  }
  const payload = Array.isArray(data.data) ? data.data : data.data ? [data.data] : [];
  const expected = new Set(requestedIds);
  const verified = new Set<string>();
  for (const value of payload) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      continue;
    }
    const id = typeof value.id === "string" ? value.id.trim() : "";
    const authorId = typeof value.author_id === "string" ? value.author_id.trim() : "";
    if (!expected.has(id)) {
      continue;
    }
    if (!authorId) {
      return "unsupported";
    }
    if (authorId !== accountId) {
      return "mismatch";
    }
    verified.add(id);
  }
  return verified.size === expected.size ? "verified" : "unsupported";
}

function normalizeBaseUrl(baseUrl: string | undefined): string {
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

function normalizeTimeout(value: number | undefined): number {
  if (value === undefined) {
    return DEFAULT_TIMEOUT_MS;
  }
  if (!Number.isFinite(value) || value < 1) {
    throw new XTransportError("bad_request");
  }
  return Math.min(Math.floor(value), MAX_TIMEOUT_MS);
}

function boundedQuery(value: string): string {
  const query = value.trim();
  if (!query || query.length > MAX_QUERY_LENGTH) {
    throw new XTransportError("bad_request");
  }
  return query;
}

function boundedId(value: string): string {
  return boundedString(value, "id", MAX_ID_LENGTH);
}

function boundedString(value: string, _label: string, maxLength = MAX_TOKEN_LENGTH): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new XTransportError("bad_request");
  }
  return normalized;
}

function boundedFields(values: string[] | undefined): string[] {
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

function postSearchOptions(input: XPostSearchInput) {
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

function countOptions(input: XCountInput) {
  return {
    startTime: optionalBounded(input.startTime, "start time"),
    endTime: optionalBounded(input.endTime, "end time"),
    sinceId: optionalBounded(input.sinceId, "since id", MAX_ID_LENGTH),
    untilId: optionalBounded(input.untilId, "until id", MAX_ID_LENGTH),
    paginationToken: optionalBounded(input.paginationToken, "pagination token"),
    granularity: input.granularity,
  };
}

function postFieldOptions(
  input: Pick<
    XPostByIdInput,
    "tweetFields" | "expansions" | "userFields" | "mediaFields" | "pollFields" | "placeFields"
  >,
) {
  return fieldOptions(input);
}

function collectionOptions(input: XPostCollectionInput) {
  return { ...pageOptions(input, 10), ...fieldOptions(input) };
}

function userSearchOptions(input: XUserSearchInput) {
  return {
    ...pageOptions(input),
    userFields: boundedFields(input.userFields),
    expansions: boundedFields(input.expansions),
    tweetFields: boundedFields(input.tweetFields),
  };
}

function appendFields(params: URLSearchParams, key: string, values: string[]): void {
  if (values.length > 0) {
    params.set(key, values.join(","));
  }
}

function userFieldOptions(input: XUserIdentityInput | XUserBatchInput) {
  return {
    userFields: boundedFields(input.userFields),
    expansions: boundedFields(input.expansions),
    tweetFields: boundedFields(input.tweetFields),
  };
}

function relationshipOptions(input: XRelationshipInput) {
  return {
    ...pageOptions(input),
    userFields: boundedFields(input.userFields),
    expansions: boundedFields(input.expansions),
    tweetFields: boundedFields(input.tweetFields),
  };
}

function timelineOptions(input: XTimelineInput) {
  return {
    ...pageOptions(input, 5),
    ...fieldOptions(input),
    startTime: optionalBounded(input.startTime, "start time"),
    endTime: optionalBounded(input.endTime, "end time"),
    sinceId: optionalBounded(input.sinceId, "since id", MAX_ID_LENGTH),
    untilId: optionalBounded(input.untilId, "until id", MAX_ID_LENGTH),
  };
}

function trendOptions(input: XTrendInput) {
  const maxTrends = input.maxResults ?? DEFAULT_PAGE_SIZE;
  if (!Number.isSafeInteger(maxTrends) || maxTrends < 1 || maxTrends > MAX_PAGE_SIZE) {
    throw new XTransportError("bad_request");
  }
  return { maxTrends, trendFields: boundedFields(input.trendFields) };
}

function normalizeAnalyticsGranularity(value: string): "hourly" | "daily" | "weekly" | "total" {
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

function receiptFrom(status: number, headers: unknown): XReceipt {
  const get = (name: string): string | undefined => {
    if (!headers || typeof headers !== "object") {
      return undefined;
    }
    if ("get" in headers && typeof (headers as { get?: unknown }).get === "function") {
      const value = (headers as { get(name: string): string | null }).get(name);
      return value ?? undefined;
    }
    const record = headers as Record<string, unknown>;
    const value = record[name] ?? record[name.toLowerCase()];
    return typeof value === "string" ? value : undefined;
  };
  return {
    status,
    rateLimit: {
      limit: get("x-rate-limit-limit"),
      remaining: get("x-rate-limit-remaining"),
      reset: get("x-rate-limit-reset"),
    },
    resourceId: get("x-resource-id"),
    requestId: get("x-request-id"),
  };
}

function errorKindForStatus(status: number): XTransportErrorKind {
  if (status === 400) {
    return "bad_request";
  }
  if (status === 401 || status === 403) {
    return "authentication";
  }
  if (status === 429) {
    return "rate_limited";
  }
  if (status >= 500 && status <= 599) {
    return "server";
  }
  return "unexpected_response";
}

function isRawResponse(value: unknown): value is Response {
  return Boolean(
    value &&
    typeof value === "object" &&
    "status" in value &&
    typeof value.status === "number" &&
    "ok" in value &&
    typeof value.ok === "boolean" &&
    "headers" in value &&
    value.headers &&
    typeof value.headers === "object" &&
    "json" in value &&
    typeof value.json === "function",
  );
}

function isTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return message.includes("timeout") || message.includes("timed out");
}

function readNextToken(data: XJson): string | undefined {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return undefined;
  }
  const meta = data.meta;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return undefined;
  }
  const nextToken = meta.next_token ?? meta.nextToken;
  return typeof nextToken === "string" ? nextToken : undefined;
}

function redactJson(value: XJson, secrets: readonly string[], depth = 0): XJson {
  if (depth > 32 || value === null || typeof value === "boolean" || typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    return secrets.reduce((result, secret) => result.replaceAll(secret, "[REDACTED]"), value);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => redactJson(entry, secrets, depth + 1));
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, redactJson(entry, secrets, depth + 1)]),
  );
}
