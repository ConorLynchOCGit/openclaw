import {
  MIN_PROMPT_BUDGET_RATIO,
  MIN_PROMPT_BUDGET_TOKENS,
} from "../../agents/pi-compaction-constants.js";
import type { ContextBudgetSnapshot } from "./types.js";

const SINGLE_TOOL_RESULT_CONTEXT_SHARE = 0.5;
const PREEMPTIVE_OVERFLOW_RATIO = 0.9;

export function resolveContextPressureBudget(params: {
  contextWindowTokens: number;
  reserveTokens?: number;
}): ContextBudgetSnapshot {
  const contextWindowTokens = Math.max(1, Math.floor(params.contextWindowTokens));
  const requestedReserveTokens = Math.max(0, Math.floor(params.reserveTokens ?? 0));
  const minPromptBudget = Math.min(
    MIN_PROMPT_BUDGET_TOKENS,
    Math.max(1, Math.floor(contextWindowTokens * MIN_PROMPT_BUDGET_RATIO)),
  );
  const reserveTokens = Math.min(
    requestedReserveTokens,
    Math.max(0, contextWindowTokens - minPromptBudget),
  );
  return {
    contextWindowTokens,
    reserveTokens,
    usableTokens: Math.max(1, contextWindowTokens - reserveTokens),
  };
}

export function resolveActualUsagePressureBudget(
  contextWindowTokens: number,
): ContextBudgetSnapshot {
  return resolveContextPressureBudget({
    contextWindowTokens,
    reserveTokens: Math.max(0, Math.floor(Math.max(1, contextWindowTokens) * 0.1)),
  });
}

export function resolveToolResultContextGuardBudget(params: {
  contextWindowTokens: number;
  charsPerToken: number;
  toolResultCharsPerToken: number;
}): {
  contextWindowTokens: number;
  maxContextChars: number;
  maxSingleToolResultChars: number;
} {
  const contextWindowTokens = Math.max(1, Math.floor(params.contextWindowTokens));
  return {
    contextWindowTokens,
    maxContextChars: Math.max(
      1_024,
      Math.floor(contextWindowTokens * params.charsPerToken * PREEMPTIVE_OVERFLOW_RATIO),
    ),
    maxSingleToolResultChars: Math.max(
      1_024,
      Math.floor(
        contextWindowTokens * params.toolResultCharsPerToken * SINGLE_TOOL_RESULT_CONTEXT_SHARE,
      ),
    ),
  };
}
