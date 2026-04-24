import type { ModelMemoryCanonicalRepository } from "../db/canonical-repository.ts";
import type { CapturedObjectWriteStore } from "../db/captured-object-write-compatibility.ts";
import type { RuntimeContextRepository } from "../db/runtime-context-repository.ts";
import type { DocumentIngestionInput } from "../document-ingestion.ts";
import {
  emitMemoryIngestionCloseoutIfConfigured,
  type MemoryIngestionCloseoutArtifact,
} from "../ingestion/closeout-artifacts.ts";
import {
  createMemoryIngestionTelemetryEvent,
  type MemoryIngestionTelemetryEvent,
} from "../ingestion/shared-pipeline.ts";
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
  env?: NodeJS.ProcessEnv;
};

export type ReplayDocumentResult = LiveDocumentIngestionResult & {
  replayCloseoutArtifact?: MemoryIngestionCloseoutArtifact;
};

export type ReplayOrdinaryTurnResult = LiveOrdinaryTurnCaptureResult & {
  replayCloseoutArtifact?: MemoryIngestionCloseoutArtifact;
};

function buildReplayTelemetry(
  telemetry: MemoryIngestionTelemetryEvent[] | undefined,
): MemoryIngestionTelemetryEvent[] {
  if (!telemetry || telemetry.length === 0) {
    return [
      createMemoryIngestionTelemetryEvent({
        path: "capture_replay_inspection",
        stage: "closeout_report",
        status: "completed",
      }),
    ];
  }
  return telemetry.map((event) =>
    createMemoryIngestionTelemetryEvent({
      ...event,
      path: "capture_replay_inspection",
    }),
  );
}

export class ModelMemoryReplayService {
  constructor(private readonly deps: ReplayServiceDependencies) {}

  async replayDocument(ingestion: DocumentIngestionInput): Promise<ReplayDocumentResult> {
    const result = await ingestDocumentLive({
      canonicalRepository: this.deps.canonicalRepository,
      runtimeRepository: this.deps.runtimeRepository,
      memoryStore: this.deps.memoryStore,
      env: this.deps.env ?? (process.env.VITEST ? undefined : process.env),
      ingestion,
      rebuildRuntime: true,
    });
    const replayCloseoutArtifact = await emitMemoryIngestionCloseoutIfConfigured({
      env: this.deps.env ?? (process.env.VITEST ? undefined : process.env),
      path: "capture_replay_inspection",
      runId: `replay-document:${result.source.id}`,
      sourceId: result.source.id,
      sourceHash: result.source.sourceFingerprint,
      telemetryEvents: buildReplayTelemetry(result.ingestionTelemetry),
      persistenceResult: result.persistenceResult,
      dirtyState: { status: "not_required", reason: "replay_wrapper" },
    });
    return {
      ...result,
      replayCloseoutArtifact,
    };
  }

  async replayOrdinaryTurn(capture: OrdinaryTurnCaptureInput): Promise<ReplayOrdinaryTurnResult> {
    const result = await captureOrdinaryTurnLive({
      canonicalRepository: this.deps.canonicalRepository,
      runtimeRepository: this.deps.runtimeRepository,
      memoryStore: this.deps.memoryStore,
      env: this.deps.env ?? (process.env.VITEST ? undefined : process.env),
      capture,
      rebuildRuntime: true,
    });
    const replayCloseoutArtifact = await emitMemoryIngestionCloseoutIfConfigured({
      env: this.deps.env ?? (process.env.VITEST ? undefined : process.env),
      path: "capture_replay_inspection",
      runId: `replay-ordinary-turn:${result.source.id}`,
      sourceId: result.source.id,
      sourceHash: result.source.sourceFingerprint,
      telemetryEvents: buildReplayTelemetry(result.ingestionTelemetry),
      persistenceResult: result.persistenceResult,
      dirtyState: { status: "not_required", reason: "replay_wrapper" },
    });
    return {
      ...result,
      replayCloseoutArtifact,
    };
  }

  rebuildDerivedRuntime() {
    return rebuildDerivedRuntimeState({
      canonicalRepository: this.deps.canonicalRepository,
      runtimeRepository: this.deps.runtimeRepository,
    });
  }
}
