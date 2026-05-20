#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const workItemId = "openclaw-convergence.coding-leap-01-code-intelligence-substrate";

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
    "extensions/execution-platform/src/code-intelligence/types.ts",
    "extensions/execution-platform/src/code-intelligence/code-intelligence-service.ts",
    "extensions/execution-platform/src/code-intelligence/code-intelligence-runtime-tools.ts",
    "extensions/execution-platform/src/code-intelligence/index.ts",
    "extensions/execution-platform/src/code-intelligence/code-intelligence-service.test.ts",
    "extensions/execution-platform/src/code-intelligence/code-intelligence-runtime-tools.test.ts",
    "extensions/execution-platform/src/runtime-tool-call/runtime-tool-types.ts",
    "extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts",
    "extensions/execution-platform/src/workflows/agent-team-coding-plugin.ts",
    "extensions/execution-platform/src/workflows/workflow-definition-registry.ts",
    "extensions/execution-platform/src/work-queue/execution-read-model.ts",
    "extensions/execution-platform/src/index.ts",
    "scripts/execution-platform-run-code-intelligence-model-usability-proof.mjs",
    "docs/projects/execution-platform/CURRENT_SLICE.md",
    "docs/projects/execution-platform/STATUS.md",
    "docs/projects/execution-platform/specs/coding-executor-team-capability-leap.md",
  ];
  const validationRefs = [
    "validation://pnpm-test-file/code-intelligence-service-and-runtime-tools",
    "validation://model-usability-proof/qwen-qwen3-coder-next/code-intelligence-model-usability-mpctudkn",
    "validation://pnpm-tsgo-fast/blocked-by-pre-existing-workflow-definition-evidence-profile-debt",
  ];
  const modelUsabilityProofRef =
    "artifact://execution-platform/code-intelligence-model-usability-mpctudkn.json";
  const evidence = writeArtifact("code-intelligence-substrate-closeout.json", {
    artifactKind: "code_intelligence_substrate_closeout",
    workItemId,
    summary:
      "Code Intelligence Substrate is implemented as a first-class Runtime Tool Kernel-backed read-only code intelligence family. The initial TS/JS production path provides bounded structural symbols, definitions, references, hover summaries, diagnostics, document/workspace symbols, call hierarchy candidates, implementation candidates, rename plans, code actions, related-test discovery, import graphs, impact radius, and file structure summaries. Structural mode is explicit and does not masquerade as LSP semantic success.",
    completedCapabilities: [
      "code_intelligence_service_structural_ts_js",
      "runtime_tool_kernel_code_intelligence_family",
      "scheduler_runtime_tool_registration",
      "coding_workflow_tool_family_advertised",
      "work_queue_code_intelligence_readback",
      "bounded_model_usability_proof",
      "raw_storage_flags_false",
    ],
    changedFileRefs,
    validationRefs,
    modelUsabilityProofRef,
    focusedValidationState: "passed_for_service_runtime_tool_registration_and_model_usability",
    fullRepoValidationState: "blocked_by_pre_existing_workflow_definition_evidence_profile_debt",
    fullRepoValidationBlockers: [
      "workflow-definition workQueueProjectionPolicyRef typing drift",
      "workflow-definition-registry product/spec and architecture workflow typing drift",
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
    artifactRefs: [evidence.ref, modelUsabilityProofRef],
    accepted: true,
    actorId: "codex:code-intelligence-substrate-closeout",
    reasonCodes: [
      "code_intelligence_substrate_completed",
      "runtime_tool_kernel_code_intelligence_registered",
      "work_queue_code_intelligence_readback_added",
      "model_usability_proof_passed",
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
