#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function readArg(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

async function main() {
  const root = repoRoot();
  const dryRun = hasFlag("--dry-run");
  if (!dryRun) {
    throw new Error(
      "non-dry-run requires an application-provided live request builder; use the TypeScript API runQueuedBridgeRunnerCommand",
    );
  }
  const { runQueuedBridgeRunnerCommand } = await tsImport(
    path.join(
      root,
      "extensions/execution-platform/src/codex-bridge/queued-bridge-runner-command.ts",
    ),
    import.meta.url,
  );
  const result = await runQueuedBridgeRunnerCommand({
    workerId: readArg("--worker-id") ?? "operator-invoked-worker",
    queueName: readArg("--queue") ?? "executor",
    runtimeJobId: readArg("--runtime-job-id"),
    dryRun: true,
  });
  console.log(JSON.stringify(result, null, 2));
}

await main();
