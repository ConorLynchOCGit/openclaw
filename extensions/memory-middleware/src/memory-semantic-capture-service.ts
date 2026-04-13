import type { MemoryMiddlewareConfig } from "./config.js";
import type {
  MemorySemanticInterpretationLane,
  MemorySemanticInterpreterPort,
} from "./memory-semantic-interpretation.js";
import {
  planNormalizedMemorySourceWindow,
  type PlannedMemorySemanticCapture,
  type PlannedNormalizedMemoryDecision,
} from "./memory-semantic-planner.js";
import type { NormalizedMemorySourceWindow } from "./memory-source-windowing.js";

export type PlannedWindowSemanticCapture = PlannedMemorySemanticCapture & {
  windowIndex: number;
  window: NormalizedMemorySourceWindow;
};

export type PlannedWindowSemanticDecision = {
  windowIndex: number;
  window: NormalizedMemorySourceWindow;
  planned: PlannedNormalizedMemoryDecision;
};

export type PlannedSemanticCaptureCollection = {
  decisions: PlannedWindowSemanticDecision[];
  captures: PlannedWindowSemanticCapture[];
};

export async function collectPlannedMemorySemanticCaptures(params: {
  config: MemoryMiddlewareConfig;
  lane: MemorySemanticInterpretationLane;
  windows: readonly NormalizedMemorySourceWindow[];
  interpreter: MemorySemanticInterpreterPort;
  projectId?: string;
}): Promise<PlannedSemanticCaptureCollection> {
  const decisions: PlannedWindowSemanticDecision[] = [];
  const captures: PlannedWindowSemanticCapture[] = [];

  for (const [windowIndex, window] of params.windows.entries()) {
    const planned = await planNormalizedMemorySourceWindow({
      config: params.config,
      lane: params.lane,
      window,
      interpreter: params.interpreter,
      ...(params.projectId ? { projectId: params.projectId } : {}),
    });
    if (!planned) {
      continue;
    }
    decisions.push({
      windowIndex,
      window,
      planned,
    });
    for (const capture of planned.captures) {
      captures.push({
        ...capture,
        windowIndex,
        window,
      });
    }
  }

  return {
    decisions,
    captures,
  };
}

export function scorePlannedMemorySemanticCapture(capture: PlannedWindowSemanticCapture): number {
  const confidenceScore = capture.validated.confidence === "high" ? 200 : 100;
  const reviewScore =
    capture.validated.reviewMode === "direct"
      ? 30
      : capture.validated.reviewMode === "pending_confirmation"
        ? 20
        : 10;
  return confidenceScore + reviewScore + capture.validated.supportingBlocks.length;
}

export function pickBestPlannedMemorySemanticCapture(
  captures: readonly PlannedWindowSemanticCapture[],
  predicate: (capture: PlannedWindowSemanticCapture) => boolean,
): PlannedWindowSemanticCapture | null {
  return (
    [...captures]
      .filter(predicate)
      .sort(
        (left, right) =>
          scorePlannedMemorySemanticCapture(right) - scorePlannedMemorySemanticCapture(left),
      )[0] ?? null
  );
}
