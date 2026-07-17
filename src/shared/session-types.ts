import type { ChatType } from "../channels/chat-type.js";
import type {
  SessionCompactionCheckpoint,
  SessionEntry,
  SessionGoal,
} from "../config/sessions/types.js";
import type { PluginSessionExtensionProjection } from "../plugins/host-hooks.js";
import type { DeliveryContext } from "../utils/delivery-context.types.js";
import type { ReadbackProgressProjection } from "./readback-progress.js";

/** Agent identity fields returned by gateway session listing APIs. */
export type GatewayAgentIdentity = {
  name?: string;
  theme?: string;
  emoji?: string;
  avatar?: string;
  avatarUrl?: string;
};

/** Model summary returned for an agent/session row. */
export type GatewayAgentModel = {
  primary?: string;
  fallbacks?: string[];
};

/** Runtime selection metadata for an agent row. */
export type GatewayAgentRuntime = {
  id: string;
  fallback?: "openclaw" | "none";
  source: "env" | "agent" | "defaults" | "model" | "provider" | "implicit" | "session-key";
};

/** Thinking-level option exposed to UI clients. */
export type GatewayThinkingLevelOption = {
  id: string;
  label: string;
};

/** Common agent row shape used by session list responses. */
export type GatewayAgentRow = {
  id: string;
  name?: string;
  identity?: GatewayAgentIdentity;
  workspace?: string;
  model?: GatewayAgentModel;
  agentRuntime?: GatewayAgentRuntime;
  thinkingLevels?: GatewayThinkingLevelOption[];
  thinkingOptions?: string[];
  thinkingDefault?: string;
};

/** Runtime status surfaced for the latest session run. */
export type SessionRunStatus = "running" | "done" | "failed" | "killed" | "timeout";

export type ReadbackFieldProvenance = {
  source:
    | "session-store"
    | "session-transcript"
    | "task-registry"
    | "task-receipt"
    | "trajectory"
    | "codex-native-subagent"
    | "artifact-registry"
    | "gbrain-pointer";
  ref: string;
  eventType?: string;
  eventSeq?: number;
  derivedBy?: string;
  bounded?: boolean;
  note?: string;
};

export type SessionReadbackProvenance = {
  status?: ReadbackFieldProvenance;
  activeProgress?: ReadbackProgressProjection;
  finalAssistantText?: ReadbackFieldProvenance;
};

export type SessionCompactionCheckpointPreview = Pick<
  SessionCompactionCheckpoint,
  "checkpointId" | "createdAt" | "reason"
>;

export type GatewaySessionCodexNativeChildRun = {
  source: "codex-native";
  taskId: string;
  runId?: string;
  childThreadId?: string;
  parentThreadId?: string;
  parentTurnId?: string;
  finalRef?: string;
  role?: string;
  agentPath?: string;
  objective?: string;
  taskName?: string;
  model?: string;
  reasoningEffort?: string;
  label?: string;
  status?: string;
  terminalOutcome?: string;
  startedAt?: number;
  endedAt?: number;
  lastEventAt?: number;
  progressSummary?: string;
  terminalSummary?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    cachedInputTokens?: number;
    reasoningOutputTokens?: number;
    totalTokens?: number;
  };
};

export type GatewaySessionCodexTeamUsage = {
  basis: "cumulative";
  state: "provisional" | "settled" | "partial";
  parentRoundCount?: number;
  childCount: number;
  /** Total prompt input, including cache reads, when every contributor reports it. */
  inputTokens?: number;
  /** Prompt input that was not served from cache. */
  freshInputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  reasoningOutputTokens?: number;
  totalTokens?: number;
};

export type GatewaySessionCodexUsage = {
  /** Total prompt input, including cache reads. */
  inputTokens?: number;
  freshInputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
  reasoningOutputTokens?: number;
  totalTokens?: number;
};

/** A bounded parent turn reconstructed from native Codex trajectory evidence. */
export type GatewaySessionCodexParentRound = {
  threadId: string;
  turnId: string;
  provider?: string;
  model?: string;
  reasoningEffort?: string;
  startedAt?: number;
  endedAt?: number;
  durationMs?: number;
  currentTurnUsage?: GatewaySessionCodexUsage;
  cumulativeUsage?: GatewaySessionCodexUsage;
  contributionUsage?: GatewaySessionCodexUsage;
  finalRef?: string;
  failureClass?: "failed" | "interrupted" | "timeout";
  coverage: "none" | "partial" | "complete";
  settlement: "pending" | "partial" | "settled";
  children: GatewaySessionCodexNativeChildRun[];
};

/** Detail-only parent-round/child execution tree. Never used for list ranking. */
export type GatewaySessionCodexExecutionTree = {
  source: "trajectory";
  rounds: GatewaySessionCodexParentRound[];
  /** Children whose exact parent turn cannot be proved from retained native events. */
  unassignedChildren?: GatewaySessionCodexNativeChildRun[];
  settlement: "pending" | "partial" | "settled";
};

/** Honest readback of the two token bases retained for an OpenClaw session run. */
export type GatewaySessionUsage = {
  state: "provisional" | "settled" | "unavailable";
  run?: {
    basis: "run-cumulative";
    inputTokens?: number;
    outputTokens?: number;
    estimatedCostUsd?: number;
  };
  context?: {
    basis: "latest-context";
    promptTokens?: number;
    windowTokens?: number;
    fresh: boolean;
  };
};

export type GatewaySessionTaskStatus = "complete" | "partial" | "blocked";
export type GatewaySessionReviewDecision = "approve" | "revise" | "block" | "needs_more_research";
/** Legacy field type retained only for readback of already-stored transcripts. */
export type GatewaySessionLaneVerdict = GatewaySessionTaskStatus;

export type GatewaySessionCodexToolMix = {
  shell: number;
  mcp: number;
  lsp: number;
  browser: number;
  image: number;
  collaboration: number;
  spawnAgent: number;
  waitAgent: number;
  applyPatch: number;
};

export type GatewaySessionCodexExecutionEvidence = {
  source: "trajectory";
  ref: string;
  derivedBy: "readCodexExecutionEvidenceProjection";
  bounded: true;
  observedEventCount: number;
  toolCallCount: number;
  toolResultCount: number;
  peakConcurrentToolCalls?: number;
  toolMix?: GatewaySessionCodexToolMix;
  byThread?: Array<{
    threadId: string;
    role?: string;
    objective?: string;
    observedEventCount: number;
    eventSeqStart?: number;
    eventSeqEnd?: number;
    toolCallCount: number;
    toolResultCount: number;
    peakConcurrentToolCalls?: number;
    toolMix?: GatewaySessionCodexToolMix;
    mcpTools?: string[];
    lspTools?: string[];
    shellSamples?: string[];
    validationCommands?: string[];
    patchCount?: number;
  }>;
  patchCount?: number;
  validationCommands?: string[];
  workspaceDirs?: string[];
  threadIds?: string[];
  tools?: Array<{
    name: string;
    count: number;
    completed?: number;
    errored?: number;
    lastStatus?: string;
    lastEventSeq?: number;
  }>;
  mcpTools?: Array<{
    server: string;
    tool: string;
    count: number;
    completed?: number;
    errored?: number;
    lastStatus?: string;
    lastEventSeq?: number;
    paths?: string[];
    roots?: string[];
    projectModes?: string[];
  }>;
  lspTools?: Array<{
    tool: string;
    count: number;
    completed?: number;
    lastStatus?: string;
    lastEventSeq?: number;
    files?: string[];
    projectModes?: string[];
    partial?: boolean;
  }>;
  shell?: {
    count: number;
    completed?: number;
    errored?: number;
    cwd?: string[];
    commandSamples?: string[];
  };
  nativeParallelActivity?: {
    observed: true;
    peakConcurrentToolCalls: number;
  };
  modelCompleted?: boolean;
  sessionEndedStatus?: string;
  latestAttemptStatus?: string;
  latestAttemptId?: string;
  lastEventSeq?: number;
  lastEventType?: string;
  lastObservedAt?: string;
};

/** Canonical transport row shared by gateway producers and UI consumers. */
export type GatewaySessionRow = {
  key: string;
  agentId?: string;
  spawnedBy?: string;
  spawnedWorkspaceDir?: string;
  spawnedCwd?: string;
  forkedFromParent?: boolean;
  spawnDepth?: number;
  subagentRole?: SessionEntry["subagentRole"];
  subagentControlScope?: SessionEntry["subagentControlScope"];
  kind: "cron" | "direct" | "group" | "global" | "unknown";
  label?: string;
  displayName?: string;
  derivedTitle?: string;
  lastMessagePreview?: string;
  finalAssistantText?: string | null;
  activeProgress?: ReadbackProgressProjection | null;
  readbackProvenance?: SessionReadbackProvenance;
  promptContext?: {
    skills?: {
      promptChars?: number;
      promptHash?: string;
      promptRef?: NonNullable<SessionEntry["skillsSnapshot"]>["promptRef"];
      skillCount?: number;
      skillNames?: string[];
      skillFilter?: string[];
    };
    systemPrompt?: {
      chars?: number;
      hash?: string;
      source?: NonNullable<SessionEntry["systemPromptReport"]>["source"];
      generatedAt?: number;
    };
    openclawDynamicTools?: {
      count?: number;
      names?: string[];
      schemaChars?: number;
    };
    codexNativeWorkbench?: {
      active: boolean;
      mode?: string;
      codeModeConfigured?: boolean;
      codeModeOnlyConfigured?: boolean;
    };
    codexMcpServers?: { count: number; names: string[] };
    codexCustomAgents?: { count: number; names: string[] };
    codexNativeSurface?: NonNullable<SessionEntry["systemPromptReport"]>["codexNativeSurface"];
  };
  channel?: string;
  surface?: string;
  subject?: string;
  groupChannel?: string;
  room?: string;
  space?: string;
  chatType?: ChatType;
  origin?: SessionEntry["origin"];
  updatedAt: number | null;
  lastObservedActivityAt?: number | null;
  lastObservedActivitySource?: "own" | "direct-child" | "descendant";
  sessionId?: string;
  systemSent?: boolean;
  abortedLastRun?: boolean;
  thinkingLevel?: string;
  thinkingLevels?: GatewayThinkingLevelOption[];
  thinkingOptions?: string[];
  thinkingDefault?: string;
  fastMode?: boolean;
  verboseLevel?: string;
  traceLevel?: string;
  reasoningLevel?: string;
  elevatedLevel?: string;
  sendPolicy?: "allow" | "deny";
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  totalTokensFresh?: boolean;
  usageCostState?: "provisional" | "settled" | "unavailable";
  usage?: GatewaySessionUsage;
  goal?: SessionGoal;
  estimatedCostUsd?: number;
  status?: SessionRunStatus;
  archived?: boolean;
  hasActiveRun?: boolean;
  subagentRunState?: "active" | "interrupted" | "historical";
  hasActiveSubagentRun?: boolean;
  startedAt?: number;
  endedAt?: number;
  runtimeMs?: number;
  parentSessionKey?: string;
  childSessions?: string[];
  codexNativeChildRuns?: GatewaySessionCodexNativeChildRun[];
  codexTeamUsage?: GatewaySessionCodexTeamUsage;
  /** Lightweight marker so list rows can open detail without carrying the tree. */
  hasCodexExecution?: boolean;
  codexExecutionTree?: GatewaySessionCodexExecutionTree;
  finalDelivery?: {
    state: "pending" | "settled" | "not_requested";
    createdAt?: number;
    lastAttemptAt?: number;
    attemptCount?: number;
    lastError?: string | null;
  };
  /** Exact model-authored task lifecycle observation from the settled transcript. */
  taskStatus?: GatewaySessionTaskStatus;
  /** Exact model-authored artifact review observation; never inferred from task or transport state. */
  reviewDecision?: GatewaySessionReviewDecision;
  /** Legacy Verdict observation retained only for already-stored transcripts. */
  laneVerdict?: GatewaySessionLaneVerdict;
  codexExecutionEvidence?: GatewaySessionCodexExecutionEvidence;
  responseUsage?: "on" | "off" | "tokens" | "full";
  modelProvider?: string;
  model?: string;
  agentRuntime?: GatewayAgentRuntime;
  contextTokens?: number;
  contextBudgetStatus?: SessionEntry["contextBudgetStatus"];
  deliveryContext?: DeliveryContext;
  lastChannel?: SessionEntry["lastChannel"];
  lastTo?: string;
  lastAccountId?: string;
  lastThreadId?: SessionEntry["lastThreadId"];
  compactionCheckpointCount?: number;
  latestCompactionCheckpoint?: SessionCompactionCheckpointPreview;
  pluginExtensions?: PluginSessionExtensionProjection[];
};

/** Generic base for paged session-list responses. */
export type SessionsListResultBase<TDefaults, TRow> = {
  ts: number;
  path: string;
  count: number;
  totalCount?: number;
  limitApplied?: number;
  offset?: number;
  nextOffset?: number | null;
  hasMore?: boolean;
  defaults: TDefaults;
  sessions: TRow[];
};

/** Generic base for successful session patch responses. */
export type SessionsPatchResultBase<TEntry> = {
  ok: true;
  path: string;
  key: string;
  entry: TEntry;
};
