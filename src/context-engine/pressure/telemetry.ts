import type { ContextPressureDecision } from "./types.js";

export const CONTEXT_PRESSURE_DECISION_EVENT_TYPE = "openclaw:context-pressure-decision";

export function buildContextPressureTelemetryEvent(
  decision: ContextPressureDecision,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries({
      eventType: CONTEXT_PRESSURE_DECISION_EVENT_TYPE,
      trigger: decision.trigger,
      action: decision.action,
      diagId: decision.diagId,
      budget: decision.budget,
      usage: decision.usage,
      estimate: decision.estimate,
      pressure: decision.pressure,
      contextBreakdown: decision.contextBreakdown,
      prune: decision.prune,
      summary: decision.summary,
      continuation: decision.continuation,
      diagnostics: decision.diagnostics,
    }).filter(([, value]) => value !== undefined),
  );
}

export async function emitContextPressureTelemetry(params: {
  decision: ContextPressureDecision;
  emit?: (event: Record<string, unknown>) => void | Promise<void>;
}): Promise<void> {
  if (!params.emit) {
    return;
  }
  await params.emit(buildContextPressureTelemetryEvent(params.decision));
}
