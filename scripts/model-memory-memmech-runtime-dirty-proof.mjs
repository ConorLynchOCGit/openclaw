#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const PROOF_MARKER = "MEMMECH-2026-04-22";

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

async function main() {
  const root = repoRoot();
  const runtimeDirty = await tsImport(
    path.join(root, "src/agents/model-memory.runtime-dirty.ts"),
    import.meta.url,
  );
  const store = runtimeDirty.createModelMemoryRuntimeDirtyStore();
  const result = await runtimeDirty.markModelMemoryRuntimeDirtyAndSchedule({
    store,
    env: {
      ...process.env,
      MODEL_MEMORY_RUNTIME_REBUILD_COALESCE_WRITES: "1000",
      MODEL_MEMORY_RUNTIME_REBUILD_COALESCE_MS: "3600000",
    },
    dirty: {
      reason: "manual_admin_request",
      captureJobId: `capture_job_${PROOF_MARKER}`,
      sessionId: `session_${PROOF_MARKER}`,
      sessionKey: `session:${PROOF_MARKER}`,
      agentId: "main",
      memoryIds: [],
      sourceIds: [`source:${PROOF_MARKER}`],
      projectionTargetIds: ["projection_digest"],
    },
    now: new Date(),
  });
  console.log(
    JSON.stringify(
      {
        baseDir: store.baseDir,
        dirtyId: result.state.dirtyId,
        status: result.state.status,
        scheduled: result.scheduled,
        schedulerReason: result.schedulerReason,
        eventTypes: result.events.map((event) => event.eventType),
        rawContentPersisted: result.state.rawContentPersisted,
        containsPromptText: result.state.containsPromptText,
        containsTranscript: result.state.containsTranscript,
        containsRawToolLog: result.state.containsRawToolLog,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
