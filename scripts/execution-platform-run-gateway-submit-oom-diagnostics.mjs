#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  RUNTIME_JOB_ARTIFACT_PAYLOAD_STORAGE_KIND,
  RuntimeJobRepository,
  NativeExecutionRpcService,
  applyExecutionPlatformMigrations,
  createBaseCanonicalRouterOutput,
  createCanonicalRouterAction,
  createExecutionPlatformPgMemTestDatabase,
  createFileGatewaySubmitDiagnosticsSink,
} from "../extensions/execution-platform/src/index.ts";

const ROOT = process.cwd();
const ARTIFACT_DIR = path.join(
  ROOT,
  ".artifacts/execution-platform/gateway-submit-oom-diagnostics",
);
const PROOF_PATH = path.join(ARTIFACT_DIR, "proof.json");

const safety = {
  rawPromptStored: false,
  rawResponseStored: false,
  rawProviderLogStored: false,
  rawToolLogStored: false,
  rawCommandLogStored: false,
  rawDbRowsStored: false,
  secretsStored: false,
  hiddenReasoningStored: false,
};

const middleLanePrompt = [
  "Implement a production-grade execution-platform improvement:",
  "add bounded gateway submit OOM diagnostics with phase-level heap counters,",
  "payload-backed diagnostic bodies, manifest-only metadata, router/provider phase attribution,",
  "and proof evidence showing a KB-scale prompt is not itself a 4GB heap source.",
  "Keep the router able to see the prompt; do not solve this by truncating or hiding the prompt.",
].join(" ");

function sha256(value) {
  return createHash("sha256").update(String(value ?? ""), "utf8").digest("hex");
}

function jsonBytes(value) {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function assertSafetyFlags(value, label) {
  for (const [key, expected] of Object.entries(safety)) {
    if (key in value && value[key] !== expected) {
      throw new Error(`${label}_${key}_not_false`);
    }
  }
}

async function walk(relativePath, out = []) {
  const absolute = path.join(ROOT, relativePath);
  let entries = [];
  try {
    entries = await fs.readdir(absolute, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const child = path.join(relativePath, entry.name);
    if (entry.isDirectory()) {
      if (!["node_modules", ".git", "dist", "build"].includes(entry.name)) {
        await walk(child, out);
      }
      continue;
    }
    if (entry.isFile()) {
      const stat = await fs.stat(path.join(ROOT, child));
      out.push({ path: child, bytes: stat.size });
    }
  }
  return out;
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function codingWorkflowRoute() {
  return createBaseCanonicalRouterOutput({
    route: "workflow_execution",
    responseMode: "create_runtime_job",
    executeNow: true,
    workflowId: "agent_team.coding",
    jobType: "executor.agent_team",
    confidence: 0.96,
    objectiveSummary: "Implement bounded gateway submit OOM diagnostics.",
    requestedActions: [
      createCanonicalRouterAction("code_edit", "add bounded diagnostic instrumentation", 0.96),
      createCanonicalRouterAction("test", "prove manifest and payload behavior", 0.96),
      createCanonicalRouterAction("review", "review phase attribution and raw-storage flags", 0.9),
      createCanonicalRouterAction("closeout", "record closeout evidence", 0.9),
    ],
    requestedAuthority: "local_yolo",
    sideEffectClass: "code_edit",
    riskClass: "medium",
  });
}

function fixedProvider(output) {
  const requests = [];
  return {
    requests,
    async route(request) {
      requests.push(request);
      return {
        output,
        providerRef: "fixture://gateway-submit-oom-diagnostics",
        modelCandidateId: "fixture-router-diagnostics",
        providerCallMade: false,
        reasonCodes: ["fixture_structured_router_submit_diagnostics"],
      };
    },
  };
}

function compactDiagnostics(result) {
  const manifest = result.frontDoorSubmitDiagnosticsManifest;
  return {
    statusCode: result.statusCode,
    accepted: result.accepted,
    runtimeJobId: result.runtimeJobId,
    reasonCodes: result.reasonCodes,
    phaseNames: result.frontDoorSubmitDiagnostics?.map((phase) => phase.phase) ?? [],
    manifest: manifest
      ? {
          status: manifest.status,
          phaseCount: manifest.phaseCount,
          promptByteLength: manifest.promptByteLength,
          promptSummaryBytes: manifest.promptSummaryBytes,
          bodyByteCount: manifest.bodyByteCount,
          manifestJsonByteCount: manifest.manifestJsonByteCount,
          maxHeapUsedBytes: manifest.maxHeapUsedBytes,
          maxRssBytes: manifest.maxRssBytes,
          maxExternalBytes: manifest.maxExternalBytes,
          maxWorkflowSummaryBytes: manifest.maxWorkflowSummaryBytes,
          maxConversationContextBytes: manifest.maxConversationContextBytes,
          maxRouterPayloadBytes: manifest.maxRouterPayloadBytes,
          largestHeapDeltaBytes: manifest.largestHeapDeltaBytes,
          largestHeapDeltaPhase: manifest.largestHeapDeltaPhase,
          bodyArtifactRef: manifest.bodyArtifactRef,
          manifestArtifactRef: manifest.manifestArtifactRef,
          reasonCodes: manifest.reasonCodes,
          rawPromptStored: manifest.rawPromptStored,
          rawResponseStored: manifest.rawResponseStored,
          rawProviderLogStored: manifest.rawProviderLogStored,
          rawToolLogStored: manifest.rawToolLogStored,
          rawCommandLogStored: manifest.rawCommandLogStored,
          rawDbRowsStored: manifest.rawDbRowsStored,
          secretsStored: manifest.secretsStored,
          hiddenReasoningStored: manifest.hiddenReasoningStored,
        }
      : null,
  };
}

async function main() {
  const generatedAt = new Date().toISOString();
  const db = await createExecutionPlatformPgMemTestDatabase();
  try {
    await applyExecutionPlatformMigrations(db.sql);
    const runtimeJobs = new RuntimeJobRepository(db.sql, { claimStrategy: "basic" });
    const provider = fixedProvider(codingWorkflowRoute());
    const rpc = new NativeExecutionRpcService({
      runtimeJobs,
      structuredRouterProvider: provider,
      submitDiagnosticsSink: createFileGatewaySubmitDiagnosticsSink({
        rootDir: ROOT,
        relativeArtifactRoot: ".artifacts/execution-platform/gateway-submit-oom-diagnostics/files",
      }),
    });

    const accepted = await rpc.submit({
      prompt: middleLanePrompt,
      auth: {
        actorId: "operator",
        authenticated: true,
        role: "operator",
        sessionId: "gateway-submit-oom-diagnostics-proof",
      },
      workItemId: "gateway-submit-oom-diagnostics-proof-work-item",
      sourceRoute: "terminal",
    });
    const rejected = await rpc.submit({
      prompt: "/compact bounded diagnostic command",
      auth: {
        actorId: "operator",
        authenticated: true,
        role: "operator",
        sessionId: "gateway-submit-oom-diagnostics-proof",
      },
      sourceRoute: "terminal",
    });

    const artifacts = await runtimeJobs.listArtifacts(accepted.runtimeJobId ?? "");
    const diagnosticsArtifact = artifacts.find(
      (artifact) => artifact.artifactType === "execution.front_door.submit_heap_diagnostics",
    );
    const hydratedDiagnostics = diagnosticsArtifact
      ? await runtimeJobs.hydrateJsonPayloadArtifact(diagnosticsArtifact)
      : null;
    const productSpecArtifacts = (await walk(".artifacts/execution-platform")).filter((entry) =>
      entry.path.includes("product-spec"),
    );

    if (!accepted.accepted || !accepted.runtimeJobId) {
      throw new Error("accepted_submit_not_accepted");
    }
    if (!accepted.frontDoorSubmitDiagnosticsManifest) {
      throw new Error("accepted_submit_missing_diagnostics_manifest");
    }
    if (
      accepted.frontDoorSubmitDiagnosticsManifest.promptByteLength !==
      Buffer.byteLength(middleLanePrompt, "utf8")
    ) {
      throw new Error("accepted_prompt_byte_length_mismatch");
    }
    if (accepted.frontDoorSubmitDiagnosticsManifest.manifestJsonByteCount > 16 * 1024) {
      throw new Error("accepted_diagnostics_manifest_overflow");
    }
    if (diagnosticsArtifact?.storageKind !== RUNTIME_JOB_ARTIFACT_PAYLOAD_STORAGE_KIND) {
      throw new Error("submit_diagnostics_not_payload_backed");
    }
    if (!hydratedDiagnostics?.body) {
      throw new Error("submit_diagnostics_payload_not_hydrated");
    }
    if (rejected.accepted !== false || !rejected.frontDoorSubmitDiagnosticsManifest) {
      throw new Error("rejected_submit_missing_diagnostics");
    }
    assertSafetyFlags(accepted.frontDoorSubmitDiagnosticsManifest, "accepted_manifest");
    assertSafetyFlags(rejected.frontDoorSubmitDiagnosticsManifest, "rejected_manifest");

    const proof = {
      artifactKind: "execution_platform.gateway_submit_oom_diagnostics_proof",
      schemaVersion: "execution-platform.gateway-submit-oom-diagnostics-proof.v1",
      status: "passed",
      generatedAt,
      workItemId: "openclaw-convergence.gateway-submit-oom-diagnostics-memory-guard",
      acceptedSubmit: compactDiagnostics(accepted),
      rejectedSubmit: compactDiagnostics(rejected),
      runtimePayloadArtifact: {
        artifactType: diagnosticsArtifact?.artifactType ?? null,
        storageKind: diagnosticsArtifact?.storageKind ?? null,
        sizeBytes: diagnosticsArtifact?.sizeBytes ?? null,
        sha256: diagnosticsArtifact?.sha256 ?? null,
        hydratedBodyArtifactKind:
          hydratedDiagnostics?.body && typeof hydratedDiagnostics.body === "object"
            ? hydratedDiagnostics.body.artifactKind
            : null,
      },
      routerProviderRequestCount: provider.requests.length,
      routerRequestByteCounts: provider.requests.map((request) => jsonBytes(request)),
      promptNotDirectHeapSource:
        (accepted.frontDoorSubmitDiagnosticsManifest.promptByteLength ?? 0) < 16 * 1024,
      oomAttributionRequiresPhaseEvidence: true,
      artifactVolumeContext: {
        productSpecArtifactCount: productSpecArtifacts.length,
        productSpecArtifactBytes: productSpecArtifacts.reduce((sum, entry) => sum + entry.bytes, 0),
        largestProductSpecArtifacts: productSpecArtifacts
          .toSorted((left, right) => right.bytes - left.bytes)
          .slice(0, 10),
      },
      conclusion:
        "Submit diagnostics now distinguish prompt bytes, workflow summary bytes, conversation context bytes, router payload bytes, provider/router phases, runtime enqueue, artifact attachment, and process heap counters. This does not hide the prompt from the router and does not raise caps.",
      ...safety,
    };
    await writeJson(PROOF_PATH, proof);
    console.log(
      JSON.stringify(
        {
          status: proof.status,
          proofPath: ".artifacts/execution-platform/gateway-submit-oom-diagnostics/proof.json",
          acceptedPhaseCount: proof.acceptedSubmit.manifest.phaseCount,
          promptByteLength: proof.acceptedSubmit.manifest.promptByteLength,
          maxRouterPayloadBytes: proof.acceptedSubmit.manifest.maxRouterPayloadBytes,
          maxHeapUsedBytes: proof.acceptedSubmit.manifest.maxHeapUsedBytes,
          diagnosticsStorageKind: proof.runtimePayloadArtifact.storageKind,
        },
        null,
        2,
      ),
    );
  } finally {
    await db.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
