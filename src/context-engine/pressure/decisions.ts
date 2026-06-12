import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { estimateTokens } from "@mariozechner/pi-coding-agent";
import { SAFETY_MARGIN, estimateMessagesTokens } from "../../agents/compaction.js";
import type {
  ContextBudgetSnapshot,
  ContextPressureAction,
  ContextPressureDecision,
  ContextPressureTrigger,
  EstimateSnapshot,
  ProviderUsageSnapshot,
} from "./types.js";

const ESTIMATED_CHARS_PER_TOKEN = 4;
const TRUNCATION_ROUTE_BUFFER_TOKENS = 512;
const EMERGENCY_ESTIMATE_OVERFLOW_RATIO = 1.15;

export const PREEMPTIVE_OVERFLOW_ERROR_TEXT =
  "Context overflow: prompt too large for the model (precheck).";

export type PreSubmitRoute =
  | "fits"
  | "truncate_tool_results_only"
  | "compact_only"
  | "compact_then_truncate";

export function createContextPressureDiagId(prefix = "ctxp"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function estimatePrePromptTokens(params: {
  messages: AgentMessage[];
  systemPrompt?: string;
  prompt: string;
}): number {
  const syntheticMessages: AgentMessage[] = [];
  if (typeof params.systemPrompt === "string" && params.systemPrompt.trim().length > 0) {
    syntheticMessages.push({
      role: "system",
      content: params.systemPrompt,
      timestamp: 0,
    } as unknown as AgentMessage);
  }
  syntheticMessages.push({ role: "user", content: params.prompt, timestamp: 0 } as AgentMessage);
  const estimated =
    estimateMessagesTokens(params.messages) +
    syntheticMessages.reduce((sum, message) => sum + estimateTokens(message), 0);
  return Math.max(0, Math.ceil(estimated * SAFETY_MARGIN));
}

export function classifyPreSubmitPressure(params: {
  messages: AgentMessage[];
  systemPrompt?: string;
  prompt: string;
  budget: ContextBudgetSnapshot;
  pruneReducibleChars: number;
  emergencyOnly?: boolean;
}): {
  route: PreSubmitRoute;
  shouldCompact: boolean;
  estimatedPromptTokens: number;
  overflowTokens: number;
  trigger: ContextPressureTrigger | null;
  emergency: boolean;
} {
  const estimatedPromptTokens = estimatePrePromptTokens(params);
  const overflowTokens = Math.max(0, estimatedPromptTokens - params.budget.usableTokens);
  const overflowChars = overflowTokens * ESTIMATED_CHARS_PER_TOKEN;
  const truncationBufferChars = TRUNCATION_ROUTE_BUFFER_TOKENS * ESTIMATED_CHARS_PER_TOKEN;
  const truncateOnlyThresholdChars = Math.max(
    overflowChars + truncationBufferChars,
    Math.ceil(overflowChars * 1.5),
  );
  let route: PreSubmitRoute = "fits";
  if (overflowTokens > 0) {
    if (params.pruneReducibleChars <= 0) {
      route = "compact_only";
    } else if (params.pruneReducibleChars >= truncateOnlyThresholdChars) {
      route = "truncate_tool_results_only";
    } else {
      route = "compact_then_truncate";
    }
  }
  const emergency =
    estimatedPromptTokens >
    Math.max(
      params.budget.usableTokens,
      Math.floor(params.budget.contextWindowTokens * EMERGENCY_ESTIMATE_OVERFLOW_RATIO),
    );
  if (route !== "fits" && params.emergencyOnly === true && !emergency) {
    return {
      route: "fits",
      shouldCompact: false,
      estimatedPromptTokens,
      overflowTokens,
      trigger: null,
      emergency: false,
    };
  }
  return {
    route,
    shouldCompact: route === "compact_only" || route === "compact_then_truncate",
    estimatedPromptTokens,
    overflowTokens,
    trigger: route === "fits" ? null : "preflight_emergency_estimate",
    emergency,
  };
}

export function actionForPreSubmitRoute(route: PreSubmitRoute): ContextPressureAction {
  if (route === "fits") {
    return "proceed";
  }
  if (route === "truncate_tool_results_only") {
    return "prune_retry";
  }
  return "summary_retry";
}

export function estimateSnapshotFromPreSubmit(params: {
  estimatedPromptTokens: number;
  emergencyOnly?: boolean;
}): EstimateSnapshot {
  return {
    promptTokens: params.estimatedPromptTokens,
    ...(params.emergencyOnly === true ? { emergencyOnly: true } : {}),
  };
}

export function shouldRecoverAfterActualUsage(params: {
  usage?: ProviderUsageSnapshot;
  budget: ContextBudgetSnapshot;
}): boolean {
  return (
    params.usage?.promptTokens !== undefined &&
    params.usage.promptTokens >= params.budget.usableTokens
  );
}

export function buildBaseDecision(params: {
  trigger: ContextPressureTrigger;
  action: ContextPressureAction;
  diagId?: string;
  budget: ContextBudgetSnapshot;
}): ContextPressureDecision {
  return {
    trigger: params.trigger,
    action: params.action,
    diagId: params.diagId ?? createContextPressureDiagId(),
    budget: params.budget,
  };
}
