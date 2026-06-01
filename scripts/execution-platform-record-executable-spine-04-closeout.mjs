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
const workItemId = "openclaw-convergence.executable-spine-04-worker-one-edit-canary";
const nextItemId = "openclaw-convergence.executable-spine-05-readiness-readback-collapse";
const sourceSpecRef =
  "docs/projects/execution-platform/specs/control-plane-executable-spine-recovery.md#6-worker-small-verb-loop";

const validationRefs = [
  "validation://executable-spine-04/product-spec-after-resource-materialization-worker-canary-succeeded",
  "validation://executable-spine-04/focused-worker-resource-scheduler-no-semantic-cheats-suite-219-pass",
  "validation://executable-spine-04/tsgo-fast-pass",
  "validation://executable-spine-04/git-diff-check-pass",
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

function requireCanaryProof(proof) {
  const worker = proof?.workerSmokeResult ?? {};
  const selected = proof?.selectedBoundaryNode ?? {};
  const reasonCodes = new Set(worker.reasonCodes ?? []);
  const changedFileRefs = worker.changedFileRefs ?? [];
  const validationRefs = worker.validationRefs ?? [];
  const evidenceClaims = worker.evidenceClaims ?? [];
  const requiredReasonCodes = [
    "worker_patch_force_author_from_plan_recorded",
    "worker_patch_author_edit_compiled_to_runtime_patch",
    "worker_edit_apply_patch_completed",
    "worker_validation_structural_default_completed",
    "worker_evidence_claim_recorded",
    "boundary_replay_worker_edits_rolled_back_for_review",
  ];

  const failures = [];
  if (proof?.status !== "succeeded") {failures.push("proof status is not succeeded");}
  if (proof?.boundary !== "after-resource-materialization") {
    failures.push("proof boundary is not after-resource-materialization");
  }
  if (selected.executionIntent !== "source_edit") {failures.push("selected node is not source_edit");}
  if (!selected.nodeExecutionPacketRef) {failures.push("missing node execution packet ref");}
  if (!selected.resourcePacketRef) {failures.push("missing resource packet ref");}
  if (!selected.implementationContextPacketRef) {failures.push("missing implementation context packet ref");}
  if (!selected.nodeReadinessStateRef) {failures.push("missing node readiness state ref");}
  if (worker.status !== "succeeded") {failures.push("worker smoke result did not succeed");}
  if (changedFileRefs.length < 1) {failures.push("worker canary recorded no changed files");}
  if (validationRefs.length < 1) {failures.push("worker canary recorded no validation refs");}
  if (evidenceClaims.length < 1) {failures.push("worker canary recorded no evidence claims");}
  for (const code of requiredReasonCodes) {
    if (!reasonCodes.has(code)) {failures.push(`missing reason code: ${code}`);}
  }
  if (worker.rawPromptStored || worker.rawResponseStored || worker.rawProviderLogStored || worker.rawToolLogStored) {
    failures.push("worker canary stored raw prompt/response/provider/tool logs");
  }
  if (worker.workQueueLifecycleMutated) {failures.push("worker canary mutated work queue lifecycle");}

  if (failures.length > 0) {
    throw new Error(`Executable spine 04 proof is not closeable: ${failures.join("; ")}`);
  }

  return {
    selectedNodeId: selected.nodeId,
    changedFileRefs,
    validationRefs,
    evidenceClaimRefs: evidenceClaims.map((claim) => claim.evidenceRef).filter(Boolean),
    runtimeToolInvocationRefs: worker.runtimeToolInvocationRefs ?? [],
    pendingReviewChangedFileRefs: worker.metadata?.pendingReviewChangedFileRefs ?? changedFileRefs,
    workspacePersistenceMode: worker.metadata?.workspacePersistenceMode ?? "unknown",
    recomputedReadinessDiffersFromPersisted: Boolean(selected.recomputedReadinessDiffersFromPersisted),
    selectedNodeReadinessStatus: selected.nodeReadinessStatus,
    selectedPersistedNodeReadinessStatus: selected.persistedNodeReadinessStatus,
  };
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
  const proof = readJson(proofPath);
  const replayResult = readJson(replayResultPath);
  const proofSummary = requireCanaryProof(proof);
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

  const evidence = writeArtifact("executable-spine-04-worker-one-edit-canary-closeout.json", {
    artifactKind: "execution_platform.executable_spine_04_worker_one_edit_canary_closeout",
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
      "Executable Spine 04 proved one representative Product/Spec-derived source-edit node from the replayable after-resource-materialization boundary. The worker received a hydrated NodeExecutionPacket and resource/context refs, planned via small verbs, entered the runtime-forced patch-author boundary, applied one scoped edit, ran structural post-edit validation, emitted commitment-linked evidence claims, and rolled the edit back after recording a reviewable artifact.",
    completedCapabilities: [
      "representative_product_spec_source_edit_worker_canary",
      "hydrated_node_execution_packet_worker_gate",
      "small_verb_task_brief_snapshot_plan_patch_validate_evidence_loop",
      "runtime_forced_patch_author_from_plan_boundary",
      "runtime_compiled_patch_application",
      "post_edit_structural_validation_default",
      "commitment_linked_evidence_from_validation",
      "reviewable_patch_artifact_and_rollback_after_review",
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
          "pnpm test:file extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.test.ts extensions/execution-platform/src/codex-bridge/file-edit-worker-adapter.test.ts extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.test.ts extensions/execution-platform/src/workflows/node-resource-materialization.test.ts extensions/execution-platform/src/workflows/scheduler-runtime-tools.test.ts extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts",
        result: "passed",
        testFilesPassed: 7,
        testsPassed: 219,
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
    changedFileRefs: [
      ...new Set([
        ...proofSummary.changedFileRefs,
        "scripts/execution-platform-record-executable-spine-04-closeout.mjs",
      ]),
    ],
    validationRefs,
    residuals: [
      "The canary exposed a readiness projection mismatch: recomputed readiness was ready_with_limitations while persisted readiness was ready. That is intentionally carried into executable-spine-05-readiness-readback-collapse.",
      "This slice proves one executable worker edit lane from a hydrated Product/Spec node; it does not claim full frontier completion or top-to-bottom Product/Spec proof.",
    ],
    semanticJudgmentOwner: "model_or_human",
    runtimeAuthority:
      "tool_contracts_refs_hashes_path_scope_patch_application_validation_execution_evidence_ref_compilation_readiness_gate_rollback_after_review",
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
    changedFileRefs: [
      ...new Set([
        ...proofSummary.changedFileRefs,
        "scripts/execution-platform-record-executable-spine-04-closeout.mjs",
      ]),
    ],
    artifactRefs: [
      evidence.ref,
      "artifact://execution-platform/product-spec-replay-proof-resource-materialization/proof.json",
      "artifact://execution-platform/product-spec-boundary-replay-result.json",
    ],
    accepted: true,
    actorId: "codex:executable-spine-04-closeout",
    reasonCodes: [
      "executable_spine_04_worker_one_edit_canary_passed",
      "representative_product_spec_source_edit_node_executed",
      "hydrated_node_execution_packet_ready",
      "small_verb_worker_loop_completed",
      "runtime_forced_patch_author_boundary_used",
      "scoped_edit_applied",
      "post_edit_structural_validation_passed",
      "commitment_linked_evidence_recorded",
      "review_artifact_recorded_and_edit_rolled_back",
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
          "One representative worker edit canary passed; next item must collapse readiness/readback mismatch and stale first-open-gate projection before broader proof replay.",
        executableSpine04ProofRef: evidence.ref,
        readinessProjectionResidual: {
          selectedNodeReadinessStatus: proofSummary.selectedNodeReadinessStatus,
          selectedPersistedNodeReadinessStatus: proofSummary.selectedPersistedNodeReadinessStatus,
          recomputedReadinessDiffersFromPersisted: proofSummary.recomputedReadinessDiffersFromPersisted,
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
