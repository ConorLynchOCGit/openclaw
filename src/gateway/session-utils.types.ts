// Shared Gateway session projection types.
// Keeps server methods and Control UI payloads aligned.
import type { ChatType } from "../channels/chat-type.js";
import type {
  SessionCompactionCheckpoint,
  SessionEntry,
  SessionGoal,
} from "../config/sessions/types.js";
import type { PluginSessionExtensionProjection } from "../plugins/host-hooks.js";
import type { ReadbackProgressProjection } from "../shared/readback-progress.js";
import type {
  GatewayAgentRuntime,
  GatewayAgentRow as SharedGatewayAgentRow,
  GatewayThinkingLevelOption,
  SessionsListResultBase,
  SessionsPatchResultBase,
} from "../shared/session-types.js";
import type { DeliveryContext } from "../utils/delivery-context.types.js";

// Shared Gateway session response contracts. Server methods, UI adapters, and
// tests import these types so list/patch/preview payloads evolve together.
export type GatewaySessionsDefaults = {
  modelProvider: string | null;
  model: string | null;
  contextTokens: number | null;
  thinkingLevels?: GatewayThinkingLevelOption[];
  thinkingOptions?: string[];
  thinkingDefault?: string;
};

/** Runtime status surfaced for the latest session run. */
export type SessionRunStatus = "running" | "done" | "failed" | "killed" | "timeout";

export type ReadbackFieldProvenance = {
  source: "session-store" | "session-transcript" | "trajectory" | "task-receipt";
  ref: string;
  eventType?: string;
  eventSeq?: number;
  derivedBy?: string;
  bounded?: boolean;
  note?: string;
};

export type { ReadbackProgressProjection };

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
  role?: string;
  agentPath?: string;
  objective?: string;
  label?: string;
  status?: string;
  terminalOutcome?: string;
  startedAt?: number;
  endedAt?: number;
  lastEventAt?: number;
  progressSummary?: string;
  terminalSummary?: string;
};

export type GatewaySessionCodexExecutionEvidence = {
  source: "trajectory";
  ref: string;
  derivedBy: "readCodexExecutionEvidenceProjection";
  bounded: true;
  observedEventCount: number;
  toolCallCount: number;
  toolResultCount: number;
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
  modelCompleted?: boolean;
  sessionEndedStatus?: string;
  lastEventSeq?: number;
  lastEventType?: string;
  lastObservedAt?: string;
};

export type GatewaySessionRow = {
  key: string;
  agentId: string;
  spawnedBy?: string;
  spawnedWorkspaceDir?: string;
  spawnedCwd?: string;
  forkedFromParent?: boolean;
  spawnDepth?: number;
  subagentRole?: SessionEntry["subagentRole"];
  subagentControlScope?: SessionEntry["subagentControlScope"];
  kind: "direct" | "group" | "global" | "unknown";
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
    tools?: {
      count?: number;
      names?: string[];
      schemaChars?: number;
    };
    codexNativeSurface?: NonNullable<SessionEntry["systemPromptReport"]>["codexNativeSurface"];
  };
  channel?: string;
  subject?: string;
  groupChannel?: string;
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
  goal?: SessionGoal;
  estimatedCostUsd?: number;
  status?: SessionRunStatus;
  hasActiveRun?: boolean;
  startedAt?: number;
  endedAt?: number;
  runtimeMs?: number;
  parentSessionKey?: string;
  childSessions?: string[];
  codexNativeChildRuns?: GatewaySessionCodexNativeChildRun[];
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

export type GatewayAgentRow = SharedGatewayAgentRow;

export type SessionPreviewItem = {
  role: "user" | "assistant" | "tool" | "system" | "other";
  text: string;
};

export type SessionsPreviewEntry = {
  key: string;
  status: "ok" | "empty" | "missing" | "error";
  items: SessionPreviewItem[];
};

export type SessionsPreviewResult = {
  ts: number;
  previews: SessionsPreviewEntry[];
};

export type SessionsListResult = SessionsListResultBase<GatewaySessionsDefaults, GatewaySessionRow>;

export type SessionsPatchResult = SessionsPatchResultBase<SessionEntry> & {
  entry: SessionEntry;
  resolved?: {
    modelProvider?: string;
    model?: string;
    agentRuntime?: GatewayAgentRuntime;
  };
};
