import type {
  Client,
  PostsClient,
  TrendsClient,
  UsageClient,
  UsersClient,
} from "@xdevplatform/xdk";
import { executeProviderOperationWithRetry } from "openclaw/plugin-sdk/provider-http";
import { sleepWithAbort } from "openclaw/plugin-sdk/runtime-env";
import {
  normalizeOptionalTimeout,
  XTransportError,
  type XJson,
  type XReadResult,
  type XReceipt,
  type XRequestOptions,
  type XRetryEvent,
  type XRetryTelemetry,
  type XTransportErrorKind,
} from "./transport-contracts.js";

const X_PROVIDER_RETRY_ATTEMPTS = 2;
const X_PROVIDER_RETRY_BASE_DELAY_MS = 5_000;

export type XdkReadClient = {
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

export type XdkRawRequestOptions = {
  raw: true;
  signal?: AbortSignal;
  timeout?: number;
};

type XHttpReaderOptions = Readonly<{
  timeoutMs?: number;
  retrySleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  secretValues: readonly string[];
}>;

export class XHttpReader {
  private readonly timeoutMs: number | undefined;
  private readonly retrySleep: ((ms: number, signal?: AbortSignal) => Promise<void>) | undefined;
  private readonly secretValues: readonly string[];

  constructor(options: XHttpReaderOptions) {
    this.timeoutMs = options.timeoutMs;
    this.retrySleep = options.retrySleep;
    this.secretValues = options.secretValues;
  }

  async read(
    request: (requestOptions: XdkRawRequestOptions) => Promise<Response>,
    options: XRequestOptions,
    additionalSecrets: readonly string[] = [],
  ): Promise<XReadResult> {
    const signal = options.signal;
    const receipts: XReceipt[] = [];
    const retryEvents: XRetryEvent[] = [];
    let pendingRetry:
      | {
          error: XTransportError & { kind: "rate_limited" | "server" };
          attemptNumber: number;
        }
      | undefined;
    let attempts = 0;
    try {
      const result = await executeProviderOperationWithRetry({
        provider: "x",
        stage: "read",
        operation: async () => {
          attempts += 1;
          try {
            const attemptResult = await this.readOnce(request, options, additionalSecrets);
            receipts.push(attemptResult.receipt);
            return attemptResult;
          } catch (error) {
            if (error instanceof XTransportError && error.receipt) {
              receipts.push(error.receipt);
            }
            throw error;
          }
        },
        retry: {
          attempts: X_PROVIDER_RETRY_ATTEMPTS,
          baseDelayMs: X_PROVIDER_RETRY_BASE_DELAY_MS,
          maxDelayMs: Number.MAX_SAFE_INTEGER,
          signal,
          shouldRetry: ({ error, attemptNumber }) => {
            if (
              !(error instanceof XTransportError) ||
              (error.kind !== "rate_limited" && error.kind !== "server")
            ) {
              return false;
            }
            pendingRetry = {
              error: error as XTransportError & { kind: "rate_limited" | "server" },
              attemptNumber,
            };
            return true;
          },
          sleep: async (backoffDelayMs, retrySignal) => {
            const retry = pendingRetry;
            const delayMs = Math.max(
              backoffDelayMs,
              retry ? (xProviderRetryDelayMs(retry.error) ?? 0) : 0,
            );
            if (retry) {
              retryEvents.push(xRetryEvent(retry.error, retry.attemptNumber, delayMs));
              pendingRetry = undefined;
            }
            await (this.retrySleep ?? sleepWithAbort)(delayMs, retrySignal);
          },
        },
      });
      const retry = xRetryTelemetry(attempts, retryEvents);
      return {
        ...result,
        receipts,
        ...(retry ? { retry } : {}),
      };
    } catch (error) {
      const retry = xRetryTelemetry(attempts, retryEvents);
      if (error instanceof XTransportError) {
        throw new XTransportError(error.kind, {
          category: error.category,
          receipt: error.receipt,
          receipts,
          requestCount: attempts,
          ...(retry ? { retry } : {}),
        });
      }
      if (signal?.aborted) {
        throw new XTransportError("aborted", {
          category: "provider",
          receipts,
          requestCount: attempts,
          ...(retry ? { retry } : {}),
        });
      }
      throw error;
    }
  }

  private async readOnce(
    request: (requestOptions: XdkRawRequestOptions) => Promise<Response>,
    options: XRequestOptions,
    additionalSecrets: readonly string[] = [],
  ): Promise<XReadResult> {
    const signal = options.signal;
    const timeout = normalizeOptionalTimeout(options.timeoutMs ?? this.timeoutMs);
    try {
      const requestOptions: XdkRawRequestOptions = {
        raw: true,
        ...(timeout !== undefined ? { timeout } : {}),
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
        body = Buffer.from(await response.arrayBuffer());
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

export function xRetryTelemetry(
  attempts: number,
  retryEvents: readonly XRetryEvent[],
): XRetryTelemetry | undefined {
  if (retryEvents.length === 0) {
    return undefined;
  }
  return {
    attempts,
    retries: [...retryEvents],
    totalDelayMs: retryEvents.reduce((total, event) => total + event.delayMs, 0),
  };
}

function xProviderRetryDelayMs(error: XTransportError, now = Date.now()): number | undefined {
  const receipt = error.receipt;
  if (!receipt) {
    return undefined;
  }
  const candidates: number[] = [];
  const retryAfter = receipt.retryAfter?.trim();
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      candidates.push(seconds * 1_000);
    } else {
      const timestamp = Date.parse(retryAfter);
      if (Number.isFinite(timestamp)) {
        candidates.push(Math.max(0, timestamp - now));
      }
    }
  }
  const resetSeconds = Number(receipt.rateLimit.reset);
  if (Number.isFinite(resetSeconds) && resetSeconds > 0) {
    candidates.push(Math.max(0, resetSeconds * 1_000 - now));
  }
  return candidates.length > 0 ? Math.max(...candidates) : undefined;
}

function xRetryEvent(
  error: XTransportError & { kind: "rate_limited" | "server" },
  attemptNumber: number,
  delayMs: number,
): XRetryEvent {
  return {
    attempt: attemptNumber,
    kind: error.kind,
    delayMs,
    ...(error.receipt?.status !== undefined ? { status: error.receipt.status } : {}),
    ...(error.receipt?.retryAfter ? { retryAfter: error.receipt.retryAfter } : {}),
    ...(error.receipt?.rateLimit.reset ? { reset: error.receipt.rateLimit.reset } : {}),
  };
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
    retryAfter: get("retry-after"),
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
