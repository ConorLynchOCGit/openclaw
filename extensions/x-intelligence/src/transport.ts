import { KeyedAsyncQueue } from "openclaw/plugin-sdk/keyed-async-queue";
import { requirePublicCredential } from "./auth.js";
import {
  normalizeBaseUrl,
  normalizeOptionalTimeout,
  type XCountInput,
  type XOwnedMetricsInput,
  type XPostBatchInput,
  type XPostByIdInput,
  type XPostCollectionInput,
  type XPostSearchInput,
  type XPublicMetricsInput,
  type XReadResult,
  type XReadTransportOptions,
  type XRelationshipInput,
  type XTimelineInput,
  type XTrendInput,
  type XUsageInput,
  type XUserBatchInput,
  type XUserIdentityInput,
  type XUserSearchInput,
} from "./transport-contracts.js";
import { XHttpReader } from "./transport-http.js";
import { XOwnedMetricsTransport } from "./transport-owned-metrics.js";
import { XPublicReadTransport } from "./transport-public.js";

export { assertXRecentWindow, X_API_BASE_URL, XTransportError } from "./transport-contracts.js";
export type {
  XCountInput,
  XJson,
  XOwnedMetricsInput,
  XPageOptions,
  XPostBatchInput,
  XPostByIdInput,
  XPostCollectionInput,
  XPostSearchInput,
  XPublicMetricsInput,
  XReadResult,
  XReadTransportOptions,
  XReceipt,
  XRelationshipInput,
  XRequestOptions,
  XRetryEvent,
  XRetryTelemetry,
  XTimelineInput,
  XTransportErrorCategory,
  XTransportErrorKind,
  XTrendInput,
  XTrustedOwnedAnalytics,
  XTrustedOwnership,
  XUsageInput,
  XUserBatchInput,
  XUserIdentityInput,
  XUserSearchInput,
} from "./transport-contracts.js";

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

  constructor(options: XReadTransportOptions = {}) {
    const baseUrl = normalizeBaseUrl(options.baseUrl);
    const env = options.env ?? process.env;
    const timeoutMs = normalizeOptionalTimeout(options.timeoutMs);
    const publicCredential = requirePublicCredential(options.apiKey, env);
    const requestQueue = new KeyedAsyncQueue();
    const reader = new XHttpReader({
      timeoutMs,
      retrySleep: options.retrySleep,
      secretValues: [publicCredential],
    });
    const publicTransport = new XPublicReadTransport({
      baseUrl,
      publicCredential,
      timeoutMs,
      requestQueue,
      reader,
    });
    const ownedMetricsTransport = new XOwnedMetricsTransport({
      ownedMetricsApiKey: options.ownedMetricsApiKey,
      resolveOwnedMetricsApiKey: options.resolveOwnedMetricsApiKey,
      env,
      baseUrl,
      timeoutMs,
      requestQueue,
      reader,
    });

    this.posts = publicTransport.posts;
    this.counts = publicTransport.counts;
    this.users = publicTransport.users;
    this.timelines = publicTransport.timelines;
    this.trends = publicTransport.trends;
    this.metrics = {
      public: publicTransport.metrics.public,
      owned: (input) => ownedMetricsTransport.read(input),
      usage: publicTransport.metrics.usage,
    };
  }
}

export function createXReadTransport(options?: XReadTransportOptions): XReadTransport {
  return new XReadTransport(options);
}
