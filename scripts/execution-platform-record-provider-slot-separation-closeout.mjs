#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const workItemId = "openclaw-convergence.native-leap-01-provider-tool-call-capability-separation";

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
    "extensions/execution-platform/src/codex-bridge/model-agnostic-worker-qualification.ts",
    "extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.ts",
    "extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.test.ts",
    "extensions/execution-platform/src/codex-bridge/file-edit-worker-adapter.ts",
    "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
    "extensions/execution-platform/src/work-queue/execution-read-model.ts",
    "extensions/execution-platform/src/runtime-tool-call/runtime-tool-kernel.ts",
    "docs/projects/execution-platform/specs/native-agentic-coding-massive-leap.md",
    "docs/projects/execution-platform/specs/non-codex-tool-worker-runtime.md",
    "docs/projects/execution-platform/specs/native-agentic-coding-harness-convergence.md",
  ];
  const validationRefs = [
    "validation://pnpm-test-file/non-codex-tool-using-worker-loop-model-agnostic-worker-qualification-runtime-node-capability-registry",
    "validation://pnpm-test-file/non-codex-tool-using-worker-loop-model-agnostic-worker-qualification-execution-read-model-runtime-node-capability-registry",
    "validation://pnpm-test-extensions-package-boundary-compile/execution-platform",
  ];
  const evidence = writeArtifact("provider-slot-separation-closeout.json", {
    artifactKind: "provider_slot_separation_closeout",
    workItemId,
    summary:
      "Non-Codex worker execution now separates controller/context/patch/validation-repair/evidence/escalation model slots and blocks unqualified Kimi controller or omitted-reasoning patch policy before provider calls.",
    completedCapabilities: [
      "provider_capability_slot_profiles",
      "non_codex_worker_slot_gate_before_provider_calls",
      "kimi_controller_retired_until_qualified",
      "kimi_patch_author_reasoning_none_enforced",
      "file_edit_worker_model_policy_slot_readback",
      "work_queue_kimi_provider_gate_readback",
      "runtime_tool_kernel_commitment_claim_shape_restored",
    ],
    changedFileRefs,
    validationRefs,
    liveProviderProofMade: false,
    liveProviderProofBlocker:
      "This closeout used bounded fake provider/runtime-interface tests and package compile validation; live provider promotion remains subject to per-stage benchmark gates.",
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
    actorId: "codex:provider-slot-separation-closeout",
    reasonCodes: [
      "provider_slot_separation_completed",
      "kimi_controller_gate_tested",
      "kimi_patch_reasoning_gate_tested",
      "work_queue_readback_updated",
      "extension_package_boundary_compile_passed",
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

try {
  await main();
  process.exit(0);
} catch (error) {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
}
