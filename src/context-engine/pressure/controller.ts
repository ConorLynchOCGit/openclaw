import { resolveActualUsagePressureBudget, resolveContextPressureBudget } from "./budget.js";
import {
  actionForPreSubmitRoute,
  buildBaseDecision,
  classifyPreSubmitPressure,
  estimateSnapshotFromPreSubmit,
  shouldRecoverAfterActualUsage,
} from "./decisions.js";
import { recoverContextPressure } from "./recovery.js";
import { emitContextPressureTelemetry } from "./telemetry.js";
import type {
  ContextPressureController,
  ContextPressureOutcome,
  ContextPressureBeforeSubmitParams,
  ContextPressureAfterTurnParams,
  ContextPressureRecoverParams,
} from "./types.js";

export function createContextPressureController(): ContextPressureController {
  return {
    async beforeSubmit(params: ContextPressureBeforeSubmitParams): Promise<ContextPressureOutcome> {
      const budget = resolveContextPressureBudget({
        contextWindowTokens: params.contextWindowTokens,
        reserveTokens: params.reserveTokens,
      });
      if (params.contextEngineOwnsCompaction === true) {
        const decision = buildBaseDecision({
          trigger: "preflight_emergency_estimate",
          action: "proceed",
          budget,
        });
        await emitContextPressureTelemetry({ decision, emit: params.emit });
        return { action: "proceed", decision };
      }
      const classified = classifyPreSubmitPressure({
        messages: params.messages,
        systemPrompt: params.systemPrompt,
        prompt: params.prompt,
        budget,
        pruneReducibleChars: params.pruneReducibleChars,
        emergencyOnly: params.preferActualUsageCompaction,
      });
      const action = actionForPreSubmitRoute(classified.route);
      let decision = buildBaseDecision({
        trigger: "preflight_emergency_estimate",
        action,
        budget,
      });
      decision = {
        ...decision,
        estimate: estimateSnapshotFromPreSubmit({
          estimatedPromptTokens: classified.estimatedPromptTokens,
          emergencyOnly: params.preferActualUsageCompaction,
        }),
        pressure: {
          overBudgetTokens: classified.overflowTokens,
          emergency: classified.emergency,
        },
        prune: {
          attempted: false,
          reducibleChars: params.pruneReducibleChars,
        },
        ...(params.contextBreakdown ? { contextBreakdown: params.contextBreakdown } : {}),
      };
      if (classified.route === "fits") {
        decision = { ...decision, action: "proceed" };
        await emitContextPressureTelemetry({ decision, emit: params.emit });
        return { action: "proceed", decision };
      }
      if (params.protectedContextReason) {
        decision = {
          ...decision,
          action: "block",
          diagnostics: { source: "preflight", message: params.protectedContextReason },
        };
        await emitContextPressureTelemetry({ decision, emit: params.emit });
        return { action: "block", decision, reason: params.protectedContextReason };
      }
      if (classified.route === "truncate_tool_results_only" && params.truncateToolResults) {
        const prune = await params.truncateToolResults();
        decision = {
          ...decision,
          action: prune.truncated ? "prune_retry" : "summary_retry",
          prune: {
            attempted: true,
            truncatedCount: prune.truncatedCount ?? 0,
            durationMs: prune.durationMs,
            reason: prune.reason,
            reducibleChars: params.pruneReducibleChars,
          },
        };
        await emitContextPressureTelemetry({ decision, emit: params.emit });
        if (prune.truncated) {
          return { action: "prune_retry", decision, prune };
        }
        return { action: "summary_retry", decision };
      }
      await emitContextPressureTelemetry({ decision, emit: params.emit });
      return { action: "summary_retry", decision };
    },

    async afterTurn(params: ContextPressureAfterTurnParams): Promise<ContextPressureOutcome> {
      const budget = resolveActualUsagePressureBudget(params.contextWindowTokens);
      if (!shouldRecoverAfterActualUsage({ usage: params.usage, budget })) {
        const decision = buildBaseDecision({
          trigger: "actual_usage",
          action: "proceed",
          budget,
        });
        await emitContextPressureTelemetry({ decision, emit: params.emit });
        return { action: "proceed", decision };
      }
      return recoverContextPressure({
        trigger: "actual_usage",
        sessionId: params.sessionId,
        sessionKey: params.sessionKey,
        sessionFile: params.sessionFile,
        provider: params.provider,
        modelId: params.modelId,
        contextEngine: params.contextEngine,
        contextWindowTokens: params.contextWindowTokens,
        reserveTokens: budget.reserveTokens,
        usage: params.usage,
        currentTokenCount: params.usage?.promptTokens,
        contextBreakdown: params.contextBreakdown,
        runtimeContext: params.runtimeContext,
        continuationStrategy: params.continuationStrategy,
        objective: params.objective,
        existingInstructions: params.existingInstructions,
        nodeTrace: params.nodeTrace,
        readSourceWindow: params.readSourceWindow,
        summaryTarget: "threshold",
        prune: params.prune,
        beforeSummary: params.beforeSummary,
        afterSummary: params.afterSummary,
        onSummaryCompacted: params.onSummaryCompacted,
        emit: params.emit,
      });
    },

    async recover(params: ContextPressureRecoverParams): Promise<ContextPressureOutcome> {
      return recoverContextPressure(params);
    },
  };
}
