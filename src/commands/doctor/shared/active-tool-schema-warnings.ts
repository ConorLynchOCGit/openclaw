import { sanitizeForLog } from "../../../../packages/terminal-core/src/ansi.js";
import {
  listAgentIds,
  resolveAgentConfig,
  resolveAgentDir,
  resolveAgentWorkspaceDir,
} from "../../../agents/agent-scope.js";
import { createOpenClawCodingTools } from "../../../agents/agent-tools.js";
import { resolveConversationCapabilityProfile } from "../../../agents/conversation-capability-profile.js";
import { resolveModel } from "../../../agents/embedded-agent-runner/model.js";
import { normalizeAgentRuntimeTools } from "../../../agents/runtime-plan/tools.js";
import { isKnownCoreToolId } from "../../../agents/tool-catalog.js";
import { buildDeclaredToolAllowlistContext } from "../../../agents/tool-policy-declared-context.js";
import { isToolAllowedByPolicyName } from "../../../agents/tool-policy-match.js";
import {
  analyzeAllowlistByToolType,
  buildPluginToolGroups,
  normalizeToolName,
} from "../../../agents/tool-policy.js";
import {
  filterRuntimeCompatibleTools,
  type RuntimeToolSchemaDiagnostic,
} from "../../../agents/tool-schema-projection.js";
// Doctor warnings for active tools whose schemas cannot be projected to the selected runtime.
import { buildReadableToolsByName } from "../../../agents/tools-effective-inventory-build.js";
import type { AnyAgentTool } from "../../../agents/tools/common.js";
import type { OpenClawConfig } from "../../../config/types.openclaw.js";
import { formatErrorMessage } from "../../../infra/errors.js";
import { extractModelCompat } from "../../../plugins/provider-model-compat.js";
import type { ProviderRuntimeModel } from "../../../plugins/provider-runtime-model.types.js";
import { getPluginToolMeta } from "../../../plugins/tools.js";
import { resolveDoctorPrimaryModelRef } from "./primary-model-ref.js";

function resolveRuntimeModelContext(params: {
  cfg: OpenClawConfig;
  agentId: string;
  agentDir: string;
  workspaceDir: string;
  provider: string;
  modelId: string;
}): {
  modelApi?: string;
  model?: ProviderRuntimeModel;
  modelCompat?: ReturnType<typeof extractModelCompat>;
  modelContextWindowTokens?: number;
} {
  const model = resolveModel(params.provider, params.modelId, params.agentDir, params.cfg, {
    agentId: params.agentId,
    workspaceDir: params.workspaceDir,
  }).model as ProviderRuntimeModel | undefined;
  if (!model) {
    return {};
  }
  return {
    modelApi: model.api,
    model,
    modelCompat: extractModelCompat(model),
    ...(typeof model.contextWindow === "number"
      ? { modelContextWindowTokens: model.contextWindow }
      : {}),
  };
}

function formatDiagnostic(params: {
  agentId: string;
  diagnostic: RuntimeToolSchemaDiagnostic;
  pluginId?: string;
}): string {
  const plugin = params.pluginId ? ` from plugin "${params.pluginId}"` : "";
  return sanitizeForLog(
    `- agents.${params.agentId}: active tool "${params.diagnostic.toolName}"${plugin} has unsupported runtime input schema (${params.diagnostic.violations.join(", ")}). OpenClaw will quarantine this tool at runtime; fix or disable the plugin, or remove the tool from active allowlists.`,
  );
}

function readToolByIndex(tools: readonly AnyAgentTool[], index: number): AnyAgentTool | undefined {
  try {
    return tools[index];
  } catch {
    return undefined;
  }
}

function readPluginId(tool: AnyAgentTool | undefined): string | undefined {
  try {
    return tool ? getPluginToolMeta(tool)?.pluginId : undefined;
  } catch {
    return undefined;
  }
}

function isLiteralRequiredToolName(value: string): boolean {
  return (
    value.length > 0 &&
    value !== "__openclaw_default_plugin_tools__" &&
    !value.startsWith("group:") &&
    !value.includes("*") &&
    !value.includes("?") &&
    !value.includes("[")
  );
}

function resolveRequiredLiteralToolNames(params: {
  cfg: OpenClawConfig;
  agentId: string;
  agentDir: string;
  workspaceDir: string;
  provider: string;
  modelId: string;
}): string[] {
  const capability = resolveConversationCapabilityProfile({
    config: params.cfg,
    agentId: params.agentId,
    agentDir: params.agentDir,
    workspaceDir: params.workspaceDir,
    cwd: params.workspaceDir,
    modelProvider: params.provider,
    modelId: params.modelId,
  });
  const denyPolicy = { deny: capability.policy.explicitToolDenylist };
  return [
    ...new Set(
      capability.policy.explicitToolOverrideAllowlist
        .map((name) => normalizeToolName(name))
        .filter(isLiteralRequiredToolName)
        .filter((name) => isToolAllowedByPolicyName(name, denyPolicy)),
    ),
  ].toSorted();
}

function formatMissingRequiredTool(params: { agentId: string; toolName: string }): string {
  return sanitizeForLog(
    `- agents.${params.agentId}: explicitly allowlisted tool "${params.toolName}" is absent from the assembled effective runtime tool set. Restore its native owner or remove the stale allowlist entry before release.`,
  );
}

function formatUnknownRequiredTool(params: { agentId: string; toolName: string }): string {
  return sanitizeForLog(
    `- agents.${params.agentId}: explicitly allowlisted tool "${params.toolName}" has no assembled core owner, enabled plugin owner, or configured MCP namespace. Restore its native owner or remove the stale allowlist entry before release.`,
  );
}

/**
 * Collect per-agent warnings for required tools missing after assembly and for
 * active tools rejected by runtime schema projection.
 */
export function collectActiveToolSchemaProjectionWarnings(params: {
  cfg: OpenClawConfig;
  env?: NodeJS.ProcessEnv;
}): string[] {
  const env = params.env ?? process.env;
  const validateSchemas = params.cfg.plugins?.enabled !== false;
  const warnings: string[] = [];
  for (const agentId of listAgentIds(params.cfg)) {
    const agentConfig = resolveAgentConfig(params.cfg, agentId);
    const modelRef = resolveDoctorPrimaryModelRef(params.cfg, agentConfig?.model);
    const agentDir = resolveAgentDir(params.cfg, agentId, env);
    const workspaceDir = resolveAgentWorkspaceDir(params.cfg, agentId, env);
    let requiredToolNames: string[] = [];
    try {
      requiredToolNames = resolveRequiredLiteralToolNames({
        cfg: params.cfg,
        agentId,
        agentDir,
        workspaceDir,
        provider: modelRef.provider,
        modelId: modelRef.model,
      });
    } catch (error) {
      warnings.push(
        sanitizeForLog(
          `- agents.${agentId}: required tool readiness could not resolve the effective policy (${formatErrorMessage(error)}). Fix tool policy loading errors before relying on assistant startup.`,
        ),
      );
    }
    if (!validateSchemas && requiredToolNames.length === 0) {
      continue;
    }
    let runtimeModelContext: ReturnType<typeof resolveRuntimeModelContext> = {};
    try {
      runtimeModelContext = resolveRuntimeModelContext({
        cfg: params.cfg,
        agentId,
        agentDir,
        workspaceDir,
        provider: modelRef.provider,
        modelId: modelRef.model,
      });
    } catch (error) {
      warnings.push(
        sanitizeForLog(
          `- agents.${agentId}: active tool schema validation could not resolve the runtime model context (${formatErrorMessage(error)}). Fix provider/model loading errors before relying on assistant tool startup.`,
        ),
      );
    }
    let tools: ReturnType<typeof createOpenClawCodingTools>;
    try {
      tools = createOpenClawCodingTools({
        agentId,
        agentDir,
        workspaceDir,
        config: params.cfg,
        modelProvider: modelRef.provider,
        modelId: modelRef.model,
        modelApi: runtimeModelContext.modelApi,
        modelCompat: runtimeModelContext.modelCompat,
        modelContextWindowTokens: runtimeModelContext.modelContextWindowTokens,
        allowGatewaySubagentBinding: true,
        toolPolicyAuditLogLevel: "debug",
      });
    } catch (error) {
      warnings.push(
        sanitizeForLog(
          `- agents.${agentId}: active tool schema validation could not load the runtime tool set (${formatErrorMessage(error)}). Fix plugin loading errors before relying on assistant tool startup.`,
        ),
      );
      continue;
    }

    const rawToolsByName = buildReadableToolsByName(tools);
    const preNormalizationDiagnostics: RuntimeToolSchemaDiagnostic[] = [];
    let normalizedTools: typeof tools;
    try {
      normalizedTools = normalizeAgentRuntimeTools({
        tools,
        provider: modelRef.provider,
        config: params.cfg,
        workspaceDir,
        env,
        modelId: modelRef.model,
        modelApi: runtimeModelContext.modelApi,
        model: runtimeModelContext.model,
        onPreNormalizationSchemaDiagnostics: (diagnostics) =>
          preNormalizationDiagnostics.push(...diagnostics),
      });
    } catch (error) {
      warnings.push(
        sanitizeForLog(
          `- agents.${agentId}: active tool schema validation could not normalize the runtime tool set (${formatErrorMessage(error)}). Fix provider/plugin loading errors before relying on assistant tool startup.`,
        ),
      );
      continue;
    }
    if (validateSchemas) {
      for (const diagnostic of preNormalizationDiagnostics) {
        const rawTool = rawToolsByName.get(diagnostic.toolName);
        const pluginId = readPluginId(rawTool);
        warnings.push(
          formatDiagnostic({
            agentId,
            diagnostic,
            ...(pluginId ? { pluginId } : {}),
          }),
        );
      }
    }
    const projection = filterRuntimeCompatibleTools(normalizedTools);
    if (validateSchemas) {
      for (const diagnostic of projection.diagnostics) {
        const tool = readToolByIndex(normalizedTools, diagnostic.toolIndex);
        const rawTool = rawToolsByName.get(diagnostic.toolName);
        const pluginId = readPluginId(tool) ?? readPluginId(rawTool);
        warnings.push(
          formatDiagnostic({
            agentId,
            diagnostic,
            ...(pluginId ? { pluginId } : {}),
          }),
        );
      }
    }
    const assembledNames = new Set(
      projection.tools
        .map((tool) => {
          try {
            return normalizeToolName(tool.name);
          } catch {
            return "";
          }
        })
        .filter(Boolean),
    );
    const pluginGroups = buildPluginToolGroups({
      tools: [...projection.tools],
      toolMeta: (tool) => getPluginToolMeta(tool),
    });
    const coreToolNames = new Set(
      projection.tools
        .filter((tool) => !getPluginToolMeta(tool))
        .map((tool) => normalizeToolName(tool.name))
        .filter(Boolean),
    );
    const unresolvedAllowlist = new Set(
      analyzeAllowlistByToolType(
        { allow: requiredToolNames },
        pluginGroups,
        coreToolNames,
        buildDeclaredToolAllowlistContext({
          config: params.cfg,
          workspaceDir,
          env,
        }),
      ).unknownAllowlist,
    );
    for (const toolName of unresolvedAllowlist) {
      if (isKnownCoreToolId(toolName)) {
        warnings.push(formatMissingRequiredTool({ agentId, toolName }));
      } else if (!assembledNames.has(toolName)) {
        warnings.push(formatUnknownRequiredTool({ agentId, toolName }));
      }
    }
  }

  return warnings;
}
