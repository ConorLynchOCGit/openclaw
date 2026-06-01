#!/usr/bin/env node
import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const {
  buildAgentTeamCodingWorkflowPlugin,
  CodexDynamicJsonClient,
  DEFAULT_DYNAMIC_ORCHESTRATOR_MODEL_REF,
  DEFAULT_DYNAMIC_ORCHESTRATOR_PROVIDER_PATH,
  CodingResourcePacketSchema,
  ImplementationTaskPacketSchema,
  ModelAgnosticFileEditWorkerAdapter,
  NonCodexToolUsingWorkerLoop,
  NodeExecutionContractSchema,
  NodeExecutionPacketSchema,
  NodeReadinessStateSchema,
  OpenRouterAgentTeamModelClient,
  BoundaryReplayService,
  BOUNDARY_REPLAY_CHECKPOINT_KINDS,
  BOUNDARY_REPLAY_PRODUCTION_PROOF_BOUNDARY_IDS,
  boundaryReplayBoundaryIsDiagnosticOnly,
  boundaryReplayCheckpointKindForCliAlias,
  boundaryReplayCheckpointKindForProofBoundaryId,
  buildDomainResourceSelectionRequest,
  buildResourceSelectionFieldRepairRequest,
  buildResourceSelectionHandleManifest,
  buildMissingNodeExecutionPacketReadinessState,
  compileDomainResourceSelectionDecision,
  compileDomainResourceSelectionPacket,
  compileResourceSelectionPacket,
  ResourceSelectionPacketSchema,
  evaluateProductSpecReplayProofAdmission,
  buildProductSpecProofRunManifest,
  assertProductSpecProofRunManifestBounds,
  evaluateNodeExecutionPacketReadiness,
  applyMissionCommitmentEvaluation,
  ModelTaskClientRouter,
  nodeLifecyclePayloadBackedExecutionAuthorityFor,
  openBlockingMissionCommitments,
  parseMissionCommitmentEvaluation,
  parseDomainResourceSelectionModelToolCall,
  requireCanonicalWorkflowDefinition,
  resourceSelectionDecisionFromDomainResourceSelectionDecision,
  RuntimeWorkGraphScheduler,
  summarizeMissionContractLedger,
  requiredBoundaryReplayCheckpointKindsFor,
  runtimeNodeCapabilityManifestForModel,
  summarizeNodeExecutionPacketForReadback,
  PRODUCT_SPEC_RUNTIME_BOUNDARY_REPLAY_PROOF_SOURCE,
} = await tsImport(
  path.join(root, "extensions/execution-platform/runtime-api.ts"),
  import.meta.url,
);
const { validateImplementationTaskPacketForWorker } = await tsImport(
  path.join(root, "extensions/execution-platform/src/workflows/worker-execution-packets.ts"),
  import.meta.url,
);
const { compareReadinessProjectionToCurrent, projectReadinessDriftForReadback } = await tsImport(
  path.join(root, "extensions/execution-platform/src/workflows/readiness-recompute-authority.ts"),
  import.meta.url,
);
const { normalizeExecutionIntent, normalizeEvidenceModes } = await tsImport(
  path.join(root, "extensions/execution-platform/src/workflows/execution-intent.ts"),
  import.meta.url,
);
const { loadConfig } = await tsImport(path.join(root, "src/config/config.ts"), import.meta.url);
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
const execFileAsync = promisify(execFile);
let replayRuntimeShutdown = null;
let currentProofRunId = null;

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

function stringArray(value, fallback = []) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim())
    : fallback;
}

function jsonRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function repoFileRefs(values, max = 24) {
  return [
    ...new Set(
      values
        .filter((value) => {
          if (typeof value !== "string") {
            return false;
          }
          const trimmed = value.trim();
          return (
            trimmed.length > 0 &&
            !trimmed.includes("://") &&
            !trimmed.startsWith("/") &&
            !trimmed.includes("..") &&
            !trimmed.includes("\u0000")
          );
        })
        .map((value) => value.trim()),
    ),
  ].slice(0, max);
}

function boundedGraphOutputRefs(primaryRef, refs, max = 24) {
  const values = [primaryRef, ...(Array.isArray(refs) ? refs : [])]
    .filter((value) => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim());
  return [...new Set(values)].slice(0, max);
}

async function writeJson(name, value) {
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
    details,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
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
    readinessStatus: details.nodeReadinessStatus ?? details.readinessStatus ?? null,
    blockers: Array.isArray(details.blockers)
      ? details.blockers.filter((value) => typeof value === "string").slice(0, 40)
      : typeof details.blockerSummary === "string"
        ? [details.blockerSummary]
        : [],
    nextLegalTransition: details.nextLegalTransition ?? details.nextDecisionNeeded ?? null,
    wallTimeByPhase: details.wallTimeByPhase ?? {},
    tokenUsageByPhaseAndModel: details.tokenUsageByPhaseAndModel ?? {},
    tokenUsageEstimateOnly: details.tokenUsageEstimateOnly === true,
    latestTerminalEvent: ["completed", "needs_review", "failed", "canceled"].includes(
      String(status ?? ""),
    )
      ? safeEvent
      : null,
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

function artifactRefsByType(artifacts, artifactType, max = 16) {
  return artifacts
    .filter((artifact) => artifact.artifactType === artifactType)
    .map((artifact) => artifact.uri)
    .filter((uri) => typeof uri === "string" && uri.trim())
    .slice(-max);
}

function uniqueRefs(values, max = 40) {
  return [
    ...new Set(
      values.filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim()),
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
    proofFamily:
      summary.proofFamily ?? summary.productSpecProofAdmission?.proofFamily ?? null,
    executorWorkflowId:
      summary.executorWorkflowId ?? summary.productSpecProofAdmission?.executorWorkflowId ?? null,
    subjectWorkflowIds:
      summary.subjectWorkflowIds ?? summary.productSpecProofAdmission?.subjectWorkflowIds ?? [],
    targetSubjectRefs:
      summary.targetSubjectRefs ?? summary.productSpecProofAdmission?.targetSubjectRefs ?? [],
    requestedCapabilities:
      summary.requestedCapabilities ?? summary.productSpecProofAdmission?.requestedCapabilities ?? [],
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
      `.artifacts/execution-platform/proof-runs/${currentProofRunId}/resource-materialization-proof.json`,
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

async function finalizeRunScopedProofSummary(summary, { resultArtifact, proofArtifact, admissionArtifact = null } = {}) {
  ensureProductSpecCodingExecutorProofRoute(summary);
  Object.assign(summary, {
    proofRunId: currentProofRunId,
    proofRunManifestRef: currentProofRunId
      ? `.artifacts/execution-platform/proof-runs/${currentProofRunId}/manifest.json`
      : null,
    productSpecBoundaryReplayResultArtifact: resultArtifact ?? null,
    productSpecReplayProofArtifact: proofArtifact ?? null,
    ...(admissionArtifact ? { productSpecProofAdmissionArtifact: admissionArtifact } : {}),
    proofArtifactRefs: [
      proofArtifact?.path,
      resultArtifact?.path,
      admissionArtifact?.path,
    ].filter(Boolean),
  });
  const proofRunManifestArtifact = await writeProductSpecProofRunManifest(summary);
  Object.assign(summary, { proofRunManifestArtifact });
  return proofRunManifestArtifact;
}

function checkpointRefsForKind({
  checkpointKind,
  runtimeJobId,
  graphId,
  artifacts,
  proofArtifact,
  resultArtifact,
  selectedBoundaryNode,
  selectedBoundaryNodes,
  workerResult,
}) {
  const selectedRefs = uniqueRefs([
    selectedBoundaryNode?.implementationContextPacketRef,
    selectedBoundaryNode?.nodeExecutionPacketRef,
    selectedBoundaryNode?.resourcePacketRef,
    selectedBoundaryNode?.nodeReadinessStateRef,
    ...(Array.isArray(selectedBoundaryNodes)
      ? selectedBoundaryNodes.flatMap((node) => [
          node.implementationContextPacketRef,
          node.nodeExecutionPacketRef,
          node.resourcePacketRef,
          node.nodeReadinessStateRef,
        ])
      : []),
  ]);
  const workerRefs = uniqueRefs([
    ...(Array.isArray(workerResult?.outputArtifactRefs) ? workerResult.outputArtifactRefs : []),
    ...(Array.isArray(workerResult?.changedFileRefs) ? workerResult.changedFileRefs : []),
    ...(Array.isArray(workerResult?.validationRefs) ? workerResult.validationRefs : []),
    ...(Array.isArray(workerResult?.evidenceClaims)
      ? workerResult.evidenceClaims.map((claim) => claim?.evidenceRef)
      : []),
  ]);
  const proofRefs = uniqueRefs([proofArtifact?.path, resultArtifact?.path]);
  const graphRef = `runtime-work-graph://${graphId}`;
  switch (checkpointKind) {
    case "router_payload":
      return uniqueRefs([
        ...artifactRefsByType(artifacts, "execution_platform.source_prompt_context_index", 4),
        `runtime-job://${runtimeJobId}/router-payload`,
      ]);
    case "mission_ledger":
      return uniqueRefs(artifactRefsByType(artifacts, "execution_platform.mission_contract_ledger", 4));
    case "obligation_graph":
      return uniqueRefs([
        ...artifactRefsByType(artifacts, "execution_platform.obligation_graph", 8),
      ]);
    case "work_intent_graph":
      return uniqueRefs([`${graphRef}/work-intent-graph`]);
    case "before_resource_requirement_compile":
      return uniqueRefs([
        ...artifactRefsByType(artifacts, "execution_platform.resource_requirement_packet", 24),
        ...artifactRefsByType(artifacts, "execution_platform.resource_scout_execution_packet", 24),
        `${graphRef}/resource-requirements`,
      ]);
    case "after_resource_requirement_compile":
      return uniqueRefs([
        ...artifactRefsByType(artifacts, "execution_platform.resource_scout_execution_packet", 40),
        `${graphRef}/context-scout-execution-packets`,
      ]);
    case "resource_scout":
      return uniqueRefs([
        ...artifactRefsByType(artifacts, "execution_platform.resource_scout_tool_loop", 40),
      ]);
    case "before_resource_handoff":
      return uniqueRefs([
        ...artifactRefsByType(artifacts, "execution_platform.resource_scout_tool_loop", 40),
        `${graphRef}/resource-handoff/preflight`,
      ]);
    case "after_resource_handoff":
      return uniqueRefs(artifactRefsByType(artifacts, "execution_platform.resource_handoff_packet", 40));
    case "graph_compile":
      return uniqueRefs([`${graphRef}/compiled-runtime-graph`]);
    case "node_selection":
      return uniqueRefs([
        selectedBoundaryNode?.nodeId ? `${graphRef}/node/${selectedBoundaryNode.nodeId}` : null,
        `${graphRef}/frontier-selection`,
      ]);
    case "before_worker_invocation":
      return uniqueRefs([...selectedRefs, `${graphRef}/worker-invocation/preflight`]);
    case "worker_execution":
      return uniqueRefs([...workerRefs, ...selectedRefs]);
    case "after_worker_edit":
      return uniqueRefs([...workerRefs, ...proofRefs]);
    default:
      return proofRefs;
  }
}

async function recordProductSpecReplayProofBoundaryCheckpoints({
  runtime,
  runtimeJobId,
  graphId,
  workflowId,
  artifacts,
  proofArtifact,
  resultArtifact,
  selectedBoundaryNode,
  selectedBoundaryNodes,
  workerResult,
}) {
  const requiredKinds = requiredBoundaryReplayCheckpointKindsFor("before_worker_execution");
  const workerKinds = ["before_worker_invocation", "worker_execution", "after_worker_edit"];
  const checkpointKinds = [...new Set([...requiredKinds, ...workerKinds])];
  const coverageByKind = new Map();
  for (const checkpointKind of checkpointKinds) {
    const refs = checkpointRefsForKind({
      checkpointKind,
      runtimeJobId,
      graphId,
      artifacts,
      proofArtifact,
      resultArtifact,
      selectedBoundaryNode,
      selectedBoundaryNodes,
      workerResult,
    });
    if (refs.length === 0) {
      coverageByKind.set(checkpointKind, {
        checkpointKind,
        checkpointRef: null,
        status: "missing",
      });
      continue;
    }
    const recorded = await recordCanonicalBoundaryReplayCheckpoint({
      runtime,
      runtimeJobId,
      graphId,
      workflowId,
      checkpointKind,
      acceptedArtifactRefs: refs,
      upstreamArtifactRefs: refs,
      currentNodeIds: selectedBoundaryNode?.nodeId ? [selectedBoundaryNode.nodeId] : [],
      replayContinuationMode:
        checkpointKind === "before_worker_invocation"
          ? "run_node"
          : checkpointKind === "worker_execution" || checkpointKind === "after_worker_edit"
            ? "continue_scheduler"
            : "continue_scheduler",
      replaySafetyStatus: "safe_to_replay",
      reasonCodes: [
        "product_spec_replay_proof_boundary_sequence_checkpoint_recorded",
        `product_spec_replay_proof_checkpoint_kind:${checkpointKind}`,
      ],
    });
    coverageByKind.set(checkpointKind, {
      checkpointKind,
      checkpointRef: recorded?.artifactRef ?? null,
      status: recorded ? "accepted" : "missing",
    });
  }
  return BOUNDARY_REPLAY_PRODUCTION_PROOF_BOUNDARY_IDS.map((boundaryId) => {
    const checkpointKind = boundaryReplayCheckpointKindForProofBoundaryId(boundaryId);
    const entry = checkpointKind ? coverageByKind.get(checkpointKind) : null;
    return {
      boundaryId,
      checkpointKind: checkpointKind ?? "unknown",
      checkpointRef: entry?.checkpointRef ?? null,
      status: entry?.status ?? "missing",
    };
  });
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
  if (
    executeWorkers &&
    boundary === "after-graph-selection"
  ) {
    return false;
  }
  if (boundary === "after-resource-handoff") {
    return true;
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

function nodeKindRequiresImplementationContext(nodeKind) {
  return [
    "implementation",
    "test_authoring",
    "docs_update",
    "architecture_spec",
    "planning_capsule",
    "action_graph_compile",
    "compiler",
  ].includes(nodeKind);
}

function hasAcceptedNodeScopedResourceFulfillment(snapshot) {
  const statusByNodeId = new Map(snapshot.nodes.map((node) => [node.nodeId, node]));
  const plannedTargets = snapshot.nodes.filter(
    (node) => node.nodeStatus === "planned" && nodeKindRequiresImplementationContext(node.nodeKind),
  );
  if (plannedTargets.length === 0) {
    return false;
  }
  return plannedTargets.every((target) =>
    snapshot.edges.some((edge) => {
      if (edge.toNodeId !== target.nodeId || edge.edgeKind !== "context_supplies") {
        return false;
      }
      const source = statusByNodeId.get(edge.fromNodeId);
      return (
        source &&
        ["resource_scout", "web_research"].includes(source.nodeKind) &&
        source.nodeStatus === "succeeded" &&
        Array.isArray(source.outputArtifactRefs) &&
        source.outputArtifactRefs.length > 0
      );
    }),
  );
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

async function packetsFromArtifacts(runtime, artifacts) {
  const packets = [];
  for (const artifact of artifacts.filter(
    (candidate) =>
      candidate.artifactType === "execution_platform.commitment_work_packet" ||
      candidate.artifactType === "execution_platform.commitment_work_packet.replay",
  )) {
    const hydrated = await runtime.runtimeJobs
      .hydrateRuntimeArtifactByContract(artifact)
      .catch(() => null);
    const packet = hydrated?.body ?? metadataOf(artifact).commitmentWorkPacket;
    if (packet && typeof packet === "object" && !Array.isArray(packet)) {
      packets.push(packet);
    }
  }
  return packets.toSorted((left, right) =>
    String(left.commitmentId ?? "").localeCompare(String(right.commitmentId ?? "")),
  );
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
      let response;
      try {
        response = await modelClient.runJson({
          modelRef: DEFAULT_DYNAMIC_ORCHESTRATOR_MODEL_REF,
          providerPath: DEFAULT_DYNAMIC_ORCHESTRATOR_PROVIDER_PATH,
          systemPrompt: [
            "You are the OpenClaw Mission Contract evaluator.",
            "Review only bounded refs, evidence claims, summaries, and validation refs.",
            "Return strict JSON matching MissionCommitmentEvaluation.",
            "Judge each commitment as satisfied, partially_satisfied, impossible, pending, or needs_review.",
            "Accepted evidence must come from explicit evidenceClaims only.",
            "Do not rewrite evidence, create runtime success, mutate Work Queue lifecycle, or infer from raw logs.",
            "Use false for rawPromptStored, rawResponseStored, rawProviderLogStored, and workQueueLifecycleMutated.",
            attempt > 0
              ? `This is repair attempt ${attempt}. Previous structural error hash: ${sha256(
                  priorError instanceof Error ? priorError.message : String(priorError),
                ).slice(0, 16)}. Return only the required JSON object.`
              : null,
          ]
            .filter(Boolean)
            .join("\n"),
          userPayload,
          maxOutputTokens: 8_000,
          timeoutMs: Number(
            process.env.OPENCLAW_BOUNDARY_REPLAY_MISSION_EVALUATION_TIMEOUT_MS ?? 300_000,
          ),
          taskClass: "validation_classification",
          modelTaskCallSite: "product_spec_boundary_replay.mission_ledger_evaluation",
          progress: {
            spanId: `${runtimeJobId}:${graphId}:mission-ledger:${iteration}:${nodeId}:${attempt}`,
            objectiveSummary: "Evaluate explicit evidence claims against the Mission Ledger.",
            reasonCodes: [
              "product_spec_boundary_replay_mission_ledger_model_call",
              `repair_attempt:${attempt}`,
            ],
            onEvent: (event) =>
              emitReplayState({
                runtime,
                runtimeJobId,
                event: "model_call_progress",
                graphId,
                boundary,
                phase: "mission_ledger_evaluation",
                status: event.phase === "failed" ? "failed" : "running",
                details: event,
              }),
          },
        });
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
        errorMessageHash: sha256(priorError instanceof Error ? priorError.message : String(priorError)),
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
      nodeReadinessStateRef:
        typeof node.metadata?.nodeReadinessStateRef === "string"
          ? node.metadata.nodeReadinessStateRef
          : null,
      nodeReadinessStatus:
        typeof node.metadata?.nodeReadinessStatus === "string"
          ? node.metadata.nodeReadinessStatus
          : null,
      nodeReadinessPhase:
        typeof node.metadata?.nodeReadinessPhase === "string"
          ? node.metadata.nodeReadinessPhase
          : null,
      nodeReadinessRepairAction:
        typeof node.metadata?.nodeReadinessRepairAction === "string"
          ? node.metadata.nodeReadinessRepairAction
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
          nodeReadinessStateRef: node.nodeReadinessStateRef ?? null,
          nodeReadinessStatus: node.nodeReadinessStatus ?? null,
          nodeReadinessPhase: node.nodeReadinessPhase ?? null,
          nodeReadinessRepairAction: node.nodeReadinessRepairAction ?? null,
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

function packetCommitmentId(packet) {
  return typeof packet?.commitmentId === "string" && packet.commitmentId.trim()
    ? packet.commitmentId.trim()
    : null;
}

function resourceFulfillmentRequiredCommitmentIds(snapshot, packets) {
  const allPacketCommitmentIds = packets.map(packetCommitmentId).filter(Boolean);
  const packetCommitmentIdByRef = new Map(
    packets
      .map((packet) => [
        typeof packet?.packetRef === "string" ? packet.packetRef : null,
        packetCommitmentId(packet),
      ])
      .filter(([packetRef, commitmentId]) => packetRef && commitmentId),
  );
  const requiredCommitmentIds = new Set();
  const contextNodes = Array.isArray(snapshot?.nodes)
    ? snapshot.nodes.filter((node) => ["resource_scout", "web_research"].includes(node.nodeKind))
    : [];

  for (const node of contextNodes) {
    const metadata = jsonRecord(node.metadata);
    for (const commitmentId of [
      ...metadataStringArray(metadata, "commitmentIdsAdvanced"),
      ...metadataStringArray(metadata, "targetCommitmentIds"),
    ]) {
      requiredCommitmentIds.add(commitmentId);
    }
    for (const inputRef of Array.isArray(node.inputHandoffRefs) ? node.inputHandoffRefs : []) {
      const commitmentId = packetCommitmentIdByRef.get(inputRef);
      if (commitmentId) {
        requiredCommitmentIds.add(commitmentId);
      }
    }
  }

  if (requiredCommitmentIds.size === 0) {
    return [...new Set(allPacketCommitmentIds)];
  }
  const packetCommitmentIdSet = new Set(allPacketCommitmentIds);
  return [...requiredCommitmentIds].filter((commitmentId) =>
    packetCommitmentIdSet.has(commitmentId),
  );
}

async function resourceFulfillmentSummaryFromResourceHandoffArtifacts(
  runtime,
  artifacts,
  packets,
  snapshot = null,
) {
  const requiredCommitmentIds = resourceFulfillmentRequiredCommitmentIds(snapshot, packets);
  const requiredCommitmentIdSet = new Set(requiredCommitmentIds);
  const requiredPackets = packets.filter((packet) => {
    const commitmentId = packetCommitmentId(packet);
    return commitmentId ? requiredCommitmentIdSet.has(commitmentId) : false;
  });
  const skippedCommitmentIds = packets
    .map(packetCommitmentId)
    .filter((commitmentId) => commitmentId && !requiredCommitmentIdSet.has(commitmentId));
  const handoffArtifacts = artifacts
    .filter((artifact) => artifact.artifactType === "execution_platform.resource_handoff_packet")
    .toSorted((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
  const toolLoopArtifacts = artifacts
    .filter((artifact) => artifact.artifactType === "execution_platform.resource_scout_tool_loop")
    .toSorted((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
  const hydratedHandoffBodies = new Map();
  for (const artifact of handoffArtifacts) {
    const hydrated = await runtime.runtimeJobs
      .hydrateRuntimeArtifactByContract(artifact)
      .catch(() => null);
    if (hydrated?.body && typeof hydrated.body === "object" && !Array.isArray(hydrated.body)) {
      hydratedHandoffBodies.set(artifact.uri, hydrated.body);
    }
  }
  const handoffForPacket = (packet) => {
    const commitmentId = typeof packet.commitmentId === "string" ? packet.commitmentId : "";
    const packetRef = typeof packet.packetRef === "string" ? packet.packetRef : "";
    return (
      handoffArtifacts.find((artifact) => {
        const metadata = metadataOf(artifact);
        const targetCommitmentIds = stringArray(metadata.targetCommitmentIds);
        const packetRefs = stringArray(metadata.sourceContractRefs);
        return (
          targetCommitmentIds.includes(commitmentId) ||
          packetRefs.includes(packetRef) ||
          (commitmentId && artifact.uri.includes(commitmentId))
        );
      }) ?? null
    );
  };
  const toolLoopForHandoff = (handoffRef) =>
    handoffRef
      ? (toolLoopArtifacts.find((artifact) => {
          const metadata = metadataOf(artifact);
          return (
            metadata.resourceHandoffPacketRef === handoffRef ||
            stringArray(metadata.artifactRefs).includes(handoffRef) ||
            stringArray(metadata.outputArtifactRefs).includes(handoffRef)
          );
        }) ?? null)
      : null;
  const handoffResult = (handoff, index) => {
    const handoffArtifactMetadata = metadataOf(handoff);
    const hydratedBody = jsonRecord(hydratedHandoffBodies.get(handoff?.uri));
    const handoffMetadata = {
      ...handoffArtifactMetadata,
      ...jsonRecord(handoffArtifactMetadata.extension),
      ...hydratedBody,
    };
    const handoffRef = typeof handoff?.uri === "string" ? handoff.uri : null;
    const toolLoop = toolLoopForHandoff(handoffRef);
    const toolLoopMetadata = metadataOf(toolLoop);
    const relevantFileRefs = stringArray(
      handoffMetadata.relevantFileRefs ?? toolLoopMetadata.verifiedFileRefs,
    );
    const targetFileRefs = stringArray(handoffMetadata.targetFileRefs);
    const recommendedEditPoints = Array.isArray(handoffMetadata.recommendedEditPoints)
      ? handoffMetadata.recommendedEditPoints.slice(0, 24)
      : [];
    return {
      commitmentId: null,
      nodeId:
        typeof handoffMetadata.sourceNodeId === "string"
          ? handoffMetadata.sourceNodeId
          : typeof handoffMetadata.nodeId === "string"
            ? handoffMetadata.nodeId
            : typeof toolLoopMetadata.nodeId === "string"
              ? toolLoopMetadata.nodeId
              : (handoffRef?.match(/\/resource-handoff\/([^:]+)/u)?.[1] ??
                `handoff-artifact-context-${index + 1}`),
      status:
        handoffMetadata.readinessStatus === "accepted_with_limitations"
          ? "accepted_with_limitations"
          : handoffRef
            ? "accepted"
            : "missing",
      packetRef: null,
      resourceHandoffPacketRef: handoffRef,
      contextScoutToolLoopRef: typeof toolLoop?.uri === "string" ? toolLoop.uri : null,
      verifiedFileRefs: [...new Set([...targetFileRefs, ...relevantFileRefs])].slice(0, 12),
      relevantFileRefs: relevantFileRefs.slice(0, 24),
      targetFileRefs: targetFileRefs.slice(0, 24),
      recommendedEditPoints,
      limitations: stringArray(handoffMetadata.limitations ?? toolLoopMetadata.limitations, []),
      handoffSummaryForImplementation:
        typeof handoffMetadata.handoffSummaryForImplementation === "string"
          ? handoffMetadata.handoffSummaryForImplementation.slice(0, 1_200)
          : null,
      implementationBlocked: !handoffRef,
      reasonCodes: handoffRef
        ? ["resource_handoff_artifact_reconstructed_for_replay"]
        : ["resource_handoff_artifact_missing"],
    };
  };
  const handoffResults = handoffArtifacts
    .map((handoff, index) => handoffResult(handoff, index))
    .filter((result) => result.resourceHandoffPacketRef);
  const commitmentResults = requiredPackets.slice(0, 80).map((packet, index) => {
    const handoff = handoffForPacket(packet);
    const reconstructed = handoff ? handoffResult(handoff, index) : null;
    const status = reconstructed?.status ?? "missing";
    return {
      commitmentId: packet.commitmentId ?? null,
      nodeId: reconstructed?.nodeId ?? `handoff-artifact-context-${index + 1}`,
      status,
      packetRef: packet.packetRef ?? null,
      resourceHandoffPacketRef: reconstructed?.resourceHandoffPacketRef ?? null,
      contextScoutToolLoopRef: reconstructed?.contextScoutToolLoopRef ?? null,
      verifiedFileRefs: reconstructed?.verifiedFileRefs ?? [],
      relevantFileRefs: reconstructed?.relevantFileRefs ?? [],
      targetFileRefs: reconstructed?.targetFileRefs ?? [],
      recommendedEditPoints: reconstructed?.recommendedEditPoints ?? [],
      limitations: reconstructed?.limitations ?? [],
      handoffSummaryForImplementation: reconstructed?.handoffSummaryForImplementation ?? null,
      implementationBlocked: !reconstructed?.resourceHandoffPacketRef,
      reasonCodes: reconstructed?.resourceHandoffPacketRef
        ? ["resource_handoff_artifact_reconstructed_for_replay"]
        : ["resource_handoff_artifact_missing"],
    };
  });
  const acceptedCount = commitmentResults.filter((result) => result.status === "accepted").length;
  const failedCount = commitmentResults.length - acceptedCount;
  return {
    aggregateResourceFulfillmentRef: null,
    status:
      failedCount === 0 && commitmentResults.length === requiredPackets.length
        ? "succeeded"
        : "needs_review",
    packetCount: requiredPackets.length,
    totalPacketCount: packets.length,
    acceptedCount,
    needsReviewCount: failedCount,
    failedCount: 0,
    commitmentResults,
    handoffResults,
    coverageMode: "resource_frontier_scoped",
    requiredCommitmentIds: requiredCommitmentIds.slice(0, 80),
    skippedCommitmentIds: skippedCommitmentIds.slice(0, 80),
    reconstructedFromResourceHandoffArtifacts: true,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
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

function resourceFulfillmentResultsForNode(node, resourceFulfillmentSummary) {
  const metadata = jsonRecord(node.metadata);
  const targetCommitmentIds = metadataStringArray(metadata, "commitmentIdsAdvanced");
  const symbolicWorkUnitIds = node.inputHandoffRefs
    .filter((ref) => typeof ref === "string" && ref.endsWith(".accepted_resource_handoff"))
    .map((ref) => ref.replace(/\.accepted_resource_handoff$/u, ""));
  const allResults = [
    ...(resourceFulfillmentSummary.commitmentResults ?? []),
    ...(resourceFulfillmentSummary.handoffResults ?? []),
  ];
  const symbolicMatches = allResults.filter((result) => {
    const resourceHandoffPacketRef =
      typeof result?.resourceHandoffPacketRef === "string" ? result.resourceHandoffPacketRef : "";
    const resultNodeId = typeof result?.nodeId === "string" ? result.nodeId : "";
    return (
      resourceHandoffPacketRef &&
      symbolicWorkUnitIds.some((workUnitId) => resultNodeId.includes(workUnitId))
    );
  });
  if (symbolicMatches.length > 0) {
    return symbolicMatches;
  }
  return allResults.filter((result) => {
    const commitmentId = typeof result?.commitmentId === "string" ? result.commitmentId : "";
    const resourceHandoffPacketRef =
      typeof result?.resourceHandoffPacketRef === "string" ? result.resourceHandoffPacketRef : "";
    const resultNodeId = typeof result?.nodeId === "string" ? result.nodeId : "";
    const packetRef = typeof result?.packetRef === "string" ? result.packetRef : "";
    return (
      (commitmentId && targetCommitmentIds.includes(commitmentId)) ||
      (resourceHandoffPacketRef && node.inputHandoffRefs.includes(resourceHandoffPacketRef)) ||
      (packetRef && node.inputHandoffRefs.includes(packetRef)) ||
      symbolicWorkUnitIds.some((workUnitId) => resultNodeId.includes(workUnitId))
    );
  });
}

function replayNodeTargetRefs(node) {
  const metadata = jsonRecord(node.metadata);
  return repoFileRefs(
    [
      ...metadataStringArray(metadata, "targetRefs"),
      ...metadataStringArray(metadata, "likelyModifyRefs"),
      ...metadataStringArray(metadata, "allowedEditScope"),
    ],
    80,
  ).filter((ref) => !ref.startsWith("pnpm "));
}

function resourceSelectionPacketRefFromMetadata(metadata) {
  return (
    (typeof metadata.acceptedResourceSelectionPacketRef === "string"
      ? metadata.acceptedResourceSelectionPacketRef
      : null) ??
    (typeof metadata.resourceSelectionPacketRef === "string"
      ? metadata.resourceSelectionPacketRef
      : null) ??
    (typeof metadata.domainResourceSelectionPacketRef === "string" &&
    String(metadata.domainResourceSelectionPacketRef).includes("resource-selection-packet")
      ? metadata.domainResourceSelectionPacketRef
      : null)
  );
}

function resourceSelectionAcceptedFromMetadata(metadata) {
  return (
    metadata.domainResourceSelectionPacketStatus === "accepted" ||
    metadata.domainResourceSelectionStatus === "accepted" ||
    metadata.resourceSelectionStatus === "accepted"
  );
}

function resourceSelectionRefsFromAcceptedMetadata(metadata) {
  if (!resourceSelectionAcceptedFromMetadata(metadata)) {
    return [];
  }
  return [
    ...metadataStringArray(metadata, "selectedResourceRefs"),
    ...metadataStringArray(metadata, "selectedTargetFileRefs"),
  ].filter((ref) => typeof ref === "string" && ref.trim());
}

function compactCanonicalResourceContextRefs(...metadataRecords) {
  const refs = [];
  for (const metadata of metadataRecords.map((record) => jsonRecord(record))) {
    refs.push(
      resourceSelectionPacketRefFromMetadata(metadata),
      typeof metadata.domainResourceSelectionDecisionRef === "string"
        ? metadata.domainResourceSelectionDecisionRef
        : null,
      typeof metadata.domainResourceSelectionRequestRef === "string"
        ? metadata.domainResourceSelectionRequestRef
        : null,
      typeof metadata.domainResourceSelectionCandidateHandleManifestRef === "string"
        ? metadata.domainResourceSelectionCandidateHandleManifestRef
        : null,
      typeof metadata.nodeResourceDemandFulfillmentRef === "string"
        ? metadata.nodeResourceDemandFulfillmentRef
        : null,
      typeof metadata.nodeResourceDemandSessionRef === "string"
        ? metadata.nodeResourceDemandSessionRef
        : null,
      typeof metadata.nodeResourceLedgerRef === "string" ? metadata.nodeResourceLedgerRef : null,
      typeof metadata.nodeResourceLedgerPayloadRef === "string"
        ? metadata.nodeResourceLedgerPayloadRef
        : null,
      ...metadataStringArray(metadata, "acceptedResourceHandoffRefs"),
      ...metadataStringArray(metadata, "nodeResourceDemandFulfillmentRefs"),
      ...metadataStringArray(metadata, "nodeResourceDemandSessionRefs"),
      ...metadataStringArray(metadata, "nodeResourceLedgerRefs"),
      ...metadataStringArray(metadata, "nodeResourceLedgerEntryRefs"),
      ...metadataStringArray(metadata, "nodeResourceLedgerEntryPayloadRefs"),
    );
  }
  return [...new Set(refs.filter((ref) => typeof ref === "string" && ref.trim()).map((ref) => ref.trim()))];
}

function normalizedRepoFileRef(value, repoRoot = process.cwd()) {
  let candidate = String(value ?? "")
    .trim()
    .replaceAll("\\", "/")
    .replace(/^repo:\/\//u, "")
    .replace(/^file:\/\//u, "")
    .replace(/^\.\/+/u, "");
  const normalizedRepoRoot = repoRoot.trim().replaceAll("\\", "/").replace(/\/+$/u, "");
  if (normalizedRepoRoot && candidate.startsWith(`${normalizedRepoRoot}/`)) {
    candidate = candidate.slice(normalizedRepoRoot.length + 1);
  }
  if (candidate.startsWith("services/openclaw-roles/live/")) {
    candidate = candidate.slice("services/openclaw-roles/live/".length);
  }
  if (!candidate || candidate.startsWith("/") || candidate.includes("..")) {
    return null;
  }
  return candidate;
}

function repoRefLooksLikeDirectorySeed(fileRef) {
  return fileRef.endsWith("/") || !/\.[^/]+$/u.test(fileRef.split("/").at(-1) ?? "");
}

function replayVerifiedContextFileRefsForNode(node, resourceFulfillmentSummary) {
  const refs = [];
  for (const result of resourceFulfillmentResultsForNode(node, resourceFulfillmentSummary)) {
    refs.push(...stringArray(result?.verifiedFileRefs, [], 80));
    refs.push(...stringArray(result?.relevantFileRefs, [], 80));
  }
  return repoFileRefs(refs, 120);
}

function resolveReplayImplementationMaterializationTargetRefs({
  metadataTargetRefs,
  verifiedContextFileRefs,
  fileChangeIntents,
  repoRoot = process.cwd(),
}) {
  const normalizedMetadataTargetRefs = [
    ...new Set(
      metadataTargetRefs
        .map((ref) => normalizedRepoFileRef(ref, repoRoot))
        .filter((ref) => typeof ref === "string" && ref.trim()),
    ),
  ];
  if (normalizedMetadataTargetRefs.length > 0) {
    return normalizedMetadataTargetRefs.slice(0, 80);
  }
  void verifiedContextFileRefs;
  void fileChangeIntents;
  return [];
}

function replayFileChangeIntentsForNode(node, resourceFulfillmentSummary) {
  const intents = [];
  const metadata = jsonRecord(node.metadata);
  if (Array.isArray(metadata.fileChangeIntents)) {
    for (const item of metadata.fileChangeIntents) {
      const record = jsonRecord(item);
      const fileRef =
        typeof record.fileRef === "string"
          ? record.fileRef
          : typeof record.path === "string"
            ? record.path
            : "";
      const intendedChange =
        typeof record.intendedChange === "string"
          ? record.intendedChange
          : typeof record.changeIntent === "string"
            ? record.changeIntent
            : "";
      const whyThisFile =
        typeof record.whyThisFile === "string"
          ? record.whyThisFile
          : typeof record.rationale === "string"
            ? record.rationale
            : intendedChange;
      if (fileRef.trim() && intendedChange.trim() && whyThisFile.trim()) {
        intents.push({
          fileRef: fileRef.trim(),
          symbolOrRegion:
            typeof record.symbolOrRegion === "string" && record.symbolOrRegion.trim()
              ? record.symbolOrRegion.trim()
              : "model_authored_group_scope",
          intendedChange: intendedChange.trim(),
          whyThisFile: whyThisFile.trim(),
        });
      }
    }
  }
  void resourceFulfillmentSummary;
  const seen = new Set();
  return intents
    .filter((intent) => {
      const key = `${intent.fileRef}:${intent.symbolOrRegion}:${intent.intendedChange}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, 40);
}

function replayDomainResourceSelectionCandidateFileRefsForNode(node, resourceFulfillmentSummary) {
  const metadata = jsonRecord(node.metadata);
  const refs = [
    ...metadataStringArray(metadata, "candidateConcreteFileRefs"),
    ...metadataStringArray(metadata, "resolvedCandidateFileRefs"),
    ...replayVerifiedContextFileRefsForNode(node, resourceFulfillmentSummary),
  ];
  for (const result of resourceFulfillmentResultsForNode(node, resourceFulfillmentSummary)) {
    refs.push(...stringArray(result?.targetFileRefs, [], 80));
    refs.push(...stringArray(result?.relevantFileRefs, [], 80));
    for (const point of Array.isArray(result?.recommendedEditPoints)
      ? result.recommendedEditPoints
      : []) {
      const record = jsonRecord(point);
      for (const value of [
        record.fileRef,
        record.path,
        record.targetRef,
        record.repoFileRef,
        record.ref,
      ]) {
        if (typeof value === "string" && value.trim()) {
          refs.push(value.trim());
        }
      }
    }
  }
  return repoFileRefs(
    refs
      .map((ref) => normalizedRepoFileRef(ref))
      .filter((ref) => typeof ref === "string" && ref.trim())
      .filter((ref) => !repoRefLooksLikeDirectorySeed(ref)),
    120,
  );
}

function replayDomainResourceSelectionNeeded({
  executionIntent,
  evidenceMode,
  selectedTargetFileRefs,
  fileChangeIntents,
  targetRefs,
  candidateConcreteFileRefs,
}) {
  const editEvidenceRequired =
    executionIntent === "source_edit" &&
    Array.isArray(evidenceMode) &&
    evidenceMode.includes("changed_file_evidence");
  if (!editEvidenceRequired) {
    return false;
  }
  if (candidateConcreteFileRefs.length === 0) {
    return false;
  }
  const concreteTargetRefs = targetRefs.filter((ref) => !repoRefLooksLikeDirectorySeed(ref));
  const targetRefsAreConcreteAndCovered =
    targetRefs.length > 0 &&
    concreteTargetRefs.length === targetRefs.length &&
    concreteTargetRefs.every((ref) => fileChangeIntents.some((intent) => intent.fileRef === ref));
  if (targetRefsAreConcreteAndCovered && selectedTargetFileRefs.length === 0) {
    return false;
  }
  void selectedTargetFileRefs;
  return true;
}

function replayDomainResourceSelectionContextSummaries(node, resourceFulfillmentSummary) {
  return resourceFulfillmentResultsForNode(node, resourceFulfillmentSummary)
    .map((result) => ({
      nodeId: typeof result?.nodeId === "string" ? result.nodeId : null,
      commitmentId: typeof result?.commitmentId === "string" ? result.commitmentId : null,
      resourceHandoffPacketRef:
        typeof result?.resourceHandoffPacketRef === "string"
          ? result.resourceHandoffPacketRef
          : null,
      verifiedFileRefs: stringArray(result?.verifiedFileRefs, [], 12),
      relevantFileRefs: stringArray(result?.relevantFileRefs, [], 12),
      targetFileRefs: stringArray(result?.targetFileRefs, [], 12),
      handoffSummaryForImplementation:
        typeof result?.handoffSummaryForImplementation === "string"
          ? result.handoffSummaryForImplementation.slice(0, 1_200)
          : null,
      recommendedEditPoints: Array.isArray(result?.recommendedEditPoints)
        ? result.recommendedEditPoints.slice(0, 12).map((point) => {
            const record = jsonRecord(point);
            return {
              fileRef:
                typeof record.fileRef === "string"
                  ? record.fileRef
                  : typeof record.path === "string"
                    ? record.path
                    : null,
              summary:
                typeof record.summary === "string"
                  ? record.summary.slice(0, 500)
                  : typeof record.rationale === "string"
                    ? record.rationale.slice(0, 500)
                    : null,
            };
          })
        : [],
    }))
    .slice(0, 16);
}

async function compileReplayDomainResourceSelectionPacket({
  runtime,
  runtimeJobId,
  graphId,
  workflowId,
  node,
  boundary,
  objective,
  targetCommitmentIds,
  exactObjective,
  taskSummary,
  targetRefs,
  allowedFileRefs,
  candidateConcreteFileRefs,
  contextRefs,
  resourceFulfillmentSummary,
}) {
  const maxInputBytes = Number(
    process.env.OPENCLAW_BOUNDARY_REPLAY_DOMAIN_RESOURCE_SELECTION_MAX_INPUT_BYTES ?? 32_000,
  );
  const maxOutputTokens = Number(
    process.env.OPENCLAW_BOUNDARY_REPLAY_DOMAIN_RESOURCE_SELECTION_MAX_OUTPUT_TOKENS ?? 3_000,
  );
  const timeoutMs = Number(
    process.env.OPENCLAW_BOUNDARY_REPLAY_DOMAIN_RESOURCE_SELECTION_TIMEOUT_MS ?? 60_000,
  );
  const contextSummaries = replayDomainResourceSelectionContextSummaries(node, resourceFulfillmentSummary);
  const manifest = buildResourceSelectionHandleManifest({
    runtimeJobId,
    workflowId,
    graphId,
    nodeId: node.nodeId,
    sourceWorkUnitId:
      typeof jsonRecord(node.metadata).workUnitId === "string"
        ? jsonRecord(node.metadata).workUnitId
        : node.nodeId,
    domainKind: "coding.domain_resource_selection",
    objectiveSnippet: exactObjective || objective,
    targetCommitmentIds,
    capabilityIds: ["implementation_microtask"],
    evidenceRequirements: [
      "selected concrete target refs must be candidate refs",
      "each selected target requires a model-authored file-change intent",
      "validation discovery plan is required if validation refs are not already available",
    ],
    candidateHandles: candidateConcreteFileRefs.slice(0, 160).map((ref, index) => ({
      candidateId: `candidate-${String(index + 1).padStart(3, "0")}`,
      resourceRef: ref,
      resourceKind: "repo_file",
      candidateSource: "context_evidence_candidate",
      sourceRefs: [...contextRefs, ...targetRefs].slice(0, 24),
      authorityScopeRefs: allowedFileRefs.slice(0, 24),
      targetCommitmentIds: targetCommitmentIds.slice(0, 24),
      capabilityIds: ["implementation_microtask"],
      evidenceRequirements: ["source_edit_authority_requires_accepted_domain_resource_selection_packet"],
      objectiveSnippet: exactObjective.slice(0, 900),
      contextSummary: contextSummaries[index % Math.max(1, contextSummaries.length)] ?? null,
      payloadRef: ref,
      payloadHash: `sha256:${sha256(ref)}`,
      omittedBodyRef: ref,
      omittedBodyHash: `sha256:${sha256(`${ref}:body-omitted`)}`,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    })),
    maxInputBytes,
  });
  await attachReplayArtifact(
    runtime,
    runtimeJobId,
    "execution_platform.resource_selection_handle_manifest",
    manifest.manifestRef,
    manifest,
  );
  const domainResourceSelectionRequest = buildDomainResourceSelectionRequest({
    runtimeJobId,
    workflowId,
    graphId,
    nodeId: node.nodeId,
    sourceWorkUnitId:
      typeof jsonRecord(node.metadata).workUnitId === "string"
        ? jsonRecord(node.metadata).workUnitId
        : node.nodeId,
    workIntentRef: typeof jsonRecord(node.metadata).workIntentRef === "string"
      ? jsonRecord(node.metadata).workIntentRef
      : null,
    acceptedResourceHandoffRefs: contextRefs,
    targetCommitmentIds,
    capabilityIds: ["implementation_microtask"],
    evidenceRequirements: ["changed_file_evidence", "validation_evidence"],
    authorityScopeRefs: allowedFileRefs,
    manifest,
  });
  await attachReplayArtifact(
    runtime,
    runtimeJobId,
    "execution_platform.domain_resource_selection_request",
    domainResourceSelectionRequest.requestRef,
    domainResourceSelectionRequest,
  );
  const blockedProposal = {
    artifactKind: "domain_resource_selection_proposal",
    schemaVersion: "execution-platform.domain-resource-selection-proposal.v1",
    status: "blocked",
    selectedTargetRefs: [],
    fileChangeIntents: [],
    validationDiscoveryPlan: [],
    selectionRationale:
      manifest.budgetStatus === "over_budget"
        ? "The domain-resource-selection handle manifest exceeded the configured model-policy input budget before provider invocation."
        : "Domain resource selection blocked before provider invocation.",
    excludedCandidateRefs: [],
    blockerSummary:
      manifest.budgetStatus === "over_budget"
        ? "Domain resource selection payload is over budget and must be narrowed by a runner-owned worker context or specialist transition."
        : "Domain resource selection did not produce an accepted runner-owned tool call.",
    missingContextQuestions: [],
    sourceToolName: "resource.selection.mark_blocked",
    semanticQualityJudgedByDeterministicCode: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
  const blockedDomainDecision = compileDomainResourceSelectionDecision({
    request: domainResourceSelectionRequest,
    manifest,
    proposal: blockedProposal,
  });
  const blockedDecision =
    resourceSelectionDecisionFromDomainResourceSelectionDecision(blockedDomainDecision);
  const compileBlockedPackets = async ({
    decision,
    providerPath = "openrouter",
    modelRef = "qwen/qwen3-coder-next",
    modelTaskPolicyRef = "model-task-policy://tool-selection/qwen3-coder-next",
    reasonCodes = [],
    schemaErrorPath = null,
    parserReasonCodes = [],
  } = {}) => {
    const resourceSelectionPacket = compileResourceSelectionPacket({
      runtimeJobId,
      workflowId,
      graphId,
      nodeId: node.nodeId,
      sourceWorkUnitId:
        typeof jsonRecord(node.metadata).workUnitId === "string"
          ? jsonRecord(node.metadata).workUnitId
          : node.nodeId,
      domainKind: "coding.domain_resource_selection",
      targetCommitmentIds,
      manifest,
      decision,
      modelTaskBoundaryId: "domain_resource_selection",
      modelTaskPolicyRef,
      providerPath,
      modelRef,
    });
    await attachReplayArtifact(
      runtime,
      runtimeJobId,
      "execution_platform.resource_selection_packet",
      resourceSelectionPacket.packetRef,
      resourceSelectionPacket,
    );
    const resourceSelectionRepairRequest = buildResourceSelectionFieldRepairRequest({
      nodeId: node.nodeId,
      packet: resourceSelectionPacket,
      manifest,
      schemaErrorPath,
      parserReasonCodes,
    });
    if (resourceSelectionRepairRequest.status === "repair_required") {
      await attachReplayArtifact(
        runtime,
        runtimeJobId,
        "execution_platform.resource_selection_field_repair_request",
        resourceSelectionRepairRequest.repairRequestRef,
        resourceSelectionRepairRequest,
      );
    }
    const packet = compileDomainResourceSelectionPacket({
      runtimeJobId,
      workflowId,
      graphId,
      nodeId: node.nodeId,
      sourceWorkUnitId:
        typeof jsonRecord(node.metadata).workUnitId === "string"
          ? jsonRecord(node.metadata).workUnitId
          : node.nodeId,
      repoRoot: process.cwd(),
      allowedFileRefs,
      targetCommitmentIds,
      candidateConcreteFileRefs,
      selectedTargetFileRefs:
        resourceSelectionPacket.status === "accepted"
          ? resourceSelectionPacket.selectedResourceRefs
          : [],
      fileChangeIntents:
        resourceSelectionPacket.status === "accepted"
          ? resourceSelectionPacket.resourceIntents.map((intent) => ({
              fileRef: intent.resourceRef,
              symbolOrRegion: intent.intentKind,
              intendedChange: intent.intendedUse,
              whyThisFile: intent.rationale,
            }))
          : [],
      validationDiscoveryPlan: resourceSelectionPacket.validationDiscoveryPlan,
      selectionRationale: resourceSelectionPacket.selectionRationale,
    });
    await attachReplayArtifact(
      runtime,
      runtimeJobId,
      "execution_platform.domain_resource_selection_packet",
      packet.packetRef,
      packet,
    );
    return {
      packet,
      resourceSelectionPacket,
      resourceSelectionRepairRequest,
      modelRunRefs: [],
      reasonCodes: [
        ...manifest.reasonCodes,
        ...resourceSelectionPacket.reasonCodes,
        ...resourceSelectionRepairRequest.reasonCodes,
        ...packet.reasonCodes,
        ...reasonCodes,
      ],
    };
  };
  if (manifest.budgetStatus === "over_budget") {
    const blocked = await compileBlockedPackets({
      decision: blockedDecision,
      reasonCodes: ["domain_resource_selection_payload_over_budget_preflight_blocked"],
    });
    await emitReplayState({
      runtime,
      runtimeJobId,
      event: "domain_resource_selection_payload_over_budget",
      graphId,
      boundary,
      phase: "domain_resource_selection",
      status: "needs_review",
      details: {
        nodeId: node.nodeId,
        candidateHandleManifestRef: manifest.manifestRef,
        inputByteCount: manifest.inputByteCount,
        maxInputBytes: manifest.maxInputBytes,
        reasonCodes: blocked.reasonCodes.slice(0, 30),
      },
    });
    return blocked;
  }
  const userPayload = {
    runtimeJobId,
    graphId,
    workflowId,
    nodeId: node.nodeId,
    workUnitId:
      typeof jsonRecord(node.metadata).workUnitId === "string"
        ? jsonRecord(node.metadata).workUnitId
        : node.nodeId,
    ownerObjectiveSummary: objective.slice(0, 1_800),
    exactObjective: exactObjective.slice(0, 1_200),
    taskSummary: taskSummary.slice(0, 1_800),
    targetCommitmentIds: targetCommitmentIds.slice(0, 24),
    candidateHandleManifestRef: manifest.manifestRef,
    candidateHandleManifestHash: manifest.manifestHash,
    domainResourceSelectionRequestRef: domainResourceSelectionRequest.requestRef,
    nextLegalTools: domainResourceSelectionRequest.nextLegalTools,
    candidateResourceRefs: manifest.candidateHandles.map((handle) => handle.resourceRef),
    candidateHandles: manifest.candidateHandles.map((handle) => ({
      candidateId: handle.candidateId,
      resourceRef: handle.resourceRef,
      resourceKind: handle.resourceKind,
      candidateSource: handle.candidateSource,
      sourceRefs: handle.sourceRefs,
      authorityScopeRefs: handle.authorityScopeRefs,
      targetCommitmentIds: handle.targetCommitmentIds,
      capabilityIds: handle.capabilityIds,
      evidenceRequirements: handle.evidenceRequirements,
      objectiveSnippet: handle.objectiveSnippet,
      contextSummary: handle.contextSummary,
      payloadRef: handle.payloadRef,
      payloadHash: handle.payloadHash,
      omittedBodyRef: handle.omittedBodyRef,
      omittedBodyHash: handle.omittedBodyHash,
    })),
    allowedTools: [
      {
        toolName: "resource.selection.propose",
        arguments: {
          selectedTargetRefs: ["candidate resource ref"],
          fileChangeIntents: [
            {
              targetRef: "same selected candidate resource ref",
              operation: "modify",
              intendedChange: "specific source edit or implementation action",
              sourceCommitmentIds: targetCommitmentIds.slice(0, 24),
              resourceHandoffRefs: contextRefs.slice(0, 24),
              expectedEvidenceMode: ["changed_file_evidence", "validation_evidence"],
              validationDiscoveryNeed: "focused validation or discovery need",
              authorityScopeRef: allowedFileRefs[0] ?? "matching authority scope ref",
              rationale: "why this exact candidate is the right target",
            },
          ],
          validationDiscoveryPlan: ["bounded validation discovery or check plan"],
          selectionRationale: "brief rationale",
          excludedCandidateRefs: ["candidate refs intentionally not selected"],
        },
      },
      {
        toolName: "resource.selection.mark_blocked",
        arguments: {
          blockerSummary: "why selection cannot be made from these candidates",
          missingContextQuestions: ["specific missing context question"],
          selectionRationale: "brief rationale for blocking",
          excludedCandidateRefs: ["candidate refs intentionally not selected"],
        },
      },
    ],
    requiredOutputShape: {
      toolName:
        "resource.selection.propose | resource.selection.mark_blocked",
      arguments: "one allowed domain-resource-selection argument object",
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    },
    rawPromptStored: false,
    rawResponseStored: false,
  };
  const apiKey = process.env.OPENROUTER_API_KEY?.trim() ?? "";
  const adapters = apiKey
    ? [
        {
          providerPath: "openrouter",
          async executeJson(input) {
            const client = new OpenRouterAgentTeamModelClient({
              apiKey,
              retryPolicy: { maxAttempts: 2, timeoutMs: input.timeoutMs },
              requestProfilesByModelId: {
                [input.modelRef]: {
                  responseFormatMode: "prompt_only",
                  reasoningMode: input.reasoningMode === "none" ? "none" : "exclude",
                  maxTokens: input.maxOutputTokens,
                },
              },
            });
            const prompt = [
              input.systemPrompt,
              "",
              "USER_PAYLOAD_JSON:",
              stringifyJson(input.userPayload),
            ].join("\n");
            const result = await client.callRole({
              roleId: "implementation_engineer",
              modelId: input.modelRef,
              modelCandidateId: `resource-selection:${input.modelRef}`,
              prompt,
              maxTokens: input.maxOutputTokens,
              timeoutMs: input.timeoutMs,
              taskClass: input.taskClass,
              modelTaskCallSite: input.callSite,
            });
            return {
              status: result.status,
              responseText: result.responseText,
              responseHash: result.responseHash,
              latencyMs:
                typeof result.providerResponseDiagnostics?.elapsedMs === "number"
                  ? result.providerResponseDiagnostics.elapsedMs
                  : null,
              usage: result.usage,
              providerResponseDiagnostics: result.providerResponseDiagnostics,
              errorReasonCode: result.errorReasonCode,
            };
          },
        },
      ]
    : [];
  const modelClientRouter = new ModelTaskClientRouter({ adapters });
  await emitReplayState({
    runtime,
    runtimeJobId,
    event: "domain_resource_selection_model_call_started",
    graphId,
    boundary,
    phase: "domain_resource_selection",
    status: "running",
    details: {
      nodeId: node.nodeId,
      modelRef: "qwen/qwen3-coder-next",
      providerPath: "openrouter",
      candidateHandleManifestRef: manifest.manifestRef,
      candidateHandleManifestHash: manifest.manifestHash,
      inputByteCount: manifest.inputByteCount,
      maxInputBytes: manifest.maxInputBytes,
      candidateConcreteFileRefCount: manifest.candidateHandles.length,
      targetCommitmentCount: targetCommitmentIds.length,
      payloadHash: sha256(stringifyJson(userPayload)),
    },
  });
  const response = await modelClientRouter.runJson({
    boundaryId: "domain_resource_selection",
    taskClass: "tool_selection",
    callSite: "resource.selection",
    systemPrompt: [
      "You are selecting concrete implementation target resources for OpenClaw resource materialization.",
      "Return exactly one compact JSON tool call, not a graph, not a packet, and not prose.",
      "Allowed tool names: resource.selection.propose, resource.selection.mark_blocked.",
      "You may select only resourceRef values that appear in candidateHandles. Do not invent file paths.",
      "Every selected target must have exactly one fileChangeIntents entry explaining the intended edit/use and why this resource is the target.",
      "If candidates are insufficient to choose real edit targets, call resource.selection.mark_blocked with precise missingContextQuestions.",
      "Runtime owns ids, schemas, authority, snapshots, validation, lifecycle, evidence, and graph nodes.",
      "Do not store raw prompts, responses, transcripts, logs, secrets, or hidden reasoning.",
    ].join("\n"),
    userPayload,
    requestedInputBytes: manifest.inputByteCount,
    maxOutputTokens,
    timeoutMs,
    proofMode: true,
  });
  if (response.status === "blocked") {
    const blocked = await compileBlockedPackets({
      decision: {
        ...blockedDecision,
        selectionRationale:
          "The model-task router blocked target selection before provider invocation.",
        blockerSummary: response.reasonCodes.slice(0, 12).join(", "),
      },
      reasonCodes: response.reasonCodes,
    });
    await emitReplayState({
      runtime,
      runtimeJobId,
      event: "domain_resource_selection_model_router_blocked",
      graphId,
      boundary,
      phase: "domain_resource_selection",
      status: "needs_review",
      details: {
        nodeId: node.nodeId,
        candidateHandleManifestRef: manifest.manifestRef,
        inputByteCount: manifest.inputByteCount,
        preflight: response.preflight,
        reasonCodes: response.reasonCodes,
      },
    });
    return blocked;
  }
  const parsed = parseDomainResourceSelectionModelToolCall(response.responseText);
  const domainDecision = compileDomainResourceSelectionDecision({
    request: domainResourceSelectionRequest,
    manifest,
    proposal: parsed.proposal ?? blockedProposal,
  });
  const decision = resourceSelectionDecisionFromDomainResourceSelectionDecision(domainDecision);
  const resourceSelectionPacket = compileResourceSelectionPacket({
    runtimeJobId,
    workflowId,
    graphId,
    nodeId: node.nodeId,
    sourceWorkUnitId:
      typeof jsonRecord(node.metadata).workUnitId === "string"
        ? jsonRecord(node.metadata).workUnitId
        : node.nodeId,
    domainKind: "coding.domain_resource_selection",
    targetCommitmentIds,
    manifest,
    decision,
    modelTaskBoundaryId: "domain_resource_selection",
    modelTaskPolicyRef:
      typeof response.classification?.modelPolicyRef === "string"
        ? response.classification.modelPolicyRef
        : "model-task-policy://tool-selection/qwen3-coder-next",
    providerPath:
      typeof response.classification?.providerPath === "string"
        ? response.classification.providerPath
        : "openrouter",
    modelRef:
      typeof response.classification?.selectedModelRef === "string"
        ? response.classification.selectedModelRef
        : "qwen/qwen3-coder-next",
  });
  await attachReplayArtifact(
    runtime,
    runtimeJobId,
    "execution_platform.resource_selection_packet",
    resourceSelectionPacket.packetRef,
    resourceSelectionPacket,
  );
  const resourceSelectionRepairRequest = buildResourceSelectionFieldRepairRequest({
    nodeId: node.nodeId,
    packet: resourceSelectionPacket,
    manifest,
    schemaErrorPath: parsed.schemaErrorPath,
    parserReasonCodes: parsed.reasonCodes,
  });
  if (resourceSelectionRepairRequest.status === "repair_required") {
    await attachReplayArtifact(
      runtime,
      runtimeJobId,
      "execution_platform.resource_selection_field_repair_request",
      resourceSelectionRepairRequest.repairRequestRef,
      resourceSelectionRepairRequest,
    );
  }
  const packet = compileDomainResourceSelectionPacket({
    runtimeJobId,
    workflowId,
    graphId,
    nodeId: node.nodeId,
    sourceWorkUnitId:
      typeof jsonRecord(node.metadata).workUnitId === "string"
        ? jsonRecord(node.metadata).workUnitId
        : node.nodeId,
    repoRoot: process.cwd(),
    allowedFileRefs,
    targetCommitmentIds,
    candidateConcreteFileRefs,
    selectedTargetFileRefs:
      resourceSelectionPacket.status === "accepted"
        ? resourceSelectionPacket.selectedResourceRefs
        : [],
    fileChangeIntents:
      resourceSelectionPacket.status === "accepted"
        ? resourceSelectionPacket.resourceIntents.map((intent) => ({
            fileRef: intent.resourceRef,
            symbolOrRegion: intent.intentKind,
            intendedChange: intent.intendedUse,
            whyThisFile: intent.rationale,
          }))
        : [],
    validationDiscoveryPlan: resourceSelectionPacket.validationDiscoveryPlan,
    selectionRationale: resourceSelectionPacket.selectionRationale,
  });
  await attachReplayArtifact(
    runtime,
    runtimeJobId,
    "execution_platform.domain_resource_selection_packet",
    packet.packetRef,
    packet,
  );
  await emitReplayState({
    runtime,
    runtimeJobId,
    event: "domain_resource_selection_model_call_completed",
    graphId,
    boundary,
    phase: "domain_resource_selection",
    status: packet.status,
    details: {
      nodeId: node.nodeId,
      resourceSelectionPacketRef: resourceSelectionPacket.packetRef,
      resourceSelectionStatus: resourceSelectionPacket.status,
      resourceSelectionReasonCodes: resourceSelectionPacket.reasonCodes.slice(0, 20),
      resourceSelectionRepairRequestRef:
        resourceSelectionRepairRequest.status === "repair_required"
          ? resourceSelectionRepairRequest.repairRequestRef
          : null,
      resourceSelectionSchemaErrorPath: parsed.schemaErrorPath,
      domainResourceSelectionPacketRef: packet.packetRef,
      responseHash: response.responseHash ?? null,
      selectedTargetFileRefs: packet.selectedTargetFileRefs.slice(0, 20),
      candidateConcreteFileRefCount: packet.candidateConcreteFileRefs.length,
      fileChangeIntentCount: packet.fileChangeIntents.length,
      invalidSelections: packet.invalidSelections,
      uncoveredSelectedTargetFileRefs: packet.uncoveredSelectedTargetFileRefs,
      reasonCodes: packet.reasonCodes.slice(0, 20),
    },
  });
  return {
    packet,
    resourceSelectionPacket,
    resourceSelectionRepairRequest,
    modelRunRefs: response.responseHash
      ? [`model-response-hash://${response.responseHash}`]
      : [],
  };
}

function replayContextRefsForNode(node, resourceFulfillmentSummary) {
  const handoffRefs = new Set(node.inputHandoffRefs.filter((ref) => typeof ref === "string"));
  for (const result of resourceFulfillmentResultsForNode(node, resourceFulfillmentSummary)) {
    for (const ref of [
      result.resourceHandoffPacketRef,
      result.contextScoutToolLoopRef,
      result.packetRef,
    ]) {
      if (typeof ref === "string" && ref.trim()) {
        handoffRefs.add(ref.trim());
      }
    }
  }
  return [...handoffRefs].slice(0, 80);
}

function resourceFulfillmentCommitmentResults(resourceFulfillmentSummary) {
  if (Array.isArray(resourceFulfillmentSummary?.commitmentResults)) {
    return resourceFulfillmentSummary.commitmentResults;
  }
  if (Array.isArray(resourceFulfillmentSummary?.results)) {
    return resourceFulfillmentSummary.results;
  }
  return [];
}

function replayContextLimitationsForNode(node, resourceFulfillmentSummary) {
  const limitations = [];
  const diagnosticOnlyReasonCodes = new Set([
    "resource_handoff_artifact_reconstructed_for_replay",
    "resource_handoff_artifact_missing",
  ]);
  for (const result of resourceFulfillmentResultsForNode(node, resourceFulfillmentSummary)) {
    const commitmentId = typeof result?.commitmentId === "string" ? result.commitmentId : "";
    const resultReasonCodes = Array.isArray(result?.reasonCodes) ? result.reasonCodes : [];
    const limitationReasonCodes = resultReasonCodes.filter(
      (code) => !diagnosticOnlyReasonCodes.has(code),
    );
    if (result.implementationBlocked === true && limitationReasonCodes.length > 0) {
      limitations.push({
        limitation: `Context supply blocks implementation for ${commitmentId || node.nodeId}: ${resultReasonCodes
          .slice(0, 6)
          .join(", ")}`,
        blocking: true,
      });
      continue;
    }
    if (result.status === "accepted_with_limitations") {
      for (const limitation of stringArray(result.limitations, [], 12)) {
        limitations.push({
          limitation: `Context handoff limitation for ${commitmentId || node.nodeId}: ${limitation}`,
          blocking: true,
        });
      }
    }
    if (result.status === "accepted_with_limitations" || limitationReasonCodes.length > 0) {
      limitations.push({
        limitation: `Context supply limitation for ${commitmentId || node.nodeId}: ${limitationReasonCodes
          .slice(0, 6)
          .join(", ")}`,
        blocking: true,
      });
    }
  }
  return limitations.slice(0, 40);
}

async function attachReplayArtifact(runtime, runtimeJobId, artifactType, uri, metadata) {
  const payloadRequiredArtifactTypes = new Set([
    "execution_platform.resource_selection_handle_manifest",
    "execution_platform.domain_resource_selection_request",
    "execution_platform.resource_selection_packet",
    "execution_platform.resource_selection_field_repair_request",
    "execution_platform.domain_resource_selection_packet",
    "execution_platform.implementation_context_packet",
    "execution_platform.implementation_task_packet",
    "execution_platform.coding_resource_packet",
    "execution_platform.node_execution_contract",
    "execution_platform.node_execution_packet",
    "execution_platform.node_readiness_state",
  ]);
  const attach = payloadRequiredArtifactTypes.has(artifactType)
    ? runtime.runtimeJobs.attachRuntimeArtifactByContract.bind(runtime.runtimeJobs)
    : runtime.runtimeJobs.attachJsonPayloadArtifact.bind(runtime.runtimeJobs);
  await attach({
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
}

async function hydrateReplayPayloadArtifact(runtime, artifacts, uri, expectedArtifactType = null) {
  if (typeof uri !== "string" || !uri.trim()) {
    return {
      status: "missing",
      body: null,
      artifactRef: null,
      payloadRef: null,
      reasonCodes: ["payload_uri_missing"],
    };
  }
  const artifact = artifacts.find(
    (candidate) =>
      candidate.uri === uri &&
      (!expectedArtifactType || candidate.artifactType === expectedArtifactType),
  );
  if (!artifact) {
    return {
      status: "missing",
      body: null,
      artifactRef: uri,
      payloadRef: null,
      reasonCodes: ["payload_artifact_missing"],
    };
  }
  const artifactMetadata = metadataOf(artifact);
  const payloadRef =
    typeof artifactMetadata.payloadRef === "string" ? artifactMetadata.payloadRef : null;
  const hydrated = await runtime.runtimeJobs
    .hydrateRuntimeArtifactByContract(artifact)
    .catch(() => null);
  const payload =
    hydrated?.payload ??
    (await runtime.runtimeJobs.hydrateJsonPayloadArtifact(artifact).catch(() => null));
  if (!payload) {
    return {
      status: "missing",
      body: null,
      artifactRef: uri,
      payloadRef,
      reasonCodes: ["payload_artifact_hydration_failed"],
    };
  }
  return {
    status: "hydrated",
    body: payload.body,
    artifactRef: uri,
    payloadRef: payload.payloadRef,
    sha256: payload.sha256,
    byteCount: payload.sizeBytes,
    reasonCodes: ["payload_artifact_hydrated"],
  };
}

function resolveRepoFilePath(repoRoot, fileRef) {
  const normalized = String(fileRef ?? "")
    .replaceAll("\\", "/")
    .replace(/^\.\/+/u, "");
  const fullPath = path.resolve(repoRoot, normalized);
  const rootWithSep = repoRoot.endsWith(path.sep) ? repoRoot : `${repoRoot}${path.sep}`;
  if (!normalized || !fullPath.startsWith(rootWithSep)) {
    return null;
  }
  return { normalized, fullPath };
}

async function snapshotWorkerTargetFiles(repoRoot, fileRefs) {
  const snapshots = new Map();
  for (const fileRef of repoFileRefs(fileRefs, 120)) {
    const resolved = resolveRepoFilePath(repoRoot, fileRef);
    if (!resolved || snapshots.has(resolved.normalized)) {
      continue;
    }
    try {
      const content = await fs.readFile(resolved.fullPath, "utf8");
      snapshots.set(resolved.normalized, {
        fileRef: resolved.normalized,
        existedBefore: true,
        content,
      });
    } catch {
      snapshots.set(resolved.normalized, {
        fileRef: resolved.normalized,
        existedBefore: false,
        content: "",
      });
    }
  }
  return snapshots;
}

async function restoreWorkerTargetFiles(repoRoot, snapshots, changedFileRefs) {
  const restoredFileRefs = [];
  const removedFileRefs = [];
  const failedFileRefs = [];
  for (const fileRef of repoFileRefs(changedFileRefs, 120)) {
    const resolved = resolveRepoFilePath(repoRoot, fileRef);
    const snapshot = snapshots.get(fileRef);
    if (!resolved || !snapshot) {
      failedFileRefs.push(fileRef);
      continue;
    }
    try {
      if (snapshot.existedBefore) {
        await fs.mkdir(path.dirname(resolved.fullPath), { recursive: true });
        await fs.writeFile(resolved.fullPath, snapshot.content, "utf8");
        restoredFileRefs.push(fileRef);
      } else {
        await fs.rm(resolved.fullPath, { force: true });
        removedFileRefs.push(fileRef);
      }
    } catch {
      failedFileRefs.push(fileRef);
    }
  }
  return { restoredFileRefs, removedFileRefs, failedFileRefs };
}

function createBoundaryReplayImplementationExecutor({
  runtime,
  runtimeJobId,
  graphId,
  workflowId,
  objective,
  validationCommandRefs,
  resourceFulfillmentSummary,
  orchestrator,
  boundary,
  persistWorkerEdits,
}) {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim() ?? "";
  const openRouter = apiKey
    ? new OpenRouterAgentTeamModelClient({
        apiKey,
        retryPolicy: { maxAttempts: 2, timeoutMs: 480_000 },
        requestProfilesByModelId: {
          "moonshotai/kimi-k2.6": {
            responseFormatMode: "prompt_only",
            reasoningMode: "none",
            maxTokens: 10_000,
          },
          "qwen/qwen3-coder-next": {
            responseFormatMode: "prompt_only",
            reasoningMode: "none",
            maxTokens: 4_000,
          },
        },
      })
    : null;
  const modelClient = {
    async nextTurn(input) {
      if (!openRouter) {
        const responseHash = sha256("openrouter-api-key-missing");
        return {
          modelRunRef: `openrouter://boundary-replay/kimi/${responseHash.slice(0, 16)}`,
          responseText: null,
          responseHash,
          latencyMs: 0,
          rawPromptStored: false,
          rawResponseStored: false,
        };
      }
      const started = Date.now();
      const result = await openRouter.callRole({
        roleId: "implementation_engineer",
        modelId: input.modelRef,
        modelCandidateId: "product-spec-boundary-replay-kimi-worker",
        prompt: input.taskSummary,
        responseFormat: "json_object",
        requestProfileOverride: {
          responseFormatMode: input.responseFormatMode ?? "prompt_only",
          reasoningMode: input.reasoningMode ?? "none",
          maxTokens: Math.min(input.maxOutputTokens, 10_000),
        },
        maxTokens: Math.min(input.maxOutputTokens, 10_000),
        timeoutMs: Math.min(input.timeoutMs, 480_000),
        maxAttempts: Math.max(1, Math.min(input.maxAttempts ?? 1, 2)),
      });
      const responseHash = result.responseHash ?? sha256(result.errorReasonCode ?? "no_response");
      return {
        modelRunRef: `openrouter://product-spec-boundary-replay/kimi/${responseHash.slice(0, 16)}`,
        responseText: result.responseText,
        responseHash,
        latencyMs: Date.now() - started,
        rawPromptStored: false,
        rawResponseStored: false,
      };
    },
  };
  const validationRunner = {
    async run(commandRef) {
      const trimmed = String(commandRef ?? "").trim();
      if (trimmed.startsWith("git diff --check -- ")) {
        const changedRefs = trimmed
          .slice("git diff --check -- ".length)
          .split(/\s+/u)
          .map((ref) => ref.trim())
          .filter(Boolean);
        const unsafeRef = changedRefs.find(
          (ref) => ref.startsWith("/") || ref.includes("..") || ref.startsWith("-"),
        );
        if (unsafeRef || changedRefs.length === 0) {
          return {
            validationRef: `validation://boundary-replay/not-run/${sha256(trimmed).slice(0, 16)}`,
            status: "not_run",
            summary: unsafeRef
              ? `Boundary replay refused unsafe diff-check ref: ${unsafeRef}`
              : "Boundary replay refused empty diff-check ref set.",
            commandRef: trimmed,
            rawCommandLogStored: false,
          };
        }
        const started = Date.now();
        try {
          await execFileAsync("git", ["diff", "--check", "--", ...changedRefs], {
            cwd: process.cwd(),
            timeout: Number(process.env.OPENCLAW_BOUNDARY_REPLAY_VALIDATION_TIMEOUT_MS ?? 600_000),
            maxBuffer: 2_000_000,
          });
          return {
            validationRef: `validation://boundary-replay/passed/${sha256(trimmed).slice(0, 16)}`,
            status: "passed",
            summary: `Validation passed in ${Date.now() - started}ms: ${trimmed}`,
            commandRef: trimmed,
            durationMs: Date.now() - started,
            failureKind: null,
            rawCommandLogStored: false,
          };
        } catch (error) {
          const durationMs = Date.now() - started;
          const stderr = typeof error?.stderr === "string" ? error.stderr : "";
          const stdout = typeof error?.stdout === "string" ? error.stdout : "";
          const message = String(error?.message ?? error);
          const combined = `${message}\n${stderr}\n${stdout}`;
          return {
            validationRef: `validation://boundary-replay/failed/${sha256(`${trimmed}:${error?.message ?? ""}`).slice(0, 16)}`,
            status: "failed",
            summary: `Validation failed in ${durationMs}ms: ${combined.slice(0, 4_000)}`,
            commandRef: trimmed,
            durationMs,
            exitCode: typeof error?.code === "number" ? error.code : null,
            signal: typeof error?.signal === "string" ? error.signal : null,
            failureKind: "validation_failure",
            stderr: stderr.slice(0, 6_000),
            stdout: stdout.slice(0, 4_000),
            rawCommandLogStored: false,
          };
        }
      }
      if (!trimmed.startsWith("pnpm test:file ")) {
        return {
          validationRef: `validation://boundary-replay/not-run/${sha256(trimmed).slice(0, 16)}`,
          status: "not_run",
          summary: "Boundary replay only runs approved pnpm test:file validation refs.",
        };
      }
      const args = trimmed.split(/\s+/u).slice(1);
      const started = Date.now();
      try {
        await execFileAsync("pnpm", args, {
          cwd: process.cwd(),
          timeout: Number(process.env.OPENCLAW_BOUNDARY_REPLAY_VALIDATION_TIMEOUT_MS ?? 600_000),
          maxBuffer: 2_000_000,
        });
        return {
          validationRef: `validation://boundary-replay/passed/${sha256(trimmed).slice(0, 16)}`,
          status: "passed",
          summary: `Validation passed in ${Date.now() - started}ms: ${trimmed}`,
          commandRef: trimmed,
          durationMs: Date.now() - started,
          failureKind: null,
          rawCommandLogStored: false,
        };
      } catch (error) {
        const durationMs = Date.now() - started;
        const stderr = typeof error?.stderr === "string" ? error.stderr : "";
        const stdout = typeof error?.stdout === "string" ? error.stdout : "";
        const message = String(error?.message ?? error);
        const combined = `${message}\n${stderr}\n${stdout}`;
        const failureKind =
          /PARSE_ERROR|Transform failed|SyntaxError|Unexpected token|TS1005|TS1128|Expected/i.test(
            combined,
          )
            ? "syntax_or_parse"
            : /TypeError|TS\d{4}|typecheck|type check/i.test(combined)
              ? "schema_or_type_contract"
              : "validation_failure";
        return {
          validationRef: `validation://boundary-replay/failed/${sha256(`${trimmed}:${error?.message ?? ""}`).slice(0, 16)}`,
          status: "failed",
          summary: `Validation failed in ${durationMs}ms: ${combined.slice(0, 4_000)}`,
          commandRef: trimmed,
          durationMs,
          exitCode: typeof error?.code === "number" ? error.code : null,
          signal: typeof error?.signal === "string" ? error.signal : null,
          failureKind,
          stderr: stderr.slice(0, 6_000),
          stdout: stdout.slice(0, 4_000),
          rawCommandLogStored: false,
        };
      }
    },
  };
  const adapter = new ModelAgnosticFileEditWorkerAdapter({
    runtimeToolKernel: runtime.runtimeToolKernel,
    toolUsingKimiWorkerLoop: new NonCodexToolUsingWorkerLoop({
      runtimeToolKernel: runtime.runtimeToolKernel,
      modelClient,
      validationRunner,
      phaseSink: async (event) => {
        await emitReplayState({
          runtime,
          runtimeJobId,
          event: "non_codex_worker_progress",
          graphId: event.graphId ?? graphId,
          boundary,
          phase: event.phase,
          status:
            event.phase === "worker.loop.completed"
              ? "completed"
              : event.phase === "worker.loop.needs_review" ||
                  event.phase === "worker.escalation.recommended"
                ? "needs_review"
                : "running",
          details: {
            nodeId: event.nodeId ?? null,
            workerId: event.workerId,
            modelRef: event.modelRef,
            toolId: event.toolId ?? null,
            toolInvocationRef: event.toolInvocationRef ?? null,
            targetRefs: Array.isArray(event.targetRefs) ? event.targetRefs.slice(0, 16) : [],
            changedFileRefs: Array.isArray(event.changedFileRefs)
              ? event.changedFileRefs.slice(0, 16)
              : [],
            validationRefs: Array.isArray(event.validationRefs)
              ? event.validationRefs.slice(0, 16)
              : [],
            commitmentIdsAdvanced: Array.isArray(event.commitmentIdsAdvanced)
              ? event.commitmentIdsAdvanced.slice(0, 16)
              : [],
            blockerSummary: event.blockerSummary ?? null,
            nextAction: event.nextAction ?? null,
            eli5Progress: event.eli5Progress,
            reasonCodes: Array.isArray(event.reasonCodes) ? event.reasonCodes.slice(0, 20) : [],
          },
        });
      },
    }),
  });
  return {
    async execute({ node }) {
      const metadata = jsonRecord(node.metadata);
      const artifacts = await runtime.runtimeJobs.listArtifacts(runtimeJobId);
      const hydratedNodePacketPayload =
        typeof metadata.nodeExecutionPacketRef === "string"
          ? await hydrateReplayPayloadArtifact(
              runtime,
              artifacts,
              metadata.nodeExecutionPacketRef,
              "execution_platform.node_execution_packet",
            )
          : null;
      const hydratedNodePacket = NodeExecutionPacketSchema.safeParse(
        hydratedNodePacketPayload?.body ?? null,
      );
      const nodeExecutionContractRef =
        hydratedNodePacket.success && typeof hydratedNodePacket.data.nodeExecutionContractRef === "string"
          ? hydratedNodePacket.data.nodeExecutionContractRef
          : typeof metadata.nodeExecutionContractRef === "string"
            ? metadata.nodeExecutionContractRef
            : null;
      const hydratedNodeExecutionContractPayload =
        typeof nodeExecutionContractRef === "string"
          ? await hydrateReplayPayloadArtifact(
              runtime,
              artifacts,
              nodeExecutionContractRef,
              "execution_platform.node_execution_contract",
            )
          : null;
      const hydratedNodeExecutionContract = NodeExecutionContractSchema.safeParse(
        hydratedNodeExecutionContractPayload?.body ?? null,
      );
      const hydratedResourcePayload =
        typeof metadata.resourcePacketRef === "string"
          ? await hydrateReplayPayloadArtifact(
              runtime,
              artifacts,
              metadata.resourcePacketRef,
              "execution_platform.coding_resource_packet",
            )
          : null;
      const hydratedResourcePacket = CodingResourcePacketSchema.safeParse(
        hydratedResourcePayload?.body ?? null,
      );
      const hydratedTaskPayload = hydratedResourcePacket.success
        ? await hydrateReplayPayloadArtifact(
            runtime,
            artifacts,
            hydratedResourcePacket.data.implementationTaskPacketRef,
            "execution_platform.implementation_task_packet",
          )
        : null;
      const hydratedTaskPacket = ImplementationTaskPacketSchema.safeParse(
        hydratedTaskPayload?.body ?? null,
      );
      if (
        !hydratedNodeExecutionContract.success ||
        !hydratedNodePacket.success ||
        !hydratedResourcePacket.success ||
        !hydratedTaskPacket.success
      ) {
        const result = {
          status: "needs_review",
          outputArtifactRefs: [],
          reasonCodes: [
            "boundary_replay_worker_hydrated_execution_packet_required",
            ...(hydratedNodeExecutionContract.success
              ? []
              : ["node_execution_contract_payload_invalid_or_missing"]),
            ...(hydratedNodePacket.success
              ? []
              : ["node_execution_packet_payload_invalid_or_missing"]),
            ...(hydratedResourcePacket.success
              ? []
              : ["coding_resource_packet_payload_invalid_or_missing"]),
            ...(hydratedTaskPacket.success
              ? []
              : ["implementation_task_packet_payload_invalid_or_missing"]),
          ],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
          workQueueLifecycleMutated: false,
        };
        orchestrator.noteNodeResult(node.nodeId, result);
        return result;
      }
      const taskPacket = hydratedTaskPacket.data;
      const workerPacket = {
        nodeExecutionContract: hydratedNodeExecutionContract.data,
        nodeExecutionPacket: hydratedNodePacket.data,
        codingResourcePacket: hydratedResourcePacket.data,
      };
      const targetRefs = repoFileRefs(
        hydratedResourcePacket.success
          ? hydratedResourcePacket.data.targetFileRefs
          : stringArray(metadata.targetRefs),
        12,
      );
      const allowedRefs = repoFileRefs(
        hydratedResourcePacket.success ? hydratedResourcePacket.data.allowedEditScope : targetRefs,
        80,
      );
      const contextRefs = [
        ...(hydratedResourcePacket.success ? hydratedResourcePacket.data.contextPacketRefs : []),
        ...node.inputHandoffRefs,
        ...resourceFulfillmentCommitmentResults(resourceFulfillmentSummary)
          .filter((result) => node.inputHandoffRefs.includes(result.resourceHandoffPacketRef))
          .flatMap((result) => [result.resourceHandoffPacketRef, result.contextScoutToolLoopRef]),
      ]
        .filter((ref) => typeof ref === "string" && ref.trim())
        .slice(0, 24);
      if (!apiKey) {
        const result = {
          status: "needs_review",
          outputArtifactRefs: [],
          reasonCodes: ["openrouter_api_key_not_resolved_for_boundary_replay_worker_execution"],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
          workQueueLifecycleMutated: false,
        };
        orchestrator.noteNodeResult(node.nodeId, result);
        return result;
      }
      if (allowedRefs.length === 0) {
        const result = {
          status: "needs_review",
          outputArtifactRefs: [],
          reasonCodes: ["boundary_replay_worker_allowed_scope_missing"],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
          workQueueLifecycleMutated: false,
        };
        orchestrator.noteNodeResult(node.nodeId, result);
        return result;
      }
      const workerCapabilityId =
        typeof metadata.capabilityId === "string"
          ? metadata.capabilityId
          : node.nodeKind === "test_authoring"
            ? "test_authoring"
            : "implementation_microtask";
      await emitReplayState({
        runtime,
        runtimeJobId,
        event: "worker_execution_started",
        graphId: node.graphId,
        boundary,
        phase: "worker_execution",
        status: "running",
        details: {
          nodeId: node.nodeId,
          nodeKind: node.nodeKind,
          capabilityId: workerCapabilityId,
          targetRefs: taskPacket.targetFileRefs.slice(0, 12),
          allowedFileRefCount: taskPacket.allowedFileRefs.length,
          contextRefCount: taskPacket.contextPacketRefs.length,
          nodeExecutionPacketRef: workerPacket.nodeExecutionPacket.packetRef,
          nodeExecutionContractRef: workerPacket.nodeExecutionContract.contractRef,
          resourcePacketRef: workerPacket.codingResourcePacket.packetRef,
          implementationTaskPacketRef: taskPacket.packetRef,
          payloadRefs: [],
          persistenceMode: persistWorkerEdits
            ? "apply_to_workspace"
            : "rollback_after_review_artifact",
        },
      });
      const preWorkerSnapshots = persistWorkerEdits
        ? null
        : await snapshotWorkerTargetFiles(process.cwd(), [
            ...new Set([...targetRefs, ...allowedRefs]),
          ]);
      const adapterResult = await adapter.run({
        runtimeJobId,
        graphId: node.graphId,
        nodeId: node.nodeId,
        workerKind: "kimi_standard_implementation",
        workerId: "worker.kimi.file-implementation",
        roleId: node.assignedRole,
        taskId: `${runtimeJobId}-${node.nodeId}`,
        taskTitle: taskPacket.microtaskTitle,
        exactEditObjective: taskPacket.exactEditObjective,
        implementationTaskPacket: taskPacket,
        nodeExecutionContract: workerPacket.nodeExecutionContract,
        nodeExecutionPacket: workerPacket.nodeExecutionPacket,
        codingResourcePacket: workerPacket.codingResourcePacket,
        rationaleForCallingThisRole: taskPacket.whyThisWorkerWasSelected,
        downstreamConsumer: taskPacket.downstreamConsumer,
        expectedOutput: taskPacket.expectedOutput,
        repoRoot: process.cwd(),
        allowedFileRefs: allowedRefs,
        targetFileRefs: taskPacket.targetFileRefs,
        deniedFileRefs: [],
        contextPackRefs: taskPacket.contextPacketRefs,
        validationCommandRefs: taskPacket.validationCommandRefs,
        targetCommitmentIds: taskPacket.targetCommitmentIds,
        acceptanceCriteria: taskPacket.acceptanceCriteria,
        expectedEvidenceClaimKinds: taskPacket.expectedEvidenceClaimKinds,
        stopIfMissingOrEscalate: taskPacket.stopIfMissingOrEscalate,
        budgetPolicyRefs: taskPacket.budgetPolicyRefs,
        budgetPolicy: {
          modelRef: "moonshotai/kimi-k2.6",
          providerPath: "openrouter",
          maxOutputTokens: 10_000,
          timeoutMs: 480_000,
          maxAttempts: 4,
          modelPolicy: {
            controller: { modelRef: "qwen/qwen3-coder-next" },
            patch: { modelRef: "moonshotai/kimi-k2.6", reasoningMode: "none" },
            validation_repair: { modelRef: "qwen/qwen3-coder-next" },
            evidence: { modelRef: "qwen/qwen3-coder-next" },
            context_decision: { modelRef: "qwen/qwen3-coder-next" },
            escalation: { modelRef: "qwen/qwen3-coder-next" },
          },
        },
      });
      const rollbackResult =
        preWorkerSnapshots && adapterResult.changedFileRefs.length > 0
          ? await restoreWorkerTargetFiles(
              process.cwd(),
              preWorkerSnapshots,
              adapterResult.changedFileRefs,
            )
          : {
              restoredFileRefs: [],
              removedFileRefs: [],
              failedFileRefs: [],
            };
      const persistenceReasonCodes =
        !persistWorkerEdits && adapterResult.changedFileRefs.length > 0
          ? [
              "boundary_replay_worker_edits_rolled_back_for_review",
              `boundary_replay_worker_review_pending_file_count:${adapterResult.changedFileRefs.length}`,
              ...(rollbackResult.failedFileRefs.length > 0
                ? ["boundary_replay_worker_edit_rollback_needs_review"]
                : ["boundary_replay_worker_edit_rollback_completed"]),
            ]
          : persistWorkerEdits
            ? ["boundary_replay_worker_edits_persisted_by_explicit_flag"]
            : ["boundary_replay_worker_no_workspace_edits_to_rollback"];
      const outputRef = `runtime-job://${runtimeJobId}/boundary-replay/worker-result/${node.nodeId}/${sha256(JSON.stringify(adapterResult)).slice(0, 16)}`;
      await runtime.runtimeJobs.attachArtifact({
        jobId: runtimeJobId,
        artifactType: "execution_platform.product_spec_boundary_replay_worker_result",
        storageKind: "metadata",
        uri: outputRef,
        contentType: "application/json",
        metadata: {
          artifactKind: "product_spec_boundary_replay_worker_result",
          boundary,
          graphId: node.graphId,
          nodeId: node.nodeId,
          status: adapterResult.status,
          changedFileRefs: adapterResult.changedFileRefs.slice(0, 20),
          pendingReviewChangedFileRefs: persistWorkerEdits
            ? []
            : adapterResult.changedFileRefs.slice(0, 20),
          workspacePersistenceMode: persistWorkerEdits
            ? "apply_to_workspace"
            : "rollback_after_review_artifact",
          rollbackResult,
          validationRefs: adapterResult.validationRefs.slice(0, 20),
          runtimeToolInvocationRefs: adapterResult.runtimeToolInvocationRefs.slice(0, 30),
          reasonCodes: [...adapterResult.reasonCodes, ...persistenceReasonCodes].slice(0, 30),
          boundedAdapterDiagnostics: {
            sourceAdapterKind: adapterResult.sourceAdapterKind,
            toolResults: adapterResult.toolResults.slice(0, 20).map((toolResult) => ({
              toolId: toolResult.toolId,
              status: toolResult.status,
              summary: toolResult.summary,
              reasonCodes: toolResult.reasonCodes.slice(0, 12),
            })),
          },
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
        },
      });
      const evidenceClaimRefs = Array.isArray(adapterResult.evidenceClaims)
        ? adapterResult.evidenceClaims
            .map((claim) =>
              claim && typeof claim.evidenceRef === "string" ? claim.evidenceRef : null,
            )
            .filter(Boolean)
        : [];
      const outputArtifactRefs = boundedGraphOutputRefs(
        outputRef,
        [
          ...evidenceClaimRefs,
          ...adapterResult.validationRefs,
          ...adapterResult.changedFileRefs,
          ...adapterResult.artifactRefs,
        ],
        24,
      );
      const result = {
        status: adapterResult.status === "applied_change" ? "succeeded" : "needs_review",
        outputArtifactRefs,
        changedFileRefs: adapterResult.changedFileRefs.slice(0, 20),
        validationRefs: adapterResult.validationRefs.slice(0, 20),
        evidenceClaims: Array.isArray(adapterResult.evidenceClaims)
          ? adapterResult.evidenceClaims.slice(0, 20)
          : [],
        runtimeToolInvocationRefs: adapterResult.runtimeToolInvocationRefs.slice(0, 30),
        reasonCodes: [...adapterResult.reasonCodes, ...persistenceReasonCodes].slice(0, 40),
        metadata: {
          workerResultRef: outputRef,
          outputArtifactRefCount: adapterResult.artifactRefs.length + 1,
          outputArtifactRefsTruncated:
            outputArtifactRefs.length < adapterResult.artifactRefs.length + 1,
          evidenceClaimRefs: evidenceClaimRefs.slice(0, 20),
          runtimeToolInvocationRefs: adapterResult.runtimeToolInvocationRefs.slice(0, 30),
          pendingReviewChangedFileRefs: persistWorkerEdits
            ? []
            : adapterResult.changedFileRefs.slice(0, 20),
          workspacePersistenceMode: persistWorkerEdits
            ? "apply_to_workspace"
            : "rollback_after_review_artifact",
          rollbackResult,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
        },
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        workQueueLifecycleMutated: false,
      };
      await emitReplayState({
        runtime,
        runtimeJobId,
        event: "worker_execution_completed",
        graphId: node.graphId,
        boundary,
        phase: "worker_execution",
        status: result.status,
        details: {
          nodeId: node.nodeId,
          adapterStatus: adapterResult.status,
          changedFileRefs: adapterResult.changedFileRefs.slice(0, 20),
          pendingReviewChangedFileRefs: persistWorkerEdits
            ? []
            : adapterResult.changedFileRefs.slice(0, 20),
          workspacePersistenceMode: persistWorkerEdits
            ? "apply_to_workspace"
            : "rollback_after_review_artifact",
          rollbackResult,
          validationRefs: adapterResult.validationRefs.slice(0, 20),
          reasonCodes: [...adapterResult.reasonCodes, ...persistenceReasonCodes].slice(0, 20),
          workerResultRef: outputRef,
        },
      });
      orchestrator.noteNodeResult(node.nodeId, result);
      return result;
    },
  };
}

function createSchedulerOrchestrator({
  runtime,
  runtimeJobId,
  boundary,
  objective,
  repoScopeRefs,
  validationCommandRefs,
  resourceFulfillmentSummary,
}) {
  const modelClient = new CodexDynamicJsonClient(process.cwd());
  const nodeResultById = new Map();
  return {
    noteNodeResult(nodeId, result) {
      nodeResultById.set(nodeId, result);
    },
    async decide(input) {
      const capabilityRegistrySummary =
        input.capabilityRegistrySummary ?? runtimeNodeCapabilityManifestForModel();
      const userPayload = {
        graphId: input.graphId,
        iteration: input.iteration,
        ownerObjectiveSummary: objective.slice(0, 4_000),
        repoScopeRefs,
        validationCommandRefs,
        schedulerSnapshot: input.snapshotSummary,
        missionLedgerSummary: input.missionLedgerSummary ?? null,
        nodeLocalResourceHandoffSummary: resourceFulfillmentSummary,
        schedulerRoleObligationGuidance: input.schedulerRoleObligationGuidance ?? null,
        recentNodeResultSummaries: input.recentNodeResultSummaries ?? [],
        runtimeNodeCapabilityManifest: capabilityRegistrySummary,
        nodeResultRefs: [...nodeResultById.entries()].map(([nodeId, result]) => ({
          nodeId,
          status: result.status,
          outputArtifactRefs: (result.outputArtifactRefs ?? []).slice(0, 8),
          reasonCodes: (result.reasonCodes ?? []).slice(0, 10),
        })),
        repairAttempt: input.repairAttempt ?? 0,
        rejectedDecisionReasonCodes: input.rejectedDecisionReasonCodes ?? [],
        rejectedDecisionDiagnostics: input.rejectedDecisionDiagnostics ?? [],
        rejectedDecisionRef: input.rejectedDecisionRef ?? null,
        repairFieldHints: input.repairFieldHints ?? [],
        repairDiagnostics: input.repairDiagnostics ?? null,
        allowedTerminalStates: ["create_closeout", "mark_needs_review", "mark_blocked"],
        rawPromptStored: false,
        rawResponseStored: false,
      };
      await emitReplayState({
        runtime,
        runtimeJobId,
        event: "scheduler_orchestrator_model_call_started",
        graphId: input.graphId,
        boundary,
        phase: "scheduler_decision",
        status: "running",
        details: {
          iteration: input.iteration,
          repairAttempt: input.repairAttempt ?? 0,
          modelRef: DEFAULT_DYNAMIC_ORCHESTRATOR_MODEL_REF,
          providerPath: DEFAULT_DYNAMIC_ORCHESTRATOR_PROVIDER_PATH,
          schedulerNodeCount: input.snapshotSummary?.nodeSummaries?.length ?? null,
          schedulerEdgeCount: input.snapshotSummary?.edgeSummaries?.length ?? null,
          openCommitmentCount: Array.isArray(input.missionLedgerSummary?.openCommitmentIds)
            ? input.missionLedgerSummary.openCommitmentIds.length
            : null,
          capabilityCount: Array.isArray(capabilityRegistrySummary)
            ? capabilityRegistrySummary.length
            : null,
          rejectedDecisionReasonCodes: (input.rejectedDecisionReasonCodes ?? []).slice(0, 16),
          payloadHash: sha256(stringifyJson(userPayload)),
        },
      });
      let response;
      try {
        response = await modelClient.runJson({
          modelRef: DEFAULT_DYNAMIC_ORCHESTRATOR_MODEL_REF,
          providerPath: DEFAULT_DYNAMIC_ORCHESTRATOR_PROVIDER_PATH,
          systemPrompt: [
            "You are the OpenClaw Runtime Work Graph scheduler orchestrator.",
            "Choose exactly one next graph action from current bounded graph state.",
            "For complex missions, use the staged scheduler protocol instead of hand-authoring executable graph envelopes.",
            "Return strict JSON. The runtime compiler owns executable graph schema, node kinds, executor keys, worker refs, and evidence enums.",
            "Required top-level fields: decisionId, decisionKind, rationaleForDecision, reasonCodes, rawPromptStored, rawResponseStored, rawProviderLogStored, workQueueLifecycleMutated.",
            "Valid decisionKind values include add_nodes, run_node, split_node, retry_node, rerun_role, request_review, request_human_decision, create_closeout, mark_needs_review, mark_blocked. Node-local context, validation repair, and worker escalation are runner-owned lifecycle transitions, not scheduler decision kinds.",
            "For complex add_nodes decisions, provide one stagedScheduler object. The runtime records the staged tools and derives canonical node envelopes.",
            "stagedScheduler.workBreakdownUnits contain only model-owned intent: workUnitId, title, objective, executionIntent, commitmentIds, rationale, expectedOutcome, targetRefs.",
            "stagedScheduler.capabilitySelectionsForWorkUnits contain only model-owned selection: workUnitId, selectedCapabilityId, consideredCapabilityIds, utilityRationale, costRationale, whyCheaperOptionsWereInsufficient when relevant, whyThisIsNotDuplicateWork, stopOrEscalationCondition, and qualification refs only when the manifest requires them.",
            "stagedScheduler.nodeContractDrafts contain only worker-facing contract fields: workUnitId, executionIntent, roleRationale, objective, inputRefs, expectedOutput, successCriteria, downstreamConsumer, targetRefs.",
            "Valid executionIntent values are source_grounding, resource_fulfillment, resource_materialization, source_edit, validation, review, docs, readback, closeout, and human_decision. Use source_edit only when changed-file evidence is required; use source_grounding for read-only source/spec inspection; the runtime derives evidenceMode and rejects capability/intent conflicts.",
            "stagedScheduler.edgeOrParallelismDraft must contain dependency/handoff edges using workUnitId refs, or parallelIndependentNodesJustification explaining why the units can run independently.",
            "Do not provide graphNodeKind, nodeKind, executorKey, workerRef, requiredMetadataSchemaRef, expectedEvidence, selectedNodeKind, selectedExecutorKey, low-level evidence enums, or canonical node ids for complex add_nodes.",
            "Do not create durable resource_scout graph nodes or route context acquisition back to the scheduler. Context acquisition is node-local worker-owned demand state handled by the lifecycle runner and worker context/scout small-verb transitions.",
            "Use the runtimeNodeCapabilityManifest to choose the cheapest sufficiently capable node that advances a commitment, reduces uncertainty, enables parallel work, or produces evidence needed for closure.",
            "Do not self-execute work in the orchestrator. The orchestrator selects nodes and reviews evidence; worker nodes do implementation, research, validation, review, or closeout work.",
            "Do not store raw prompts, responses, transcripts, logs, secrets, or hidden reasoning.",
          ].join("\n"),
          userPayload,
          maxOutputTokens: 12_000,
          timeoutMs: Number(
            process.env.OPENCLAW_BOUNDARY_REPLAY_ORCHESTRATOR_TIMEOUT_MS ?? 900_000,
          ),
          taskClass: "global_reasoning",
          modelTaskCallSite: "scheduler.global_reasoning",
          progress: {
            spanId: `${runtimeJobId}:${input.graphId}:scheduler:${input.iteration}:${input.repairAttempt ?? 0}`,
            objectiveSummary: "Replay scheduler orchestrator model call.",
            reasonCodes: ["boundary_replay_scheduler_model_call"],
            onEvent: (event) =>
              emitReplayState({
                runtime,
                runtimeJobId,
                event: "model_call_progress",
                graphId: input.graphId,
                boundary,
                phase: "scheduler_decision",
                status: event.phase === "failed" ? "failed" : "running",
                details: event,
              }),
          },
        });
      } catch (error) {
        await emitReplayState({
          runtime,
          runtimeJobId,
          event: "scheduler_orchestrator_model_call_failed",
          graphId: input.graphId,
          boundary,
          phase: "scheduler_decision",
          status: "failed",
          details: {
            iteration: input.iteration,
            repairAttempt: input.repairAttempt ?? 0,
            errorName: error?.name ?? "unknown_error",
            errorSummary: String(error?.message ?? error).slice(0, 500),
            errorMessageHash: sha256(error?.message ?? String(error)),
          },
        });
        throw error;
      } finally {
        modelClient.close();
      }
      const parsed = parseJsonObject(response.responseText);
      await emitReplayState({
        runtime,
        runtimeJobId,
        event: "scheduler_orchestrator_model_call_completed",
        graphId: input.graphId,
        boundary,
        phase: "scheduler_decision",
        status: "completed",
        details: {
          iteration: input.iteration,
          repairAttempt: input.repairAttempt ?? 0,
          responseHash: response.responseHash ?? null,
          decisionKind: parsed.decisionKind ?? null,
          decisionId: parsed.decisionId ?? null,
          hasStagedScheduler: Boolean(parsed.stagedScheduler),
          topLevelKeys: Object.keys(parsed).slice(0, 40),
        },
      });
      return parsed;
    },
  };
}

function boundaryStopExecutor(boundary, orchestrator, { executeWorkers = false } = {}) {
  return {
    async execute({ node }) {
      const outputRef = `runtime-job://${node.runtimeJobId ?? "boundary-replay"}/boundary-replay/${boundary}/${node.nodeId}`;
      if (boundaryStopsBeforeWorkerExecution(boundary, node, { executeWorkers })) {
        throw new BoundaryReplayStop({
          status: "succeeded",
          iterations: 0,
          addedNodeIds: [],
          executedNodeIds: [],
          selectedNodeId: node.nodeId,
          reasonCodes: [
            boundarySelectedReasonCode(boundary),
            "boundary_replay_stopped_before_worker_execution_without_mutating_node_success",
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

function createDomainResourceSelectionSelector({ runtime, runtimeJobId, boundary, graphId }) {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim() ?? "";
  const adapters = apiKey
    ? [
        {
          providerPath: "openrouter",
          async executeJson(input) {
            const client = new OpenRouterAgentTeamModelClient({
              apiKey,
              retryPolicy: { maxAttempts: 2, timeoutMs: input.timeoutMs },
              requestProfilesByModelId: {
                [input.modelRef]: {
                  responseFormatMode: "prompt_only",
                  reasoningMode: input.reasoningMode === "none" ? "none" : "exclude",
                  maxTokens: input.maxOutputTokens,
                },
              },
            });
            const prompt = [
              input.systemPrompt,
              "",
              "USER_PAYLOAD_JSON:",
              stringifyJson(input.userPayload),
            ].join("\n");
            const result = await client.callRole({
              roleId: "implementation_engineer",
              modelId: input.modelRef,
              modelCandidateId: `domain-resource-selection:${input.modelRef}`,
              prompt,
              maxTokens: input.maxOutputTokens,
              timeoutMs: input.timeoutMs,
              taskClass: input.taskClass,
              modelTaskCallSite: input.callSite,
            });
            return {
              status: result.status,
              responseText: result.responseText,
              responseHash: result.responseHash,
              latencyMs:
                typeof result.providerResponseDiagnostics?.elapsedMs === "number"
                  ? result.providerResponseDiagnostics.elapsedMs
                  : null,
              usage: result.usage,
              providerResponseDiagnostics: result.providerResponseDiagnostics,
              errorReasonCode: result.errorReasonCode,
            };
          },
        },
      ]
    : [];
  const modelClientRouter = new ModelTaskClientRouter({ adapters });
  return {
    async select(input) {
      const userPayload = {
        graphId: input.graphId,
        iteration: input.iteration,
        nodeId: input.nodeId,
        nodeKind: input.nodeKind,
        assignedRole: input.assignedRole,
        capabilityId: input.capabilityId,
        workIntentRef: input.workIntentRef,
        workIntentContextResolutionRef: input.workIntentContextResolutionRef,
        nodeExecutionContractRef: input.nodeExecutionContractRef,
        requestRef: input.request.requestRef,
        requestHash: input.request.requestHash,
        candidateHandleManifestRef: input.candidateHandleManifest.manifestRef,
        candidateHandleManifestHash: input.candidateHandleManifest.manifestHash,
        candidateResourceRefs: input.candidateResourceRefs,
        candidateHandles: input.candidateHandleManifest.candidateHandles.map((handle) => ({
          candidateId: handle.candidateId,
          resourceRef: handle.resourceRef,
          resourceKind: handle.resourceKind,
          candidateSource: handle.candidateSource,
          objectiveSnippet: String(handle.objectiveSnippet ?? "").slice(0, 500),
          contextSummary: String(handle.contextSummary ?? "").slice(0, 500),
          payloadRef: handle.payloadRef,
          omittedBodyRef: handle.omittedBodyRef,
        })),
        targetCommitmentIds: input.targetCommitmentIds.slice(0, 12),
        evidenceRequirements: input.evidenceRequirements.slice(0, 8),
        authorityScopeRefs: input.authorityScopeRefs.slice(0, 20),
        allowedToolIds: input.allowedToolIds,
        requiredFields: input.requiredFields,
        semanticQualityJudgedByDeterministicCode: false,
        rawPromptStored: false,
        rawResponseStored: false,
      };
      const requestedInputBytes = Buffer.byteLength(stringifyJson(userPayload), "utf8");
      await emitReplayState({
        runtime,
        runtimeJobId,
        event: "domain_resource_selection_selector_started",
        graphId,
        boundary,
        phase: "domain_resource_selection",
        status: "running",
        details: {
          nodeId: input.nodeId,
          modelRef: "qwen/qwen3-coder-next",
          providerPath: "openrouter",
          requestRef: input.request.requestRef,
          candidateHandleManifestRef: input.candidateHandleManifest.manifestRef,
          candidateHandleCount: input.candidateHandleManifest.candidateHandles.length,
          requestByteCount: requestedInputBytes,
          payloadHash: sha256(stringifyJson(userPayload)),
        },
      });
      const response = await modelClientRouter.runJson({
        boundaryId: "domain_resource_selection",
        taskClass: "tool_selection",
        callSite: "resource.selection",
        systemPrompt: [
          "You are selecting exact domain resources for one OpenClaw WorkIntent.",
          "This is not graph scheduling and not worker execution. Return exactly one compact JSON tool call, not prose.",
          "Allowed toolId/toolName values: resource.selection.propose, resource.selection.mark_blocked.",
          "Top-level JSON may be {\"toolId\":\"resource.selection.propose\",\"input\":{...}} or {\"toolName\":\"resource.selection.propose\",\"arguments\":{...}}.",
          "For resource.selection.propose, include selectedTargetRefs, fileChangeIntents, validationDiscoveryPlan, selectionRationale, excludedCandidateRefs.",
          "selectedTargetRefs and fileChangeIntents[].targetRef must be chosen only from candidateResourceRefs. Do not invent refs or widen authority.",
          "Runtime owns lifecycle, ids, authority validation, packet compilation, write gates, validation, and evidence. You own only semantic target selection from legal candidates.",
          "If legal candidates are insufficient, use resource.selection.mark_blocked with precise missing context questions.",
          "Do not store raw prompts, responses, transcripts, logs, secrets, or hidden reasoning.",
        ].join("\n"),
        userPayload,
        requestedInputBytes,
        maxOutputTokens: 3_000,
        timeoutMs: 60_000,
        reasoningMode: "none",
        proofMode: true,
      });
      if (response.status === "blocked") {
        throw new Error(
          `domain_resource_selection_selector_router_blocked:${response.reasonCodes.join(",")}`,
        );
      }
      const parsed = parseDomainResourceSelectionModelToolCall(response.responseText);
      if (!parsed.toolCall) {
        throw new Error(`domain_resource_selection_selector_invalid_tool:${parsed.reasonCodes.join(",")}`);
      }
      await emitReplayState({
        runtime,
        runtimeJobId,
        event: "domain_resource_selection_selector_completed",
        graphId,
        boundary,
        phase: "domain_resource_selection",
        status: "completed",
        details: {
          nodeId: input.nodeId,
          toolId: parsed.toolCall.toolName,
          responseHash: response.responseHash,
          latencyMs: response.latencyMs,
          selectedTargetRefCount: parsed.toolCall.arguments.selectedTargetRefs?.length ?? 0,
        },
      });
      return {
        toolId: parsed.toolCall.toolName,
        input: parsed.toolCall.arguments,
        modelRef: "qwen/qwen3-coder-next",
        providerPath: "openrouter",
        providerDiagnosticRefs: [],
        reasonCodes: [
          "domain_resource_selection_selector_model_authored_tool_call",
          ...parsed.reasonCodes,
        ],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      };
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
  const runtimeJobId = flag("--runtime-job-id");
  if (!runtimeJobId) {
    throw new Error("runtime_job_id_required");
  }
  const graphIdFlag = flag("--graph-id");
  const boundary = flag("--boundary", "after-resource-handoff");
  if (!isSupportedBoundary(boundary)) {
    throw new Error(`unsupported_boundary:${boundary}`);
  }
  if (isLegacyDiagnosticBoundary(boundary)) {
    throw new Error(`unsupported_diagnostic_boundary:${boundary}`);
  }
  const executeWorkers = boolFlag("--execute-workers", false);
  const persistWorkerEdits = boolFlag("--persist-worker-edits", false);
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

  const runtime = await getExecutionPlatformRuntime(loadConfig());
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
    for (const node of resettableNodes) {
      await runtime.runtimeWorkGraphs.updateNodeStatus({
        nodeId: node.nodeId,
        nodeStatus: "planned",
        outputArtifactRefs: [],
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
      resettableNodes.length > 0 &&
      ["needs_review", "failed", "canceled"].includes(sourceSnapshot.graph.graphStatus)
    ) {
      await runtime.runtimeWorkGraphs.updateGraphStatus({
        graphId,
        graphStatus: "running",
        metadata: {
          ...jsonRecord(sourceSnapshot.graph.metadata),
          boundaryReplayResumedAt: new Date().toISOString(),
          boundaryReplayResetNodeIds: resettableNodes.map((node) => node.nodeId).slice(0, 20),
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
        nodeIds: resettableNodes.map((node) => node.nodeId),
        retiredDependentReviewNodeIds: dependentReviewNodes.map((node) => node.nodeId),
        skippedNodeIds: resetNodeIds.filter(
          (nodeId) => !resettableNodes.some((node) => node.nodeId === nodeId),
        ),
        reasonCodes: ["boundary_replay_selected_nodes_reset_to_planned"],
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
        throw new Error(`runtime_graph_snapshot_missing_after_work_intent_boundary_reset:${graphId}`);
      }
    }
  }

  const missionLedgerArtifact = latestArtifact(
    artifacts,
    "execution_platform.mission_contract_ledger",
  );
  const missionLedger = metadataOf(missionLedgerArtifact);
  const packets = await packetsFromArtifacts(runtime, artifacts);
  const contextToolLoop = latestArtifact(artifacts, "execution_platform.resource_scout_tool_loop");
  const resourceHandoff = latestArtifact(artifacts, "execution_platform.resource_handoff_packet");
  let resourceFulfillmentSummary = await resourceFulfillmentSummaryFromResourceHandoffArtifacts(
    runtime,
    artifacts,
    packets,
    sourceSnapshot,
  );
  if (boundary === "after-work-intent-acceptance") {
    resourceFulfillmentSummary = {
      aggregateResourceFulfillmentRef: null,
      status: "not_applicable",
      packetCount: 0,
      totalPacketCount: packets.length,
      acceptedCount: 0,
      failedCount: 0,
      skippedCommitmentIds: [],
      results: [],
      reasonCodes: [
        "boundary_replay_after_work_intent_acceptance_uses_node_local_resource_demand",
      ],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    };
  }
  const expectedResourceFulfillmentPacketCount =
    typeof resourceFulfillmentSummary.packetCount === "number"
      ? resourceFulfillmentSummary.packetCount
      : packets.length;
  const contextStatus = metadataOf(contextToolLoop).sufficiencyStatus;
  const contextVerifiedCount = Array.isArray(metadataOf(contextToolLoop).verifiedFileRefs)
    ? metadataOf(contextToolLoop).verifiedFileRefs.length
    : 0;
  const isAfterGraphSelection = boundary === "after-graph-selection";
  if (isAfterGraphSelection && !graphIdFlag) {
    throw new Error(`graph_id_required_for_boundary:${boundary}`);
  }
  if (isAfterGraphSelection && !executeWorkers) {
    const hasAcceptedNodeScopedContext = hasAcceptedNodeScopedResourceFulfillment(sourceSnapshot);
    const hasPlannedExecutableNode = sourceSnapshot.nodes.some(
      (node) => node.nodeStatus === "planned",
    );
    const reasonCodes = [];
    if (!hasAcceptedNodeScopedContext) {
      reasonCodes.push("accepted_node_scoped_context_required_before_after_graph_selection_replay");
    }
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
        acceptedNodeScopedResourceFulfillment: hasAcceptedNodeScopedContext,
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
  if (boundary === "after-resource-handoff" && contextStatus !== "accepted") {
    const summary = {
      artifactKind: "product_spec_boundary_replay_result",
      proofSourceKind: PRODUCT_SPEC_RUNTIME_BOUNDARY_REPLAY_PROOF_SOURCE,
      generatedAt: new Date().toISOString(),
      status: "needs_review",
      runtimeJobId,
      graphId,
      boundary,
      reasonCodes: ["accepted_resource_scout_required_before_after_context_replay"],
      contextStatus,
      contextVerifiedCount,
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

  const objective =
    typeof missionLedger.ownerObjectiveSummary === "string"
      ? missionLedger.ownerObjectiveSummary
      : "Continue Product/Spec Planning scheduler replay from accepted context.";
  const repoScopeRefs = [
    ...new Set([
      ...packets.flatMap((packet) =>
        Array.isArray(packet.likelyRepoAreas) ? packet.likelyRepoAreas : [],
      ),
      "extensions/execution-platform/src/",
      "src/gateway/",
      "scripts/",
      "docs/projects/execution-platform/",
    ]),
  ].slice(0, 80);
  const validationCommandRefs = [
    ...new Set(
      packets.flatMap((packet) =>
        Array.isArray(packet.validationCommandRefs) ? packet.validationCommandRefs : [],
      ),
    ),
  ].slice(0, 20);

  const replayGraphId = graphId;
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
    resourceFulfillmentSummary,
  });  const domainResourceSelectionSelector = createDomainResourceSelectionSelector({
    runtime,
    runtimeJobId,
    boundary,
    graphId: replayGraphId,
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
      const implementationExecutor = executeWorkers
    ? createBoundaryReplayImplementationExecutor({
        runtime,
        runtimeJobId,
        graphId: replayGraphId,
        workflowId: replayStartSnapshot.graph.workflowId,
        objective,
        repoScopeRefs,
        validationCommandRefs,
        resourceFulfillmentSummary,
        orchestrator,
        boundary,
        persistWorkerEdits,
      })
    : stopExecutor;
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
  const progressEvents = [];
  let selectedBoundaryNode = null;
  const selectedBoundaryNodes = [];
  const scheduler = new RuntimeWorkGraphScheduler({
    graphs: runtime.runtimeWorkGraphs,
    runtimeToolKernel: runtime.runtimeToolKernel,
    requireSchedulerToolKernel: true,
    requireGenericStagedSchedulerProtocol: true,
    requireMissionLedgerForExecutionWorkflow: true,
    requireCostAwareCapabilityPolicy: true,
    requireEvidenceClaimsForMissionLedger: true,
    roleCoverageProfile: plugin.schedulerOptions.roleCoverageProfile,
    entryNodePolicy: plugin.schedulerOptions.entryNodePolicy ?? null,
    capabilityRegistrySummary: plugin.schedulerOptions.capabilityRegistrySummary,
    capabilityManifest: plugin.schedulerOptions.capabilityManifest,
    orchestrator,    domainResourceSelectionSelector,
    executors,
    missionLedger,
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
          implementationContextPacketRef: null,
          nodeExecutionPacketRef:
            typeof metadata.nodeExecutionPacketRef === "string"
              ? metadata.nodeExecutionPacketRef
              : null,
          nodeReadinessStateRef:
            typeof metadata.nodeReadinessStateRef === "string"
              ? metadata.nodeReadinessStateRef
              : null,
          nodeReadinessStatus:
            typeof metadata.nodeReadinessStatus === "string"
              ? metadata.nodeReadinessStatus
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
            "boundary_replay_terminal_frontier_selected_without_worker_execution",
            "boundary_replay_stopped_before_worker_execution_without_preworker_materialization",
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
      if (
        boundary === "after-resource-handoff" &&
        progress.stage === "scheduler_tool" &&
        progress.status === "completed" &&
        progress.schedulerToolId === "scheduler.select_next_node" &&
        typeof progress.nodeId === "string" &&
        progress.nodeId.trim()
      ) {
        selectedBoundaryNode = {
          nodeId: progress.nodeId,
          roleId: progress.roleId ?? null,
          objective: progress.currentObjective ?? null,
          reasonCodes: (progress.reasonCodes ?? []).slice(0, 12),
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
        };
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
    replayGraphCreated: false,
    maxIterations,
    executeWorkers,
    contextToolLoopRef: contextToolLoop?.uri ?? null,
    resourceHandoffRef: resourceHandoff?.uri ?? null,
    resourceFulfillmentSummary,
    contextStatus,
    contextVerifiedCount,
    packetCount: packets.length,
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
          nodeKindRequiresImplementationContext(node.nodeKind) &&
          typeof metadata.sourceSplitFromNodeId !== "string" &&
          typeof metadata.nodeExecutionPacketRef !== "string" &&
          typeof metadata.implementationTaskPacketRef !== "string"
        );
      })
      .slice(0, maxParallelNodeExecutions);
    const materializationResults = [];
    for (const node of plannedImplementationFrontier) {
      const metadata = jsonRecord(node.metadata);
      selectedBoundaryNodes.push({
        nodeId: node.nodeId,
        nodeKind: node.nodeKind,
        assignedRole: node.assignedRole ?? null,
        capabilityId: typeof metadata.capabilityId === "string" ? metadata.capabilityId : null,
        implementationContextPacketRef: null,
        nodeExecutionPacketRef: null,
        nodeReadinessStateRef: null,
        nodeReadinessStatus: null,
        targetFileRefs: metadataStringArray(metadata, "targetRefs").slice(0, 20),
      });
    }
    selectedBoundaryNode = selectedBoundaryNodes[0] ?? null;
    const readyNodeExecutionPacketCount = 0;
    const existingReadyNodeExecutionPacketCount = 0;
    const existingReadyBlockedNodeCount = 0;
    const blockedSourceNodeCount = materializationResults.filter(
      (result) => result.readyNodeExecutionPacketCount === 0,
    ).length;
    const preciseBlockedSourceNodeCount = materializationResults.filter(
      (result) =>
        result.readyNodeExecutionPacketCount === 0 &&
        typeof result.blockerSummary === "string" &&
        result.blockerSummary.trim().length > 0 &&
        Array.isArray(result.reasonCodes) &&
        result.reasonCodes.length > 0,
    ).length;
    const schedulerResult = {
      status:
        selectedBoundaryNodes.length > 0 ? "waiting_for_human" : "needs_review",
      iterations: 0,
      addedNodeIds: selectedBoundaryNodes.map((node) => node.nodeId),
      executedNodeIds: [],
      selectedNodeId: selectedBoundaryNode?.nodeId ?? null,
      reasonCodes: [
        "boundary_replay_after_graph_selection_worker_frontier_selected_without_materialization",
        `boundary_replay_planned_implementation_frontier_count:${plannedImplementationFrontier.length}`,
        "preworker_fixed_resource_phase_removed",
        "worker_owned_context_search_read_lifecycle_required",
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
        readyNodeExecutionPacketCount,
        existingReadyNodeExecutionPacketCount,
        existingReadyBlockedNodeCount,
        blockedSourceNodeCount,
        preciseBlockedSourceNodeCount,
        payloadRefs: selectedBoundaryNodes
          .flatMap((node) => [node.nodeExecutionPacketRef, node.resourcePacketRef])
          .filter(Boolean)
          .slice(0, 80),
        blockers: [],
        nextLegalTransition: selectedBoundaryNodes.length > 0 ? "run_worker" : "needs_review",
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
      replayGraphCreated: false,
      boundary,
      maxParallelNodeExecutions,
      executeWorkers: false,
      schedulerResult,
      selectedBoundaryNode,
      selectedBoundaryNodes,
      materializationResults,
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
        .flatMap((item) => [
          item?.nodeExecutionPacketRef,
          item?.resourcePacketRef,
          item?.nodeReadinessStateRef,
        ])
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
        materializationResultCount: materializationResults.length,
        readyNodeExecutionPacketCount,
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
    schedulerResult.reasonCodes.some((code) => String(code).startsWith("boundary_replay_"))
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
    replayGraphCreated: false,
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
  if (schedulerResult.status === "failed") {
    process.exitCode = 1;
  }
}

main().catch(async (error) => {
  const summary = {
    artifactKind: "product_spec_boundary_replay_error",
    proofSourceKind: PRODUCT_SPEC_RUNTIME_BOUNDARY_REPLAY_PROOF_SOURCE,
    generatedAt: new Date().toISOString(),
    errorName: error?.name ?? "unknown_error",
    errorMessageHash: sha256(error?.message ?? String(error)),
    errorSummary: String(error?.message ?? error).slice(0, 500),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
  await writeJson("product-spec-boundary-replay-error.json", summary);
  process.stderr.write(`${JSON.stringify(summary)}\n`);
  process.exitCode = 1;
}).finally(async () => {
  if (replayRuntimeShutdown) {
    await replayRuntimeShutdown();
  }
});
