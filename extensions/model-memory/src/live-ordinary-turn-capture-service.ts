import { ModelMemoryCanonicalRepository } from "./db/canonical-repository.ts";
import { DatabaseMemoryObjectStore } from "./db/database-memory-object-store.ts";
import { RuntimeContextRepository } from "./db/runtime-context-repository.ts";
import {
  captureOrdinaryTurn,
  type OrdinaryTurnCaptureInput,
  type OrdinaryTurnCaptureResult,
} from "./ordinary-turn-capture.ts";
import { rebuildDerivedRuntimeState } from "./runtime-rebuild-orchestrator.ts";
import type { SemanticCollisionAdjudicator } from "./semantic-collision-adjudication.ts";

export type LiveOrdinaryTurnCaptureResult = OrdinaryTurnCaptureResult & {
  writeResults: Awaited<ReturnType<DatabaseMemoryObjectStore["writeCapturedObjects"]>>;
  rebuild?: Awaited<ReturnType<typeof rebuildDerivedRuntimeState>>;
};

export async function captureOrdinaryTurnLive(input: {
  canonicalRepository: ModelMemoryCanonicalRepository;
  runtimeRepository?: RuntimeContextRepository;
  memoryStore?: DatabaseMemoryObjectStore;
  collisionAdjudicator?: SemanticCollisionAdjudicator;
  capture: OrdinaryTurnCaptureInput;
  rebuildRuntime?: boolean;
}): Promise<LiveOrdinaryTurnCaptureResult> {
  const result = await captureOrdinaryTurn(input.capture);
  const source = await input.canonicalRepository.persistSource(result.source);
  await input.canonicalRepository.persistSourceWindows(result.windows);
  const memoryStore =
    input.memoryStore ??
    new DatabaseMemoryObjectStore(input.canonicalRepository, input.collisionAdjudicator);
  const writeResults = await memoryStore.writeCapturedObjects(result.capturedObjects);
  const rebuild =
    input.runtimeRepository && (input.rebuildRuntime ?? true)
      ? await rebuildDerivedRuntimeState({
          canonicalRepository: input.canonicalRepository,
          runtimeRepository: input.runtimeRepository,
        })
      : undefined;

  return {
    ...result,
    source,
    writeResults,
    rebuild,
  };
}
