#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const workItemId = "openclaw-convergence.proof-framework-executor-subject-split";
const nextItemId = "openclaw-convergence.product-spec-framework-coding-system-implementation-proof";
const proofDir =
  ".artifacts/execution-platform/proof-framework-executor-subject-split-real-model-proof";
const proofPath = `${proofDir}/proof.json`;
const proofManifestPath = `${proofDir}/manifest.json`;
const codingRunManifestPath =
  ".artifacts/execution-platform/proof-runs/proof-framework-executor-subject-split-coding/manifest.json";
const planningRunManifestPath =
  ".artifacts/execution-platform/proof-runs/proof-framework-executor-subject-split-planning/manifest.json";

const changedFileRefs = [
  "extensions/execution-platform/src/workflows/product-spec-proof-substrate.ts",
  "extensions/execution-platform/src/workflows/product-spec-proof-substrate.test.ts",
  "extensions/execution-platform/src/workflows/boundary-replay-proof-gate.ts",
  "extensions/execution-platform/src/workflows/boundary-replay-proof-gate.test.ts",
  "scripts/execution-platform-run-product-spec-boundary-replay.mjs",
  "scripts/execution-platform-run-proof-framework-executor-subject-split-real-model-proof.mjs",
  "scripts/execution-platform-record-proof-framework-executor-subject-split-closeout.mjs",
];

const validationCommands = [
  {
    command:
      "pnpm test:file extensions/execution-platform/src/workflows/product-spec-proof-substrate.test.ts extensions/execution-platform/src/workflows/boundary-replay-proof-gate.test.ts extensions/execution-platform/src/intent-front-door/router-schema.test.ts extensions/execution-platform/src/intent-routing/native-execution-rpc.test.ts",
    result: "passed: 4 files, 49 tests",
  },
  {
    command:
      "node scripts/execution-platform-run-proof-framework-executor-subject-split-real-model-proof.mjs",
    result:
      "passed: providerCallCount=1 selectedProofFamilies=coding_executor_target_subject,product_spec_planning_executor",
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
  const manifest = readJson(proofManifestPath);
  const codingRunManifest = readJson(codingRunManifestPath);
  const planningRunManifest = readJson(planningRunManifestPath);
  if (proof.status !== "passed" || manifest.status !== "passed") {
    throw new Error("proof_framework_executor_subject_split_real_model_proof_not_passed");
  }
  if (manifest.providerCallCount < 1 || proof.providerCallCount < 1) {
    throw new Error("proof_framework_executor_subject_split_provider_call_missing");
  }
  if (!manifest.selectedProofFamilies?.includes("coding_executor_target_subject")) {
    throw new Error("proof_framework_executor_subject_split_coding_family_missing");
  }
  if (!manifest.selectedProofFamilies?.includes("product_spec_planning_executor")) {
    throw new Error("proof_framework_executor_subject_split_planning_family_missing");
  }
  if (codingRunManifest.proofFamily !== "coding_executor_target_subject") {
    throw new Error(`coding_run_manifest_wrong_family:${codingRunManifest.proofFamily}`);
  }
  if (codingRunManifest.executorWorkflowId !== "agent_team.coding") {
    throw new Error(`coding_run_manifest_wrong_executor:${codingRunManifest.executorWorkflowId}`);
  }
  if (
    !codingRunManifest.subjectWorkflowIds?.includes("agent_team.product_spec_planning") ||
    !codingRunManifest.requestedCapabilities?.some((capability) =>
      ["code_edit", "test"].includes(capability),
    )
  ) {
    throw new Error("coding_run_manifest_missing_product_spec_subject_or_coding_capability");
  }
  if (planningRunManifest.proofFamily !== "product_spec_planning_executor") {
    throw new Error(`planning_run_manifest_wrong_family:${planningRunManifest.proofFamily}`);
  }
  if (planningRunManifest.executorWorkflowId !== "agent_team.product_spec_planning") {
    throw new Error(`planning_run_manifest_wrong_executor:${planningRunManifest.executorWorkflowId}`);
  }
  if (
    planningRunManifest.requestedCapabilities?.some((capability) =>
      ["code_edit", "source_edit", "test", "docs_update", "review"].includes(capability),
    )
  ) {
    throw new Error("planning_run_manifest_exposes_coding_capability");
  }
  assertManifestBounds(proof, "proof_framework_executor_subject_split_proof");
  assertManifestBounds(manifest, "proof_framework_executor_subject_split_manifest");
  assertManifestBounds(codingRunManifest, "proof_framework_executor_subject_split_coding_manifest");
  assertManifestBounds(planningRunManifest, "proof_framework_executor_subject_split_planning_manifest");
  assertFalseRawStorage(proof, "proof");
  assertFalseRawStorage(manifest, "manifest");
  assertFalseRawStorage(codingRunManifest, "codingRunManifest");
  assertFalseRawStorage(planningRunManifest, "planningRunManifest");

  const closeout = writeArtifact("proof-framework-executor-subject-split-closeout.json", {
    artifactKind: "execution_platform.proof_framework_executor_subject_split_closeout",
    schemaVersion: "execution-platform.proof-framework-executor-subject-split-closeout.v1",
    workItemId,
    nextItemId,
    implementationSummary:
      "Product/Spec proof framework closure now requires an explicit proof family gate. Coding-system implementation proofs must route through agent_team.coding with Product/Spec Planning as target subject and coding/test capabilities. Product/Spec Planning executor proofs must route through agent_team.product_spec_planning with planning capabilities and without coding edit/test/review capability leakage. Replay admission, run-scoped manifests, and the boundary replay script now carry this split as bounded metadata instead of inferring it from prose.",
    completedCapabilities: [
      "product_spec_proof_family_gate",
      "coding_executor_product_spec_target_subject_validation",
      "product_spec_planning_executor_no_coding_capability_validation",
      "run_scoped_proof_manifest_executor_subject_fields",
      "replay_admission_executor_subject_gate",
      "planning_executor_no_changed_file_requirement",
      "product_spec_boundary_replay_manifest_route_fields",
      "real_model_executor_subject_family_split_proof",
      "metadata_manifest_bounds_verified",
    ],
    validationCommands,
    changedFileRefs,
    proofSummary: {
      proofRef:
        "artifact://execution-platform/proof-framework-executor-subject-split-real-model-proof/proof.json",
      proofHash: artifactHash(proofPath),
      manifestRef:
        "artifact://execution-platform/proof-framework-executor-subject-split-real-model-proof/manifest.json",
      manifestHash: artifactHash(proofManifestPath),
      codingRunManifestRef:
        "artifact://execution-platform/proof-runs/proof-framework-executor-subject-split-coding/manifest.json",
      codingRunManifestHash: artifactHash(codingRunManifestPath),
      planningRunManifestRef:
        "artifact://execution-platform/proof-runs/proof-framework-executor-subject-split-planning/manifest.json",
      planningRunManifestHash: artifactHash(planningRunManifestPath),
      providerCallCount: manifest.providerCallCount,
      selectedProofFamilies: manifest.selectedProofFamilies,
      requestedInputBytes: manifest.requestedInputBytes,
      proofBytes: manifest.proofBytes,
      rawPromptStored: manifest.rawPromptStored,
      rawResponseStored: manifest.rawResponseStored,
    },
    deepCompletionAnswers: {
      codingImplementationProofRequiresCodingExecutor: true,
      codingImplementationProofRequiresProductSpecTargetSubject: true,
      codingImplementationProofRequiresCodingOrTestCapability: true,
      productSpecPlanningProofRequiresProductSpecExecutor: true,
      productSpecPlanningProofBlocksCodingCapabilities: true,
      productSpecPlanningProofCanCloseWithoutChangedSourceFiles: true,
      replayAdmissionConsumesProofFamilyGate: true,
      runScopedManifestCarriesExecutorSubjectSplit: true,
      realModelClassifiedBothProofFamilies: true,
      metadataManifestStaysUnderOverflowBudget: true,
      rawProviderPayloadsStored: false,
      fallbackOrCompatibilityPathAdded: false,
      deterministicSemanticJudgmentAdded: false,
    },
    sourceSpecRefs: [
      "docs/projects/execution-platform/product-spec-planning-production-workflow.md",
      "docs/projects/execution-platform/specs/product-spec-checkpointed-proof-framework.md",
      "docs/projects/execution-platform/specs/shared-domain-resource-lifecycle-and-product-spec-alignment.md",
      "docs/projects/execution-platform/specs/intent-routing-and-workflow-contracts.md",
      "docs/projects/execution-platform/specs/runtime-artifact-payload-store-and-bounded-manifests.md",
    ],
    runtimeAuthority:
      "schema_ref_hash_budget_executor_subject_family_replay_admission_run_scoped_manifest_and_db_closeout",
    semanticJudgmentOwner:
      "model_or_human_for_owner_prompt_intent_and_proof_family_semantic_fit",
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
      validationRef: "validation://proof-framework-executor-subject-split",
      graphRef: "runtime-work-graph://proof-framework-executor-subject-split-real-model-proof",
      ownerReadbackRef:
        "docs/projects/execution-platform/specs/product-spec-checkpointed-proof-framework.md",
      sourceEditRequired: true,
      changedFileRefs,
      artifactRefs: [
        closeout.ref,
        "artifact://execution-platform/proof-framework-executor-subject-split-real-model-proof/proof.json",
        "artifact://execution-platform/proof-framework-executor-subject-split-real-model-proof/manifest.json",
        "artifact://execution-platform/proof-runs/proof-framework-executor-subject-split-coding/manifest.json",
        "artifact://execution-platform/proof-runs/proof-framework-executor-subject-split-planning/manifest.json",
      ],
      accepted: true,
      actorId: "codex:proof-framework-executor-subject-split-closeout",
      reasonCodes: [
        "proof_framework_executor_subject_split_closed",
        "coding_executor_target_subject_family_gate_passed",
        "product_spec_planning_executor_family_gate_passed",
        "real_model_executor_subject_split_proof_passed",
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
