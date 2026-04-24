import {
  MODEL_MEMORY_PRE_PHASE2_SLO_DEFINITIONS,
  collectModelMemoryPgStatStatementsBaseline,
  collectModelMemoryTableMaintenanceHealth,
  snapshotModelMemoryPgPoolStats,
} from "../extensions/model-memory/runtime-api.ts";
import { createModelMemoryDatabaseRuntime } from "../src/agents/model-memory.database.ts";
import {
  loadSanitizedModelMemoryRunnerConfig,
  writeSanitizedModelMemoryRunnerConfig,
} from "../src/agents/model-memory.run-config.ts";

async function main() {
  const config = await loadSanitizedModelMemoryRunnerConfig({
    purpose: "model-memory pre-phase-2 db gates",
  });
  const sanitizedConfigPath = await writeSanitizedModelMemoryRunnerConfig({
    config,
    tempPrefix: "openclaw-model-memory-phase2-db-gates-",
  });
  process.env.OPENCLAW_CONFIG_PATH = sanitizedConfigPath;

  const runtime = await createModelMemoryDatabaseRuntime({
    config,
    applyMigrations: false,
  });

  try {
    const poolPressure = runtime.dbLaneController.snapshot();
    const report = {
      collectedAt: new Date().toISOString(),
      database: {
        name: runtime.resolution.databaseName,
        source: runtime.resolution.source,
        storageEngine: runtime.storageEngine,
      },
      slos: MODEL_MEMORY_PRE_PHASE2_SLO_DEFINITIONS,
      pool: {
        stats: snapshotModelMemoryPgPoolStats(runtime.pool, poolPressure),
        lanes: poolPressure.laneStats,
      },
      pgStatStatements: await collectModelMemoryPgStatStatementsBaseline({
        sql: runtime.sqlClient,
      }),
      maintenanceHealth: await collectModelMemoryTableMaintenanceHealth({
        sql: runtime.sqlClient,
      }),
    };
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await runtime.pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
