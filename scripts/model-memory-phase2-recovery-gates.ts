import { spawnSync } from "node:child_process";
import { createModelMemoryDatabaseRuntime } from "../src/agents/model-memory.database.ts";
import { collectModelMemoryRecoveryReport } from "../src/agents/model-memory.recovery.ts";
import {
  loadSanitizedModelMemoryRunnerConfig,
  writeSanitizedModelMemoryRunnerConfig,
} from "../src/agents/model-memory.run-config.ts";

function commandAvailable(command: string): boolean {
  const result = spawnSync("bash", ["-lc", `command -v ${command} >/dev/null 2>&1`], {
    encoding: "utf8",
  });
  return result.status === 0;
}

async function main() {
  const config = await loadSanitizedModelMemoryRunnerConfig({
    purpose: "model-memory pre-phase-2 recovery gates",
  });
  const sanitizedConfigPath = await writeSanitizedModelMemoryRunnerConfig({
    config,
    tempPrefix: "openclaw-model-memory-phase2-recovery-gates-",
  });
  process.env.OPENCLAW_CONFIG_PATH = sanitizedConfigPath;

  const runtime = await createModelMemoryDatabaseRuntime({
    config,
    applyMigrations: false,
  });

  try {
    const projectionVersions = await runtime.runtimeRepository.listProjectionVersions();
    const report = await collectModelMemoryRecoveryReport({
      env: process.env,
      projectionVersions: projectionVersions.map((entry) => ({
        targetId: entry.targetId,
        canonicalArtifactPath: entry.canonicalArtifactPath,
      })),
    });
    process.stdout.write(
      `${JSON.stringify(
        {
          collectedAt: new Date().toISOString(),
          database: {
            name: runtime.resolution.databaseName,
            source: runtime.resolution.source,
            storageEngine: runtime.storageEngine,
          },
          logicalBackupTools: {
            pgDumpAvailable: commandAvailable("pg_dump"),
            pgRestoreAvailable: commandAvailable("pg_restore"),
            recommendedBackupCommand:
              'pg_dump -Fc "$MODEL_MEMORY_DATABASE_URL" > model-memory.dump',
            recommendedRestoreCommand:
              'pg_restore --clean --if-exists --no-owner --dbname "$MODEL_MEMORY_DATABASE_URL" model-memory.dump',
          },
          recovery: report,
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
