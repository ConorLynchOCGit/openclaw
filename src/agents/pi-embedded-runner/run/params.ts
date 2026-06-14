import type { ImageContent } from "@mariozechner/pi-ai";
import type { AuthStorage, ModelRegistry } from "@mariozechner/pi-coding-agent";
import type { ReplyPayload } from "../../../auto-reply/reply-payload.js";
import type { ReplyOperation } from "../../../auto-reply/reply/reply-run-registry.js";
import type { ReasoningLevel, ThinkLevel, VerboseLevel } from "../../../auto-reply/thinking.js";
import type { OpenClawConfig } from "../../../config/types.openclaw.js";
import type { PromptImageOrderEntry } from "../../../media/prompt-image-order.js";
import type { ProviderRuntimeModel } from "../../../plugins/provider-runtime-model.types.js";
import type { CommandQueueEnqueueFn } from "../../../process/command-queue.types.js";
import type { InputProvenance } from "../../../sessions/input-provenance.js";
import type { ExecElevatedDefaults, ExecToolDefaults } from "../../bash-tools.exec-types.js";
import type { AgentStreamParams, ClientToolDefinition } from "../../command/shared-types.js";
import type { AgentInternalEvent } from "../../internal-events.js";
import type { OpenClawNodeAuthorityOverlay } from "../../node-authority-overlay.js";
import type { BlockReplyPayload } from "../../pi-embedded-payloads.js";
import type {
  BlockReplyChunking,
  ToolResultFormat,
} from "../../pi-embedded-subscribe.shared-types.js";
import type { AnyAgentTool } from "../../pi-tools.types.js";
import type { NativeTaskRunChildTask } from "../../session-runtime/native-task-types.js";
import type { SessionLockAcquisitionTrace } from "../../session-write-lock.js";
import type { SkillSnapshot } from "../../skills.js";
import type { RequiredProviderContextAdmission } from "../../system-prompt-report.js";
import type {
  StartExecutionSessionToolInput,
  StartExecutionSessionToolResult,
} from "../../tools/start-execution-session-tool.js";
import type {
  WorkQueueExecutionEligibilityToolInput,
  WorkQueueExecutionEligibilityToolResult,
} from "../../tools/work-queue-execution-eligibility-tool.js";
export type { ClientToolDefinition } from "../../command/shared-types.js";

export type EmbeddedRunTrigger = "cron" | "heartbeat" | "manual" | "memory" | "overflow" | "user";

export type RunEmbeddedPiAgentParams = {
  sessionId: string;
  sessionKey?: string;
  agentId?: string;
  messageChannel?: string;
  messageProvider?: string;
  agentAccountId?: string;
  /** What initiated this agent run: "user", "heartbeat", "cron", "memory", "overflow", or "manual". */
  trigger?: EmbeddedRunTrigger;
  /** Relative workspace path that memory-triggered writes are allowed to append to. */
  memoryFlushWritePath?: string;
  /** Delivery target (e.g. telegram:group:123:topic:456) for topic/thread routing. */
  messageTo?: string;
  /** Thread/topic identifier for routing replies to the originating thread. */
  messageThreadId?: string | number;
  /** Group id for channel-level tool policy resolution. */
  groupId?: string | null;
  /** Group channel label (e.g. #general) for channel-level tool policy resolution. */
  groupChannel?: string | null;
  /** Group space label (e.g. guild/team id) for channel-level tool policy resolution. */
  groupSpace?: string | null;
  /** Parent session key for subagent policy inheritance. */
  spawnedBy?: string | null;
  /** Parent tool call id when this session was launched by a native task tool. */
  parentToolCallId?: string | null;
  /** Node run id when this agent session is bound to Execution Platform node lifecycle. */
  nodeRunId?: string | null;
  senderId?: string | null;
  senderName?: string | null;
  senderUsername?: string | null;
  senderE164?: string | null;
  /** Whether the sender is an owner (required for owner-only tools). */
  senderIsOwner?: boolean;
  /** Current channel ID for auto-threading (Slack). */
  currentChannelId?: string;
  /** Current thread timestamp for auto-threading (Slack). */
  currentThreadTs?: string;
  /** Current inbound message id for action fallbacks (e.g. Telegram react). */
  currentMessageId?: string | number;
  /** Reply-to mode for Slack auto-threading. */
  replyToMode?: "off" | "first" | "all" | "batched";
  /** Mutable ref to track if a reply was sent (for "first" mode). */
  hasRepliedRef?: { value: boolean };
  /** Require explicit message tool targets (no implicit last-route sends). */
  requireExplicitMessageTarget?: boolean;
  /** If true, omit the message tool from the tool list. */
  disableMessageTool?: boolean;
  /** Allow runtime plugins for this run to late-bind the gateway subagent. */
  allowGatewaySubagentBinding?: boolean;
  /** Optional runtime plugin scope for pre-run native plugin activation. */
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
  /** Optional client-provided tools (OpenResponses hosted tools). */
  clientTools?: ClientToolDefinition[];
  /** Disable built-in tools for this run (LLM-only mode). */
  disableTools?: boolean;
  provider?: string;
  model?: string;
  /** Optional caller-admitted auth storage to avoid rediscovery below session launch. */
  authStorage?: AuthStorage;
  /** Optional caller-admitted model registry to avoid rediscovery below session launch. */
  modelRegistry?: ModelRegistry;
  /** Optional caller-admitted runtime model. When present, this is the model authority for native launches. */
  admittedRuntimeModel?: ProviderRuntimeModel;
  authProfileId?: string;
  authProfileIdSource?: "auto" | "user";
  thinkLevel?: ThinkLevel;
  fastMode?: boolean;
  verboseLevel?: VerboseLevel;
  reasoningLevel?: ReasoningLevel;
  toolResultFormat?: ToolResultFormat;
  /** If true, suppress tool error warning payloads for this run (including mutating tools). */
  suppressToolErrorWarnings?: boolean;
  /** Bootstrap context mode for workspace file injection. */
  bootstrapContextMode?: "full" | "lightweight";
  /** Run kind hint for context mode behavior. */
  bootstrapContextRunKind?: "default" | "heartbeat" | "cron";
  /** Optional tool allow-list; when set, only these tools are sent to the model. */
  toolsAllow?: string[];
  /** Additional caller-owned tools sent through the normal OpenClaw tool pipeline. */
  extraTools?: AnyAgentTool[];
  /**
   * Native runtime tools bound by the owning runner for this session.
   *
   * These tools are inserted into the canonical OpenClaw tool construction
   * pipeline before policy filtering and inventory projection. Use this for
   * session-scoped native tools such as node_finish and openclaw_resource_read,
   * not for replay-only side channels.
   */
  nativeRuntimeTools?: AnyAgentTool[];
  /** Runtime-owned launcher for native RuntimeJob-backed execution sessions. */
  nativeExecutionSession?: {
    enabled: boolean;
    startExecutionSession: (
      input: StartExecutionSessionToolInput,
    ) => Promise<StartExecutionSessionToolResult>;
    readWorkQueueEligibility?: (
      input: WorkQueueExecutionEligibilityToolInput,
    ) => Promise<WorkQueueExecutionEligibilityToolResult>;
  };
  /** Optional node-scoped authority overlay that narrows native OpenClaw tools. */
  nodeAuthorityOverlay?: OpenClawNodeAuthorityOverlay;
  /** Optional OpenClaw-native guard for execution node parent crawl behavior. */
  nodeAgentParentCrawlGuard?: { enabled: boolean };
  /** Optional native task-only parent catalog mode for executable node sessions. */
  nodeAgentNativeTaskMode?: {
    enabled: boolean;
    allowedAgentIds: readonly string[];
    mutationToolName?: string;
    parentToolNames?: readonly string[];
    parentVisibleResultMaxChars?: number;
    runChildTask?: NativeTaskRunChildTask;
  };
  /**
   * Optional native provider-context admission gate. When set, the embedded
   * runner proves required bootstrap files/skills are present in the final
   * provider-visible system prompt report before sending the model call.
   */
  requiredProviderContextAdmission?: RequiredProviderContextAdmission;
  /** Seen bootstrap truncation warning signatures for this session (once mode dedupe). */
  bootstrapPromptWarningSignaturesSeen?: string[];
  /** Last shown bootstrap truncation warning signature for this session. */
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
  /** Optional caller-provided compaction summary instructions. */
  customInstructions?: string;
  internalEvents?: AgentInternalEvent[];
  inputProvenance?: InputProvenance;
  streamParams?: AgentStreamParams;
  ownerNumbers?: string[];
  enforceFinalTag?: boolean;
  silentExpected?: boolean;
  /**
   * Allow a single run attempt even when all auth profiles are in cooldown,
   * but only for inferred transient cooldowns like `rate_limit` or `overloaded`.
   *
   * This is used by model fallback when trying sibling models on providers
   * where transient service pressure is often model-scoped.
   */
  allowTransientCooldownProbe?: boolean;
  /**
   * Dispose bundled MCP runtimes when the overall run ends instead of preserving
   * the session-scoped cache. Intended for one-shot local CLI runs that must
   * exit promptly after emitting the final JSON result.
   */
  cleanupBundleMcpOnRunEnd?: boolean;
};
