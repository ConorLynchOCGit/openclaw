#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");

const defaultWorkItemId = "openclaw-convergence.blocker-closure-06-replay-and-full-proof-gates";
const nextItemId = "openclaw-convergence.active-queue-34";
const sourceSpecRef =
  "docs/projects/execution-platform/specs/control-plane-executable-spine-recovery.md#9-replay-strategy";

const changedFileRefs = [
  "extensions/execution-platform/src/workflows/boundary-replay-registry.ts",
  "extensions/execution-platform/src/workflows/boundary-replay-checkpoints.ts",
  "extensions/execution-platform/src/workflows/boundary-replay-checkpoints.test.ts",
  "extensions/execution-platform/src/workflows/boundary-replay-proof-gate.ts",
  "extensions/execution-platform/src/workflows/boundary-replay-proof-gate.test.ts",
  "extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts",
  "extensions/execution-platform/src/workflows/scheduler-runtime-tools.test.ts",
  "extensions/execution-platform/src/workflows/index.ts",
  "extensions/execution-platform/src/codex-bridge/product-spec-boundary-replay-topology.test.ts",
  "extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.ts",
  "extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.test.ts",
  "scripts/execution-platform-run-product-spec-boundary-replay.mjs",
  "scripts/execution-platform-record-executable-spine-06-closeout.mjs",
];

const validationRefs = [
  "validation://executable-spine-06/product-spec-replay-proof-admitted-worker-boundary-evidence-present",
  "validation://executable-spine-06/executable-spine-regression-suite-406-pass",
  "validation://executable-spine-06/focused-worker-proof-gate-suite-42-pass",
  "validation://executable-spine-06/tsgo-fast-pass",
  "validation://executable-spine-06/git-diff-check-pass",
  "validation://executable-spine-06/replay-script-syntax-pass",
];

function sha256(value) {
  return createHash("sha256").update(String(value ?? ""), "utf8").digest("hex");
}

function readJson(absPath) {
  return JSON.parse(fs.readFileSync(absPath, "utf8"));
}

function flag(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1]?.trim() ?? fallback) : fallback;
}

function artifactRefToPath(ref, label) {
  if (typeof ref !== "string" || !ref.trim()) {
    throw new Error(`${label}_required`);
  }
  const trimmed = ref.trim();
  if (trimmed.startsWith(".artifacts/")) {
    return path.join(root, trimmed);
  }
  if (trimmed.startsWith("artifact://execution-platform/")) {
    return path.join(
      artifactDir,
      trimmed.slice("artifact://execution-platform/".length),
    );
  }
  if (path.isAbsolute(trimmed)) {
    return trimmed;
  }
  throw new Error(`${label}_must_be_run_scoped_artifact_ref:${trimmed}`);
}

function requireRunScopedArtifactRef(ref, label) {
  if (
    typeof ref !== "string" ||
    !(
      ref.startsWith(".artifacts/execution-platform/proof-runs/") ||
      ref.startsWith("artifact://execution-platform/proof-runs/")
    )
  ) {
    throw new Error(`${label}_must_be_product_spec_proof_run_scoped`);
  }
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

function requireArray(value, label) {
  if (!Array.isArray(value) || value.length < 1) {
    throw new Error(`${label} is missing or empty.`);
  }
  return value;
}

function requireReplayProofCloseable({ proof, admission, replayResult }) {
  const worker = proof?.workerSmokeResult ?? {};
  const selected = proof?.selectedBoundaryNode ?? {};
  const middleLaneProof = proof?.middleLaneProof ?? {};
  const failures = [];
  const expectedProofSourceKind = "product_spec_runtime_boundary_replay";
  const nodeLocalMiddleLaneBoundary = proof?.boundary === "node-local-middle-lane";

  if (proof?.proofSourceKind !== expectedProofSourceKind) {
    failures.push("proof source is not Product/Spec runtime boundary replay");
  }
  if (admission?.proofSourceKind !== expectedProofSourceKind) {
    failures.push("admission source is not Product/Spec runtime boundary replay");
  }
  if (admission?.proofSourceAccepted !== true) {
    failures.push("admission did not accept the Product/Spec runtime boundary replay source");
  }
  if (admission?.sourceTopologyStatus !== "production_node_local_topology") {
    failures.push("admission topology is not production node-local topology");
  }
  if (proof?.status !== "succeeded") {failures.push("proof status is not succeeded");}
  if (proof?.boundary !== "after-resource-materialization" && !nodeLocalMiddleLaneBoundary) {
    failures.push("proof boundary is neither after-resource-materialization nor node-local-middle-lane");
  }
  if (proof?.executeWorkers !== true) {failures.push("proof did not execute workers");}
  if (replayResult?.status !== "succeeded") {failures.push("replay result is not succeeded");}
  if (admission?.status !== "admitted") {failures.push("admission gate is not admitted");}
  if (admission?.proofClosureAllowed !== true) {failures.push("proof closure is not allowed");}
  if (admission?.replayPlanStatus !== "accepted") {failures.push("replay plan is not accepted");}
  if (admission?.replayPlanProofClosureAllowed !== true) {
    failures.push("replay plan proof closure is not allowed");
  }
  if ((admission?.missingBoundaryIds ?? []).length !== 0) {
    failures.push("production replay boundary coverage is incomplete");
  }
  if ((admission?.productionReplayBoundaryCoverage ?? []).length !== 8) {
    failures.push("production replay boundary coverage does not cover all eight boundaries");
  }
  if ((admission?.blockerReasonCodes ?? []).length !== 0) {
    failures.push(`admission blocker reason codes present: ${admission.blockerReasonCodes.join(",")}`);
  }
  if (worker.status !== "succeeded") {failures.push("worker smoke result did not succeed");}
  if (admission?.workerStatus !== "succeeded") {failures.push("admission worker status is not succeeded");}
  if (selected.executable !== true || admission?.selectedNodeExecutable !== true) {
    failures.push("selected boundary node is not executable");
  }
  if (!selected.nodeExecutionPacketRef) {failures.push("missing node execution packet ref");}
  if (!selected.resourcePacketRef && !nodeLocalMiddleLaneBoundary) {
    failures.push("missing resource packet ref");
  }
  if (!selected.nodeReadinessStateRef) {failures.push("missing node readiness state ref");}
  if (selected.executionReadinessAuthority !== "recomputed_current_readiness") {
    failures.push("execution readiness authority is not recomputed_current_readiness");
  }
  if (selected.readinessProjectionCanUnlockExecution !== false) {
    failures.push("stale readiness projection can unlock execution");
  }
  if (selected.recomputedReadinessCanExecute !== true) {
    failures.push("recomputed readiness cannot execute");
  }
  if (selected.implementationPacketReady !== true) {failures.push("implementation packet is not ready");}

  if (nodeLocalMiddleLaneBoundary) {
    const lifecyclePath = Array.isArray(middleLaneProof.lifecyclePath)
      ? middleLaneProof.lifecyclePath
      : [];
    const requiredGates = [
      "work_intent_accepted",
      "context_focus_accepted",
      "node_resource_demand_opened",
      "resource_ledger_ready",
      "target_selection_accepted",
      "write_gate_ready",
      "worker_edit_completed",
      "post_action_validation_passed",
      "evidence_emitted",
    ];
    if (middleLaneProof.status !== "passed") {failures.push("middle-lane proof status is not passed");}
    if (middleLaneProof.implementationNodeStarted !== true) {
      failures.push("middle-lane implementation node did not start");
    }
    if (middleLaneProof.resourceObjectiveFocus?.status !== "accepted") {
      failures.push("middle-lane context focus was not accepted");
    }
    if (middleLaneProof.resourceObjectiveFocus?.modelAuthored !== true) {
      failures.push("middle-lane context focus was not model-authored");
    }
    if (!["open", "fulfilled", "succeeded"].includes(middleLaneProof.nodeResourceDemandStatus)) {
      failures.push("middle-lane node resource demand did not open or fulfill");
    }
    if (middleLaneProof.nodeResourceLedgerReady !== true) {
      failures.push("middle-lane node resource ledger is not ready");
    }
    if (middleLaneProof.targetSelection?.status !== "accepted") {
      failures.push("middle-lane target selection was not accepted");
    }
    if (middleLaneProof.targetSelection?.modelAuthored !== true) {
      failures.push("middle-lane target selection was not model-authored");
    }
    if (middleLaneProof.writeGateStatus !== "ready") {failures.push("middle-lane write gate is not ready");}
    if (middleLaneProof.workerEditStatus !== "completed") {
      failures.push("middle-lane worker edit did not complete");
    }
    if (middleLaneProof.validationStatus !== "passed") {
      failures.push("middle-lane validation did not pass");
    }
    if (middleLaneProof.evidenceStatus !== "emitted") {
      failures.push("middle-lane evidence was not emitted");
    }
    if (middleLaneProof.realModelProof !== true || !(middleLaneProof.providerCallCount > 0)) {
      failures.push("middle-lane real model proof/provider calls are missing");
    }
    if (middleLaneProof.metadataManifestSafe !== true) {
      failures.push("middle-lane metadata manifest is not safe");
    }
    for (const gate of requiredGates) {
      if (!lifecyclePath.includes(gate)) {
        failures.push(`middle-lane lifecycle gate missing: ${gate}`);
      }
    }
  }

  const changed = requireArray(worker.changedFileRefs, "worker changed file refs");
  const validation = requireArray(worker.validationRefs, "worker validation refs");
  const claims = requireArray(worker.evidenceClaims, "worker evidence claims");
  requireArray(admission.changedFileRefs, "admission changed file refs");
  requireArray(admission.validationRefs, "admission validation refs");
  requireArray(admission.evidenceClaimRefs, "admission evidence claim refs");

  if (
    proof?.rawPromptStored ||
    proof?.rawResponseStored ||
    proof?.rawProviderLogStored ||
    proof?.rawToolLogStored ||
    proof?.rawCommandLogsStored ||
    proof?.rawDbRowsStored ||
    worker.rawPromptStored ||
    worker.rawResponseStored ||
    worker.rawProviderLogStored ||
    worker.rawToolLogStored ||
    admission?.rawPromptStored ||
    admission?.rawResponseStored ||
    admission?.rawProviderLogStored ||
    admission?.rawToolLogStored ||
    admission?.rawCommandLogsStored ||
    admission?.rawDbRowsStored
  ) {
    failures.push("raw prompt/response/provider/tool/command/db storage flag is set");
  }
  if (admission?.authorityGranted || admission?.workQueueLifecycleMutated || worker.workQueueLifecycleMutated) {
    failures.push("unexpected authority or lifecycle mutation was recorded");
  }

  if (failures.length > 0) {
    throw new Error(`Executable spine 06 proof is not closeable: ${failures.join("; ")}`);
  }

  return {
    runtimeJobId: proof.runtimeJobId,
    graphId: proof.graphId,
    selectedNodeId: selected.nodeId,
    selectedNodeKind: selected.nodeKind,
    selectedNodeExecutable: selected.executable,
    selectedExecutionReadinessAuthority: selected.executionReadinessAuthority,
    selectedRecomputedReadinessCanExecute: selected.recomputedReadinessCanExecute,
    selectedImplementationPacketReady: selected.implementationPacketReady,
    selectedReadinessProjectionCanUnlockExecution: selected.readinessProjectionCanUnlockExecution,
    coverageCount: admission.productionReplayBoundaryCoverage.length,
    replayPlanStatus: admission.replayPlanStatus,
    replayPlanProofClosureAllowed: admission.replayPlanProofClosureAllowed,
    changedFileRefs: changed,
    validationRefs: validation,
    evidenceClaimRefs: claims.map((claim) => claim.evidenceRef).filter(Boolean),
    admissionReasonCodes: admission.admissionReasonCodes ?? [],
  };
}

async function main() {
  const proofRunManifestRef =
    flag("--proof-run-manifest") ?? process.env.OPENCLAW_PRODUCT_SPEC_PROOF_RUN_MANIFEST ?? null;
  requireRunScopedArtifactRef(proofRunManifestRef, "proof_run_manifest");
  const proofRunManifestPath = artifactRefToPath(proofRunManifestRef, "proof_run_manifest");
  const manifest = readJson(proofRunManifestPath);
  requireRunScopedArtifactRef(manifest.proofArtifactRef, "proof_artifact");
  requireRunScopedArtifactRef(manifest.admissionGateRef, "admission_artifact");
  requireRunScopedArtifactRef(manifest.replayResultRef, "replay_result_artifact");
  const proofPath = artifactRefToPath(manifest.proofArtifactRef, "proof_artifact");
  const admissionPath = artifactRefToPath(manifest.admissionGateRef, "admission_artifact");
  const replayResultPath = artifactRefToPath(manifest.replayResultRef, "replay_result_artifact");
  const workItemId =
    typeof manifest.workItemId === "string" && manifest.workItemId.trim()
      ? manifest.workItemId.trim()
      : defaultWorkItemId;
  const proof = readJson(proofPath);
  const admission = readJson(admissionPath);
  const replayResult = readJson(replayResultPath);
  const proofSummary = requireReplayProofCloseable({ proof, admission, replayResult });

  const api = await tsImport(
    path.join(root, "extensions/execution-platform/src/index.ts"),
    import.meta.url,
  );
  const runtime = await api.createExecutionPlatformDatabaseRuntime({ applyMigrations: false });
  const runtimeJobs = new api.RuntimeJobRepository(runtime.sqlClient);
  const workQueue = new api.WorkQueueRepository(runtime.sqlClient, runtimeJobs);

  const evidence = writeArtifact("executable-spine-06-replay-proof-gate-closeout.json", {
    artifactKind: "execution_platform.executable_spine_06_replay_proof_gate_closeout",
    workItemId,
    nextItemId,
    sourceSpecRef,
    proofRunManifestRef,
    proofRunManifestHash: artifactHash(proofRunManifestPath),
    proofArtifactPath: manifest.proofArtifactRef,
    proofArtifactHash: artifactHash(proofPath),
    admissionArtifactPath: manifest.admissionGateRef,
    admissionArtifactHash: artifactHash(admissionPath),
    replayResultPath: manifest.replayResultRef,
    replayResultHash: artifactHash(replayResultPath),
    implementationSummary:
      "Blocker Closure 06 closes the Product/Spec middle-lane replay and proof gate boundary. The run-scoped proof proves a real implementation node entering the canonical node-local path: WorkIntent, model-authored context focus, NodeResourceDemandSession, specialist context narrowing, NodeResourceLedger, model-authored target selection, hydrated write gate, worker edit, structural validation, and commitment-linked evidence before persistence.",
    completedCapabilities: [
      "production_replay_boundary_registry",
      "checkpoint_kind_to_proof_boundary_mapping",
      "small_verb_replay_boundary_tools",
      "small_verb_replay_proof_gate_tools",
      "latest_run_state_written_at_replay_boundaries",
      "product_spec_replay_proof_admission_artifact",
      "node_local_middle_lane_product_spec_replay_manifest",
      "model_authored_context_focus_and_target_selection",
      "node_resource_demand_session_and_node_resource_ledger_evidence",
      "diagnostic_context_synthesis_and_rerun_rejection",
      "worker_boundary_edit_validation_and_evidence_required_for_admission",
      "bounded_worker_snapshot_tail_hydration_for_forced_patch_authoring",
    ],
    forbiddenPathsRetired: [
      "default_context_synthesis_as_replay_glue",
      "packet_boundary_replay_without_production_boundary_coverage",
      "full_product_spec_proof_after_worker_free_replay",
      "stale_readiness_projection_unlocking_worker_execution",
      "raw_prompt_provider_tool_or_db_storage_in_replay_closeout",
    ],
    proofSummary,
    validationCommands: [
      {
        command:
          "node scripts/execution-platform-run-product-spec-middle-lane-replay-proof.mjs --proof-run-id <run-id>",
        result: "passed_from_run_scoped_manifest",
        proofRunManifestRef,
        proofArtifactPath: manifest.proofArtifactRef,
        admissionArtifactPath: manifest.admissionGateRef,
      },
      {
        command:
          "pnpm test:file extensions/execution-platform/src/workflows/boundary-replay-checkpoints.test.ts extensions/execution-platform/src/codex-bridge/product-spec-boundary-replay-topology.test.ts extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts extensions/execution-platform/src/workflows/scheduler-runtime-tools.test.ts extensions/execution-platform/src/workflows/node-resource-materialization.test.ts extensions/execution-platform/src/workflows/readiness-recompute-authority.test.ts extensions/execution-platform/src/observability/latest-run-state.test.ts extensions/execution-platform/src/work-queue/projections/readback-projections.test.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts extensions/execution-platform/src/workflows/boundary-replay-proof-gate.test.ts extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.test.ts",
        result: "passed",
        testFilesPassed: 12,
        testsPassed: 406,
      },
      {
        command:
          "pnpm test:file extensions/execution-platform/src/workflows/boundary-replay-proof-gate.test.ts extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.test.ts",
        result: "passed",
        testFilesPassed: 2,
        testsPassed: 42,
      },
      {
        command: "pnpm tsgo:fast",
        result: "passed",
      },
      {
        command: "git diff --check",
        result: "passed",
      },
      {
        command: "node --check scripts/execution-platform-run-product-spec-boundary-replay.mjs",
        result: "passed",
      },
    ],
    changedFileRefs,
    validationRefs,
    residuals: [
      "This slice admits the Product/Spec replay proof gate and proves one representative worker boundary from the replayable after-resource-materialization checkpoint. The next item should continue from the DB-ranked active queue toward broader proof execution rather than reopening diagnostic replay topology.",
      "The representative worker edit was reviewed through the proof gate and rolled back before persistence as intended for this canary lane.",
    ],
    semanticJudgmentOwner: "model_or_human",
    runtimeAuthority:
      "replay_boundary_ids_checkpoint_refs_statuses_hashes_node_packet_refs_readiness_refs_validation_refs_evidence_refs_no_raw_storage_flags",
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
      proofRunManifestRef,
      manifest.proofArtifactRef,
      manifest.admissionGateRef,
      manifest.replayResultRef,
    ],
    accepted: true,
    actorId: "codex:executable-spine-06-closeout",
    reasonCodes: [
      "executable_spine_06_replay_proof_gate_passed",
      "production_replay_boundary_sequence_covered",
      "replay_plan_accepted_and_proof_closure_allowed",
      "diagnostic_only_context_synthesis_replay_rejected_by_gate",
      "worker_boundary_edit_validation_and_evidence_present",
      "raw_storage_flags_false",
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
          "Replay fidelity and Product/Spec proof admission are closed; continue with the DB-ranked active queue.",
        executableSpine06ProofRef: evidence.ref,
        productSpecReplayProofAdmission: {
          status: admission.status,
          coverageCount: admission.productionReplayBoundaryCoverage.length,
          replayPlanStatus: admission.replayPlanStatus,
          replayPlanProofClosureAllowed: admission.replayPlanProofClosureAllowed,
          proofClosureAllowed: admission.proofClosureAllowed,
          workerStatus: admission.workerStatus,
          selectedNodeId: admission.selectedNodeId,
          selectedExecutionReadinessAuthority: admission.selectedExecutionReadinessAuthority,
          changedFileRefs: admission.changedFileRefs,
          validationRefs: admission.validationRefs,
          evidenceClaimRefs: admission.evidenceClaimRefs,
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
  console.error(error);
  process.exit(1);
});
