#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const workItemId = "openclaw-convergence.model-contract-compiler-consolidation";

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
    "extensions/execution-platform/src/model-decision-contracts/model-decision-compiler.ts",
    "extensions/execution-platform/src/model-decision-contracts/model-decision-compiler.test.ts",
    "extensions/execution-platform/src/workflows/orchestrator-graph-decision.ts",
    "docs/projects/execution-platform/prompts/model-contract-compiler-consolidation-codex.md",
    "docs/projects/execution-platform/specs/pre-product-spec-execution-platform-modularization.md",
    "docs/projects/execution-platform/STATUS.md",
    "docs/projects/execution-platform/CURRENT_SLICE.md",
    "docs/projects/execution-platform/roadmap.md",
  ];
  const validationRefs = [
    "validation://pnpm-test-file/model-decision-compiler-orchestrator-graph-decision-no-semantic-cheats/passed",
    "validation://pnpm-tsgo-fast/model-contract-compiler-orchestrator-scoped/passed",
    "validation://git-diff-check/model-contract-compiler-consolidation/passed",
  ];
  const evidence = writeArtifact("model-contract-compiler-consolidation-closeout.json", {
    artifactKind: "model_contract_compiler_consolidation_closeout",
    workItemId,
    summary:
      "Model Contract Compiler Consolidation promoted model-decision-contracts into the canonical compiler vocabulary for production model boundaries. The compiler now owns boundary inventory, runtime-owned field vocabulary, recursive raw-storage rejection, field-specific repair packets with valid alternatives, structural-only diagnostics, and evidence-kind non-inference. The staged scheduler/orchestrator path now uses the compiler-owned runtime-owned field collector instead of a local field list.",
    completedCapabilities: [
      "model_contract_boundary_registry",
      "runtime_owned_field_vocabulary",
      "recursive_raw_storage_flag_rejection",
      "field_specific_repair_packet_valid_alternatives",
      "scheduler_staged_protocol_compiler_wiring",
      "evidence_kind_non_inference_regression",
      "product_spec_wording_no_semantic_cheat_regression",
    ],
    changedFileRefs,
    validationRefs,
    nextWorkItemId: "openclaw-convergence.active-queue-34",
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
    validationRequired: true,
    sourceEditRequired: true,
    changedFileRefs,
    artifactRefs: [evidence.ref],
    accepted: true,
    actorId: "codex:model-contract-compiler-consolidation-closeout",
    reasonCodes: [
      "model_contract_compiler_consolidated",
      "scheduler_runtime_owned_field_checks_compiler_backed",
      "raw_storage_flags_recursively_rejected",
      "field_specific_repair_packet_hardened",
      "no_semantic_cheat_regression_passed",
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
      LIMIT 12
    `,
  );

  console.log(
    JSON.stringify(
      {
        ok: transition.closed,
        transition,
        evidence,
        nextActive: rows.rows[0] ?? null,
      },
      null,
      2,
    ),
  );
  await runtime.close?.();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
