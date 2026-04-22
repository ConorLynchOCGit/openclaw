#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

async function main() {
  const root = repoRoot();
  const workspaceRoot = process.env.OPENCLAW_WORKSPACE_ROOT || "/root/.openclaw/workspace";
  const databaseApi = await tsImport(
    path.join(root, "src/agents/model-memory.database.ts"),
    import.meta.url,
  );
  const runtimeReadModels = await tsImport(
    path.join(root, "extensions/model-memory/src/runtime-read-models.ts"),
    import.meta.url,
  );
  const compiler = await tsImport(
    path.join(root, "extensions/model-memory/src/projection-compiler.ts"),
    import.meta.url,
  );
  const materializer = await tsImport(
    path.join(root, "extensions/model-memory/src/runtime/projections/materializer.ts"),
    import.meta.url,
  );

  const runtime = await databaseApi.createModelMemoryDatabaseRuntime({
    applyMigrations: false,
  });
  try {
    const memoryObjects = await runtimeReadModels.listRuntimeMemoryRecords(
      runtime.canonicalRepository,
    );
    const pages = compiler.compileProjectionCatalogPages({
      memoryObjects,
      builtAt: new Date(),
    });
    const activeMemoryIds = materializer.buildActiveProjectionSourceIdSet(memoryObjects);
    const result = await materializer.materializeProjectionArtifacts({
      workspaceRoot,
      entries: pages.map((page) => ({
        targetId: page.targetId,
        renderedText: page.renderedText,
        version: page.version,
        digest: page.digest,
      })),
      activeMemoryIds,
      generatedAt: new Date(),
    });
    console.log(
      JSON.stringify(
        {
          workspaceRoot,
          memoryCount: memoryObjects.length,
          activeMemoryCount: activeMemoryIds.size,
          projectionCount: result.projection_count,
          projectionTypes: result.artifact_entries.map((entry) => entry.projection_type).toSorted(),
          indexPath: path.join(workspaceRoot, result.index_path),
          rootWriteBackStatus: result.root_write_back_status,
        },
        null,
        2,
      ),
    );
  } finally {
    await runtime.pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
