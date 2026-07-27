// Xai plugin module implements x search behavior.
import {
  jsonResult,
  readCache,
  readStringArrayParam,
  readStringParam,
  resolveCacheTtlMs,
  writeCache,
} from "openclaw/plugin-sdk/provider-web-search";
import { getRuntimeConfigSnapshot } from "openclaw/plugin-sdk/runtime-config-snapshot";
import {
  isXSearchToolEnabled,
  resolveXSearchToolApiKey,
  type XaiToolAuthContext,
} from "./src/tool-auth-shared.js";
import {
  resolveEffectiveXSearchConfig,
  resolveXSearchToolProvider,
} from "./src/x-search-config.js";
import {
  buildXaiXSearchPayload,
  requestXaiXSearch,
  resolveOpenRouterXSearchMaxTotalResults,
  resolveXaiXSearchEndpoint,
  resolveXaiXSearchInlineCitations,
  resolveXaiXSearchMaxTurns,
  resolveXaiXSearchModel,
  resolveXaiXSearchServiceTier,
  type XaiXSearchOptions,
} from "./src/x-search-shared.js";
import {
  buildMissingXSearchApiKeyPayload,
  createXSearchToolDefinition,
  X_SEARCH_HANDLE_LIMIT,
} from "./x-search-tool-shared.js";

class PluginToolInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolInputError";
  }
}

const X_SEARCH_CACHE_KEY = Symbol.for("openclaw.xai.x-search.cache");

type XSearchCacheEntry = {
  expiresAt: number;
  insertedAt: number;
  value: Record<string, unknown>;
};

function getSharedXSearchCache(): Map<string, XSearchCacheEntry> {
  const root = globalThis as Record<PropertyKey, unknown>;
  const existing = root[X_SEARCH_CACHE_KEY];
  if (existing instanceof Map) {
    return existing as Map<string, XSearchCacheEntry>;
  }
  const next = new Map<string, XSearchCacheEntry>();
  root[X_SEARCH_CACHE_KEY] = next;
  return next;
}

const X_SEARCH_CACHE = getSharedXSearchCache();
const X_SEARCH_MAX_HANDLES = 20;

function resolveXSearchConfig(cfg?: unknown): Record<string, unknown> | undefined {
  return resolveEffectiveXSearchConfig(cfg as never);
}

function resolveXSearchEnabled(params: {
  cfg?: unknown;
  config?: Record<string, unknown>;
  runtimeConfig?: unknown;
  auth?: XaiToolAuthContext;
}): boolean {
  return isXSearchToolEnabled({
    provider: resolveXSearchToolProvider(params.config),
    enabled: params.config?.enabled as boolean | undefined,
    runtimeConfig: params.runtimeConfig as never,
    sourceConfig: params.cfg as never,
    auth: params.auth,
  });
}

async function resolveXSearchApiKey(params: {
  provider: "xai" | "openrouter";
  sourceConfig?: unknown;
  runtimeConfig?: unknown;
  auth?: XaiToolAuthContext;
}): Promise<string | undefined> {
  return await resolveXSearchToolApiKey(params as never);
}

function normalizeOptionalIsoDate(value: string | undefined, label: string): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new PluginToolInputError(`${label} must use YYYY-MM-DD`);
  }
  const [yearText, monthText, dayText] = trimmed.split("-");
  if (yearText === undefined || monthText === undefined || dayText === undefined) {
    throw new PluginToolInputError(`${label} must use YYYY-MM-DD`);
  }
  const year = Number.parseInt(yearText, 10);
  const month = Number.parseInt(monthText, 10);
  const day = Number.parseInt(dayText, 10);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new PluginToolInputError(`${label} must be a valid calendar date`);
  }
  return trimmed;
}

function validateXSearchHandleFilters(params: {
  allowedXHandles?: string[];
  excludedXHandles?: string[];
}): void {
  if (params.allowedXHandles && params.excludedXHandles) {
    throw new PluginToolInputError(
      "allowed_x_handles and excluded_x_handles cannot be used together",
    );
  }
  for (const [label, handles] of [
    ["allowed_x_handles", params.allowedXHandles],
    ["excluded_x_handles", params.excludedXHandles],
  ] as const) {
    if (handles && handles.length > X_SEARCH_HANDLE_LIMIT) {
      throw new PluginToolInputError(
        `${label} cannot contain more than ${X_SEARCH_HANDLE_LIMIT} handles`,
      );
    }
  }
}

function buildXSearchCacheKey(params: {
  provider: "xai" | "openrouter";
  query: string;
  model: string;
  endpoint: string;
  inlineCitations: boolean;
  maxTurns?: number;
  maxTotalResults?: number;
  serviceTier?: "default" | "priority";
  options: Omit<XaiXSearchOptions, "query">;
}) {
  return JSON.stringify([
    "x_search",
    params.provider,
    params.model,
    params.endpoint,
    params.query,
    params.inlineCitations,
    params.maxTurns ?? null,
    params.maxTotalResults ?? null,
    params.serviceTier ?? null,
    params.options.allowedXHandles ?? null,
    params.options.excludedXHandles ?? null,
    params.options.fromDate ?? null,
    params.options.toDate ?? null,
    params.options.enableImageUnderstanding ?? false,
    params.options.enableVideoUnderstanding ?? false,
  ]);
}

export function createXSearchTool(options?: {
  config?: unknown;
  runtimeConfig?: Record<string, unknown> | null;
  auth?: XaiToolAuthContext;
}) {
  const xSearchConfig = resolveXSearchConfig(options?.config);
  const runtimeConfig = options?.runtimeConfig ?? getRuntimeConfigSnapshot();
  if (
    !resolveXSearchEnabled({
      cfg: options?.config,
      config: xSearchConfig,
      runtimeConfig: runtimeConfig ?? undefined,
      auth: options?.auth,
    })
  ) {
    return null;
  }

  return createXSearchToolDefinition(
    async (_toolCallId: string, args: Record<string, unknown>, signal?: AbortSignal) => {
      const provider = resolveXSearchToolProvider(xSearchConfig);
      const apiKey = await resolveXSearchApiKey({
        provider,
        sourceConfig: options?.config,
        runtimeConfig: runtimeConfig ?? undefined,
        auth: options?.auth,
      });
      if (!apiKey) {
        return jsonResult(buildMissingXSearchApiKeyPayload(provider));
      }

      const query = readStringParam(args, "query", { required: true });
      const allowedXHandles = readStringArrayParam(args, "allowed_x_handles");
      const excludedXHandles = readStringArrayParam(args, "excluded_x_handles");
      validateXSearchHandleFilters({ allowedXHandles, excludedXHandles });
      const fromDate = normalizeOptionalIsoDate(readStringParam(args, "from_date"), "from_date");
      const toDate = normalizeOptionalIsoDate(readStringParam(args, "to_date"), "to_date");
      if (fromDate && toDate && fromDate > toDate) {
        throw new PluginToolInputError("from_date must be on or before to_date");
      }
      if (allowedXHandles?.length && excludedXHandles?.length) {
        throw new PluginToolInputError(
          "allowed_x_handles and excluded_x_handles cannot be used together",
        );
      }
      if (allowedXHandles && allowedXHandles.length > X_SEARCH_MAX_HANDLES) {
        throw new PluginToolInputError(
          `allowed_x_handles supports at most ${X_SEARCH_MAX_HANDLES} handles`,
        );
      }
      if (excludedXHandles && excludedXHandles.length > X_SEARCH_MAX_HANDLES) {
        throw new PluginToolInputError(
          `excluded_x_handles supports at most ${X_SEARCH_MAX_HANDLES} handles`,
        );
      }

      const xSearchOptions: XaiXSearchOptions = {
        query,
        allowedXHandles,
        excludedXHandles,
        fromDate,
        toDate,
        enableImageUnderstanding: args.enable_image_understanding === true,
        enableVideoUnderstanding: args.enable_video_understanding === true,
      };
      const xSearchConfigRecord = xSearchConfig;
      const model = resolveXaiXSearchModel(xSearchConfigRecord, provider);
      const endpoint = resolveXaiXSearchEndpoint(xSearchConfigRecord, provider);
      const inlineCitations = resolveXaiXSearchInlineCitations(xSearchConfigRecord);
      const maxTurns =
        provider === "xai" ? resolveXaiXSearchMaxTurns(xSearchConfigRecord) : undefined;
      const serviceTier =
        provider === "xai" ? resolveXaiXSearchServiceTier(xSearchConfigRecord) : undefined;
      const maxTotalResults =
        provider === "openrouter"
          ? resolveOpenRouterXSearchMaxTotalResults(xSearchConfigRecord)
          : undefined;
      const cacheKey = buildXSearchCacheKey({
        provider,
        query,
        model,
        endpoint,
        inlineCitations,
        maxTurns,
        maxTotalResults,
        serviceTier,
        options: {
          allowedXHandles,
          excludedXHandles,
          fromDate,
          toDate,
          enableImageUnderstanding: xSearchOptions.enableImageUnderstanding,
          enableVideoUnderstanding: xSearchOptions.enableVideoUnderstanding,
        },
      });
      const cached = readCache(X_SEARCH_CACHE, cacheKey);
      if (cached) {
        return jsonResult(Object.assign({}, cached.value, { cached: true, cacheStatus: "hit" }));
      }

      const startedAt = Date.now();
      const result = await requestXaiXSearch({
        provider,
        apiKey,
        endpoint,
        model,
        inlineCitations,
        maxTurns,
        maxTotalResults,
        serviceTier,
        signal,
        options: xSearchOptions,
      });
      const payload = buildXaiXSearchPayload({
        provider,
        query,
        model,
        tookMs: Date.now() - startedAt,
        content: result.content,
        result,
        options: xSearchOptions,
        serviceTier,
      });
      payload.cacheStatus = "miss";
      writeCache(
        X_SEARCH_CACHE,
        cacheKey,
        payload,
        resolveCacheTtlMs(xSearchConfig?.cacheTtlMinutes, 15),
      );
      return jsonResult(payload);
    },
  );
}
