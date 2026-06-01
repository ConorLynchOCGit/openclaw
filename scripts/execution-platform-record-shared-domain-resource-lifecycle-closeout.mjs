#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const workItemId = "openclaw-convergence.shared-domain-resource-lifecycle-contract-refactor";
const nextItemId = "openclaw-convergence.product-spec-planning-domain-profile-respec";
const proofDir = ".artifacts/execution-platform/shared-domain-resource-lifecycle-real-model-proof";
const proofPath = `${proofDir}/proof.json`;
const proofManifestPath = `${proofDir}/manifest.json`;

const changedFileRefs = [
  "docs/projects/execution-platform/specs/shared-domain-resource-lifecycle-and-product-spec-alignment.md",
  "docs/projects/execution-platform/CURRENT_SLICE.md",
  "docs/projects/execution-platform/STATUS.md",
  "docs/projects/execution-platform/product-spec-planning-production-workflow.md",
  "extensions/execution-platform/src/workflows/shared-domain-resource-lifecycle.ts",
  "extensions/execution-platform/src/workflows/shared-domain-resource-lifecycle.test.ts",
  "extensions/execution-platform/src/workflows/index.ts",
  "extensions/execution-platform/src/workflows/runtime-node-capability-registry.ts",
  "extensions/execution-platform/src/workflows/runtime-node-capability-registry.test.ts",
  "extensions/execution-platform/src/workflows/resource-objective-focus.ts",
  "extensions/execution-platform/src/workflows/resource-objective-focus.test.ts",
  "extensions/execution-platform/src/workflows/node-resource-demand-session.ts",
  "extensions/execution-platform/src/workflows/node-resource-demand-session.test.ts",
  "extensions/execution-platform/src/workflows/node-resource-ledger.ts",
  "extensions/execution-platform/src/workflows/node-resource-ledger.test.ts",
  "extensions/execution-platform/src/workflows/node-lifecycle-transition-runner.ts",
  "extensions/execution-platform/src/workflows/node-lifecycle-transition-runner.test.ts",
  "scripts/execution-platform-run-shared-domain-resource-lifecycle-real-model-proof.mjs",
  "scripts/execution-platform-record-shared-domain-resource-lifecycle-closeout.mjs",
];

const validationCommands = [
  {
    command:
      "node scripts/run-vitest.mjs run --config test/vitest/vitest.extensions.config.ts extensions/execution-platform/src/workflows/shared-domain-resource-lifecycle.test.ts extensions/execution-platform/src/workflows/runtime-node-capability-registry.test.ts extensions/execution-platform/src/workflows/resource-objective-focus.test.ts extensions/execution-platform/src/workflows/node-resource-demand-session.test.ts extensions/execution-platform/src/workflows/node-resource-ledger.test.ts extensions/execution-platform/src/workflows/node-lifecycle-transition-runner.test.ts",
    result: "passed: 6 files, 63 tests",
  },
  {
    command: "pnpm tsgo:fast",
    result: "passed",
  },
  {
    command:
      "node --check scripts/execution-platform-run-shared-domain-resource-lifecycle-real-model-proof.mjs",
    result: "passed",
  },
  {
    command: "node scripts/execution-platform-run-shared-domain-resource-lifecycle-real-model-proof.mjs",
    result: "passed: providerCallCount=1 selectedPlanningRefCount=2",
  },
  {
    command: "git diff --check -- shared-domain-resource-lifecycle queue-item files",
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
    "hiddenReasoningStored",
    "secretsStored",
  ]) {
    if (flag in value && value[flag] !== false) {
      throw new Error(`${name}_${flag}_not_false`);
    }
  }
}

async function main() {
  const proof = readJson(proofPath);
  const manifest = readJson(proofManifestPath);
  if (proof.status !== "passed") {
    throw new Error("shared_domain_resource_lifecycle_proof_not_passed");
  }
  if (manifest.status !== "passed") {
    throw new Error("shared_domain_resource_lifecycle_manifest_not_passed");
  }
  if (manifest.providerCallCount < 1 || proof.providerCallCount < 1) {
    throw new Error("shared_domain_resource_lifecycle_real_model_call_missing");
  }
  if (manifest.selectedPlanningRefCount < 2) {
    throw new Error("shared_domain_resource_lifecycle_planning_ref_selection_too_weak");
  }
  if (manifest.manifestBytes > 16 * 1024) {
    throw new Error(`shared_domain_resource_lifecycle_manifest_overflow:${manifest.manifestBytes}`);
  }
  if (proof.proofBytes > 16 * 1024) {
    throw new Error(`shared_domain_resource_lifecycle_proof_overflow:${proof.proofBytes}`);
  }
  assertFalseRawStorage(proof, "proof");
  assertFalseRawStorage(manifest, "manifest");

  const closeout = writeArtifact("shared-domain-resource-lifecycle-closeout.json", {
    artifactKind: "execution_platform.shared_domain_resource_lifecycle_closeout",
    schemaVersion: "execution-platform.shared-domain-resource-lifecycle-closeout.v1",
    workItemId,
    nextItemId,
    implementationSummary:
      "Shared domain resource lifecycle contracts now sit under RuntimeNodeCapability and NodeLifecycleTransitionRunner as the single spine for coding and Product/Spec Planning. Coding capabilities retain file/window/edit gates; Product/Spec Planning capabilities expose planning-domain resource kinds, planning action gates, and planning/resource-ledger tools with no source edit or patch tools.",
    completedCapabilities: [
      "shared_domain_lifecycle_profile_contract",
      "runtime_node_capability_domain_profile_projection",
      "product_spec_planning_resource_kinds_without_coding_write_gate",
      "node_resource_demand_session_planning_resource_fulfillment",
      "node_resource_ledger_planning_entry_and_tool_contracts",
      "node_lifecycle_runner_domain_worker_action_tool_projection",
      "real_model_planning_resource_focus_middle_lane_proof",
      "manifest_only_metadata_and_payload_ref_artifact_shape",
    ],
    validationCommands,
    changedFileRefs,
    proofSummary: {
      proofRef: "artifact://execution-platform/shared-domain-resource-lifecycle-real-model-proof/proof.json",
      proofHash: artifactHash(proofPath),
      manifestRef:
        "artifact://execution-platform/shared-domain-resource-lifecycle-real-model-proof/manifest.json",
      manifestHash: artifactHash(proofManifestPath),
      providerCallCount: manifest.providerCallCount,
      selectedPlanningRefCount: manifest.selectedPlanningRefCount,
      proofBytes: proof.proofBytes,
      manifestBytes: manifest.manifestBytes,
      rawPromptStored: manifest.rawPromptStored,
      rawResponseStored: manifest.rawResponseStored,
    },
    deepCompletionAnswers: {
      productSpecPlanningUsesSharedLifecycleSpine: true,
      productSpecPlanningExposesCodingWriteOrPatchTools: false,
      runtimePerformsSemanticTargetOrPlanningResourceJudgment: false,
      modelSelectedPlanningRefsInRealProof: true,
      manifestsStayBelowOverflowBudget: true,
      rawProviderPayloadsStored: false,
      fallbackOrCompatibilityPathAdded: false,
      lifecycleProjectionComesFromNodeRunnerDomainTools: true,
    },
    sourceSpecRefs: [
      "docs/projects/execution-platform/specs/shared-domain-resource-lifecycle-and-product-spec-alignment.md",
      "docs/projects/execution-platform/specs/node-lifecycle-transition-ownership-consolidation.md",
      "docs/projects/execution-platform/specs/product-spec-checkpointed-proof-framework.md",
      "docs/projects/execution-platform/specs/runtime-artifact-payload-store-and-bounded-manifests.md",
      "docs/projects/execution-platform/product-spec-planning-production-workflow.md",
    ],
    runtimeAuthority:
      "schema_ref_hash_budget_manifest_lifecycle_profile_capability_projection_tool_visibility_validation_evidence_and_db_closeout",
    semanticJudgmentOwner:
      "model_or_human_for_domain_resource_focus_selection_planning_action_semantics_and_closeout_sufficiency",
    deterministicSemanticJudgmentAllowed: false,
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
      validationRef: "validation://shared-domain-resource-lifecycle-contract-refactor",
      graphRef: "runtime-work-graph://shared-domain-resource-lifecycle-real-model-proof",
      ownerReadbackRef:
        "docs/projects/execution-platform/specs/shared-domain-resource-lifecycle-and-product-spec-alignment.md",
      sourceEditRequired: true,
      changedFileRefs,
      artifactRefs: [
        closeout.ref,
        "artifact://execution-platform/shared-domain-resource-lifecycle-real-model-proof/proof.json",
        "artifact://execution-platform/shared-domain-resource-lifecycle-real-model-proof/manifest.json",
      ],
      accepted: true,
      actorId: "codex:shared-domain-resource-lifecycle-closeout",
      reasonCodes: [
        "shared_domain_resource_lifecycle_contract_refactor_closed",
        "product_spec_planning_domain_profile_has_no_coding_write_tools",
        "node_runner_projects_domain_action_tools",
        "real_model_planning_resource_focus_proof_passed",
        "metadata_manifest_bounds_verified",
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
            rank: item.queueRank,
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
  console.error(
    JSON.stringify(
      {
        status: "failed",
        errorName: error?.name ?? "unknown_error",
        errorSummary: String(error?.message ?? error).slice(0, 1_200),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
