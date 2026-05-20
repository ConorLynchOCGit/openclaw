#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const workItemId = "openclaw-convergence.coding-leap-02b-code-intelligence-lsp-semantic-backend";

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
    "extensions/execution-platform/src/code-intelligence/code-intelligence-backends.ts",
    "extensions/execution-platform/src/code-intelligence/code-intelligence-service.ts",
    "extensions/execution-platform/src/code-intelligence/code-intelligence-runtime-tools.ts",
    "extensions/execution-platform/src/code-intelligence/types.ts",
    "extensions/execution-platform/src/code-intelligence/index.ts",
    "extensions/execution-platform/src/code-intelligence/code-intelligence-service.test.ts",
    "extensions/execution-platform/src/code-intelligence/code-intelligence-runtime-tools.test.ts",
    "extensions/execution-platform/src/codex-bridge/context-scout-node-executor.ts",
    "extensions/execution-platform/src/codex-bridge/parallel-context-scout-boundary-replay.ts",
    "extensions/execution-platform/src/codex-bridge/parallel-context-scout-boundary-replay.test.ts",
    "extensions/execution-platform/src/workflows/context-scout-tool-loop.ts",
    "extensions/execution-platform/src/workflows/context-scout-tool-loop.test.ts",
    "extensions/execution-platform/src/work-queue/execution-read-model.ts",
    "extensions/execution-platform/src/work-queue/execution-read-model.test.ts",
    "scripts/execution-platform-run-code-intelligence-model-usability-proof.mjs",
    "scripts/execution-platform-record-code-intelligence-semantic-backend-closeout.mjs",
    "docs/projects/execution-platform/CURRENT_SLICE.md",
    "docs/projects/execution-platform/STATUS.md",
    "docs/projects/execution-platform/DECISIONS.md",
    "docs/projects/execution-platform/roadmap.md",
    "docs/projects/execution-platform/specs/coding-executor-team-capability-leap.md",
  ];
  const validationRefs = [
    "validation://pnpm-test-file/code-intelligence-semantic-backend-context-readback",
    "validation://tsx-import/code-intelligence-semantic-backend",
    "validation://tsx-import/code-intelligence-service",
    "validation://tsx-import/context-scout-node-executor",
    "validation://model-usability-proof/qwen-qwen3-coder-next/code-intelligence-model-usability-mpcv9txe",
    "validation://pnpm-tsgo-fast/blocked-by-pre-existing-workflow-definition-evidence-profile-debt",
  ];
  const modelUsabilityProofRef =
    "artifact://execution-platform/code-intelligence-model-usability-mpcv9txe.json";
  const evidence = writeArtifact("code-intelligence-semantic-backend-closeout.json", {
    artifactKind: "code_intelligence_semantic_backend_closeout",
    workItemId,
    summary:
      "Code Intelligence Semantic Backend And LSP Parity is implemented for the current OpenClaw TS/JS runtime path. A canonical backend registry selects the TypeScript language-service semantic backend behind the existing code.* Runtime Tool Kernel tools; structural parser mode remains explicit degraded fallback. Runtime results and Work Queue readback expose backend health, workspace snapshots, semantic confidence, fallback state, diagnostic/project refs, latency, result counts, and limitations. Context scout/replay preserve semantic backend refs, and structural-only evidence is accepted only with limitations. The model-usability lane passed with Qwen selecting semantic definition/reference/related-test tools, all backed by typescript_language_service with fallback false.",
    completedCapabilities: [
      "code_intelligence_backend_registry",
      "typescript_language_service_semantic_backend",
      "structural_parser_degraded_mode_only",
      "canonical_code_tool_ids_preserved",
      "code_backend_status_runtime_tool",
      "semantic_backend_result_envelope",
      "work_queue_semantic_code_intelligence_readback",
      "context_scout_semantic_refs_and_limitations",
      "parallel_context_replay_semantic_refs",
      "semantic_model_usability_lane_passed",
      "raw_storage_flags_false",
    ],
    changedFileRefs,
    validationRefs,
    modelUsabilityProofRef,
    focusedValidationState:
      "passed_for_semantic_backend_service_runtime_tool_context_scout_readback_and_model_usability",
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
    actorId: "codex:code-intelligence-semantic-backend-closeout",
    reasonCodes: [
      "code_intelligence_semantic_backend_completed",
      "typescript_language_service_backend_registered",
      "structural_mode_degraded_only",
      "work_queue_semantic_readback_added",
      "semantic_model_usability_proof_passed",
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

main().catch((error) => {
  console.error(
    JSON.stringify(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
