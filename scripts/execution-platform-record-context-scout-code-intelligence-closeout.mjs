#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const workItemId = "openclaw-convergence.coding-leap-02-context-scout-code-intelligence";

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
    "extensions/execution-platform/src/codex-bridge/context-scout-node-executor.ts",
    "extensions/execution-platform/src/codex-bridge/parallel-context-scout-boundary-replay.ts",
    "extensions/execution-platform/src/codex-bridge/parallel-context-scout-boundary-replay.test.ts",
    "extensions/execution-platform/src/workflows/context-scout-tool-loop.ts",
    "extensions/execution-platform/src/workflows/context-scout-tool-loop.test.ts",
    "extensions/execution-platform/src/workflows/mission-work-packets.ts",
    "extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts",
    "docs/projects/execution-platform/CURRENT_SLICE.md",
    "docs/projects/execution-platform/STATUS.md",
    "docs/projects/execution-platform/specs/coding-executor-team-capability-leap.md",
    "scripts/execution-platform-record-context-scout-code-intelligence-closeout.mjs",
  ];
  const validationRefs = [
    "validation://pnpm-test-file/context-scout-code-intelligence-contracts",
    "validation://tsx-import/context-scout-node-executor",
    "validation://pnpm-tsgo-fast/blocked-by-pre-existing-workflow-definition-evidence-profile-debt",
  ];
  const evidence = writeArtifact("context-scout-code-intelligence-closeout.json", {
    artifactKind: "context_scout_code_intelligence_closeout",
    workItemId,
    summary:
      "Context Scout Over Code Intelligence is implemented as production context-scout runtime wiring. Context scout node execution now invokes Code Intelligence through Runtime Tool Kernel, carries bounded code-intelligence refs into ContextHandoffPacket and ContextScoutToolLoopRun, preserves per-commitment refs in parallel replay, and surfaces structural-mode limitations instead of claiming LSP semantic parity.",
    completedCapabilities: [
      "context_scout_invokes_code_intelligence_runtime_tools",
      "context_handoff_packet_code_intelligence_refs",
      "context_scout_tool_loop_code_intelligence_refs",
      "repo_analysis_code_intelligence_findings",
      "parallel_context_scout_replay_preserves_code_intelligence_refs",
      "structural_mode_disclosed_as_limitation",
      "raw_storage_flags_false",
    ],
    changedFileRefs,
    validationRefs,
    focusedValidationState:
      "passed_for_context_scout_contracts_parallel_replay_and_code_intelligence_runtime_tools",
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
    artifactRefs: [evidence.ref],
    accepted: true,
    actorId: "codex:context-scout-code-intelligence-closeout",
    reasonCodes: [
      "context_scout_code_intelligence_completed",
      "context_scout_invokes_code_intelligence_runtime_tools",
      "context_handoff_packet_code_intelligence_refs_added",
      "parallel_context_scout_replay_preserves_code_intelligence_refs",
      "focused_validation_passed",
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
