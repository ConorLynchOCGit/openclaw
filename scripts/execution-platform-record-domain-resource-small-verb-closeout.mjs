#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const workItemId = "openclaw-convergence.domain-resource-small-verb-tool-surface";
const nextItemId = "openclaw-convergence.capability-manifest-domain-lifecycle-upgrade";
const proofDir = ".artifacts/execution-platform/domain-resource-small-verb-real-model-proof";
const proofPath = `${proofDir}/proof.json`;
const proofManifestPath = `${proofDir}/manifest.json`;

const changedFileRefs = [
  "docs/projects/execution-platform/CURRENT_SLICE.md",
  "docs/projects/execution-platform/STATUS.md",
  "docs/projects/execution-platform/specs/node-lifecycle-transition-ownership-consolidation.md",
  "docs/projects/execution-platform/specs/product-spec-proof-hardening-worker-boundary-suite.md",
  "docs/projects/execution-platform/specs/shared-domain-resource-lifecycle-and-product-spec-alignment.md",
  "extensions/execution-platform/src/codex-bridge/adversarial-proof-entry-suite.ts",
  "extensions/execution-platform/src/model-tasks/model-task-classification.ts",
  "extensions/execution-platform/src/model-tasks/model-task-classification.test.ts",
  "extensions/execution-platform/src/workflows/domain-resource-small-verb-tool-surface.ts",
  "extensions/execution-platform/src/workflows/domain-resource-small-verb-tool-surface.test.ts",
  "extensions/execution-platform/src/workflows/index.ts",
  "extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts",
  "extensions/execution-platform/src/workflows/scheduler-runtime-tools.test.ts",
  "scripts/execution-platform-record-domain-resource-small-verb-closeout.mjs",
  "scripts/execution-platform-record-proof-hardening-02-closeout.mjs",
  "scripts/execution-platform-run-domain-resource-small-verb-real-model-proof.mjs",
];

const validationCommands = [
  {
    command:
      "node scripts/run-vitest.mjs run --config test/vitest/vitest.extensions.config.ts extensions/execution-platform/src/workflows/domain-resource-small-verb-tool-surface.test.ts extensions/execution-platform/src/workflows/scheduler-runtime-tools.test.ts extensions/execution-platform/src/model-tasks/model-task-classification.test.ts extensions/execution-platform/src/workflows/product-spec-planning-plugin.test.ts extensions/execution-platform/src/workflows/shared-domain-resource-lifecycle.test.ts extensions/execution-platform/src/workflows/node-lifecycle-transition-runner.test.ts extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts",
    result: "passed: 7 files, 83 tests",
  },
  {
    command: "node scripts/execution-platform-run-domain-resource-small-verb-real-model-proof.mjs",
    result: "passed: providerCallCount=1 selectedToolId=planning.action_graph.propose",
  },
  {
    command: "node scripts/run-tsgo-fast.mjs --pretty false",
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
    "hiddenReasoningStored",
    "secretsStored",
  ]) {
    if (flag in value && value[flag] !== false) {
      throw new Error(`${name}_${flag}_not_false`);
    }
  }
}

function assertManifestBounds(value, name) {
  const bytes = Buffer.byteLength(JSON.stringify(value), "utf8");
  if (bytes > 16 * 1024) {
    throw new Error(`${name}_manifest_overflow:${bytes}`);
  }
}

async function main() {
  const proof = readJson(proofPath);
  const manifest = readJson(proofManifestPath);
  if (proof.status !== "passed" || manifest.status !== "passed") {
    throw new Error("domain_resource_small_verb_proof_not_passed");
  }
  if (manifest.providerCallCount < 1 || proof.providerCallCount < 1) {
    throw new Error("domain_resource_small_verb_provider_call_missing");
  }
  if (manifest.selectedToolId !== "planning.action_graph.propose") {
    throw new Error(`domain_resource_small_verb_wrong_tool:${manifest.selectedToolId}`);
  }
  if (proof.productSpecMenu?.toolIds?.includes("worker.edit.plan")) {
    throw new Error("domain_resource_small_verb_product_spec_exposes_worker_edit_plan");
  }
  if (!proof.productSpecMenu?.toolIds?.includes("planning.action_graph.propose")) {
    throw new Error("domain_resource_small_verb_product_spec_planning_tool_missing");
  }
  if (!proof.productSpecMenu?.toolIds?.includes("resource.selection.propose")) {
    throw new Error("domain_resource_small_verb_resource_selection_tool_missing");
  }
  if (!proof.productSpecMenu?.rejectedToolIds?.includes("worker.edit.plan")) {
    throw new Error("domain_resource_small_verb_product_spec_coding_tool_not_rejected");
  }
  if (proof.codingMenu?.toolIds?.includes("planning.action_graph.propose")) {
    throw new Error("domain_resource_small_verb_coding_exposes_planning_action_tool");
  }
  if (!proof.codingMenu?.rejectedToolIds?.includes("planning.action_graph.propose")) {
    throw new Error("domain_resource_small_verb_coding_planning_tool_not_rejected");
  }
  if (manifest.proofBytes > 16 * 1024) {
    throw new Error(`domain_resource_small_verb_proof_overflow:${manifest.proofBytes}`);
  }
  assertManifestBounds(proof, "domain_resource_small_verb_proof");
  assertManifestBounds(manifest, "domain_resource_small_verb_manifest");
  assertFalseRawStorage(proof, "proof");
  assertFalseRawStorage(manifest, "manifest");

  const closeout = writeArtifact("domain-resource-small-verb-closeout.json", {
    artifactKind: "execution_platform.domain_resource_small_verb_closeout",
    schemaVersion: "execution-platform.domain-resource-small-verb-closeout.v1",
    workItemId,
    nextItemId,
    implementationSummary:
      "The domain-resource model-facing tool surface is now a single projection-gated contract across shared resource verbs, resource.selection, domain.action_gate, coding worker actions, and Product/Spec planning actions. Runtime registration and model-task classification use canonical resource.selection/domain.action_gate families. Product/Spec menus reject coding edit/patch tools; coding menus reject planning actions. Planning tools compile into bounded payload-backed artifact manifests instead of raw model bodies.",
    completedCapabilities: [
      "canonical_domain_resource_small_verb_tool_surface",
      "resource_selection_family_replaces_old_dialects",
      "domain_action_gate_family_registered",
      "product_spec_planning_small_verbs_runtime_compiled",
      "planning_artifact_manifest_payload_refs",
      "cross_domain_tool_visibility_rejection",
      "real_model_product_spec_action_graph_tool_choice_proof",
      "metadata_manifest_bounds_verified",
    ],
    validationCommands,
    changedFileRefs,
    proofSummary: {
      proofRef: "artifact://execution-platform/domain-resource-small-verb-real-model-proof/proof.json",
      proofHash: artifactHash(proofPath),
      manifestRef:
        "artifact://execution-platform/domain-resource-small-verb-real-model-proof/manifest.json",
      manifestHash: artifactHash(proofManifestPath),
      providerCallCount: manifest.providerCallCount,
      selectedToolId: manifest.selectedToolId,
      planningOutputRef: manifest.planningOutputRef,
      domainActionGateRef: manifest.domainActionGateRef,
      productSpecMenuToolCount: manifest.productSpecMenuToolCount,
      codingMenuToolCount: manifest.codingMenuToolCount,
      proofBytes: manifest.proofBytes,
      rawPromptStored: manifest.rawPromptStored,
      rawResponseStored: manifest.rawResponseStored,
    },
    deepCompletionAnswers: {
      oneCanonicalResourceSelectionDialect: true,
      productSpecPlanningRejectsCodingEditTools: true,
      codingRejectsPlanningActionTools: true,
      planningVerbsCompileThroughRuntimeToolExecutor: true,
      productSpecProofUsesRealProviderCall: true,
      modelSelectedCanonicalPlanningSmallVerb: true,
      manifestsStayBelowOverflowBudget: true,
      rawProviderPayloadsStored: false,
      fallbackOrCompatibilityPathAdded: false,
      deterministicSemanticJudgmentAdded: false,
    },
    sourceSpecRefs: [
      "docs/projects/execution-platform/specs/shared-domain-resource-lifecycle-and-product-spec-alignment.md",
      "docs/projects/execution-platform/specs/node-lifecycle-transition-ownership-consolidation.md",
      "docs/projects/execution-platform/specs/runtime-artifact-payload-store-and-bounded-manifests.md",
    ],
    runtimeAuthority:
      "node_lifecycle_projection_tool_membership_capability_profile_schema_hash_byte_budget_runtime_registry_and_db_closeout",
    semanticJudgmentOwner:
      "model_or_human_for_domain_tool_choice_and_planning_artifact_semantic_sufficiency",
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
      validationRef: "validation://domain-resource-small-verb-tool-surface",
      graphRef: "runtime-work-graph://domain-resource-small-verb-real-model-proof",
      ownerReadbackRef: "docs/projects/execution-platform/CURRENT_SLICE.md",
      sourceEditRequired: true,
      changedFileRefs,
      artifactRefs: [
        closeout.ref,
        "artifact://execution-platform/domain-resource-small-verb-real-model-proof/proof.json",
        "artifact://execution-platform/domain-resource-small-verb-real-model-proof/manifest.json",
      ],
      accepted: true,
      actorId: "codex:domain-resource-small-verb-closeout",
      reasonCodes: [
        "domain_resource_small_verb_tool_surface_closed",
        "resource_selection_canonical_family_verified",
        "domain_action_gate_family_verified",
        "product_spec_planning_tool_visibility_verified",
        "real_model_product_spec_small_verb_proof_passed",
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
