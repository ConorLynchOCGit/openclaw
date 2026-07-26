/**
 * OpenClaw plugin tool resolver.
 *
 * This module builds runtime plugin tools from config/options, delivery context,
 * auth profiles, and the current runtime config snapshot.
 */
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { resolvePluginTools } from "../plugins/tools.js";
import type { AuthProfileStore } from "./auth-profiles/types.js";
import { resolveApiKeyForProvider as resolveProviderApiKey } from "./model-auth.js";
import { createNodePluginTools } from "./node-plugin-tools.js";
import {
  resolveOpenClawPluginToolInputs,
  type OpenClawPluginToolOptions,
} from "./openclaw-tools.plugin-context.js";
import { applyPluginToolDeliveryDefaults } from "./plugin-tool-delivery-defaults.js";
import { resolveAgentRuntimeToolConfig } from "./tool-runtime-config.js";
import type { AnyAgentTool } from "./tools/common.js";
import { hasProviderAuthForTool } from "./tools/model-config.helpers.js";

type ResolveOpenClawPluginToolsOptions = OpenClawPluginToolOptions & {
  pluginToolAllowlist?: string[];
  pluginToolDenylist?: string[];
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
  clientCaps?: string[];
  authProfileStore?: AuthProfileStore;
};

/** Resolves plugin tools for an agent run and applies delivery-context defaults. */
export function resolveOpenClawPluginToolsForOptions(params: {
  options?: ResolveOpenClawPluginToolsOptions;
  resolvedConfig?: OpenClawConfig;
  existingToolNames?: Set<string>;
}): AnyAgentTool[] {
  if (params.options?.disablePluginTools) {
    return [];
  }

  const resolveCurrentRuntimeConfig = () => {
    // Re-resolve on demand so auth/profile lookups see the active runtime config
    // while tests can still inject a fixed resolvedConfig.
    return resolveAgentRuntimeToolConfig(params.resolvedConfig ?? params.options?.config);
  };
  const authProfileStore = params.options?.authProfileStore;
  const hasAuthForProvider = (providerId: string): boolean =>
    hasProviderAuthForTool({
      provider: providerId,
      cfg: resolveCurrentRuntimeConfig(),
      workspaceDir: params.options?.workspaceDir,
      agentDir: params.options?.agentDir,
      authStore: authProfileStore,
    });
  const resolveApiKeyForProvider = async (providerId: string): Promise<string | undefined> =>
    (
      await resolveProviderApiKey({
        provider: providerId,
        cfg: resolveCurrentRuntimeConfig(),
        store: authProfileStore,
        agentDir: params.options?.agentDir,
        workspaceDir: params.options?.workspaceDir,
      })
    ).apiKey;
  const pluginToolInputs = resolveOpenClawPluginToolInputs({
    options: params.options,
    resolvedConfig: params.resolvedConfig,
    runtimeConfig: resolveCurrentRuntimeConfig(),
    getRuntimeConfig: resolveCurrentRuntimeConfig,
  });
  const existingToolNames = new Set(params.existingToolNames ?? []);
  const pluginTools = resolvePluginTools({
    ...pluginToolInputs,
    context: {
      ...pluginToolInputs.context,
      hasAuthForProvider,
      resolveApiKeyForProvider,
    },
    existingToolNames,
    clientCaps: params.options?.clientCaps,
    toolAllowlist: params.options?.pluginToolAllowlist,
    toolDenylist: params.options?.pluginToolDenylist,
    allowGatewaySubagentBinding: params.options?.allowGatewaySubagentBinding,
    hasAuthForProvider,
  });
  for (const tool of pluginTools) {
    existingToolNames.add(tool.name);
  }
  pluginTools.push(
    ...createNodePluginTools({
      existingToolNames,
      toolAllowlist: params.options?.pluginToolAllowlist,
      toolDenylist: params.options?.pluginToolDenylist,
      agentSessionKey: params.options?.agentSessionKey,
    }),
  );

  return applyPluginToolDeliveryDefaults({
    tools: pluginTools,
    deliveryContext: pluginToolInputs.context.deliveryContext,
  });
}
