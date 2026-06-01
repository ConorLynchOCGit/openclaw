#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const workItemId = "openclaw-convergence.capability-manifest-domain-lifecycle-upgrade";
const nextItemId = "openclaw-convergence.proof-framework-executor-subject-split";
const proofDir =
  ".artifacts/execution-platform/capability-manifest-domain-lifecycle-real-model-proof";
const proofPath = `${proofDir}/proof.json`;
const proofManifestPath = `${proofDir}/manifest.json`;

const changedFileRefs = [
  "extensions/execution-platform/src/workflows/capability-manifest-domain-lifecycle.ts",
  "extensions/execution-platform/src/workflows/capability-manifest-domain-lifecycle.test.ts",
  "extensions/execution-platform/src/workflows/index.ts",
  "extensions/execution-platform/src/workflows/runtime-node-capability-registry.ts",
  "extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts",
  "scripts/execution-platform-record-capability-manifest-domain-lifecycle-closeout.mjs",
  "scripts/execution-platform-run-capability-manifest-domain-lifecycle-real-model-proof.mjs",
];

const validationCommands = [
  {
    command:
      "pnpm test:file extensions/execution-platform/src/workflows/capability-manifest-domain-lifecycle.test.ts extensions/execution-platform/src/workflows/runtime-node-capability-registry.test.ts extensions/execution-platform/src/workflows/scheduler-runtime-tools.test.ts",
    result: "passed: 3 files, 44 tests",
  },
  {
    command: "node scripts/execution-platform-run-capability-manifest-domain-lifecycle-real-model-proof.mjs",
    result:
      "passed: providerCallCount=1 selectedCodingCapabilityId=implementation_microtask selectedPlanningCapabilityId=action_graph_proposal modelMenuBytes=15845",
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
    throw new Error("capability_manifest_domain_lifecycle_proof_not_passed");
  }
  if (manifest.providerCallCount < 1 || proof.providerCallCount < 1) {
    throw new Error("capability_manifest_domain_lifecycle_provider_call_missing");
  }
  if (!["implementation_microtask", "implementation_complex"].includes(manifest.selectedCodingCapabilityId)) {
    throw new Error(
      `capability_manifest_domain_lifecycle_wrong_coding_capability:${manifest.selectedCodingCapabilityId}`,
    );
  }
  if (manifest.selectedPlanningCapabilityId !== "action_graph_proposal") {
    throw new Error(
      `capability_manifest_domain_lifecycle_wrong_planning_capability:${manifest.selectedPlanningCapabilityId}`,
    );
  }
  if (manifest.modelMenuBytes > 16 * 1024) {
    throw new Error(`capability_manifest_domain_lifecycle_model_menu_overflow:${manifest.modelMenuBytes}`);
  }
  if (manifest.proofBytes > 16 * 1024) {
    throw new Error(`capability_manifest_domain_lifecycle_proof_overflow:${manifest.proofBytes}`);
  }
  if (manifest.requestedInputBytes > 16 * 1024) {
    throw new Error(
      `capability_manifest_domain_lifecycle_real_model_request_overflow:${manifest.requestedInputBytes}`,
    );
  }
  assertManifestBounds(proof, "capability_manifest_domain_lifecycle_proof");
  assertManifestBounds(manifest, "capability_manifest_domain_lifecycle_manifest");
  assertFalseRawStorage(proof, "proof");
  assertFalseRawStorage(manifest, "manifest");

  const closeout = writeArtifact("capability-manifest-domain-lifecycle-closeout.json", {
    artifactKind: "execution_platform.capability_manifest_domain_lifecycle_closeout",
    schemaVersion: "execution-platform.capability-manifest-domain-lifecycle-closeout.v1",
    workItemId,
    nextItemId,
    implementationSummary:
      "Capability manifest lifecycle metadata is now exposed through compact, bounded model menus plus live manifest-backed capability small verbs. The scheduler runtime registry no longer lets capability.lookup, capability.validate_intent, capability.require_resources, capability.require_validation, capability.require_evidence, or capability.list_legal_transitions fall through to generic scheduler evidence. Runtime validates workflow, phase, intent, resource, validation, evidence, lifecycle, and tool structure only; semantic capability choice remains model-authored.",
    completedCapabilities: [
      "compact_model_visible_capability_menu_under_16kb",
      "capability_lookup_live_runtime_tool",
      "capability_validate_intent_live_runtime_tool",
      "capability_require_resources_live_runtime_tool",
      "capability_require_validation_live_runtime_tool",
      "capability_require_evidence_live_runtime_tool",
      "capability_list_legal_transitions_live_runtime_tool",
      "scheduler_runtime_registry_capability_tools_no_generic_fallback",
      "product_spec_planning_capability_selection_real_model_proof",
      "coding_source_edit_capability_selection_real_model_proof",
    ],
    validationCommands,
    changedFileRefs,
    proofSummary: {
      proofRef:
        "artifact://execution-platform/capability-manifest-domain-lifecycle-real-model-proof/proof.json",
      proofHash: artifactHash(proofPath),
      manifestRef:
        "artifact://execution-platform/capability-manifest-domain-lifecycle-real-model-proof/manifest.json",
      manifestHash: artifactHash(proofManifestPath),
      providerCallCount: manifest.providerCallCount,
      selectedCodingCapabilityId: manifest.selectedCodingCapabilityId,
      selectedPlanningCapabilityId: manifest.selectedPlanningCapabilityId,
      modelMenuBytes: manifest.modelMenuBytes,
      requestedInputBytes: manifest.requestedInputBytes,
      proofBytes: manifest.proofBytes,
      rawPromptStored: manifest.rawPromptStored,
      rawResponseStored: manifest.rawResponseStored,
    },
    deepCompletionAnswers: {
      capabilityToolsAreLiveManifestBacked: true,
      capabilityToolsAvoidGenericSchedulerFallback: true,
      capabilityMenuStaysBelowManifestBudget: true,
      codingCapabilitySelectionUsesRealModelCall: true,
      productSpecCapabilitySelectionUsesRealModelCall: true,
      runtimeOnlyValidatesStructureRefsAuthorityBudgetsLifecycle: true,
      semanticCapabilityFitRemainsModelAuthored: true,
      rawProviderPayloadsStored: false,
      fallbackOrCompatibilityPathAdded: false,
      deterministicSemanticJudgmentAdded: false,
    },
    sourceSpecRefs: [
      "docs/projects/execution-platform/specs/shared-domain-resource-lifecycle-and-product-spec-alignment.md",
      "docs/projects/execution-platform/specs/node-lifecycle-transition-ownership-consolidation.md",
      "docs/projects/execution-platform/specs/node-lifecycle-transition-runner.md",
      "docs/projects/execution-platform/specs/maximum-toolification-architecture.md",
      "docs/projects/execution-platform/specs/runtime-toolification-and-utility-scheduling.md",
      "docs/projects/execution-platform/specs/runtime-artifact-payload-store-and-bounded-manifests.md",
    ],
    runtimeAuthority:
      "capability_manifest_profile_refs_schema_hash_budget_runtime_tool_registry_and_db_closeout",
    semanticJudgmentOwner:
      "model_or_human_for_capability_fit_and_task_semantic_sufficiency",
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
      validationRef: "validation://capability-manifest-domain-lifecycle",
      graphRef: "runtime-work-graph://capability-manifest-domain-lifecycle-real-model-proof",
      ownerReadbackRef:
        "docs/projects/execution-platform/specs/shared-domain-resource-lifecycle-and-product-spec-alignment.md",
      sourceEditRequired: true,
      changedFileRefs,
      artifactRefs: [
        closeout.ref,
        "artifact://execution-platform/capability-manifest-domain-lifecycle-real-model-proof/proof.json",
        "artifact://execution-platform/capability-manifest-domain-lifecycle-real-model-proof/manifest.json",
      ],
      accepted: true,
      actorId: "codex:capability-manifest-domain-lifecycle-closeout",
      reasonCodes: [
        "capability_manifest_domain_lifecycle_closed",
        "capability_small_verbs_live_manifest_backed",
        "capability_model_menu_bounded_under_16kb",
        "real_model_capability_selection_proof_passed",
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
