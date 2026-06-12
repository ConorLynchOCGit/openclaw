import type { CompactResult } from "../types.js";
import { resolveContextPressureBudget } from "./budget.js";
import { defaultContinuationStrategy, renderContinuationPacket } from "./continuation.js";
import { buildBaseDecision } from "./decisions.js";
import { emitContextPressureTelemetry } from "./telemetry.js";
import type {
  ContextPressureDecision,
  ContextPressureOutcome,
  ContextPressureRecoverParams,
  PruneResult,
} from "./types.js";

function mergeRuntimeContext(
  base: ContextPressureRecoverParams["runtimeContext"],
  extra: Record<string, unknown>,
): ContextPressureRecoverParams["runtimeContext"] {
  return {
    ...base,
    ...extra,
  };
}

function pruneSnapshotFromResult(result: PruneResult, durationMs?: number) {
  return {
    attempted: true,
    truncatedCount: result.truncatedCount ?? 0,
    durationMs: result.durationMs ?? durationMs,
    reason: result.reason,
  };
}

function compactResultToSummarySnapshot(params: {
  result: CompactResult;
  durationMs: number;
  target?: "budget" | "threshold";
}) {
  return {
    attempted: true,
    compacted: params.result.compacted,
    durationMs: params.durationMs,
    tokensAfter: params.result.result?.tokensAfter,
    reason: params.result.reason,
    target: params.target,
  };
}

export async function recoverContextPressure(
  params: ContextPressureRecoverParams,
): Promise<ContextPressureOutcome> {
  const budget = resolveContextPressureBudget({
    contextWindowTokens: params.contextWindowTokens,
    reserveTokens: params.reserveTokens,
  });
  let decision: ContextPressureDecision = buildBaseDecision({
    trigger: params.trigger,
    action: "proceed",
    budget,
  });
  decision = {
    ...decision,
    ...(params.usage ? { usage: params.usage } : {}),
    ...(params.contextBreakdown ? { contextBreakdown: params.contextBreakdown } : {}),
  };

  if (params.prune) {
    const startedAt = Date.now();
    const prune = await params.prune();
    decision = {
      ...decision,
      action: prune.truncated ? "prune_retry" : "summary_retry",
      prune: pruneSnapshotFromResult(prune, Date.now() - startedAt),
    };
    if (prune.truncated) {
      await emitContextPressureTelemetry({ decision, emit: params.emit });
      params.log?.info?.(
        `[context-pressure] deterministic prune handled ${params.trigger} diagId=${decision.diagId} truncatedCount=${prune.truncatedCount ?? 0}`,
      );
      return { action: "prune_retry", decision, prune };
    }
  } else if (!params.forceSummary) {
    decision = {
      ...decision,
      action: "summary_retry",
      prune: { attempted: false },
    };
  }

  const strategy = params.continuationStrategy ?? defaultContinuationStrategy;
  let renderedContinuation: string | undefined;
  try {
    const continuationPacket = await strategy.build({
      trigger: params.trigger,
      objective: params.objective,
      existingInstructions: params.existingInstructions,
      runtimeContext: params.runtimeContext,
      nodeTrace: params.nodeTrace,
      readSourceWindow: params.readSourceWindow,
    });
    renderedContinuation = renderContinuationPacket(continuationPacket);
    decision = {
      ...decision,
      continuation: {
        strategy: strategy.id,
        sourceWindowCount: continuationPacket.sourceWindows?.length ?? 0,
        changedFileCount: continuationPacket.changedFiles?.length ?? 0,
      },
    };
  } catch (error) {
    decision = {
      ...decision,
      diagnostics: {
        source: "continuation",
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }

  await params.beforeSummary?.();
  const startedAt = Date.now();
  let summary: CompactResult;
  try {
    summary = await params.contextEngine.compact({
      sessionId: params.sessionId,
      sessionKey: params.sessionKey,
      sessionFile: params.sessionFile,
      tokenBudget: budget.contextWindowTokens,
      ...(params.currentTokenCount !== undefined
        ? { currentTokenCount: params.currentTokenCount }
        : {}),
      ...(renderedContinuation ? { customInstructions: renderedContinuation } : {}),
      force: true,
      compactionTarget: params.summaryTarget ?? "budget",
      runtimeContext: mergeRuntimeContext(params.runtimeContext, {
        trigger: params.trigger,
        diagId: decision.diagId,
        ...(params.currentTokenCount !== undefined
          ? { currentTokenCount: params.currentTokenCount }
          : {}),
      }),
    });
  } catch (error) {
    summary = {
      ok: false,
      compacted: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
  await params.afterSummary?.(summary);
  decision = {
    ...decision,
    action: summary.compacted ? "summary_retry" : "block",
    summary: compactResultToSummarySnapshot({
      result: summary,
      durationMs: Date.now() - startedAt,
      target: params.summaryTarget ?? "budget",
    }),
  };
  await emitContextPressureTelemetry({ decision, emit: params.emit });

  if (summary.compacted) {
    await params.onSummaryCompacted?.(summary);
    return { action: "summary_retry", decision, summary };
  }

  return {
    action: "block",
    decision,
    reason: summary.reason ?? "context pressure recovery did not compact",
  };
}
