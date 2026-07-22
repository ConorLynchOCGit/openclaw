import { createHash } from "node:crypto";
import type {
  AnyAgentTool,
  OpenClawPluginApi,
  OpenClawPluginToolContext,
} from "openclaw/plugin-sdk/plugin-entry";
import { jsonResult } from "openclaw/plugin-sdk/provider-web-search";
import type { SecretInput } from "openclaw/plugin-sdk/secret-input";
import { resolveStateDir } from "openclaw/plugin-sdk/state-paths";
import { Type } from "typebox";
import { createXAgencyDataAdapter } from "./agency-data-adapter.js";
import { requireOwnedMetricsCredentialAtRuntime, type OpenClawConfigSnapshot } from "./auth.js";
import { createContentCache, type XContentCache } from "./content-cache.js";
import { writeAcquisitionManifest } from "./evidence-store.js";
import {
  requireXOwnedMetricDefinition,
  supportedXOwnedMetricFields,
} from "./owned-metric-definitions.js";
import {
  createXReadTransport,
  XTransportError,
  type XJson,
  type XReadResult,
} from "./transport.js";
import {
  estimateXDirectResponseBytes,
  type XResearchPriceAuthority,
} from "./x-research-admission.js";

const TOOL_VERSION = "x-intelligence.v1";
const MAX_MODEL_RESULT_BYTES = 48 * 1024;
const MAX_CACHE_ENTRIES = 25_000;

const POST_CORE_FIELDS = [
  "id",
  "text",
  "author_id",
  "created_at",
  "conversation_id",
  "referenced_tweets",
  "lang",
  "entities",
  "public_metrics",
  "attachments",
];
const USER_IDENTITY_FIELDS = [
  "id",
  "username",
  "name",
  "description",
  "created_at",
  "verified",
  "public_metrics",
];
export const MEDIA_FIELDS = [
  "media_key",
  "type",
  "url",
  "preview_image_url",
  "width",
  "height",
  "duration_ms",
  "public_metrics",
];
const FORMAT_MEDIA_EXPANSIONS = ["attachments.media_keys"];
const OWNED_METRIC_FIELD_SCHEMA = Type.Union(
  supportedXOwnedMetricFields().map((value) => Type.Literal(value)),
);

const PURPOSES = [
  "question_research",
  "topic_pulse",
  "influence_map",
  "format_study",
  "source_verification",
  "owned_performance",
] as const;
const RESEARCH_PROFILES = ["full_hybrid_per_subject_v2", "reduced_probe_v2"] as const;
const RESEARCH_STAGES = [
  "question_discovery",
  "question_verified_analysis",
  "topic_discovery",
  "influence_discovery",
  "influence_challenge",
  "format_analysis",
] as const;

const PurposeSchema = Type.Union(PURPOSES.map((value) => Type.Literal(value)));
const CommonSchema = {
  purpose: PurposeSchema,
  method_version: Type.Optional(
    Type.String({
      minLength: 1,
      maxLength: 128,
      description: "Version of the research method using this source operation.",
    }),
  ),
  query_version: Type.Optional(
    Type.String({
      minLength: 1,
      maxLength: 128,
      description: "Version of the query family or comparison design.",
    }),
  ),
  analytics_context: Type.Optional(
    Type.Object(
      {
        tenant_id: Type.String({ minLength: 1, maxLength: 128 }),
        subject_type: Type.Union([Type.Literal("company"), Type.Literal("person")]),
        subject_id: Type.String({ minLength: 1, maxLength: 128 }),
      },
      {
        additionalProperties: false,
        description:
          "Explicit canonical analytics association. Omit for source research that must not write Agency Data.",
      },
    ),
  ),
  research_profile: Type.Optional(
    Type.Union(RESEARCH_PROFILES.map((value) => Type.Literal(value))),
  ),
  research_stage: Type.Optional(Type.Union(RESEARCH_STAGES.map((value) => Type.Literal(value)))),
  subject_key: Type.Optional(
    Type.String({
      minLength: 1,
      maxLength: 128,
      description: "One immutable normalized research subject key for the admitted run.",
    }),
  ),
};
const PageSchema = {
  max_results: Type.Optional(Type.Integer({ minimum: 10, maximum: 100, default: 25 })),
  pagination_token: Type.Optional(Type.String({ minLength: 1, maxLength: 1024 })),
};
const TimelinePageSchema = {
  max_results: Type.Optional(Type.Integer({ minimum: 5, maximum: 100, default: 25 })),
  pagination_token: Type.Optional(Type.String({ minLength: 1, maxLength: 1024 })),
};

export type XIntelligencePluginConfig = {
  enabled?: boolean;
  apiKey?: SecretInput;
  ownedMetricsApiKey?: SecretInput;
  timeoutSeconds?: number;
  cacheTtlMinutes?: number;
  /** Exact X Researcher identity admitted by the outer lifecycle owner. */
  researcherAgentId?: string;
  /** Versioned operator-approved prices; stale or missing authority blocks research activation. */
  researchPriceAuthority?: XResearchPriceAuthority;
  complianceRefresh?: {
    enabled?: boolean;
    intervalMinutes?: number;
    maxIdsPerPass?: number;
  };
};

export type XIntelligenceRuntime = {
  cache: XContentCache;
  hydrate: Promise<number>;
  analytics: ReturnType<typeof createXAgencyDataAdapter>;
};

const runtimeByApi = new WeakMap<OpenClawPluginApi, XIntelligenceRuntime>();

export function getXIntelligenceRuntime(
  api: OpenClawPluginApi,
  config: XIntelligencePluginConfig,
  analyticsStateDir: string,
): XIntelligenceRuntime {
  const existing = runtimeByApi.get(api);
  if (existing) {
    return existing;
  }
  const cache = createContentCache({
    store: api.runtime.state.openKeyedStore({
      namespace: "x-content-cache-v1",
      maxEntries: MAX_CACHE_ENTRIES,
    }),
    ttlMs: Math.min(Math.max(config.cacheTtlMinutes ?? 1_440, 1), 1_440) * 60_000,
  });
  const runtime = {
    cache,
    hydrate: cache.hydrate(),
    analytics: createXAgencyDataAdapter({ stateDir: analyticsStateDir }),
  };
  runtimeByApi.set(api, runtime);
  return runtime;
}

type ToolCommon = {
  purpose: (typeof PURPOSES)[number];
  method_version?: string;
  query_version?: string;
  analytics_context?: {
    tenant_id: string;
    subject_type: "company" | "person";
    subject_id: string;
  };
  research_profile?: (typeof RESEARCH_PROFILES)[number];
  research_stage?: (typeof RESEARCH_STAGES)[number];
  subject_key?: string;
};

type ExecuteParams = {
  toolName: string;
  operation: string;
  args: ToolCommon & Record<string, unknown>;
  ctx: OpenClawPluginToolContext;
  toolCallId: string;
  invoke: () => Promise<XReadResult>;
  runtime: XIntelligenceRuntime;
  subjectKind: "post" | "profile" | "collection" | "query" | "resource";
  subjectIds?: string[];
  queryText?: string;
  pageSize?: number;
  profile?: "post_core_v1" | "format_media_v1" | "user_identity_v1" | "count_v1";
  maxPosts?: number;
  maxUsers?: number;
  maxMedia?: number;
  maxSerializedBytes?: number;
  priceAuthority?: XResearchPriceAuthority;
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
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

function boundedProjection(value: XJson): { value: XJson; truncated: boolean } {
  const project = (candidate: XJson, itemLimit: number, stringLimit: number, depth = 0): XJson => {
    if (depth > 10) {
      return "[depth capped]";
    }
    if (typeof candidate === "string") {
      return candidate.length > stringLimit
        ? `${candidate.slice(0, stringLimit)}...[truncated]`
        : candidate;
    }
    if (candidate === null || typeof candidate === "number" || typeof candidate === "boolean") {
      return candidate;
    }
    if (Array.isArray(candidate)) {
      return candidate
        .slice(0, itemLimit)
        .map((item) => project(item, itemLimit, stringLimit, depth + 1));
    }
    return Object.fromEntries(
      Object.entries(candidate)
        .slice(0, 64)
        .map(([key, child]) => [key, project(child, itemLimit, stringLimit, depth + 1)]),
    );
  };

  for (const [itemLimit, stringLimit] of [
    [100, 4_096],
    [50, 2_048],
    [20, 1_024],
    [8, 512],
    [2, 256],
  ] as const) {
    const projected = project(value, itemLimit, stringLimit);
    if (Buffer.byteLength(JSON.stringify(projected), "utf8") <= MAX_MODEL_RESULT_BYTES) {
      return { value: projected, truncated: itemLimit < 100 };
    }
  }
  return { value: { error: "provider_result_exceeded_model_output_cap" }, truncated: true };
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

type ResponseEnvelope = Readonly<{
  requests: number;
  posts?: number;
  users?: number;
  counts?: number;
  media?: number;
}>;

function responseEnvelope(params: ResponseEnvelope) {
  return {
    ...(params.posts !== undefined ? { maxPosts: params.posts } : {}),
    ...(params.users !== undefined ? { maxUsers: params.users } : {}),
    ...(params.media !== undefined ? { maxMedia: params.media } : {}),
    maxSerializedBytes: estimateXDirectResponseBytes(params),
  };
}

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

function observedCost(execution: ExecuteParams, receipt: ResourceReceipt): Record<string, unknown> {
  const authority = execution.priceAuthority;
  if (!authority) {
    return { status: "price_authority_unavailable" };
  }
  const countRate =
    execution.operation === "all" ? authority.allCountUsd : authority.recentCountUsd;
  return {
    status: "calculated_from_returned_resources",
    provider_cost_usd:
      receipt.posts * authority.postUsd +
      receipt.users * authority.userUsd +
      receipt.counts * countRate,
    price_identity: {
      version: authority.version,
      source: authority.source,
      as_of: authority.asOf,
      expires_at: authority.expiresAt,
    },
  };
}

function manifestCost(execution: ExecuteParams, receipt: ResourceReceipt) {
  const observed = observedCost(execution, receipt);
  return typeof observed.provider_cost_usd === "number"
    ? { currency: "USD", amount: observed.provider_cost_usd }
    : {};
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
    (execution.maxMedia !== undefined && receipt.media > execution.maxMedia) ||
    (execution.maxSerializedBytes !== undefined &&
      receipt.serialized_bytes > execution.maxSerializedBytes);
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
}) {
  const { execution, result } = params;
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
        ...(receipt
          ? { bytes: receipt.serialized_bytes }
          : params.observedSerializedBytes !== undefined
            ? { bytes: params.observedSerializedBytes }
            : {}),
        durationMs: params.durationMs,
      },
      cost: receipt ? manifestCost(execution, receipt) : {},
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
    const projection = boundedProjection(result.data);
    return {
      status: analytics.status === "failed" ? "partial" : "complete",
      tool: params.toolName,
      operation: params.operation,
      purpose: params.args.purpose,
      method_version: params.args.method_version ?? "x-research-method.v1",
      provider_status: result.receipt.status,
      provider: projection.value,
      result_truncated: projection.truncated,
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
      cost: observedCost(params, receipt),
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
      cost: consumedResources
        ? observedCost(params, consumedResources)
        : { status: "provider_not_reported" },
    };
  }
}

function requireString(args: Record<string, unknown>, key: string): string {
  const value = stringValue(args[key]);
  if (!value) {
    throw new XTransportError("bad_request");
  }
  return value;
}

function ownedMetricsInput(
  args: Record<string, unknown>,
  signal: AbortSignal | undefined,
  maxResponseBytes: number,
) {
  const tweetIds = Array.isArray(args.post_ids)
    ? args.post_ids.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
    : [];
  if (tweetIds.length === 0) {
    throw new XTransportError("owned_metrics_post_ids_required");
  }
  const startTime = stringValue(args.start_time);
  const endTime = stringValue(args.end_time);
  if (!startTime || !endTime) {
    throw new XTransportError("owned_metrics_window_required");
  }
  const requestedMetrics = Array.isArray(args.metric_names)
    ? args.metric_names.filter(
        (name): name is string => typeof name === "string" && name.trim().length > 0,
      )
    : [];
  if (requestedMetrics.length === 0) {
    throw new XTransportError("owned_metrics_fields_required");
  }
  try {
    requestedMetrics.forEach(requireXOwnedMetricDefinition);
  } catch {
    throw new XTransportError("owned_metrics_unsupported_field");
  }
  return {
    tweetIds,
    signal,
    maxResponseBytes,
    startTime,
    endTime,
    granularity: stringValue(args.granularity) ?? "total",
    requestedMetrics,
  };
}

function pageArgs(args: Record<string, unknown>) {
  return {
    maxResults: typeof args.max_results === "number" ? args.max_results : 25,
    paginationToken: stringValue(args.pagination_token),
  };
}

export function createConfiguredXReadTransport(
  config: XIntelligencePluginConfig,
  appConfig?: OpenClawConfigSnapshot,
) {
  return createXReadTransport({
    apiKey: config.apiKey,
    ownedMetricsApiKey: config.ownedMetricsApiKey,
    ...(appConfig
      ? {
          resolveOwnedMetricsApiKey: () =>
            requireOwnedMetricsCredentialAtRuntime({
              configured: config.ownedMetricsApiKey,
              config: appConfig,
            }),
        }
      : {}),
    timeoutMs: Math.min(Math.max(config.timeoutSeconds ?? 20, 1), 120) * 1_000,
  });
}

export function createXIntelligenceTools(params: {
  api: OpenClawPluginApi;
  config: XIntelligencePluginConfig;
  ctx: OpenClawPluginToolContext;
  createTransport?: () => ReturnType<typeof createXReadTransport>;
  analyticsStateDir?: string;
}): AnyAgentTool[] {
  const runtime = getXIntelligenceRuntime(
    params.api,
    params.config,
    params.analyticsStateDir ?? resolveStateDir(),
  );
  let transport: ReturnType<typeof createXReadTransport> | undefined;
  const getTransport = () =>
    (transport ??=
      params.createTransport?.() ??
      createConfiguredXReadTransport(
        params.config,
        params.api.runtime.config?.current?.() ?? params.api.config,
      ));
  const execute = async (
    toolName: string,
    operation: string,
    args: ToolCommon & Record<string, unknown>,
    toolCallId: string,
    invoke: () => Promise<XReadResult>,
    options: Pick<
      ExecuteParams,
      | "subjectKind"
      | "subjectIds"
      | "queryText"
      | "pageSize"
      | "profile"
      | "maxPosts"
      | "maxUsers"
      | "maxMedia"
      | "maxSerializedBytes"
    >,
  ) =>
    jsonResult(
      await executeSourceOperation({
        toolName,
        operation,
        args,
        ctx: params.ctx,
        toolCallId,
        invoke,
        runtime,
        priceAuthority: params.config.researchPriceAuthority,
        ...options,
      }),
    );

  return [
    {
      name: "x_posts",
      label: "X Posts",
      description:
        "Read bounded recent/archive X posts or hydrate one post, conversation, quote set, or reply set. Use focused queries and continuation tokens rather than broad post dumps.",
      parameters: Type.Union([
        Type.Object(
          {
            ...CommonSchema,
            operation: Type.Union([Type.Literal("recent"), Type.Literal("archive")]),
            query: Type.String({ minLength: 1, maxLength: 1_024 }),
            start_time: Type.Optional(Type.String()),
            end_time: Type.Optional(Type.String()),
            sort_order: Type.Optional(
              Type.Union([Type.Literal("recency"), Type.Literal("relevancy")]),
            ),
            ...PageSchema,
          },
          { additionalProperties: false },
        ),
        ...(["exact", "thread", "quotes", "replies"] as const).map((operation) =>
          Type.Object(
            {
              ...CommonSchema,
              operation: Type.Literal(operation),
              id: Type.String({ minLength: 1, maxLength: 64 }),
              ...(operation === "exact" ? {} : PageSchema),
            },
            { additionalProperties: false },
          ),
        ),
        Type.Object(
          {
            ...CommonSchema,
            operation: Type.Literal("batch"),
            ids: Type.Array(Type.String({ minLength: 1, maxLength: 64 }), {
              minItems: 1,
              maxItems: 100,
              uniqueItems: true,
              description: "Exact stable X Post IDs to hydrate through the XDK batch endpoint.",
            }),
          },
          { additionalProperties: false },
        ),
        Type.Object(
          {
            ...CommonSchema,
            operation: Type.Literal("format_media"),
            post_ids: Type.Array(Type.String({ minLength: 1, maxLength: 64 }), {
              minItems: 1,
              maxItems: 10,
              uniqueItems: true,
              description:
                "Already selected direct-X-qualified Posts only; no author or referenced-Post expansion.",
            }),
          },
          { additionalProperties: false },
        ),
      ]),
      execute: async (toolCallId, raw, signal) => {
        const args = raw as ToolCommon & Record<string, unknown>;
        const operation = requireString(args, "operation");
        const query = stringValue(args.query);
        const id = stringValue(args.id);
        const requestedPostIds = operation === "batch" ? args.ids : args.post_ids;
        const postIds = Array.isArray(requestedPostIds)
          ? requestedPostIds.filter((value): value is string => typeof value === "string")
          : [];
        const page = pageArgs(args);
        const requestedPostLimit = ["recent", "archive", "thread", "quotes", "replies"].includes(
          operation,
        )
          ? page.maxResults
          : operation === "exact"
            ? 1
            : postIds.length;
        const envelope = responseEnvelope({
          requests: 1,
          posts: requestedPostLimit,
          users: 0,
          media: operation === "format_media" ? requestedPostLimit * 4 : 0,
        });
        const common = {
          ...page,
          signal,
          maxResponseBytes: envelope.maxSerializedBytes,
          startTime: stringValue(args.start_time),
          endTime: stringValue(args.end_time),
          sortOrder: args.sort_order as "recency" | "relevancy" | undefined,
          tweetFields: POST_CORE_FIELDS,
        };
        const invoke = () => {
          switch (operation) {
            case "recent":
              if ((query?.length ?? 0) > 512) {
                throw new XTransportError("bad_request");
              }
              return getTransport().posts.recent({ ...common, query: query ?? "" });
            case "archive":
              return getTransport().posts.archive({ ...common, query: query ?? "" });
            case "exact":
              return getTransport().posts.exact({ ...common, id: id ?? "" });
            case "batch":
              return getTransport().posts.batch({ ...common, ids: postIds });
            case "format_media":
              return getTransport().posts.batch({
                ...common,
                ids: postIds,
                expansions: FORMAT_MEDIA_EXPANSIONS,
                mediaFields: MEDIA_FIELDS,
              });
            case "thread":
              return getTransport().posts.thread({ ...common, id: id ?? "" });
            case "quotes":
              return getTransport().posts.quotes({ ...common, id: id ?? "" });
            case "replies":
              return getTransport().posts.replies({ ...common, id: id ?? "" });
            default:
              throw new XTransportError("bad_request");
          }
        };
        return execute("x_posts", operation, args, toolCallId, invoke, {
          subjectKind: query ? "query" : id ? "post" : "resource",
          subjectIds: postIds.length > 0 ? postIds : id ? [id] : [],
          queryText: query,
          pageSize: ["recent", "archive", "thread", "quotes", "replies"].includes(operation)
            ? page.maxResults
            : undefined,
          profile: operation === "format_media" ? "format_media_v1" : "post_core_v1",
          ...envelope,
        });
      },
    },
    {
      name: "x_counts",
      label: "X Counts",
      description:
        "Read equivalent-window X post counts for a focused query. Use matching query families, granularity, and windows for comparisons.",
      parameters: Type.Object(
        {
          ...CommonSchema,
          operation: Type.Union([Type.Literal("recent"), Type.Literal("all")]),
          query: Type.String({ minLength: 1, maxLength: 1_024 }),
          start_time: Type.Optional(Type.String()),
          end_time: Type.Optional(Type.String()),
          granularity: Type.Optional(
            Type.Union([Type.Literal("minute"), Type.Literal("hour"), Type.Literal("day")]),
          ),
          pagination_token: Type.Optional(Type.String({ minLength: 1, maxLength: 1_024 })),
        },
        { additionalProperties: false },
      ),
      execute: async (toolCallId, raw, signal) => {
        const args = raw as ToolCommon & Record<string, unknown>;
        const operation = requireString(args, "operation");
        const query = requireString(args, "query");
        const envelope = responseEnvelope({ requests: 1, counts: 1, posts: 0, users: 0, media: 0 });
        const input = {
          query,
          signal,
          maxResponseBytes: envelope.maxSerializedBytes,
          startTime: stringValue(args.start_time),
          endTime: stringValue(args.end_time),
          granularity: args.granularity as "minute" | "hour" | "day" | undefined,
          paginationToken: stringValue(args.pagination_token),
        };
        return execute(
          "x_counts",
          operation,
          args,
          toolCallId,
          () =>
            operation === "recent"
              ? getTransport().counts.recent(input)
              : operation === "all"
                ? getTransport().counts.all(input)
                : Promise.reject(new XTransportError("bad_request")),
          { subjectKind: "query", queryText: query, profile: "count_v1", ...envelope },
        );
      },
    },
    {
      name: "x_users",
      label: "X Users",
      description:
        "Discover X accounts, resolve stable identity, or inspect bounded follower/following relationships. Resolve candidates to stable IDs before qualification.",
      parameters: Type.Union([
        Type.Object(
          {
            ...CommonSchema,
            operation: Type.Literal("search"),
            query: Type.String({
              minLength: 1,
              maxLength: 50,
              description: "Name, username, or profile-bio keywords; not a post-search query.",
            }),
            ...PageSchema,
          },
          { additionalProperties: false },
        ),
        Type.Object(
          {
            ...CommonSchema,
            operation: Type.Literal("identity"),
            id: Type.String({ minLength: 1, maxLength: 64 }),
          },
          { additionalProperties: false },
        ),
        Type.Object(
          {
            ...CommonSchema,
            operation: Type.Literal("identity"),
            username: Type.String({ minLength: 1, maxLength: 64 }),
          },
          { additionalProperties: false },
        ),
        Type.Object(
          {
            ...CommonSchema,
            operation: Type.Literal("identity"),
            ids: Type.Array(Type.String({ minLength: 1, maxLength: 64 }), {
              minItems: 1,
              maxItems: 100,
              uniqueItems: true,
            }),
          },
          { additionalProperties: false },
        ),
        Type.Object(
          {
            ...CommonSchema,
            operation: Type.Literal("identity"),
            usernames: Type.Array(Type.String({ minLength: 1, maxLength: 64 }), {
              minItems: 1,
              maxItems: 100,
              uniqueItems: true,
            }),
          },
          { additionalProperties: false },
        ),
        Type.Object(
          {
            ...CommonSchema,
            operation: Type.Literal("followers"),
            id: Type.String({ minLength: 1, maxLength: 64 }),
            ...PageSchema,
          },
          { additionalProperties: false },
        ),
        Type.Object(
          {
            ...CommonSchema,
            operation: Type.Literal("following"),
            id: Type.String({ minLength: 1, maxLength: 64 }),
            ...PageSchema,
          },
          { additionalProperties: false },
        ),
      ]),
      execute: async (toolCallId, raw, signal) => {
        const args = raw as ToolCommon & Record<string, unknown>;
        const operation = requireString(args, "operation");
        const query = stringValue(args.query);
        const id = stringValue(args.id);
        const username = stringValue(args.username);
        const ids = Array.isArray(args.ids)
          ? args.ids.filter((value): value is string => typeof value === "string")
          : [];
        const usernames = Array.isArray(args.usernames)
          ? args.usernames.filter((value): value is string => typeof value === "string")
          : [];
        const page = pageArgs(args);
        const requestedUserLimit =
          operation === "identity" ? Math.max(ids.length, usernames.length, 1) : page.maxResults;
        const envelope = responseEnvelope({
          requests: 1,
          posts: 0,
          users: requestedUserLimit,
          media: 0,
        });
        const common = {
          ...page,
          signal,
          maxResponseBytes: envelope.maxSerializedBytes,
          userFields: USER_IDENTITY_FIELDS,
        };
        const invoke = () => {
          switch (operation) {
            case "search":
              return getTransport().users.search({ ...common, query: query ?? "" });
            case "identity":
              return ids.length > 0 || usernames.length > 0
                ? getTransport().users.identityBatch({
                    ...common,
                    ...(ids.length > 0 ? { ids } : { usernames }),
                  })
                : getTransport().users.identity({ ...common, id, username });
            case "followers":
              return getTransport().users.followers({ ...common, id: id ?? "" });
            case "following":
              return getTransport().users.following({ ...common, id: id ?? "" });
            default:
              throw new XTransportError("bad_request");
          }
        };
        return execute("x_users", operation, args, toolCallId, invoke, {
          subjectKind: "profile",
          subjectIds: ids.length > 0 ? ids : id ? [id] : [],
          queryText: query ?? username ?? (usernames.length > 0 ? usernames.join(",") : undefined),
          pageSize: ["search", "followers", "following"].includes(operation)
            ? page.maxResults
            : undefined,
          profile: "user_identity_v1",
          ...envelope,
        });
      },
    },
    {
      name: "x_timelines",
      label: "X Timelines",
      description:
        "Read a bounded authored-post panel for one stable X user ID. Use authored for public analysis; reverse_chronological may require user-context entitlement.",
      parameters: Type.Object(
        {
          ...CommonSchema,
          operation: Type.Union([Type.Literal("authored"), Type.Literal("reverse_chronological")]),
          user_id: Type.String({ minLength: 1, maxLength: 64 }),
          start_time: Type.Optional(Type.String()),
          end_time: Type.Optional(Type.String()),
          ...TimelinePageSchema,
        },
        { additionalProperties: false },
      ),
      execute: async (toolCallId, raw, signal) => {
        const args = raw as ToolCommon & Record<string, unknown>;
        const operation = requireString(args, "operation");
        const id = requireString(args, "user_id");
        const page = pageArgs(args);
        const envelope = responseEnvelope({
          requests: 1,
          posts: page.maxResults,
          users: 0,
          media: 0,
        });
        const input = {
          ...page,
          id,
          signal,
          maxResponseBytes: envelope.maxSerializedBytes,
          startTime: stringValue(args.start_time),
          endTime: stringValue(args.end_time),
          tweetFields: POST_CORE_FIELDS,
        };
        return execute(
          "x_timelines",
          operation,
          args,
          toolCallId,
          () =>
            operation === "authored"
              ? getTransport().timelines.authored(input)
              : operation === "reverse_chronological"
                ? getTransport().timelines.reverseChronological(input)
                : Promise.reject(new XTransportError("bad_request")),
          {
            subjectKind: "profile",
            subjectIds: [id],
            pageSize: page.maxResults,
            profile: "post_core_v1",
            ...envelope,
          },
        );
      },
    },
    {
      name: "x_trends",
      label: "X Trends",
      description:
        "Read current candidate trends by location or, when user-context entitlement exists, personalized trends. Treat trends as discovery candidates requiring relevance and count checks.",
      parameters: Type.Object(
        {
          ...CommonSchema,
          operation: Type.Union([Type.Literal("by_location"), Type.Literal("personalized")]),
          woeid: Type.Optional(Type.Integer({ minimum: 1 })),
          max_results: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 25 })),
        },
        { additionalProperties: false },
      ),
      execute: async (toolCallId, raw, signal) => {
        const args = raw as ToolCommon & Record<string, unknown>;
        const operation = requireString(args, "operation");
        const maxResults = typeof args.max_results === "number" ? args.max_results : 25;
        const woeid = typeof args.woeid === "number" ? args.woeid : undefined;
        const invoke = () =>
          operation === "by_location" && woeid
            ? getTransport().trends.byLocation({
                woeid,
                maxResults,
                signal,
                trendFields: ["trend_name", "tweet_count"],
              })
            : operation === "personalized"
              ? getTransport().trends.personalized({
                  signal,
                  trendFields: ["category", "post_count", "trend_name", "trending_since"],
                })
              : Promise.reject(new XTransportError("bad_request"));
        return execute("x_trends", operation, args, toolCallId, invoke, {
          subjectKind: "resource",
          subjectIds: woeid ? [String(woeid)] : [],
          pageSize: maxResults,
        });
      },
    },
    {
      name: "x_metrics",
      label: "X Metrics",
      description:
        "Read public post metrics, separately authorized owned analytics for an exact time window, or bounded project usage. Public credentials are never substituted for owned-account authorization.",
      parameters: Type.Union([
        Type.Object(
          {
            ...CommonSchema,
            operation: Type.Literal("public"),
            post_ids: Type.Array(Type.String({ minLength: 1, maxLength: 64 }), {
              minItems: 1,
              maxItems: 100,
              uniqueItems: true,
            }),
          },
          { additionalProperties: false },
        ),
        Type.Object(
          {
            ...CommonSchema,
            operation: Type.Literal("owned"),
            post_ids: Type.Array(Type.String({ minLength: 1, maxLength: 64 }), {
              minItems: 1,
              maxItems: 100,
              uniqueItems: true,
            }),
            start_time: Type.String({
              minLength: 1,
              description: "Inclusive ISO-8601 start of the owned analytics window.",
            }),
            end_time: Type.String({
              minLength: 1,
              description:
                "Exclusive ISO-8601 end of the owned analytics window (maximum 30 days).",
            }),
            granularity: Type.Optional(
              Type.Union([
                Type.Literal("hourly"),
                Type.Literal("daily"),
                Type.Literal("weekly"),
                Type.Literal("total"),
              ]),
            ),
            metric_names: Type.Array(OWNED_METRIC_FIELD_SCHEMA, {
              minItems: 1,
              maxItems: 50,
              description: "Owned-account analytics metrics requested from X.",
            }),
          },
          { additionalProperties: false },
        ),
        Type.Object(
          {
            ...CommonSchema,
            operation: Type.Literal("usage"),
            days: Type.Optional(Type.Integer({ minimum: 1, maximum: 90, default: 7 })),
          },
          { additionalProperties: false },
        ),
      ]),
      execute: async (toolCallId, raw, signal) => {
        const args = raw as ToolCommon & Record<string, unknown>;
        const operation = requireString(args, "operation");
        const ids = Array.isArray(args.post_ids)
          ? args.post_ids.filter((id): id is string => typeof id === "string")
          : [];
        const envelope = responseEnvelope({
          requests: operation === "owned" ? 3 : 1,
          posts: operation === "usage" ? 0 : ids.length,
          users: operation === "owned" ? 1 : 0,
          media: 0,
        });
        const ownedInput =
          operation === "owned"
            ? ownedMetricsInput(args, signal, envelope.maxSerializedBytes)
            : undefined;
        const invoke = () =>
          operation === "usage"
            ? getTransport().metrics.usage({
                days: typeof args.days === "number" ? args.days : 7,
                signal,
              })
            : operation === "public" && ids.length > 0
              ? getTransport().metrics.public({
                  ids,
                  signal,
                  maxResponseBytes: envelope.maxSerializedBytes,
                })
              : operation === "owned"
                ? getTransport().metrics.owned(ownedInput!)
                : Promise.reject(new XTransportError("bad_request"));
        return execute("x_metrics", operation, args, toolCallId, invoke, {
          subjectKind: operation === "usage" ? "resource" : "post",
          subjectIds: ids,
          ...(operation === "usage" ? {} : envelope),
        });
      },
    },
  ];
}
