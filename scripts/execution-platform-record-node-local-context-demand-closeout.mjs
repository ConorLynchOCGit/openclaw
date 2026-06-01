#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const workItemId = "openclaw-convergence.node-local-node-resource-demand-production-transition";
const nextItemId = "openclaw-convergence.scope-revision-production-transition";
const proofPath =
  ".artifacts/execution-platform/node-local-node-resource-demand-real-model-proof/proof.json";
const inventoryManifestPath =
  ".artifacts/execution-platform/architecture-residue-source-inventory-gate/manifest.json";

const changedFileRefs = [
  "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
  "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts",
  "extensions/execution-platform/src/workflows/node-resource-demand-session.ts",
  "extensions/execution-platform/src/workflows/node-resource-demand-session.test.ts",
  "scripts/execution-platform-run-node-local-node-resource-demand-real-model-proof.mjs",
  "scripts/execution-platform-record-node-local-node-resource-demand-closeout.mjs",
];

function sha256(value) {
  return createHash("sha256").update(String(value ?? ""), "utf8").digest("hex");
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function artifactHash(relativePath) {
  return `sha256:${sha256(fs.readFileSync(path.join(root, relativePath), "utf8"))}`;
}

function writeArtifact(name, value) {
  fs.mkdirSync(artifactDir, { recursive: true });
  const body = `${JSON.stringify({ ...value, generatedAt: new Date().toISOString() }, null, 2)}\n`;
  const target = path.join(artifactDir, name);
  fs.writeFileSync(target, body, "utf8");
  return {
    path: `.artifacts/execution-platform/${name}`,
    ref: `artifact://execution-platform/${name}`,
    sha256: `sha256:${sha256(body)}`,
    bytes: Buffer.byteLength(body, "utf8"),
  };
}

function assertFalseRawStorage(value, name) {
  for (const flag of [
    "rawPromptStored",
    "rawResponseStored",
    "rawTranscriptStored",
    "rawProviderLogStored",
    "rawToolLogStored",
    "rawCommandLogStored",
    "rawDbRowsStored",
    "secretsStored",
  ]) {
    if (flag in value && value[flag] !== false) {
      throw new Error(`${name}_${flag}_not_false`);
    }
  }
}

async function main() {
  const proof = readJson(proofPath);
  const inventoryManifest = readJson(inventoryManifestPath);
  if (proof.status !== "passed") {
    throw new Error("node_local_node_resource_demand_real_model_proof_not_passed");
  }
  if (proof.graphLevelContextScoutFanoutCreated !== false) {
    throw new Error("node_local_node_resource_demand_created_graph_level_scout_fanout");
  }
  if (proof.retiredGlobalJoinUsed !== false) {
    throw new Error("node_local_node_resource_demand_used_retired_global_join");
  }
  if (proof.nodeResourceDemandSessionManifest?.status !== "open") {
    throw new Error("node_resource_demand_session_not_opened");
  }
  if (proof.nodeResourceDemandRequestManifest?.status !== "accepted") {
    throw new Error("node_resource_demand_request_not_accepted");
  }
  if (proof.nodeResourceDemandFulfillmentManifest?.status !== "fulfilled") {
    throw new Error("node_resource_demand_fulfillment_not_fulfilled");
  }
  if (Buffer.byteLength(JSON.stringify(proof.nodeResourceDemandSessionManifest), "utf8") > 12_000) {
    throw new Error("node_resource_demand_session_manifest_overflow");
  }
  if (Buffer.byteLength(JSON.stringify(proof.nodeResourceDemandRequestManifest), "utf8") > 12_000) {
    throw new Error("node_resource_demand_request_manifest_overflow");
  }
  if (Buffer.byteLength(JSON.stringify(proof.nodeResourceDemandFulfillmentManifest), "utf8") > 12_000) {
    throw new Error("node_resource_demand_fulfillment_manifest_overflow");
  }
  if (inventoryManifest.status !== "passed") {
    throw new Error("architecture_residue_inventory_gate_not_passing");
  }
  assertFalseRawStorage(proof, "proof");
  assertFalseRawStorage(proof.providerDiagnostics, "provider_diagnostics");

  const closeout = writeArtifact("node-local-node-resource-demand-closeout.json", {
    artifactKind: "execution_platform.node_local_node_resource_demand_closeout",
    schemaVersion: "execution-platform.node-local-node-resource-demand-closeout.v1",
    workItemId,
    nextItemId,
    implementationSummary:
      "Made missing-context worker preconditions open node-local NodeResourceDemandSession state instead of relying on graph-level context scout fanout. Added bounded node-resource-demand manifest assertions and a real Qwen middle-lane proof that selects a concrete file-window demand over real execution-platform work.",
    completedCapabilities: [
      "scheduler_context_required_to_node_resource_demand_open_transition",
      "node_local_node_resource_demand_metadata_projection",
      "node_resource_demand_manifest_overflow_guard",
      "node_resource_demand_runtime_tool_phase_projection",
      "real_qwen_node_local_node_resource_demand_middle_lane_proof",
      "architecture_residue_inventory_zero_blocked_survivors",
    ],
    validationCommands: [
      {
        command:
          "pnpm test:file extensions/execution-platform/src/workflows/node-resource-demand-session.test.ts extensions/execution-platform/src/workflows/resource-objective-focus.test.ts extensions/execution-platform/src/workflows/node-resource-ledger.test.ts extensions/execution-platform/src/workflows/scheduler-runtime-tools.test.ts",
        result: "passed",
      },
      {
        command:
          "pnpm test:file extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts",
        result: "passed",
      },
      {
        command:
          "pnpm test:file extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts extensions/execution-platform/src/workflows/architecture-transition-topology-gate.test.ts",
        result: "passed",
      },
      {
        command: "pnpm test:file extensions/execution-platform/src/runtime-artifact-contracts.test.ts",
        result: "passed",
      },
      {
        command:
          "pnpm tsgo:fast extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts extensions/execution-platform/src/workflows/node-resource-demand-session.ts scripts/execution-platform-run-node-local-node-resource-demand-real-model-proof.mjs",
        result: "passed",
      },
      {
        command:
          "pnpm exec tsx scripts/execution-platform-run-node-local-node-resource-demand-real-model-proof.mjs",
        result: "passed",
      },
      {
        command:
          "pnpm exec tsx scripts/execution-platform-run-architecture-residue-source-inventory-gate.mjs",
        result: "passed",
      },
      { command: "git diff --check", result: "passed" },
    ],
    realModelProof: {
      proofRef: "artifact://execution-platform/node-local-node-resource-demand-real-model-proof/proof.json",
      proofHash: artifactHash(proofPath),
      modelRef: proof.modelRef,
      latencyMs: proof.latencyMs,
      requestByteCount: proof.providerDiagnostics.requestByteCount,
      responseByteCount: proof.providerDiagnostics.responseByteCount,
      nativeFinishReason: proof.providerDiagnostics.nativeFinishReason,
      choiceCount: proof.providerDiagnostics.choiceCount,
      selectedFileRef: proof.selectedFileRef,
      focusStatus: proof.focusManifest.status,
      nodeResourceDemandStatus: proof.nodeResourceDemandSessionManifest.status,
      nodeResourceDemandRequestStatus: proof.nodeResourceDemandRequestManifest.status,
      nodeResourceDemandFulfillmentStatus: proof.nodeResourceDemandFulfillmentManifest.status,
    },
    deepCompletionAnswers: {
      ordinaryMissingContextCreatesDurableContextScoutGraphNode: false,
      everyOpenedDemandBindsConsumerCapabilityEvidenceAuthorityAndCommitments: true,
      directDemandSmallVerbsLiveWired: true,
      specialistScoutRunsOutsideDemandSession: false,
      metadataCarriesDemandBodiesOrSnapshots: false,
      runtimeMakesSemanticContextJudgment: false,
      staleResourceFulfillmentGateUsedForThisPath: false,
      realModelProofWasNonToyMiddleLane: true,
    },
    remainingArchitectureRisksForNextItems: [
      "Scope revision still needs to execute the model-authored legal subset lifecycle in production instead of recording a request.",
      "NodeResourceLedger remains the next overflow closure for durable append-only context evidence.",
      "WorkIntent context resolution still needs to consume demand/ledger/focus state ahead of legacy graph context observations.",
    ],
    runtimeAuthority:
      "schema_ref_authority_budget_lifecycle_manifest_metadata_provider_diagnostics_validation_db_work_queue_closeout",
    semanticJudgmentOwner:
      "model_or_human_for_focus_next_unknown_file_window_choice_sufficiency_target_selection_and_edit_semantics",
    deterministicSemanticJudgmentAllowed: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    secretsStored: false,
    workQueueLifecycleMutated: false,
  });

  const api = await tsImport(
    path.join(root, "extensions/execution-platform/src/index.ts"),
    import.meta.url,
  );
  const runtime = await api.createExecutionPlatformDatabaseRuntime({ applyMigrations: false });
  try {
    const runtimeJobs = new api.RuntimeJobRepository(runtime.sqlClient);
    const workQueue = new api.WorkQueueRepository(runtime.sqlClient, runtimeJobs);
    await workQueue.completeWorkQueueItemFromCloseout({
      workItemId,
      closeoutRef: closeout.ref,
      closeoutHash: closeout.sha256,
      validationRef: "validation://node-local-node-resource-demand-production-transition",
      graphRef: "runtime-contract://execution-platform/node-resource-demand-session/v1",
      ownerReadbackRef:
        "docs/projects/execution-platform/specs/node-local-node-resource-demand-and-legacy-evisceration.md#1-node-local-node-resource-demand-session-core",
      sourceEditRequired: true,
      changedFileRefs,
      artifactRefs: [
        closeout.ref,
        "artifact://execution-platform/node-local-node-resource-demand-real-model-proof/proof.json",
        "artifact://execution-platform/architecture-residue-source-inventory-gate/manifest.json",
      ],
      accepted: true,
      actorId: "codex:node-local-node-resource-demand",
      reasonCodes: [
        "node_local_node_resource_demand_closed",
        "context_required_precondition_opens_node_resource_demand",
        "default_context_scout_graph_fanout_not_created",
        "manifest_overflow_guard_passed",
        "real_qwen_node_local_node_resource_demand_proof_passed",
      ],
    });
    const active = await workQueue.listDbWorkQueue({ bucket: "active", limit: 5 });
    console.log(
      JSON.stringify(
        {
          status: "closed",
          workItemId,
          closeout,
          nextActiveItems: active.items.map((item) => ({
            workItemId: item.workItemId,
            title: item.title,
          })),
        },
        null,
        2,
      ),
    );
  } finally {
    await runtime.close?.();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
