import os from "node:os";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { resolveChannelCapabilities } from "../config/channel-capabilities.js";
import type { SessionSystemPromptReport } from "../config/sessions/types.js";
import { getMachineDisplayName } from "../infra/machine-name.js";
import {
  resolveProviderSystemPromptContribution,
  transformProviderSystemPrompt,
} from "../plugins/provider-runtime.js";
import { normalizeOptionalLowercaseString } from "../shared/string-coerce.js";
import { buildTtsSystemPromptHint } from "../tts/tts.js";
import { normalizeMessageChannel } from "../utils/message-channel.js";
import { isReasoningTagProvider } from "../utils/provider-utils.js";
import {
  findAgentPackRegistryEntry,
  loadAgentPackRegistryEntriesSync,
} from "./agent-pack-registry.js";
import type {
  BootstrapBudgetAnalysis,
  BootstrapPromptWarning,
  BootstrapPromptWarningMode,
} from "./bootstrap-budget.js";
import { buildBootstrapTruncationReportMeta } from "./bootstrap-budget.js";
import {
  listChannelSupportedActions,
  resolveChannelMessageToolCapabilities,
  resolveChannelMessageToolHints,
  resolveChannelReactionGuidance,
} from "./channel-tools.js";
import { resolveOpenClawDocsPath } from "./docs-path.js";
import { resolveHeartbeatPromptForSystemPrompt } from "./heartbeat-system-prompt.js";
import { buildModelAliasLines } from "./model-alias-lines.js";
import { resolveDefaultModelForAgent } from "./model-selection.js";
import { resolveOwnerDisplaySetting } from "./owner-display.js";
import type { EmbeddedContextFile } from "./pi-embedded-helpers.js";
import { buildEmbeddedMessageActionDiscoveryInput } from "./pi-embedded-runner/message-action-discovery-input.js";
import {
  resolvePromptModeForSession,
  shouldInjectHeartbeatPrompt,
} from "./pi-embedded-runner/run/attempt.prompt-helpers.js";
import type { EmbeddedRunAttemptParams } from "./pi-embedded-runner/run/types.js";
import { buildEmbeddedSandboxInfo } from "./pi-embedded-runner/sandbox-info.js";
import {
  buildEmbeddedSystemPrompt,
  createSystemPromptOverride,
} from "./pi-embedded-runner/system-prompt.js";
import type { resolveSandboxContext } from "./sandbox.js";
import { resolveSandboxRuntimeStatus } from "./sandbox/runtime-status.js";
import { detectRuntimeShell } from "./shell-utils.js";
import { resolveSystemPromptOverride } from "./system-prompt-override.js";
import { buildSystemPromptParams } from "./system-prompt-params.js";
import { buildSystemPromptReport } from "./system-prompt-report.js";
import type { PromptProfile } from "./system-prompt.types.js";
import type { WorkspaceBootstrapFile } from "./workspace.js";

function fallbackPromptProfileForAgentId(agentId: string | undefined): PromptProfile {
  if (agentId === "execution-coding") {
    return "execution_worker";
  }
  if (agentId === "execution-context-scout") {
    return "execution_context_scout";
  }
  if (agentId === "execution-validation-scout") {
    return "execution_validation_scout";
  }
  return "general_assistant";
}

export function resolvePromptProfileForAgent(agentId: string | undefined): PromptProfile {
  if (!agentId) {
    return "general_assistant";
  }
  try {
    const entry = findAgentPackRegistryEntry({
      entries: loadAgentPackRegistryEntriesSync(),
      agentId,
    });
    return entry?.promptProfile ?? fallbackPromptProfileForAgentId(agentId);
  } catch {
    return fallbackPromptProfileForAgentId(agentId);
  }
}

export type AttemptPromptRuntime = {
  appendPrompt: string;
  systemPromptText: string;
  systemPromptOverride: (defaultPrompt?: string) => string;
  systemPromptReport: SessionSystemPromptReport;
  buildAttemptSystemPromptReport: (systemPrompt: string) => SessionSystemPromptReport;
  promptProfile: PromptProfile;
  effectivePromptMode: ReturnType<typeof resolvePromptModeForSession>;
  heartbeatPrompt?: string;
  runtimeChannel?: string;
  runtimeCapabilities?: string[];
};

export async function buildAttemptPromptRuntime(input: {
  attempt: EmbeddedRunAttemptParams;
  sessionAgentId: string;
  defaultAgentId: string;
  effectiveWorkspace: string;
  agentDir: string;
  sandboxSessionKey: string;
  sandbox?: Awaited<ReturnType<typeof resolveSandboxContext>> | null;
  workspaceNotes?: string[];
  skillsPrompt: string;
  effectiveTools: AgentTool[];
  hookAdjustedBootstrapFiles: WorkspaceBootstrapFile[];
  contextFiles: EmbeddedContextFile[];
  bootstrapAnalysis: BootstrapBudgetAnalysis;
  bootstrapPromptWarningMode: BootstrapPromptWarningMode;
  bootstrapPromptWarning: BootstrapPromptWarning;
  bootstrapMaxChars: number;
  bootstrapTotalMaxChars: number;
}): Promise<AttemptPromptRuntime> {
  const params = input.attempt;
  const machineName = await getMachineDisplayName();
  const runtimeChannel = normalizeMessageChannel(params.messageChannel ?? params.messageProvider);
  let runtimeCapabilities = runtimeChannel
    ? (resolveChannelCapabilities({
        cfg: params.config,
        channel: runtimeChannel,
        accountId: params.agentAccountId,
      }) ?? [])
    : undefined;
  const promptCapabilities =
    runtimeChannel && params.config
      ? resolveChannelMessageToolCapabilities({
          cfg: params.config,
          channel: runtimeChannel,
          accountId: params.agentAccountId,
        })
      : [];
  if (promptCapabilities.length > 0) {
    runtimeCapabilities ??= [];
    const seenCapabilities = new Set(
      runtimeCapabilities.map((cap) => normalizeOptionalLowercaseString(cap)).filter(Boolean),
    );
    for (const capability of promptCapabilities) {
      const normalizedCapability = normalizeOptionalLowercaseString(capability);
      if (!normalizedCapability || seenCapabilities.has(normalizedCapability)) {
        continue;
      }
      seenCapabilities.add(normalizedCapability);
      runtimeCapabilities.push(capability);
    }
  }
  const reactionGuidance =
    runtimeChannel && params.config
      ? resolveChannelReactionGuidance({
          cfg: params.config,
          channel: runtimeChannel,
          accountId: params.agentAccountId,
        })
      : undefined;
  const sandboxInfo = buildEmbeddedSandboxInfo(input.sandbox ?? undefined, params.bashElevated);
  const reasoningTagHint = isReasoningTagProvider(params.provider, {
    config: params.config,
    workspaceDir: input.effectiveWorkspace,
    env: process.env,
    modelId: params.modelId,
    modelApi: params.model.api,
    model: params.model,
  });
  const channelActions = runtimeChannel
    ? listChannelSupportedActions(
        buildEmbeddedMessageActionDiscoveryInput({
          cfg: params.config,
          channel: runtimeChannel,
          currentChannelId: params.currentChannelId,
          currentThreadTs: params.currentThreadTs,
          currentMessageId: params.currentMessageId,
          accountId: params.agentAccountId,
          sessionKey: params.sessionKey,
          sessionId: params.sessionId,
          agentId: input.sessionAgentId,
          senderId: params.senderId,
          senderIsOwner: params.senderIsOwner,
        }),
      )
    : undefined;
  const messageToolHints = runtimeChannel
    ? resolveChannelMessageToolHints({
        cfg: params.config,
        channel: runtimeChannel,
        accountId: params.agentAccountId,
      })
    : undefined;

  const defaultModelRef = resolveDefaultModelForAgent({
    cfg: params.config ?? {},
    agentId: input.sessionAgentId,
  });
  const defaultModelLabel = `${defaultModelRef.provider}/${defaultModelRef.model}`;
  const { runtimeInfo, userTimezone, userTime, userTimeFormat } = buildSystemPromptParams({
    config: params.config,
    agentId: input.sessionAgentId,
    workspaceDir: input.effectiveWorkspace,
    cwd: input.effectiveWorkspace,
    runtime: {
      host: machineName,
      os: `${os.type()} ${os.release()}`,
      arch: os.arch(),
      node: process.version,
      model: `${params.provider}/${params.modelId}`,
      defaultModel: defaultModelLabel,
      shell: detectRuntimeShell(),
      channel: runtimeChannel,
      capabilities: runtimeCapabilities,
      channelActions,
    },
  });
  const isDefaultAgent = input.sessionAgentId === input.defaultAgentId;
  const promptMode = resolvePromptModeForSession(params.sessionKey);
  const promptProfile = resolvePromptProfileForAgent(input.sessionAgentId);

  const effectivePromptMode = params.toolsAllow?.length ? ("minimal" as const) : promptMode;
  const effectiveSkillsPrompt = input.skillsPrompt;
  const docsPath = await resolveOpenClawDocsPath({
    workspaceDir: input.effectiveWorkspace,
    argv1: process.argv[1],
    cwd: input.effectiveWorkspace,
    moduleUrl: import.meta.url,
  });
  const ttsHint = params.config ? buildTtsSystemPromptHint(params.config) : undefined;
  const ownerDisplay = resolveOwnerDisplaySetting(params.config);
  const heartbeatPrompt = shouldInjectHeartbeatPrompt({
    config: params.config,
    agentId: input.sessionAgentId,
    defaultAgentId: input.defaultAgentId,
    isDefaultAgent,
    trigger: params.trigger,
  })
    ? resolveHeartbeatPromptForSystemPrompt({
        config: params.config,
        agentId: input.sessionAgentId,
        defaultAgentId: input.defaultAgentId,
      })
    : undefined;
  const promptContribution = resolveProviderSystemPromptContribution({
    provider: params.provider,
    config: params.config,
    workspaceDir: input.effectiveWorkspace,
    context: {
      config: params.config,
      agentDir: params.agentDir,
      workspaceDir: input.effectiveWorkspace,
      provider: params.provider,
      modelId: params.modelId,
      promptMode: effectivePromptMode,
      promptProfile,
      runtimeChannel,
      runtimeCapabilities,
      agentId: input.sessionAgentId,
    },
  });

  const builtAppendPrompt =
    resolveSystemPromptOverride({
      config: params.config,
      agentId: input.sessionAgentId,
    }) ??
    buildEmbeddedSystemPrompt({
      workspaceDir: input.effectiveWorkspace,
      defaultThinkLevel: params.thinkLevel,
      reasoningLevel: params.reasoningLevel ?? "off",
      extraSystemPrompt: params.extraSystemPrompt,
      ownerNumbers: params.ownerNumbers,
      ownerDisplay: ownerDisplay.ownerDisplay,
      ownerDisplaySecret: ownerDisplay.ownerDisplaySecret,
      reasoningTagHint,
      heartbeatPrompt,
      skillsPrompt: effectiveSkillsPrompt,
      docsPath: docsPath ?? undefined,
      ttsHint,
      workspaceNotes: input.workspaceNotes,
      reactionGuidance,
      promptMode: effectivePromptMode,
      promptProfile,
      acpEnabled: params.config?.acp?.enabled !== false,
      runtimeInfo,
      messageToolHints,
      sandboxInfo,
      tools: input.effectiveTools,
      modelAliasLines: buildModelAliasLines(params.config),
      userTimezone,
      userTime,
      userTimeFormat,
      contextFiles: input.contextFiles,
      includeMemorySection: !params.contextEngine || params.contextEngine.info.id === "legacy",
      memoryCitationsMode: params.config?.memory?.citations,
      promptContribution,
    });
  const appendPrompt = transformProviderSystemPrompt({
    provider: params.provider,
    config: params.config,
    workspaceDir: input.effectiveWorkspace,
    context: {
      config: params.config,
      agentDir: params.agentDir,
      workspaceDir: input.effectiveWorkspace,
      provider: params.provider,
      modelId: params.modelId,
      promptMode: effectivePromptMode,
      promptProfile,
      runtimeChannel,
      runtimeCapabilities,
      agentId: input.sessionAgentId,
      systemPrompt: builtAppendPrompt,
    },
  });
  const buildAttemptSystemPromptReport = (systemPrompt: string) =>
    buildSystemPromptReport({
      source: "run",
      generatedAt: Date.now(),
      sessionId: params.sessionId,
      sessionKey: params.sessionKey ?? params.sessionId,
      provider: params.provider,
      model: params.modelId,
      workspaceDir: input.effectiveWorkspace,
      bootstrapMaxChars: input.bootstrapMaxChars,
      bootstrapTotalMaxChars: input.bootstrapTotalMaxChars,
      bootstrapTruncation: buildBootstrapTruncationReportMeta({
        analysis: input.bootstrapAnalysis,
        warningMode: input.bootstrapPromptWarningMode,
        warning: input.bootstrapPromptWarning,
      }),
      sandbox: (() => {
        const runtime = resolveSandboxRuntimeStatus({
          cfg: params.config,
          sessionKey: input.sandboxSessionKey,
        });
        return { mode: runtime.mode, sandboxed: runtime.sandboxed };
      })(),
      systemPrompt,
      bootstrapFiles: input.hookAdjustedBootstrapFiles,
      injectedFiles: input.contextFiles,
      skillsPrompt: input.skillsPrompt,
      tools: input.effectiveTools,
    });
  const systemPromptReport = buildAttemptSystemPromptReport(appendPrompt);
  const systemPromptOverride = createSystemPromptOverride(appendPrompt);
  const systemPromptText = systemPromptOverride();

  return {
    appendPrompt,
    systemPromptText,
    systemPromptOverride,
    systemPromptReport,
    buildAttemptSystemPromptReport,
    promptProfile,
    effectivePromptMode,
    ...(heartbeatPrompt ? { heartbeatPrompt } : {}),
    runtimeChannel,
    runtimeCapabilities,
  };
}
