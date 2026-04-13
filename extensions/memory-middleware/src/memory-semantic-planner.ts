import type { MemoryMiddlewareConfig } from "./config.js";
import type {
  MemorySemanticInterpretationLane,
  MemorySemanticInterpreterPort,
} from "./memory-semantic-interpretation.js";
import {
  materializeValidatedMemorySemanticObject,
  type MaterializedMemorySemanticResult,
} from "./memory-semantic-materialization.js";
import {
  buildMemorySemanticObjectIdentity,
  type MemorySemanticObjectIdentity,
} from "./memory-semantic-object-identity.js";
import {
  validateMemorySemanticDecision,
  type ValidatedMemorySemanticDecision,
  type ValidatedMemorySemanticObject,
} from "./memory-semantic-validation.js";
import type { NormalizedMemoryBlock } from "./memory-source-normalization.js";
import type { NormalizedMemorySourceWindow } from "./memory-source-windowing.js";
import { buildMemorySourceWindows } from "./memory-source-windowing.js";

export type PlannedMemorySemanticCapture = {
  validated: ValidatedMemorySemanticObject;
  materialized: MaterializedMemorySemanticResult;
  identity: MemorySemanticObjectIdentity;
  modelId: string;
  promptVersion: string;
};

export type PlannedNormalizedMemoryDecision = {
  validation: ValidatedMemorySemanticDecision;
  captures: PlannedMemorySemanticCapture[];
  modelId: string;
  promptVersion: string;
};

export async function planNormalizedMemorySourceWindow(params: {
  config: MemoryMiddlewareConfig;
  lane: MemorySemanticInterpretationLane;
  window: NormalizedMemorySourceWindow;
  interpreter: MemorySemanticInterpreterPort;
  projectId?: string;
}): Promise<PlannedNormalizedMemoryDecision | null> {
  const interpreted = await params.interpreter.interpretSourceWindow({
    lane: params.lane,
    source: params.window.source,
    window: params.window,
  });
  const validation = await validateMemorySemanticDecision({
    config: params.config,
    lane: params.lane,
    decision: interpreted.decision,
    window: params.window,
    ...(params.projectId ? { projectId: params.projectId } : {}),
  });
  const captures =
    validation.action === "capture"
      ? validation.objects
          .map((validated) => {
            const materialized = materializeValidatedMemorySemanticObject({
              validated,
              captureSeam: "memory_semantic_planner",
              captureProfile: params.lane,
              ...(params.projectId ? { projectId: params.projectId } : {}),
            });
            return materialized
              ? {
                  validated,
                  materialized,
                  identity: buildMemorySemanticObjectIdentity(materialized.object),
                  modelId: interpreted.modelId,
                  promptVersion: interpreted.promptVersion,
                }
              : null;
          })
          .filter((capture): capture is PlannedMemorySemanticCapture => capture !== null)
      : [];
  return {
    validation,
    captures,
    modelId: interpreted.modelId,
    promptVersion: interpreted.promptVersion,
  };
}

// Compatibility shim for tests and comparison helpers. Normal runtime should use source windows.
export async function planNormalizedMemoryBlock(params: {
  config: MemoryMiddlewareConfig;
  lane: MemorySemanticInterpretationLane;
  block: NormalizedMemoryBlock;
  interpreter: MemorySemanticInterpreterPort;
  projectId?: string;
}): Promise<PlannedNormalizedMemoryDecision | null> {
  const window = buildMemorySourceWindows({
    blocks: [params.block],
    maxWindowChars: Math.max(params.block.blockText.length + 16, 512),
    maxBlocksPerWindow: 1,
  })[0];
  if (!window) {
    return null;
  }
  return planNormalizedMemorySourceWindow({
    config: params.config,
    lane: params.lane,
    window,
    interpreter: params.interpreter,
    ...(params.projectId ? { projectId: params.projectId } : {}),
  });
}
