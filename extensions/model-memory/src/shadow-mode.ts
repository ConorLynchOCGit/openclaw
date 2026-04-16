import {
  compareRuntimeObservations,
  type RuntimeComparisonResult,
  type RuntimeObservation,
} from "./runtime-comparison.ts";
import type { ModelMemorySourceKind } from "./storage-database-contract.ts";

export interface LegacyMemoryObserver {
  observe(input: ShadowExecutionInput): Promise<RuntimeObservation>;
}

export interface ModelMemoryShadowRunner {
  observe(input: ShadowExecutionInput): Promise<RuntimeObservation>;
}

export type ShadowExecutionInput = {
  sourceKind: ModelMemorySourceKind;
  sourceText: string;
  featureFlag: "shadow_only";
};

export type ShadowExecutionResult = {
  modelMemoryObservation: RuntimeObservation;
  legacyObservation: RuntimeObservation;
  comparison: RuntimeComparisonResult;
};

export async function runShadowMode(input: {
  execution: ShadowExecutionInput;
  modelMemory: ModelMemoryShadowRunner;
  legacy: LegacyMemoryObserver;
}): Promise<ShadowExecutionResult> {
  const [modelMemoryObservation, legacyObservation] = await Promise.all([
    input.modelMemory.observe(input.execution),
    input.legacy.observe(input.execution),
  ]);

  return {
    modelMemoryObservation,
    legacyObservation,
    comparison: compareRuntimeObservations(modelMemoryObservation, legacyObservation),
  };
}
