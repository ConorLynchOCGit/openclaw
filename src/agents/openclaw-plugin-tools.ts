import type { OpenClawConfig } from "../config/types.openclaw.js";
import { copyPluginToolMeta, getPluginToolMeta, resolvePluginTools } from "../plugins/tools.js";
import { getActiveSecretsRuntimeSnapshot } from "../secrets/runtime.js";
import { normalizeDeliveryContext } from "../utils/delivery-context.js";
import {
  resolveOpenClawPluginToolInputs,
  type OpenClawPluginToolOptions,
} from "./openclaw-tools.plugin-context.js";
import { applyPluginToolDeliveryDefaults } from "./plugin-tool-delivery-defaults.js";
import type { AnyAgentTool } from "./tools/common.js";

const LEGACY_MEMORY_TOOLS_ENABLED_ENV = "MODEL_MEMORY_LEGACY_MEMORY_TOOLS_ENABLED";
const MODEL_MEMORY_SEARCH_TOOL = "model_memory_search";
const MODEL_MEMORY_GET_TOOL = "model_memory_get";
const MEMORY_SEARCH_TOOL = "memory_search";
const MEMORY_GET_TOOL = "memory_get";
const LEGACY_MEMORY_PLUGIN_ID = "memory-core";
const MODEL_MEMORY_COMPATIBILITY_ALIASES = [
  {
    sourceName: MODEL_MEMORY_SEARCH_TOOL,
    aliasName: MEMORY_SEARCH_TOOL,
  },
  {
    sourceName: MODEL_MEMORY_GET_TOOL,
    aliasName: MEMORY_GET_TOOL,
  },
] as const;

type ResolveOpenClawPluginToolsOptions = OpenClawPluginToolOptions & {
  pluginToolAllowlist?: string[];
  currentChannelId?: string;
  currentThreadTs?: string;
  currentMessageId?: string | number;
  sandboxRoot?: string;
  modelHasVision?: boolean;
  modelProvider?: string;
  allowMediaInvokeCommands?: boolean;
  requesterAgentIdOverride?: string;
  requireExplicitMessageTarget?: boolean;
  disableMessageTool?: boolean;
  disablePluginTools?: boolean;
};

function readBooleanEnvFlag(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function cloneToolWithAliasName(params: { source: AnyAgentTool; aliasName: string }): AnyAgentTool {
  const alias: AnyAgentTool = {
    ...params.source,
    name: params.aliasName,
  };
  copyPluginToolMeta(params.source, alias);
  return alias;
}

function normalizeModelMemoryCompatibilityAliases(params: {
  tools: AnyAgentTool[];
  env?: NodeJS.ProcessEnv;
}): AnyAgentTool[] {
  if (readBooleanEnvFlag(params.env?.[LEGACY_MEMORY_TOOLS_ENABLED_ENV])) {
    return params.tools;
  }

  const toolsByName = new Map(params.tools.map((tool) => [tool.name, tool] as const));
  const nextTools = [...params.tools];

  for (const mapping of MODEL_MEMORY_COMPATIBILITY_ALIASES) {
    const source = toolsByName.get(mapping.sourceName);
    if (!source) {
      continue;
    }

    const existingAlias = toolsByName.get(mapping.aliasName);
    const existingAliasMeta = existingAlias ? getPluginToolMeta(existingAlias) : undefined;
    if (existingAlias && existingAliasMeta?.pluginId !== LEGACY_MEMORY_PLUGIN_ID) {
      continue;
    }

    if (existingAlias && existingAliasMeta?.pluginId === LEGACY_MEMORY_PLUGIN_ID) {
      const legacyIndex = nextTools.indexOf(existingAlias);
      if (legacyIndex !== -1) {
        nextTools.splice(legacyIndex, 1);
      }
    }

    const alias = cloneToolWithAliasName({
      source,
      aliasName: mapping.aliasName,
    });
    nextTools.push(alias);
    toolsByName.set(mapping.aliasName, alias);
  }

  return nextTools;
}

export function resolveOpenClawPluginToolsForOptions(params: {
  options?: ResolveOpenClawPluginToolsOptions;
  resolvedConfig?: OpenClawConfig;
  existingToolNames?: Set<string>;
}): AnyAgentTool[] {
  if (params.options?.disablePluginTools) {
    return [];
  }

  const runtimeSnapshot = getActiveSecretsRuntimeSnapshot();
  const deliveryContext = normalizeDeliveryContext({
    channel: params.options?.agentChannel,
    to: params.options?.agentTo,
    accountId: params.options?.agentAccountId,
    threadId: params.options?.agentThreadId,
  });

  const pluginTools = resolvePluginTools({
    ...resolveOpenClawPluginToolInputs({
      options: params.options,
      resolvedConfig: params.resolvedConfig,
      runtimeConfig: runtimeSnapshot?.config,
    }),
    existingToolNames: params.existingToolNames ?? new Set<string>(),
    toolAllowlist: params.options?.pluginToolAllowlist,
  });

  const normalizedTools = normalizeModelMemoryCompatibilityAliases({
    tools: pluginTools,
    env: process.env,
  });

  return applyPluginToolDeliveryDefaults({
    tools: normalizedTools,
    deliveryContext,
  });
}

export const __testing = {
  normalizeModelMemoryCompatibilityAliases,
  cloneToolWithAliasName,
  readBooleanEnvFlag,
};
