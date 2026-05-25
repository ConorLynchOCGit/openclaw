#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactRoot = path.join(root, ".artifacts/execution-platform");
const diagnosticDir = path.join(artifactRoot, "mission-ledger-stability-diagnostics");
const defaultPromptFile = path.join(
  root,
  "docs/projects/execution-platform/prompts/product-spec-planning-workflow-plugin-production-proof-openclaw.md",
);
const checkpointScript = path.join(
  root,
  "scripts/execution-platform-run-product-spec-checkpointed-test.mjs",
);
const stopAfterGate = "commitment_work_packets";
const maxRuntimeMs = Number(process.env.OPENCLAW_MISSION_LEDGER_STABILITY_MAX_MS ?? 45 * 60_000);

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function readJsonIfExists(filePath) {
  if (!existsSync(filePath)) {
    return null;
  }
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function removeStaleCheckpointOutputs() {
  const names = [
    "product-spec-checkpointed-test-submit-start.json",
    "product-spec-checkpointed-test-submit-result.json",
    "product-spec-submit-latency-diagnostics.json",
    "product-spec-checkpointed-test-preflight.json",
    "product-spec-checkpointed-test-runtime-config.json",
    "product-spec-checkpointed-test-latest.json",
    "latest-run-state.json",
    "product-spec-checkpointed-test-summary.json",
    "product-spec-checkpointed-test-artifact-index.json",
    "product-spec-commitment-packet-failure-diagnostics.json",
    "product-spec-proof-follow-up-fix-list.json",
  ];
  await Promise.all(names.map((name) => rm(path.join(artifactRoot, name), { force: true })));
}

async function copyCheckpointArtifacts(label) {
  const copied = [];
  const names = [
    "product-spec-checkpointed-test-preflight.json",
    "product-spec-checkpointed-test-runtime-config.json",
    "product-spec-checkpointed-test-submit-result.json",
    "product-spec-submit-latency-diagnostics.json",
    "product-spec-checkpointed-test-latest.json",
    "latest-run-state.json",
    "product-spec-checkpointed-test-summary.json",
    "product-spec-commitment-packet-failure-diagnostics.json",
    "product-spec-proof-follow-up-fix-list.json",
  ];
  for (const name of names) {
    const source = path.join(artifactRoot, name);
    if (!existsSync(source)) {
      continue;
    }
    const target = path.join(diagnosticDir, `${label}-${name}`);
    await copyFile(source, target);
    copied.push(
      `.artifacts/execution-platform/mission-ledger-stability-diagnostics/${label}-${name}`,
    );
  }
  return copied;
}

function gateEvidence(summary, gateId) {
  return summary?.finalSnapshot?.checkpoints?.gates?.find((gate) => gate.gateId === gateId)
    ?.evidence;
}

function phaseWallClockMap(summary) {
  const map = {};
  for (const phase of summary?.phaseWallClock ?? []) {
    if (typeof phase?.phase === "string" && typeof phase?.wallMs === "number") {
      map[phase.phase] = phase.wallMs;
    }
  }
  return map;
}

function modelUsage(summary) {
  return (summary?.modelTokenBurnByModel?.byModel ?? []).map((entry) => ({
    phase: Array.isArray(entry.phases) ? entry.phases.slice(0, 8).join(",") : "unknown",
    modelRef: typeof entry.modelRef === "string" ? entry.modelRef : null,
    providerPath: null,
    inputTokens: typeof entry.inputTokens === "number" ? entry.inputTokens : null,
    outputTokens: typeof entry.outputTokens === "number" ? entry.outputTokens : null,
    totalTokens: typeof entry.totalTokens === "number" ? entry.totalTokens : null,
    estimated: entry.usageKind === "estimated",
  }));
}

function runtimeBoundaryFromSummary(summary) {
  const reasonCodes = [
    ...(summary?.runError ? ["checkpoint_runner_error"] : []),
    ...(summary?.submit?.accepted ? [] : ["checkpoint_submit_not_accepted"]),
    ...(summary?.finalSnapshot?.checkpoints?.hardFailures ?? []),
  ];
  return {
    artifactKind: "runtime_boundary_variance_diagnostic",
    promptResolverStable: true,
    promptHashMismatch: false,
    missionLedgerMissing: !gateEvidence(summary, "mission_ledger"),
    packetManifestMissing: !gateEvidence(summary, "commitment_work_packets"),
    artifactContractFailure: reasonCodes.some((code) => String(code).includes("artifact")),
    lifecycleClassificationFailure: reasonCodes.some((code) => String(code).includes("lifecycle")),
    schemaNormalizationMismatch: reasonCodes.some((code) =>
      String(code).includes("schema_normalization"),
    ),
    runtimePreflightBlocked: reasonCodes.some((code) => String(code).includes("preflight")),
    reasonCodes,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

async function runCheckpoint(label, promptFile) {
  await removeStaleCheckpointOutputs();
  const startedAt = new Date().toISOString();
  const childEnv = {
    ...process.env,
    OPENCLAW_PRODUCT_SPEC_STOP_AFTER_GATE: stopAfterGate,
    OPENCLAW_PRODUCT_SPEC_CHECKPOINT_MAX_MS: String(maxRuntimeMs),
  };
  const child = spawn(process.execPath, [checkpointScript, "--prompt-file", promptFile], {
    cwd: root,
    env: childEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => process.stdout.write(`[${label}] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[${label}:stderr] ${chunk}`));
  const exitCode = await new Promise((resolve) => {
    child.on("exit", (code) => resolve(code ?? 1));
  });
  const completedAt = new Date().toISOString();
  const summaryPath = path.join(artifactRoot, "product-spec-checkpointed-test-summary.json");
  const packetDiagnosticsPath = path.join(
    artifactRoot,
    "product-spec-commitment-packet-failure-diagnostics.json",
  );
  const summary = await readJsonIfExists(summaryPath);
  const packetDiagnostics = await readJsonIfExists(packetDiagnosticsPath);
  const copiedArtifactRefs = await copyCheckpointArtifacts(label);
  return {
    label,
    exitCode,
    startedAt,
    completedAt,
    summary,
    packetDiagnostics,
    copiedArtifactRefs,
  };
}

function buildRun(input) {
  const missionLedger = summarizeMissionLedgerCheckpointEvidenceForStability(
    gateEvidence(input.summary, "mission_ledger"),
  );
  const commitmentPackets = summarizeCommitmentPacketCheckpointEvidenceForStability({
    evidence: gateEvidence(input.summary, "commitment_work_packets"),
    packetDiagnostics: input.packetDiagnostics,
  });
  return {
    artifactKind: "mission_ledger_stability_diagnostic_run",
    schemaVersion: MISSION_LEDGER_STABILITY_DIAGNOSTIC_SCHEMA_VERSION,
    runLabel: input.label,
    runId: `mission-ledger-stability-${input.label}-${Date.now().toString(36)}`,
    runtimeJobId: input.summary?.submit?.runtimeJobId ?? null,
    workItemId: input.summary?.submit?.workItemId ?? null,
    prompt: input.prompt,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    phaseWallClockMs: phaseWallClockMap(input.summary),
    modelUsage: modelUsage(input.summary),
    missionLedger,
    commitmentPackets,
    providerVariance: summarizeProviderVariance([commitmentPackets]),
    runtimeBoundary: runtimeBoundaryFromSummary(input.summary),
    artifactRefs: input.copiedArtifactRefs,
    reasonCodes: [
      ...(input.exitCode === 0 ? [] : [`checkpoint_exit_code:${input.exitCode}`]),
      ...(input.summary?.status ? [`checkpoint_status:${input.summary.status}`] : []),
    ],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
  };
}

const {
  MISSION_LEDGER_STABILITY_DIAGNOSTIC_SCHEMA_VERSION,
  buildMissionLedgerStabilityDiagnosticPair,
  missionLedgerStabilityDiagnosticMetadata,
  summarizeCommitmentPacketCheckpointEvidenceForStability,
  summarizeMissionLedgerCheckpointEvidenceForStability,
  summarizeProviderVariance,
} = await tsImport(
  path.join(
    root,
    "extensions/execution-platform/src/workflows/mission-ledger-stability-diagnostics.ts",
  ),
  import.meta.url,
);

const promptFile = path.resolve(argValue("--prompt-file") ?? defaultPromptFile);
const prompt = await readFile(promptFile, "utf8");
const promptStat = await stat(promptFile);
const promptDescriptor = {
  promptPath: path.relative(root, promptFile),
  promptHash: sha256(prompt),
  promptLength: Buffer.byteLength(prompt, "utf8"),
  promptModifiedAt: promptStat.mtime.toISOString(),
  rawPromptStored: false,
};

await mkdir(diagnosticDir, { recursive: true });
const runAResult = await runCheckpoint("run-a", promptFile);
const runA = buildRun({ ...runAResult, prompt: promptDescriptor });
await writeJson(path.join(diagnosticDir, "run-a-diagnostic.json"), runA);

const runBResult = await runCheckpoint("run-b", promptFile);
const runB = buildRun({ ...runBResult, prompt: promptDescriptor });
await writeJson(path.join(diagnosticDir, "run-b-diagnostic.json"), runB);

const pair = buildMissionLedgerStabilityDiagnosticPair({
  pairId: `mission-ledger-stability-${promptDescriptor.promptHash.slice(0, 12)}-${Date.now().toString(36)}`,
  runA,
  runB,
});
const proof = {
  artifactKind: "mission_ledger_stability_diagnostics_proof",
  schemaVersion: MISSION_LEDGER_STABILITY_DIAGNOSTIC_SCHEMA_VERSION,
  generatedAt: new Date().toISOString(),
  prompt: promptDescriptor,
  diagnosticPair: pair,
  manifest: missionLedgerStabilityDiagnosticMetadata(pair),
  proofStatus: pair.verdict.safeToRunProductSpecProof ? "passed" : "needs_review",
  nextRecommendedAction: pair.verdict.safeToRunProductSpecProof
    ? "Proceed to Product/Spec Planning production proof with provider-variance notes visible."
    : "Repair the Mission Ledger or packet authoring boundary before the Product/Spec proof.",
  rawPromptStored: false,
  rawResponseStored: false,
  rawProviderLogStored: false,
  rawToolLogStored: false,
  rawCommandLogStored: false,
  rawDbRowsStored: false,
  secretsStored: false,
};

await writeJson(path.join(diagnosticDir, "diagnostic-pair.json"), pair);
await writeJson(path.join(diagnosticDir, "verdict.json"), pair.verdict);
await writeJson(path.join(diagnosticDir, "proof.json"), proof);

console.log(JSON.stringify(proof, null, 2));
if (!pair.verdict.safeToRunProductSpecProof) {
  process.exitCode = 1;
}
