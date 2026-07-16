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
import { createEpisodeRequestBudget, type XEpisodeBudgetLimits } from "./resource-budget.js";
import {
  createXReadTransport,
  X_USER_SEARCH_QUERY_PATTERN,
  XTransportError,
  type XJson,
  type XReadResult,
} from "./transport.js";

const TOOL_VERSION = "x-intelligence.v1";
const MAX_MODEL_RESULT_BYTES = 48 * 1024;
const MAX_CACHE_ENTRIES = 25_000;

const POST_FIELDS = [
  "id",
  "text",
  "author_id",
  "conversation_id",
  "created_at",
  "lang",
  "public_metrics",
  "referenced_tweets",
  "entities",
  "attachments",
  "possibly_sensitive",
  "edit_history_tweet_ids",
];
const USER_FIELDS = [
  "id",
  "name",
  "username",
  "description",
  "created_at",
  "public_metrics",
  "verified",
  "verified_type",
  "profile_image_url",
  "url",
];
const MEDIA_FIELDS = [
  "media_key",
  "type",
  "url",
  "preview_image_url",
  "width",
  "height",
  "duration_ms",
  "public_metrics",
];
const EXPANSIONS = [
  "author_id",
  "attachments.media_keys",
  "referenced_tweets.id",
  "referenced_tweets.id.author_id",
];
const USER_EXPANSIONS = ["pinned_tweet_id"];

const PURPOSES = [
  "question_research",
  "topic_pulse",
  "influence_map",
  "format_study",
  "source_verification",
  "owned_performance",
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
};
const PageSchema = {
  max_results: Type.Optional(Type.Integer({ minimum: 10, maximum: 100, default: 25 })),
  pagination_token: Type.Optional(Type.String({ minLength: 1, maxLength: 1024 })),
};

export type XIntelligencePluginConfig = {
  enabled?: boolean;
  apiKey?: SecretInput;
  ownedMetricsApiKey?: SecretInput;
  timeoutSeconds?: number;
  cacheTtlMinutes?: number;
  episodeBudgets?: XEpisodeBudgetLimits;
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
  budget: ReturnType<typeof createEpisodeRequestBudget>;
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
    budget: createEpisodeRequestBudget({
      store: api.runtime.state.openKeyedStore({
        namespace: "x-episode-request-budget-v1",
        maxEntries: MAX_CACHE_ENTRIES,
      }),
      limits: config.episodeBudgets,
    }),
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

async function writeManifest(params: {
  execution: ExecuteParams;
  result?: XReadResult;
  durationMs: number;
  error?: { code: string; category?: string; retryable?: boolean };
  requestCount?: number;
}) {
  const { execution, result } = params;
  const evidence = result
    ? evidenceFrom(result.data, execution.toolName)
    : { ids: [], urls: [], hashes: [], publicMetrics: {}, objects: [] };
  const sessionDigest = execution.ctx.sessionKey ? sha256(execution.ctx.sessionKey) : undefined;
  // Provider tool-call ids are opaque and may contain characters that are not
  // valid artifact identifiers. Keep correlation without persisting provider
  // syntax into the evidence contract.
  const manifestToolCallId = `toolcall:${sha256(execution.toolCallId)}`;
  return await writeAcquisitionManifest({
    workspaceDir:
      execution.ctx.workspaceDir ??
      process.env.OPENCLAW_WORKSPACE ??
      process.env.OPENCLAW_WORKSPACE_DIR,
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
        filters: manifestFilters(execution.args),
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
        requests: params.requestCount ?? (result ? providerRequestCount(result) : 0),
        ...(result ? { bytes: Buffer.byteLength(JSON.stringify(result.data), "utf8") } : {}),
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
  const budget = await params.runtime.budget.reserve({
    sessionKey: params.ctx.sessionKey ?? `tool-call:${params.toolCallId}`,
    purpose: params.args.purpose,
  });
  if (!budget.allowed) {
    const artifact = await writeManifest({
      execution: params,
      durationMs: Date.now() - startedAt,
      error: { code: "episode_budget_exhausted", category: "budget", retryable: false },
      requestCount: 0,
    });
    return {
      status: "partial",
      verdict: "no_decision",
      tool: params.toolName,
      operation: params.operation,
      purpose: params.args.purpose,
      method_version: params.args.method_version ?? "x-research-method.v1",
      error: { code: "episode_budget_exhausted" },
      evidence: { ref: artifact.ref, digest: artifact.digest, created: artifact.created },
      budget,
      resources: { requests: 0, duration_ms: Date.now() - startedAt },
      cost: { status: "not_incurred" },
    };
  }
  let requestCount = 0;
  try {
    const result = await params.invoke();
    requestCount = providerRequestCount(result);
    const evidence = evidenceFrom(result.data, params.toolName);
    const cacheKeys = await cacheSourceObjects(params.runtime.cache, evidence.objects);
    const artifact = await writeManifest({
      execution: params,
      result,
      durationMs: Date.now() - startedAt,
      requestCount,
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
      observationWindow:
        params.toolName === "x_metrics" && params.operation === "owned"
          ? params.args.granularity === "hourly"
            ? "1h"
            : params.args.granularity === "daily"
              ? "24h"
              : params.args.granularity === "weekly"
                ? "7d"
                : "custom"
          : undefined,
      distribution:
        params.toolName === "x_metrics" && params.operation === "owned" ? "combined" : undefined,
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
      resources: { requests: requestCount, duration_ms: Date.now() - startedAt },
      cost: { status: "provider_not_reported" },
      budget,
    };
  } catch (error) {
    const transport = error instanceof XTransportError ? error : undefined;
    requestCount = transport?.requestCount ?? requestCount;
    const code =
      transport?.kind ??
      (error && typeof error === "object" && "code" in error && typeof error.code === "string"
        ? error.code
        : "x_source_operation_failed");
    const artifact = await writeManifest({
      execution: params,
      durationMs: Date.now() - startedAt,
      error: {
        code,
        category: transport?.category ?? "runtime",
        retryable: transport
          ? ["rate_limited", "server", "timeout", "network"].includes(transport.kind)
          : false,
      },
      requestCount,
    });
    return {
      status: "failed",
      tool: params.toolName,
      operation: params.operation,
      purpose: params.args.purpose,
      method_version: params.args.method_version ?? "x-research-method.v1",
      error: {
        code,
        category: transport?.category ?? "runtime",
        ...(transport?.receipt ? { provider_status: transport.receipt.status } : {}),
      },
      evidence: { ref: artifact.ref, digest: artifact.digest, created: artifact.created },
      resources: { requests: requestCount, duration_ms: Date.now() - startedAt },
      cost: { status: "provider_not_reported" },
      budget,
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
    options: Pick<ExecuteParams, "subjectKind" | "subjectIds" | "queryText" | "pageSize">,
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
        ...options,
      }),
    );

  return [
    {
      name: "x_posts",
      label: "X Posts",
      description:
        "Read bounded recent/archive X posts or hydrate one post, conversation, quote set, or reply set. Use focused queries and continuation tokens rather than broad post dumps.",
      parameters: Type.Object(
        {
          ...CommonSchema,
          operation: Type.Union([
            Type.Literal("recent"),
            Type.Literal("archive"),
            Type.Literal("exact"),
            Type.Literal("thread"),
            Type.Literal("quotes"),
            Type.Literal("replies"),
          ]),
          query: Type.Optional(Type.String({ minLength: 1, maxLength: 1_024 })),
          id: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
          start_time: Type.Optional(Type.String()),
          end_time: Type.Optional(Type.String()),
          sort_order: Type.Optional(
            Type.Union([Type.Literal("recency"), Type.Literal("relevancy")]),
          ),
          ...PageSchema,
        },
        { additionalProperties: false },
      ),
      execute: async (toolCallId, raw, signal) => {
        const args = raw as ToolCommon & Record<string, unknown>;
        const operation = requireString(args, "operation");
        const query = stringValue(args.query);
        const id = stringValue(args.id);
        const page = pageArgs(args);
        const common = {
          ...page,
          signal,
          startTime: stringValue(args.start_time),
          endTime: stringValue(args.end_time),
          sortOrder: args.sort_order as "recency" | "relevancy" | undefined,
          tweetFields: POST_FIELDS,
          expansions: EXPANSIONS,
          userFields: USER_FIELDS,
          mediaFields: MEDIA_FIELDS,
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
          subjectIds: id ? [id] : [],
          queryText: query,
          pageSize: page.maxResults,
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
        const input = {
          query,
          signal,
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
          { subjectKind: "query", queryText: query },
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
              pattern: X_USER_SEARCH_QUERY_PATTERN,
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
        const page = pageArgs(args);
        const common = {
          ...page,
          signal,
          userFields: USER_FIELDS,
          expansions: USER_EXPANSIONS,
          tweetFields: POST_FIELDS,
        };
        const invoke = () => {
          switch (operation) {
            case "search":
              return getTransport().users.search({ ...common, query: query ?? "" });
            case "identity":
              return getTransport().users.identity({ ...common, id, username });
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
          subjectIds: id ? [id] : [],
          queryText: query ?? username,
          pageSize: page.maxResults,
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
          ...PageSchema,
        },
        { additionalProperties: false },
      ),
      execute: async (toolCallId, raw, signal) => {
        const args = raw as ToolCommon & Record<string, unknown>;
        const operation = requireString(args, "operation");
        const id = requireString(args, "user_id");
        const page = pageArgs(args);
        const input = {
          ...page,
          id,
          signal,
          startTime: stringValue(args.start_time),
          endTime: stringValue(args.end_time),
          tweetFields: POST_FIELDS,
          expansions: EXPANSIONS,
          userFields: USER_FIELDS,
          mediaFields: MEDIA_FIELDS,
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
          { subjectKind: "profile", subjectIds: [id], pageSize: page.maxResults },
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
            metric_names: Type.Array(Type.String({ minLength: 1, maxLength: 64 }), {
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
        const invoke = () =>
          operation === "usage"
            ? getTransport().metrics.usage({
                days: typeof args.days === "number" ? args.days : 7,
                signal,
              })
            : operation === "public" && ids.length > 0
              ? getTransport().metrics.public({ ids, signal })
              : operation === "owned" && ids.length > 0
                ? getTransport().metrics.owned({
                    tweetIds: ids,
                    signal,
                    startTime: requireString(args, "start_time"),
                    endTime: requireString(args, "end_time"),
                    granularity: stringValue(args.granularity) ?? "total",
                    requestedMetrics: Array.isArray(args.metric_names)
                      ? args.metric_names.filter((name): name is string => typeof name === "string")
                      : ["impressions", "engagements", "likes", "replies", "retweets"],
                  })
                : Promise.reject(new XTransportError("bad_request"));
        return execute("x_metrics", operation, args, toolCallId, invoke, {
          subjectKind: operation === "usage" ? "resource" : "post",
          subjectIds: ids,
        });
      },
    },
  ];
}
