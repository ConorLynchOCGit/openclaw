#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const workItemId = "openclaw-convergence.native-leap-03-worker-controller-author-applicator-split";

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
    "extensions/execution-platform/src/codex-bridge/worker-controller-author-applicator.ts",
    "extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.ts",
    "extensions/execution-platform/src/codex-bridge/file-edit-worker-adapter.ts",
    "extensions/execution-platform/src/codex-bridge/file-edit-worker-adapter.test.ts",
    "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
    "extensions/execution-platform/src/work-queue/execution-read-model.ts",
    "docs/projects/execution-platform/specs/native-agentic-coding-massive-leap.md",
    "docs/projects/execution-platform/specs/non-codex-tool-worker-runtime.md",
    "docs/projects/execution-platform/DECISIONS.md",
    "docs/projects/execution-platform/STATUS.md",
    "docs/projects/execution-platform/CURRENT_SLICE.md",
  ];
  const validationRefs = [
    "validation://pnpm-test-file/file-edit-worker-adapter-non-codex-tool-using-worker-loop",
    "validation://pnpm-test-file/execution-read-model-runtime-node-capability-registry",
    "validation://pnpm-test-extensions-package-boundary-compile/execution-platform",
  ];
  const evidence = writeArtifact("worker-controller-author-applicator-closeout.json", {
    artifactKind: "worker_controller_author_applicator_closeout",
    workItemId,
    summary:
      "Production non-Codex file-edit workers now expose strict controller, author, runtime-applicator, validation/repair, evidence, and escalation phases. The production file-edit adapter blocks controller/context slots from applying source edits directly while preserving runtime-owned edit transactions, validation refs, and commitment-linked evidence.",
    completedCapabilities: [
      "worker_split_phase_contracts",
      "strict_production_phase_authority",
      "controller_context_slots_cannot_apply_edits",
      "patch_author_phase_records_edit_intent",
      "runtime_applicator_phase_uses_edit_transaction_engine",
      "validation_repair_and_evidence_phase_records",
      "adapter_scheduler_work_queue_phase_readback",
    ],
    changedFileRefs,
    validationRefs,
    fullRepoValidationState: "blocked_by_pre_existing_workflow_definition_evidence_profile_debt",
    liveProviderProofMade: false,
    liveProviderProofBlocker:
      "This closeout used bounded fake provider/runtime-interface tests and package compile validation; live provider execution remains part of the Product/Spec proof lane.",
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
    actorId: "codex:worker-controller-author-applicator-closeout",
    reasonCodes: [
      "worker_controller_author_applicator_split_completed",
      "strict_phase_authority_tested",
      "non_codex_worker_phase_readback_updated",
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
