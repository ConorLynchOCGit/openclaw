import type { MemoryMiddlewareConfig } from "./config.js";
import type {
  MemorySemanticInterpretationLane,
  MemorySemanticInterpreterPort,
} from "./memory-semantic-interpretation.js";
import {
  validateMemorySemanticDecision,
  type ValidatedMemorySemanticDecision,
} from "./memory-semantic-validation.js";
import {
  typeNormalizedMemoryBlock,
  type NormalizedMemoryBlock,
} from "./memory-source-normalization.js";

export type PlannedNormalizedMemoryDecision = {
  blockType: ReturnType<typeof typeNormalizedMemoryBlock>;
  validation: ValidatedMemorySemanticDecision;
  modelId: string;
  promptVersion: string;
};

export async function planNormalizedMemoryBlock(params: {
  config: MemoryMiddlewareConfig;
  lane: MemorySemanticInterpretationLane;
  block: NormalizedMemoryBlock;
  interpreter: MemorySemanticInterpreterPort;
  projectId?: string;
}): Promise<PlannedNormalizedMemoryDecision | null> {
  const blockType = typeNormalizedMemoryBlock(params.block);
  if (blockType === "ignore") {
    return null;
  }
  const interpreted = await params.interpreter.interpretBlock({
    lane: params.lane,
    source: params.block.source,
    block: params.block,
    blockType,
  });
  const validation = await validateMemorySemanticDecision({
    config: params.config,
    lane: params.lane,
    decision: interpreted.decision,
    ...(params.projectId ? { projectId: params.projectId } : {}),
  });
  return {
    blockType,
    validation,
    modelId: interpreted.modelId,
    promptVersion: interpreted.promptVersion,
  };
}
