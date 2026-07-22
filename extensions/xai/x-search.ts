// Xai plugin module implements x search behavior.
import {
  jsonResult,
  readCache,
  readStringArrayParam,
  readStringParam,
  resolveCacheTtlMs,
  resolveTimeoutSeconds,
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
  resolveXaiXSearchCacheControl,
  resolveXaiXSearchResearchPolicy,
  resolveOpenRouterXSearchMaxTotalResults,
  resolveXaiXSearchEndpoint,
  resolveXaiXSearchInlineCitations,
  resolveXaiXSearchMaxTurns,
  resolveXaiXSearchModel,
  resolveXaiXSearchServiceTier,
  XaiXSearchTerminalError,
  type XaiXSearchOptions,
} from "./src/x-search-shared.js";
import {
  buildMissingXSearchApiKeyPayload,
  createXSearchToolDefinition,
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
  let hasIsoShape = trimmed.length === 10 && trimmed[4] === "-" && trimmed[7] === "-";
  for (let index = 0; hasIsoShape && index < trimmed.length; index += 1) {
    if (index === 4 || index === 7) {
      continue;
    }
    const code = trimmed.charCodeAt(index);
    hasIsoShape = code >= 48 && code <= 57;
  }
  if (!hasIsoShape) {
    throw new PluginToolInputError(`${label} must use YYYY-MM-DD`);
  }
  const [year, month, day] = trimmed.split("-").map((entry) => Number.parseInt(entry, 10));
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

function buildXSearchCacheKey(params: {
  provider: "xai" | "openrouter";
  query: string;
  model: string;
  endpoint: string;
  inlineCitations: boolean;
  maxTurns?: number;
  maxTotalResults?: number;
  serviceTier?: "default" | "priority";
  researchPolicy?: ReturnType<typeof resolveXaiXSearchResearchPolicy>;
  cacheControl: ReturnType<typeof resolveXaiXSearchCacheControl>;
  subjectKey?: string;
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
    params.researchPolicy ?? null,
    params.cacheControl,
    params.subjectKey ?? null,
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

  return createXSearchToolDefinition(async (_toolCallId: string, args: Record<string, unknown>) => {
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
    const researchProfile = readStringParam(args, "research_profile");
    const researchStage = readStringParam(args, "research_stage");
    const subjectKey = readStringParam(args, "subject_key");
    let researchPolicy: ReturnType<typeof resolveXaiXSearchResearchPolicy>;
    try {
      researchPolicy = resolveXaiXSearchResearchPolicy({ researchProfile, researchStage });
    } catch (error) {
      throw new PluginToolInputError(error instanceof Error ? error.message : String(error));
    }
    let cacheControl: ReturnType<typeof resolveXaiXSearchCacheControl>;
    try {
      cacheControl = resolveXaiXSearchCacheControl(args.research_cache_control);
    } catch (error) {
      throw new PluginToolInputError(error instanceof Error ? error.message : String(error));
    }
    if (cacheControl.mode !== "ordinary" && !researchPolicy) {
      throw new PluginToolInputError(
        "research_cache_control requires a closed v2 research profile and stage",
      );
    }
    if (researchPolicy && cacheControl.mode === "ordinary" && !subjectKey) {
      throw new PluginToolInputError(
        "v2 research using ordinary cache requires one immutable subject_key",
      );
    }
    const xSearchConfigRecord = xSearchConfig;
    const model = resolveXaiXSearchModel(xSearchConfigRecord, provider);
    const endpoint = resolveXaiXSearchEndpoint(xSearchConfigRecord, provider);
    const inlineCitations = resolveXaiXSearchInlineCitations(xSearchConfigRecord);
    const maxTurns = resolveXaiXSearchMaxTurns(xSearchConfigRecord);
    const serviceTier = resolveXaiXSearchServiceTier(xSearchConfigRecord);
    if (researchPolicy && provider !== "openrouter") {
      throw new PluginToolInputError(
        "v2 research_profile/research_stage requires the OpenRouter xAI route with no fallback",
      );
    }
    const maxTotalResults =
      researchPolicy?.maxTotalResults ??
      resolveOpenRouterXSearchMaxTotalResults(xSearchConfigRecord);
    const cacheKey = buildXSearchCacheKey({
      provider,
      query,
      model,
      endpoint,
      inlineCitations,
      maxTurns,
      maxTotalResults,
      serviceTier,
      researchPolicy,
      cacheControl,
      subjectKey,
      options: {
        allowedXHandles,
        excludedXHandles,
        fromDate,
        toDate,
        enableImageUnderstanding: xSearchOptions.enableImageUnderstanding,
        enableVideoUnderstanding: xSearchOptions.enableVideoUnderstanding,
      },
    });
    const cacheLookupStartedAt = Date.now();
    const cached = cacheControl.mode === "bypass" ? undefined : readCache(X_SEARCH_CACHE, cacheKey);
    if (cached) {
      const providerReceipt = cached.value.providerReceipt;
      return jsonResult({
        ...cached.value,
        ...(providerReceipt &&
        typeof providerReceipt === "object" &&
        !Array.isArray(providerReceipt)
          ? {
              providerReceipt: {
                ...providerReceipt,
                dispatches: 0,
                elapsedMs: Date.now() - cacheLookupStartedAt,
                selectedEvidenceBytes: 0,
                serializedRequestBytes: 0,
                outputTokens: 0,
                providerCostUsd: 0,
                providerRequestId: "cache",
                providerResponseStatus: "cache_hit",
                observedSearchActions: {
                  responseToolCalls: 0,
                  providerWebSearchRequests: 0,
                },
                observedResults: 0,
                cache: {
                  mode: cacheControl.mode,
                  scope: cacheControl.scope,
                  status: "hit",
                  originProviderRequestId:
                    "providerRequestId" in providerReceipt &&
                    typeof providerReceipt.providerRequestId === "string"
                      ? providerReceipt.providerRequestId
                      : "unknown",
                },
              },
            }
          : {}),
        cached: true,
        cacheStatus: "hit",
        cacheScope: cacheControl.scope,
      });
    }

    const startedAt = Date.now();
    let result: Awaited<ReturnType<typeof requestXaiXSearch>>;
    try {
      result = await requestXaiXSearch({
        provider,
        apiKey,
        endpoint,
        model,
        timeoutSeconds: researchPolicy
          ? Math.ceil(researchPolicy.maxElapsedMs / 1_000)
          : resolveTimeoutSeconds(xSearchConfig?.timeoutSeconds, 30),
        inlineCitations,
        maxTurns,
        maxTotalResults,
        serviceTier,
        options: xSearchOptions,
        researchPolicy,
      });
    } catch (error) {
      if (!(error instanceof XaiXSearchTerminalError)) {
        throw error;
      }
      return jsonResult({
        status: error.receipt.status,
        error: {
          code: error.receipt.code,
          source_layer: error.receipt.sourceLayer,
          retryable: false,
          message: error.message,
        },
        providerReceipt: error.receipt,
        cacheStatus: cacheControl.mode === "bypass" ? "bypass" : "miss",
        cacheScope: cacheControl.scope,
      });
    }
    const payload = buildXaiXSearchPayload({
      provider,
      query,
      model,
      tookMs: Date.now() - startedAt,
      content: result.content,
      result,
      options: xSearchOptions,
      serviceTier,
      researchPolicy,
    });
    payload.cacheStatus = cacheControl.mode === "bypass" ? "bypass" : "miss";
    payload.cacheScope = cacheControl.scope;
    const providerReceipt = payload.providerReceipt;
    if (providerReceipt && typeof providerReceipt === "object" && !Array.isArray(providerReceipt)) {
      payload.providerReceipt = {
        ...providerReceipt,
        cache: {
          mode: cacheControl.mode,
          scope: cacheControl.scope,
          status: cacheControl.mode === "bypass" ? "bypass" : "miss",
        },
      };
    }
    if (cacheControl.mode !== "bypass") {
      writeCache(
        X_SEARCH_CACHE,
        cacheKey,
        payload,
        resolveCacheTtlMs(xSearchConfig?.cacheTtlMinutes, 15),
      );
    }
    return jsonResult(payload);
  });
}
