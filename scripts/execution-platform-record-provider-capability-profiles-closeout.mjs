#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const workItemId = "openclaw-convergence.native-leap-04-provider-capability-profiles";

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
    "extensions/execution-platform/src/workflows/runtime-node-capability-registry.ts",
    "extensions/execution-platform/src/workflows/runtime-node-capability-registry.test.ts",
    "extensions/execution-platform/src/workflows/cost-aware-capability-policy.ts",
    "extensions/execution-platform/src/workflows/cost-aware-capability-policy.test.ts",
    "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
    "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
    "extensions/execution-platform/src/codex-bridge/model-agnostic-tool-worker-loop.test.ts",
    "extensions/execution-platform/src/work-queue/execution-read-model.ts",
    "extensions/execution-platform/src/work-queue/execution-read-model.test.ts",
    "docs/projects/execution-platform/specs/native-agentic-coding-massive-leap.md",
    "docs/projects/execution-platform/specs/non-codex-tool-worker-runtime.md",
    "docs/projects/execution-platform/specs/maximum-toolification-architecture.md",
    "docs/projects/execution-platform/CURRENT_SLICE.md",
    "docs/projects/execution-platform/DECISIONS.md",
    "docs/projects/execution-platform/STATUS.md",
  ];
  const validationRefs = [
    "validation://pnpm-test-file/runtime-node-capability-registry-cost-aware-capability-policy",
    "validation://pnpm-test-file/execution-read-model",
    "validation://pnpm-test-file/runtime-work-graph-scheduler",
    "validation://pnpm-test-file/non-codex-task-decomposition-policy",
    "validation://pnpm-test-file/model-agnostic-tool-worker-loop",
    "validation://pnpm-test-extensions-package-boundary-compile/execution-platform",
  ];
  const evidence = writeArtifact("provider-capability-profiles-closeout.json", {
    artifactKind: "provider_capability_profiles_closeout",
    workItemId,
    summary:
      "Provider Capability Profiles are now registry-derived production runtime truth for scheduler worker/model selection, qualification gating, cost-aware readback, and Work Queue owner progress.",
    completedCapabilities: [
      "provider_capability_profile_registry",
      "runtime_derived_profile_truth_from_capability_manifest",
      "production_selectability_gate_for_profiles",
      "cost_aware_policy_profile_validation",
      "diagnostic_contract_only_profile_rejection",
      "runtime_owned_node_executor_worker_evidence_derivation",
      "scheduler_profile_progress_readback",
      "work_queue_provider_profile_owner_readback",
      "kimi_patch_author_qualification_default_for_source_edits",
    ],
    changedFileRefs,
    validationRefs,
    fullRepoValidationState: "blocked_by_pre_existing_workflow_definition_evidence_profile_debt",
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
    actorId: "codex:provider-capability-profiles-closeout",
    reasonCodes: [
      "provider_capability_profiles_completed",
      "profile_registry_tested",
      "cost_aware_profile_policy_tested",
      "work_queue_profile_readback_tested",
      "scheduler_profile_wiring_tested",
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
