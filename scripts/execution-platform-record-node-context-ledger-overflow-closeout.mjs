#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const workItemId = "openclaw-convergence.node-resource-ledger-overflow-closure";
const nextItemId = "openclaw-convergence.progressive-node-execution-packet-write-gate-closure";
const proofPath =
  ".artifacts/execution-platform/node-resource-ledger-overflow-real-model-proof/proof.json";

const changedFileRefs = [
  "extensions/execution-platform/src/runtime-artifact-contracts.ts",
  "extensions/execution-platform/src/runtime-job-repository.ts",
  "extensions/execution-platform/src/runtime-job-types.ts",
  "extensions/execution-platform/src/workflows/node-resource-ledger.ts",
  "extensions/execution-platform/src/workflows/node-resource-ledger.test.ts",
  "scripts/execution-platform-run-node-resource-ledger-overflow-real-model-proof.mjs",
  "scripts/execution-platform-record-node-resource-ledger-overflow-closeout.mjs",
];

const validationCommands = [
  {
    command: "pnpm test:file extensions/execution-platform/src/workflows/node-resource-ledger.test.ts",
    result: "passed",
    testFilesPassed: 1,
    testsPassed: 11,
  },
  {
    command: "pnpm test:file extensions/execution-platform/src/runtime-artifact-contracts.test.ts",
    result: "passed",
    testFilesPassed: 1,
    testsPassed: 5,
  },
  {
    command: "pnpm test:file extensions/execution-platform/src/workflows/node-resource-demand-session.test.ts",
    result: "passed",
    testFilesPassed: 1,
    testsPassed: 9,
  },
  {
    command: "pnpm test:file extensions/execution-platform/src/workflows/context-scope-revision.test.ts",
    result: "passed",
    testFilesPassed: 1,
    testsPassed: 8,
  },
  {
    command: "pnpm test:file extensions/execution-platform/src/workflows/scheduler-runtime-tools.test.ts",
    result: "passed",
    testFilesPassed: 1,
    testsPassed: 23,
  },
  {
    command:
      "pnpm test:file extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts extensions/execution-platform/src/workflows/architecture-transition-topology-gate.test.ts",
    result: "passed",
    testFilesPassed: 2,
    testsPassed: 25,
  },
  {
    command: "pnpm test:file extensions/execution-platform/src/runtime-job-repository.test.ts",
    result: "passed",
    testFilesPassed: 1,
    testsPassed: 23,
  },
  {
    command:
      "pnpm tsgo:fast extensions/execution-platform/src/workflows/node-resource-ledger.ts extensions/execution-platform/src/workflows/node-resource-ledger.test.ts extensions/execution-platform/src/runtime-job-repository.ts extensions/execution-platform/src/runtime-job-types.ts extensions/execution-platform/src/runtime-artifact-contracts.ts scripts/execution-platform-run-node-resource-ledger-overflow-real-model-proof.mjs",
    result: "passed",
  },
  {
    command: "node --check scripts/execution-platform-run-node-resource-ledger-overflow-real-model-proof.mjs",
    result: "passed",
  },
  {
    command: "pnpm exec tsx scripts/execution-platform-run-node-resource-ledger-overflow-real-model-proof.mjs",
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

async function main() {
  const proof = readJson(proofPath);
  if (proof.status !== "passed") {
    throw new Error("node_resource_ledger_real_model_proof_not_passed");
  }
  if (proof.workItemId !== workItemId) {
    throw new Error(`node_resource_ledger_proof_wrong_work_item:${proof.workItemId}`);
  }
  if (proof.ledgerEntryCount < 100) {
    throw new Error(`node_resource_ledger_proof_too_few_entries:${proof.ledgerEntryCount}`);
  }
  if (!proof.projectionTruncated) {
    throw new Error("node_resource_ledger_projection_not_compacted");
  }
  if (proof.largestArtifactMetadataBytes > 32 * 1024) {
    throw new Error(`node_resource_ledger_metadata_overflow:${proof.largestArtifactMetadataBytes}`);
  }
  if (proof.sampleHydratedPayloadCount < 3) {
    throw new Error("node_resource_ledger_payload_hydration_not_proven");
  }
  assertFalseRawStorage(proof, "proof");
  assertFalseRawStorage(proof.providerDiagnostics, "provider_diagnostics");

  const closeout = writeArtifact("node-resource-ledger-overflow-closeout.json", {
    artifactKind: "execution_platform.node_resource_ledger_overflow_closeout",
    schemaVersion: "execution-platform.node-resource-ledger-overflow-closeout.v1",
    workItemId,
    nextItemId,
    implementationSummary:
      "NodeResourceLedger now enforces manifest byte budgets, compacts projections by structural budget, persists ledger and entry bodies through runtime artifact payload storage with exact payload refs, and proves large multi-window context stays out of metadata.",
    completedCapabilities: [
      "node_resource_ledger_manifest_byte_guards",
      "node_resource_ledger_projection_budget_compaction",
      "node_resource_ledger_payload_artifact_persistence",
      "node_resource_ledger_large_file_multi_window_stress",
      "node_resource_ledger_provider_diagnostics_entry",
      "real_qwen_node_resource_ledger_middle_lane_proof",
    ],
    sourceSpecRefs: [
      "docs/projects/execution-platform/specs/architecture-transition-closure-and-resource-objective-focus.md#6-manifest-only-metadata-and-oom-gate",
      "docs/projects/execution-platform/specs/node-local-node-resource-demand-and-legacy-evisceration.md#2-node-resource-ledger",
      "docs/projects/execution-platform/specs/runtime-artifact-payload-store-and-bounded-manifests.md",
      "docs/projects/execution-platform/specs/code-verified-product-spec-blocker-closure-plan.md",
    ],
    validationCommands,
    changedFileRefs,
    proofSummary: {
      proofRef: "artifact://execution-platform/node-resource-ledger-overflow-real-model-proof/proof.json",
      proofHash: artifactHash(proofPath),
      runId: proof.runId,
      modelRef: proof.modelRef,
      providerLatencyMs: proof.providerDiagnostics.latencyMs,
      providerRequestBytes: proof.providerDiagnostics.requestByteCount,
      providerResponseBytes: proof.providerDiagnostics.responseByteCount,
      providerFinishReason: proof.providerDiagnostics.nativeFinishReason,
      providerInputTokenCount: proof.providerDiagnostics.inputTokenCount,
      providerOutputTokenCount: proof.providerDiagnostics.outputTokenCount,
      providerTotalTokenCount: proof.providerDiagnostics.totalTokenCount,
      providerUsageUnavailableReason: proof.providerDiagnostics.usageUnavailableReason,
      modelEntryCount: proof.modelEntryCount,
      ledgerEntryCount: proof.ledgerEntryCount,
      projectedEntryManifestCount: proof.projectedEntryManifestCount,
      omittedEntryManifestCount: proof.omittedEntryManifestCount,
      largestArtifactMetadataBytes: proof.largestArtifactMetadataBytes,
      largestPayloadBytes: proof.largestPayloadBytes,
      heapUsedBytes: proof.heapUsedBytes,
      reasonCodes: proof.reasonCodes,
    },
    deepCompletionAnswers: {
      fullBodiesInMetadata: false,
      payloadBackedHashLinkedHydratable: true,
      manifestByteBudgetsEnforcedAndTested: true,
      multipleLargeFileWindowsSupported: true,
      runtimeSemanticRankingOrTruncationIntroduced: false,
      providerDiagnosticsBoundedAndLinked: true,
      realModelProofRepresentativeMiddleLane: true,
      workIntentResolutionCanConsumeLedgerRefsNext: true,
      retiredTopologyOrFallbackIntroduced: false,
      semanticCheatsDetected: false,
    },
    remainingArchitectureRisksForNextItems: [
      "Progressive NodeExecutionPacket must now consume ledger manifest refs without hydrating broad bodies.",
      "WorkIntent context resolution still needs to treat demand/ledger state as primary context satisfaction.",
      "Readback/root-cause projection must surface ledger gates from canonical state.",
    ],
    runtimeAuthority:
      "schema_ref_hash_budget_manifest_lifecycle_payload_store_hydration_provider_diagnostics_validation_db_closeout",
    semanticJudgmentOwner:
      "model_or_human_for_context_substance_sufficiency_target_selection_and_edit_semantics",
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
      validationRef: "validation://node-resource-ledger-overflow-closure",
      graphRef: "runtime-contract://execution-platform/node-resource-ledger-overflow/v1",
      ownerReadbackRef:
        "docs/projects/execution-platform/specs/node-local-node-resource-demand-and-legacy-evisceration.md#2-node-resource-ledger",
      sourceEditRequired: true,
      changedFileRefs,
      artifactRefs: [
        closeout.ref,
        "artifact://execution-platform/node-resource-ledger-overflow-real-model-proof/proof.json",
      ],
      accepted: true,
      actorId: "codex:node-resource-ledger-overflow-closure",
      reasonCodes: [
        "node_resource_ledger_overflow_closure_completed",
        "ledger_payload_artifacts_persisted",
        "manifest_projection_budget_compacted",
        "real_qwen_node_resource_ledger_proof_passed",
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
