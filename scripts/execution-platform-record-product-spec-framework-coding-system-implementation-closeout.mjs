#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const workItemId = "openclaw-convergence.product-spec-framework-coding-system-implementation-proof";
const nextItemId = "openclaw-convergence.source-inventory-domain-lifecycle-residue-gate";
const proofRunId = "product-spec-framework-coding-system-implementation-proof";
const proofDir =
  ".artifacts/execution-platform/product-spec-framework-coding-system-implementation-proof";
const proofPath = `${proofDir}/proof.json`;
const proofManifestPath = `${proofDir}/manifest.json`;
const proofRunManifestPath = `.artifacts/execution-platform/proof-runs/${proofRunId}/manifest.json`;
const implementationGatePath =
  `.artifacts/execution-platform/proof-runs/${proofRunId}/implementation-gate.json`;

const changedFileRefs = [
  "extensions/execution-platform/src/workflows/shared-domain-resource-lifecycle.ts",
  "extensions/execution-platform/src/workflows/shared-domain-resource-lifecycle.test.ts",
  "extensions/execution-platform/src/workflows/domain-resource-small-verb-tool-surface.ts",
  "extensions/execution-platform/src/workflows/domain-resource-small-verb-tool-surface.test.ts",
  "extensions/execution-platform/src/workflows/workflow-evidence-profile.ts",
  "extensions/execution-platform/src/workflows/workflow-evidence-profile.test.ts",
  "extensions/execution-platform/src/workflows/product-spec-planning-plugin.ts",
  "extensions/execution-platform/src/workflows/product-spec-planning-plugin.test.ts",
  "extensions/execution-platform/src/workflows/product-spec-proof-substrate.ts",
  "extensions/execution-platform/src/workflows/product-spec-proof-substrate.test.ts",
  "scripts/execution-platform-run-product-spec-framework-coding-system-implementation-proof.mjs",
  "scripts/execution-platform-record-product-spec-framework-coding-system-implementation-closeout.mjs",
];

const validationCommands = [
  {
    command:
      "node scripts/run-vitest.mjs run --config test/vitest/vitest.extensions.config.ts extensions/execution-platform/src/workflows/shared-domain-resource-lifecycle.test.ts extensions/execution-platform/src/workflows/domain-resource-small-verb-tool-surface.test.ts extensions/execution-platform/src/workflows/workflow-evidence-profile.test.ts extensions/execution-platform/src/workflows/product-spec-planning-plugin.test.ts extensions/execution-platform/src/workflows/product-spec-proof-substrate.test.ts extensions/execution-platform/src/workflows/runtime-node-capability-registry.test.ts",
    result: "passed",
  },
  {
    command:
      "node scripts/execution-platform-run-product-spec-framework-coding-system-implementation-proof.mjs",
    result:
      "passed: providerCallCount=1 selectedToolId=planning.framework_contract.record",
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
  return bytes;
}

async function main() {
  const proof = readJson(proofPath);
  const summaryManifest = readJson(proofManifestPath);
  const proofRunManifest = readJson(proofRunManifestPath);
  const implementationGate = readJson(implementationGatePath);
  if (proof.status !== "passed" || summaryManifest.status !== "passed") {
    throw new Error("product_spec_framework_coding_proof_not_passed");
  }
  if (proofRunManifest.proofFamily !== "coding_executor_target_subject") {
    throw new Error(`product_spec_framework_coding_wrong_family:${proofRunManifest.proofFamily}`);
  }
  if (proofRunManifest.executorWorkflowId !== "agent_team.coding") {
    throw new Error(
      `product_spec_framework_coding_wrong_executor:${proofRunManifest.executorWorkflowId}`,
    );
  }
  if (!proofRunManifest.subjectWorkflowIds?.includes("agent_team.product_spec_planning")) {
    throw new Error("product_spec_framework_coding_product_spec_subject_missing");
  }
  if (implementationGate.status !== "passed") {
    throw new Error(
      `product_spec_framework_coding_implementation_gate_not_passed:${implementationGate.reasonCodes?.join(",")}`,
    );
  }
  if (summaryManifest.providerCallCount < 1 || proof.providerCallCount < 1) {
    throw new Error("product_spec_framework_coding_real_model_call_missing");
  }
  if (summaryManifest.selectedToolId !== "planning.framework_contract.record") {
    throw new Error(`product_spec_framework_coding_wrong_tool:${summaryManifest.selectedToolId}`);
  }
  if (proof.directCodexOnlyPatch !== false || proof.exercisedOpenClawFrameworkPath !== true) {
    throw new Error("product_spec_framework_coding_not_openclaw_framework_path");
  }
  if (!proof.frameworkArtifactRefs?.some((ref) => ref.startsWith("planning-framework-contract://"))) {
    throw new Error("product_spec_framework_coding_contract_ref_missing");
  }
  assertManifestBounds(proof, "product_spec_framework_coding_proof");
  assertManifestBounds(summaryManifest, "product_spec_framework_coding_summary_manifest");
  assertManifestBounds(proofRunManifest, "product_spec_framework_coding_run_manifest");
  assertManifestBounds(implementationGate, "product_spec_framework_coding_implementation_gate");
  assertFalseRawStorage(proof, "proof");
  assertFalseRawStorage(summaryManifest, "summaryManifest");
  assertFalseRawStorage(proofRunManifest, "proofRunManifest");
  assertFalseRawStorage(implementationGate, "implementationGate");

  const closeout = writeArtifact("product-spec-framework-coding-system-implementation-closeout.json", {
    artifactKind: "execution_platform.product_spec_framework_coding_system_implementation_closeout",
    schemaVersion:
      "execution-platform.product-spec-framework-coding-system-implementation-closeout.v1",
    workItemId,
    nextItemId,
    implementationSummary:
      "The Product/Spec framework coding-system implementation proof now requires and demonstrates the OpenClaw framework path: agent_team.coding as executor, agent_team.product_spec_planning as target subject, Product/Spec framework contract resource/tool/action evidence, source changes, validation, review, closeout, and run-scoped proof manifests. A new proof gate rejects component-only or direct Codex-only evidence.",
    completedCapabilities: [
      "planning_framework_contract_resource_kind",
      "planning_framework_contract_small_verb",
      "planning_framework_contract_artifact_validation",
      "product_spec_framework_contract_action_gate_expectation",
      "coding_executor_product_spec_target_subject_implementation_gate",
      "real_model_framework_contract_authoring_proof",
      "run_scoped_product_spec_coding_proof_manifest",
      "metadata_manifest_bounds_verified",
    ],
    validationCommands,
    changedFileRefs,
    proofSummary: {
      proofRef:
        "artifact://execution-platform/product-spec-framework-coding-system-implementation-proof/proof.json",
      proofHash: artifactHash(proofPath),
      summaryManifestRef:
        "artifact://execution-platform/product-spec-framework-coding-system-implementation-proof/manifest.json",
      summaryManifestHash: artifactHash(proofManifestPath),
      proofRunManifestRef:
        "artifact://execution-platform/proof-runs/product-spec-framework-coding-system-implementation-proof/manifest.json",
      proofRunManifestHash: artifactHash(proofRunManifestPath),
      implementationGateRef:
        "artifact://execution-platform/proof-runs/product-spec-framework-coding-system-implementation-proof/implementation-gate.json",
      implementationGateHash: artifactHash(implementationGatePath),
      providerCallCount: summaryManifest.providerCallCount,
      selectedToolId: summaryManifest.selectedToolId,
      planningFrameworkContractRef: summaryManifest.planningFrameworkContractRef,
      domainActionGateRef: summaryManifest.domainActionGateRef,
      lifecycleGateCount: summaryManifest.lifecycleGateCount,
      changedFileRefCount: summaryManifest.changedFileRefCount,
      validationRefCount: summaryManifest.validationRefCount,
      rawPromptStored: summaryManifest.rawPromptStored,
      rawResponseStored: summaryManifest.rawResponseStored,
    },
    deepCompletionAnswers: {
      exercisedOpenClawFrameworkPath: true,
      directCodexOnlyPatchRejectedByGate: true,
      codingExecutorProductSpecSubjectRecorded: true,
      modelAuthoredFrameworkContractSmallVerb: true,
      sourceChangesMappedToEvidence: true,
      validationRefsPresent: true,
      reviewAndCloseoutRefsPresent: true,
      manifestsStayBelowOverflowBudget: true,
      rawProviderPayloadsStored: false,
      fallbackOrCompatibilityPathAdded: false,
      deterministicSemanticJudgmentAdded: false,
    },
    sourceSpecRefs: [
      "docs/projects/execution-platform/product-spec-planning-production-workflow.md",
      "docs/projects/execution-platform/specs/product-spec-checkpointed-proof-framework.md",
      "docs/projects/execution-platform/specs/shared-domain-resource-lifecycle-and-product-spec-alignment.md",
      "docs/projects/execution-platform/specs/runtime-artifact-payload-store-and-bounded-manifests.md",
    ],
    runtimeAuthority:
      "proof_family_gate_node_lifecycle_projection_domain_tool_menu_framework_contract_validator_implementation_gate_workflow_evidence_profile_run_scoped_manifest_and_db_closeout",
    semanticJudgmentOwner:
      "model_or_human_for_framework_contract_semantic_sufficiency_and_deep_completion_review",
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
      validationRef: "validation://product-spec-framework-coding-system-implementation-proof",
      graphRef: `runtime-work-graph://${proofRunId}`,
      ownerReadbackRef:
        "docs/projects/execution-platform/specs/product-spec-checkpointed-proof-framework.md",
      sourceEditRequired: true,
      changedFileRefs,
      artifactRefs: [
        closeout.ref,
        "artifact://execution-platform/product-spec-framework-coding-system-implementation-proof/proof.json",
        "artifact://execution-platform/product-spec-framework-coding-system-implementation-proof/manifest.json",
        "artifact://execution-platform/proof-runs/product-spec-framework-coding-system-implementation-proof/manifest.json",
        "artifact://execution-platform/proof-runs/product-spec-framework-coding-system-implementation-proof/implementation-gate.json",
      ],
      accepted: true,
      actorId: "codex:product-spec-framework-coding-system-implementation-closeout",
      reasonCodes: [
        "product_spec_framework_coding_system_implementation_closed",
        "openclaw_framework_path_exercised",
        "coding_executor_product_spec_target_subject_gate_passed",
        "real_model_framework_contract_proof_passed",
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

await main();
