#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const workItemId = "openclaw-convergence.native-leap-12-repair-classification-before-retry";

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
    "extensions/execution-platform/src/workflows/repair-classification.ts",
    "extensions/execution-platform/src/workflows/repair-classification.test.ts",
    "extensions/execution-platform/src/workflows/index.ts",
    "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler-contracts.ts",
    "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
    "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts",
    "extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts",
    "extensions/execution-platform/src/work-queue/execution-read-model.ts",
    "docs/projects/execution-platform/CURRENT_SLICE.md",
    "docs/projects/execution-platform/STATUS.md",
    "docs/projects/execution-platform/DECISIONS.md",
    "docs/projects/execution-platform/specs/native-agentic-coding-massive-leap.md",
    "docs/projects/execution-platform/specs/native-agentic-coding-harness-convergence.md",
    "docs/projects/execution-platform/specs/runtime-work-graph.md",
  ];
  const validationRefs = [
    "validation://pnpm-test-file/repair-classification-runtime-work-graph-scheduler",
    "validation://pnpm-test-file/work-queue-execution-read-model",
    "validation://pnpm-tsgo-fast/blocked-by-pre-existing-workflow-definition-evidence-profile-debt",
  ];
  const evidence = writeArtifact("repair-classification-before-retry-closeout.json", {
    artifactKind: "repair_classification_before_retry_closeout",
    workItemId,
    summary:
      "Repair Classification Before Retry is implemented as production scheduler/runtime evidence. RuntimeRepairClassification v1 records bounded failed-span/node/tool/decision/commitment refs, failure class, repair strategy, selected boundary, preserved refs, and next action. Scheduler node failures, needs-review outcomes, invalid evidence claims, and context freshness blocks classify before retry. Needs-review retries without classification are rejected, and Work Queue readback exposes latest repair-classification state.",
    completedCapabilities: [
      "runtime_repair_classification_contract_v1",
      "scheduler_classify_repair_or_escalation_outputs_classification_artifact",
      "needs_review_retry_requires_repair_classification",
      "context_freshness_failure_classifies_before_retry",
      "node_failure_and_evidence_claim_failure_classify_before_orchestrator_repair",
      "work_queue_repair_classification_readback",
      "raw_storage_flags_rejected_for_repair_classification",
    ],
    changedFileRefs,
    validationRefs,
    focusedValidationState: "passed_for_repair_contract_scheduler_retry_gate_and_readback",
    fullRepoValidationState: "blocked_by_pre_existing_workflow_definition_evidence_profile_debt",
    fullRepoValidationBlockers: [
      "workflow-definition workQueueProjectionPolicyRef typing drift",
      "workflow-definition-registry product/spec workflow definition typing drift",
      "workflow-evidence-profile duplicate identifier debt",
    ],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogsStored: false,
    rawDbRowsStored: false,
    rawLogsStored: false,
    secretsStored: false,
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
    actorId: "codex:repair-classification-before-retry-closeout",
    reasonCodes: [
      "repair_classification_before_retry_completed",
      "runtime_repair_classification_contract_tested",
      "scheduler_retry_gate_tested",
      "work_queue_repair_classification_readback_tested",
      "work_queue_status_db_runtime_closeout",
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
