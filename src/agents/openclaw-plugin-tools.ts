/**
 * OpenClaw plugin tool resolver.
 *
 * This module builds runtime plugin tools from config/options, delivery context,
 * auth profiles, and the current runtime config snapshot.
 */
import { selectApplicableRuntimeConfig } from "../config/config.js";
import {
  getRuntimeConfigSnapshot,
  getRuntimeConfigSourceSnapshot,
} from "../config/runtime-snapshot.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { resolvePluginTools } from "../plugins/tools.js";
import { normalizeDeliveryContext } from "../utils/delivery-context.js";
import { resolveAuthProfileOrder } from "./auth-profiles.js";
import type { AuthProfileStore } from "./auth-profiles/types.js";
import {
  hasRuntimeAvailableProviderAuth,
  resolveApiKeyForProvider as resolveProviderApiKey,
} from "./model-auth.js";
import {
  resolveOpenClawPluginToolInputs,
  type OpenClawPluginToolOptions,
} from "./openclaw-tools.plugin-context.js";
import { applyPluginToolDeliveryDefaults } from "./plugin-tool-delivery-defaults.js";
import type { AnyAgentTool } from "./tools/common.js";

type ResolveOpenClawPluginToolsOptions = OpenClawPluginToolOptions & {
  pluginToolAllowlist?: string[];
  pluginToolDenylist?: string[];
  currentChannelId?: string;
  currentThreadTs?: string;
  currentMessageId?: string | number;
  sandboxRoot?: string;
  modelHasVision?: boolean;
  modelProvider?: string;
  modelId?: string;
  allowMediaInvokeCommands?: boolean;
  requesterAgentIdOverride?: string;
  requireExplicitMessageTarget?: boolean;
  disableMessageTool?: boolean;
  disablePluginTools?: boolean;
  authProfileStore?: AuthProfileStore;
};

function resolveApplicablePluginRuntimeConfig(
  inputConfig?: OpenClawConfig,
): OpenClawConfig | undefined {
  const runtimeConfig = getRuntimeConfigSnapshot() ?? undefined;
  if (!runtimeConfig) {
    return inputConfig;
  }
  if (!inputConfig || inputConfig === runtimeConfig) {
    return runtimeConfig;
  }
  const runtimeSourceConfig = getRuntimeConfigSourceSnapshot() ?? undefined;
  if (!runtimeSourceConfig) {
    return inputConfig;
  }
  return selectApplicableRuntimeConfig({
    inputConfig,
    runtimeConfig,
    runtimeSourceConfig,
  });
}

/** Resolves plugin tools for an agent run and applies delivery-context defaults. */
export function resolveOpenClawPluginToolsForOptions(params: {
  options?: ResolveOpenClawPluginToolsOptions;
  resolvedConfig?: OpenClawConfig;
  existingToolNames?: Set<string>;
}): AnyAgentTool[] {
  if (params.options?.disablePluginTools) {
    return [];
  }

  const deliveryContext = normalizeDeliveryContext({
    channel: params.options?.agentChannel,
    to: params.options?.agentTo,
    accountId: params.options?.agentAccountId,
    threadId: params.options?.agentThreadId,
  });

  const resolveCurrentRuntimeConfig = () => {
    // Re-resolve on demand so auth/profile lookups see the active runtime config
    // while tests can still inject a fixed resolvedConfig.
    return resolveApplicablePluginRuntimeConfig(params.resolvedConfig ?? params.options?.config);
  };
  const authProfileStore = params.options?.authProfileStore;
  const resolveAuthProfileIdsForProvider = authProfileStore
    ? (providerId: string): string[] =>
        resolveAuthProfileOrder({
          cfg: resolveCurrentRuntimeConfig(),
          store: authProfileStore,
          provider: providerId,
        })
    : undefined;
  const hasAuthForProvider = (providerId: string): boolean => {
    if ((resolveAuthProfileIdsForProvider?.(providerId) ?? []).length > 0) {
      return true;
    }
    return hasRuntimeAvailableProviderAuth({
      provider: providerId,
      cfg: resolveCurrentRuntimeConfig(),
      workspaceDir: params.options?.workspaceDir,
    });
  };
  const resolveApiKeyForProvider = async (providerId: string): Promise<string | undefined> => {
    const resolved = await resolveProviderApiKey({
      provider: providerId,
      cfg: resolveCurrentRuntimeConfig(),
      store: authProfileStore,
      agentDir: params.options?.agentDir,
      workspaceDir: params.options?.workspaceDir,
    });
    return resolved.apiKey;
  };
  const pluginToolInputs = resolveOpenClawPluginToolInputs({
    options: params.options,
    resolvedConfig: params.resolvedConfig,
    runtimeConfig: resolveCurrentRuntimeConfig(),
    getRuntimeConfig: resolveCurrentRuntimeConfig,
  });
  const pluginTools = resolvePluginTools({
    ...pluginToolInputs,
    context: {
      ...pluginToolInputs.context,
      hasAuthForProvider,
      resolveApiKeyForProvider,
    },
    existingToolNames: params.existingToolNames ?? new Set<string>(),
    toolAllowlist: params.options?.pluginToolAllowlist,
    toolDenylist: params.options?.pluginToolDenylist,
    allowGatewaySubagentBinding: params.options?.allowGatewaySubagentBinding,
    hasAuthForProvider,
  });

  return applyPluginToolDeliveryDefaults({
    tools: pluginTools,
    deliveryContext,
  });
}
