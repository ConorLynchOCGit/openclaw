import path from "node:path";
import type { LiveMemoryPersistenceResult } from "../db/mmv2-native-repository.ts";
import {
  buildMemoryIngestionCloseoutReport,
  writeMemoryIngestionCloseoutReport,
  type MemoryIngestionCloseoutReport,
  type MemoryIngestionPath,
  type MemoryIngestionTelemetryEvent,
} from "./shared-pipeline.ts";

export type MemoryIngestionCloseoutArtifact = {
  path: string;
  contentHash: string;
  report: MemoryIngestionCloseoutReport;
};

function resolveCloseoutArtifactDir(
  env: NodeJS.ProcessEnv | undefined,
  ingestionPath: MemoryIngestionPath,
): string | undefined {
  const stateDir = env?.OPENCLAW_STATE_DIR?.trim();
  if (!stateDir) {
    return undefined;
  }
  return path.join(path.resolve(stateDir), "model-memory", "closeout-reports", ingestionPath);
}

export async function emitMemoryIngestionCloseoutIfConfigured(input: {
  env?: NodeJS.ProcessEnv;
  path: MemoryIngestionPath;
  traceId?: string;
  runId?: string;
  sourceId?: string;
  sourceHash?: string;
  jobId?: string;
  telemetryEvents?: MemoryIngestionTelemetryEvent[];
  persistenceResult?: LiveMemoryPersistenceResult;
  dirtyState?: MemoryIngestionCloseoutReport["dirty_state"];
  provider?: string;
  model?: string;
  schema?: string;
}): Promise<MemoryIngestionCloseoutArtifact | undefined> {
  const artifactDir = resolveCloseoutArtifactDir(input.env, input.path);
  if (!artifactDir) {
    return undefined;
  }

  const report = buildMemoryIngestionCloseoutReport({
    path: input.path,
    traceId: input.traceId,
    runId: input.runId,
    sourceId: input.sourceId,
    sourceHash: input.sourceHash,
    jobId: input.jobId,
    telemetryEvents: input.telemetryEvents,
    deferredCandidates: input.persistenceResult?.deferredCandidates.map((candidate) => ({
      memoryId: candidate.memory_id,
      reason: candidate.reason,
    })),
    deferredEdges: input.persistenceResult?.deferredEdges.map((edge) => ({
      edgeId: edge.edge_id,
      fromMemoryId: edge.from_memory_id,
      toMemoryId: edge.to_memory_id,
      reason: edge.reason,
    })),
    dirtyState: input.dirtyState,
    provider: input.provider,
    model: input.model,
    schema: input.schema,
  });
  const written = await writeMemoryIngestionCloseoutReport({
    report,
    artifactDir,
  });
  return {
    ...written,
    report,
  };
}
