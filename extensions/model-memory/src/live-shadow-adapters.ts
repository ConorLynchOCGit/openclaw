import { ModelMemoryCanonicalRepository } from "./db/canonical-repository.ts";
import { RuntimeContextRepository } from "./db/runtime-context-repository.ts";
import { ingestDocumentLive } from "./live-document-ingestion-service.ts";
import { captureOrdinaryTurnLive } from "./live-ordinary-turn-capture-service.ts";
import { compareRuntimeObservations, type RuntimeObservation } from "./runtime-comparison.ts";
import { deriveMemoryIdentity } from "./semantic-identity.ts";
import type { SemanticInterpreter } from "./semantic-interpreter.ts";
import type { LegacyMemoryObserver, ShadowExecutionInput } from "./shadow-mode.ts";
import type { DocumentSourceInput } from "./source-adapters/document-source-adapter.ts";
import type { OrdinaryTurnSourceInput } from "./source-adapters/ordinary-turn-source-adapter.ts";

export type LiveShadowResult =
  | { skipped: true; reason: "feature_flag_disabled" }
  | {
      skipped: false;
      execution: ShadowExecutionInput;
      modelMemoryObservation: RuntimeObservation;
      legacyObservation: RuntimeObservation;
      comparison: ReturnType<typeof compareRuntimeObservations>;
    };

function toRuntimeObservation(input: {
  capturedObjects: Array<{ object: Parameters<typeof deriveMemoryIdentity>[0] }>;
  writeResults: Array<{
    decision: "ignore" | "attach_support" | "write" | "supersede" | "reject" | "quarantine";
    memoryObject?: { identityKey: string };
    memoryId?: string;
    supersessionLink?: { priorObjectId: string };
    targetMemoryIds?: string[];
  }>;
}): RuntimeObservation {
  return {
    capturedObjects: input.capturedObjects.map((entry) => entry.object),
    writeObservations: input.writeResults.map((entry, index) => {
      const decision =
        entry.decision === "reject" || entry.decision === "quarantine" ? "ignore" : entry.decision;
      return {
        decision,
        identityKey:
          entry.memoryObject?.identityKey ??
          entry.memoryId ??
          deriveMemoryIdentity(input.capturedObjects[index].object).identityKey,
        supersededIdentityKey: entry.supersessionLink?.priorObjectId ?? entry.targetMemoryIds?.[0],
      };
    }),
  };
}

export async function runLiveDocumentShadow(input: {
  enabled: boolean;
  document: DocumentSourceInput;
  modelId: string;
  interpreter: SemanticInterpreter;
  canonicalRepository: ModelMemoryCanonicalRepository;
  runtimeRepository: RuntimeContextRepository;
  legacy: LegacyMemoryObserver;
}): Promise<LiveShadowResult> {
  if (!input.enabled) {
    return { skipped: true, reason: "feature_flag_disabled" };
  }

  const liveResult = await ingestDocumentLive({
    canonicalRepository: input.canonicalRepository,
    runtimeRepository: input.runtimeRepository,
    ingestion: {
      document: input.document,
      modelId: input.modelId,
      interpreter: input.interpreter,
    },
  });
  const execution: ShadowExecutionInput = {
    sourceKind: "document",
    sourceText: input.document.text,
    featureFlag: "shadow_only",
  };
  const modelMemoryObservation = toRuntimeObservation({
    capturedObjects: liveResult.capturedObjects,
    writeResults: liveResult.writeResults,
  });
  const legacyObservation = await input.legacy.observe(execution);

  return {
    skipped: false,
    execution,
    modelMemoryObservation,
    legacyObservation,
    comparison: compareRuntimeObservations(modelMemoryObservation, legacyObservation),
  };
}

export async function runLiveOrdinaryTurnShadow(input: {
  enabled: boolean;
  turn: OrdinaryTurnSourceInput;
  modelId: string;
  interpreter: SemanticInterpreter;
  canonicalRepository: ModelMemoryCanonicalRepository;
  runtimeRepository: RuntimeContextRepository;
  legacy: LegacyMemoryObserver;
}): Promise<LiveShadowResult> {
  if (!input.enabled) {
    return { skipped: true, reason: "feature_flag_disabled" };
  }

  const liveResult = await captureOrdinaryTurnLive({
    canonicalRepository: input.canonicalRepository,
    runtimeRepository: input.runtimeRepository,
    capture: {
      turn: input.turn,
      modelId: input.modelId,
      interpreter: input.interpreter,
    },
  });
  const execution: ShadowExecutionInput = {
    sourceKind: "ordinary_turn",
    sourceText: input.turn.currentTurnText,
    featureFlag: "shadow_only",
  };
  const modelMemoryObservation = toRuntimeObservation({
    capturedObjects: liveResult.capturedObjects,
    writeResults: liveResult.writeResults,
  });
  const legacyObservation = await input.legacy.observe(execution);

  return {
    skipped: false,
    execution,
    modelMemoryObservation,
    legacyObservation,
    comparison: compareRuntimeObservations(modelMemoryObservation, legacyObservation),
  };
}
