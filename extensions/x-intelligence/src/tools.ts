import type {
  AnyAgentTool,
  OpenClawPluginApi,
  OpenClawPluginToolContext,
} from "openclaw/plugin-sdk/plugin-entry";
import type { SecretInput } from "openclaw/plugin-sdk/secret-input";
import { resolveStateDir } from "openclaw/plugin-sdk/state-paths";
import { createXAgencyDataAdapter } from "./agency-data-adapter.js";
import { requireOwnedMetricsCredentialAtRuntime, type OpenClawConfigSnapshot } from "./auth.js";
import { createContentCache } from "./content-cache.js";
import { createXCountsTool } from "./counts-tool.js";
import { createXMetricsTool } from "./metrics-tool.js";
import { createXPostsTool } from "./posts-tool.js";
import { createXTimelinesTool } from "./timelines-tool.js";
import { createXToolExecute, type XIntelligenceRuntime } from "./tool-execution.js";
import { createXReadTransport } from "./transport.js";
import { createXTrendsTool } from "./trends-tool.js";
import { createXUsersTool } from "./users-tool.js";

const MAX_CACHE_ENTRIES = 25_000;

export { MEDIA_FIELDS } from "./tool-shared.js";
export type { XIntelligenceRuntime };

export type XIntelligencePluginConfig = {
  enabled?: boolean;
  apiKey?: SecretInput;
  ownedMetricsApiKey?: SecretInput;
  cacheTtlMinutes?: number;
  complianceRefresh?: {
    enabled?: boolean;
    intervalMinutes?: number;
    maxIdsPerPass?: number;
  };
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
  const execute = createXToolExecute({ ctx: params.ctx, runtime });
  const builderParams = { getTransport, execute };

  return [
    createXPostsTool(builderParams),
    createXCountsTool(builderParams),
    createXUsersTool(builderParams),
    createXTimelinesTool(builderParams),
    createXTrendsTool(builderParams),
    createXMetricsTool(builderParams),
  ];
}
