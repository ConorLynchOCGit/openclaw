import { createModelMemoryDatabaseRuntime } from "../src/agents/model-memory.database.ts";
import {
  loadSanitizedModelMemoryRunnerConfig,
  writeSanitizedModelMemoryRunnerConfig,
} from "../src/agents/model-memory.run-config.ts";
import {
  createModelMemoryRuntimeDirtyStore,
  reconcileModelMemoryRuntimeDirtyState,
  runModelMemoryRuntimeRebuildWorker,
} from "../src/agents/model-memory.runtime-dirty.ts";
import { rebuildDerivedRuntimeState } from "../src/plugin-sdk/model-memory.ts";

function readArgValue(argv: string[], flag: string) {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

async function main() {
  const argv = process.argv.slice(2);
  const staleAfterMsArg = Number.parseInt(readArgValue(argv, "--stale-after-ms") ?? "", 10);
  const staleAfterMs =
    Number.isFinite(staleAfterMsArg) && staleAfterMsArg > 0 ? staleAfterMsArg : undefined;

  const config = await loadSanitizedModelMemoryRunnerConfig({
    purpose: "model-memory runtime-dirty reconcile",
  });
  const sanitizedConfigPath = await writeSanitizedModelMemoryRunnerConfig({
    config,
    tempPrefix: "openclaw-model-memory-runtime-dirty-reconcile-",
  });
  process.env.OPENCLAW_CONFIG_PATH = sanitizedConfigPath;

  const runtime = await createModelMemoryDatabaseRuntime({
    config,
    applyMigrations: false,
  });
  const store = createModelMemoryRuntimeDirtyStore({ env: process.env });
  const events: unknown[] = [];

  try {
    const reconciled = await reconcileModelMemoryRuntimeDirtyState({
      store,
      env: process.env,
      staleAfterMs,
      onEvent: async (event) => {
        events.push(event);
      },
    });

    let requestedState = reconciled.state;
    let rebuildRan = false;
    if (requestedState.status !== "clean") {
      const requested = await store.requestRebuild({
        traceIds: requestedState.traceIds,
        sessionId: "phase2-entry-runtime-dirty-reconcile",
        sessionKey: "agent:main:phase2-entry-runtime-dirty-reconcile",
        agentId: "main",
      });
      events.push(requested.event);
      requestedState = requested.state;
      rebuildRan = true;
      requestedState = await runModelMemoryRuntimeRebuildWorker({
        store,
        env: process.env,
        onEvent: async (event) => {
          events.push(event);
        },
        rebuild: async () => {
          const rebuildCanonicalRepository =
            (
              runtime.canonicalRepository as typeof runtime.canonicalRepository & {
                withDbLane?: (
                  lane: "capture" | "rebuild" | "retrieval" | "admin" | "default",
                ) => unknown;
              }
            ).withDbLane?.("rebuild") ?? runtime.canonicalRepository;
          await rebuildDerivedRuntimeState({
            canonicalRepository: rebuildCanonicalRepository as typeof runtime.canonicalRepository,
            runtimeRepository:
              (
                runtime.runtimeRepository as typeof runtime.runtimeRepository & {
                  withDbLane?: (
                    lane: "capture" | "rebuild" | "retrieval" | "admin" | "default",
                  ) => unknown;
                }
              ).withDbLane?.("rebuild") ?? runtime.runtimeRepository,
          });
        },
      });
    }

    process.stdout.write(
      `${JSON.stringify(
        {
          collectedAt: new Date().toISOString(),
          runtimeDirtyDir: store.baseDir,
          staleAfterMs: reconciled.staleAfterMs,
          before: reconciled.before,
          afterReconcile: reconciled.state,
          finalState: requestedState,
          recoveredOrphanedRebuild: reconciled.recoveredOrphanedRebuild,
          rebuildRan,
          events,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await runtime.pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
