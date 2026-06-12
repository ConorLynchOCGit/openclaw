#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import JSON5 from "json5";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const {
  buildAgentTeamCodingWorkflowPlugin,
  CodexDynamicJsonClient,
  DEFAULT_DYNAMIC_ORCHESTRATOR_MODEL_REF,
  DEFAULT_DYNAMIC_ORCHESTRATOR_PROVIDER_PATH,
  BoundaryReplayService,
  BOUNDARY_REPLAY_CHECKPOINT_KINDS,
  boundaryReplayBoundaryIsDiagnosticOnly,
  boundaryReplayCheckpointKindForCliAlias,
  buildProductSpecProofRunManifest,
  assertProductSpecProofRunManifestBounds,
  applyMissionCommitmentEvaluation,
  openBlockingMissionCommitments,
  parseMissionCommitmentEvaluation,
  requireCanonicalWorkflowDefinition,
  RuntimeWorkGraphScheduler,
  isRuntimeArtifactPayloadRequired,
  REQUIREMENT_MAP_ARTIFACT_TYPE,
  RequirementMapSchema,
  resetNodeForFreshAttempt,
  summarizeMissionContractLedger,
  PRODUCT_SPEC_RUNTIME_BOUNDARY_REPLAY_PROOF_SOURCE,
  createOpenRouterProviderTextTurnClient,
} = await tsImport(
  path.join(root, "extensions/execution-platform/runtime-api.ts"),
  import.meta.url,
);
const {
  createGatewayNodeAgentProfileResolver,
  createGatewayRoleModelClient,
  createOpenClawNodeSessionExecutor,
} = await tsImport(
  path.join(root, "src/gateway/execution-platform-agent-team-runner.ts"),
  import.meta.url,
);
const { buildNodeExecutionSnapshotFromGraphNode } = await tsImport(
  path.join(root, "extensions/execution-platform/src/workflows/node-agent-session.ts"),
  import.meta.url,
);
const { executeSchedulerStageNativeTool, executeSchedulerStageNativeToolBatch } = await tsImport(
  path.join(root, "extensions/execution-platform/src/workflows/scheduler-stage-runner.ts"),
  import.meta.url,
);
const { loadConfig, setRuntimeConfigSnapshot } = await tsImport(
  path.join(root, "src/config/config.ts"),
  import.meta.url,
);
const { resolveConfigPath } = await tsImport(
  path.join(root, "src/config/paths.ts"),
  import.meta.url,
);
const { getExecutionPlatformRuntime } = await tsImport(
  path.join(root, "src/gateway/execution-platform-http.ts"),
  import.meta.url,
);

const ARTIFACT_DIR = ".artifacts/execution-platform";
const WORKER_EXECUTION_PROOF_DIR = path.join(
  ARTIFACT_DIR,
  "product-spec-replay-proof-worker-execution",
);
const PROOF_RUNS_DIR = path.join(ARTIFACT_DIR, "proof-runs");
const PRODUCT_SPEC_CODING_EXECUTOR_PROOF_ROUTE = Object.freeze({
  proofFamily: "coding_executor_target_subject",
  executorWorkflowId: "agent_team.coding",
  subjectWorkflowIds: ["agent_team.product_spec_planning"],
  targetSubjectRefs: [
    {
      targetKind: "workflow",
      targetRef: "workflow://agent_team.product_spec_planning",
      confidence: 0.96,
    },
  ],
  requestedCapabilities: ["code_edit", "test", "docs_update", "review", "closeout"],
});
const REPLAY_TERMINAL_STATUSES = new Set([
  "aborted",
  "canceled",
  "cancelled",
  "completed",
  "failed",
  "needs_review",
  "succeeded",
]);
let replayRuntimeShutdown = null;
let currentProofRunId = null;
let latestReplayState = null;
let replayTerminalArtifactWritten = false;
let replayShutdownStarted = false;

function sha256(value) {
  return crypto
    .createHash("sha256")
    .update(String(value ?? ""), "utf8")
    .digest("hex");
}

async function loadEnvFile(filePath) {
  const text = await fs.readFile(filePath, "utf8").catch(() => "");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const index = trimmed.indexOf("=");
    if (index === -1) {
      continue;
    }
    const key = trimmed.slice(0, index).trim();
    if (!process.env[key]) {
      process.env[key] = trimmed
        .slice(index + 1)
        .trim()
        .replace(/^['"]|['"]$/g, "");
    }
  }
}

function isRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

async function loadSourceBackedReplayConfig() {
  const configPath = resolveConfigPath(process.env);
  try {
    const parsed = JSON5.parse(await fs.readFile(configPath, "utf8"));
    if (!isRecord(parsed) || Object.hasOwn(parsed, "$include")) {
      return loadConfig();
    }
    setRuntimeConfigSnapshot(parsed, parsed);
    return parsed;
  } catch {
    return loadConfig();
  }
}

function stringArray(value, fallback = []) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim())
    : fallback;
}

function jsonRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

async function writeJson(name, value) {
  if (
    name === "product-spec-boundary-replay-result.json" ||
    name === "product-spec-boundary-replay-error.json"
  ) {
    replayTerminalArtifactWritten = true;
  }
  await fs.mkdir(ARTIFACT_DIR, { recursive: true });
  const target = path.join(ARTIFACT_DIR, name);
  const bodyValue =
    currentProofRunId && name.startsWith("product-spec-")
      ? {
          proofRunId: currentProofRunId,
          proofRunManifestRef: `.artifacts/execution-platform/proof-runs/${currentProofRunId}/manifest.json`,
          ...value,
        }
      : value;
  const body = `${JSON.stringify(bodyValue, null, 2)}\n`;
  await fs.writeFile(target, body, "utf8");
  if (currentProofRunId && name.startsWith("product-spec-")) {
    const runTarget = path.join(PROOF_RUNS_DIR, currentProofRunId, name);
    await fs.mkdir(path.dirname(runTarget), { recursive: true });
    await fs.writeFile(runTarget, body, "utf8");
    return {
      path: `.artifacts/execution-platform/proof-runs/${currentProofRunId}/${name}`,
      sha256: sha256(body),
      bytes: Buffer.byteLength(body, "utf8"),
      sharedPath: target,
    };
  }
  return {
    path: target,
    sha256: sha256(body),
    bytes: Buffer.byteLength(body, "utf8"),
  };
}

async function writeProofJson(name, value) {
  await fs.mkdir(WORKER_EXECUTION_PROOF_DIR, { recursive: true });
  const target = path.join(WORKER_EXECUTION_PROOF_DIR, name);
  const bodyValue = currentProofRunId
    ? {
        proofRunId: currentProofRunId,
        proofRunManifestRef: `.artifacts/execution-platform/proof-runs/${currentProofRunId}/manifest.json`,
        ...value,
      }
    : value;
  const body = `${JSON.stringify(bodyValue, null, 2)}\n`;
  await fs.writeFile(target, body, "utf8");
  if (currentProofRunId) {
    const runName = name === "proof.json" ? "worker-execution-proof.json" : name;
    const runTarget = path.join(PROOF_RUNS_DIR, currentProofRunId, runName);
    await fs.mkdir(path.dirname(runTarget), { recursive: true });
    await fs.writeFile(runTarget, body, "utf8");
    return {
      path: `.artifacts/execution-platform/proof-runs/${currentProofRunId}/${runName}`,
      sha256: sha256(body),
      bytes: Buffer.byteLength(body, "utf8"),
      sharedPath: target,
    };
  }
  return {
    path: target,
    sha256: sha256(body),
    bytes: Buffer.byteLength(body, "utf8"),
  };
}

async function emitReplayState({
  runtime,
  runtimeJobId,
  event,
  graphId,
  boundary,
  phase,
  status,
  details = {},
}) {
  const generatedAt = new Date().toISOString();
  const safeEvent =
    String(event ?? "event")
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/gu, "-")
      .replace(/^-+|-+$/gu, "")
      .slice(0, 80) || "event";
  const payload = {
    artifactKind: "product_spec_boundary_replay_live_state",
    generatedAt,
    event: safeEvent,
    runtimeJobId,
    graphId: graphId ?? null,
    boundary: boundary ?? null,
    phase: phase ?? null,
    status: status ?? null,
    processPid: process.pid,
    details,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
  latestReplayState = payload;
  await writeJson("product-spec-boundary-replay-live-state.json", payload);
  await writeJson(`latest-run-state-${runtimeJobId ?? "unknown"}.json`, {
    artifactKind: "execution_platform_latest_run_state",
    schemaVersion: "execution-platform.latest-run-state.v1",
    generatedAt,
    runtimeJobId: runtimeJobId ?? null,
    graphId: graphId ?? null,
    currentPhase: phase ?? null,
    currentReplayBoundary: boundary ?? null,
    status: status ?? null,
    processPid: process.pid,
    activeNodeIds: Array.isArray(details.activeNodeIds)
      ? details.activeNodeIds.filter((value) => typeof value === "string").slice(0, 40)
      : typeof details.nodeId === "string"
        ? [details.nodeId]
        : [],
    activeRoleOrModel: details.roleId ?? details.modelRef ?? details.providerPath ?? null,
    activeToolEventKind: safeEvent,
    payloadRefs: Array.isArray(details.payloadRefs)
      ? details.payloadRefs.filter((value) => typeof value === "string").slice(0, 80)
      : [],
    manifestRefs: Array.isArray(details.manifestRefs)
      ? details.manifestRefs.filter((value) => typeof value === "string").slice(0, 80)
      : [],
    readinessStatus: details.nodeLifecycleProjectionStatus ?? details.readinessStatus ?? null,
    blockers: Array.isArray(details.blockers)
      ? details.blockers.filter((value) => typeof value === "string").slice(0, 40)
      : typeof details.blockerSummary === "string"
        ? [details.blockerSummary]
        : [],
    nextLegalTransition: details.nextLegalTransition ?? details.nextDecisionNeeded ?? null,
    wallTimeByPhase: details.wallTimeByPhase ?? {},
    tokenUsageByPhaseAndModel: details.tokenUsageByPhaseAndModel ?? {},
    tokenUsageEstimateOnly: details.tokenUsageEstimateOnly === true,
    latestTerminalEvent: isTerminalReplayStatus(status) ? safeEvent : null,
    proofGateStatus: details.proofGateStatus ?? null,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    secretsStored: false,
  });
  await writeJson(`product-spec-boundary-replay-state-${Date.now()}-${safeEvent}.json`, payload);
  if (runtime && runtimeJobId) {
    await runtime.runtimeJobs.attachArtifact({
      jobId: runtimeJobId,
      artifactType: "execution_platform.product_spec_boundary_replay_live_state",
      storageKind: "metadata",
      uri: `runtime-job://${runtimeJobId}/product-spec-boundary-replay/live-state/${Date.now()}-${safeEvent}`,
      contentType: "application/json",
      metadata: payload,
    });
  }
  process.stdout.write(
    `${JSON.stringify({ event: "product_spec_boundary_replay_live_state", ...payload })}\n`,
  );
  return payload;
}

function isTerminalReplayStatus(status) {
  return REPLAY_TERMINAL_STATUSES.has(String(status ?? ""));
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

async function writeJsonFile(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readPositiveInteger(value) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function readReplayProcessPid(state) {
  if (!isRecord(state)) {
    return null;
  }
  const directPid = readPositiveInteger(state.processPid);
  if (directPid) {
    return directPid;
  }
  const details = jsonRecord(state.details);
  return readPositiveInteger(details.processPid);
}

function processPidIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function activeNodeIdsFromState(liveState, latestState) {
  const latestActiveNodeIds = Array.isArray(latestState?.activeNodeIds)
    ? latestState.activeNodeIds
    : [];
  const liveDetails = jsonRecord(liveState?.details);
  const detailsActiveNodeIds = Array.isArray(liveDetails.activeNodeIds)
    ? liveDetails.activeNodeIds
    : typeof liveDetails.nodeId === "string"
      ? [liveDetails.nodeId]
      : [];
  return [...latestActiveNodeIds, ...detailsActiveNodeIds]
    .filter((value) => typeof value === "string" && value.trim())
    .map((value) => value.trim())
    .slice(0, 40);
}

async function terminalizeStaleReplayLiveState({
  runtimeJobId,
  allowLegacyNoPid = false,
  reason = "startup_preflight",
} = {}) {
  const sharedLiveStatePath = path.join(
    ARTIFACT_DIR,
    "product-spec-boundary-replay-live-state.json",
  );
  const latestRunStatePath = path.join(
    ARTIFACT_DIR,
    `latest-run-state-${runtimeJobId ?? "unknown"}.json`,
  );
  const liveState = await readJsonIfExists(sharedLiveStatePath);
  const latestRunState = await readJsonIfExists(latestRunStatePath);
  const candidateState =
    isRecord(liveState) && liveState.runtimeJobId === runtimeJobId
      ? liveState
      : isRecord(latestRunState) && latestRunState.runtimeJobId === runtimeJobId
        ? latestRunState
        : null;
  if (!candidateState || String(candidateState.status ?? "") !== "running") {
    return { status: "no_stale_running_state" };
  }
  const previousProcessPid = readReplayProcessPid(candidateState);
  if (
    previousProcessPid &&
    previousProcessPid !== process.pid &&
    processPidIsAlive(previousProcessPid)
  ) {
    return {
      status: "running_process_alive",
      previousProcessPid,
    };
  }
  if (!previousProcessPid && !allowLegacyNoPid) {
    return {
      status: "legacy_running_state_without_process_pid",
      reasonCodes: ["boundary_replay_running_state_missing_process_pid"],
    };
  }

  const generatedAt = new Date().toISOString();
  const previousProofRunId =
    typeof liveState?.proofRunId === "string" && liveState.proofRunId.trim()
      ? liveState.proofRunId.trim()
      : null;
  const previousProofRunManifestRef =
    typeof liveState?.proofRunManifestRef === "string" && liveState.proofRunManifestRef.trim()
      ? liveState.proofRunManifestRef.trim()
      : previousProofRunId
        ? `.artifacts/execution-platform/proof-runs/${previousProofRunId}/manifest.json`
        : null;
  const graphId =
    typeof liveState?.graphId === "string"
      ? liveState.graphId
      : typeof latestRunState?.graphId === "string"
        ? latestRunState.graphId
        : null;
  const boundary =
    typeof liveState?.boundary === "string"
      ? liveState.boundary
      : typeof latestRunState?.currentReplayBoundary === "string"
        ? latestRunState.currentReplayBoundary
        : null;
  const phase =
    typeof liveState?.phase === "string"
      ? liveState.phase
      : typeof latestRunState?.currentPhase === "string"
        ? latestRunState.currentPhase
        : null;
  const reasonCodes = [
    previousProcessPid
      ? "boundary_replay_stale_running_process_missing"
      : "boundary_replay_legacy_running_state_without_process_pid_terminalized",
    `boundary_replay_stale_state_clear_reason:${reason}`,
  ];
  const terminalEvent = "boundary_replay_stale_running_state_terminalized";
  const previousStateSummary = {
    event:
      typeof liveState?.event === "string"
        ? liveState.event
        : typeof latestRunState?.activeToolEventKind === "string"
          ? latestRunState.activeToolEventKind
          : null,
    status: candidateState.status ?? null,
    generatedAt: typeof candidateState.generatedAt === "string" ? candidateState.generatedAt : null,
    processPid: previousProcessPid,
  };
  const terminalLiveState = {
    ...(previousProofRunId ? { proofRunId: previousProofRunId } : {}),
    ...(previousProofRunManifestRef ? { proofRunManifestRef: previousProofRunManifestRef } : {}),
    artifactKind: "product_spec_boundary_replay_live_state",
    generatedAt,
    event: terminalEvent,
    runtimeJobId,
    graphId,
    boundary,
    phase,
    status: "aborted",
    processPid: process.pid,
    details: {
      ...jsonRecord(liveState?.details),
      previousReplayState: previousStateSummary,
      terminalizedByProcessPid: process.pid,
      reasonCodes,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    },
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
  const terminalLatestRunState = {
    ...jsonRecord(latestRunState),
    artifactKind: "execution_platform_latest_run_state",
    schemaVersion: "execution-platform.latest-run-state.v1",
    generatedAt,
    runtimeJobId,
    graphId,
    currentPhase: phase,
    currentReplayBoundary: boundary,
    status: "aborted",
    processPid: process.pid,
    activeNodeIds: activeNodeIdsFromState(liveState, latestRunState),
    activeToolEventKind: terminalEvent,
    latestTerminalEvent: terminalEvent,
    blockers: [
      "stale running boundary replay terminalized before next proof",
      ...(Array.isArray(latestRunState?.blockers)
        ? latestRunState.blockers.filter((value) => typeof value === "string")
        : []),
    ].slice(0, 40),
    reasonCodes,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    secretsStored: false,
  };
  const terminalError = {
    ...(previousProofRunId ? { proofRunId: previousProofRunId } : {}),
    ...(previousProofRunManifestRef ? { proofRunManifestRef: previousProofRunManifestRef } : {}),
    artifactKind: "product_spec_boundary_replay_error",
    proofSourceKind: PRODUCT_SPEC_RUNTIME_BOUNDARY_REPLAY_PROOF_SOURCE,
    generatedAt,
    status: "aborted",
    errorName: "StaleReplayRunningStateTerminalized",
    errorMessageHash: sha256("stale boundary replay running state terminalized"),
    errorSummary:
      "A previous boundary replay live-state was still running, but no live replay process was available for that state. It was terminalized before the next proof.",
    previousReplayState: previousStateSummary,
    reasonCodes,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };

  await writeJsonFile(sharedLiveStatePath, terminalLiveState);
  await writeJsonFile(latestRunStatePath, terminalLatestRunState);
  await writeJsonFile(
    path.join(ARTIFACT_DIR, "product-spec-boundary-replay-error.json"),
    terminalError,
  );
  if (previousProofRunId) {
    const proofRunDir = path.join(PROOF_RUNS_DIR, previousProofRunId);
    await writeJsonFile(
      path.join(proofRunDir, "product-spec-boundary-replay-live-state.json"),
      terminalLiveState,
    );
    await writeJsonFile(
      path.join(proofRunDir, "product-spec-boundary-replay-error.json"),
      terminalError,
    );
  }
  return {
    status: "terminalized",
    runtimeJobId,
    proofRunId: previousProofRunId,
    previousProcessPid,
    reasonCodes,
  };
}

async function finalizeReplayProcessIfRunning() {
  if (replayTerminalArtifactWritten) {
    return;
  }
  if (!latestReplayState || isTerminalReplayStatus(latestReplayState.status)) {
    return;
  }
  const reasonCodes = ["boundary_replay_process_exited_without_terminal_state"];
  const summary = {
    artifactKind: "product_spec_boundary_replay_error",
    proofSourceKind: PRODUCT_SPEC_RUNTIME_BOUNDARY_REPLAY_PROOF_SOURCE,
    generatedAt: new Date().toISOString(),
    errorName: "ReplayProcessExitedWithoutTerminalState",
    errorMessageHash: sha256("replay process exited before writing terminal result"),
    errorSummary:
      "Replay process exited before writing product-spec-boundary-replay-result.json or product-spec-boundary-replay-error.json.",
    previousReplayState: {
      event: latestReplayState.event ?? null,
      runtimeJobId: latestReplayState.runtimeJobId ?? null,
      graphId: latestReplayState.graphId ?? null,
      boundary: latestReplayState.boundary ?? null,
      phase: latestReplayState.phase ?? null,
      status: latestReplayState.status ?? null,
    },
    reasonCodes,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
  await emitReplayState({
    runtime: null,
    runtimeJobId: latestReplayState.runtimeJobId,
    event: "boundary_replay_process_exited_without_terminal_state",
    graphId: latestReplayState.graphId,
    boundary: latestReplayState.boundary,
    phase: latestReplayState.phase,
    status: "failed",
    details: {
      previousEvent: latestReplayState.event ?? null,
      previousStatus: latestReplayState.status ?? null,
      reasonCodes,
    },
  });
  await writeJson("product-spec-boundary-replay-error.json", summary);
  process.exitCode = process.exitCode || 1;
}

async function shutdownReplayProcess() {
  if (replayShutdownStarted) {
    return;
  }
  replayShutdownStarted = true;
  await finalizeReplayProcessIfRunning();
  if (replayRuntimeShutdown) {
    await replayRuntimeShutdown();
  }
}

function installReplaySignalTerminalizers() {
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => {
      void shutdownReplayProcess()
        .catch((error) => {
          process.stderr.write(
            `${JSON.stringify({
              event: "product_spec_boundary_replay_shutdown_error",
              signal,
              errorName: error?.name ?? "unknown_error",
              errorMessageHash: sha256(error?.message ?? String(error)),
            })}\n`,
          );
        })
        .finally(() => {
          process.exit(1);
        });
    });
  }
}

async function recordCanonicalBoundaryReplayCheckpoint({
  runtime,
  runtimeJobId,
  graphId,
  workflowId,
  checkpointKind,
  acceptedArtifactRefs = [],
  upstreamArtifactRefs = [],
  currentNodeIds = [],
  currentCommitmentIds = [],
  replayContinuationMode = "continue_scheduler",
  replayStartPolicy = "allowed_from_checkpoint",
  replaySafetyStatus = "safe_to_replay",
  reasonCodes = [],
}) {
  const runtimeJob = await runtime.runtimeJobs.getJob(runtimeJobId).catch(() => null);
  if (!runtimeJob) {
    return null;
  }
  const service = new BoundaryReplayService({
    runtimeJobs: runtime.runtimeJobs,
    runtimeWorkGraphs: runtime.runtimeWorkGraphs,
  });
  const recorded = await service.recordRuntimeCheckpoint({
    runtimeJob,
    graphId,
    workflowId,
    checkpointKind,
    upstreamArtifactRefs,
    acceptedArtifactRefs,
    currentNodeIds,
    currentCommitmentIds,
    openCommitmentIds: currentCommitmentIds,
    replayContinuationMode,
    replayStartPolicy,
    replaySafetyStatus,
    reasonCodes: ["product_spec_boundary_replay_harness_checkpoint_recorded", ...reasonCodes],
  });
  await emitReplayState({
    runtime,
    runtimeJobId,
    event: "boundary_replay_checkpoint_recorded",
    graphId,
    boundary: checkpointKind,
    phase: checkpointKind,
    status: "completed",
    details: {
      checkpointKind,
      checkpointRef: recorded.artifactRef,
      graphCheckpointRef: recorded.graphCheckpointRef ?? null,
      activeNodeIds: currentNodeIds,
      payloadRefs: acceptedArtifactRefs,
      manifestRefs: upstreamArtifactRefs,
      nextLegalTransition: replayContinuationMode,
      proofGateStatus: "checkpoint_recorded",
    },
  });
  return recorded;
}

function uniqueRefs(values, max = 40) {
  return [
    ...new Set(
      values
        .filter((value) => typeof value === "string" && value.trim())
        .map((value) => value.trim()),
    ),
  ].slice(0, max);
}

function ensureProductSpecCodingExecutorProofRoute(summary = {}) {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) {
    return summary;
  }
  if (!summary.proofFamily) {
    summary.proofFamily = PRODUCT_SPEC_CODING_EXECUTOR_PROOF_ROUTE.proofFamily;
  }
  if (!summary.executorWorkflowId) {
    summary.executorWorkflowId = PRODUCT_SPEC_CODING_EXECUTOR_PROOF_ROUTE.executorWorkflowId;
  }
  if (!Array.isArray(summary.subjectWorkflowIds) || summary.subjectWorkflowIds.length === 0) {
    summary.subjectWorkflowIds = [...PRODUCT_SPEC_CODING_EXECUTOR_PROOF_ROUTE.subjectWorkflowIds];
  }
  if (!Array.isArray(summary.targetSubjectRefs) || summary.targetSubjectRefs.length === 0) {
    summary.targetSubjectRefs = PRODUCT_SPEC_CODING_EXECUTOR_PROOF_ROUTE.targetSubjectRefs.map(
      (ref) => ({ ...ref }),
    );
  }
  if (!Array.isArray(summary.requestedCapabilities) || summary.requestedCapabilities.length === 0) {
    summary.requestedCapabilities = [
      ...PRODUCT_SPEC_CODING_EXECUTOR_PROOF_ROUTE.requestedCapabilities,
    ];
  }
  return summary;
}

async function writeProductSpecProofRunManifest(summary = {}) {
  if (!currentProofRunId) {
    return null;
  }
  ensureProductSpecCodingExecutorProofRoute(summary);
  const proofRunManifestRef = `.artifacts/execution-platform/proof-runs/${currentProofRunId}/manifest.json`;
  const proofArtifactRefs = uniqueRefs(
    [
      ...(Array.isArray(summary.proofArtifactRefs) ? summary.proofArtifactRefs : []),
      summary.productSpecBoundaryReplayResultArtifact?.path,
      summary.productSpecProofAdmissionArtifact?.path,
      summary.productSpecReplayProofArtifact?.path,
      `.artifacts/execution-platform/proof-runs/${currentProofRunId}/product-spec-boundary-replay-live-state.json`,
    ],
    80,
  );
  const manifest = buildProductSpecProofRunManifest({
    proofRunId: currentProofRunId,
    proofRunManifestRef,
    proofFamily: summary.proofFamily ?? summary.productSpecProofAdmission?.proofFamily ?? null,
    executorWorkflowId:
      summary.executorWorkflowId ?? summary.productSpecProofAdmission?.executorWorkflowId ?? null,
    subjectWorkflowIds:
      summary.subjectWorkflowIds ?? summary.productSpecProofAdmission?.subjectWorkflowIds ?? [],
    targetSubjectRefs:
      summary.targetSubjectRefs ?? summary.productSpecProofAdmission?.targetSubjectRefs ?? [],
    requestedCapabilities:
      summary.requestedCapabilities ??
      summary.productSpecProofAdmission?.requestedCapabilities ??
      [],
    sourcePromptHash: summary.sourcePromptHash ?? summary.promptHash ?? null,
    workItemId: summary.workItemId ?? null,
    runtimeJobId: summary.runtimeJobId ?? null,
    graphId: summary.graphId ?? summary.sourceGraphId ?? null,
    proofSourceKind: summary.proofSourceKind ?? PRODUCT_SPEC_RUNTIME_BOUNDARY_REPLAY_PROOF_SOURCE,
    sourceTopologyStatus:
      summary.productSpecProofAdmission?.sourceTopologyStatus ??
      summary.sourceTopologyStatus ??
      "unknown",
    closurePredicateStatus: summary.productSpecProofAdmission?.status ?? "unknown",
    proofClosureAllowed: summary.productSpecProofAdmission?.proofClosureAllowed === true,
    boundaryCheckpointRefs: Array.isArray(summary.replayBoundaryCoverage)
      ? summary.replayBoundaryCoverage
          .map((entry) => entry?.checkpointRef)
          .filter((ref) => typeof ref === "string" && ref.trim())
      : [],
    replayResultRef:
      summary.productSpecBoundaryReplayResultArtifact?.path ??
      `.artifacts/execution-platform/proof-runs/${currentProofRunId}/product-spec-boundary-replay-result.json`,
    admissionGateRef:
      summary.productSpecProofAdmissionArtifact?.path ??
      `.artifacts/execution-platform/proof-runs/${currentProofRunId}/product-spec-replay-proof-admission-gate.json`,
    proofArtifactRef:
      summary.productSpecReplayProofArtifact?.path ??
      `.artifacts/execution-platform/proof-runs/${currentProofRunId}/worker-context-execution-proof.json`,
    proofArtifactRefs,
    latestRunStateRef: `.artifacts/execution-platform/proof-runs/${currentProofRunId}/product-spec-boundary-replay-live-state.json`,
    gatewaySubmitDiagnosticsRef: summary.gatewaySubmitDiagnosticsRef ?? null,
    workerResultRefs: Array.isArray(summary.workerSmokeResult?.outputArtifactRefs)
      ? summary.workerSmokeResult.outputArtifactRefs
      : [],
    changedFileRefs: Array.isArray(summary.workerSmokeResult?.changedFileRefs)
      ? summary.workerSmokeResult.changedFileRefs
      : [],
    validationRefs: Array.isArray(summary.workerSmokeResult?.validationRefs)
      ? summary.workerSmokeResult.validationRefs
      : [],
    evidenceClaimRefs: Array.isArray(summary.workerSmokeResult?.evidenceClaims)
      ? summary.workerSmokeResult.evidenceClaims
          .map((claim) => claim?.evidenceRef)
          .filter((ref) => typeof ref === "string" && ref.trim())
      : [],
    reasonCodes: [
      ...(Array.isArray(summary.productSpecProofAdmission?.blockerReasonCodes)
        ? summary.productSpecProofAdmission.blockerReasonCodes
        : []),
      ...(Array.isArray(summary.schedulerResult?.reasonCodes)
        ? summary.schedulerResult.reasonCodes
        : []),
    ],
  });
  assertProductSpecProofRunManifestBounds(manifest);
  const target = path.join(PROOF_RUNS_DIR, currentProofRunId, "manifest.json");
  const body = `${JSON.stringify(manifest, null, 2)}\n`;
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, body, "utf8");
  return {
    path: `.artifacts/execution-platform/proof-runs/${currentProofRunId}/manifest.json`,
    sha256: sha256(body),
    bytes: Buffer.byteLength(body, "utf8"),
  };
}

async function finalizeRunScopedProofSummary(
  summary,
  { resultArtifact, proofArtifact, admissionArtifact = null } = {},
) {
  ensureProductSpecCodingExecutorProofRoute(summary);
  Object.assign(summary, {
    proofRunId: currentProofRunId,
    proofRunManifestRef: currentProofRunId
      ? `.artifacts/execution-platform/proof-runs/${currentProofRunId}/manifest.json`
      : null,
    productSpecBoundaryReplayResultArtifact: resultArtifact ?? null,
    productSpecReplayProofArtifact: proofArtifact ?? null,
    ...(admissionArtifact ? { productSpecProofAdmissionArtifact: admissionArtifact } : {}),
    proofArtifactRefs: [proofArtifact?.path, resultArtifact?.path, admissionArtifact?.path].filter(
      Boolean,
    ),
  });
  const proofRunManifestArtifact = await writeProductSpecProofRunManifest(summary);
  Object.assign(summary, { proofRunManifestArtifact });
  return proofRunManifestArtifact;
}

function flag(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1]?.trim() ?? fallback) : fallback;
}

function flags(name) {
  const values = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] !== name) {
      continue;
    }
    const value = process.argv[index + 1];
    if (value && !value.startsWith("--")) {
      values.push(value.trim());
    }
  }
  return values;
}

function boolFlag(name, fallback = false) {
  const index = process.argv.indexOf(name);
  if (index < 0) {
    return fallback;
  }
  const next = process.argv[index + 1];
  const value = !next || next.startsWith("--") ? "true" : next.trim();
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

const REPO_SOURCE_PATH_REF_RE =
  /(?:^|[\s"'`(])((?:\.{1,2}\/|\/|~\/)?(?:docs|src|extensions|skills|scripts|tests?|packages|apps|config|ops)\/[A-Za-z0-9._~@%+\-/]+\.(?:ts|tsx|js|jsx|mjs|cjs|md|mdx|json|json5|yaml|yml|toml|css|scss|py|go|rs|java|kt|sh|sql))(?:$|[\s"'`),.;:])/gu;

function normalizePromptSourcePathRef(value) {
  return value
    .trim()
    .replace(/^['"`(]+/u, "")
    .replace(/[)"'`,.;:]+$/u, "");
}

function resolvePromptSourcePathRef(pathRef) {
  const trimmed = pathRef.trim();
  if (trimmed.startsWith("~/")) {
    return path.resolve(root, trimmed.slice(2));
  }
  if (path.isAbsolute(trimmed)) {
    return path.resolve(trimmed);
  }
  return path.resolve(root, trimmed);
}

async function promptSourcePathExists(pathRef) {
  try {
    await fs.access(resolvePromptSourcePathRef(pathRef));
    return true;
  } catch {
    return false;
  }
}

function scorePromptSourcePathCandidate({ targetName, candidateName }) {
  const target = targetName.toLowerCase();
  const candidate = candidateName.toLowerCase();
  let score = 0;
  if (candidate === target) {
    score += 100;
  }
  if (candidate.startsWith(target) || target.startsWith(candidate)) {
    score += 40;
  }
  if (path.extname(candidate) === path.extname(target)) {
    score += 8;
  }
  for (const term of target
    .replace(/\.[^.]+$/u, "")
    .split(/[^a-z0-9]+/u)
    .filter((entry) => entry.length >= 3)) {
    if (candidate.includes(term)) {
      score += 6;
    }
  }
  return score;
}

async function nearestPromptSourcePathCandidates(pathRef) {
  const absolutePath = resolvePromptSourcePathRef(pathRef);
  const parentDir = path.dirname(absolutePath);
  const entries = await fs.readdir(parentDir, { withFileTypes: true }).catch(() => []);
  const targetName = path.basename(absolutePath);
  return entries
    .filter((entry) => entry.isFile() || entry.isDirectory())
    .map((entry) => {
      const absoluteCandidate = path.join(parentDir, entry.name);
      const relativeCandidate = path.relative(root, absoluteCandidate).split(path.sep).join("/");
      return {
        path:
          relativeCandidate &&
          !relativeCandidate.startsWith("..") &&
          !path.isAbsolute(relativeCandidate)
            ? relativeCandidate
            : absoluteCandidate,
        score: scorePromptSourcePathCandidate({
          targetName,
          candidateName: entry.name,
        }),
      };
    })
    .filter((entry) => entry.score > 0)
    .toSorted((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, 3)
    .map((entry) => entry.path);
}

function sourceLineForPromptPathRef(promptText, pathRef) {
  return (
    promptText
      .split(/\r?\n/u)
      .find((line) => line.includes(pathRef))
      ?.trim()
      .slice(0, 500) ?? pathRef
  );
}

async function validateWorkerPromptFileSourceRefs(promptText) {
  const findings = [];
  const seen = new Set();
  for (const match of promptText.matchAll(REPO_SOURCE_PATH_REF_RE)) {
    const pathRef = normalizePromptSourcePathRef(match[1] ?? "");
    if (!pathRef || seen.has(pathRef)) {
      continue;
    }
    seen.add(pathRef);
    if (await promptSourcePathExists(pathRef)) {
      continue;
    }
    findings.push({
      path: pathRef,
      nearestCandidates: await nearestPromptSourcePathCandidates(pathRef),
      sourceSection: sourceLineForPromptPathRef(promptText, pathRef),
    });
  }
  return findings.slice(0, 20);
}

async function loadWorkerPromptFileTextTurnClient(promptFile) {
  if (!promptFile) {
    return null;
  }
  const resolvedPromptFile = path.isAbsolute(promptFile)
    ? promptFile
    : path.resolve(root, promptFile);
  const promptText = await fs.readFile(resolvedPromptFile, "utf8");
  if (promptText.length === 0) {
    throw new Error(`worker_prompt_file_empty:${promptFile}`);
  }
  const missingSourceRefs = await validateWorkerPromptFileSourceRefs(promptText);
  if (missingSourceRefs.length > 0) {
    throw new Error(
      `worker_prompt_file_missing_source_refs:${JSON.stringify({
        promptFile,
        missingSourceRefs,
      })}`,
    );
  }
  const responseHash = sha256(promptText);
  const promptByteCount = Buffer.byteLength(promptText, "utf8");
  const modelRunRef = `replay-worker-prompt-file://${responseHash.slice(0, 24)}`;
  return {
    promptFile,
    resolvedPromptFile,
    promptText,
    responseHash,
    promptByteCount,
    modelRunRef,
    client: {
      executeProviderTextTurn: async (request) => ({
        modelRunRef,
        responseText: promptText,
        responseHash,
        latencyMs: 0,
        providerDiagnostics: {
          artifactKind: "product_spec_boundary_replay_worker_prompt_file_text_turn",
          status: "succeeded",
          owner: request.owner,
          phaseId: request.phaseId,
          modelTaskCallSite: request.modelTaskCallSite ?? null,
          promptFile,
          promptHash: responseHash,
          promptByteCount,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        },
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      }),
    },
  };
}

function isSupportedBoundary(boundary) {
  const checkpointKind = boundaryReplayCheckpointKindForCliAlias(boundary);
  return checkpointKind ? BOUNDARY_REPLAY_CHECKPOINT_KINDS.includes(checkpointKind) : false;
}

function boundaryToCheckpointKind(boundary) {
  return boundaryReplayCheckpointKindForCliAlias(boundary);
}

function isLegacyDiagnosticBoundary(boundary) {
  const checkpointKind = boundaryToCheckpointKind(boundary);
  return checkpointKind ? boundaryReplayBoundaryIsDiagnosticOnly(checkpointKind) : false;
}

function boundaryStopsBeforeWorkerExecution(boundary, node, { executeWorkers = false } = {}) {
  if (executeWorkers && boundary === "after-graph-selection") {
    return false;
  }
  if (boundary === "after-graph-selection") {
    return true;
  }
  return false;
}

function boundarySelectedReasonCode(boundary) {
  if (boundary === "after-graph-selection") {
    return "boundary_replay_accepted_graph_frontier_selected";
  }
  return "boundary_replay_first_executable_node_selected";
}

function nodeKindCanRunNativeAgent(nodeKind) {
  return [
    "implementation",
    "test_authoring",
    "docs_update",
    "architecture_spec",
    "planning_capsule",
    "action_graph_compile",
    "compiler",
    "repair",
    "validation",
    "test_review",
    "reviewer",
    "observability_readback",
    "closeout",
  ].includes(nodeKind);
}

class BoundaryReplayStop extends Error {
  constructor(boundaryResult) {
    super("boundary_replay_first_executable_node_selected");
    this.name = "BoundaryReplayStop";
    this.boundaryResult = boundaryResult;
  }
}

function metadataOf(artifact) {
  return artifact?.metadata &&
    typeof artifact.metadata === "object" &&
    !Array.isArray(artifact.metadata)
    ? artifact.metadata
    : {};
}

function latestArtifact(artifacts, artifactType) {
  return artifacts.findLast((artifact) => artifact.artifactType === artifactType) ?? null;
}

function stringifyJson(value) {
  return JSON.stringify(value, null, 2);
}

function parseJsonObject(responseText) {
  const text = String(responseText ?? "").trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/iu)?.[1]?.trim();
  const candidates = [
    text,
    fenced ?? "",
    text.includes("{") ? text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1) : "",
  ].filter((candidate) => candidate.trim().startsWith("{"));
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      continue;
    }
  }
  return {};
}

async function evaluateReplayMissionLedger({
  runtime,
  runtimeJobId,
  boundary,
  graphId,
  iteration,
  nodeId,
  ledger,
  outputArtifactRefs,
  evidenceClaims,
  reasonCodes,
  snapshotSummary,
}) {
  throw new Error("mission_ledger_json_replay_evaluator_retired");
  const evidenceClaimRefs = [...new Set(evidenceClaims.map((claim) => claim.evidenceRef))].slice(
    0,
    30,
  );
  if (evidenceClaimRefs.length === 0) {
    const updated = { ...ledger, ledgerStatus: "needs_review" };
    await runtime.runtimeJobs.attachArtifact({
      jobId: runtimeJobId,
      artifactType: "execution_platform.mission_contract_evaluation.replay_diagnostic",
      storageKind: "metadata",
      uri: `runtime-job://${runtimeJobId}/product-spec-boundary-replay/mission-ledger/no-claims-${sha256(
        `${graphId}:${iteration}:${nodeId}`,
      ).slice(0, 12)}`,
      contentType: "application/json",
      metadata: {
        artifactKind: "product_spec_boundary_replay_mission_ledger_evaluation_diagnostic",
        graphId,
        iteration,
        nodeId,
        status: "needs_review",
        reasonCodes: [
          "mission_contract_evidence_claims_missing",
          "mission_contract_evaluation_skipped_without_claims",
        ],
        outputArtifactRefs: outputArtifactRefs.slice(0, 20),
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      },
    });
    return updated;
  }
  const modelClient = new CodexDynamicJsonClient(process.cwd());
  let priorError = null;
  try {
    for (const attempt of [0, 1]) {
      const userPayload = {
        graphId,
        iteration,
        nodeId,
        missionLedger: summarizeMissionContractLedger(ledger),
        evidenceClaims: evidenceClaims
          .map((claim) => ({
            commitmentId: claim.commitmentId,
            evidenceRef: claim.evidenceRef,
            evidenceKind: claim.evidenceKind,
            validationPhase: claim.validationPhase ?? null,
            validationPhaseCompatibility: claim.validationPhaseCompatibility ?? null,
            validationPhaseReasonCodes: (claim.validationPhaseReasonCodes ?? []).slice(0, 8),
            validationRefs: (claim.validationRefs ?? []).slice(0, 8),
            changedFileRefs: (claim.changedFileRefs ?? []).slice(0, 8),
            claimSummary: String(claim.claimSummary ?? "").slice(0, 500),
            limitations: (claim.limitations ?? []).slice(0, 8),
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          }))
          .slice(0, 30),
        candidateEvidenceRefs: evidenceClaimRefs,
        unclaimedOutputArtifactRefs: outputArtifactRefs
          .filter((ref) => !evidenceClaimRefs.includes(ref))
          .slice(0, 12),
        nodeReasonCodes: reasonCodes.slice(0, 16),
        snapshotNodeCount: snapshotSummary?.nodeSummaries?.length ?? null,
        requestedShape: {
          artifactKind: "mission_commitment_evaluation",
          schemaVersion: "execution-platform.mission-contract-ledger.v1",
          evaluationId: `${ledger.missionId}-replay-eval-${iteration}-${attempt}`,
          missionId: ledger.missionId,
          commitmentUpdates: [],
          revisionProposals: [],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          workQueueLifecycleMutated: false,
        },
        rawPromptStored: false,
        rawResponseStored: false,
      };
      await emitReplayState({
        runtime,
        runtimeJobId,
        event: "mission_ledger_evaluation_model_call_started",
        graphId,
        boundary,
        phase: "mission_ledger_evaluation",
        status: "running",
        details: {
          iteration,
          nodeId,
          attempt,
          modelRef: DEFAULT_DYNAMIC_ORCHESTRATOR_MODEL_REF,
          providerPath: DEFAULT_DYNAMIC_ORCHESTRATOR_PROVIDER_PATH,
          evidenceClaimCount: evidenceClaims.length,
          evidenceClaimRefs,
          payloadHash: sha256(stringifyJson(userPayload)),
        },
      });
      try {
        throw new Error("mission_ledger_json_replay_evaluator_retired");
      } catch (error) {
        priorError = error;
        if (attempt === 0) {
          continue;
        }
        throw error;
      }
      try {
        const evaluation = parseMissionCommitmentEvaluation({
          ...parseJsonObject(response.responseText),
          artifactKind: "mission_commitment_evaluation",
          schemaVersion: "execution-platform.mission-contract-ledger.v1",
          missionId: ledger.missionId,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          workQueueLifecycleMutated: false,
        });
        const evaluationRef = `runtime-job://${runtimeJobId}/product-spec-boundary-replay/mission-ledger/evaluation-${sha256(
          `${graphId}:${iteration}:${nodeId}:${response.responseHash ?? ""}`,
        ).slice(0, 16)}`;
        await runtime.runtimeJobs.attachArtifact({
          jobId: runtimeJobId,
          artifactType: "execution_platform.mission_contract_evaluation.replay",
          storageKind: "metadata",
          uri: evaluationRef,
          contentType: "application/json",
          metadata: {
            ...evaluation,
            replayBoundary: boundary,
            graphId,
            iteration,
            nodeId,
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
            rawToolLogStored: false,
          },
        });
        const updated = applyMissionCommitmentEvaluation({
          ledger,
          evaluation,
          availableEvidenceRefs: evidenceClaimRefs,
        });
        await emitReplayState({
          runtime,
          runtimeJobId,
          event: "mission_ledger_evaluation_model_call_completed",
          graphId,
          boundary,
          phase: "mission_ledger_evaluation",
          status: "completed",
          details: {
            iteration,
            nodeId,
            attempt,
            evaluationRef,
            openBlockingCommitmentCount: openBlockingMissionCommitments(updated).length,
            responseHash: response.responseHash ?? null,
          },
        });
        return updated;
      } catch (error) {
        priorError = error;
        if (attempt === 0) {
          continue;
        }
      }
    }
    const diagnosticRef = `runtime-job://${runtimeJobId}/product-spec-boundary-replay/mission-ledger/evaluation-invalid-${sha256(
      `${graphId}:${iteration}:${nodeId}:${priorError instanceof Error ? priorError.message : String(priorError)}`,
    ).slice(0, 16)}`;
    await runtime.runtimeJobs.attachArtifact({
      jobId: runtimeJobId,
      artifactType: "execution_platform.mission_contract_evaluation.replay_diagnostic",
      storageKind: "metadata",
      uri: diagnosticRef,
      contentType: "application/json",
      metadata: {
        artifactKind: "product_spec_boundary_replay_mission_ledger_evaluation_diagnostic",
        graphId,
        iteration,
        nodeId,
        status: "needs_review",
        diagnosticRef,
        evidenceClaimRefs,
        outputArtifactRefs: outputArtifactRefs.slice(0, 20),
        errorKind: priorError instanceof Error ? priorError.name : "unknown_error",
        errorMessageHash: sha256(
          priorError instanceof Error ? priorError.message : String(priorError),
        ),
        reasonCodes: [
          "mission_contract_evaluation_invalid",
          "mission_contract_evaluation_diagnostic_recorded",
        ],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      },
    });
    return { ...ledger, ledgerStatus: "needs_review" };
  } finally {
    modelClient.close();
  }
}

function summarizeSnapshot(snapshot) {
  return {
    workflowId: snapshot.graph.workflowId,
    graphStatus: snapshot.graph.graphStatus,
    nodeCount: snapshot.nodes.length,
    edgeCount: snapshot.edges.length,
    nodes: snapshot.nodes.map((node) => ({
      nodeLifecycleProjectionRef:
        typeof node.metadata?.nodeLifecycleProjectionRef === "string"
          ? node.metadata.nodeLifecycleProjectionRef
          : null,
      nodeLifecycleProjectionStatus:
        typeof node.metadata?.nodeLifecycleProjectionStatus === "string"
          ? node.metadata.nodeLifecycleProjectionStatus
          : null,
      nodeAgentSessionRef:
        typeof node.metadata?.nodeAgentSessionRef === "string"
          ? node.metadata.nodeAgentSessionRef
          : null,
      nodeId: node.nodeId,
      nodeKind: node.nodeKind,
      assignedRole: node.assignedRole,
      nodeStatus: node.nodeStatus,
      outputArtifactRefs: node.outputArtifactRefs.slice(0, 8),
      inputHandoffRefs: node.inputHandoffRefs.slice(0, 8),
    })),
    edges: snapshot.edges.map((edge) => ({
      edgeId: edge.edgeId,
      fromNodeId: edge.fromNodeId,
      toNodeId: edge.toNodeId,
      edgeKind: edge.edgeKind,
    })),
  };
}

function compactGraphSummary(summary) {
  if (!summary) {
    return null;
  }
  return {
    workflowId: summary.workflowId ?? null,
    graphStatus: summary.graphStatus ?? null,
    nodeCount: summary.nodeCount ?? 0,
    edgeCount: summary.edgeCount ?? 0,
    nodes: Array.isArray(summary.nodes)
      ? summary.nodes.slice(0, 40).map((node) => ({
          nodeId: node.nodeId ?? null,
          nodeKind: node.nodeKind ?? null,
          assignedRole: node.assignedRole ?? null,
          nodeStatus: node.nodeStatus ?? null,
          nodeLifecycleProjectionRef: node.nodeLifecycleProjectionRef ?? null,
          nodeLifecycleProjectionStatus: node.nodeLifecycleProjectionStatus ?? null,
          nodeAgentSessionRef: node.nodeAgentSessionRef ?? null,
          outputArtifactRefCount: Array.isArray(node.outputArtifactRefs)
            ? node.outputArtifactRefs.length
            : 0,
          inputHandoffRefCount: Array.isArray(node.inputHandoffRefs)
            ? node.inputHandoffRefs.length
            : 0,
        }))
      : [],
    edgeKinds: Array.isArray(summary.edges)
      ? summary.edges.reduce((counts, edge) => {
          const kind = typeof edge.edgeKind === "string" ? edge.edgeKind : "unknown";
          counts[kind] = (counts[kind] ?? 0) + 1;
          return counts;
        }, {})
      : {},
  };
}

function compactBoundaryReplayResultMetadata(summary, resultArtifact) {
  return {
    artifactKind: "product_spec_boundary_replay_result_ref",
    generatedAt: summary.generatedAt,
    status: summary.status,
    proofRunId: summary.proofRunId ?? null,
    proofRunManifestRef: summary.proofRunManifestRef ?? null,
    runtimeJobId: summary.runtimeJobId,
    sourceGraphId: summary.sourceGraphId,
    graphId: summary.graphId,
    replayGraphCreated: summary.replayGraphCreated,
    boundary: summary.boundary,
    schedulerStatus: summary.schedulerResult?.status ?? null,
    iterations: summary.schedulerResult?.iterations ?? null,
    selectedBoundaryNode: summary.selectedBoundaryNode,
    selectedBoundaryNodes: Array.isArray(summary.selectedBoundaryNodes)
      ? summary.selectedBoundaryNodes.slice(0, 16)
      : [],
    sourceGraphUnchanged: summary.sourceGraphUnchanged,
    progressEventCount: summary.progressEventCount,
    beforeGraph: compactGraphSummary(summary.beforeGraph),
    afterGraph: compactGraphSummary(summary.afterGraph),
    latestProgressEvents: Array.isArray(summary.latestProgressEvents)
      ? summary.latestProgressEvents.slice(-8)
      : [],
    resultArtifact,
    resultArtifactRef: resultArtifact?.path ?? null,
    resultArtifactSha256: resultArtifact?.sha256 ?? null,
    reasonCodes: Array.isArray(summary.schedulerResult?.reasonCodes)
      ? summary.schedulerResult.reasonCodes.slice(-30)
      : [],
    routerRerun: false,
    missionLedgerRerun: false,
    commitmentPacketAuthorRerun: false,
    contextScoutRerun: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

function metadataStringArray(metadata, key, fallback = []) {
  const value = metadata?.[key];
  return stringArray(value, fallback);
}

async function attachReplayArtifact(runtime, runtimeJobId, artifactType, uri, metadata) {
  const attach = isRuntimeArtifactPayloadRequired(artifactType)
    ? runtime.runtimeJobs.attachRuntimeArtifactByContract.bind(runtime.runtimeJobs)
    : runtime.runtimeJobs.attachJsonPayloadArtifact.bind(runtime.runtimeJobs);
  const artifact = await attach({
    jobId: runtimeJobId,
    artifactType,
    uri,
    contentType: "application/json",
    body: {
      ...jsonRecord(metadata),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    },
    boundedSummary: `Boundary replay payload artifact: ${artifactType}.`,
    resourcePacketKind: artifactType,
    createdBy: "product-spec-boundary-replay",
  });
  return artifact.uri;
}

function createSchedulerOrchestrator({ runtime, runtimeJobId, boundary }) {
  const nodeResultById = new Map();
  return {
    noteNodeResult(nodeId, result) {
      nodeResultById.set(nodeId, result);
    },
    async callSchedulerTool(input) {
      const modelClient = new CodexDynamicJsonClient(process.cwd());
      const userPayload = input.userPayload ?? {
        graphId: input.graphId,
        iteration: input.iteration,
        rawPromptStored: false,
        rawResponseStored: false,
      };
      await emitReplayState({
        runtime,
        runtimeJobId,
        event: "scheduler_native_tool_call_started",
        graphId: input.graphId,
        boundary,
        phase: input.phase,
        status: "running",
        details: {
          iteration: input.iteration,
          repairAttempt: input.repairAttempt ?? 0,
          stage: input.stage,
          modelRef: input.modelRef,
          providerPath: input.providerPath,
          allowedToolNames: input.allowedToolNames,
          payloadHash: sha256(stringifyJson(userPayload)),
          nodeResultCount: nodeResultById.size,
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });
      try {
        const result = await executeSchedulerStageNativeTool({
          modelClient,
          toolInput: {
            ...input,
            userPayload,
          },
          progress: {
            spanId: `${runtimeJobId}:${input.graphId}:scheduler-native-tool:${input.iteration}:${input.repairAttempt}:${input.phase}`,
            objectiveSummary: input.currentObjective,
            reasonCodes: input.reasonCodes,
            onEvent: (event) =>
              emitReplayState({
                runtime,
                runtimeJobId,
                event: "model_call_progress",
                graphId: input.graphId,
                boundary,
                phase: input.phase,
                status: event.phase === "failed" ? "failed" : "running",
                details: event,
              }),
          },
        });
        await emitReplayState({
          runtime,
          runtimeJobId,
          event: "scheduler_native_tool_call_completed",
          graphId: input.graphId,
          boundary,
          phase: input.phase,
          status: "completed",
          details: {
            iteration: input.iteration,
            repairAttempt: input.repairAttempt ?? 0,
            stage: input.stage,
            toolId: result.toolId,
            providerToolName: result.providerToolName,
            latencyMs: result.latencyMs ?? null,
            rawPromptStored: false,
            rawResponseStored: false,
          },
        });
        return {
          ...result,
          reasonCodes: [
            "boundary_replay_scheduler_native_tool_call_completed",
            ...result.reasonCodes,
          ],
        };
      } catch (error) {
        await emitReplayState({
          runtime,
          runtimeJobId,
          event: "scheduler_native_tool_call_failed",
          graphId: input.graphId,
          boundary,
          phase: input.phase,
          status: "failed",
          details: {
            iteration: input.iteration,
            repairAttempt: input.repairAttempt ?? 0,
            stage: input.stage,
            errorName: error?.name ?? "unknown_error",
            errorSummary: String(error?.message ?? error).slice(0, 500),
            errorMessageHash: sha256(error?.message ?? String(error)),
          },
        });
        throw error;
      } finally {
        modelClient.close();
      }
    },
    async callSchedulerTools(input) {
      const modelClient = new CodexDynamicJsonClient(process.cwd());
      const userPayload = input.userPayload ?? {
        graphId: input.graphId,
        iteration: input.iteration,
        rawPromptStored: false,
        rawResponseStored: false,
      };
      await emitReplayState({
        runtime,
        runtimeJobId,
        event: "scheduler_native_tool_batch_started",
        graphId: input.graphId,
        boundary,
        phase: input.phase,
        status: "running",
        details: {
          iteration: input.iteration,
          repairAttempt: input.repairAttempt ?? 0,
          stage: input.stage,
          modelRef: input.modelRef,
          providerPath: input.providerPath,
          allowedToolNames: input.allowedToolNames,
          payloadHash: sha256(stringifyJson(userPayload)),
          nodeResultCount: nodeResultById.size,
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });
      try {
        const results = await executeSchedulerStageNativeToolBatch({
          modelClient,
          toolInput: {
            ...input,
            userPayload,
          },
          progress: {
            spanId: `${runtimeJobId}:${input.graphId}:scheduler-native-tools:${input.iteration}:${input.repairAttempt}:${input.phase}`,
            objectiveSummary: input.currentObjective,
            reasonCodes: input.reasonCodes,
            onEvent: (event) =>
              emitReplayState({
                runtime,
                runtimeJobId,
                event: "model_call_progress",
                graphId: input.graphId,
                boundary,
                phase: input.phase,
                status: event.phase === "failed" ? "failed" : "running",
                details: event,
              }),
          },
        });
        await emitReplayState({
          runtime,
          runtimeJobId,
          event: "scheduler_native_tool_batch_completed",
          graphId: input.graphId,
          boundary,
          phase: input.phase,
          status: "completed",
          details: {
            iteration: input.iteration,
            repairAttempt: input.repairAttempt ?? 0,
            stage: input.stage,
            toolIds: results.map((result) => result.toolId).slice(0, 32),
            providerToolNames: results.map((result) => result.providerToolName).slice(0, 32),
            latencyMs: Math.max(...results.map((result) => result.latencyMs ?? 0), 0),
            rawPromptStored: false,
            rawResponseStored: false,
          },
        });
        return results;
      } catch (error) {
        await emitReplayState({
          runtime,
          runtimeJobId,
          event: "scheduler_native_tool_batch_failed",
          graphId: input.graphId,
          boundary,
          phase: input.phase,
          status: "failed",
          details: {
            iteration: input.iteration,
            repairAttempt: input.repairAttempt ?? 0,
            stage: input.stage,
            errorName: error?.name ?? "unknown_error",
            errorSummary: String(error?.message ?? error).slice(0, 500),
            errorMessageHash: sha256(error?.message ?? String(error)),
          },
        });
        throw error;
      } finally {
        modelClient.close();
      }
    },
  };
}

function boundaryStopExecutor(boundary, orchestrator, { executeWorkers = false } = {}) {
  return {
    async execute({ node }) {
      const outputRef = `runtime-job://${node.runtimeJobId ?? "boundary-replay"}/boundary-replay/${boundary}/${node.nodeId}`;
      if (boundaryStopsBeforeWorkerExecution(boundary, node, { executeWorkers })) {
        throw new BoundaryReplayStop({
          status: "needs_review",
          iterations: 0,
          addedNodeIds: [],
          executedNodeIds: [],
          selectedNodeId: node.nodeId,
          reasonCodes: [
            boundarySelectedReasonCode(boundary),
            "agent_session_replay_unavailable",
            "boundary_replay_stopped_before_native_agent_session_execution",
            "boundary_replay_did_not_fake_node_finish_or_worker_completion",
            `boundary_replay_target_node_kind:${node.nodeKind}`,
          ],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
        });
      }
      const result = {
        status: "needs_review",
        outputArtifactRefs: [outputRef],
        reasonCodes: [
          "boundary_replay_stopped_before_worker_execution",
          `boundary_replay_target_node_kind:${node.nodeKind}`,
        ],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        workQueueLifecycleMutated: false,
      };
      orchestrator.noteNodeResult(node.nodeId, result);
      return result;
    },
  };
}

function createBoundaryReplayReviewerExecutor({
  runtime,
  runtimeJobId,
  graphId,
  boundary,
  orchestrator,
}) {
  return {
    async execute({ node }) {
      const snapshot = await runtime.runtimeWorkGraphs.readGraphSnapshot(graphId);
      const nodesById = new Map(
        (snapshot?.nodes ?? []).map((candidate) => [candidate.nodeId, candidate]),
      );
      const targetNodeIds = stringArray(node.inputHandoffRefs, [])
        .map((ref) => (nodesById.has(ref) ? ref : ref.split("/").at(-1)))
        .filter((ref) => ref && nodesById.has(ref));
      const targetNodes = targetNodeIds.map((nodeId) => nodesById.get(nodeId)).filter(Boolean);
      const acceptedTargets = targetNodes.filter(
        (target) =>
          target.nodeStatus === "succeeded" && stringArray(target.outputArtifactRefs).length > 0,
      );
      const blockedTargets = targetNodes.filter(
        (target) =>
          target.nodeStatus !== "succeeded" || stringArray(target.outputArtifactRefs).length === 0,
      );
      const status =
        targetNodes.length > 0 && blockedTargets.length === 0 ? "succeeded" : "needs_review";
      const outputRef = `review://boundary-replay/${runtimeJobId}/${node.nodeId}/${sha256(
        `${targetNodeIds.join(":")}:${status}`,
      ).slice(0, 16)}`;
      const result = {
        status,
        outputArtifactRefs: [outputRef],
        reasonCodes: [
          "boundary_replay_reviewer_executor_used",
          `boundary_replay_review_target_count:${targetNodes.length}`,
          `boundary_replay_review_accepted_target_count:${acceptedTargets.length}`,
          `boundary_replay_review_blocked_target_count:${blockedTargets.length}`,
          ...(status === "succeeded"
            ? ["boundary_replay_reviewer_accepted_existing_succeeded_evidence"]
            : ["boundary_replay_reviewer_requires_real_repair_or_model_review"]),
        ],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        workQueueLifecycleMutated: false,
      };
      await emitReplayState({
        runtime,
        runtimeJobId,
        event: "boundary_replay_reviewer_completed",
        graphId,
        boundary,
        phase: "reviewer_execution",
        status,
        details: {
          nodeId: node.nodeId,
          targetNodeIds,
          blockedTargetNodeIds: blockedTargets.map((target) => target.nodeId),
          outputRef,
        },
      });
      orchestrator.noteNodeResult(node.nodeId, result);
      return result;
    },
  };
}

async function main() {
  await loadEnvFile(".env");
  await loadEnvFile(".env.local");
  await loadEnvFile(".env.execution-platform-staging");
  await loadEnvFile("/root/.openclaw/.env");
  process.env.OPENCLAW_SUPPRESS_EXTERNAL_CLI_AUTH_SYNC ??= "1";
  const runtimeJobId = flag("--runtime-job-id");
  if (!runtimeJobId) {
    throw new Error("runtime_job_id_required");
  }
  const clearStaleLiveStateOnly = boolFlag("--clear-stale-live-state-only", false);
  const terminalizeLegacyStaleLiveState = boolFlag("--terminalize-legacy-stale-live-state", false);
  const staleLiveStateTerminalization = await terminalizeStaleReplayLiveState({
    runtimeJobId,
    allowLegacyNoPid: clearStaleLiveStateOnly || terminalizeLegacyStaleLiveState,
    reason: clearStaleLiveStateOnly ? "manual_clear" : "startup_preflight",
  });
  if (clearStaleLiveStateOnly) {
    process.stdout.write(
      `${JSON.stringify({
        event: "product_spec_boundary_replay_stale_live_state_clear",
        ...staleLiveStateTerminalization,
      })}\n`,
    );
    return;
  }
  const graphIdFlag = flag("--graph-id");
  const workerPromptFile = flag("--worker-prompt-file");
  const boundary = flag(
    "--boundary",
    workerPromptFile ? "after-graph-selection" : "before-worker-execution",
  );
  if (!isSupportedBoundary(boundary)) {
    throw new Error(`unsupported_boundary:${boundary}`);
  }
  if (isLegacyDiagnosticBoundary(boundary)) {
    throw new Error(`unsupported_diagnostic_boundary:${boundary}`);
  }
  const executeWorkers = boolFlag("--execute-workers", false);
  const diagnosticExitZero = boolFlag("--diagnostic-exit-zero", false);
  const maxIterations = Number(
    flag("--max-iterations", process.env.OPENCLAW_BOUNDARY_REPLAY_MAX_ITERATIONS ?? "2"),
  );
  const maxParallelNodeExecutions = Number(
    flag(
      "--max-parallel-node-executions",
      process.env.OPENCLAW_BOUNDARY_REPLAY_MAX_PARALLEL_NODE_EXECUTIONS ?? "4",
    ),
  );
  const resetStaleRunningNodes = boolFlag("--reset-stale-running-nodes", false);
  const resetNodeIds = flags("--reset-node-to-planned");
  const preserveWorkIntentDownstreamState = boolFlag(
    "--preserve-workintent-downstream-state",
    false,
  );
  const targetNodeIds = new Set(flags("--target-node-id"));
  const workerPromptFileTextTurn = await loadWorkerPromptFileTextTurnClient(workerPromptFile);

  const runtime = await getExecutionPlatformRuntime(await loadSourceBackedReplayConfig());
  replayRuntimeShutdown =
    typeof runtime.shutdown === "function" ? () => runtime.shutdown() : replayRuntimeShutdown;
  const job = await runtime.runtimeJobs.getJob(runtimeJobId);
  if (!job) {
    throw new Error(`runtime_job_not_found:${runtimeJobId}`);
  }
  const artifacts = await runtime.runtimeJobs.listArtifacts(runtimeJobId);
  const graphId =
    graphIdFlag ??
    artifacts
      .map((artifact) => metadataOf(artifact).graphId)
      .find((value) => typeof value === "string" && value.trim()) ??
    null;
  if (!graphId) {
    throw new Error(`runtime_graph_not_found_for_job:${runtimeJobId}`);
  }
  currentProofRunId =
    flag("--proof-run-id") ??
    `product-spec-boundary-replay-${Date.now().toString(36)}-${sha256(
      `${runtimeJobId}:${graphId}:${boundary}`,
    ).slice(0, 12)}`;
  let sourceSnapshot = await runtime.runtimeWorkGraphs.readGraphSnapshot(graphId);
  if (!sourceSnapshot) {
    throw new Error(`runtime_graph_snapshot_missing:${graphId}`);
  }
  if (resetStaleRunningNodes) {
    const runningNodeIds = sourceSnapshot.nodes
      .filter((node) => node.nodeStatus === "running")
      .map((node) => node.nodeId);
    for (const nodeId of runningNodeIds) {
      await runtime.runtimeWorkGraphs.updateNodeStatus({
        nodeId,
        nodeStatus: "planned",
        outputArtifactRefs: [],
      });
    }
    if (runningNodeIds.length > 0) {
      process.stdout.write(
        `${JSON.stringify({
          event: "product_spec_boundary_replay_progress",
          stage: "boundary_replay_reset_stale_running_nodes",
          status: "completed",
          graphId,
          nodeIds: runningNodeIds,
          reasonCodes: ["boundary_replay_stale_running_nodes_reset_to_planned"],
        })}\n`,
      );
      sourceSnapshot = await runtime.runtimeWorkGraphs.readGraphSnapshot(graphId);
      if (!sourceSnapshot) {
        throw new Error(`runtime_graph_snapshot_missing_after_reset:${graphId}`);
      }
    }
  }
  if (resetNodeIds.length > 0) {
    const resetNodeIdSet = new Set(resetNodeIds);
    const targetedResetNodes = sourceSnapshot.nodes.filter((node) =>
      resetNodeIdSet.has(node.nodeId),
    );
    const resettableNodes = sourceSnapshot.nodes.filter((node) => {
      if (!resetNodeIdSet.has(node.nodeId)) {
        return false;
      }
      if (["running", "needs_review", "failed"].includes(node.nodeStatus)) {
        return true;
      }
      const metadata = jsonRecord(node.metadata);
      return (
        node.nodeStatus === "succeeded" &&
        metadata.splitRequiredParentLifecycle === "aggregate_non_runnable"
      );
    });
    const dependentReviewNodes = sourceSnapshot.nodes.filter((node) => {
      if (
        node.nodeKind !== "reviewer" ||
        !["running", "needs_review", "failed"].includes(node.nodeStatus)
      ) {
        return false;
      }
      const metadata = jsonRecord(node.metadata);
      const targetRefs = stringArray(metadata.targetRefs);
      return targetRefs.some((targetRef) => resetNodeIdSet.has(targetRef));
    });
    for (const node of targetedResetNodes) {
      const replayAttemptId = `boundary-replay-${sha256(
        `${currentProofRunId}:${graphId}:${node.nodeId}`,
      ).slice(0, 16)}`;
      const resetReceipt = resetNodeForFreshAttempt({
        snapshot: sourceSnapshot,
        graphId,
        node,
        attemptId: replayAttemptId,
        reason: "boundary_replay_reset",
      });
      await runtime.runtimeWorkGraphs.updateNodeStatus({
        nodeId: node.nodeId,
        nodeStatus: "planned",
        outputArtifactRefs: [],
        metadataPatch: {
          ...resetReceipt.metadataPatch,
          boundaryReplayProofRunId: currentProofRunId,
          nodeExecutionSnapshotStorageRef: null,
          nodeFreshAttemptResetReceipt: resetReceipt,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        },
      });
    }
    for (const node of dependentReviewNodes) {
      await runtime.runtimeWorkGraphs.updateNodeStatus({
        nodeId: node.nodeId,
        nodeStatus: "skipped",
        outputArtifactRefs: [
          `runtime-work-graph://${graphId}/boundary-replay/obsolete-review/${sha256(
            `${node.nodeId}:${resettableNodes.map((resetNode) => resetNode.nodeId).join("|")}`,
          ).slice(0, 16)}`,
        ],
      });
    }
    if (
      targetedResetNodes.length > 0 &&
      ["needs_review", "failed", "canceled"].includes(sourceSnapshot.graph.graphStatus)
    ) {
      await runtime.runtimeWorkGraphs.updateGraphStatus({
        graphId,
        graphStatus: "running",
        metadata: {
          ...jsonRecord(sourceSnapshot.graph.metadata),
          boundaryReplayResumedAt: new Date().toISOString(),
          boundaryReplayResetNodeIds: targetedResetNodes.map((node) => node.nodeId).slice(0, 20),
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        },
      });
    }
    process.stdout.write(
      `${JSON.stringify({
        event: "product_spec_boundary_replay_progress",
        stage: "boundary_replay_reset_selected_nodes",
        status: "completed",
        graphId,
        nodeIds: targetedResetNodes.map((node) => node.nodeId),
        retiredDependentReviewNodeIds: dependentReviewNodes.map((node) => node.nodeId),
        skippedNodeIds: resetNodeIds.filter(
          (nodeId) => !targetedResetNodes.some((node) => node.nodeId === nodeId),
        ),
        reasonCodes: [
          "boundary_replay_selected_nodes_reset_to_planned",
          "boundary_replay_selected_nodes_assigned_fresh_node_attempt_ids",
        ],
      })}\n`,
    );
    sourceSnapshot = await runtime.runtimeWorkGraphs.readGraphSnapshot(graphId);
    if (!sourceSnapshot) {
      throw new Error(`runtime_graph_snapshot_missing_after_selected_node_reset:${graphId}`);
    }
  }
  if (boundary === "after-work-intent-acceptance" && !preserveWorkIntentDownstreamState) {
    const downstreamNodesToReset = sourceSnapshot.nodes.filter(
      (node) =>
        node.nodeKind !== "work_intent" &&
        (node.nodeStatus !== "planned" || stringArray(node.outputArtifactRefs).length > 0),
    );
    const plannedWorkIntentOutputsToClear = sourceSnapshot.nodes.filter(
      (node) =>
        node.nodeKind === "work_intent" &&
        node.nodeStatus !== "succeeded" &&
        stringArray(node.outputArtifactRefs).length > 0,
    );
    for (const node of downstreamNodesToReset) {
      await runtime.runtimeWorkGraphs.updateNodeStatus({
        nodeId: node.nodeId,
        nodeStatus: "planned",
        outputArtifactRefs: [],
      });
    }
    for (const node of plannedWorkIntentOutputsToClear) {
      await runtime.runtimeWorkGraphs.updateNodeStatus({
        nodeId: node.nodeId,
        nodeStatus: node.nodeStatus,
        outputArtifactRefs: [],
      });
    }
    if (
      (downstreamNodesToReset.length > 0 || plannedWorkIntentOutputsToClear.length > 0) &&
      ["needs_review", "failed", "canceled", "succeeded"].includes(sourceSnapshot.graph.graphStatus)
    ) {
      await runtime.runtimeWorkGraphs.updateGraphStatus({
        graphId,
        graphStatus: "running",
        metadata: {
          ...jsonRecord(sourceSnapshot.graph.metadata),
          boundaryReplayResumedAt: new Date().toISOString(),
          boundaryReplayResetKind: "after_work_intent_acceptance_downstream",
          boundaryReplayResetNodeIds: downstreamNodesToReset
            .map((node) => node.nodeId)
            .slice(0, 40),
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        },
      });
    }
    if (downstreamNodesToReset.length > 0 || plannedWorkIntentOutputsToClear.length > 0) {
      process.stdout.write(
        `${JSON.stringify({
          event: "product_spec_boundary_replay_progress",
          stage: "boundary_replay_reset_after_work_intent_acceptance",
          status: "completed",
          graphId,
          resetNodeIds: downstreamNodesToReset.map((node) => node.nodeId).slice(0, 80),
          clearedPlannedWorkIntentNodeIds: plannedWorkIntentOutputsToClear
            .map((node) => node.nodeId)
            .slice(0, 80),
          reasonCodes: ["boundary_replay_after_work_intent_acceptance_downstream_reset"],
        })}\n`,
      );
      sourceSnapshot = await runtime.runtimeWorkGraphs.readGraphSnapshot(graphId);
      if (!sourceSnapshot) {
        throw new Error(
          `runtime_graph_snapshot_missing_after_work_intent_boundary_reset:${graphId}`,
        );
      }
    }
  }

  const requirementMapArtifact = latestArtifact(artifacts, REQUIREMENT_MAP_ARTIFACT_TYPE);
  const hydratedRequirementMapArtifact = requirementMapArtifact
    ? await runtime.runtimeJobs.hydrateRuntimeArtifactByContract(requirementMapArtifact)
    : null;
  const requirementMapBody = jsonRecord(hydratedRequirementMapArtifact?.body);
  const requirementMapParse = RequirementMapSchema.safeParse(
    Array.isArray(requirementMapBody.requirements)
      ? requirementMapBody
      : metadataOf(requirementMapArtifact),
  );
  const requirementMap = requirementMapParse.success ? requirementMapParse.data : null;
  const requirementMapAccepted = Boolean(requirementMap);
  const missionLedger = null;
  const isAfterGraphSelection = boundary === "after-graph-selection";
  const isSingleNodeWorkerPromptFileReplay =
    Boolean(workerPromptFileTextTurn) && executeWorkers && targetNodeIds.size === 1;
  if (isAfterGraphSelection && !graphIdFlag && !isSingleNodeWorkerPromptFileReplay) {
    throw new Error(`graph_id_required_for_boundary:${boundary}`);
  }
  if (isAfterGraphSelection && !executeWorkers) {
    const hasPlannedExecutableNode = sourceSnapshot.nodes.some(
      (node) => node.nodeStatus === "planned",
    );
    const reasonCodes = [];
    if (!hasPlannedExecutableNode) {
      reasonCodes.push(
        "planned_executable_graph_nodes_required_before_after_graph_selection_replay",
      );
    }
    if (reasonCodes.length > 0) {
      const summary = {
        artifactKind: "product_spec_boundary_replay_result",
        proofSourceKind: PRODUCT_SPEC_RUNTIME_BOUNDARY_REPLAY_PROOF_SOURCE,
        generatedAt: new Date().toISOString(),
        status: "needs_review",
        runtimeJobId,
        graphId,
        boundary,
        reasonCodes,
        plannedExecutableNodeCount: sourceSnapshot.nodes.filter(
          (node) => node.nodeStatus === "planned",
        ).length,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      };
      let resultArtifact = await writeJson("product-spec-boundary-replay-result.json", summary);
      let proofArtifact = await writeProofJson("proof.json", summary);
      await finalizeRunScopedProofSummary(summary, { resultArtifact, proofArtifact });
      resultArtifact = await writeJson("product-spec-boundary-replay-result.json", summary);
      proofArtifact = await writeProofJson("proof.json", summary);
      process.stdout.write(
        `${JSON.stringify({ event: "product_spec_boundary_replay_result", ...summary })}\n`,
      );
      process.exitCode = 1;
      return;
    }
  }
  const objective =
    typeof requirementMap?.requirements?.[0]?.text === "string"
      ? requirementMap.requirements[0].text
      : "Continue Product/Spec Planning scheduler replay from accepted RequirementMap.";
  const repoScopeRefs = [
    ...new Set([
      "extensions/execution-platform/src/",
      "src/gateway/",
      "scripts/",
      "docs/projects/execution-platform/",
    ]),
  ].slice(0, 80);
  const validationCommandRefs = [];

  let replayGraphId = graphId;
  let replayGraphCreated = false;
  if (boundary === "after-requirement-map") {
    replayGraphId = `${graphId}-scheduler-replay-${Date.now().toString(36)}`;
    await runtime.runtimeWorkGraphs.createGraph({
      graphId: replayGraphId,
      parentWorkItemId: sourceSnapshot.graph.parentWorkItemId ?? job.workItemId ?? null,
      rootRuntimeJobId: runtimeJobId,
      workflowId: sourceSnapshot.graph.workflowId,
      orchestratorModelRef: sourceSnapshot.graph.orchestratorModelRef,
      graphStatus: "running",
      metadata: {
        replaySourceGraphId: graphId,
        replayBoundary: boundary,
        replayCreatedAt: new Date().toISOString(),
        replayUsesAcceptedRequirementMap: true,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    });
    replayGraphCreated = true;
  }
  const replayStartSnapshot = await runtime.runtimeWorkGraphs.readGraphSnapshot(replayGraphId);
  if (!replayStartSnapshot) {
    throw new Error(`runtime_replay_graph_snapshot_missing:${replayGraphId}`);
  }

  const orchestrator = createSchedulerOrchestrator({
    runtime,
    runtimeJobId,
    boundary,
    objective,
    repoScopeRefs,
    validationCommandRefs,
  });
  for (const node of replayStartSnapshot.nodes) {
    if (node.nodeStatus === "succeeded") {
      orchestrator.noteNodeResult(node.nodeId, {
        status: "succeeded",
        outputArtifactRefs: node.outputArtifactRefs.slice(0, 16),
        reasonCodes: [
          `existing_node_status:${node.nodeStatus}`,
          ...(node.outputArtifactRefs.length > 16
            ? ["boundary_replay_existing_node_output_refs_manifest_compacted"]
            : []),
        ],
      });
    }
  }

  const stopExecutor = boundaryStopExecutor(boundary, orchestrator, { executeWorkers });
  const reviewerExecutor = executeWorkers
    ? createBoundaryReplayReviewerExecutor({
        runtime,
        runtimeJobId,
        graphId: replayGraphId,
        boundary,
        orchestrator,
      })
    : stopExecutor;
  const implementationExecutor = stopExecutor;
  const executors = {
    "role:test_engineer": implementationExecutor,
    "role:reviewer": reviewerExecutor,
    "role:observability_scribe": stopExecutor,
    "role:implementation_engineer": implementationExecutor,
    "kind:implementation": implementationExecutor,
    "kind:test_authoring": implementationExecutor,
    "kind:repair": stopExecutor,
    "kind:validation": stopExecutor,
    "kind:test_review": stopExecutor,
    "kind:reviewer": reviewerExecutor,
    "kind:observability_readback": stopExecutor,
    "kind:human_task": stopExecutor,
    "kind:closeout": stopExecutor,
  };
  const workflowDefinition = requireCanonicalWorkflowDefinition("agent_team.coding");
  const plugin = buildAgentTeamCodingWorkflowPlugin({
    definition: workflowDefinition,
    executors,
    requireSchedulerToolKernel: true,
  });
  const roleModelClient = workerPromptFileTextTurn ? null : createGatewayRoleModelClient();
  const promptTextModelClient =
    workerPromptFileTextTurn?.client ??
    createOpenRouterProviderTextTurnClient({
      client: roleModelClient,
      defaultRoleId: "implementation_engineer",
    });
  const workerExecutionPreflight = {
    promptTextModelClientPresent: Boolean(promptTextModelClient?.executeProviderTextTurn),
    workerPromptFileOverridePresent: Boolean(workerPromptFileTextTurn),
    workerPromptFileOverrideHash: workerPromptFileTextTurn?.responseHash ?? null,
    workerPromptFileOverrideByteCount: workerPromptFileTextTurn?.promptByteCount ?? null,
    nodeSessionExecutorPresent: true,
    nodeAgentProfileResolverPresent: true,
    openClawLaunchDependenciesConfigured: true,
    runtimeArtifactStoresAvailable: Boolean(runtime.runtimeJobs && runtime.runtimeWorkGraphs),
    gatewayReplayExecutorFactoryParity: true,
    reasonCodes: [
      "worker_execution_preflight_evaluated",
      promptTextModelClient?.executeProviderTextTurn
        ? "node_worker_prompt_transport_ready"
        : "node_worker_prompt_transport_missing",
      workerPromptFileTextTurn
        ? "boundary_replay_worker_prompt_file_text_turn_override_ready"
        : "boundary_replay_worker_prompt_file_text_turn_override_absent",
      "node_session_executor_factory:openclaw_node_session_executor",
      "node_agent_profile_resolver_ready",
      "openclaw_node_launch_dependencies_configured",
      "runtime_artifact_stores_available",
    ],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
  const progressEvents = [];
  let selectedBoundaryNode = null;
  const selectedBoundaryNodes = [];
  const scheduler = new RuntimeWorkGraphScheduler({
    graphs: runtime.runtimeWorkGraphs,
    runtimeToolKernel: runtime.runtimeToolKernel,
    requireSchedulerToolKernel: true,
    requireCostAwareCapabilityPolicy: true,
    requireEvidenceClaimsForMissionLedger: false,
    roleCoverageProfile: plugin.schedulerOptions.roleCoverageProfile,
    entryNodePolicy: plugin.schedulerOptions.entryNodePolicy ?? null,
    capabilityRegistrySummary: plugin.schedulerOptions.capabilityRegistrySummary,
    capabilityManifest: plugin.schedulerOptions.capabilityManifest,
    schedulerClosurePolicy: plugin.schedulerOptions.schedulerClosurePolicy ?? null,
    closureRunMode: "proof",
    orchestrator,
    executors,
    nodeAgentSessionRunner: createOpenClawNodeSessionExecutor({
      runtimeJobs: runtime.runtimeJobs,
      promptTextModelClient,
    }),
    resolveNodeAgentProfile: createGatewayNodeAgentProfileResolver(),
    missionLedger,
    requirementMap,
    requirementMapRef: requirementMap?.mapRef ?? requirementMapArtifact?.uri ?? null,
    evaluateMissionLedger: async (input) =>
      evaluateReplayMissionLedger({
        runtime,
        runtimeJobId,
        boundary,
        graphId: input.graphId,
        iteration: input.iteration,
        nodeId: input.nodeId,
        ledger: input.ledger,
        outputArtifactRefs: input.outputArtifactRefs,
        evidenceClaims: input.evidenceClaims,
        reasonCodes: input.reasonCodes,
        snapshotSummary: input.snapshotSummary,
      }),
    maxIterations,
    maxParallelNodeExecutions,
    attachPayloadArtifact: async (artifact) => {
      const artifactRef = await attachReplayArtifact(
        runtime,
        artifact.jobId,
        artifact.artifactType,
        artifact.uri,
        artifact.body,
      );
      return {
        artifactRef,
        reasonCodes: ["boundary_replay_attached_worker_start_payload_artifact"],
      };
    },
    beforeNodeExecution: async ({ node }) => {
      if (boundaryStopsBeforeWorkerExecution(boundary, node, { executeWorkers })) {
        const metadata = jsonRecord(node.metadata);
        const selected = {
          nodeId: node.nodeId,
          nodeKind: node.nodeKind,
          assignedRole: node.assignedRole ?? null,
          capabilityId:
            node.metadata && typeof node.metadata === "object"
              ? (node.metadata.capabilityId ?? null)
              : null,
          nodeAgentSessionRef:
            typeof metadata.nodeAgentSessionRef === "string" ? metadata.nodeAgentSessionRef : null,
          nodeLifecycleProjectionRef:
            typeof metadata.nodeLifecycleProjectionRef === "string"
              ? metadata.nodeLifecycleProjectionRef
              : null,
          nodeLifecycleProjectionStatus:
            typeof metadata.nodeLifecycleProjectionStatus === "string"
              ? metadata.nodeLifecycleProjectionStatus
              : null,
        };
        selectedBoundaryNode ??= selected;
        selectedBoundaryNodes.push(selected);
        return {
          status: "waiting_for_human",
          iterations: 0,
          addedNodeIds: [],
          executedNodeIds: [],
          selectedNodeId: node.nodeId,
          reasonCodes: [
            boundarySelectedReasonCode(boundary),
            "agent_session_replay_unavailable",
            "boundary_replay_terminal_frontier_selected_without_native_agent_execution",
            "boundary_replay_stopped_before_worker_execution_without_preworker_materialization",
            "boundary_replay_did_not_fake_node_finish_or_worker_completion",
            `boundary_replay_target_node_kind:${node.nodeKind}`,
          ],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
        };
      }
      return null;
    },
    onProgress: async (progress) => {
      const bounded = {
        stage: progress.stage,
        status: progress.status,
        nodeId: progress.nodeId ?? null,
        roleId: progress.roleId ?? null,
        currentPhase: progress.currentPhase ?? null,
        schedulerPhase: progress.schedulerPhase ?? null,
        schedulerToolId: progress.schedulerToolId ?? null,
        objective: progress.currentObjective ?? null,
        reasonCodes: (progress.reasonCodes ?? []).slice(0, 12),
        blockerSummary: progress.blockerSummary ?? null,
        eli5Progress: progress.eli5Progress ?? null,
      };
      progressEvents.push(bounded);
      await runtime.runtimeJobs.attachArtifact({
        jobId: runtimeJobId,
        artifactType: "execution_platform.product_spec_boundary_replay_progress",
        storageKind: "metadata",
        uri: `runtime-job://${runtimeJobId}/product-spec-boundary-replay/progress/${String(progressEvents.length).padStart(3, "0")}-${progress.stage}`,
        contentType: "application/json",
        metadata: {
          artifactKind: "product_spec_boundary_replay_progress",
          boundary,
          ...bounded,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
        },
      });
      process.stdout.write(
        `${JSON.stringify({ event: "product_spec_boundary_replay_progress", ...bounded })}\n`,
      );
      if (
        isAfterGraphSelection &&
        progress.stage === "scheduler_tool" &&
        progress.status === "completed" &&
        (progress.schedulerToolId === "scheduler.approve_and_run_first_node" ||
          progress.schedulerToolId === "scheduler.select_next_node") &&
        typeof progress.nodeId === "string" &&
        progress.nodeId.trim()
      ) {
        const currentSnapshot = await runtime.runtimeWorkGraphs.readGraphSnapshot(replayGraphId);
        const targetNode = currentSnapshot?.nodes.find((node) => node.nodeId === progress.nodeId);
        if (targetNode) {
          selectedBoundaryNode = {
            nodeId: progress.nodeId,
            nodeKind: targetNode.nodeKind,
            roleId: targetNode.assignedRole,
            objective: progress.currentObjective ?? null,
            reasonCodes: (progress.reasonCodes ?? []).slice(0, 12),
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
            rawToolLogStored: false,
          };
        }
      }
    },
  });

  const preflight = {
    artifactKind: "product_spec_boundary_replay_preflight",
    generatedAt: new Date().toISOString(),
    runtimeJobId,
    sourceGraphId: graphId,
    graphId: replayGraphId,
    boundary,
    replayGraphCreated,
    maxIterations,
    executeWorkers,
    requirementMapRef: requirementMap?.mapRef ?? requirementMapArtifact?.uri ?? null,
    requirementMapHydrationStatus: hydratedRequirementMapArtifact?.status ?? null,
    requirementMapAccepted,
    nativeNodeSessionReplayBoundary: true,
    workerExecutionPreflight,
    snapshot: summarizeSnapshot(replayStartSnapshot),
    routerRerun: false,
    missionLedgerRerun: false,
    commitmentPacketAuthorRerun: false,
    contextScoutRerun: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
  const preflightArtifact = await writeJson(
    "product-spec-boundary-replay-preflight.json",
    preflight,
  );
  const proofPreflightArtifact = await writeProofJson("preflight.json", preflight);
  if (workerPromptFileTextTurn) {
    await emitReplayState({
      runtime,
      runtimeJobId,
      event: "worker_prompt_file_text_turn_override_ready",
      graphId: replayGraphId,
      boundary,
      phase: "worker_prompt_authoring",
      status: "completed",
      details: {
        promptFile: workerPromptFileTextTurn.promptFile,
        promptHash: workerPromptFileTextTurn.responseHash,
        promptByteCount: workerPromptFileTextTurn.promptByteCount,
        targetNodeIds: [...targetNodeIds],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    });
  }
  if (
    executeWorkers &&
    workerPromptFileTextTurn &&
    boundary === "after-graph-selection" &&
    targetNodeIds.size === 1
  ) {
    const [targetNodeId] = [...targetNodeIds];
    const targetNode = replayStartSnapshot.nodes.find((node) => node.nodeId === targetNodeId);
    if (!targetNode) {
      throw new Error(`boundary_replay_target_node_missing:${targetNodeId}`);
    }
    const attemptId = `boundary-replay-single-node-${Date.now().toString(36)}`;
    const nodeExecutionSnapshot = buildNodeExecutionSnapshotFromGraphNode({
      snapshot: replayStartSnapshot,
      graphId: replayGraphId,
      node: targetNode,
      attemptId,
    });
    selectedBoundaryNode = {
      nodeId: targetNode.nodeId,
      nodeKind: targetNode.nodeKind,
      assignedRole: targetNode.assignedRole ?? null,
      capabilityId:
        targetNode.metadata && typeof targetNode.metadata === "object"
          ? (targetNode.metadata.capabilityId ?? null)
          : null,
      nodeExecutionSnapshotRef: nodeExecutionSnapshot.snapshotRef,
      nodeRunId: nodeExecutionSnapshot.nodeRunId,
      nodeAgentId: nodeExecutionSnapshot.agentId,
      nodeAgentSessionKey: nodeExecutionSnapshot.sessionKey,
      workerPromptFile: workerPromptFileTextTurn.promptFile,
      workerPromptHash: workerPromptFileTextTurn.responseHash,
      workerPromptByteCount: workerPromptFileTextTurn.promptByteCount,
    };
    selectedBoundaryNodes.push(selectedBoundaryNode);
    await emitReplayState({
      runtime,
      runtimeJobId,
      event: "single_node_worker_replay_started",
      graphId: replayGraphId,
      boundary,
      phase: "worker_execution",
      status: "running",
      details: {
        nodeId: targetNode.nodeId,
        nodeKind: targetNode.nodeKind,
        assignedRole: targetNode.assignedRole ?? null,
        nodeExecutionSnapshotRef: nodeExecutionSnapshot.snapshotRef,
        nodeRunId: nodeExecutionSnapshot.nodeRunId,
        nodeAgentId: nodeExecutionSnapshot.agentId,
        nodeAgentSessionKey: nodeExecutionSnapshot.sessionKey,
        promptHash: workerPromptFileTextTurn.responseHash,
        promptByteCount: workerPromptFileTextTurn.promptByteCount,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    });
    const nodeRunner = createOpenClawNodeSessionExecutor({
      runtimeJobs: runtime.runtimeJobs,
      promptTextModelClient,
      fixedWorkerPrompt: {
        promptText: workerPromptFileTextTurn.promptText,
        modelRunRef: workerPromptFileTextTurn.modelRunRef,
        promptHash: workerPromptFileTextTurn.responseHash,
      },
    });
    const workerStartedAt = Date.now();
    let workerResult;
    try {
      workerResult = await nodeRunner({
        graphId: replayGraphId,
        iteration: 1,
        snapshot: replayStartSnapshot,
        node: targetNode,
        nodeExecutionSnapshot,
        missionLedgerSummary: null,
        rawPromptStored: false,
        rawResponseStored: false,
      });
    } catch (error) {
      const errorSummary = String(error?.message ?? error).slice(0, 500);
      const reasonCodes = [
        "boundary_replay_single_node_native_worker_execution_error",
        "boundary_replay_provider_error_terminalized",
      ];
      await emitReplayState({
        runtime,
        runtimeJobId,
        event: "single_node_worker_replay_failed_terminalized",
        graphId: replayGraphId,
        boundary,
        phase: "worker_execution",
        status: "needs_review",
        details: {
          nodeId: targetNode.nodeId,
          nodeKind: targetNode.nodeKind,
          assignedRole: targetNode.assignedRole ?? null,
          nodeRunId: nodeExecutionSnapshot.nodeRunId,
          nodeAgentSessionKey: nodeExecutionSnapshot.sessionKey,
          errorName: error?.name ?? "unknown_error",
          errorMessageHash: sha256(error?.message ?? String(error)),
          errorSummary,
          reasonCodes,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
        },
      });
      workerResult = {
        status: "needs_review",
        outputArtifactRefs: [],
        reasonCodes,
        metadata: {
          nodeExecutionSnapshotRef: nodeExecutionSnapshot.snapshotRef,
          nodeAgentSessionTraceRef: null,
          workerExecutionErrorName: error?.name ?? "unknown_error",
          workerExecutionErrorMessageHash: sha256(error?.message ?? String(error)),
          workerExecutionErrorSummary: errorSummary,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
        },
      };
    }
    const elapsedMs = Date.now() - workerStartedAt;
    const workerStatus =
      workerResult.status === "succeeded"
        ? "succeeded"
        : workerResult.status === "waiting_for_human"
          ? "waiting_for_human"
          : "needs_review";
    const workerMetadata = jsonRecord(workerResult.metadata);
    await runtime.runtimeWorkGraphs.updateNodeStatus({
      nodeId: targetNode.nodeId,
      nodeStatus: workerStatus === "succeeded" ? "succeeded" : "needs_review",
      outputArtifactRefs: Array.isArray(workerResult.outputArtifactRefs)
        ? workerResult.outputArtifactRefs
        : [],
      metadataPatch: {
        ...workerMetadata,
        boundaryReplaySingleNodeWorkerPromptFile: workerPromptFileTextTurn.promptFile,
        boundaryReplaySingleNodeWorkerPromptHash: workerPromptFileTextTurn.responseHash,
        boundaryReplaySingleNodeWorkerElapsedMs: elapsedMs,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      },
    });
    selectedBoundaryNode = {
      ...selectedBoundaryNode,
      status: workerResult.status,
      nodeExecutionSnapshotRef:
        typeof workerMetadata.nodeExecutionSnapshotRef === "string"
          ? workerMetadata.nodeExecutionSnapshotRef
          : nodeExecutionSnapshot.snapshotRef,
      nodeWorkerPromptRef:
        typeof workerMetadata.nodeWorkerPromptRef === "string"
          ? workerMetadata.nodeWorkerPromptRef
          : null,
      nodeWorkerPromptArtifactRef:
        typeof workerMetadata.nodeWorkerPromptArtifactRef === "string"
          ? workerMetadata.nodeWorkerPromptArtifactRef
          : null,
      nodeAgentSessionTraceRef:
        typeof workerMetadata.nodeAgentSessionTraceRef === "string"
          ? workerMetadata.nodeAgentSessionTraceRef
          : null,
      nodeFinishArtifactRef:
        typeof workerMetadata.nodeFinishArtifactRef === "string"
          ? workerMetadata.nodeFinishArtifactRef
          : null,
      nodeFinishStatus:
        typeof workerMetadata.nodeFinishStatus === "string"
          ? workerMetadata.nodeFinishStatus
          : null,
      nodeFinishBlockerKind:
        typeof workerMetadata.nodeFinishBlockerKind === "string"
          ? workerMetadata.nodeFinishBlockerKind
          : null,
      outputArtifactRefs: Array.isArray(workerResult.outputArtifactRefs)
        ? workerResult.outputArtifactRefs.slice(0, 20)
        : [],
      reasonCodes: Array.isArray(workerResult.reasonCodes)
        ? workerResult.reasonCodes.slice(0, 40)
        : [],
      elapsedMs,
    };
    selectedBoundaryNodes[0] = selectedBoundaryNode;
    await emitReplayState({
      runtime,
      runtimeJobId,
      event: "single_node_worker_replay_completed",
      graphId: replayGraphId,
      boundary,
      phase: "worker_execution",
      status: workerStatus,
      details: {
        nodeId: targetNode.nodeId,
        nodeKind: targetNode.nodeKind,
        assignedRole: targetNode.assignedRole ?? null,
        nodeRunId: nodeExecutionSnapshot.nodeRunId,
        nodeAgentSessionKey: nodeExecutionSnapshot.sessionKey,
        nodeWorkerPromptRef: selectedBoundaryNode.nodeWorkerPromptRef,
        nodeAgentSessionTraceRef: selectedBoundaryNode.nodeAgentSessionTraceRef,
        nodeFinishArtifactRef: selectedBoundaryNode.nodeFinishArtifactRef,
        nodeFinishStatus: selectedBoundaryNode.nodeFinishStatus,
        nodeFinishBlockerKind: selectedBoundaryNode.nodeFinishBlockerKind,
        outputArtifactRefs: selectedBoundaryNode.outputArtifactRefs,
        reasonCodes: selectedBoundaryNode.reasonCodes,
        elapsedMs,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    });
    const finalSnapshot = await runtime.runtimeWorkGraphs.readGraphSnapshot(replayGraphId);
    const schedulerResult = {
      status: workerStatus,
      graphId: replayGraphId,
      iterations: 1,
      addedNodeIds: [],
      executedNodeIds: [targetNode.nodeId],
      selectedNodeId: targetNode.nodeId,
      decisionRefs: Array.isArray(workerResult.outputArtifactRefs)
        ? workerResult.outputArtifactRefs.slice(0, 20)
        : [],
      reasonCodes: uniqueRefs(
        [
          "boundary_replay_single_node_native_worker_executed",
          "boundary_replay_worker_prompt_file_text_turn_override_used",
          ...(Array.isArray(workerResult.reasonCodes) ? workerResult.reasonCodes : []),
        ],
        80,
      ),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      workQueueLifecycleMutated: false,
    };
    const summary = {
      artifactKind: "product_spec_boundary_replay_result",
      proofSourceKind: PRODUCT_SPEC_RUNTIME_BOUNDARY_REPLAY_PROOF_SOURCE,
      generatedAt: new Date().toISOString(),
      status: schedulerResult.status,
      runtimeJobId,
      sourceGraphId: graphId,
      graphId: replayGraphId,
      replayGraphCreated,
      boundary,
      maxParallelNodeExecutions,
      executeWorkers,
      schedulerResult,
      selectedBoundaryNode,
      selectedBoundaryNodes,
      beforeGraph: preflight.snapshot,
      afterGraph: finalSnapshot ? summarizeSnapshot(finalSnapshot) : null,
      sourceGraphUnchanged: false,
      progressEventCount: progressEvents.length,
      latestProgressEvents: progressEvents.slice(-20),
      preflightArtifact,
      proofPreflightArtifact,
      routerRerun: false,
      missionLedgerRerun: false,
      commitmentPacketAuthorRerun: false,
      contextScoutRerun: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    };
    let resultArtifact = await writeJson("product-spec-boundary-replay-result.json", summary);
    let proofArtifact = await writeProofJson("proof.json", summary);
    await finalizeRunScopedProofSummary(summary, { resultArtifact, proofArtifact });
    resultArtifact = await writeJson("product-spec-boundary-replay-result.json", summary);
    proofArtifact = await writeProofJson("proof.json", summary);
    await writeJson("product-spec-boundary-replay-artifact-index.json", {
      artifactKind: "product_spec_boundary_replay_artifact_index",
      generatedAt: new Date().toISOString(),
      artifacts: [
        preflightArtifact,
        resultArtifact,
        proofPreflightArtifact,
        proofArtifact,
        summary.proofRunManifestArtifact,
      ].filter(Boolean),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    });
    process.stdout.write(
      `${JSON.stringify({
        event: "product_spec_boundary_replay_result",
        status: summary.status,
        runtimeJobId,
        sourceGraphId: graphId,
        graphId: replayGraphId,
        boundary,
        iterations: 1,
        addedNodeIds: [],
        executedNodeIds: schedulerResult.executedNodeIds,
        selectedNodeId: targetNode.nodeId,
        reasonCodes: schedulerResult.reasonCodes,
        artifactIndexPath:
          ".artifacts/execution-platform/product-spec-boundary-replay-artifact-index.json",
        proofArtifactPath:
          ".artifacts/execution-platform/product-spec-replay-proof-worker-execution/proof.json",
      })}\n`,
    );
    process.exitCode = diagnosticExitZero || schedulerResult.status === "succeeded" ? 0 : 1;
    return;
  }
  if (executeWorkers && !workerExecutionPreflight.promptTextModelClientPresent) {
    const blockerReasonCodes = [
      "worker_execution_preflight_blocked",
      "node_worker_prompt_transport_missing",
    ];
    const summary = {
      artifactKind: "product_spec_boundary_replay_result",
      proofSourceKind: PRODUCT_SPEC_RUNTIME_BOUNDARY_REPLAY_PROOF_SOURCE,
      generatedAt: new Date().toISOString(),
      status: "needs_review",
      runtimeJobId,
      sourceGraphId: graphId,
      graphId: replayGraphId,
      replayGraphCreated,
      boundary,
      maxParallelNodeExecutions,
      executeWorkers,
      schedulerResult: {
        status: "needs_review",
        iterations: 0,
        addedNodeIds: [],
        executedNodeIds: [],
        selectedNodeId: null,
        reasonCodes: blockerReasonCodes,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      },
      selectedBoundaryNode,
      selectedBoundaryNodes,
      beforeGraph: preflight.snapshot,
      afterGraph: preflight.snapshot,
      sourceGraphUnchanged: false,
      progressEventCount: progressEvents.length,
      latestProgressEvents: progressEvents.slice(-20),
      preflightArtifact,
      proofPreflightArtifact,
      routerRerun: false,
      missionLedgerRerun: false,
      commitmentPacketAuthorRerun: false,
      contextScoutRerun: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      reasonCodes: blockerReasonCodes,
    };
    let resultArtifact = await writeJson("product-spec-boundary-replay-result.json", summary);
    let proofArtifact = await writeProofJson("proof.json", summary);
    await finalizeRunScopedProofSummary(summary, { resultArtifact, proofArtifact });
    resultArtifact = await writeJson("product-spec-boundary-replay-result.json", summary);
    proofArtifact = await writeProofJson("proof.json", summary);
    await writeJson("product-spec-boundary-replay-artifact-index.json", {
      artifactKind: "product_spec_boundary_replay_artifact_index",
      generatedAt: new Date().toISOString(),
      artifacts: [
        preflightArtifact,
        resultArtifact,
        proofPreflightArtifact,
        proofArtifact,
        summary.proofRunManifestArtifact,
      ].filter(Boolean),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    });
    process.stdout.write(
      `${JSON.stringify({
        event: "product_spec_boundary_replay_result",
        status: summary.status,
        runtimeJobId,
        sourceGraphId: graphId,
        graphId: replayGraphId,
        boundary,
        iterations: 0,
        addedNodeIds: [],
        executedNodeIds: [],
        reasonCodes: blockerReasonCodes,
        artifactIndexPath:
          ".artifacts/execution-platform/product-spec-boundary-replay-artifact-index.json",
      })}\n`,
    );
    process.exitCode = diagnosticExitZero ? 0 : 1;
    return;
  }
  process.stdout.write(
    `${JSON.stringify({
      event: "product_spec_boundary_replay_start",
      runtimeJobId,
      sourceGraphId: graphId,
      graphId: replayGraphId,
      boundary,
      maxIterations,
      executeWorkers,
    })}\n`,
  );
  if (isAfterGraphSelection && !executeWorkers) {
    const plannedImplementationFrontier = replayStartSnapshot.nodes
      .filter((node) => {
        const metadata = jsonRecord(node.metadata);
        return (
          node.nodeStatus === "planned" &&
          (targetNodeIds.size === 0 || targetNodeIds.has(node.nodeId)) &&
          nodeKindCanRunNativeAgent(node.nodeKind) &&
          typeof metadata.sourceSplitFromNodeId !== "string"
        );
      })
      .slice(0, maxParallelNodeExecutions);
    for (const node of plannedImplementationFrontier) {
      const metadata = jsonRecord(node.metadata);
      selectedBoundaryNodes.push({
        nodeId: node.nodeId,
        nodeKind: node.nodeKind,
        assignedRole: node.assignedRole ?? null,
        capabilityId: typeof metadata.capabilityId === "string" ? metadata.capabilityId : null,
        nodeAgentSessionRef:
          typeof metadata.nodeAgentSessionRef === "string" ? metadata.nodeAgentSessionRef : null,
        nodeLifecycleProjectionRef:
          typeof metadata.nodeLifecycleProjectionRef === "string"
            ? metadata.nodeLifecycleProjectionRef
            : null,
        nodeLifecycleProjectionStatus:
          typeof metadata.nodeLifecycleProjectionStatus === "string"
            ? metadata.nodeLifecycleProjectionStatus
            : null,
        targetFileRefs: metadataStringArray(metadata, "targetRefs").slice(0, 20),
      });
    }
    selectedBoundaryNode = selectedBoundaryNodes[0] ?? null;
    const nativeAgentSessionReadyNodeCount = selectedBoundaryNodes.filter(
      (node) => typeof node.nodeLifecycleProjectionRef === "string",
    ).length;
    const schedulerResult = {
      status: selectedBoundaryNodes.length > 0 ? "waiting_for_human" : "needs_review",
      iterations: 0,
      addedNodeIds: selectedBoundaryNodes.map((node) => node.nodeId),
      executedNodeIds: [],
      selectedNodeId: selectedBoundaryNode?.nodeId ?? null,
      reasonCodes: [
        "boundary_replay_after_graph_selection_native_worker_frontier_selected",
        `boundary_replay_planned_implementation_frontier_count:${plannedImplementationFrontier.length}`,
        "preworker_fixed_resource_phase_removed",
        "native_agent_session_lifecycle_required",
      ],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    };
    const finalSnapshot = await runtime.runtimeWorkGraphs.readGraphSnapshot(replayGraphId);
    await emitReplayState({
      runtime,
      runtimeJobId,
      event: "after_graph_selection_worker_frontier_selected",
      graphId: replayGraphId,
      boundary,
      phase: "worker_frontier_selection",
      status: schedulerResult.status,
      details: {
        activeNodeIds: selectedBoundaryNodes.map((node) => node.nodeId).slice(0, 80),
        nativeAgentSessionReadyNodeCount,
        payloadRefs: selectedBoundaryNodes
          .flatMap((node) => [node.nodeAgentSessionRef, node.nodeLifecycleProjectionRef])
          .filter(Boolean)
          .slice(0, 80),
        blockers: [],
        nextLegalTransition:
          selectedBoundaryNodes.length > 0 ? "node.agent_session.invoke" : "needs_review",
        proofGateStatus: schedulerResult.status,
      },
    });
    const summary = {
      artifactKind: "product_spec_boundary_replay_result",
      proofSourceKind: PRODUCT_SPEC_RUNTIME_BOUNDARY_REPLAY_PROOF_SOURCE,
      generatedAt: new Date().toISOString(),
      status: schedulerResult.status,
      runtimeJobId,
      sourceGraphId: graphId,
      graphId: replayGraphId,
      replayGraphCreated,
      boundary,
      maxParallelNodeExecutions,
      executeWorkers: false,
      schedulerResult,
      selectedBoundaryNode,
      selectedBoundaryNodes,
      beforeGraph: preflight.snapshot,
      afterGraph: finalSnapshot ? summarizeSnapshot(finalSnapshot) : null,
      sourceGraphUnchanged: false,
      progressEventCount: progressEvents.length,
      latestProgressEvents: progressEvents.slice(-20),
      preflightArtifact,
      proofPreflightArtifact,
      routerRerun: false,
      missionLedgerRerun: false,
      commitmentPacketAuthorRerun: false,
      contextScoutRerun: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    };
    let resultArtifact = await writeJson("product-spec-boundary-replay-result.json", summary);
    let proofArtifact = await writeProofJson("proof.json", summary);
    await finalizeRunScopedProofSummary(summary, { resultArtifact, proofArtifact });
    resultArtifact = await writeJson("product-spec-boundary-replay-result.json", summary);
    proofArtifact = await writeProofJson("proof.json", summary);
    const checkpointBoundaryName = "after-graph-selection-worker-frontier";
    await runtime.runtimeWorkGraphs.recordCheckpoint({
      graphId: replayGraphId,
      checkpointId: `${replayGraphId}:${checkpointBoundaryName}`,
      checkpointKind: "after_graph_selection_worker_frontier",
      stateSummary: `After graph selection replay selected ${selectedBoundaryNodes.length} worker-owned context frontier node(s).`,
      artifactRefs: [proofArtifact.path, resultArtifact.path].slice(0, 8),
    });
    await recordCanonicalBoundaryReplayCheckpoint({
      runtime,
      runtimeJobId,
      graphId: replayGraphId,
      workflowId: replayStartSnapshot.graph.workflowId,
      checkpointKind: "before_worker_invocation",
      acceptedArtifactRefs: [proofArtifact.path, resultArtifact.path],
      upstreamArtifactRefs: selectedBoundaryNodes
        .flatMap((item) => [item?.nodeAgentSessionRef, item?.nodeLifecycleProjectionRef])
        .filter((ref) => typeof ref === "string" && ref.trim()),
      currentNodeIds: selectedBoundaryNodes.map((item) => item.nodeId),
      replayContinuationMode: selectedBoundaryNodes.length > 0 ? "run_node" : "repair_boundary",
      replaySafetyStatus: "safe_to_replay",
      reasonCodes: ["after_graph_selection_worker_frontier_checkpoint_recorded"],
    });
    await writeJson("product-spec-boundary-replay-artifact-index.json", {
      artifactKind: "product_spec_boundary_replay_artifact_index",
      generatedAt: new Date().toISOString(),
      artifacts: [
        preflightArtifact,
        resultArtifact,
        proofPreflightArtifact,
        proofArtifact,
        summary.proofRunManifestArtifact,
      ].filter(Boolean),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    });
    await runtime.runtimeJobs.attachArtifact({
      jobId: runtimeJobId,
      artifactType: "execution_platform.product_spec_replay_proof_worker_execution",
      storageKind: "metadata",
      uri: `runtime-job://${runtimeJobId}/product-spec-replay-proof-worker-execution/proof/${boundary}/${Date.now()}`,
      contentType: "application/json",
      metadata: compactBoundaryReplayResultMetadata(summary, proofArtifact),
    });
    process.stdout.write(
      `${JSON.stringify({
        event: "product_spec_boundary_replay_result",
        status: schedulerResult.status,
        runtimeJobId,
        sourceGraphId: graphId,
        graphId: replayGraphId,
        boundary,
        iterations: 0,
        addedNodeIds: schedulerResult.addedNodeIds,
        executedNodeIds: [],
        reasonCodes: schedulerResult.reasonCodes,
        nativeAgentSessionReadyNodeCount,
        nodeCount: summary.afterGraph?.nodeCount ?? null,
        edgeCount: summary.afterGraph?.edgeCount ?? null,
        artifactIndexPath:
          ".artifacts/execution-platform/product-spec-boundary-replay-artifact-index.json",
        proofArtifactPath:
          ".artifacts/execution-platform/product-spec-replay-proof-worker-execution/proof.json",
      })}\n`,
    );
    if (schedulerResult.status !== "succeeded") {
      process.exitCode = 1;
    }
    return;
  }
  let schedulerResult;
  try {
    schedulerResult = await scheduler.run(replayGraphId);
  } catch (error) {
    if (error instanceof BoundaryReplayStop) {
      schedulerResult = error.boundaryResult;
    } else {
      throw error;
    }
  }
  if (
    !executeWorkers &&
    selectedBoundaryNodes.length > 0 &&
    (schedulerResult.status === "waiting_for_human" ||
      schedulerResult.status === "max_iterations") &&
    Array.isArray(schedulerResult.reasonCodes) &&
    schedulerResult.reasonCodes.some((code) => String(code).startsWith("boundary_replay_")) &&
    !schedulerResult.reasonCodes.includes("agent_session_replay_unavailable")
  ) {
    schedulerResult = {
      ...schedulerResult,
      status: "succeeded",
      selectedNodeId:
        schedulerResult.selectedNodeId ??
        selectedBoundaryNode?.nodeId ??
        selectedBoundaryNodes[0]?.nodeId,
      reasonCodes: [
        ...schedulerResult.reasonCodes,
        "boundary_replay_frontier_selection_terminalized_without_worker_execution",
      ],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    };
  }
  const finalSnapshot = await runtime.runtimeWorkGraphs.readGraphSnapshot(replayGraphId);
  const summary = {
    artifactKind: "product_spec_boundary_replay_result",
    proofSourceKind: PRODUCT_SPEC_RUNTIME_BOUNDARY_REPLAY_PROOF_SOURCE,
    generatedAt: new Date().toISOString(),
    status: schedulerResult.status,
    runtimeJobId,
    sourceGraphId: graphId,
    graphId: replayGraphId,
    replayGraphCreated,
    boundary,
    maxParallelNodeExecutions,
    executeWorkers,
    schedulerResult,
    selectedBoundaryNode,
    selectedBoundaryNodes,
    beforeGraph: preflight.snapshot,
    afterGraph: finalSnapshot ? summarizeSnapshot(finalSnapshot) : null,
    sourceGraphUnchanged: null,
    progressEventCount: progressEvents.length,
    latestProgressEvents: progressEvents.slice(-20),
    preflightArtifact,
    proofPreflightArtifact,
    routerRerun: false,
    missionLedgerRerun: false,
    commitmentPacketAuthorRerun: false,
    contextScoutRerun: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
  let resultArtifact = await writeJson("product-spec-boundary-replay-result.json", summary);
  let proofArtifact = await writeProofJson("proof.json", summary);
  await finalizeRunScopedProofSummary(summary, { resultArtifact, proofArtifact });
  resultArtifact = await writeJson("product-spec-boundary-replay-result.json", summary);
  proofArtifact = await writeProofJson("proof.json", summary);
  await writeJson("product-spec-boundary-replay-artifact-index.json", {
    artifactKind: "product_spec_boundary_replay_artifact_index",
    generatedAt: new Date().toISOString(),
    artifacts: [
      preflightArtifact,
      resultArtifact,
      proofPreflightArtifact,
      proofArtifact,
      summary.proofRunManifestArtifact,
    ].filter(Boolean),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  });
  await runtime.runtimeJobs.attachArtifact({
    jobId: runtimeJobId,
    artifactType: "execution_platform.product_spec_boundary_replay_result",
    storageKind: "metadata",
    uri: `runtime-job://${runtimeJobId}/product-spec-boundary-replay/result/${boundary}/${Date.now()}`,
    contentType: "application/json",
    metadata: compactBoundaryReplayResultMetadata(summary, resultArtifact),
  });
  await runtime.runtimeJobs.attachArtifact({
    jobId: runtimeJobId,
    artifactType: "execution_platform.product_spec_replay_proof_worker_execution",
    storageKind: "metadata",
    uri: `runtime-job://${runtimeJobId}/product-spec-replay-proof-worker-execution/proof/${boundary}/${Date.now()}`,
    contentType: "application/json",
    metadata: compactBoundaryReplayResultMetadata(summary, proofArtifact),
  });
  process.stdout.write(
    `${JSON.stringify({
      event: "product_spec_boundary_replay_result",
      status: schedulerResult.status,
      runtimeJobId,
      sourceGraphId: graphId,
      graphId: replayGraphId,
      boundary,
      iterations: schedulerResult.iterations,
      addedNodeIds: schedulerResult.addedNodeIds,
      executedNodeIds: schedulerResult.executedNodeIds,
      reasonCodes: schedulerResult.reasonCodes.slice(-20),
      nodeCount: summary.afterGraph?.nodeCount ?? null,
      edgeCount: summary.afterGraph?.edgeCount ?? null,
      artifactIndexPath:
        ".artifacts/execution-platform/product-spec-boundary-replay-artifact-index.json",
    })}\n`,
  );
  if (
    !diagnosticExitZero &&
    ["failed", "needs_review", "max_iterations"].includes(schedulerResult.status)
  ) {
    process.exitCode = 1;
  }
}

installReplaySignalTerminalizers();

main()
  .catch(async (error) => {
    const stackSummary =
      error instanceof Error && typeof error.stack === "string"
        ? error.stack.split(/\r?\n/).slice(0, 8)
        : [];
    const summary = {
      artifactKind: "product_spec_boundary_replay_error",
      proofSourceKind: PRODUCT_SPEC_RUNTIME_BOUNDARY_REPLAY_PROOF_SOURCE,
      generatedAt: new Date().toISOString(),
      errorName: error?.name ?? "unknown_error",
      errorMessageHash: sha256(error?.message ?? String(error)),
      errorSummary: String(error?.message ?? error).slice(0, 500),
      errorStackSummary: stackSummary,
      errorStackHash: stackSummary.length > 0 ? sha256(stackSummary.join("\n")) : null,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    };
    await writeJson("product-spec-boundary-replay-error.json", summary);
    process.stderr.write(`${JSON.stringify(summary)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await shutdownReplayProcess();
  });
