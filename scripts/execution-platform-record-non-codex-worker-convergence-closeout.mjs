#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const workItemId = "openclaw-convergence.native-harness-03-non-codex-worker-convergence";

function sha256(value) {
  return createHash("sha256")
    .update(String(value ?? ""), "utf8")
    .digest("hex");
}

function writeArtifact(name, value) {
  fs.mkdirSync(artifactDir, { recursive: true });
  const body = `${JSON.stringify({ ...value, generatedAt: new Date().toISOString() }, null, 2)}\n`;
  const abs = path.join(artifactDir, name);
  fs.writeFileSync(abs, body, "utf8");
  return {
    path: `.artifacts/execution-platform/${name}`,
    ref: `artifact://execution-platform/${name}`,
    sha256: `sha256:${sha256(body)}`,
  };
}

async function main() {
  const api = await tsImport(
    path.join(root, "extensions/execution-platform/src/index.ts"),
    import.meta.url,
  );
  const runtime = await api.createExecutionPlatformDatabaseRuntime({ applyMigrations: false });
  const runtimeJobs = new api.RuntimeJobRepository(runtime.sqlClient);
  const workQueue = new api.WorkQueueRepository(runtime.sqlClient, runtimeJobs);
  const changedFileRefs = [
    "extensions/execution-platform/src/workflows/mission-work-packets.ts",
    "extensions/execution-platform/src/workflows/mission-work-packets.test.ts",
    "extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.ts",
    "extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.test.ts",
    "extensions/execution-platform/src/codex-bridge/file-edit-worker-adapter.ts",
    "extensions/execution-platform/src/codex-bridge/file-edit-worker-adapter.test.ts",
    "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
    "docs/projects/execution-platform/specs/native-agentic-coding-harness-convergence.md",
    "docs/projects/execution-platform/CURRENT_SLICE.md",
    "docs/projects/execution-platform/STATUS.md",
    "docs/projects/execution-platform/roadmap.md",
  ];
  const validationRefs = [
    "validation://pnpm-test-file/mission-work-packets",
    "validation://pnpm-test-file/non-codex-tool-using-worker-loop",
    "validation://pnpm-test-file/file-edit-worker-adapter",
    "validation://pnpm-tsgo-fast",
  ];
  const evidence = writeArtifact("non-codex-worker-convergence-closeout.json", {
    artifactKind: "non_codex_worker_convergence_closeout",
    workItemId,
    summary:
      "Kimi/non-Codex implementation nodes now receive canonical ImplementationTaskPacket v2 handoffs, validate worker readiness before provider calls, expose context-request/edit-step/evidence progress in Work Queue readback, and carry hardened Kimi provider profile constraints.",
    completedCapabilities: [
      "implementation_task_packet_v2_worker_handoff",
      "non_codex_packet_readiness_gate",
      "missing_context_explicit_request_path",
      "kimi_provider_profile_reasoning_budget_hardening",
      "production_coding_runner_packet_wiring",
      "work_queue_non_codex_worker_progress_readback",
      "bounded_fake_provider_tests_through_production_interfaces",
    ],
    changedFileRefs,
    validationRefs,
    liveProviderProofMade: false,
    liveProviderProofBlocker:
      "This slice did not rerun OpenRouter/Kimi. It hardened live production paths and focused production-interface tests; prior live Kimi proof remains separately recorded.",
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawLogsStored: false,
    workQueueLifecycleMutated: false,
  });

  const transition = await workQueue.completeWorkQueueItemFromCloseout({
    workItemId,
    closeoutRef: evidence.ref,
    closeoutHash: evidence.sha256,
    validationRef: validationRefs.join(","),
    sourceEditRequired: true,
    changedFileRefs,
    artifactRefs: [evidence.ref],
    accepted: true,
    actorId: "codex:non-codex-worker-convergence-closeout",
    reasonCodes: [
      "non_codex_worker_convergence_completed",
      "implementation_task_packet_v2_tested",
      "non_codex_worker_loop_tested",
      "file_edit_worker_adapter_tested",
      "tsgo_fast_passed",
    ],
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawLogsStored: false,
    rawDbRowsStored: false,
    authorityGranted: false,
    controlsApplied: false,
    runtimeLifecycleMutated: false,
  });

  const rows = await runtime.sqlClient.query(
    `
      SELECT work_item_id, title, queue_status, queue_rank
      FROM execution_platform.work_items
      WHERE queue_status IN ('active','blocked','needs_review')
      ORDER BY queue_rank ASC NULLS LAST, work_item_id ASC
      LIMIT 20
    `,
  );

  console.log(
    JSON.stringify(
      {
        ok: transition.closed,
        transition,
        evidence,
        nextActiveItems: rows.rows,
      },
      null,
      2,
    ),
  );
  await runtime.pool.end();
}

await main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});
