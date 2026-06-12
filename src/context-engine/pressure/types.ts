import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { CompactResult, ContextEngine, ContextEngineRuntimeContext } from "../types.js";

export type ContextPressureTrigger =
  | "actual_usage"
  | "provider_overflow"
  | "timeout_high_usage"
  | "preflight_emergency_estimate"
  | "manual";

export type ContextPressureAction = "proceed" | "prune_retry" | "summary_retry" | "block" | "fail";

export type ContextBudgetSnapshot = {
  contextWindowTokens: number;
  reserveTokens: number;
  usableTokens: number;
};

export type ProviderUsageSnapshot = {
  source: "provider" | "estimate";
  promptTokens?: number;
  totalTokens?: number;
  cacheRead?: number;
  cacheWrite?: number;
};

export type EstimateSnapshot = {
  promptTokens: number;
  emergencyOnly?: boolean;
};

export type PressureSnapshot = {
  overBudgetTokens?: number;
  emergency?: boolean;
};

export type PruneSnapshot = {
  attempted: boolean;
  truncatedCount?: number;
  durationMs?: number;
  reducibleChars?: number;
  reason?: string;
};

export type SummarySnapshot = {
  attempted: boolean;
  compacted?: boolean;
  durationMs?: number;
  tokensAfter?: number;
  reason?: string;
  target?: "budget" | "threshold";
};

export type ContinuationSnapshot = {
  strategy: string;
  sourceWindowCount?: number;
  changedFileCount?: number;
};

export type DiagnosticsSnapshot = {
  source?: string;
  message?: string;
  reasonCodes?: string[];
};

export type ContextBreakdownSnapshot = {
  sourceOrLocatorChars: number;
  nonSourceVisibleChars: number;
  strippedDetailsChars: number;
};

export type ContextPressureDecision = {
  trigger: ContextPressureTrigger;
  action: ContextPressureAction;
  diagId: string;
  budget: ContextBudgetSnapshot;
  usage?: ProviderUsageSnapshot;
  estimate?: EstimateSnapshot;
  pressure?: PressureSnapshot;
  prune?: PruneSnapshot;
  summary?: SummarySnapshot;
  continuation?: ContinuationSnapshot;
  diagnostics?: DiagnosticsSnapshot;
  contextBreakdown?: ContextBreakdownSnapshot;
};

export type PruneResult = {
  truncated: boolean;
  truncatedCount?: number;
  reason?: string;
  durationMs?: number;
};

export type ContextPressureOutcome =
  | { action: "proceed"; decision: ContextPressureDecision }
  | { action: "prune_retry"; decision: ContextPressureDecision; prune: PruneResult }
  | { action: "summary_retry"; decision: ContextPressureDecision; summary?: CompactResult }
  | { action: "block"; decision: ContextPressureDecision; reason: string }
  | { action: "fail"; decision: ContextPressureDecision; error: Error };

export type SourceWindow = {
  path: string;
  startLine?: number;
  endLine?: number;
  content?: string;
};

export type DiagnosticSummary = {
  path?: string;
  line?: number;
  column?: number;
  severity?: string;
  message: string;
};

export type ContinuationPacket = {
  instructions?: string;
  sourceWindows?: SourceWindow[];
  changedFiles?: string[];
  diagnostics?: DiagnosticSummary[];
};

export type ContinuationStrategyBuildParams = {
  trigger: ContextPressureTrigger;
  messages?: AgentMessage[];
  objective?: string;
  existingInstructions?: string;
  runtimeContext?: ContextEngineRuntimeContext;
  nodeTrace?: Record<string, unknown>;
  readSourceWindow?: (request: {
    path: string;
    line?: number | null;
  }) => Promise<string | undefined>;
};

export type ContinuationStrategy = {
  id: string;
  build(params: ContinuationStrategyBuildParams): Promise<ContinuationPacket>;
};

export type ContextPressureRecoverParams = {
  trigger: ContextPressureTrigger;
  sessionId: string;
  sessionKey?: string;
  sessionFile: string;
  provider?: string;
  modelId?: string;
  contextEngine: ContextEngine;
  contextWindowTokens: number;
  reserveTokens?: number;
  usage?: ProviderUsageSnapshot;
  currentTokenCount?: number;
  contextBreakdown?: ContextBreakdownSnapshot;
  runtimeContext?: ContextEngineRuntimeContext;
  continuationStrategy?: ContinuationStrategy;
  objective?: string;
  existingInstructions?: string;
  nodeTrace?: Record<string, unknown>;
  readSourceWindow?: ContinuationStrategyBuildParams["readSourceWindow"];
  summaryTarget?: "budget" | "threshold";
  forceSummary?: boolean;
  prune?: () => Promise<PruneResult>;
  beforeSummary?: () => Promise<void>;
  afterSummary?: (result: CompactResult) => Promise<void>;
  onSummaryCompacted?: (result: CompactResult) => Promise<void>;
  emit?: (event: Record<string, unknown>) => void | Promise<void>;
  log?: {
    info?: (message: string) => void;
    warn?: (message: string) => void;
  };
};

export type ContextPressureBeforeSubmitParams = {
  messages: AgentMessage[];
  systemPrompt?: string;
  prompt: string;
  contextWindowTokens: number;
  reserveTokens: number;
  preferActualUsageCompaction?: boolean;
  contextEngineOwnsCompaction?: boolean;
  pruneReducibleChars: number;
  truncateToolResults?: () => PruneResult | Promise<PruneResult>;
  protectedContextReason?: string;
  contextBreakdown?: ContextBreakdownSnapshot;
  emit?: (event: Record<string, unknown>) => void | Promise<void>;
};

export type ContextPressureAfterTurnParams = {
  sessionId: string;
  sessionKey?: string;
  sessionFile: string;
  provider?: string;
  modelId?: string;
  contextEngine: ContextEngine;
  contextWindowTokens: number;
  usage?: ProviderUsageSnapshot;
  messages?: AgentMessage[];
  contextBreakdown?: ContextBreakdownSnapshot;
  runtimeContext?: ContextEngineRuntimeContext;
  continuationStrategy?: ContinuationStrategy;
  objective?: string;
  existingInstructions?: string;
  nodeTrace?: Record<string, unknown>;
  readSourceWindow?: ContinuationStrategyBuildParams["readSourceWindow"];
  prune?: () => Promise<PruneResult>;
  beforeSummary?: () => Promise<void>;
  afterSummary?: (result: CompactResult) => Promise<void>;
  onSummaryCompacted?: (result: CompactResult) => Promise<void>;
  emit?: (event: Record<string, unknown>) => void | Promise<void>;
};

export type ContextPressureController = {
  beforeSubmit(params: ContextPressureBeforeSubmitParams): Promise<ContextPressureOutcome>;
  afterTurn(params: ContextPressureAfterTurnParams): Promise<ContextPressureOutcome>;
  recover(params: ContextPressureRecoverParams): Promise<ContextPressureOutcome>;
};
