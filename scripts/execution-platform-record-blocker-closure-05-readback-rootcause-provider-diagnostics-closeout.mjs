#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const workItemId = "openclaw-convergence.readback-rootcause-provider-heap-closure";
const nextItemId = "openclaw-convergence.context-synthesis-runtime-deletion-closure";
const proofArtifactPath =
  ".artifacts/execution-platform/readback-rootcause-provider-heap-closure-proof/proof.json";

const sourceSpecRefs = [
  "docs/projects/execution-platform/specs/code-verified-product-spec-blocker-closure-plan.md",
  "docs/projects/execution-platform/specs/operator-frontier-readback-and-latest-run-state.md",
  "docs/projects/execution-platform/specs/runtime-artifact-payload-store-and-bounded-manifests.md",
  "docs/projects/execution-platform/specs/node-local-node-resource-demand-and-legacy-evisceration.md",
  "docs/projects/execution-platform/specs/non-codex-tool-worker-runtime.md",
];

const changedFileRefs = [
  "extensions/execution-platform/src/observability/canonical-readback-gate.ts",
  "extensions/execution-platform/src/observability/runtime-diagnostics.ts",
  "extensions/execution-platform/src/observability/runtime-diagnostics.test.ts",
  "extensions/execution-platform/src/observability/latest-run-state.ts",
  "extensions/execution-platform/src/observability/latest-run-state.test.ts",
  "extensions/execution-platform/src/model-tasks/structured-tool-schema-adapter.ts",
  "extensions/execution-platform/src/model-tasks/structured-tool-schema-adapter.test.ts",
  "extensions/execution-platform/src/runtime-artifact-contracts.ts",
  "extensions/execution-platform/src/runtime-artifact-contracts.test.ts",
  "extensions/execution-platform/src/work-queue/projections/active-graph-progress.ts",
  "extensions/execution-platform/src/work-queue/projections/readback-projections.test.ts",
  "extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts",
  "extensions/execution-platform/src/workflows/scheduler-runtime-tools.test.ts",
  "scripts/execution-platform-run-blocker-closure-05-readback-rootcause-provider-diagnostics-proof.mjs",
  "scripts/execution-platform-record-blocker-closure-05-readback-rootcause-provider-diagnostics-closeout.mjs",
];

const validationCommands = [
  {
    command:
      "pnpm test:file extensions/execution-platform/src/observability/runtime-diagnostics.test.ts extensions/execution-platform/src/model-tasks/structured-tool-schema-adapter.test.ts extensions/execution-platform/src/runtime-artifact-contracts.test.ts extensions/execution-platform/src/workflows/scheduler-runtime-tools.test.ts extensions/execution-platform/src/observability/latest-run-state.test.ts extensions/execution-platform/src/work-queue/projections/readback-projections.test.ts",
    result: "passed",
    testFilesPassed: 6,
  },
  {
    command:
      "pnpm tsgo:fast extensions/execution-platform/src/observability/runtime-diagnostics.ts extensions/execution-platform/src/observability/runtime-diagnostics.test.ts extensions/execution-platform/src/model-tasks/structured-tool-schema-adapter.ts extensions/execution-platform/src/model-tasks/structured-tool-schema-adapter.test.ts extensions/execution-platform/src/runtime-artifact-contracts.ts extensions/execution-platform/src/runtime-artifact-contracts.test.ts extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts extensions/execution-platform/src/workflows/scheduler-runtime-tools.test.ts extensions/execution-platform/src/observability/latest-run-state.ts extensions/execution-platform/src/observability/latest-run-state.test.ts extensions/execution-platform/src/work-queue/projections/active-graph-progress.ts extensions/execution-platform/src/work-queue/projections/readback-projections.test.ts",
    result: "passed",
  },
  {
    command:
      "node --check scripts/execution-platform-run-blocker-closure-05-readback-rootcause-provider-diagnostics-proof.mjs",
    result: "passed",
  },
  {
    command:
      "node --import tsx scripts/execution-platform-run-blocker-closure-05-readback-rootcause-provider-diagnostics-proof.mjs",
    result: "passed",
  },
];

function sha256(value) {
  return createHash("sha256").update(String(value ?? ""), "utf8").digest("hex");
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
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
    bytes: Buffer.byteLength(body, "utf8"),
  };
}

async function main() {
  const proof = readJson(proofArtifactPath);
  if (proof.status !== "passed") {
    throw new Error("blocker_closure_05_proof_not_passing");
  }
  if (
    proof.rawPromptStored !== false ||
    proof.rawResponseStored !== false ||
    proof.rawProviderLogStored !== false ||
    proof.rawToolLogStored !== false ||
    proof.rawCommandLogStored !== false ||
    proof.rawDbRowsStored !== false ||
    proof.secretsStored !== false
  ) {
    throw new Error("blocker_closure_05_proof_raw_storage_flags_not_clean");
  }

  const proofHash = `sha256:${sha256(fs.readFileSync(path.join(root, proofArtifactPath), "utf8"))}`;
  const closeout = writeArtifact(
    "readback-rootcause-provider-heap-closure-closeout.json",
    {
      artifactKind:
        "execution_platform.readback_rootcause_provider_heap_closure_closeout",
      schemaVersion: "execution-platform.readback-rootcause-provider-heap-closure-closeout.v1",
      workItemId,
      nextItemId,
      sourceSpecRefs,
      proofArtifactRef:
        "artifact://execution-platform/readback-rootcause-provider-heap-closure-proof/proof.json",
      proofArtifactPath,
      proofArtifactHash: proofHash,
      implementationSummary:
        "Owner-facing readback now projects node-local lifecycle gates from canonical branch/frontier/latest-run state: resource_demand_open, resource_demand_blocked, resource_ledger_ready, domain_resource_selection_blocked, domain_action_gate_blocked, worker_action_ready, post_action_validation, and evidence_closure. Provider diagnostics are first-class bounded readback with request/profile bytes, timeout/preflight/provider-started state, finish/native finish reason, choice and content lengths, usage or unavailable reason, retry/concurrency, and input-bundle refs. Frontier root-cause readback preserves successful sibling evidence and no-progress blockers without reverting to stale checkpoint gates.",
      completedCapabilities: [
        "canonical_node_local_gate_taxonomy",
        "latest_run_state_node_local_manifest_refs",
        "owner_readback_node_local_lifecycle_projection",
        "bounded_provider_diagnostics_projection",
        "bounded_provider_response_shape_artifact_contract",
        "proof_environment_heap_and_manifest_optics",
        "diagnostic_manifest_overflow_guard",
        "provider_preflight_vs_provider_response_distinction",
        "frontier_root_cause_successful_sibling_evidence_readback",
        "stale_checkpoint_gate_suppression",
        "real_provider_event_based_middle_lane_proof",
      ],
      proofSummary: {
        gateResults: proof.gateResults,
        realProviderEventUsed: proof.realProviderEventUsed,
        providerDiagnostics: proof.providerDiagnostics,
        rootCauseGateKind: proof.rootCause.firstOpenGate.gateKind,
        rootCauseSourceKind: proof.rootCause.firstOpenGate.sourceKind,
        heapAndMetadataOptics: proof.heapAndMetadataOptics,
      },
      validationCommands,
      changedFileRefs,
      validationRefs: [
        "validation://readback-rootcause-provider-heap-closure/focused-readback-tests-pass",
        "validation://readback-rootcause-provider-heap-closure/scoped-type-validation-pass",
        "validation://readback-rootcause-provider-heap-closure/proof-script-check-pass",
        "validation://readback-rootcause-provider-heap-closure/proof-pass",
      ],
      semanticJudgmentOwner: "model_or_human",
      runtimeAuthority:
        "schema_status_refs_hashes_gate_kind_projection_provider_response_shape_projection_root_cause_signature_projection",
      runtimeMustNotJudge: [
        "semantic_context_sufficiency",
        "edit_quality",
        "qualitative_evidence_sufficiency",
        "provider_answer_quality",
        "product_spec_specific_meaning",
      ],
      rawPromptStored: false,
      rawResponseStored: false,
      rawTranscriptStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawCommandLogStored: false,
      rawDbRowsStored: false,
      hiddenReasoningStored: false,
      secretsStored: false,
      workQueueLifecycleMutated: false,
    },
  );

  const api = await tsImport(
    path.join(root, "extensions/execution-platform/src/index.ts"),
    import.meta.url,
  );
  const runtime = await api.createExecutionPlatformDatabaseRuntime({ applyMigrations: false });
  const runtimeJobs = new api.RuntimeJobRepository(runtime.sqlClient);
  const workQueue = new api.WorkQueueRepository(runtime.sqlClient, runtimeJobs);
  const transition = await workQueue.completeWorkQueueItemFromCloseout({
    workItemId,
    closeoutRef: closeout.ref,
    closeoutHash: closeout.sha256,
    validationRef: "validation://readback-rootcause-provider-heap-closure/pass",
    graphRef: "runtime-contract://execution-platform/readback-rootcause-provider-heap-closure/v1",
    ownerReadbackRef:
      "docs/projects/execution-platform/specs/operator-frontier-readback-and-latest-run-state.md#blocker-closure-05-readback-rootcause-provider-diagnostics",
    sourceEditRequired: true,
    changedFileRefs,
    artifactRefs: [
      closeout.ref,
      "artifact://execution-platform/readback-rootcause-provider-heap-closure-proof/proof.json",
    ],
    accepted: true,
    actorId: "codex:readback-rootcause-provider-heap-closure-closeout",
    reasonCodes: [
      "readback_rootcause_provider_heap_closure_implemented",
      "node_local_lifecycle_gates_projected",
      "latest_run_state_node_local_refs_projected",
      "provider_diagnostics_bounded_response_shape_projected",
      "provider_diagnostics_runtime_artifact_contract_registered",
      "heap_phase_snapshot_proof_environment_projected",
      "diagnostic_manifest_overflow_guard_passed",
      "frontier_root_cause_successful_sibling_evidence_projected",
      "stale_checkpoint_projection_suppressed",
      "real_provider_event_evidence_used",
      "focused_validation_passed",
      "scoped_type_validation_passed",
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
          "Readback/root-cause/provider/heap diagnostics closed; context synthesis runtime deletion is the next cleanup gate before more proof execution.",
        preProofReadinessRefs: [proofArtifactPath, closeout.path],
        readbackRootcauseProviderHeapClosureSummary: {
          gateKinds: proof.gateResults.map((gate) => gate.projected),
          realProviderEventUsed: proof.realProviderEventUsed,
          rootCauseGateKind: proof.rootCause.firstOpenGate.gateKind,
          heapAndMetadataOptics: proof.heapAndMetadataOptics,
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
      LIMIT 8
    `,
  );

  await runtime.close?.();
  await runtime.pool?.end?.();

  console.log(
    JSON.stringify(
      {
        status: "closed",
        workItemId,
        closeout,
        transition,
        nextQueue: rows.rows,
      },
      null,
      2,
    ),
  );
}

await main();
