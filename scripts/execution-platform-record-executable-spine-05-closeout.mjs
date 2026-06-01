#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const proofPath = path.join(
  root,
  ".artifacts/execution-platform/product-spec-replay-proof-resource-materialization/proof.json",
);
const replayResultPath = path.join(
  root,
  ".artifacts/execution-platform/product-spec-boundary-replay-result.json",
);
const workItemId = "openclaw-convergence.executable-spine-05-readiness-readback-collapse";
const nextItemId = "openclaw-convergence.executable-spine-06-replay-proof-gate";
const sourceSpecRef =
  "docs/projects/execution-platform/specs/control-plane-executable-spine-recovery.md#7-branch-scoped-readiness-and-root-cause-collapse";

const changedFileRefs = [
  "extensions/execution-platform/src/observability/canonical-readback-gate.ts",
  "extensions/execution-platform/src/work-queue/projections/readback-projections.test.ts",
  "scripts/execution-platform-run-product-spec-boundary-replay.mjs",
  "scripts/execution-platform-record-executable-spine-05-closeout.mjs",
];

const validationRefs = [
  "validation://executable-spine-05/product-spec-after-resource-materialization-readiness-drift-worker-canary-succeeded",
  "validation://executable-spine-05/focused-readiness-readback-scheduler-no-semantic-cheats-suite-342-pass",
  "validation://executable-spine-05/tsgo-fast-pass",
  "validation://executable-spine-05/git-diff-check-pass",
];

function sha256(value) {
  return createHash("sha256").update(String(value ?? ""), "utf8").digest("hex");
}

function readJson(absPath) {
  return JSON.parse(fs.readFileSync(absPath, "utf8"));
}

function artifactHash(absPath) {
  return `sha256:${sha256(fs.readFileSync(absPath, "utf8"))}`;
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

function requireReadinessReadbackProof(proof) {
  const selected = proof?.selectedBoundaryNode ?? proof?.selectedBoundaryNodes?.[0] ?? {};
  const worker = proof?.workerSmokeResult ?? {};
  const changed = worker.changedFileRefs ?? [];
  const validation = worker.validationRefs ?? [];
  const claims = worker.evidenceClaims ?? [];
  const driftCodes = selected.readinessProjectionDriftReasonCodes ?? [];
  const driftMissing = selected.readinessProjectionMissingFields ?? [];
  const failures = [];

  if (proof?.status !== "succeeded") {failures.push("proof status is not succeeded");}
  if (proof?.boundary !== "after-resource-materialization") {
    failures.push("proof boundary is not after-resource-materialization");
  }
  if (selected.executionIntent !== "source_edit") {failures.push("selected node is not source_edit");}
  if (!selected.nodeExecutionPacketRef) {failures.push("missing node execution packet ref");}
  if (!selected.resourcePacketRef) {failures.push("missing resource packet ref");}
  if (!selected.nodeReadinessStateRef) {failures.push("missing node readiness state ref");}
  if (selected.readinessProjectionStatus !== "stale") {
    failures.push("readiness projection status is not stale");
  }
  if (selected.readinessProjectionStale !== true) {failures.push("readiness projection is not marked stale");}
  if (selected.readinessProjectionCanUnlockExecution !== false) {
    failures.push("stale readiness projection can still unlock execution");
  }
  if (selected.recomputedReadinessCanExecute !== true) {
    failures.push("current recomputed readiness cannot execute");
  }
  if (selected.implementationPacketReady !== true) {failures.push("implementation packet is not ready");}
  if (selected.executionReadinessAuthority !== "recomputed_current_readiness") {
    failures.push("execution readiness authority is not recomputed_current_readiness");
  }
  if (selected.executable !== true) {failures.push("selected boundary node is not executable");}
  if (selected.recomputedReadinessDiffersFromPersisted !== true) {
    failures.push("proof does not demonstrate persisted/current readiness drift");
  }
  if (!selected.nodeReadinessStatus) {failures.push("missing recomputed node readiness status");}
  if (!selected.persistedNodeReadinessStatus) {failures.push("missing persisted node readiness status");}
  if (driftCodes.length < 1) {failures.push("readiness projection drift reason codes are missing");}
  if (driftMissing.length < 1) {failures.push("readiness projection missing fields are missing");}
  if (selected.readinessProjectionDrift?.rawPromptStored) {
    failures.push("readiness drift artifact stored raw prompt");
  }
  if (selected.readinessProjectionDrift?.rawResponseStored) {
    failures.push("readiness drift artifact stored raw response");
  }
  if (selected.readinessProjectionDrift?.rawProviderLogStored) {
    failures.push("readiness drift artifact stored raw provider log");
  }
  if (selected.readinessProjectionDrift?.rawToolLogStored) {
    failures.push("readiness drift artifact stored raw tool log");
  }
  if (worker.status !== "succeeded") {failures.push("worker smoke result did not succeed");}
  if (changed.length < 1) {failures.push("worker smoke result has no changed files");}
  if (validation.length < 1) {failures.push("worker smoke result has no validation refs");}
  if (claims.length < 1) {failures.push("worker smoke result has no evidence claims");}
  if (worker.rawPromptStored || worker.rawResponseStored || worker.rawProviderLogStored || worker.rawToolLogStored) {
    failures.push("worker canary stored raw prompt/response/provider/tool logs");
  }
  if (worker.workQueueLifecycleMutated) {failures.push("worker canary mutated work queue lifecycle");}

  if (failures.length > 0) {
    throw new Error(`Executable spine 05 proof is not closeable: ${failures.join("; ")}`);
  }

  return {
    selectedNodeId: selected.nodeId,
    executionIntent: selected.executionIntent,
    selectedNodeReadinessStatus: selected.nodeReadinessStatus,
    selectedPersistedNodeReadinessStatus: selected.persistedNodeReadinessStatus,
    recomputedReadinessDiffersFromPersisted: selected.recomputedReadinessDiffersFromPersisted,
    readinessProjectionStatus: selected.readinessProjectionStatus,
    readinessProjectionCanUnlockExecution: selected.readinessProjectionCanUnlockExecution,
    readinessProjectionStale: selected.readinessProjectionStale,
    readinessProjectionDriftReasonCodes: driftCodes,
    readinessProjectionMissingFields: driftMissing,
    recomputedReadinessCanExecute: selected.recomputedReadinessCanExecute,
    implementationPacketReady: selected.implementationPacketReady,
    executionReadinessAuthority: selected.executionReadinessAuthority,
    changedFileRefs: changed,
    validationRefs: validation,
    evidenceClaimRefs: claims.map((claim) => claim.evidenceRef).filter(Boolean),
    runtimeToolInvocationRefs: worker.runtimeToolInvocationRefs ?? [],
  };
}

async function main() {
  const proof = readJson(proofPath);
  const replayResult = readJson(replayResultPath);
  const proofSummary = requireReadinessReadbackProof(proof);
  if (replayResult?.status !== "succeeded") {
    throw new Error("Boundary replay result is not succeeded.");
  }

  const api = await tsImport(
    path.join(root, "extensions/execution-platform/src/index.ts"),
    import.meta.url,
  );
  const runtime = await api.createExecutionPlatformDatabaseRuntime({ applyMigrations: false });
  const runtimeJobs = new api.RuntimeJobRepository(runtime.sqlClient);
  const workQueue = new api.WorkQueueRepository(runtime.sqlClient, runtimeJobs);

  const evidence = writeArtifact("executable-spine-05-readiness-readback-collapse-closeout.json", {
    artifactKind: "execution_platform.executable_spine_05_readiness_readback_collapse_closeout",
    workItemId,
    nextItemId,
    sourceSpecRef,
    runtimeJobId: proof.runtimeJobId,
    graphId: proof.graphId,
    boundary: proof.boundary,
    proofArtifactPath: ".artifacts/execution-platform/product-spec-replay-proof-resource-materialization/proof.json",
    proofArtifactHash: artifactHash(proofPath),
    replayResultPath: ".artifacts/execution-platform/product-spec-boundary-replay-result.json",
    replayResultHash: artifactHash(replayResultPath),
    implementationSummary:
      "Executable Spine 05 closes the readiness/readback drift boundary. Owner readback now treats exact readiness-projection drift as a canonical resource-materialization blocker even if a persisted node status says ready. The replay proof demonstrates that stale persisted readiness cannot unlock execution, while the current recomputed readiness plus a ready implementation packet can authorize the representative Product/Spec worker canary.",
    completedCapabilities: [
      "readiness_projection_drift_fields_in_canonical_readback_gate",
      "exact_readiness_projection_drift_reason_codes",
      "stale_projection_blocks_canonical_first_open_gate",
      "stale_checkpoint_label_suppressed_by_resource_materialization_gate",
      "readiness_drift_owner_readback_projection_test",
      "after_resource_materialization_replay_readiness_authority_fields",
      "stale_persisted_projection_cannot_unlock_execution",
      "current_recomputed_readiness_authorizes_execution_when_packet_ready",
      "representative_worker_canary_preserves_validation_and_evidence",
    ],
    forbiddenPathsRetired: [
      "persisted_ready_status_silently_unlocks_when_projection_is_stale",
      "obligation_graph_checkpoint_overrides_current_resource_gate",
      "readiness_projection_drift_hidden_from_owner_readback",
      "worker_failure_masking_resource_readiness_projection_drift",
      "raw_provider_or_prompt_body_in_readiness_drift_artifact",
    ],
    proofSummary,
    validationCommands: [
      {
        command:
          "node scripts/execution-platform-run-product-spec-boundary-replay.mjs --runtime-job-id product-spec-replay-mpl69vto --graph-id team-run-native-exec-12fa6ecec70ecb9a-checkpoint-replay-mpl69vtn-runtime-work-graph --boundary after-resource-materialization --execute-workers --max-parallel-node-executions 1 --target-node-id g-1fe65d8620-work-intent-wu-plugin-definition-hardening-implementation-862f2c84e5e9:task:5",
        result: "passed",
        proofArtifactPath: ".artifacts/execution-platform/product-spec-replay-proof-resource-materialization/proof.json",
      },
      {
        command:
          "pnpm test:file extensions/execution-platform/src/workflows/readiness-recompute-authority.test.ts extensions/execution-platform/src/workflows/node-resource-materialization.test.ts extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts extensions/execution-platform/src/workflows/scheduler-runtime-tools.test.ts extensions/execution-platform/src/observability/latest-run-state.test.ts extensions/execution-platform/src/work-queue/projections/readback-projections.test.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts",
        result: "passed",
        testFilesPassed: 8,
        testsPassed: 342,
      },
      {
        command: "pnpm tsgo:fast",
        result: "passed",
      },
      {
        command: "git diff --check",
        result: "passed",
      },
    ],
    changedFileRefs,
    validationRefs,
    residuals: [
      "This slice closes readiness/readback drift handling for the representative after-resource-materialization worker canary. The next executable-spine item must prove replay gates across the completed packet/resource boundaries before the top-to-bottom Product/Spec proof.",
      "Kimi patch-turn latency remains a performance concern for later model/latency policy work, but it did not block this readiness/readback closeout.",
    ],
    semanticJudgmentOwner: "model_or_human",
    runtimeAuthority:
      "exact_schema_fields_reason_codes_refs_hashes_readiness_projection_drift_current_readiness_recompute_first_open_gate_projection_worker_validation_evidence_refs",
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    hiddenReasoningStored: false,
    workQueueLifecycleMutated: false,
  });

  const transition = await workQueue.completeWorkQueueItemFromCloseout({
    workItemId,
    closeoutRef: evidence.ref,
    closeoutHash: evidence.sha256,
    validationRef: validationRefs.join(","),
    graphRef: `runtime-work-graph://${proof.graphId}`,
    ownerReadbackRef: evidence.ref,
    sourceEditRequired: true,
    changedFileRefs,
    artifactRefs: [
      evidence.ref,
      "artifact://execution-platform/product-spec-replay-proof-resource-materialization/proof.json",
      "artifact://execution-platform/product-spec-boundary-replay-result.json",
    ],
    accepted: true,
    actorId: "codex:executable-spine-05-closeout",
    reasonCodes: [
      "executable_spine_05_readiness_readback_collapse_passed",
      "readiness_projection_drift_blocks_stale_projection_execution",
      "canonical_first_open_gate_surfaces_resource_materialization",
      "current_recomputed_readiness_authority_recorded",
      "implementation_packet_ready_authority_recorded",
      "representative_product_spec_worker_canary_still_succeeded",
      "validation_and_evidence_refs_preserved",
      "focused_validation_passed",
      "type_validation_passed",
      "git_diff_check_passed",
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

  await runtime.sqlClient.query(
    `
      UPDATE execution_platform.work_items
      SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb,
          updated_at = now()
      WHERE work_item_id = $2
    `,
    [
      JSON.stringify({
        previousPreProofItemClosed: workItemId,
        nextActiveReason:
          "Branch readiness/readback collapse is closed; the next item must prove replay gates from completed packet/resource boundaries before the broader Product/Spec proof.",
        executableSpine05ProofRef: evidence.ref,
        readinessProjectionClosed: {
          selectedNodeReadinessStatus: proofSummary.selectedNodeReadinessStatus,
          selectedPersistedNodeReadinessStatus: proofSummary.selectedPersistedNodeReadinessStatus,
          recomputedReadinessDiffersFromPersisted: proofSummary.recomputedReadinessDiffersFromPersisted,
          readinessProjectionStatus: proofSummary.readinessProjectionStatus,
          readinessProjectionCanUnlockExecution: proofSummary.readinessProjectionCanUnlockExecution,
          recomputedReadinessCanExecute: proofSummary.recomputedReadinessCanExecute,
          implementationPacketReady: proofSummary.implementationPacketReady,
          executionReadinessAuthority: proofSummary.executionReadinessAuthority,
        },
        rawPromptStored: false,
        rawResponseStored: false,
        rawTranscriptStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        rawCommandLogStored: false,
        rawDbRowsStored: false,
      }),
      nextItemId,
    ],
  );

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
        proofSummary,
        nextActive: rows.rows[0] ?? null,
        nextActiveItems: rows.rows,
      },
      null,
      2,
    ),
  );

  await runtime.close?.();
  await runtime.pool?.end?.();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
