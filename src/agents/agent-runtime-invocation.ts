import type { ImageContent } from "@mariozechner/pi-ai";
import type { AuthStorage, ModelRegistry } from "@mariozechner/pi-coding-agent";
import type { ReplyPayload } from "../auto-reply/reply-payload.js";
import type { ReplyOperation } from "../auto-reply/reply/reply-run-registry.js";
import type { ReasoningLevel, ThinkLevel, VerboseLevel } from "../auto-reply/thinking.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import type { PromptImageOrderEntry } from "../media/prompt-image-order.js";
import type { ProviderRuntimeModel } from "../plugins/provider-runtime-model.types.js";
import type { CommandQueueEnqueueFn } from "../process/command-queue.types.js";
import type { InputProvenance } from "../sessions/input-provenance.js";
import type { AgentRunRequest, AgentRunTrigger } from "./agent-run-request.js";
import type { ExecElevatedDefaults, ExecToolDefaults } from "./bash-tools.exec-types.js";
import type { AgentStreamParams, ClientToolDefinition } from "./command/shared-types.js";
import type { AgentInternalEvent } from "./internal-events.js";
import type { OpenClawNodeAuthorityOverlay } from "./node-authority-overlay.js";
import type { AgentRuntimeProviderCapability } from "./openclaw-agent-runtime-contracts.js";
import type { BlockReplyPayload } from "./pi-embedded-payloads.js";
import type { BlockReplyChunking, ToolResultFormat } from "./pi-embedded-subscribe.shared-types.js";
import type { AnyAgentTool } from "./pi-tools.types.js";
import type { NativeTaskRunChildTask } from "./session-runtime/native-task-types.js";
import type { SessionLockAcquisitionTrace } from "./session-write-lock.js";
import type { SkillSnapshot } from "./skills.js";
import type { RequiredProviderContextAdmission } from "./system-prompt-report.js";
import type {
  StartExecutionSessionToolInput,
  StartExecutionSessionToolResult,
} from "./tools/start-execution-session-tool.js";
import type {
  WorkQueueExecutionEligibilityToolInput,
  WorkQueueExecutionEligibilityToolResult,
} from "./tools/work-queue-execution-eligibility-tool.js";

export type AgentRuntimeInvocationSource = "legacy_embedded_params" | "runtime_generation";

export type AgentRuntimeExecutionContext = {
  source: AgentRuntimeInvocationSource;
  sessionId: string;
  sessionKey?: string;
  agentId?: string;
  messageChannel?: string;
  messageProvider?: string;
  agentAccountId?: string;
  trigger?: AgentRunTrigger;
  memoryFlushWritePath?: string;
  messageTo?: string;
  messageThreadId?: string | number;
  groupId?: string | null;
  groupChannel?: string | null;
  groupSpace?: string | null;
  spawnedBy?: string | null;
  parentToolCallId?: string | null;
  nodeRunId?: string | null;
  senderId?: string | null;
  senderName?: string | null;
  senderUsername?: string | null;
  senderE164?: string | null;
  senderIsOwner?: boolean;
  currentChannelId?: string;
  currentThreadTs?: string;
  currentMessageId?: string | number;
  replyToMode?: "off" | "first" | "all" | "batched";
  hasRepliedRef?: { value: boolean };
  requireExplicitMessageTarget?: boolean;
  disableMessageTool?: boolean;
  allowGatewaySubagentBinding?: boolean;
  runtimePluginIds?: string[];
  modelsJsonPolicy?: "refresh" | "reuse-existing";
  sessionFile: string;
  workspaceDir: string;
  agentDir?: string;
  config?: OpenClawConfig;
  skillsSnapshot?: SkillSnapshot;
  prompt: string;
  images?: ImageContent[];
  imageOrder?: PromptImageOrderEntry[];
  clientTools?: ClientToolDefinition[];
  disableTools?: boolean;
  provider?: string;
  model?: string;
  authStorage?: AuthStorage;
  modelRegistry?: ModelRegistry;
  admittedRuntimeModel?: ProviderRuntimeModel;
  providerCapability?: AgentRuntimeProviderCapability;
  authProfileId?: string;
  authProfileIdSource?: "auto" | "user";
  thinkLevel?: ThinkLevel;
  fastMode?: boolean;
  verboseLevel?: VerboseLevel;
  reasoningLevel?: ReasoningLevel;
  toolResultFormat?: ToolResultFormat;
  suppressToolErrorWarnings?: boolean;
  bootstrapContextMode?: "full" | "lightweight";
  bootstrapContextRunKind?: "default" | "heartbeat" | "cron";
  toolsAllow?: string[];
  extraTools?: AnyAgentTool[];
  nativeRuntimeTools?: AnyAgentTool[];
  nativeExecutionSession?: {
    enabled: boolean;
    startExecutionSession: (
      input: StartExecutionSessionToolInput,
    ) => Promise<StartExecutionSessionToolResult>;
    readWorkQueueEligibility?: (
      input: WorkQueueExecutionEligibilityToolInput,
    ) => Promise<WorkQueueExecutionEligibilityToolResult>;
  };
  nodeAuthorityOverlay?: OpenClawNodeAuthorityOverlay;
  nodeAgentParentCrawlGuard?: { enabled: boolean };
  nodeAgentNativeTaskMode?: {
    enabled: boolean;
    allowedAgentIds: readonly string[];
    mutationToolName?: string;
    parentToolNames?: readonly string[];
    parentVisibleResultMaxChars?: number;
    runChildTask?: NativeTaskRunChildTask;
  };
  requiredProviderContextAdmission?: RequiredProviderContextAdmission;
  bootstrapPromptWarningSignaturesSeen?: string[];
  bootstrapPromptWarningSignature?: string;
  execOverrides?: Pick<ExecToolDefaults, "host" | "security" | "ask" | "node">;
  bashElevated?: ExecElevatedDefaults;
  timeoutMs: number;
  runId: string;
  abortSignal?: AbortSignal;
  replyOperation?: ReplyOperation;
  shouldEmitToolResult?: () => boolean;
  shouldEmitToolOutput?: () => boolean;
  onPartialReply?: (payload: { text?: string; mediaUrls?: string[] }) => void | Promise<void>;
  onAssistantMessageStart?: () => void | Promise<void>;
  onBlockReply?: (payload: BlockReplyPayload) => void | Promise<void>;
  onBlockReplyFlush?: () => void | Promise<void>;
  blockReplyBreak?: "text_end" | "message_end";
  blockReplyChunking?: BlockReplyChunking;
  onReasoningStream?: (payload: { text?: string; mediaUrls?: string[] }) => void | Promise<void>;
  onReasoningEnd?: () => void | Promise<void>;
  onToolResult?: (payload: ReplyPayload) => void | Promise<void>;
  onAgentEvent?: (evt: { stream: string; data: Record<string, unknown> }) => void;
  onSessionLockAcquired?: (trace: SessionLockAcquisitionTrace) => void | Promise<void>;
  lane?: string;
  enqueue?: CommandQueueEnqueueFn;
  extraSystemPrompt?: string;
  customInstructions?: string;
  internalEvents?: AgentInternalEvent[];
  inputProvenance?: InputProvenance;
  streamParams?: AgentStreamParams;
  ownerNumbers?: string[];
  enforceFinalTag?: boolean;
  silentExpected?: boolean;
  allowTransientCooldownProbe?: boolean;
  cleanupBundleMcpOnRunEnd?: boolean;
};

export type AgentRuntimeInvocationInputParams = Omit<AgentRuntimeExecutionContext, "source">;

export type AgentRuntimeInvocation = {
  request: AgentRunRequest;
  runtime: AgentRuntimeExecutionContext;
};

export function agentRunRequestFromEmbeddedParams(input: {
  params: AgentRuntimeInvocationInputParams;
  canonicalSourceRoot?: string | null;
  transcriptRoot?: string | null;
  artifactRoot?: string | null;
  promptProfile?: string | null;
  toolPolicy?: AgentRunRequest["toolPolicy"];
  modelProfile?: AgentRunRequest["modelProfile"];
  metadata?: Record<string, unknown>;
}): AgentRunRequest {
  return {
    agentId: input.params.agentId ?? null,
    input: {
      prompt: input.params.prompt,
      trigger: input.params.trigger ?? null,
    },
    promptProfile: input.promptProfile ?? null,
    toolPolicy: input.toolPolicy ?? null,
    modelProfile: input.modelProfile ?? {
      provider: input.params.provider ?? null,
      model: input.params.model ?? null,
      thinkingLevel: input.params.thinkLevel ?? null,
      reasoningLevel: input.params.reasoningLevel ?? null,
    },
    workspace: {
      canonicalSourceRoot: input.canonicalSourceRoot ?? input.params.workspaceDir,
      runtimeWorkspaceDir: input.params.workspaceDir,
      transcriptRoot: input.transcriptRoot ?? null,
      artifactRoot: input.artifactRoot ?? null,
    },
    transcript: {
      sessionId: input.params.sessionId,
      sessionKey: input.params.sessionKey ?? null,
      sessionFile: input.params.sessionFile,
    },
    abortSignal: input.params.abortSignal,
    metadata: input.metadata,
  };
}

export function agentRuntimeInvocationFromEmbeddedParams(input: {
  params: AgentRuntimeInvocationInputParams;
  canonicalSourceRoot?: string | null;
  transcriptRoot?: string | null;
  artifactRoot?: string | null;
  promptProfile?: string | null;
  toolPolicy?: AgentRunRequest["toolPolicy"];
  modelProfile?: AgentRunRequest["modelProfile"];
  metadata?: Record<string, unknown>;
  source?: AgentRuntimeInvocationSource;
}): AgentRuntimeInvocation {
  return {
    request: agentRunRequestFromEmbeddedParams(input),
    runtime: agentRuntimeExecutionContextFromEmbeddedParams({
      params: input.params,
      source: input.source ?? "legacy_embedded_params",
    }),
  };
}

export function agentRuntimeExecutionContextFromEmbeddedParams(input: {
  params: AgentRuntimeInvocationInputParams;
  source: AgentRuntimeInvocationSource;
}): AgentRuntimeExecutionContext {
  const params = input.params;
  return {
    source: input.source,
    sessionId: params.sessionId,
    sessionKey: params.sessionKey,
    agentId: params.agentId,
    messageChannel: params.messageChannel,
    messageProvider: params.messageProvider,
    agentAccountId: params.agentAccountId,
    trigger: params.trigger,
    memoryFlushWritePath: params.memoryFlushWritePath,
    messageTo: params.messageTo,
    messageThreadId: params.messageThreadId,
    groupId: params.groupId,
    groupChannel: params.groupChannel,
    groupSpace: params.groupSpace,
    spawnedBy: params.spawnedBy,
    parentToolCallId: params.parentToolCallId,
    nodeRunId: params.nodeRunId,
    senderId: params.senderId,
    senderName: params.senderName,
    senderUsername: params.senderUsername,
    senderE164: params.senderE164,
    senderIsOwner: params.senderIsOwner,
    currentChannelId: params.currentChannelId,
    currentThreadTs: params.currentThreadTs,
    currentMessageId: params.currentMessageId,
    replyToMode: params.replyToMode,
    hasRepliedRef: params.hasRepliedRef,
    requireExplicitMessageTarget: params.requireExplicitMessageTarget,
    disableMessageTool: params.disableMessageTool,
    allowGatewaySubagentBinding: params.allowGatewaySubagentBinding,
    runtimePluginIds: params.runtimePluginIds,
    modelsJsonPolicy: params.modelsJsonPolicy,
    sessionFile: params.sessionFile,
    workspaceDir: params.workspaceDir,
    agentDir: params.agentDir,
    config: params.config,
    skillsSnapshot: params.skillsSnapshot,
    prompt: params.prompt,
    images: params.images,
    imageOrder: params.imageOrder,
    clientTools: params.clientTools,
    disableTools: params.disableTools,
    provider: params.provider,
    model: params.model,
    authStorage: params.authStorage,
    modelRegistry: params.modelRegistry,
    admittedRuntimeModel: params.admittedRuntimeModel,
    providerCapability: params.providerCapability,
    authProfileId: params.authProfileId,
    authProfileIdSource: params.authProfileIdSource,
    thinkLevel: params.thinkLevel,
    fastMode: params.fastMode,
    verboseLevel: params.verboseLevel,
    reasoningLevel: params.reasoningLevel,
    toolResultFormat: params.toolResultFormat,
    suppressToolErrorWarnings: params.suppressToolErrorWarnings,
    bootstrapContextMode: params.bootstrapContextMode,
    bootstrapContextRunKind: params.bootstrapContextRunKind,
    toolsAllow: params.toolsAllow,
    extraTools: params.extraTools,
    nativeRuntimeTools: params.nativeRuntimeTools,
    nativeExecutionSession: params.nativeExecutionSession,
    nodeAuthorityOverlay: params.nodeAuthorityOverlay,
    nodeAgentParentCrawlGuard: params.nodeAgentParentCrawlGuard,
    nodeAgentNativeTaskMode: params.nodeAgentNativeTaskMode,
    requiredProviderContextAdmission: params.requiredProviderContextAdmission,
    bootstrapPromptWarningSignaturesSeen: params.bootstrapPromptWarningSignaturesSeen,
    bootstrapPromptWarningSignature: params.bootstrapPromptWarningSignature,
    execOverrides: params.execOverrides,
    bashElevated: params.bashElevated,
    timeoutMs: params.timeoutMs,
    runId: params.runId,
    abortSignal: params.abortSignal,
    replyOperation: params.replyOperation,
    shouldEmitToolResult: params.shouldEmitToolResult,
    shouldEmitToolOutput: params.shouldEmitToolOutput,
    onPartialReply: params.onPartialReply,
    onAssistantMessageStart: params.onAssistantMessageStart,
    onBlockReply: params.onBlockReply,
    onBlockReplyFlush: params.onBlockReplyFlush,
    blockReplyBreak: params.blockReplyBreak,
    blockReplyChunking: params.blockReplyChunking,
    onReasoningStream: params.onReasoningStream,
    onReasoningEnd: params.onReasoningEnd,
    onToolResult: params.onToolResult,
    onAgentEvent: params.onAgentEvent,
    onSessionLockAcquired: params.onSessionLockAcquired,
    lane: params.lane,
    enqueue: params.enqueue,
    extraSystemPrompt: params.extraSystemPrompt,
    customInstructions: params.customInstructions,
    internalEvents: params.internalEvents,
    inputProvenance: params.inputProvenance,
    streamParams: params.streamParams,
    ownerNumbers: params.ownerNumbers,
    enforceFinalTag: params.enforceFinalTag,
    silentExpected: params.silentExpected,
    allowTransientCooldownProbe: params.allowTransientCooldownProbe,
    cleanupBundleMcpOnRunEnd: params.cleanupBundleMcpOnRunEnd,
  };
}
