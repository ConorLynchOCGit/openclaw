#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const workItemId = "openclaw-convergence.resource-objective-focus-and-requirement-narrowing";
const nextItemId = "openclaw-convergence.node-local-node-resource-demand-production-transition";
const realModelProofPath =
  ".artifacts/execution-platform/resource-objective-focus-real-model-proof/proof.json";
const providerDiagnosticsPath =
  ".artifacts/execution-platform/resource-objective-focus-real-model-proof/provider-diagnostics.json";
const inventoryManifestPath =
  ".artifacts/execution-platform/architecture-residue-source-inventory-gate/manifest.json";

const changedFileRefs = [
  "extensions/execution-platform/src/workflows/resource-objective-focus.ts",
  "extensions/execution-platform/src/workflows/resource-objective-focus.test.ts",
  "extensions/execution-platform/src/workflows/resource-requirement-packet.ts",
  "extensions/execution-platform/src/workflows/resource-requirement-packet.test.ts",
  "extensions/execution-platform/src/workflows/context-scout-execution-packet.test.ts",
  "extensions/execution-platform/src/workflows/context-repair-requirement.ts",
  "extensions/execution-platform/src/workflows/context-repair-requirement.test.ts",
  "extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts",
  "extensions/execution-platform/src/workflows/scheduler-runtime-tools.test.ts",
  "extensions/execution-platform/src/runtime-artifact-contracts.ts",
  "extensions/execution-platform/src/runtime-artifact-contracts.test.ts",
  "extensions/execution-platform/src/runtime-tool-call/runtime-tool-types.ts",
  "extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts",
  "extensions/execution-platform/src/workflows/index.ts",
  "scripts/execution-platform-run-resource-objective-focus-real-model-proof.mjs",
  "scripts/execution-platform-record-resource-objective-focus-closeout.mjs",
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
  const proof = readJson(realModelProofPath);
  const providerDiagnostics = readJson(providerDiagnosticsPath);
  const inventoryManifest = readJson(inventoryManifestPath);
  if (proof.status !== "succeeded") {
    throw new Error("resource_objective_focus_real_model_proof_not_succeeded");
  }
  if (proof.passConditions?.acceptedFocus !== true) {
    throw new Error("resource_objective_focus_not_accepted");
  }
  if (proof.passConditions?.requirementReady !== true) {
    throw new Error("resource_objective_focus_requirement_not_ready");
  }
  if (proof.passConditions?.scoutPacketProviderSafe !== true) {
    throw new Error("resource_objective_focus_scout_packet_not_provider_safe");
  }
  if (proof.requirementManifest?.candidateRepoAreaRefCount > 4) {
    throw new Error("resource_objective_focus_requirement_not_narrowed");
  }
  if (proof.scoutPacketManifest?.exactProviderInputBytes > proof.scoutPacketManifest?.maxInputBytes) {
    throw new Error("resource_objective_focus_scout_packet_over_profile");
  }
  if (Buffer.byteLength(JSON.stringify(proof.focusManifest), "utf8") > 8_000) {
    throw new Error("resource_objective_focus_manifest_overflow");
  }
  if (Buffer.byteLength(JSON.stringify(proof.legalRefUniverseManifest), "utf8") > 8_000) {
    throw new Error("resource_objective_focus_legal_ref_manifest_overflow");
  }
  if (Buffer.byteLength(JSON.stringify(proof.requirementManifest), "utf8") > 8_000) {
    throw new Error("resource_objective_focus_requirement_manifest_overflow");
  }
  if (inventoryManifest.status !== "passed") {
    throw new Error("architecture_residue_inventory_gate_not_passing");
  }
  assertFalseRawStorage(proof, "proof");
  assertFalseRawStorage(providerDiagnostics, "provider_diagnostics");

  const closeout = writeArtifact("resource-objective-focus-closeout.json", {
    artifactKind: "execution_platform.resource_objective_focus_closeout",
    schemaVersion: "execution-platform.resource-objective-focus-closeout.v1",
    workItemId,
    nextItemId,
    implementationSummary:
      "Added ResourceObjectiveFocus as the required model-authored narrowing boundary before ResourceRequirementPacket readiness, registered focus small verbs, made requirement compile block without accepted focus, kept selected refs payload-backed with bounded manifests, and proved a real Qwen middle-lane focus selection compiles to provider-safe context scout input.",
    completedCapabilities: [
      "resource_objective_focus_contract",
      "context_focus_legal_ref_universe",
      "context_focus_small_verb_runtime_tools",
      "resource_requirement_compile_from_focus_gate",
      "broad_context_payload_blocker",
      "focus_manifest_overflow_guards",
      "context_repair_focus_authority",
      "real_qwen_context_focus_middle_lane_proof",
    ],
    validationCommands: [
      {
        command:
          "pnpm test:file extensions/execution-platform/src/workflows/resource-objective-focus.test.ts extensions/execution-platform/src/workflows/resource-requirement-packet.test.ts extensions/execution-platform/src/workflows/context-scout-execution-packet.test.ts extensions/execution-platform/src/workflows/context-repair-requirement.test.ts extensions/execution-platform/src/workflows/scheduler-runtime-tools.test.ts extensions/execution-platform/src/runtime-artifact-contracts.test.ts extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts extensions/execution-platform/src/workflows/architecture-residue-source-inventory.test.ts",
        result: "passed",
      },
      {
        command:
          "pnpm tsgo:fast extensions/execution-platform/src/workflows/resource-objective-focus.ts extensions/execution-platform/src/workflows/resource-objective-focus.test.ts extensions/execution-platform/src/workflows/resource-requirement-packet.ts extensions/execution-platform/src/workflows/resource-requirement-packet.test.ts extensions/execution-platform/src/workflows/context-scout-execution-packet.ts extensions/execution-platform/src/workflows/context-scout-execution-packet.test.ts extensions/execution-platform/src/workflows/context-repair-requirement.ts extensions/execution-platform/src/workflows/context-repair-requirement.test.ts extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts extensions/execution-platform/src/workflows/scheduler-runtime-tools.test.ts extensions/execution-platform/src/runtime-artifact-contracts.ts extensions/execution-platform/src/runtime-artifact-contracts.test.ts extensions/execution-platform/src/runtime-tool-call/runtime-tool-types.ts extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts extensions/execution-platform/src/workflows/index.ts",
        result: "passed",
      },
      {
        command:
          "pnpm exec tsx scripts/execution-platform-run-resource-objective-focus-real-model-proof.mjs",
        result: "passed",
      },
      {
        command: "pnpm exec tsx scripts/execution-platform-run-architecture-residue-source-inventory-gate.mjs",
        result: "passed",
      },
      { command: "node --check scripts/execution-platform-run-resource-objective-focus-real-model-proof.mjs", result: "passed" },
      { command: "git diff --check", result: "passed" },
    ],
    realModelProof: {
      proofRef: "artifact://execution-platform/resource-objective-focus-real-model-proof/proof.json",
      proofHash: artifactHash(realModelProofPath),
      providerDiagnosticsRef:
        "artifact://execution-platform/resource-objective-focus-real-model-proof/provider-diagnostics.json",
      providerDiagnosticsHash: artifactHash(providerDiagnosticsPath),
      modelRef: proof.modelRef,
      latencyMs: proof.latencyMs,
      requestByteCount: providerDiagnostics.requestByteCount,
      responseByteCount: providerDiagnostics.responseByteCount,
      nativeFinishReason: providerDiagnostics.nativeFinishReason,
      choiceCount: providerDiagnostics.choiceCount,
      focusStatus: proof.focusManifest.status,
      selectedRefHandleCount: proof.focusManifest.selectedRefHandleCount,
      legalRefUniverseHandleCount: proof.legalRefUniverseManifest.handleCount,
      requirementByteCount: proof.requirementManifest.byteCount,
      scoutPacketInputBytes: proof.scoutPacketManifest.exactProviderInputBytes,
      scoutPacketMaxInputBytes: proof.scoutPacketManifest.maxInputBytes,
    },
    deepCompletionAnswers: {
      resourceRequirementCanCompileReadyWithoutAcceptedFocus: false,
      broadBrokerRefsCopiedIntoRequirementByDefault: false,
      runtimeSemanticRankingOrTruncationIntroduced: false,
      focusAndLegalUniverseBodiesPayloadBackedByContract: true,
      graphMetadataCanCarryFocusBodies: false,
      oldGraphScoutOrSynthesisPathReintroduced: false,
      realModelProofWasNonToyMiddleLane: true,
      providerDiagnosticsCaptureResponseShape: true,
    },
    remainingArchitectureRisksForNextItems: [
      "Production still needs the next item to replace remaining default context lifecycle behavior with NodeResourceDemandSession as the canonical runtime path.",
      "Scope revision must execute the model-authored subset lifecycle rather than stopping at a recorded request.",
      "WorkIntent context resolution must consume demand/ledger/focus state instead of legacy graph context edges.",
    ],
    runtimeAuthority:
      "context_focus_schema_ref_budget_metadata_provider_preflight_validation_evidence_db_work_queue_closeout",
    semanticJudgmentOwner:
      "model_or_human_for_focus_next_unknown_selected_refs_questions_sufficiency_target_selection_and_edit_semantics",
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
      validationRef: "validation://resource-objective-focus-and-requirement-narrowing",
      graphRef: "runtime-contract://execution-platform/resource-objective-focus/v1",
      ownerReadbackRef:
        "docs/projects/execution-platform/specs/architecture-transition-closure-and-resource-objective-focus.md#resource-objective-focus-contract",
      sourceEditRequired: true,
      changedFileRefs,
      artifactRefs: [
        closeout.ref,
        "artifact://execution-platform/resource-objective-focus-real-model-proof/proof.json",
        "artifact://execution-platform/resource-objective-focus-real-model-proof/provider-diagnostics.json",
        "artifact://execution-platform/architecture-residue-source-inventory-gate/manifest.json",
      ],
      accepted: true,
      actorId: "codex:resource-objective-focus",
      reasonCodes: [
        "resource_objective_focus_closed",
        "resource_requirement_requires_accepted_focus",
        "broad_context_payload_blocker_added",
        "manifest_overflow_guard_passed",
        "real_qwen_focus_proof_passed",
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
