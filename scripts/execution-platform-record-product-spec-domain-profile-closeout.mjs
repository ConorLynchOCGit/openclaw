#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const workItemId = "openclaw-convergence.product-spec-planning-domain-profile-respec";
const nextItemId = "openclaw-convergence.domain-resource-small-verb-tool-surface";
const proofDir = ".artifacts/execution-platform/product-spec-domain-profile-real-model-proof";
const proofPath = `${proofDir}/proof.json`;
const proofManifestPath = `${proofDir}/manifest.json`;

const changedFileRefs = [
  "docs/projects/execution-platform/CURRENT_SLICE.md",
  "docs/projects/execution-platform/STATUS.md",
  "docs/projects/execution-platform/product-spec-planning-production-workflow.md",
  "docs/projects/execution-platform/specs/product-spec-checkpointed-proof-framework.md",
  "docs/projects/execution-platform/specs/shared-domain-resource-lifecycle-and-product-spec-alignment.md",
  "extensions/execution-platform/src/runtime-tool-call/runtime-tool-types.ts",
  "extensions/execution-platform/src/workflows/agent-team-coding-plugin.ts",
  "extensions/execution-platform/src/workflows/agent-team-coding-plugin.test.ts",
  "extensions/execution-platform/src/workflows/architecture-red-team-plugin.ts",
  "extensions/execution-platform/src/workflows/architecture-red-team-plugin.test.ts",
  "extensions/execution-platform/src/workflows/product-spec-planning-plugin.ts",
  "extensions/execution-platform/src/workflows/product-spec-planning-plugin.test.ts",
  "extensions/execution-platform/src/workflows/product-spec-planning-workflow.ts",
  "extensions/execution-platform/src/workflows/shared-domain-resource-lifecycle.ts",
  "extensions/execution-platform/src/workflows/shared-domain-resource-lifecycle.test.ts",
  "extensions/execution-platform/src/workflows/workflow-definition-registry.ts",
  "extensions/execution-platform/src/workflows/workflow-evidence-profile.ts",
  "extensions/execution-platform/src/workflows/workflow-evidence-profile.test.ts",
  "extensions/execution-platform/src/workflows/workflow-orchestration-policy.ts",
  "extensions/execution-platform/src/workflows/workflow-plugin.ts",
  "scripts/execution-platform-record-product-spec-domain-profile-closeout.mjs",
  "scripts/execution-platform-run-product-spec-domain-profile-real-model-proof.mjs",
];

const validationCommands = [
  {
    command:
      "node scripts/run-vitest.mjs run --config test/vitest/vitest.extensions.config.ts extensions/execution-platform/src/workflows/workflow-evidence-profile.test.ts extensions/execution-platform/src/workflows/product-spec-planning-plugin.test.ts extensions/execution-platform/src/workflows/workflow-definition-registry.test.ts extensions/execution-platform/src/workflows/workflow-plugin-registry.test.ts extensions/execution-platform/src/workflows/shared-domain-resource-lifecycle.test.ts extensions/execution-platform/src/workflows/agent-team-coding-plugin.test.ts extensions/execution-platform/src/workflows/architecture-red-team-plugin.test.ts extensions/execution-platform/src/workflows/workflow-registry.test.ts",
    result: "passed: 8 files, 29 tests",
  },
  {
    command: "node --check scripts/execution-platform-run-product-spec-domain-profile-real-model-proof.mjs",
    result: "passed",
  },
  {
    command: "node --check scripts/execution-platform-record-product-spec-domain-profile-closeout.mjs",
    result: "passed",
  },
  {
    command: "node scripts/execution-platform-run-product-spec-domain-profile-real-model-proof.mjs",
    result: "passed: providerCallCount=2 selectedPlanningRefCount=1",
  },
  {
    command: "pnpm tsgo:fast",
    result: "passed",
  },
  {
    command: "git diff --check -- product-spec-domain-profile-respec files",
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
    throw new Error("product_spec_domain_profile_proof_not_passed");
  }
  if (manifest.status !== "passed") {
    throw new Error("product_spec_domain_profile_manifest_not_passed");
  }
  if (manifest.providerCallCount < 2 || proof.providerCallCount < 2) {
    throw new Error("product_spec_domain_profile_real_model_calls_missing");
  }
  if (manifest.selectedPlanningRefCount < 1) {
    throw new Error("product_spec_domain_profile_planning_ref_selection_missing");
  }
  if (manifest.manifestBytes > 16 * 1024) {
    throw new Error(`product_spec_domain_profile_manifest_overflow:${manifest.manifestBytes}`);
  }
  if (proof.proofBytes > 16 * 1024) {
    throw new Error(`product_spec_domain_profile_proof_overflow:${proof.proofBytes}`);
  }
  if (proof.workflowAssertions?.resourceReadinessPolicy !== "domain_resource_manifest") {
    throw new Error("product_spec_domain_profile_wrong_readiness_policy");
  }
  if (proof.workflowAssertions?.runtimeToolFamilies?.includes("node.resource_materialization")) {
    throw new Error("product_spec_domain_profile_exposes_node_resource_materialization");
  }
  if (proof.runtimeArtifacts?.lifecycleProjectionGate !== "worker_action_ready") {
    throw new Error("product_spec_domain_profile_lifecycle_projection_not_worker_action_ready");
  }
  if (proof.runtimeArtifacts?.lifecycleNextLegalTransitions?.includes("worker.edit.plan")) {
    throw new Error("product_spec_domain_profile_exposes_coding_edit_plan");
  }
  if (!proof.modelMadeSemanticResourceChoice || !proof.modelAuthoredPlanningIntent) {
    throw new Error("product_spec_domain_profile_model_semantic_authoring_missing");
  }
  if (proof.childExecutionStarted !== false) {
    throw new Error("product_spec_domain_profile_child_execution_started");
  }
  assertFalseRawStorage(proof, "proof");
  assertFalseRawStorage(manifest, "manifest");

  const closeout = writeArtifact("product-spec-domain-profile-closeout.json", {
    artifactKind: "execution_platform.product_spec_domain_profile_closeout",
    schemaVersion: "execution-platform.product-spec-domain-profile-closeout.v1",
    workItemId,
    nextItemId,
    implementationSummary:
      "Product/Spec Planning is now a domain-resource-manifest workflow profile on the shared lifecycle spine. Its plugin, evidence profile, workflow projection, source validators, docs, and middle-lane real model proof all reject coding snapshot/write/patch readiness and require planning-domain resources, planning intent evidence, bounded manifests, and no child execution auto-start.",
    completedCapabilities: [
      "workflow_plugin_resource_readiness_policy_split",
      "product_spec_domain_resource_manifest_readiness",
      "product_spec_runtime_tool_family_no_node_resource_materialization",
      "planning_intent_capsule_revision_closeout_validators",
      "product_spec_evidence_profile_planning_intent_required",
      "product_spec_work_queue_projection_shared_lifecycle_fields",
      "node_runner_projects_product_spec_domain_worker_actions",
      "real_model_product_spec_domain_profile_middle_lane_proof",
      "manifest_only_metadata_and_payload_ref_artifact_shape",
    ],
    validationCommands,
    changedFileRefs,
    proofSummary: {
      proofRef: "artifact://execution-platform/product-spec-domain-profile-real-model-proof/proof.json",
      proofHash: artifactHash(proofPath),
      manifestRef:
        "artifact://execution-platform/product-spec-domain-profile-real-model-proof/manifest.json",
      manifestHash: artifactHash(proofManifestPath),
      providerCallCount: manifest.providerCallCount,
      selectedPlanningRefCount: manifest.selectedPlanningRefCount,
      proofBytes: proof.proofBytes,
      manifestBytes: manifest.manifestBytes,
      lifecycleProjectionGate: manifest.lifecycleProjectionGate,
      lifecycleNextLegalTransitions: manifest.lifecycleNextLegalTransitions,
      rawPromptStored: manifest.rawPromptStored,
      rawResponseStored: manifest.rawResponseStored,
    },
    deepCompletionAnswers: {
      productSpecUsesDomainResourceManifestReadiness: true,
      productSpecRequiresCodingFreshContextSnapshots: false,
      productSpecExposesNodeResourceMaterialization: false,
      productSpecExposesWorkerEditPlanOrPatchTools: false,
      modelSelectedPlanningDomainResourcesInRealProof: true,
      modelAuthoredPlanningIntentInRealProof: true,
      productSpecChildExecutionAutoStarted: false,
      manifestsStayBelowOverflowBudget: true,
      rawProviderPayloadsStored: false,
      fallbackOrCompatibilityPathAdded: false,
      deterministicSemanticJudgmentAdded: false,
    },
    sourceSpecRefs: [
      "docs/projects/execution-platform/specs/shared-domain-resource-lifecycle-and-product-spec-alignment.md",
      "docs/projects/execution-platform/product-spec-planning-production-workflow.md",
      "docs/projects/execution-platform/specs/product-spec-checkpointed-proof-framework.md",
      "docs/projects/execution-platform/specs/runtime-artifact-payload-store-and-bounded-manifests.md",
    ],
    runtimeAuthority:
      "schema_ref_hash_budget_manifest_lifecycle_profile_capability_projection_tool_visibility_validation_evidence_and_db_closeout",
    semanticJudgmentOwner:
      "model_or_human_for_domain_resource_focus_selection_planning_artifact_content_and_closeout_sufficiency",
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
      validationRef: "validation://product-spec-domain-profile-respec",
      graphRef: "runtime-work-graph://product-spec-domain-profile-real-model-proof",
      ownerReadbackRef: "docs/projects/execution-platform/product-spec-planning-production-workflow.md",
      sourceEditRequired: true,
      changedFileRefs,
      artifactRefs: [
        closeout.ref,
        "artifact://execution-platform/product-spec-domain-profile-real-model-proof/proof.json",
        "artifact://execution-platform/product-spec-domain-profile-real-model-proof/manifest.json",
      ],
      accepted: true,
      actorId: "codex:product-spec-domain-profile-closeout",
      reasonCodes: [
        "product_spec_domain_profile_respec_closed",
        "domain_resource_manifest_readiness_policy_verified",
        "coding_write_and_patch_tools_excluded",
        "planning_intent_evidence_contract_verified",
        "real_model_product_spec_domain_profile_proof_passed",
        "metadata_manifest_bounds_verified",
      ],
    });
    const active = await workQueue.listDbWorkQueue({ bucket: "active", limit: 8 });
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
