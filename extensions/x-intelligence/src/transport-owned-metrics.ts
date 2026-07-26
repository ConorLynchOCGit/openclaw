import { Client } from "@xdevplatform/xdk";
import type { KeyedAsyncQueue } from "openclaw/plugin-sdk/keyed-async-queue";
import type { SecretInput } from "openclaw/plugin-sdk/secret-input";
import { requireOwnedMetricsCredential } from "./auth.js";
import { requireXOwnedMetricDefinition } from "./owned-metric-definitions.js";
import {
  boundedFields,
  boundedId,
  boundedString,
  MAX_OWNED_METRICS_WINDOW_MS,
  MAX_PAGE_SIZE,
  normalizeAnalyticsGranularity,
  XTransportError,
  type XJson,
  type XOwnedMetricsInput,
  type XReadResult,
  type XReceipt,
  type XRetryEvent,
} from "./transport-contracts.js";
import {
  XHttpReader,
  xRetryTelemetry,
  type XdkRawRequestOptions,
  type XdkReadClient,
} from "./transport-http.js";

type XOwnedMetricsTransportOptions = Readonly<{
  ownedMetricsApiKey?: SecretInput;
  resolveOwnedMetricsApiKey?: () => Promise<string>;
  env: Readonly<Record<string, string | undefined>>;
  baseUrl: string;
  timeoutMs?: number;
  requestQueue: KeyedAsyncQueue;
  reader: XHttpReader;
}>;

export class XOwnedMetricsTransport {
  private readonly ownedMetricsApiKey: SecretInput | undefined;
  private readonly resolveOwnedMetricsApiKey: (() => Promise<string>) | undefined;
  private readonly env: Readonly<Record<string, string | undefined>>;
  private readonly baseUrl: string;
  private readonly timeoutMs: number | undefined;
  private readonly requestQueue: KeyedAsyncQueue;
  private readonly reader: XHttpReader;

  constructor(options: XOwnedMetricsTransportOptions) {
    this.ownedMetricsApiKey = options.ownedMetricsApiKey;
    this.resolveOwnedMetricsApiKey = options.resolveOwnedMetricsApiKey;
    this.env = options.env;
    this.baseUrl = options.baseUrl;
    this.timeoutMs = options.timeoutMs;
    this.requestQueue = options.requestQueue;
    this.reader = options.reader;
  }

  read(input: XOwnedMetricsInput): Promise<XReadResult> {
    return this.requestQueue.enqueue("metrics.owned", () => this.readOwned(input));
  }

  private async readOwned(input: XOwnedMetricsInput): Promise<XReadResult> {
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
      ...(this.timeoutMs !== undefined ? { timeout: this.timeoutMs } : {}),
      retry: false,
    });
    const receipts: XReceipt[] = [];
    const retryEvents: XRetryEvent[] = [];
    const readOwned = async (
      request: (requestOptions: XdkRawRequestOptions) => Promise<Response>,
    ): Promise<XReadResult> => {
      try {
        const result = await this.reader.read(request, input, [ownedCredential]);
        receipts.push(...(result.receipts ?? [result.receipt]));
        if (result.retry) {
          retryEvents.push(...result.retry.retries);
        }
        return result;
      } catch (error) {
        if (error instanceof XTransportError) {
          throw classifyOwnedRequestError(error, receipts, retryEvents);
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
    const retry = xRetryTelemetry(receipts.length, retryEvents);
    return {
      ...analytics,
      receipts,
      ...(retry ? { retry } : {}),
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
}

function classifyOwnedRequestError(
  error: XTransportError,
  completedReceipts: readonly XReceipt[],
  completedRetryEvents: readonly XRetryEvent[],
): XTransportError {
  const receipts = [...completedReceipts, ...error.receipts];
  const retryEvents = [...completedRetryEvents, ...(error.retry?.retries ?? [])];
  const requestCount = completedReceipts.length + error.requestCount;
  const retry = xRetryTelemetry(requestCount, retryEvents);
  const options = {
    receipt: error.receipt,
    receipts,
    requestCount,
    ...(retry ? { retry } : {}),
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
