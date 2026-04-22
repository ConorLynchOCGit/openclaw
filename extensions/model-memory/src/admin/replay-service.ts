import type { ModelMemoryCanonicalRepository } from "../db/canonical-repository.ts";
import type { CapturedObjectWriteStore } from "../db/captured-object-write-compatibility.ts";
import type { RuntimeContextRepository } from "../db/runtime-context-repository.ts";
import type { DocumentIngestionInput } from "../document-ingestion.ts";
import {
  ingestDocumentLive,
  type LiveDocumentIngestionResult,
} from "../live-document-ingestion-service.ts";
import {
  captureOrdinaryTurnLive,
  type LiveOrdinaryTurnCaptureResult,
} from "../live-ordinary-turn-capture-service.ts";
import type { OrdinaryTurnCaptureInput } from "../ordinary-turn-capture.ts";
import { rebuildDerivedRuntimeState } from "../runtime-rebuild-orchestrator.ts";

export type ReplayServiceDependencies = {
  canonicalRepository: ModelMemoryCanonicalRepository;
  runtimeRepository: RuntimeContextRepository;
  memoryStore?: CapturedObjectWriteStore;
};

export class ModelMemoryReplayService {
  constructor(private readonly deps: ReplayServiceDependencies) {}

  replayDocument(ingestion: DocumentIngestionInput): Promise<LiveDocumentIngestionResult> {
    return ingestDocumentLive({
      canonicalRepository: this.deps.canonicalRepository,
      runtimeRepository: this.deps.runtimeRepository,
      memoryStore: this.deps.memoryStore,
      ingestion,
      rebuildRuntime: true,
    });
  }

  replayOrdinaryTurn(capture: OrdinaryTurnCaptureInput): Promise<LiveOrdinaryTurnCaptureResult> {
    return captureOrdinaryTurnLive({
      canonicalRepository: this.deps.canonicalRepository,
      runtimeRepository: this.deps.runtimeRepository,
      memoryStore: this.deps.memoryStore,
      capture,
      rebuildRuntime: true,
    });
  }

  rebuildDerivedRuntime() {
    return rebuildDerivedRuntimeState({
      canonicalRepository: this.deps.canonicalRepository,
      runtimeRepository: this.deps.runtimeRepository,
    });
  }
}
