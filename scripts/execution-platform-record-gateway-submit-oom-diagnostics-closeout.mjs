#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const proofPath =
  ".artifacts/execution-platform/gateway-submit-oom-diagnostics/proof.json";
const workItemId = "openclaw-convergence.gateway-submit-oom-diagnostics-memory-guard";
const nextItemId = "openclaw-convergence.blocker-closure-06-replay-and-full-proof-gates";

const changedFileRefs = [
  "extensions/execution-platform/src/intent-routing/gateway-submit-diagnostics.ts",
  "extensions/execution-platform/src/intent-routing/gateway-submit-diagnostics.test.ts",
  "extensions/execution-platform/src/intent-routing/index.ts",
  "extensions/execution-platform/src/intent-routing/native-execution-rpc.ts",
  "extensions/execution-platform/src/intent-routing/native-execution-rpc.test.ts",
  "extensions/execution-platform/src/codex-bridge/host-routes.ts",
  "src/gateway/execution-platform-http.ts",
  "scripts/execution-platform-run-gateway-submit-oom-diagnostics.mjs",
  "scripts/execution-platform-record-gateway-submit-oom-diagnostics-closeout.mjs",
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

function assertFalseFlags(value, label) {
  for (const flag of [
    "rawPromptStored",
    "rawResponseStored",
    "rawTranscriptStored",
    "rawProviderLogStored",
    "rawToolLogStored",
    "rawCommandLogStored",
    "rawDbRowsStored",
    "secretsStored",
    "hiddenReasoningStored",
  ]) {
    if (flag in value && value[flag] !== false) {
      throw new Error(`${label}_${flag}_not_false`);
    }
  }
}

async function main() {
  const proof = readJson(proofPath);
  if (proof.status !== "passed") {
    throw new Error("gateway_submit_oom_diagnostics_proof_not_passed");
  }
  if (proof.acceptedSubmit?.accepted !== true || !proof.acceptedSubmit?.runtimeJobId) {
    throw new Error("accepted_submit_did_not_create_runtime_job");
  }
  if (proof.rejectedSubmit?.accepted !== false) {
    throw new Error("rejected_submit_not_rejected");
  }
  if (proof.promptNotDirectHeapSource !== true) {
    throw new Error("prompt_byte_scale_not_proven");
  }
  if (proof.runtimePayloadArtifact?.storageKind !== "runtime-artifact-payload") {
    throw new Error("diagnostic_body_not_payload_backed");
  }
  if ((proof.acceptedSubmit?.manifest?.manifestJsonByteCount ?? 0) > 16 * 1024) {
    throw new Error("accepted_submit_manifest_overflow");
  }
  if ((proof.rejectedSubmit?.manifest?.manifestJsonByteCount ?? 0) > 16 * 1024) {
    throw new Error("rejected_submit_manifest_overflow");
  }
  for (const phase of [
    "workflow_summary_index_built",
    "conversation_context_built",
    "before_router_model_call",
    "after_router_model_call",
    "before_runtime_job_enqueue",
    "after_runtime_job_enqueue",
    "before_front_door_artifact_attachment",
    "after_front_door_artifact_attachment",
  ]) {
    if (!proof.acceptedSubmit.phaseNames.includes(phase)) {
      throw new Error(`accepted_submit_missing_phase:${phase}`);
    }
  }
  assertFalseFlags(proof, "proof");
  assertFalseFlags(proof.acceptedSubmit.manifest, "accepted_manifest");
  assertFalseFlags(proof.rejectedSubmit.manifest, "rejected_manifest");

  const evidence = writeArtifact("gateway-submit-oom-diagnostics-closeout.json", {
    artifactKind: "execution_platform.gateway_submit_oom_diagnostics_closeout",
    schemaVersion: "execution-platform.gateway-submit-oom-diagnostics-closeout.v1",
    workItemId,
    nextItemId,
    implementationSummary:
      "Added phase-based front-door submit diagnostics that preserve prompt visibility for routing while recording heap/RSS/external counters, request byte counts, provider/model refs, repair phases, runtime enqueue, and payload-backed diagnostic bodies. Accepted and rejected submits now return bounded manifests; accepted runtime jobs attach diagnostics as runtime-artifact-payload bodies rather than metadata blobs.",
    proofRef: "artifact://execution-platform/gateway-submit-oom-diagnostics/proof.json",
    proofHash: artifactHash(proofPath),
    acceptedSubmit: {
      runtimeJobId: proof.acceptedSubmit.runtimeJobId,
      phaseCount: proof.acceptedSubmit.manifest.phaseCount,
      promptByteLength: proof.acceptedSubmit.manifest.promptByteLength,
      maxWorkflowSummaryBytes: proof.acceptedSubmit.manifest.maxWorkflowSummaryBytes,
      maxConversationContextBytes: proof.acceptedSubmit.manifest.maxConversationContextBytes,
      maxRouterPayloadBytes: proof.acceptedSubmit.manifest.maxRouterPayloadBytes,
      maxHeapUsedBytes: proof.acceptedSubmit.manifest.maxHeapUsedBytes,
      largestHeapDeltaPhase: proof.acceptedSubmit.manifest.largestHeapDeltaPhase,
      manifestJsonByteCount: proof.acceptedSubmit.manifest.manifestJsonByteCount,
    },
    rejectedSubmitDiagnosticsReturned: true,
    payloadBackedDiagnostics: true,
    promptNotHiddenFromRouter: true,
    capRaised: false,
    deterministicSemanticJudgmentAdded: false,
    likelyOomAttribution:
      "Prompt byte size alone was proven KB-scale in the submit proof. A 4GB heap failure must be attributed by phase evidence to process state, workflow summary/router request construction, provider response handling, artifact/readback scans, runtime enqueue, or container memory pressure.",
    validationCommands: [
      {
        command:
          "pnpm test:file extensions/execution-platform/src/intent-routing/gateway-submit-diagnostics.test.ts extensions/execution-platform/src/intent-routing/native-execution-rpc.test.ts",
        result: "passed",
      },
      {
        command:
          "pnpm tsgo:fast extensions/execution-platform/src/intent-routing/gateway-submit-diagnostics.ts extensions/execution-platform/src/intent-routing/native-execution-rpc.ts extensions/execution-platform/src/codex-bridge/host-routes.ts src/gateway/execution-platform-http.ts",
        result: "passed",
      },
      {
        command: "pnpm exec tsx scripts/execution-platform-run-gateway-submit-oom-diagnostics.mjs",
        result: "passed",
      },
      {
        command:
          "git diff --check -- extensions/execution-platform/src/intent-routing/gateway-submit-diagnostics.ts extensions/execution-platform/src/intent-routing/gateway-submit-diagnostics.test.ts extensions/execution-platform/src/intent-routing/index.ts extensions/execution-platform/src/intent-routing/native-execution-rpc.ts extensions/execution-platform/src/intent-routing/native-execution-rpc.test.ts extensions/execution-platform/src/codex-bridge/host-routes.ts src/gateway/execution-platform-http.ts scripts/execution-platform-run-gateway-submit-oom-diagnostics.mjs scripts/execution-platform-record-gateway-submit-oom-diagnostics-closeout.mjs",
        result: "passed",
      },
    ],
    changedFileRefs,
    ...Object.fromEntries(
      [
        "rawPromptStored",
        "rawResponseStored",
        "rawTranscriptStored",
        "rawProviderLogStored",
        "rawToolLogStored",
        "rawCommandLogStored",
        "rawDbRowsStored",
        "secretsStored",
        "hiddenReasoningStored",
      ].map((flag) => [flag, false]),
    ),
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
      runtimeJobId: null,
      closeoutRef: evidence.ref,
      closeoutHash: evidence.sha256,
      validationRequired: true,
      validationRef: "validation://gateway-submit-oom-diagnostics/phase-manifest-payload-proof",
      sourceEditRequired: true,
      changedFileRefs,
      artifactRefs: [evidence.ref, "artifact://execution-platform/gateway-submit-oom-diagnostics/proof.json"],
      graphRef: "runtime-contract://execution-platform/gateway-submit-diagnostics/v1",
      ownerReadbackRef:
        "docs/projects/execution-platform/specs/runtime-artifact-payload-store-and-bounded-manifests.md#gateway-submit-oom-diagnostics",
      accepted: true,
      reasonCodes: [
        "gateway_submit_phase_diagnostics_live_wired",
        "accepted_and_rejected_submit_paths_instrumented",
        "diagnostic_body_payload_backed",
        "manifest_metadata_bounded",
        "prompt_not_hidden_from_router",
      ],
      rawPromptStored: false,
      rawResponseStored: false,
      rawTranscriptStored: false,
      rawLogsStored: false,
      rawDbRowsStored: false,
      authorityGranted: false,
      controlsApplied: false,
      runtimeLifecycleMutated: false,
      modelPromotionPerformed: false,
    });
  } finally {
    await runtime.pool.end();
  }

  process.stdout.write(
    `${JSON.stringify({
      status: "closed",
      workItemId,
      nextItemId,
      closeoutRef: evidence.ref,
      proofRef: "artifact://execution-platform/gateway-submit-oom-diagnostics/proof.json",
    })}\n`,
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      status: "failed",
      errorName: error?.name ?? "unknown_error",
      errorSummary: String(error?.message ?? error).slice(0, 1200),
    }),
  );
  process.exitCode = 1;
});
