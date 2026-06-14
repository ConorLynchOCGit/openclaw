import { isSubagentSessionKey } from "../routing/session-key.js";
import { resolveModelAuthMode } from "./model-auth.js";
import { supportsModelTools } from "./model-tool-support.js";
import { createOpenClawLspService } from "./openclaw-lsp-service.js";
import { createBundleLspToolRuntime } from "./pi-bundle-lsp-runtime.js";
import {
  getOrCreateSessionMcpRuntime,
  materializeBundleMcpToolsForRun,
} from "./pi-bundle-mcp-tools.js";
import { resolveAttemptSpawnWorkspaceDir } from "./pi-embedded-runner/run/attempt.thread-helpers.js";
import { buildEmbeddedAttemptToolRunContext } from "./pi-embedded-runner/run/attempt.tool-run-context.js";
import type { EmbeddedRunAttemptParams } from "./pi-embedded-runner/run/types.js";
import { collectAllowedToolNames } from "./pi-embedded-runner/tool-name-allowlist.js";
import {
  logProviderToolSchemaDiagnostics,
  normalizeProviderToolSchemas,
} from "./pi-embedded-runner/tool-schema-runtime.js";
import {
  createOpenClawCodingTools,
  filterToolsForExecutionScoutMode,
  isNodeAgentNativeTaskParentToolAllowed,
} from "./pi-tools.js";

export function filterEffectiveToolsForNodeAgentNativeTaskMode<
  TTool extends { name?: string | null },
>(input: {
  tools: readonly TTool[];
  mode?: {
    enabled?: boolean;
    mutationToolName?: string;
  };
}): TTool[] {
  if (input.mode?.enabled !== true) {
    return [...input.tools];
  }
  return input.tools.filter((tool) => {
    return isNodeAgentNativeTaskParentToolAllowed({
      toolName: tool.name,
      mutationToolName: input.mode?.mutationToolName,
    });
  });
}

type CreateCodingToolsOptions = NonNullable<Parameters<typeof createOpenClawCodingTools>[0]>;

export async function buildAttemptToolRuntime(input: {
  attempt: EmbeddedRunAttemptParams;
  sessionAgentId: string;
  sandboxSessionKey: string;
  agentDir: string;
  effectiveWorkspace: string;
  resolvedWorkspace: string;
  sandbox: CreateCodingToolsOptions["sandbox"];
  abortSignal: AbortSignal;
  nodeAgentNativeTaskMode: EmbeddedRunAttemptParams["nodeAgentNativeTaskMode"];
  onYield: (message: string) => void;
}) {
  const params = input.attempt;
  const modelHasVision = params.model.input?.includes("image") ?? false;
  const nativeLspService = createOpenClawLspService({
    workspaceRoot: input.effectiveWorkspace,
    externalEnabled: true,
  });
  const toolsRaw = params.disableTools
    ? []
    : (() => {
        const allTools = createOpenClawCodingTools({
          agentId: input.sessionAgentId,
          ...buildEmbeddedAttemptToolRunContext(params),
          exec: {
            ...params.execOverrides,
            elevated: params.bashElevated,
          },
          sandbox: input.sandbox,
          messageProvider: params.messageChannel ?? params.messageProvider,
          agentAccountId: params.agentAccountId,
          messageTo: params.messageTo,
          messageThreadId: params.messageThreadId,
          groupId: params.groupId,
          groupChannel: params.groupChannel,
          groupSpace: params.groupSpace,
          spawnedBy: params.spawnedBy,
          senderId: params.senderId,
          senderName: params.senderName,
          senderUsername: params.senderUsername,
          senderE164: params.senderE164,
          senderIsOwner: params.senderIsOwner,
          allowGatewaySubagentBinding: params.allowGatewaySubagentBinding,
          sessionKey: input.sandboxSessionKey,
          sessionId: params.sessionId,
          runId: params.runId,
          agentDir: input.agentDir,
          workspaceDir: input.effectiveWorkspace,
          // When sandboxing uses a copied workspace (`ro` or `none`), effectiveWorkspace points
          // at the sandbox copy. Spawned subagents should inherit the real workspace instead.
          spawnWorkspaceDir: resolveAttemptSpawnWorkspaceDir({
            sandbox: input.sandbox,
            resolvedWorkspace: input.resolvedWorkspace,
          }),
          config: params.config,
          abortSignal: input.abortSignal,
          modelProvider: params.model.provider,
          modelId: params.modelId,
          modelCompat: params.model.compat,
          modelApi: params.model.api,
          modelContextWindowTokens: params.model.contextWindow,
          modelAuthMode: resolveModelAuthMode(params.model.provider, params.config),
          currentChannelId: params.currentChannelId,
          currentThreadTs: params.currentThreadTs,
          currentMessageId: params.currentMessageId,
          replyToMode: params.replyToMode,
          hasRepliedRef: params.hasRepliedRef,
          modelHasVision,
          requireExplicitMessageTarget:
            params.requireExplicitMessageTarget ?? isSubagentSessionKey(params.sessionKey),
          disableMessageTool: params.disableMessageTool,
          nativeExecutionSession: params.nativeExecutionSession,
          nativeRuntimeTools: params.nativeRuntimeTools,
          extraTools: params.extraTools,
          nodeAuthorityOverlay: params.nodeAuthorityOverlay,
          nodeAgentParentCrawlGuard: params.nodeAgentParentCrawlGuard,
          lspService: nativeLspService,
          nodeAgentNativeTaskMode: input.nodeAgentNativeTaskMode,
          onYield: input.onYield,
        });
        if (params.toolsAllow && params.toolsAllow.length > 0) {
          const allowSet = new Set(params.toolsAllow);
          return allTools.filter((tool) => allowSet.has(tool.name));
        }
        return allTools;
      })();
  const toolsEnabled = supportsModelTools(params.model);
  const tools = normalizeProviderToolSchemas({
    tools: toolsEnabled ? toolsRaw : [],
    provider: params.provider,
    config: params.config,
    workspaceDir: input.effectiveWorkspace,
    env: process.env,
    modelId: params.modelId,
    modelApi: params.model.api,
    model: params.model,
  });
  const clientTools = toolsEnabled ? params.clientTools : undefined;
  const bundleMcpSessionRuntime = toolsEnabled
    ? await getOrCreateSessionMcpRuntime({
        sessionId: params.sessionId,
        sessionKey: params.sessionKey,
        workspaceDir: input.effectiveWorkspace,
        cfg: params.config,
      })
    : undefined;
  const bundleMcpRuntime = bundleMcpSessionRuntime
    ? await materializeBundleMcpToolsForRun({
        runtime: bundleMcpSessionRuntime,
        reservedToolNames: [
          ...tools.map((tool) => tool.name),
          ...(clientTools?.map((tool) => tool.function.name) ?? []),
        ],
      })
    : undefined;
  const bundleLspRuntime = toolsEnabled
    ? await createBundleLspToolRuntime({
        workspaceDir: input.effectiveWorkspace,
        cfg: params.config,
        reservedToolNames: [
          ...tools.map((tool) => tool.name),
          ...(clientTools?.map((tool) => tool.function.name) ?? []),
          ...(bundleMcpRuntime?.tools.map((tool) => tool.name) ?? []),
        ],
      })
    : undefined;
  const effectiveTools = filterToolsForExecutionScoutMode({
    tools: filterEffectiveToolsForNodeAgentNativeTaskMode({
      tools: [...tools, ...(bundleMcpRuntime?.tools ?? []), ...(bundleLspRuntime?.tools ?? [])],
      mode: input.nodeAgentNativeTaskMode,
    }),
    agentId: input.sessionAgentId,
  });
  const effectiveToolNames = Array.from(
    new Set(
      effectiveTools
        .map((tool) => tool.name)
        .filter((name): name is string => typeof name === "string" && name.length > 0),
    ),
  ).toSorted();
  const allowedToolNames = collectAllowedToolNames({
    tools: effectiveTools,
    clientTools,
  });
  logProviderToolSchemaDiagnostics({
    tools: effectiveTools,
    provider: params.provider,
    config: params.config,
    workspaceDir: input.effectiveWorkspace,
    env: process.env,
    modelId: params.modelId,
    modelApi: params.model.api,
    model: params.model,
  });

  return {
    nativeLspService,
    tools,
    clientTools,
    bundleMcpRuntime,
    bundleLspRuntime,
    effectiveTools,
    effectiveToolNames,
    allowedToolNames,
  };
}
