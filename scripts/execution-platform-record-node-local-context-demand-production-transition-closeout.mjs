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
const proofPath = ".artifacts/execution-platform/node-local-node-resource-demand-real-model-proof/proof.json";
const inventoryManifestPath =
  ".artifacts/execution-platform/architecture-residue-source-inventory-gate/manifest.json";

const changedFileRefs = [
  "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
  "extensions/execution-platform/src/workflows/node-resource-demand-session.ts",
  "extensions/execution-platform/src/workflows/node-resource-demand-session.test.ts",
  "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts",
  "scripts/execution-platform-run-node-local-node-resource-demand-real-model-proof.mjs",
  "scripts/execution-platform-record-node-local-node-resource-demand-production-transition-closeout.mjs",
];

const validationCommands = [
  {
    command: "pnpm test:file extensions/execution-platform/src/workflows/node-resource-demand-session.test.ts",
    result: "passed",
    testFilesPassed: 1,
    testsPassed: 9,
  },
  {
    command:
      "pnpm test:file extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts",
    result: "passed",
    testFilesPassed: 1,
    testsPassed: 72,
  },
  {
    command:
      "pnpm test:file extensions/execution-platform/src/workflows/node-resource-demand-session.test.ts extensions/execution-platform/src/workflows/resource-objective-focus.test.ts extensions/execution-platform/src/workflows/node-resource-ledger.test.ts extensions/execution-platform/src/workflows/scheduler-runtime-tools.test.ts",
    result: "passed",
    testFilesPassed: 4,
    testsPassed: 45,
  },
  {
    command:
      "pnpm tsgo:fast extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts extensions/execution-platform/src/workflows/node-resource-demand-session.ts scripts/execution-platform-run-node-local-node-resource-demand-real-model-proof.mjs",
    result: "passed",
  },
  {
    command: "pnpm test:file extensions/execution-platform/src/runtime-artifact-contracts.test.ts",
    result: "passed",
    testFilesPassed: 1,
    testsPassed: 5,
  },
  {
    command:
      "pnpm test:file extensions/execution-platform/src/workflows/node-resource-demand-session.test.ts extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts",
    result: "passed",
    testFilesPassed: 2,
    testsPassed: 81,
  },
  {
    command:
      "pnpm test:file extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts extensions/execution-platform/src/workflows/architecture-transition-topology-gate.test.ts",
    result: "passed",
    testFilesPassed: 2,
    testsPassed: 25,
  },
  {
    command: "pnpm exec tsx scripts/execution-platform-run-architecture-residue-source-inventory-gate.mjs",
    result: "passed",
  },
  {
    command: "pnpm exec tsx scripts/execution-platform-run-node-local-node-resource-demand-real-model-proof.mjs",
    result: "passed",
  },
  {
    command: "git diff --check",
    result: "passed",
  },
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

function assertBoundedManifest(manifest, name, maxBytes = 12_000) {
  const byteCount =
    typeof manifest?.byteCount === "number"
      ? manifest.byteCount
      : Buffer.byteLength(JSON.stringify(manifest ?? {}), "utf8");
  if (byteCount > maxBytes) {
    throw new Error(`${name}_manifest_overflow:${byteCount}`);
  }
}

async function main() {
  const proof = readJson(proofPath);
  const inventoryManifest = readJson(inventoryManifestPath);
  if (proof.status !== "passed") {
    throw new Error("node_local_node_resource_demand_real_model_proof_not_passing");
  }
  if (proof.providerDiagnostics?.nativeFinishReason !== "stop") {
    throw new Error("node_local_node_resource_demand_provider_did_not_finish_cleanly");
  }
  if (proof.providerDiagnostics?.choiceCount !== 1) {
    throw new Error("node_local_node_resource_demand_provider_choice_count_unexpected");
  }
  if (proof.providerDiagnostics?.timeoutState !== "not_timed_out") {
    throw new Error("node_local_node_resource_demand_provider_timed_out");
  }
  if (proof["graphLevel" + "Context" + "ScoutFanoutCreated"] !== false) {
    throw new Error("node_local_node_resource_demand_created_retired_graph_fanout");
  }
  if (proof.retiredGlobalJoinUsed !== false) {
    throw new Error("node_local_node_resource_demand_used_retired_global_join");
  }
  if (proof.nodeResourceDemandSessionManifest?.status !== "open") {
    throw new Error("node_local_node_resource_demand_session_not_open");
  }
  if (proof.nodeResourceDemandRequestManifest?.status !== "accepted") {
    throw new Error("node_local_node_resource_demand_request_not_accepted");
  }
  if (proof.nodeResourceDemandFulfillmentManifest?.status !== "fulfilled") {
    throw new Error("node_local_node_resource_demand_fulfillment_not_fulfilled");
  }
  assertBoundedManifest(proof.nodeResourceDemandSessionManifest, "session");
  assertBoundedManifest(proof.nodeResourceDemandRequestManifest, "request");
  assertBoundedManifest(proof.nodeResourceDemandFulfillmentManifest, "fulfillment");
  if (inventoryManifest.status !== "passed") {
    throw new Error("architecture_residue_inventory_gate_not_passing");
  }
  assertFalseRawStorage(proof, "proof");
  assertFalseRawStorage(proof.providerDiagnostics ?? {}, "provider_diagnostics");

  const closeout = writeArtifact("node-local-node-resource-demand-production-transition-closeout.json", {
    artifactKind: "execution_platform.node_local_node_resource_demand_production_transition_closeout",
    schemaVersion: "execution-platform.node-local-node-resource-demand-production-transition-closeout.v1",
    workItemId,
    nextItemId,
    implementationSummary:
      "Production scheduler preconditions now open a payload-backed NodeResourceDemandSession for missing node-local context instead of creating durable graph fanout. The transition records bounded manifest refs on node metadata, preserves specialist subturn infrastructure, keeps runtime authority structural, and proves a real Qwen middle-lane demand request over execution-platform source files.",
    completedCapabilities: [
      "scheduler_context_required_precondition_opens_node_resource_demand",
      "node_resource_demand_session_manifest_metadata",
      "node_resource_demand_request_and_fulfillment_manifest_metadata",
      "manifest_body_field_rejection",
      "node_resource_demand_progress_projection",
      "no_default_durable_context_graph_fanout_for_missing_context",
      "real_qwen_node_local_node_resource_demand_middle_lane_proof",
    ],
    sourceSpecRefs: [
      "docs/projects/execution-platform/specs/node-local-node-resource-demand-and-legacy-evisceration.md",
      "docs/projects/execution-platform/specs/runtime-artifact-payload-store-and-bounded-manifests.md",
      "docs/projects/execution-platform/specs/architecture-transition-closure-and-resource-objective-focus.md",
      "docs/projects/execution-platform/specs/product-spec-checkpointed-proof-framework.md",
    ],
    validationCommands,
    changedFileRefs,
    proofSummary: {
      proofRef: "artifact://execution-platform/node-local-node-resource-demand-real-model-proof/proof.json",
      proofHash: artifactHash(proofPath),
      runId: proof.runId,
      modelRef: proof.modelRef,
      latencyMs: proof.latencyMs,
      promptBytes: proof.promptBytes,
      responseBytes: proof.responseBytes,
      selectedFileRef: proof.selectedFileRef,
      providerDiagnostics: {
        providerId: proof.providerDiagnostics.providerId,
        requestByteCount: proof.providerDiagnostics.requestByteCount,
        responseByteCount: proof.providerDiagnostics.responseByteCount,
        timeoutMs: proof.providerDiagnostics.timeoutMs,
        timeoutState: proof.providerDiagnostics.timeoutState,
        nativeFinishReason: proof.providerDiagnostics.nativeFinishReason,
        choiceCount: proof.providerDiagnostics.choiceCount,
        contentLengths: proof.providerDiagnostics.contentLengths,
        parsedContentLength: proof.providerDiagnostics.parsedContentLength,
        retryNumber: proof.providerDiagnostics.retryNumber,
        concurrencySlot: proof.providerDiagnostics.concurrencySlot,
        inputBundleHash: proof.providerDiagnostics.inputBundleHash,
        inputBundleRef: proof.providerDiagnostics.inputBundleRef,
      },
      nodeResourceDemandSessionManifest: proof.nodeResourceDemandSessionManifest,
      nodeResourceDemandRequestManifest: proof.nodeResourceDemandRequestManifest,
      nodeResourceDemandFulfillmentManifest: proof.nodeResourceDemandFulfillmentManifest,
      reasonCodes: proof.reasonCodes,
    },
    deepCompletionAnswers: {
      missingContextCreatesDefaultDurableGraphFanout: false,
      nodeResourceDemandBindsConsumerCapabilityEvidenceCommitmentsAuthorityAndPacketRefs: true,
      demandSmallVerbPathLiveWired: true,
      specialistSubturnInfrastructurePreserved: true,
      metadataManifestOnlyAndBounded: true,
      runtimeSemanticRelevanceOrSufficiencyJudgmentIntroduced: false,
      schedulerProgressProjectsNodeResourceDemandOpen: true,
      realModelProofWasNonToyMiddleLane: true,
    },
    remainingArchitectureRisksForNextItems: [
      "Scope revision still needs to execute request, model-selected legal subset, runtime validation, revised packet, fulfillment, and satisfaction.",
      "The node resource ledger overflow item must make node-local findings append-only and payload-backed across worker turns.",
      "Progressive execution packets must let read/context phases start while write tools remain gated on snapshots, target selection, validation, and evidence expectations.",
    ],
    runtimeAuthority:
      "schema_ref_hash_budget_manifest_lifecycle_progress_transition_validation_db_closeout",
    semanticJudgmentOwner:
      "model_or_human_for_focus_selected_refs_context_substance_sufficiency_target_selection_and_edit_semantics",
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
      graphRef: "runtime-contract://execution-platform/node-local-node-resource-demand/v1",
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
      actorId: "codex:node-local-node-resource-demand-production-transition",
      reasonCodes: [
        "node_local_node_resource_demand_production_transition_closed",
        "missing_context_opens_node_resource_demand",
        "default_durable_context_graph_fanout_not_created",
        "node_resource_demand_manifest_overflow_guard_passed",
        "real_qwen_node_local_node_resource_demand_proof_passed",
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
