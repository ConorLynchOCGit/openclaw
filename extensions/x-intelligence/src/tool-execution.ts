import { createHash } from "node:crypto";
import type { OpenClawPluginToolContext } from "openclaw/plugin-sdk/plugin-entry";
import { jsonResult } from "openclaw/plugin-sdk/provider-web-search";
import type { createXAgencyDataAdapter } from "./agency-data-adapter.js";
import type { XContentCache } from "./content-cache.js";
import { writeAcquisitionManifest } from "./evidence-store.js";
import {
  stringValue,
  type SourceOperationOptions,
  type ToolCommon,
  type XToolExecute,
} from "./tool-shared.js";
import {
  XTransportError,
  type XJson,
  type XReadResult,
  type XRetryTelemetry,
} from "./transport.js";

const TOOL_VERSION = "x-intelligence.v1";

export type XIntelligenceRuntime = {
  cache: XContentCache;
  hydrate: Promise<number>;
  analytics: ReturnType<typeof createXAgencyDataAdapter>;
};

type ExecuteParams = SourceOperationOptions & {
  toolName: string;
  operation: string;
  args: ToolCommon & Record<string, unknown>;
  ctx: OpenClawPluginToolContext;
  toolCallId: string;
  invoke: () => Promise<XReadResult>;
  runtime: XIntelligenceRuntime;
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function sourceUrl(id: string): string {
  return `https://x.com/i/web/status/${id}`;
}

function collectObjects(value: XJson): Record<string, unknown>[] {
  const root = asRecord(value);
  if (!root) {
    return [];
  }
  const data = Array.isArray(root.data) ? root.data : root.data ? [root.data] : [];
  const includes = asRecord(root.includes);
  const included = includes
    ? ["tweets", "users", "media"].flatMap((key) =>
        Array.isArray(includes[key]) ? (includes[key] as unknown[]) : [],
      )
    : [];
  return [...data, ...included]
    .map(asRecord)
    .filter((item): item is Record<string, unknown> => Boolean(item));
}

function evidenceFrom(value: XJson, toolName: string) {
  const objects = collectObjects(value);
  const posts = objects.filter((item) => {
    if (!stringValue(item.id)) {
      return false;
    }
    if (toolName === "x_users") {
      return Boolean(
        stringValue(item.username) || stringValue(item.name) || stringValue(item.description),
      );
    }
    if (!["x_posts", "x_timelines", "x_metrics"].includes(toolName)) {
      return false;
    }
    return Boolean(
      stringValue(item.text) ||
      stringValue(item.author_id) ||
      stringValue(item.conversation_id) ||
      Array.isArray(item.timestamped_metrics),
    );
  });
  const ids = Array.from(
    new Set(posts.map((item) => stringValue(item.id)).filter(Boolean)),
  ) as string[];
  const urls = toolName === "x_users" ? [] : ids.map(sourceUrl);
  const hashes = objects
    .flatMap((item) => [stringValue(item.text), stringValue(item.description)])
    .filter((text): text is string => Boolean(text))
    .map(sha256);
  const publicMetrics: Record<string, number> = {};
  for (const item of objects) {
    const metrics = asRecord(item.public_metrics);
    if (!metrics) {
      continue;
    }
    for (const [name, raw] of Object.entries(metrics)) {
      const metricValue = Number(raw);
      if (Number.isFinite(metricValue) && metricValue >= 0) {
        publicMetrics[name] = (publicMetrics[name] ?? 0) + metricValue;
      }
    }
  }
  return { ids, urls, hashes: Array.from(new Set(hashes)), publicMetrics, objects };
}

async function cacheSourceObjects(cache: XContentCache, objects: Record<string, unknown>[]) {
  const keys: string[] = [];
  for (const item of objects) {
    const id = stringValue(item.id) ?? stringValue(item.media_key);
    if (!id) {
      continue;
    }
    const postText = stringValue(item.text);
    const profileText = stringValue(item.description);
    const mediaType = stringValue(item.type);
    const mediaUrl = stringValue(item.url) ?? stringValue(item.preview_image_url);
    if (!postText && !profileText && !mediaType && !mediaUrl) {
      continue;
    }
    const key = postText ? `post:${id}` : profileText ? `profile:${id}` : `media:${id}`;
    await cache.put(key, {
      ...(postText ? { postText } : {}),
      ...(profileText ? { profileText } : {}),
      ...(mediaType || mediaUrl
        ? {
            media: [
              {
                ...(mediaType ? { contentType: mediaType } : {}),
                ...(mediaUrl ? { url: mediaUrl } : {}),
                ...(Number.isFinite(Number(item.width)) ? { width: Number(item.width) } : {}),
                ...(Number.isFinite(Number(item.height)) ? { height: Number(item.height) } : {}),
                ...(Number.isFinite(Number(item.duration_ms))
                  ? { durationMs: Number(item.duration_ms) }
                  : {}),
              },
            ],
          }
        : {}),
    });
    keys.push(key);
  }
  return keys;
}

function manifestFilters(args: Record<string, unknown>): Record<string, XJson> {
  const allowed = [
    "operation",
    "id",
    "username",
    "user_id",
    "max_results",
    "sort_order",
    "granularity",
    "woeid",
    "metric_names",
  ];
  return Object.fromEntries(
    allowed.filter((key) => args[key] !== undefined).map((key) => [key, args[key] as XJson]),
  );
}

function providerRequestCount(result: XReadResult): number {
  return Math.max(1, result.receipts?.length ?? 1);
}

type ResourceReceipt = Readonly<{
  requests: number;
  pages: number;
  posts: number;
  users: number;
  counts: number;
  media: number;
  serialized_bytes: number;
}>;

type FormatMediaReceipt = Readonly<{
  requested_post_ids: readonly string[];
  returned_post_ids: readonly string[];
  missing_post_ids: readonly string[];
  unexpected_post_ids: readonly string[];
  required_media_keys: readonly string[];
  returned_media_keys: readonly string[];
  missing_media_keys: readonly string[];
  unexpected_media_keys: readonly string[];
  posts_without_media: readonly string[];
  rights: Readonly<{ status: "not_exposed_by_x_api" }>;
  retention: Readonly<{
    raw_content_cache_max_hours: 24;
    evidence_manifest: "metadata_only";
  }>;
}>;

function responseItems(value: XJson, key: "data" | "media"): Record<string, unknown>[] {
  const root = asRecord(value);
  const source = key === "data" ? root?.data : asRecord(root?.includes)?.media;
  const values = Array.isArray(source) ? source : source ? [source] : [];
  return values.map(asRecord).filter((item): item is Record<string, unknown> => Boolean(item));
}

function includedItems(value: XJson, key: "tweets" | "users" | "media"): Record<string, unknown>[] {
  const root = asRecord(value);
  const source = asRecord(root?.includes)?.[key];
  const values = Array.isArray(source) ? source : source ? [source] : [];
  return values.map(asRecord).filter((item): item is Record<string, unknown> => Boolean(item));
}

function resourceReceipt(execution: ExecuteParams, result: XReadResult): ResourceReceipt {
  const data = responseItems(result.data, "data");
  const includedPosts = includedItems(result.data, "tweets");
  const includedUsers = includedItems(result.data, "users");
  const media = includedItems(result.data, "media");
  const ownedMetrics = execution.toolName === "x_metrics" && execution.operation === "owned";
  const posts = ownedMetrics
    ? (result.trustedOwnership?.verifiedPostIds.length ?? 0) + includedPosts.length
    : (["x_posts", "x_timelines"].includes(execution.toolName) ||
      (execution.toolName === "x_metrics" && execution.operation === "public")
        ? data.length
        : 0) + includedPosts.length;
  const users =
    (execution.toolName === "x_users" ? data.length : 0) +
    includedUsers.length +
    (ownedMetrics && result.trustedOwnership ? 1 : 0);
  const receipts = result.receipts ?? [result.receipt];
  const exactResponseBytes = receipts.every(
    (receipt) =>
      typeof receipt.serializedBytes === "number" && Number.isFinite(receipt.serializedBytes),
  )
    ? receipts.reduce((total, receipt) => total + (receipt.serializedBytes ?? 0), 0)
    : Buffer.byteLength(JSON.stringify(result.data), "utf8");
  return {
    requests: providerRequestCount(result),
    pages: execution.pageSize === undefined ? 0 : 1,
    posts,
    users,
    counts: execution.toolName === "x_counts" ? 1 : 0,
    media: media.length,
    serialized_bytes: exactResponseBytes,
  };
}

class XProfileResponseError extends Error {
  readonly resourceReceipt: ResourceReceipt;
  readonly providerStatus: number;
  readonly formatMedia?: FormatMediaReceipt;

  constructor(result: XReadResult, receipt: ResourceReceipt, formatMedia?: FormatMediaReceipt) {
    super("X returned resources outside the admitted operation profile.");
    this.name = "XProfileResponseError";
    this.resourceReceipt = receipt;
    this.providerStatus = result.receipt.status;
    this.formatMedia = formatMedia;
  }
}

function formatMediaReceipt(execution: ExecuteParams, result: XReadResult): FormatMediaReceipt {
  const requestedPostIds = [...new Set(execution.subjectIds ?? [])];
  const posts = responseItems(result.data, "data");
  const returnedPostIds = posts
    .map((post) => stringValue(post.id))
    .filter((id): id is string => Boolean(id));
  const requested = new Set(requestedPostIds);
  const returned = new Set(returnedPostIds);
  const requiredMediaKeys = posts.flatMap((post) => {
    const attachments = asRecord(post.attachments);
    return Array.isArray(attachments?.media_keys)
      ? attachments.media_keys.filter(
          (key): key is string => typeof key === "string" && key.trim().length > 0,
        )
      : [];
  });
  const media = includedItems(result.data, "media");
  const returnedMediaKeys = media
    .map((item) => stringValue(item.media_key))
    .filter((key): key is string => Boolean(key));
  const requiredMedia = new Set(requiredMediaKeys);
  const returnedMedia = new Set(returnedMediaKeys);
  return {
    requested_post_ids: requestedPostIds,
    returned_post_ids: returnedPostIds,
    missing_post_ids: requestedPostIds.filter((id) => !returned.has(id)),
    unexpected_post_ids: returnedPostIds.filter((id) => !requested.has(id)),
    required_media_keys: [...requiredMedia],
    returned_media_keys: [...returnedMedia],
    missing_media_keys: [...requiredMedia].filter((key) => !returnedMedia.has(key)),
    unexpected_media_keys: [...returnedMedia].filter((key) => !requiredMedia.has(key)),
    posts_without_media: posts
      .filter((post) => {
        const attachments = asRecord(post.attachments);
        return !Array.isArray(attachments?.media_keys) || attachments.media_keys.length === 0;
      })
      .map((post) => stringValue(post.id))
      .filter((id): id is string => Boolean(id)),
    rights: { status: "not_exposed_by_x_api" },
    retention: {
      raw_content_cache_max_hours: 24,
      evidence_manifest: "metadata_only",
    },
  };
}

function validateProfileResponse(execution: ExecuteParams, result: XReadResult): ResourceReceipt {
  const receipt = resourceReceipt(execution, result);
  const formatMedia =
    execution.profile === "format_media_v1" ? formatMediaReceipt(execution, result) : undefined;
  const includes = asRecord(asRecord(result.data)?.includes);
  const hasUnexpectedIncludes = (allowed: readonly string[]) =>
    Boolean(includes && Object.keys(includes).some((key) => !allowed.includes(key)));
  const invalid =
    (execution.profile === "format_media_v1" &&
      (hasUnexpectedIncludes(["media"]) ||
        receipt.posts > (execution.maxPosts ?? 10) ||
        receipt.media > 40 ||
        Boolean(
          formatMedia &&
          (formatMedia.missing_post_ids.length > 0 ||
            formatMedia.unexpected_post_ids.length > 0 ||
            formatMedia.missing_media_keys.length > 0 ||
            formatMedia.unexpected_media_keys.length > 0),
        ))) ||
    (execution.profile !== "format_media_v1" && hasUnexpectedIncludes([])) ||
    (execution.maxPosts !== undefined && receipt.posts > execution.maxPosts) ||
    (execution.maxUsers !== undefined && receipt.users > execution.maxUsers) ||
    (execution.maxMedia !== undefined && receipt.media > execution.maxMedia);
  if (invalid) {
    throw new XProfileResponseError(result, receipt, formatMedia);
  }
  return receipt;
}

async function writeManifest(params: {
  execution: ExecuteParams;
  result?: XReadResult;
  resourceReceipt?: ResourceReceipt;
  durationMs: number;
  error?: { code: string; category?: string; retryable?: boolean };
  requestCount?: number;
  observedSerializedBytes?: number;
  formatMedia?: FormatMediaReceipt;
  retry?: XRetryTelemetry;
}) {
  const { execution, result } = params;
  const retry = result?.retry ?? params.retry;
  const receipt =
    params.resourceReceipt ?? (result ? resourceReceipt(execution, result) : undefined);
  const evidence = result
    ? evidenceFrom(result.data, execution.toolName)
    : { ids: [], urls: [], hashes: [], publicMetrics: {}, objects: [] };
  const sessionDigest = execution.ctx.sessionKey ? sha256(execution.ctx.sessionKey) : undefined;
  // Provider tool-call ids are opaque and may contain characters that are not
  // valid artifact identifiers. Keep correlation without persisting provider
  // syntax into the evidence contract.
  const manifestToolCallId = `toolcall:${sha256(execution.toolCallId)}`;
  return await writeAcquisitionManifest({
    workspaceDir: execution.ctx.workspaceDir,
    input: {
      versions: {
        request: TOOL_VERSION,
        subject: "x-source-subject.v1",
        purpose: "x-research-purpose.v1",
        method: execution.args.method_version ?? "x-research-method.v1",
        query: execution.args.query_version ?? "x-query-family.v1",
      },
      request: {
        id: manifestToolCallId,
        ...(sessionDigest ? { correlationId: sessionDigest } : {}),
      },
      subject: {
        kind: execution.subjectKind,
        ids: execution.subjectIds ?? evidence.ids,
      },
      purpose: { code: execution.args.purpose },
      method: { name: `${execution.toolName}.${execution.operation}` },
      query: {
        ...(execution.queryText ? { text: execution.queryText } : {}),
        filters: {
          ...manifestFilters(execution.args),
          ...(execution.profile ? { profile: execution.profile } : {}),
          ...(params.formatMedia ? { format_media: params.formatMedia } : {}),
        },
        window: {
          ...(stringValue(execution.args.start_time)
            ? { start: stringValue(execution.args.start_time) }
            : {}),
          ...(stringValue(execution.args.end_time)
            ? { end: stringValue(execution.args.end_time) }
            : {}),
          ...(execution.pageSize ? { limit: execution.pageSize } : {}),
        },
      },
      endpoint: { name: execution.operation, tool: execution.toolName },
      evidence: {
        ids: evidence.ids,
        urls: evidence.urls,
        hashes: evidence.hashes,
        citations: evidence.ids.map((id, index) => ({ id, url: evidence.urls[index] })),
        publicMetrics: evidence.publicMetrics,
      },
      resources: {
        requests: params.requestCount ?? receipt?.requests ?? 0,
        ...(retry
          ? {
              retries: retry.retries.length,
              retryDelayMs: retry.totalDelayMs,
            }
          : {}),
        ...(receipt
          ? { bytes: receipt.serialized_bytes }
          : params.observedSerializedBytes !== undefined
            ? { bytes: params.observedSerializedBytes }
            : {}),
        durationMs: params.durationMs,
      },
      cost: {},
      errors: params.error ? [params.error] : [],
      pagination: {
        pageSize: execution.pageSize,
        ...(result?.nextToken
          ? { cursorHash: sha256(result.nextToken), hasMore: true }
          : { hasMore: false }),
      },
      provenance: {
        model: execution.ctx.activeModel
          ? {
              provider: execution.ctx.activeModel.provider,
              name: execution.ctx.activeModel.modelId,
              version: execution.ctx.activeModel.modelRef,
            }
          : undefined,
        toolCall: { id: manifestToolCallId, name: execution.toolName, version: TOOL_VERSION },
      },
    },
  });
}

async function executeSourceOperation(params: ExecuteParams) {
  await params.runtime.hydrate;
  const startedAt = Date.now();
  let requestCount = 0;
  try {
    const result = await params.invoke();
    const receipt = validateProfileResponse(params, result);
    const formatMedia =
      params.profile === "format_media_v1" ? formatMediaReceipt(params, result) : undefined;
    requestCount = receipt.requests;
    const evidence = evidenceFrom(result.data, params.toolName);
    const cacheKeys = await cacheSourceObjects(params.runtime.cache, evidence.objects);
    const artifact = await writeManifest({
      execution: params,
      result,
      resourceReceipt: receipt,
      durationMs: Date.now() - startedAt,
      requestCount,
      formatMedia,
    });
    const analyticsContext = params.args.analytics_context;
    const analytics = await params.runtime.analytics.ingest({
      context: analyticsContext
        ? {
            tenantId: analyticsContext.tenant_id,
            subject: {
              entityType: analyticsContext.subject_type,
              entityId: analyticsContext.subject_id,
            },
          }
        : undefined,
      result,
      manifestRef: artifact.ref,
      toolName: params.toolName,
      operation: params.operation,
      methodVersion: params.args.method_version ?? "x-research-method.v1",
      authMode: params.toolName === "x_metrics" && params.operation === "owned" ? "oauth" : "token",
    });
    return {
      status: analytics.status === "failed" ? "partial" : "complete",
      tool: params.toolName,
      operation: params.operation,
      purpose: params.args.purpose,
      method_version: params.args.method_version ?? "x-research-method.v1",
      provider_status: result.receipt.status,
      provider: result.data,
      continuation: result.nextToken
        ? { available: true, pagination_token: result.nextToken }
        : { available: false },
      evidence: { ref: artifact.ref, digest: artifact.digest, created: artifact.created },
      analytics,
      cache: { keys: cacheKeys, ttl_max_hours: 24 },
      profile: params.profile,
      ...(formatMedia ? { format_media: formatMedia } : {}),
      requests: receipt.requests,
      pages: receipt.pages,
      posts: receipt.posts,
      users: receipt.users,
      media: receipt.media,
      serialized_bytes: receipt.serialized_bytes,
      resources: { ...receipt, duration_ms: Date.now() - startedAt },
      cost: { status: "provider_not_reported" },
      ...(result.retry ? { retry: result.retry } : {}),
    };
  } catch (error) {
    const transport = error instanceof XTransportError ? error : undefined;
    const profileResponse = error instanceof XProfileResponseError ? error : undefined;
    const consumedResources = profileResponse?.resourceReceipt;
    const observedByteReceipts = (transport?.receipts ?? [])
      .map((receipt) => receipt.serializedBytes)
      .filter((bytes): bytes is number => typeof bytes === "number" && Number.isFinite(bytes));
    const observedSerializedBytes =
      observedByteReceipts.length > 0
        ? observedByteReceipts.reduce((total, bytes) => total + bytes, 0)
        : undefined;
    requestCount = consumedResources?.requests ?? transport?.requestCount ?? requestCount;
    const code =
      (profileResponse ? "unexpected_response" : transport?.kind) ??
      (error && typeof error === "object" && "code" in error && typeof error.code === "string"
        ? error.code
        : "x_source_operation_failed");
    const artifact = await writeManifest({
      execution: params,
      resourceReceipt: consumedResources,
      observedSerializedBytes,
      durationMs: Date.now() - startedAt,
      error: {
        code,
        category: profileResponse ? "provider" : (transport?.category ?? "runtime"),
        retryable: transport
          ? ["rate_limited", "server", "timeout", "network"].includes(transport.kind)
          : false,
      },
      requestCount,
      formatMedia: profileResponse?.formatMedia,
      retry: transport?.retry,
    });
    return {
      status: "failed",
      tool: params.toolName,
      operation: params.operation,
      purpose: params.args.purpose,
      method_version: params.args.method_version ?? "x-research-method.v1",
      error: {
        code,
        category: profileResponse ? "provider" : (transport?.category ?? "runtime"),
        ...(profileResponse
          ? { provider_status: profileResponse.providerStatus }
          : transport?.receipt
            ? { provider_status: transport.receipt.status }
            : {}),
      },
      evidence: { ref: artifact.ref, digest: artifact.digest, created: artifact.created },
      ...(profileResponse?.formatMedia ? { format_media: profileResponse.formatMedia } : {}),
      requests: requestCount,
      resources: consumedResources
        ? { ...consumedResources, duration_ms: Date.now() - startedAt }
        : {
            requests: requestCount,
            ...(observedSerializedBytes !== undefined
              ? { serialized_bytes: observedSerializedBytes }
              : {}),
            duration_ms: Date.now() - startedAt,
          },
      cost: { status: "provider_not_reported" },
      ...(transport?.retry ? { retry: transport.retry } : {}),
    };
  }
}

export function createXToolExecute(params: {
  ctx: OpenClawPluginToolContext;
  runtime: XIntelligenceRuntime;
}): XToolExecute {
  return async (toolName, operation, args, toolCallId, invoke, options) =>
    jsonResult(
      await executeSourceOperation({
        toolName,
        operation,
        args,
        ctx: params.ctx,
        toolCallId,
        invoke,
        runtime: params.runtime,
        ...options,
      }),
    );
}
