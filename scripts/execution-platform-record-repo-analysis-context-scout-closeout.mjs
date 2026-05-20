#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const workItemId = "openclaw-convergence.native-leap-06-repo-analysis-context-scout";

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
    "extensions/execution-platform/src/workflows/context-scout-tool-loop.ts",
    "extensions/execution-platform/src/workflows/context-scout-tool-loop.test.ts",
    "extensions/execution-platform/src/workflows/mission-work-packets.ts",
    "extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts",
    "extensions/execution-platform/src/codex-bridge/context-scout-node-executor.ts",
    "extensions/execution-platform/src/codex-bridge/context-scout-boundary-replay.test.ts",
    "extensions/execution-platform/src/codex-bridge/parallel-context-scout-boundary-replay.ts",
    "extensions/execution-platform/src/codex-bridge/parallel-context-scout-boundary-replay.test.ts",
    "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
    "extensions/execution-platform/src/work-queue/execution-read-model.ts",
    "docs/projects/execution-platform/specs/native-agentic-coding-massive-leap.md",
    "docs/projects/execution-platform/specs/product-spec-checkpointed-proof-framework.md",
    "docs/projects/execution-platform/CURRENT_SLICE.md",
    "docs/projects/execution-platform/DECISIONS.md",
    "docs/projects/execution-platform/STATUS.md",
  ];
  const validationRefs = [
    "validation://pnpm-test-file/context-scout-tool-loop-context-boundary-parallel-boundary",
    "validation://pnpm-test-file/execution-read-model-runtime-work-graph-scheduler",
    "validation://pnpm-tsgo-fast/blocked-by-pre-existing-workflow-definition-evidence-profile-debt",
  ];
  const evidence = writeArtifact("repo-analysis-context-scout-closeout.json", {
    artifactKind: "repo_analysis_context_scout_closeout",
    workItemId,
    summary:
      "Context scout is now a repo-analysis tool-loop surface with canonical runtime tool refs, bounded repo findings, synthesis-ready handoff packets, replayable parallel scout fanout/barrier graph evidence, and Work Queue readback for synthesis readiness and blockers.",
    completedCapabilities: [
      "canonical_context_scout_repo_analysis_tool_ids",
      "production_context_scout_repo_search_file_symbol_test_tool_traces",
      "context_handoff_packet_synthesis_fields",
      "context_scout_tool_loop_repo_analysis_findings",
      "runtime_supplied_refs_not_clean_success",
      "parallel_context_scout_replay_synthesis_barrier",
      "context_supplies_edges_for_replayable_handoffs",
      "work_queue_context_scout_repo_analysis_readback",
    ],
    changedFileRefs,
    validationRefs,
    fullRepoValidationState: "blocked_by_pre_existing_workflow_definition_evidence_profile_debt",
    fullRepoValidationBlockers: [
      "workflow-definition-registry product/spec workflow definition typing drift",
      "workflow-evidence-profile duplicate identifier debt",
    ],
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
    actorId: "codex:repo-analysis-context-scout-closeout",
    reasonCodes: [
      "repo_analysis_context_scout_completed",
      "context_scout_repo_analysis_tools_tested",
      "context_scout_handoff_packet_synthesis_fields_tested",
      "parallel_context_scout_synthesis_barrier_tested",
      "work_queue_context_scout_readback_tested",
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
