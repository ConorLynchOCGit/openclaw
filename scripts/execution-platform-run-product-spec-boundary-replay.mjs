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
  buildImplementationTaskPacket,
  buildAgentTeamCodingWorkflowPlugin,
  CodexDynamicJsonClient,
  CONTEXT_SYNTHESIS_ARTIFACT_TYPE,
  DEFAULT_DYNAMIC_ORCHESTRATOR_MODEL_REF,
  DEFAULT_DYNAMIC_ORCHESTRATOR_PROVIDER_PATH,
  CodingResourcePacketSchema,
  ImplementationTaskPacketSchema,
  ModelAgnosticFileEditWorkerAdapter,
  NonCodexToolUsingWorkerLoop,
  NodeExecutionPacketSchema,
  NodeReadinessStateSchema,
  OpenRouterAgentTeamModelClient,
  BoundaryReplayService,
  BOUNDARY_REPLAY_CHECKPOINT_KINDS,
  boundaryReplayBoundaryIsDiagnosticOnly,
  boundaryReplayCheckpointKindForCliAlias,
  buildContextSynthesisInputManifest,
  buildMissingNodeExecutionPacketReadinessState,
  compileImplementationContextSnapshotPacket,
  compileNodeExecutionPacketForImplementationTask,
  contextSynthesisGroupGuidanceArray,
  evaluateNodeExecutionPacketReadiness,
  normalizeContextSynthesisArtifact,
  requireCanonicalWorkflowDefinition,
  RuntimeWorkGraphScheduler,
  runtimeNodeCapabilityManifestForModel,
  summarizeImplementationContextPacketForReadback,
  summarizeNodeExecutionPacketForReadback,
  summarizeContextSynthesisForGraphCompile,
  summarizeContextSynthesisInputManifestForArtifact,
  summarizeContextSynthesisArtifact,
  validateContextSynthesisArtifact,
} = await tsImport(
  path.join(root, "extensions/execution-platform/runtime-api.ts"),
  import.meta.url,
);
const { validateImplementationTaskPacketForWorker } = await tsImport(
  path.join(root, "extensions/execution-platform/src/workflows/mission-work-packets.ts"),
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
const RESOURCE_MATERIALIZATION_PROOF_DIR = path.join(
  ARTIFACT_DIR,
  "product-spec-replay-proof-resource-materialization",
);
const execFileAsync = promisify(execFile);

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
  const body = `${JSON.stringify(value, null, 2)}\n`;
  await fs.writeFile(target, body, "utf8");
  return {
    path: target,
    sha256: sha256(body),
    bytes: Buffer.byteLength(body, "utf8"),
  };
}

async function writeProofJson(name, value) {
  await fs.mkdir(RESOURCE_MATERIALIZATION_PROOF_DIR, { recursive: true });
  const target = path.join(RESOURCE_MATERIALIZATION_PROOF_DIR, name);
  const body = `${JSON.stringify(value, null, 2)}\n`;
  await fs.writeFile(target, body, "utf8");
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
  return await service.recordRuntimeCheckpoint({
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

function legacyDiagnosticBoundaryAllowed() {
  return (
    boolFlag("--allow-legacy-diagnostic-boundary", false) ||
    boolFlag("--allow-legacy-context-synthesis-boundary", false) ||
    process.env.OPENCLAW_ALLOW_LEGACY_CONTEXT_SYNTHESIS_REPLAY === "1"
  );
}

function boundaryStopsBeforeWorkerExecution(boundary, node, { executeWorkers = false } = {}) {
  if (
    executeWorkers &&
    (boundary === "after-graph-selection" ||
      boundary === "after-resource-materialization" ||
      boundary === "after-split-required-materialization")
  ) {
    return false;
  }
  if (
    boundary === "before-resource-materialization" ||
    boundary === "after-resource-materialization" ||
    boundary === "before-split-required-materialization" ||
    boundary === "after-split-required-materialization"
  ) {
    return true;
  }
  if (boundary === "after-context") {
    return true;
  }
  if (
    boundary === "after-parallel-context" ||
    boundary === "after-context-synthesis" ||
    boundary === "after-graph-selection"
  ) {
    return node.nodeKind !== "context_synthesis";
  }
  return false;
}

function boundarySelectedReasonCode(boundary) {
  if (boundary === "after-parallel-context") {
    return "boundary_replay_scheduler_first_context_frontier_selected";
  }
  if (boundary === "after-context-synthesis") {
    return "boundary_replay_legacy_context_synthesis_graph_frontier_selected";
  }
  if (boundary === "after-graph-selection") {
    return "boundary_replay_accepted_graph_frontier_selected";
  }
  if (boundary === "before-resource-materialization") {
    return "boundary_replay_before_resource_materialization_frontier_selected";
  }
  if (boundary === "after-resource-materialization") {
    return "boundary_replay_after_resource_materialization_frontier_selected";
  }
  if (boundary === "before-split-required-materialization") {
    return "boundary_replay_before_split_required_materialization_frontier_selected";
  }
  if (boundary === "after-split-required-materialization") {
    return "boundary_replay_after_split_required_materialization_frontier_selected";
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

function hasAcceptedNodeScopedContextSupply(snapshot) {
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
        ["context_scout", "web_research"].includes(source.nodeKind) &&
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

function parallelContextSupplySummary(metadata) {
  const commitmentResults = Array.isArray(metadata.commitmentResults)
    ? metadata.commitmentResults
    : [];
  return {
    aggregateContextSupplyRef:
      typeof metadata.aggregateContextSupplyRef === "string"
        ? metadata.aggregateContextSupplyRef
        : null,
    status: typeof metadata.status === "string" ? metadata.status : "unknown",
    packetCount: typeof metadata.packetCount === "number" ? metadata.packetCount : 0,
    acceptedCount: typeof metadata.acceptedCount === "number" ? metadata.acceptedCount : 0,
    needsReviewCount: typeof metadata.needsReviewCount === "number" ? metadata.needsReviewCount : 0,
    failedCount: typeof metadata.failedCount === "number" ? metadata.failedCount : 0,
    commitmentResults: commitmentResults.slice(0, 40).map((result) => ({
      commitmentId: result?.commitmentId ?? null,
      nodeId: result?.nodeId ?? null,
      status: result?.status ?? "unknown",
      packetRef: result?.packetRef ?? null,
      contextHandoffPacketRef: result?.contextHandoffPacketRef ?? null,
      contextScoutToolLoopRef: result?.contextScoutToolLoopRef ?? null,
      verifiedFileRefs: Array.isArray(result?.verifiedFileRefs)
        ? result.verifiedFileRefs.slice(0, 12)
        : [],
      recommendedEditPoints: Array.isArray(result?.recommendedEditPoints)
        ? result.recommendedEditPoints.slice(0, 24)
        : [],
      limitations: Array.isArray(result?.limitations) ? result.limitations.slice(0, 12) : [],
      handoffSummaryForImplementation:
        typeof result?.handoffSummaryForImplementation === "string"
          ? result.handoffSummaryForImplementation.slice(0, 1_200)
          : null,
      implementationBlocked: result?.implementationBlocked === true,
      reasonCodes: Array.isArray(result?.reasonCodes) ? result.reasonCodes.slice(0, 12) : [],
    })),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

function packetCommitmentId(packet) {
  return typeof packet?.commitmentId === "string" && packet.commitmentId.trim()
    ? packet.commitmentId.trim()
    : null;
}

function contextSupplyRequiredCommitmentIds(snapshot, packets) {
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
    ? snapshot.nodes.filter((node) => ["context_scout", "web_research"].includes(node.nodeKind))
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

function contextSupplySummaryFromContextHandoffArtifacts(artifacts, packets, snapshot = null) {
  const requiredCommitmentIds = contextSupplyRequiredCommitmentIds(snapshot, packets);
  const requiredCommitmentIdSet = new Set(requiredCommitmentIds);
  const requiredPackets = packets.filter((packet) => {
    const commitmentId = packetCommitmentId(packet);
    return commitmentId ? requiredCommitmentIdSet.has(commitmentId) : false;
  });
  const skippedCommitmentIds = packets
    .map(packetCommitmentId)
    .filter((commitmentId) => commitmentId && !requiredCommitmentIdSet.has(commitmentId));
  const handoffArtifacts = artifacts
    .filter((artifact) => artifact.artifactType === "execution_platform.context_handoff_packet")
    .toSorted((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
  const toolLoopArtifacts = artifacts
    .filter((artifact) => artifact.artifactType === "execution_platform.context_scout_tool_loop")
    .toSorted((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
  const handoffForPacket = (packet) => {
    const commitmentId = typeof packet.commitmentId === "string" ? packet.commitmentId : "";
    const packetRef = typeof packet.packetRef === "string" ? packet.packetRef : "";
    return (
      handoffArtifacts.find((artifact) => {
        const metadata = metadataOf(artifact);
        const targetCommitmentIds = stringArray(metadata.targetCommitmentIds);
        const packetRefs = stringArray(metadata.commitmentWorkPacketRefs);
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
            metadata.contextHandoffPacketRef === handoffRef ||
            stringArray(metadata.artifactRefs).includes(handoffRef) ||
            stringArray(metadata.outputArtifactRefs).includes(handoffRef)
          );
        }) ?? null)
      : null;
  const handoffResult = (handoff, index) => {
    const handoffArtifactMetadata = metadataOf(handoff);
    const handoffMetadata = {
      ...handoffArtifactMetadata,
      ...jsonRecord(handoffArtifactMetadata.extension),
    };
    const handoffRef = typeof handoff?.uri === "string" ? handoff.uri : null;
    const toolLoop = toolLoopForHandoff(handoffRef);
    const toolLoopMetadata = metadataOf(toolLoop);
    const relevantFileRefs = stringArray(
      handoffMetadata.relevantFileRefs ?? toolLoopMetadata.verifiedFileRefs,
    );
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
              : (handoffRef?.match(/\/context-handoff\/([^:]+)/u)?.[1] ??
                `handoff-artifact-context-${index + 1}`),
      status:
        handoffMetadata.readinessStatus === "accepted_with_limitations"
          ? "accepted_with_limitations"
          : handoffRef
            ? "accepted"
            : "missing",
      packetRef: null,
      contextHandoffPacketRef: handoffRef,
      contextScoutToolLoopRef: typeof toolLoop?.uri === "string" ? toolLoop.uri : null,
      verifiedFileRefs: relevantFileRefs.slice(0, 12),
      recommendedEditPoints,
      limitations: stringArray(handoffMetadata.limitations ?? toolLoopMetadata.limitations, []),
      handoffSummaryForImplementation:
        typeof handoffMetadata.handoffSummaryForImplementation === "string"
          ? handoffMetadata.handoffSummaryForImplementation.slice(0, 1_200)
          : null,
      implementationBlocked: !handoffRef,
      reasonCodes: handoffRef
        ? ["context_supply_reconstructed_from_context_handoff_artifact"]
        : ["context_supply_handoff_artifact_missing"],
    };
  };
  const handoffResults = handoffArtifacts
    .map((handoff, index) => handoffResult(handoff, index))
    .filter((result) => result.contextHandoffPacketRef);
  const commitmentResults = requiredPackets.slice(0, 80).map((packet, index) => {
    const handoff = handoffForPacket(packet);
    const reconstructed = handoff ? handoffResult(handoff, index) : null;
    const status = reconstructed?.status ?? "missing";
    return {
      commitmentId: packet.commitmentId ?? null,
      nodeId: reconstructed?.nodeId ?? `handoff-artifact-context-${index + 1}`,
      status,
      packetRef: packet.packetRef ?? null,
      contextHandoffPacketRef: reconstructed?.contextHandoffPacketRef ?? null,
      contextScoutToolLoopRef: reconstructed?.contextScoutToolLoopRef ?? null,
      verifiedFileRefs: reconstructed?.verifiedFileRefs ?? [],
      recommendedEditPoints: reconstructed?.recommendedEditPoints ?? [],
      limitations: reconstructed?.limitations ?? [],
      handoffSummaryForImplementation: reconstructed?.handoffSummaryForImplementation ?? null,
      implementationBlocked: !reconstructed?.contextHandoffPacketRef,
      reasonCodes: reconstructed?.contextHandoffPacketRef
        ? ["context_supply_reconstructed_from_context_handoff_artifact"]
        : ["context_supply_handoff_artifact_missing"],
    };
  });
  const acceptedCount = commitmentResults.filter((result) => result.status === "accepted").length;
  const failedCount = commitmentResults.length - acceptedCount;
  return {
    aggregateContextSupplyRef: null,
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
    coverageMode: "context_frontier_scoped",
    requiredCommitmentIds: requiredCommitmentIds.slice(0, 80),
    skippedCommitmentIds: skippedCommitmentIds.slice(0, 80),
    reconstructedFromContextHandoffArtifacts: true,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

function acceptedContextSupplyResults(contextSupplySummary) {
  return [
    ...(Array.isArray(contextSupplySummary?.commitmentResults)
      ? contextSupplySummary.commitmentResults
      : []),
    ...(Array.isArray(contextSupplySummary?.handoffResults)
      ? contextSupplySummary.handoffResults
      : []),
  ].filter(
    (result) =>
      result &&
      result.status === "accepted" &&
      typeof result.contextHandoffPacketRef === "string" &&
      result.contextHandoffPacketRef.trim().length > 0,
  );
}

function contextSupplyResultMatchesContextNode(node, result) {
  const metadata = jsonRecord(node.metadata);
  const targetCommitmentIds = metadataStringArray(metadata, "commitmentIdsAdvanced");
  const nodeId = typeof node.nodeId === "string" ? node.nodeId : "";
  const resultNodeId = typeof result?.nodeId === "string" ? result.nodeId : "";
  const handoffRef =
    typeof result?.contextHandoffPacketRef === "string" ? result.contextHandoffPacketRef : "";
  const packetRef = typeof result?.packetRef === "string" ? result.packetRef : "";
  const commitmentId = typeof result?.commitmentId === "string" ? result.commitmentId : "";
  return (
    (nodeId && resultNodeId === nodeId) ||
    (nodeId && handoffRef.includes(nodeId)) ||
    (packetRef &&
      Array.isArray(node.inputHandoffRefs) &&
      node.inputHandoffRefs.includes(packetRef)) ||
    (commitmentId && targetCommitmentIds.includes(commitmentId))
  );
}

async function reconcileAcceptedContextFrontierNodes({
  runtime,
  graphId,
  snapshot,
  contextSupplySummary,
}) {
  const acceptedResults = acceptedContextSupplyResults(contextSupplySummary);
  const reconciled = [];
  if (acceptedResults.length === 0) {
    return reconciled;
  }
  for (const node of snapshot.nodes) {
    if (!["context_scout", "web_research"].includes(node.nodeKind)) {
      continue;
    }
    if (node.nodeStatus === "succeeded") {
      continue;
    }
    const matchingResults = acceptedResults.filter((result) =>
      contextSupplyResultMatchesContextNode(node, result),
    );
    if (matchingResults.length === 0) {
      continue;
    }
    const outputArtifactRefs = [
      ...new Set(
        matchingResults
          .flatMap((result) => [result.contextHandoffPacketRef, result.contextScoutToolLoopRef])
          .filter((ref) => typeof ref === "string" && ref.trim()),
      ),
    ].slice(0, 24);
    await runtime.runtimeWorkGraphs.updateNodeStatus({
      nodeId: node.nodeId,
      nodeStatus: "succeeded",
      outputArtifactRefs,
      metadataPatch: {
        lastResultStatus: "succeeded",
        lastStatusReasonCodes: [
          "boundary_replay_context_frontier_reconciled_from_accepted_handoff",
          `boundary_replay_context_handoff_count:${outputArtifactRefs.length}`,
        ],
        boundaryReplayContextReconciledAt: new Date().toISOString(),
        boundaryReplayContextReconciledGraphId: graphId,
        boundaryReplayContextHandoffRefs: outputArtifactRefs,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      },
    });
    reconciled.push({
      nodeId: node.nodeId,
      nodeKind: node.nodeKind,
      outputArtifactRefs,
      matchedContextSupplyCount: matchingResults.length,
    });
  }
  return reconciled;
}

function compactBoundaryReplayResultMetadata(summary, resultArtifact) {
  return {
    artifactKind: "product_spec_boundary_replay_result_ref",
    generatedAt: summary.generatedAt,
    status: summary.status,
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

function acceptedParallelContextSupply(metadata, packetCount) {
  return (
    metadata.status === "succeeded" &&
    metadata.packetCount === packetCount &&
    metadata.acceptedCount === packetCount &&
    metadata.needsReviewCount === 0 &&
    metadata.failedCount === 0
  );
}

function safeIdPart(value, fallback = "item") {
  const text = String(value ?? fallback)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 42);
  return text || fallback;
}

async function createReplayGraphFromParallelContext({
  runtime,
  sourceGraphId,
  sourceSnapshot,
  runtimeJobId,
  workflowId,
  parallelContextSupply,
  packetCount,
}) {
  const replayGraphId = `product-spec-replay-${sha256(
    `${runtimeJobId}:${sourceGraphId}:${Date.now()}`,
  ).slice(0, 16)}`;
  await runtime.runtimeWorkGraphs.createGraph({
    graphId: replayGraphId,
    parentWorkItemId: sourceSnapshot.graph.parentWorkItemId,
    rootRuntimeJobId: runtimeJobId,
    workflowId,
    orchestratorModelRef: DEFAULT_DYNAMIC_ORCHESTRATOR_MODEL_REF,
    graphStatus: "running",
    metadata: {
      artifactKind: "product_spec_boundary_replay_graph",
      sourceGraphId,
      sourceNodeCount: sourceSnapshot.nodes.length,
      sourceEdgeCount: sourceSnapshot.edges.length,
      packetCount,
      replayBoundary: "after-parallel-context",
      replayGraphTopology: "scheduler_first_accepted_context_supply",
      contextSynthesisDefaultDisabled: true,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    },
  });
  const contextNodes = [];
  for (const [index, result] of parallelContextSupply.commitmentResults.entries()) {
    if (result.status !== "accepted" && result.status !== "succeeded") {
      continue;
    }
    const commitmentId = safeIdPart(result.commitmentId, `commitment-${index + 1}`);
    const nodeId = `replay-${replayGraphId.slice(-8)}-context-${index + 1}-${commitmentId}`.slice(
      0,
      96,
    );
    const outputRefs = [
      result.contextHandoffPacketRef,
      result.contextScoutToolLoopRef,
      ...(Array.isArray(result.verifiedFileRefs) ? result.verifiedFileRefs : []),
    ]
      .filter((ref) => typeof ref === "string" && ref.trim())
      .slice(0, 20);
    const contextNode = await runtime.runtimeWorkGraphs.addNode({
      graphId: replayGraphId,
      nodeId,
      nodeKind: "context_scout",
      assignedRole: "context_scout",
      modelOrWorkerRef: "boundary-replay/context-scout",
      inputHandoffRefs:
        typeof result.packetRef === "string" && result.packetRef.trim() ? [result.packetRef] : [],
      nodeStatus: "succeeded",
      outputArtifactRefs: outputRefs.length > 0 ? outputRefs : [result.packetRef].filter(Boolean),
      metadata: {
        artifactKind: "product_spec_boundary_replay_context_node",
        sourceNodeId: result.nodeId ?? null,
        packetRef: result.packetRef ?? null,
        contextHandoffPacketRef: result.contextHandoffPacketRef ?? null,
        contextScoutToolLoopRef: result.contextScoutToolLoopRef ?? null,
        verifiedFileRefs: Array.isArray(result.verifiedFileRefs)
          ? result.verifiedFileRefs.slice(0, 20)
          : [],
        commitmentIdsAdvanced: result.commitmentId ? [result.commitmentId] : [],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      },
    });
    contextNodes.push(contextNode);
  }
  return replayGraphId;
}

function metadataStringArray(metadata, key, fallback = []) {
  const value = metadata?.[key];
  return stringArray(value, fallback);
}

function contextSupplyResultsForNode(node, contextSupplySummary) {
  const metadata = jsonRecord(node.metadata);
  const targetCommitmentIds = metadataStringArray(metadata, "commitmentIdsAdvanced");
  const symbolicWorkUnitIds = node.inputHandoffRefs
    .filter((ref) => typeof ref === "string" && ref.endsWith(".accepted_context_handoff"))
    .map((ref) => ref.replace(/\.accepted_context_handoff$/u, ""));
  const allResults = [
    ...(contextSupplySummary.commitmentResults ?? []),
    ...(contextSupplySummary.handoffResults ?? []),
  ];
  const symbolicMatches = allResults.filter((result) => {
    const contextHandoffPacketRef =
      typeof result?.contextHandoffPacketRef === "string" ? result.contextHandoffPacketRef : "";
    const resultNodeId = typeof result?.nodeId === "string" ? result.nodeId : "";
    return (
      contextHandoffPacketRef &&
      symbolicWorkUnitIds.some((workUnitId) => resultNodeId.includes(workUnitId))
    );
  });
  if (symbolicMatches.length > 0) {
    return symbolicMatches;
  }
  return allResults.filter((result) => {
    const commitmentId = typeof result?.commitmentId === "string" ? result.commitmentId : "";
    const contextHandoffPacketRef =
      typeof result?.contextHandoffPacketRef === "string" ? result.contextHandoffPacketRef : "";
    const resultNodeId = typeof result?.nodeId === "string" ? result.nodeId : "";
    const packetRef = typeof result?.packetRef === "string" ? result.packetRef : "";
    return (
      (commitmentId && targetCommitmentIds.includes(commitmentId)) ||
      (contextHandoffPacketRef && node.inputHandoffRefs.includes(contextHandoffPacketRef)) ||
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

function repoRefWithinSeed(fileRef, seedRef) {
  const normalizedSeed = seedRef.endsWith("/") ? seedRef : `${seedRef}/`;
  return fileRef === seedRef || fileRef.startsWith(normalizedSeed);
}

function replayVerifiedContextFileRefsForNode(node, contextSupplySummary) {
  const refs = [];
  for (const result of contextSupplyResultsForNode(node, contextSupplySummary)) {
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
  const concreteIntentRefs = [
    ...new Set(
      fileChangeIntents
        .map((intent) => normalizedRepoFileRef(intent?.fileRef, repoRoot))
        .filter((ref) => typeof ref === "string" && ref.trim()),
    ),
  ];
  const metadataHasBroadSeeds =
    normalizedMetadataTargetRefs.length === 0 ||
    normalizedMetadataTargetRefs.length > 8 ||
    normalizedMetadataTargetRefs.some(repoRefLooksLikeDirectorySeed);
  const concreteIntentRefsWithinMetadata =
    normalizedMetadataTargetRefs.length === 0
      ? concreteIntentRefs
      : concreteIntentRefs.filter((ref) =>
          normalizedMetadataTargetRefs.some((seed) => repoRefWithinSeed(ref, seed)),
        );
  if (metadataHasBroadSeeds && concreteIntentRefsWithinMetadata.length > 0) {
    return concreteIntentRefsWithinMetadata.slice(0, 40);
  }
  if (normalizedMetadataTargetRefs.length > 0) {
    return normalizedMetadataTargetRefs.slice(0, 80);
  }
  return [
    ...new Set(
      verifiedContextFileRefs
        .map((ref) => normalizedRepoFileRef(ref, repoRoot))
        .filter((ref) => typeof ref === "string" && ref.trim()),
    ),
  ].slice(0, 8);
}

function replayFileChangeIntentsForNode(node, contextSupplySummary) {
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
  for (const result of contextSupplyResultsForNode(node, contextSupplySummary)) {
    if (!Array.isArray(result?.recommendedEditPoints)) {
      continue;
    }
    for (const point of result.recommendedEditPoints) {
      const record = jsonRecord(point);
      let fileRef =
        typeof record.path === "string"
          ? record.path
          : typeof record.fileRef === "string"
            ? record.fileRef
            : "";
      let symbolOrRegion =
        typeof record.symbolOrRegion === "string"
          ? record.symbolOrRegion
          : "model_authored_edit_point";
      let reason =
        typeof record.reason === "string"
          ? record.reason
          : typeof record.intendedChange === "string"
            ? record.intendedChange
            : "";
      if (!fileRef && typeof point === "string") {
        const match = point.match(/^([^:\s]+(?:\/[^:\s]+)*):([^-]+?)(?:\s+-\s+(.+))?$/u);
        if (match) {
          fileRef = match[1] ?? "";
          symbolOrRegion = match[2]?.trim() || "model_authored_edit_point";
          reason = match[3]?.trim() || point;
        }
      }
      if (!fileRef.trim() || !reason.trim()) {
        continue;
      }
      intents.push({
        fileRef: fileRef.trim(),
        symbolOrRegion: symbolOrRegion.trim(),
        intendedChange: reason.trim(),
        whyThisFile: reason.trim(),
      });
    }
  }
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

function replayContextRefsForNode(node, contextSupplySummary) {
  const handoffRefs = new Set(node.inputHandoffRefs.filter((ref) => typeof ref === "string"));
  for (const result of contextSupplyResultsForNode(node, contextSupplySummary)) {
    for (const ref of [
      result.contextHandoffPacketRef,
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

function replayContextLimitationsForNode(node, contextSupplySummary) {
  const limitations = [];
  const diagnosticOnlyReasonCodes = new Set([
    "context_supply_reconstructed_from_context_handoff_artifact",
  ]);
  for (const result of contextSupplyResultsForNode(node, contextSupplySummary)) {
    const commitmentId = typeof result?.commitmentId === "string" ? result.commitmentId : "";
    const resultReasonCodes = Array.isArray(result?.reasonCodes) ? result.reasonCodes : [];
    const limitationReasonCodes = resultReasonCodes.filter(
      (code) => !diagnosticOnlyReasonCodes.has(code),
    );
    if (result.implementationBlocked === true) {
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
    "execution_platform.implementation_context_packet",
    "execution_platform.implementation_task_packet",
    "execution_platform.coding_resource_packet",
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

async function inspectAfterResourceMaterializationFrontier({
  runtime,
  artifacts,
  snapshot,
  runtimeJobId,
  graphId,
  workflowId,
  maxParallelNodeExecutions,
  targetNodeIds = new Set(),
}) {
  const frontier = snapshot.nodes
    .filter((node) => {
      const metadata = jsonRecord(node.metadata);
      return (
        (targetNodeIds.size === 0 || targetNodeIds.has(node.nodeId)) &&
        node.nodeStatus === "planned" &&
        nodeKindRequiresImplementationContext(node.nodeKind) &&
        typeof metadata.nodeExecutionPacketRef === "string" &&
        typeof metadata.resourcePacketRef === "string"
      );
    })
    .slice(0, maxParallelNodeExecutions);
  const inspections = [];
  for (const node of frontier) {
    const metadata = jsonRecord(node.metadata);
    const nodeExecutionPacketRef =
      typeof metadata.nodeExecutionPacketRef === "string" ? metadata.nodeExecutionPacketRef : "";
    const resourcePacketRef =
      typeof metadata.resourcePacketRef === "string" ? metadata.resourcePacketRef : "";
    const implementationContextPacketRef =
      typeof metadata.implementationContextPacketRef === "string"
        ? metadata.implementationContextPacketRef
        : "";
    const nodePacketPayload = await hydrateReplayPayloadArtifact(
      runtime,
      artifacts,
      nodeExecutionPacketRef,
      "execution_platform.node_execution_packet",
    );
    const resourcePayload = await hydrateReplayPayloadArtifact(
      runtime,
      artifacts,
      resourcePacketRef,
      "execution_platform.coding_resource_packet",
    );
    const implementationContextPayload = implementationContextPacketRef
      ? await hydrateReplayPayloadArtifact(
          runtime,
          artifacts,
          implementationContextPacketRef,
          "execution_platform.implementation_context_packet",
        )
      : null;
    const nodePacket = NodeExecutionPacketSchema.safeParse(nodePacketPayload.body);
    const resourcePacket = CodingResourcePacketSchema.safeParse(resourcePayload.body);
    const implementationTaskPacketPayload = resourcePacket.success
      ? await hydrateReplayPayloadArtifact(
          runtime,
          artifacts,
          resourcePacket.data.implementationTaskPacketRef,
          "execution_platform.implementation_task_packet",
        )
      : null;
    const implementationTaskPacket = ImplementationTaskPacketSchema.safeParse(
      implementationTaskPacketPayload?.body ?? null,
    );
    const implementationTaskPacketValidation = implementationTaskPacket.success
      ? validateImplementationTaskPacketForWorker(implementationTaskPacket.data)
      : null;
    const readiness =
      nodePacket.success && resourcePacket.success
        ? evaluateNodeExecutionPacketReadiness({
            packet: nodePacket.data,
            resourcePacket: resourcePacket.data,
            implementationContextPacket: implementationContextPayload?.body ?? null,
          })
        : null;
    const readinessStateRef =
      typeof metadata.nodeReadinessStateRef === "string"
        ? metadata.nodeReadinessStateRef
        : (readiness?.state.stateRef ?? null);
    const readinessStatePayload = readinessStateRef
      ? await hydrateReplayPayloadArtifact(
          runtime,
          artifacts,
          readinessStateRef,
          "execution_platform.node_readiness_state",
        )
      : null;
    const readinessState = NodeReadinessStateSchema.safeParse(
      readinessStatePayload?.body ?? readiness?.state ?? null,
    );
    const effectiveReadinessStatus =
      readiness?.state.readinessStatus ??
      (readinessState.success ? readinessState.data.readinessStatus : null);
    const effectiveReadinessPhase =
      readiness?.state.phase ?? (readinessState.success ? readinessState.data.phase : null);
    const persistedReadinessStatus = readinessState.success
      ? readinessState.data.readinessStatus
      : null;
    const persistedReadinessPhase = readinessState.success ? readinessState.data.phase : null;
    const recomputedReadinessDiffersFromPersisted =
      readiness !== null &&
      readinessState.success &&
      (readiness.state.readinessStatus !== readinessState.data.readinessStatus ||
        readiness.state.phase !== readinessState.data.phase);
    const reasonCodes = [
      "after_resource_materialization_frontier_inspected",
      ...nodePacketPayload.reasonCodes.map((code) => `node_packet:${code}`),
      ...resourcePayload.reasonCodes.map((code) => `resource_packet:${code}`),
      ...(implementationTaskPacketPayload?.reasonCodes ?? []).map(
        (code) => `implementation_task_packet:${code}`,
      ),
      ...(readinessStatePayload?.reasonCodes ?? []).map((code) => `readiness_state:${code}`),
      ...(implementationContextPayload?.reasonCodes ?? []).map(
        (code) => `implementation_context:${code}`,
      ),
      ...(nodePacket.success ? [] : ["node_execution_packet_payload_invalid"]),
      ...(resourcePacket.success ? [] : ["coding_resource_packet_payload_invalid"]),
      ...(implementationTaskPacket.success ? [] : ["implementation_task_packet_payload_invalid"]),
      ...(implementationTaskPacketValidation?.reasonCodes ?? []).map(
        (code) => `implementation_task_packet_validation:${code}`,
      ),
      ...(implementationContextPacketRef && implementationContextPayload?.status !== "hydrated"
        ? ["implementation_context_packet_payload_missing"]
        : []),
      ...(readinessState.success ? [] : ["node_readiness_state_payload_invalid"]),
      ...(readiness?.reasonCodes ?? []),
      ...(recomputedReadinessDiffersFromPersisted
        ? ["node_readiness_state_recomputed_differs_from_persisted"]
        : []),
    ].slice(0, 80);
    const workerPacketBlockers = [
      ...(readiness?.blockingLimitations ?? []),
      ...(implementationTaskPacketValidation?.status === "ready"
        ? []
        : (implementationTaskPacketValidation?.reasonCodes ?? [
            "Implementation task packet payload is missing or invalid.",
          ])),
    ];
    const executionIntent =
      (nodePacket.success ? nodePacket.data.executionIntent : null) ??
      (implementationTaskPacket.success ? implementationTaskPacket.data.executionIntent : null) ??
      null;
    const evidenceMode =
      (nodePacket.success ? nodePacket.data.evidenceMode : null) ??
      (implementationTaskPacket.success ? implementationTaskPacket.data.evidenceMode : null) ??
      [];
    const editRequired =
      executionIntent === "source_edit" &&
      Array.isArray(evidenceMode) &&
      evidenceMode.includes("changed_file_evidence");
    inspections.push({
      nodeId: node.nodeId,
      nodeKind: node.nodeKind,
      executionIntent,
      evidenceMode,
      nodeExecutionPacketRef,
      resourcePacketRef,
      implementationContextPacketRef: implementationContextPacketRef || null,
      nodeReadinessStateRef: readinessStateRef,
      payloadRefs: [
        nodePacketPayload.payloadRef,
        resourcePayload.payloadRef,
        implementationTaskPacketPayload?.payloadRef,
        implementationContextPayload?.payloadRef,
        readinessStatePayload?.payloadRef,
      ].filter(Boolean),
      nodeExecutionPacketHydrated: nodePacket.success,
      resourcePacketHydrated: resourcePacket.success,
      implementationTaskPacketHydrated: implementationTaskPacket.success,
      implementationTaskPacketValidationStatus: implementationTaskPacketValidation?.status ?? null,
      implementationContextPacketHydrated:
        !implementationContextPacketRef || implementationContextPayload?.status === "hydrated",
      nodeReadinessStateHydrated: readinessState.success,
      nodeReadinessStatus: effectiveReadinessStatus,
      nodeReadinessPhase: effectiveReadinessPhase,
      persistedNodeReadinessStatus: persistedReadinessStatus,
      persistedNodeReadinessPhase: persistedReadinessPhase,
      recomputedReadinessDiffersFromPersisted,
      blockers:
        workerPacketBlockers.length > 0
          ? workerPacketBlockers
          : nodePacket.success && resourcePacket.success
            ? []
            : ["Payload-backed resource packets are incomplete."],
      executable:
        editRequired &&
        readiness?.valid === true &&
        implementationTaskPacketValidation?.status === "ready",
      reasonCodes,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawCommandLogStored: false,
      rawDbRowsStored: false,
      secretsStored: false,
    });
  }
  return {
    artifactKind: "product_spec_after_resource_materialization_frontier_inspection",
    schemaVersion: "execution-platform.after-resource-materialization-frontier.v1",
    runtimeJobId,
    graphId,
    workflowId,
    inspectedNodeCount: inspections.length,
    executableNodeCount: inspections.filter((inspection) => inspection.executable).length,
    blockedNodeCount: inspections.filter((inspection) => !inspection.executable).length,
    inspections,
    reasonCodes: [
      "after_resource_materialization_boundary_inspected",
      `after_resource_materialization_frontier_count:${frontier.length}`,
    ],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    secretsStored: false,
  };
}

async function materializeReplayImplementationResources({
  runtime,
  runtimeJobId,
  graphId,
  workflowId,
  node,
  objective,
  repoScopeRefs,
  validationCommandRefs,
  contextSupplySummary,
  boundary,
}) {
  if (!nodeKindRequiresImplementationContext(node.nodeKind)) {
    return null;
  }
  const metadata = jsonRecord(node.metadata);
  const targetCommitmentIds = metadataStringArray(metadata, "commitmentIdsAdvanced");
  const contextRefs = replayContextRefsForNode(node, contextSupplySummary);
  const contextLimitations = replayContextLimitationsForNode(node, contextSupplySummary);
  const fileChangeIntents = replayFileChangeIntentsForNode(node, contextSupplySummary);
  const targetRefs = resolveReplayImplementationMaterializationTargetRefs({
    metadataTargetRefs: replayNodeTargetRefs(node),
    verifiedContextFileRefs: replayVerifiedContextFileRefsForNode(node, contextSupplySummary),
    fileChangeIntents,
    repoRoot: process.cwd(),
  });
  const executionIntent = normalizeExecutionIntent(metadata.executionIntent) ?? "unspecified";
  const evidenceMode = normalizeEvidenceModes(
    metadata.evidenceMode ?? metadata.runtimeCompiledEvidenceMode,
  );
  const allowedFileRefs = repoFileRefs([...targetRefs, ...repoScopeRefs], 160);
  const exactObjective =
    typeof metadata.exactObjective === "string" && metadata.exactObjective.trim()
      ? metadata.exactObjective
      : typeof metadata.expectedOutput === "string" && metadata.expectedOutput.trim()
        ? metadata.expectedOutput
        : objective.slice(0, 1_200);
  const implementationContextCompile = await compileImplementationContextSnapshotPacket({
    runtimeJobId,
    workflowId,
    graphId,
    nodeId: node.nodeId,
    sourceWorkUnitId: typeof metadata.workUnitId === "string" ? metadata.workUnitId : node.nodeId,
    repoRoot: process.cwd(),
    repoRevision: null,
    worktreeFingerprint: null,
    executionIntent,
    evidenceMode,
    exactEditObjective: exactObjective,
    taskSummary: [
      typeof metadata.expectedOutput === "string" ? metadata.expectedOutput : "",
      typeof metadata.whyThisRoleIsNeededNow === "string"
        ? `Role rationale: ${metadata.whyThisRoleIsNeededNow}`
        : "",
      typeof metadata.workerFitRationale === "string"
        ? `Worker fit: ${metadata.workerFitRationale}`
        : "",
      `Input handoff refs: ${node.inputHandoffRefs.join(", ")}`,
    ]
      .filter(Boolean)
      .join("\n"),
    targetCommitmentIds,
    targetRefs,
    allowedFileRefs,
    deniedFileRefs: metadataStringArray(metadata, "deniedFileRefs"),
    contextPacketRefs: contextRefs,
    fileChangeIntents,
    sourceCommitmentPacketRefs: node.inputHandoffRefs
      .filter((ref) => ref.includes("commitment-work-packet"))
      .slice(0, 40),
    sourceContextHandoffRefs: contextRefs.filter((ref) => ref.includes("context")),
    sourcePromptExcerptRefs: metadataStringArray(metadata, "sourcePromptExcerptRefs"),
    contextSynthesisRefs: node.inputHandoffRefs
      .filter((ref) => ref.includes("context-synthesis"))
      .slice(0, 24),
    priorNodeOutputRefs: node.inputHandoffRefs.slice(0, 40),
    validationCommandRefs: metadataStringArray(
      metadata,
      "validationCommandRefs",
      validationCommandRefs,
    ),
    validationDiscoveryPlan: metadataStringArray(metadata, "validationDiscoveryPlan", [
      "Run focused tests or typecheck/build commands relevant to the edited files.",
    ]),
    acceptanceCriteria: metadataStringArray(metadata, "acceptanceCriteria", [
      "Changed-file refs and validation refs are recorded.",
    ]),
    evidenceClaimExpectations: metadataStringArray(metadata, "evidenceClaimExpectations", [
      "Changed-file refs and validation refs are recorded.",
    ]),
    expectedEvidenceClaimKinds: ["source_change", "test_validation"],
    expectedPatchShape:
      typeof metadata.expectedPatchShape === "string" ? metadata.expectedPatchShape : null,
    stopIfMissingOrEscalate: metadataStringArray(metadata, "stopIfMissingOrEscalate", [
      "Do not edit if target snapshots are missing, unreadable, stale, or outside scope.",
      "Request context repair with exact missing refs before worker invocation.",
    ]),
    existingApisAndTypes: metadataStringArray(metadata, "existingApisAndTypes"),
    knownTests: metadataStringArray(metadata, "knownTests"),
    relatedTestRefs: metadataStringArray(metadata, "relatedTestRefs"),
    dependencyNotes: metadataStringArray(metadata, "dependencyNotes"),
    riskAndBlastRadius: metadataStringArray(metadata, "riskAndBlastRadius"),
    capabilityFit:
      typeof metadata.capabilityFit === "string"
        ? metadata.capabilityFit
        : typeof metadata.utilityRationale === "string"
          ? metadata.utilityRationale
          : null,
    costAndEscalationPolicy:
      typeof metadata.costRationale === "string"
        ? metadata.costRationale
        : typeof metadata.utilityRationale === "string"
          ? metadata.utilityRationale
          : null,
    downstreamConsumer:
      typeof metadata.downstreamConsumer === "string" ? metadata.downstreamConsumer : null,
    whyThisWorkerWasSelected:
      typeof metadata.utilityRationale === "string" ? metadata.utilityRationale : null,
    expectedOutput: typeof metadata.expectedOutput === "string" ? metadata.expectedOutput : null,
    budgetPolicyRefs: ["runtime-task-budget://agent_team.coding/implementation_microtask/standard"],
    contextLimitations,
  });
  await attachReplayArtifact(
    runtime,
    runtimeJobId,
    "execution_platform.implementation_context_packet",
    implementationContextCompile.packet.packetRef,
    implementationContextCompile.packet,
  );
  for (const taskPacket of implementationContextCompile.implementationTaskPackets.slice(0, 24)) {
    await attachReplayArtifact(
      runtime,
      runtimeJobId,
      "execution_platform.implementation_task_packet",
      taskPacket.packetRef,
      taskPacket,
    );
  }
  const materializedPackets = [];
  for (const [
    index,
    taskPacket,
  ] of implementationContextCompile.implementationTaskPackets.entries()) {
    const materialized = compileNodeExecutionPacketForImplementationTask({
      runtimeJobId,
      workflowId,
      graphId,
      nodeId: `${node.nodeId}:task:${index + 1}`,
      nodeKind: node.nodeKind,
      capabilityId:
        typeof metadata.capabilityId === "string"
          ? metadata.capabilityId
          : "implementation_microtask",
      executorKey:
        typeof metadata.executorKey === "string" ? metadata.executorKey : "kind:implementation",
      workerRef:
        typeof metadata.workerRef === "string"
          ? metadata.workerRef
          : (node.modelOrWorkerRef ?? "openrouter://moonshotai/kimi-k2.6"),
      implementationTaskPacket: taskPacket,
    });
    await attachReplayArtifact(
      runtime,
      runtimeJobId,
      "execution_platform.coding_resource_packet",
      materialized.codingResourcePacket.packetRef,
      materialized.codingResourcePacket,
    );
    await attachReplayArtifact(
      runtime,
      runtimeJobId,
      "execution_platform.node_execution_packet",
      materialized.nodeExecutionPacket.packetRef,
      materialized.nodeExecutionPacket,
    );
    await attachReplayArtifact(
      runtime,
      runtimeJobId,
      "execution_platform.node_readiness_state",
      materialized.readiness.state.stateRef,
      {
        ...materialized.readiness.state,
        replayBoundary: boundary,
        updatedAt: new Date().toISOString(),
      },
    );
    materializedPackets.push({ taskPacket, materialized });
  }
  if (materializedPackets.length === 0) {
    const blockedState = buildMissingNodeExecutionPacketReadinessState({
      nodeId: node.nodeId,
      runtimeJobId,
      graphId,
      workflowId,
      reasonCodes: implementationContextCompile.reasonCodes,
      limitations: implementationContextCompile.packet.blockingLimitations,
    });
    await runtime.runtimeWorkGraphs.updateNodeStatus({
      nodeId: node.nodeId,
      nodeStatus: "needs_review",
      outputArtifactRefs: [implementationContextCompile.packet.packetRef],
      metadataPatch: {
        implementationContextPacketRef: implementationContextCompile.packet.packetRef,
        implementationContextReadinessStatus: implementationContextCompile.packet.readinessStatus,
        implementationContextReasonCodes: implementationContextCompile.reasonCodes,
        implementationContextRepairAction: implementationContextCompile.repairAction,
        implementationContextBlockerSummary: implementationContextCompile.blockerSummary,
        nodeReadinessStateRef: blockedState.stateRef,
        nodeReadinessPhase: blockedState.phase,
        nodeReadinessStatus: blockedState.readinessStatus,
        nodeReadinessRepairAction: blockedState.repairAction,
        nodeReadinessNextAllowedTransitions: blockedState.nextAllowedTransitions,
        ...jsonRecord(
          summarizeImplementationContextPacketForReadback(implementationContextCompile.packet),
        ),
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    });
    await attachReplayArtifact(
      runtime,
      runtimeJobId,
      "execution_platform.node_readiness_state",
      blockedState.stateRef,
      {
        ...blockedState,
        replayBoundary: boundary,
        updatedAt: new Date().toISOString(),
      },
    );
  }
  const single = null;
  if (single) {
    const implementationContextReadback = jsonRecord(
      summarizeImplementationContextPacketForReadback(implementationContextCompile.packet),
    );
    const nodeExecutionReadback = jsonRecord(
      summarizeNodeExecutionPacketForReadback(single.materialized.nodeExecutionPacket),
    );
    await runtime.runtimeWorkGraphs.updateNodeStatus({
      nodeId: node.nodeId,
      nodeStatus: node.nodeStatus,
      metadataPatch: {
        implementationContextPacketRef: implementationContextCompile.packet.packetRef,
        implementationTaskPacketRef: single.taskPacket.packetRef,
        nodeExecutionPacketRef: single.materialized.nodeExecutionPacket.packetRef,
        resourcePacketKind: single.materialized.nodeExecutionPacket.resourcePacketKind,
        resourcePacketRef: single.materialized.nodeExecutionPacket.resourcePacketRef,
        nodeReadinessStateRef: single.materialized.readiness.state.stateRef,
        nodeReadinessPhase: single.materialized.readiness.state.phase,
        nodeReadinessStatus: single.materialized.readiness.state.readinessStatus,
        nodeReadinessRepairAction: single.materialized.readiness.state.repairAction,
        nodeReadinessNextAllowedTransitions:
          single.materialized.readiness.state.nextAllowedTransitions,
        ...implementationContextReadback,
        ...nodeExecutionReadback,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    });
  } else if (materializedPackets.length > 0) {
    const snapshot = await runtime.runtimeWorkGraphs.readGraphSnapshot(graphId);
    const existingNodeIds = new Set(snapshot?.nodes.map((candidate) => candidate.nodeId) ?? []);
    for (const { taskPacket, materialized } of materializedPackets) {
      if (!existingNodeIds.has(materialized.nodeExecutionPacket.nodeId)) {
        await runtime.runtimeWorkGraphs.addNode({
          graphId,
          nodeId: materialized.nodeExecutionPacket.nodeId,
          nodeKind: node.nodeKind,
          assignedRole: node.assignedRole,
          modelOrWorkerRef: node.modelOrWorkerRef,
          runtimeJobId,
          inputHandoffRefs: [
            implementationContextCompile.packet.packetRef,
            taskPacket.packetRef,
            ...node.inputHandoffRefs,
          ].slice(0, 60),
          nodeStatus: "planned",
          metadata: {
            capabilityId:
              typeof metadata.capabilityId === "string"
                ? metadata.capabilityId
                : "implementation_microtask",
            executorKey:
              typeof metadata.executorKey === "string"
                ? metadata.executorKey
                : "kind:implementation",
            workerRef:
              typeof metadata.workerRef === "string"
                ? metadata.workerRef
                : (node.modelOrWorkerRef ?? "openrouter://moonshotai/kimi-k2.6"),
            exactObjective:
              typeof metadata.exactObjective === "string" ? metadata.exactObjective : null,
            expectedOutput:
              typeof metadata.expectedOutput === "string" ? metadata.expectedOutput : null,
            acceptanceCriteria: metadataStringArray(metadata, "acceptanceCriteria", [
              "Changed-file refs and validation refs are recorded.",
            ]),
            whyThisRoleIsNeededNow:
              typeof metadata.whyThisRoleIsNeededNow === "string"
                ? metadata.whyThisRoleIsNeededNow
                : null,
            targetRefs: taskPacket.targetFileRefs,
            commitmentIdsAdvanced: taskPacket.targetCommitmentIds,
            implementationContextPacketRef: implementationContextCompile.packet.packetRef,
            implementationTaskPacketRef: taskPacket.packetRef,
            nodeExecutionPacketRef: materialized.nodeExecutionPacket.packetRef,
            resourcePacketKind: materialized.nodeExecutionPacket.resourcePacketKind,
            resourcePacketRef: materialized.nodeExecutionPacket.resourcePacketRef,
            nodeReadinessStateRef: materialized.readiness.state.stateRef,
            nodeReadinessPhase: materialized.readiness.state.phase,
            nodeReadinessStatus: materialized.readiness.state.readinessStatus,
            nodeReadinessRepairAction: materialized.readiness.state.repairAction,
            nodeReadinessNextAllowedTransitions:
              materialized.readiness.state.nextAllowedTransitions,
            sourceSplitFromNodeId: node.nodeId,
            sourceImplementationContextPacketRef: implementationContextCompile.packet.packetRef,
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          },
        });
      }
      await runtime.runtimeWorkGraphs
        .addEdge({
          graphId,
          edgeId: `${node.nodeId}:materialized:${sha256(materialized.nodeExecutionPacket.nodeId).slice(0, 12)}`,
          fromNodeId: node.nodeId,
          toNodeId: materialized.nodeExecutionPacket.nodeId,
          edgeKind: "handoff",
          reasonCodes: ["boundary_replay_materialized_file_resolved_implementation_task"],
          artifactRefs: [
            implementationContextCompile.packet.packetRef,
            taskPacket.packetRef,
            materialized.nodeExecutionPacket.packetRef,
            materialized.codingResourcePacket.packetRef,
          ],
          metadata: {
            splitTaskPacketRef: taskPacket.packetRef,
            rawPromptStored: false,
            rawResponseStored: false,
            rawLogsStored: false,
          },
        })
        .catch((error) => {
          if (!String(error?.message ?? error).includes("duplicate")) {
            throw error;
          }
        });
    }
    await runtime.runtimeWorkGraphs.updateNodeStatus({
      nodeId: node.nodeId,
      nodeStatus: "succeeded",
      outputArtifactRefs: [
        implementationContextCompile.packet.packetRef,
        ...materializedPackets.map(
          ({ materialized }) => materialized.nodeExecutionPacket.packetRef,
        ),
      ].slice(0, 40),
      metadataPatch: {
        splitRequiredTransitionStatus: "split_materialized",
        splitRequiredParentLifecycle: "aggregate_non_runnable",
        splitRequiredChildNodeIds: materializedPackets.map(
          ({ materialized }) => materialized.nodeExecutionPacket.nodeId,
        ),
        splitRequiredChildCount: materializedPackets.length,
        implementationContextPacketRef: implementationContextCompile.packet.packetRef,
        implementationTaskPacketRefs: materializedPackets.map(
          ({ taskPacket }) => taskPacket.packetRef,
        ),
        materializedSplitNodeIds: materializedPackets.map(
          ({ materialized }) => materialized.nodeExecutionPacket.nodeId,
        ),
        commitmentClosureEligible: false,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    });
  }
  return {
    implementationContextCompile,
    materializedPackets,
    readyMaterializedPackets: materializedPackets.filter(
      ({ materialized }) => materialized.readiness.valid,
    ),
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
  objective,
  validationCommandRefs,
  contextSupplySummary,
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
        boundary === "after-resource-materialization" &&
        (!hydratedNodePacket.success ||
          !hydratedResourcePacket.success ||
          !hydratedTaskPacket.success)
      ) {
        const result = {
          status: "needs_review",
          outputArtifactRefs: [],
          reasonCodes: [
            "boundary_replay_worker_hydrated_execution_packet_required",
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
        ...contextSupplySummary.commitmentResults
          .filter((result) => node.inputHandoffRefs.includes(result.contextHandoffPacketRef))
          .flatMap((result) => [result.contextHandoffPacketRef, result.contextScoutToolLoopRef]),
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
      if (targetRefs.length === 0 || allowedRefs.length === 0) {
        const result = {
          status: "needs_review",
          outputArtifactRefs: [],
          reasonCodes: ["boundary_replay_worker_target_refs_missing"],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
          workQueueLifecycleMutated: false,
        };
        orchestrator.noteNodeResult(node.nodeId, result);
        return result;
      }
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
          capabilityId: metadata.capabilityId ?? null,
          targetRefs: targetRefs.slice(0, 12),
          contextRefCount: contextRefs.length,
          nodeExecutionPacketRef: hydratedNodePacket.success
            ? hydratedNodePacket.data.packetRef
            : null,
          resourcePacketRef: hydratedResourcePacket.success
            ? hydratedResourcePacket.data.packetRef
            : null,
          implementationTaskPacketRef: hydratedTaskPacket.success
            ? hydratedTaskPacket.data.packetRef
            : null,
          payloadRefs: [
            hydratedNodePacketPayload?.payloadRef,
            hydratedResourcePayload?.payloadRef,
            hydratedTaskPayload?.payloadRef,
          ].filter(Boolean),
          persistenceMode: persistWorkerEdits
            ? "apply_to_workspace"
            : "rollback_after_review_artifact",
        },
      });
      const exactObjective =
        typeof metadata.exactObjective === "string" && metadata.exactObjective.trim()
          ? metadata.exactObjective
          : typeof metadata.expectedOutput === "string" && metadata.expectedOutput.trim()
            ? metadata.expectedOutput
            : objective.slice(0, 1_200);
      const taskPacket = hydratedTaskPacket.success
        ? hydratedTaskPacket.data
        : buildImplementationTaskPacket({
            microtaskId: `${runtimeJobId}-${node.nodeId}`,
            microtaskTitle:
              typeof metadata.workUnitTitle === "string" ? metadata.workUnitTitle : node.nodeId,
            exactEditObjective: exactObjective,
            taskSummary: [
              typeof metadata.expectedOutput === "string" ? metadata.expectedOutput : "",
              typeof metadata.whyThisRoleIsNeededNow === "string"
                ? `Why this role now: ${metadata.whyThisRoleIsNeededNow}`
                : "",
              `Input handoff refs: ${node.inputHandoffRefs.join(", ")}`,
            ]
              .filter(Boolean)
              .join("\n")
              .slice(0, 2_500),
            whyThisWorkerWasSelected:
              typeof metadata.utilityRationale === "string"
                ? metadata.utilityRationale
                : "Boundary replay selected Kimi through the accepted scheduler graph frontier.",
            expectedOutput:
              typeof metadata.expectedOutput === "string"
                ? metadata.expectedOutput
                : "Changed-file refs, validation refs, and commitment-linked evidence claims.",
            targetCommitmentIds: stringArray(metadata.commitmentIdsAdvanced),
            targetFileRefs: targetRefs,
            allowedFileRefs: allowedRefs,
            contextPacketRefs: contextRefs,
            contextSynthesisRefs: [
              `runtime-work-graph://${node.graphId}/context-synthesis/product-spec-planning-native-workflow-implementation-synthesis`,
            ],
            validationCommandRefs,
            acceptanceCriteria: stringArray(metadata.acceptanceCriteria, [
              "Changed-file refs and validation refs are recorded.",
            ]),
            expectedEvidenceClaimKinds: ["source_change", "test_validation"],
            stopIfMissingOrEscalate: [
              "Request bounded context before editing if target snapshots or acceptance criteria are insufficient.",
              "Escalate to Codex only after bounded non-Codex repair fails or the task exceeds Kimi file/diff scope.",
            ],
            budgetPolicyRefs: [
              "runtime-task-budget://agent_team.coding/implementation_microtask/standard",
            ],
            downstreamConsumer:
              typeof metadata.expectedDownstreamConsumer === "string"
                ? metadata.expectedDownstreamConsumer
                : "validation_and_review",
            successEvidenceDescriptions: stringArray(metadata.acceptanceCriteria, [
              "Changed-file refs and validation refs are recorded.",
            ]),
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
        nodeExecutionPacket: hydratedNodePacket.success ? hydratedNodePacket.data : undefined,
        codingResourcePacket: hydratedResourcePacket.success
          ? hydratedResourcePacket.data
          : undefined,
        rationaleForCallingThisRole: taskPacket.whyThisWorkerWasSelected,
        downstreamConsumer: taskPacket.downstreamConsumer,
        expectedOutput: taskPacket.expectedOutput,
        repoRoot: process.cwd(),
        allowedFileRefs: allowedRefs,
        targetFileRefs: targetRefs,
        deniedFileRefs: [],
        contextPackRefs: contextRefs,
        contextSynthesisRefs: taskPacket.contextSynthesisRefs,
        validationCommandRefs,
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

function createContextSynthesisReplayExecutor({
  runtime,
  runtimeJobId,
  workflowId,
  objective,
  packets,
  contextSupplySummary,
  boundary,
}) {
  const modelClient = new CodexDynamicJsonClient(process.cwd());
  return {
    async execute({ node, snapshotSummary, missionLedgerSummary }) {
      const sourceCommitmentIds = [
        ...new Set(
          packets
            .map((packet) => packet.commitmentId)
            .filter((commitmentId) => typeof commitmentId === "string" && commitmentId.trim()),
        ),
      ].slice(0, 80);
      const sourcePacketRefs = [
        ...new Set(
          packets
            .map((packet) => packet.packetRef)
            .filter((packetRef) => typeof packetRef === "string" && packetRef.trim()),
        ),
      ].slice(0, 80);
      const sourceContextHandoffRefs = [
        ...new Set([
          ...node.inputHandoffRefs,
          ...contextSupplySummary.commitmentResults
            .map((result) => result.contextHandoffPacketRef)
            .filter((ref) => typeof ref === "string" && ref.trim()),
          ...snapshotSummary.nodeSummaries.flatMap((summary) =>
            summary.nodeKind === "context_scout" && summary.nodeStatus === "succeeded"
              ? summary.outputArtifactRefs
              : [],
          ),
        ]),
      ].slice(0, 120);
      const synthesisInputManifest = buildContextSynthesisInputManifest({
        missionId:
          typeof missionLedgerSummary?.missionId === "string"
            ? missionLedgerSummary.missionId
            : "boundary-replay-mission",
        sourcePromptRef: `runtime-job://${runtimeJobId}/source-prompt/context-index`,
        sourcePromptHash:
          typeof missionLedgerSummary?.sourcePromptHash === "string"
            ? missionLedgerSummary.sourcePromptHash
            : null,
        sourcePromptSectionRefs: [],
        globalConstraints: [],
        commitmentPackets: packets,
        contextScoutSummaries: snapshotSummary.nodeSummaries.filter(
          (summary) => summary.nodeKind === "context_scout",
        ),
        sourceContextHandoffRefs,
        maxInputBytes: Number(
          process.env.OPENCLAW_BOUNDARY_REPLAY_CONTEXT_SYNTHESIS_MANIFEST_MAX_INPUT_BYTES ?? 96_000,
        ),
      });
      const synthesisManifestRef = `runtime-job://${runtimeJobId}/context-synthesis/input-manifest/${synthesisInputManifest.manifestId}`;
      await runtime.runtimeJobs.attachArtifact({
        jobId: runtimeJobId,
        artifactType: "execution_platform.context_synthesis_input_manifest",
        storageKind: "metadata",
        uri: synthesisManifestRef,
        contentType: "application/json",
        metadata: summarizeContextSynthesisInputManifestForArtifact(synthesisInputManifest),
      });
      if (synthesisInputManifest.budget.budgetStatus !== "within_budget") {
        await emitReplayState({
          runtime,
          runtimeJobId,
          event: "context_synthesis_manifest_budget_blocked",
          graphId: node.graphId,
          boundary,
          phase: "context_synthesis_manifest",
          status: "needs_review",
          details: {
            synthesisManifestRef,
            budget: synthesisInputManifest.budget,
            reasonCodes: synthesisInputManifest.reasonCodes,
          },
        });
        return {
          status: "needs_review",
          outputArtifactRefs: [synthesisManifestRef],
          producedOutputRefs: [synthesisManifestRef],
          reasonCodes: [
            `context_synthesis_manifest_${synthesisInputManifest.budget.budgetStatus}`,
            "context_synthesis_manifest_not_silently_truncated",
          ],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          workQueueLifecycleMutated: false,
        };
      }
      const userPayload = {
        runtimeJobId,
        graphId: node.graphId,
        workflowId,
        nodeId: node.nodeId,
        ownerObjectiveSummary: objective.slice(0, 5_000),
        missionLedgerSummary,
        synthesisInputManifest,
        synthesisInputManifestRef: synthesisManifestRef,
        sourceContextHandoffRefs,
        acceptedParallelContextSupply: contextSupplySummary,
        schedulerSnapshot: snapshotSummary,
        expectedJsonShape: {
          synthesisId: "bounded-stable-id",
          implementationReadiness:
            "ready | needs_more_context | needs_human_decision | needs_review",
          commitmentCoverage: [
            {
              commitmentId: "ledger-id",
              covered: true,
              groupIds: ["group-id"],
              contextHandoffRefs: ["runtime-job://.../context-handoff/..."],
              limitationSummary: null,
            },
          ],
          recommendedImplementationGroups: [
            {
              groupId: "worker-ready-group-id",
              title: "short title",
              objective: "exact worker objective",
              commitmentIds: ["ledger-id"],
              inputHandoffRefs: ["runtime-job://.../context-handoff/..."],
              targetRefs: ["extensions/..."],
              recommendedCapabilityIds: ["implementation_microtask"],
              downstreamConsumer: "validation_matrix",
              successCriteria: ["bounded success criterion"],
              dependsOnGroupIds: [],
              parallelizableWithGroupIds: [],
              workerFitRationale: "why this worker lane is appropriate",
            },
          ],
          dependencyMap: [],
          contextHandoffRefMap: [],
          parallelismPlan: "bounded explanation",
          stopIfMissing: [],
          knownRisks: [],
          limitations: [],
          evidenceClaimExpectations: [],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        },
        rawPromptStored: false,
        rawResponseStored: false,
      };
      await emitReplayState({
        runtime,
        runtimeJobId,
        event: "context_synthesis_model_call_started",
        graphId: node.graphId,
        boundary,
        phase: "context_synthesis",
        status: "running",
        details: {
          nodeId: node.nodeId,
          modelRef: DEFAULT_DYNAMIC_ORCHESTRATOR_MODEL_REF,
          providerPath: DEFAULT_DYNAMIC_ORCHESTRATOR_PROVIDER_PATH,
          sourceCommitmentCount: sourceCommitmentIds.length,
          sourcePacketRefCount: sourcePacketRefs.length,
          sourceContextHandoffRefCount: sourceContextHandoffRefs.length,
          schedulerNodeCount: snapshotSummary.nodeSummaries.length,
          payloadHash: sha256(stringifyJson(userPayload)),
        },
      });
      let response;
      try {
        response = await modelClient.runJson({
          modelRef: DEFAULT_DYNAMIC_ORCHESTRATOR_MODEL_REF,
          providerPath: DEFAULT_DYNAMIC_ORCHESTRATOR_PROVIDER_PATH,
          systemPrompt: [
            "You are the OpenClaw context synthesis worker.",
            "Return strict compact JSON only. Do not store raw prompts, responses, transcripts, logs, secrets, or hidden reasoning.",
            "Consume accepted Mission Ledger commitments, CommitmentWorkPackets, and context handoff refs. Produce a dependency-aware implementation grouping.",
            "Do not execute implementation. Do not create runtime node ids, executor keys, graph node kinds, or runtime evidence enums.",
            "The runtime owns node envelopes, ids, edges, validation, persistence, and authority. You own semantic grouping, dependency intent, worker fit, readiness, and risks.",
            "Set implementationReadiness to ready only if each blocking commitment has enough context to form worker-ready implementation, validation, and readback groups.",
          ].join("\n"),
          userPayload,
          maxOutputTokens: 12_000,
          timeoutMs: Number(
            process.env.OPENCLAW_BOUNDARY_REPLAY_CONTEXT_SYNTHESIS_TIMEOUT_MS ?? 900_000,
          ),
          progress: {
            spanId: `${runtimeJobId}:${node.graphId}:${node.nodeId}:context-synthesis`,
            objectiveSummary: "Replay context synthesis model call.",
            reasonCodes: ["boundary_replay_context_synthesis_model_call"],
            onEvent: (event) =>
              emitReplayState({
                runtime,
                runtimeJobId,
                event: "model_call_progress",
                graphId: node.graphId,
                boundary,
                phase: "context_synthesis",
                status: event.phase === "failed" ? "failed" : "running",
                details: event,
              }),
          },
        });
      } catch (error) {
        await emitReplayState({
          runtime,
          runtimeJobId,
          event: "context_synthesis_model_call_failed",
          graphId: node.graphId,
          boundary,
          phase: "context_synthesis",
          status: "failed",
          details: {
            nodeId: node.nodeId,
            modelRef: DEFAULT_DYNAMIC_ORCHESTRATOR_MODEL_REF,
            errorName: error?.name ?? "unknown_error",
            errorSummary: String(error?.message ?? error).slice(0, 500),
            errorMessageHash: sha256(error?.message ?? String(error)),
          },
        });
        modelClient.close();
        throw error;
      }
      await emitReplayState({
        runtime,
        runtimeJobId,
        event: "context_synthesis_model_call_completed",
        graphId: node.graphId,
        boundary,
        phase: "context_synthesis",
        status: "completed",
        details: {
          nodeId: node.nodeId,
          responseHash: response.responseHash ?? null,
          modelRunRefCount: response.responseHash ? 1 : 0,
        },
      });
      let parsed = parseJsonObject(response.responseText);
      if (contextSynthesisGroupGuidanceArray(parsed).length === 0) {
        await emitReplayState({
          runtime,
          runtimeJobId,
          event: "context_synthesis_group_guidance_repair_started",
          graphId: node.graphId,
          boundary,
          phase: "context_synthesis",
          status: "running",
          details: {
            failedDecisionId: `${runtimeJobId}:${node.graphId}:${node.nodeId}:context-synthesis`,
            missingPath: "groupPlanningGuidance",
            acceptedAliases: [
              "recommendedImplementationGroups",
              "implementationGroups",
              "workGroups",
              "groups",
            ],
            synthesisManifestRef,
          },
        });
        const repair = await modelClient.runJson({
          modelRef: DEFAULT_DYNAMIC_ORCHESTRATOR_MODEL_REF,
          providerPath: DEFAULT_DYNAMIC_ORCHESTRATOR_PROVIDER_PATH,
          systemPrompt: [
            "You are repairing a context synthesis boundary replay schema.",
            "Return strict compact JSON only. Fill only groupPlanningGuidance or an accepted alias from existing synthesis semantics and manifest refs.",
            "Do not create runtime node ids, executor keys, graph node kinds, or evidence enums.",
          ].join("\n"),
          userPayload: {
            failedDecisionId: `${runtimeJobId}:${node.graphId}:${node.nodeId}:context-synthesis`,
            missingFields: [{ path: "groupPlanningGuidance" }],
            preserveFields: Object.keys(parsed).slice(0, 40),
            existingCoreSynthesis: parsed,
            synthesisInputManifestRef,
            synthesisInputManifest,
            expectedJsonShape: {
              groupPlanningGuidance: [
                {
                  groupIntent: "semantic implementation group intent",
                  commitmentIds: ["ledger-id"],
                  inputHandoffRefs: ["runtime-job://.../context-handoff/..."],
                  targetRefs: ["extensions/..."],
                  dependencyNotes: ["bounded dependency notes"],
                  workerFitRationale: "worker fit rationale",
                },
              ],
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
            },
            rawPromptStored: false,
            rawResponseStored: false,
          },
          maxOutputTokens: 2_000,
          timeoutMs: Number(
            process.env.OPENCLAW_BOUNDARY_REPLAY_CONTEXT_SYNTHESIS_REPAIR_TIMEOUT_MS ?? 180_000,
          ),
        });
        const repaired = parseJsonObject(repair.responseText);
        const repairedGroups = contextSynthesisGroupGuidanceArray(repaired);
        if (repairedGroups.length > 0) {
          parsed = { ...parsed, groupPlanningGuidance: repairedGroups };
        }
      }
      modelClient.close();
      const synthesis = normalizeContextSynthesisArtifact({
        value: parsed,
        sourceRuntimeJobId: runtimeJobId,
        sourceGraphId: node.graphId,
        workflowId,
        sourceCommitmentIds,
        sourcePacketRefs,
        sourcePacketSummaries: packets,
        sourceContextHandoffRefs,
        createdAt: new Date().toISOString(),
      });
      const validation = validateContextSynthesisArtifact(synthesis);
      const graphCompileHandoff = summarizeContextSynthesisForGraphCompile(synthesis);
      const synthesisAccepted = validation.valid && graphCompileHandoff.compileHandoffComplete;
      await emitReplayState({
        runtime,
        runtimeJobId,
        event: "context_synthesis_validation_completed",
        graphId: node.graphId,
        boundary,
        phase: "context_synthesis",
        status: synthesisAccepted ? "accepted" : "needs_review",
        details: {
          nodeId: node.nodeId,
          synthesisRef: synthesis.synthesisRef,
          implementationReadiness: synthesis.implementationReadiness,
          implementationGroupCount: synthesis.recommendedImplementationGroups.length,
          graphCompileHandoffGroupCount: graphCompileHandoff.implementationGroups.length,
          graphCompileHandoffComplete: graphCompileHandoff.compileHandoffComplete,
          commitmentCoverageCount: synthesis.commitmentCoverage.length,
          reasonCodes: [
            ...(graphCompileHandoff.compileHandoffComplete
              ? []
              : ["context_synthesis_graph_compile_handoff_incomplete"]),
            ...validation.reasonCodes,
          ].slice(0, 20),
        },
      });
      await runtime.runtimeJobs.attachArtifact({
        jobId: runtimeJobId,
        artifactType: CONTEXT_SYNTHESIS_ARTIFACT_TYPE,
        storageKind: "metadata",
        uri: synthesis.synthesisRef,
        contentType: "application/json",
        metadata: summarizeContextSynthesisArtifact(synthesis),
      });
      return {
        status: synthesisAccepted ? "succeeded" : "needs_review",
        outputArtifactRefs: [synthesis.synthesisRef],
        producedOutputRefs: [synthesis.synthesisRef],
        modelRunRefs: response.responseHash
          ? [`model-response-hash://${response.responseHash}`]
          : [],
        metadata: {
          contextSynthesisGraphCompile: graphCompileHandoff,
          contextSynthesis: summarizeContextSynthesisArtifact(synthesis),
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
        },
        reasonCodes: [
          synthesisAccepted
            ? "context_synthesis_accepted"
            : validation.valid
              ? "context_synthesis_graph_compile_handoff_incomplete"
              : "context_synthesis_validation_failed",
          graphCompileHandoff.compileHandoffComplete
            ? "context_synthesis_graph_compile_handoff_complete"
            : "context_synthesis_graph_compile_handoff_incomplete",
          ...validation.reasonCodes.slice(0, 20),
        ],
        limitations: synthesis.limitations,
        ownerSummary: `Context synthesis ${synthesis.implementationReadiness} with ${synthesis.recommendedImplementationGroups.length} implementation group(s).`,
        eli5Summary:
          "OpenClaw turned the context scouts into a concrete map of what work should run next.",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        workQueueLifecycleMutated: false,
      };
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
  contextSupplySummary,
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
        commitmentWorkPackets: input.commitmentWorkPackets ?? [],
        acceptedParallelContextSupply: contextSupplySummary,
        postSynthesisRoleObligationGuidance: input.postSynthesisRoleObligationGuidance ?? null,
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
            "Valid decisionKind values include add_nodes, run_node, split_node, retry_node, rerun_role, request_context, request_validation, request_review, request_human_decision, escalate_worker, repair_from_validation, create_closeout, mark_needs_review, mark_blocked.",
            "For complex add_nodes decisions, provide one stagedScheduler object. The runtime records the staged tools and derives canonical node envelopes.",
            "stagedScheduler.workBreakdownUnits contain only model-owned intent: workUnitId, title, objective, commitmentIds, rationale, expectedOutcome, targetRefs.",
            "stagedScheduler.capabilitySelectionsForWorkUnits contain only model-owned selection: workUnitId, selectedCapabilityId, consideredCapabilityIds, utilityRationale, costRationale, whyCheaperOptionsWereInsufficient when relevant, whyThisIsNotDuplicateWork, stopOrEscalationCondition, and qualification refs only when the manifest requires them.",
            "stagedScheduler.nodeContractDrafts contain only worker-facing contract fields: workUnitId, roleRationale, objective, inputRefs, expectedOutput, successCriteria, downstreamConsumer, targetRefs.",
            "stagedScheduler.edgeOrParallelismDraft must contain dependency/handoff edges using workUnitId refs, or parallelIndependentNodesJustification explaining why the units can run independently.",
            "If postSynthesisRoleObligationGuidance is present, every requiredRoleObligation with requiredInNextPostSynthesisGraph true must have one workBreakdownUnit, one capabilitySelectionsForWorkUnits entry using one of that obligation's validCapabilityIds, and one nodeContractDraft for the same workUnitId.",
            "When recentNodeResultSummaries contains a context_synthesis result, treat it as coordination evidence only. It may inform explicit WorkIntent units, capability choices, dependencies, target refs, success criteria, risks, and limitations, but it must not be transformed directly into implementation/validation/review/readback/closeout executable nodes.",
            "For docs_or_readback after synthesis, prefer observability_readback when it is listed as a valid capability. Do not satisfy docs/readback only in rationale text.",
            "Do not provide graphNodeKind, nodeKind, executorKey, workerRef, requiredMetadataSchemaRef, expectedEvidence, selectedNodeKind, selectedExecutorKey, low-level evidence enums, or canonical node ids for complex add_nodes.",
            "After accepted context_scout evidence, decide whether to request sharper context, split implementation into scoped child nodes, run validation/review, ask a human decision, or mark needs_review. Do not continue if the context handoff says implementation source files remain unknown.",
            "Use the runtimeNodeCapabilityManifest to choose the cheapest sufficiently capable node that advances a commitment, reduces uncertainty, enables parallel work, or produces evidence needed for closure.",
            "Do not self-execute work in the orchestrator. The orchestrator selects nodes and reviews evidence; worker nodes do implementation, research, validation, review, or closeout work.",
            "Do not store raw prompts, responses, transcripts, logs, secrets, or hidden reasoning.",
          ].join("\n"),
          userPayload,
          maxOutputTokens: 12_000,
          timeoutMs: Number(
            process.env.OPENCLAW_BOUNDARY_REPLAY_ORCHESTRATOR_TIMEOUT_MS ?? 900_000,
          ),
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
  const boundary = flag("--boundary", "after-context");
  if (!isSupportedBoundary(boundary)) {
    throw new Error(`unsupported_boundary:${boundary}`);
  }
  if (isLegacyDiagnosticBoundary(boundary) && !legacyDiagnosticBoundaryAllowed()) {
    const summary = {
      artifactKind: "product_spec_boundary_replay_result",
      generatedAt: new Date().toISOString(),
      status: "needs_review",
      runtimeJobId,
      graphId: graphIdFlag ?? null,
      boundary,
      reasonCodes: [
        "legacy_context_synthesis_boundary_diagnostic_only",
        "after_context_synthesis_replay_requires_explicit_diagnostic_flag",
        "use_after_parallel_context_or_after_graph_selection_for_scheduler_first_replay",
      ],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    };
    await writeJson("product-spec-boundary-replay-result.json", summary);
    await writeProofJson("proof.json", summary);
    process.stdout.write(
      `${JSON.stringify({ event: "product_spec_boundary_replay_result", ...summary })}\n`,
    );
    process.exitCode = 1;
    return;
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
  const targetNodeIds = new Set(flags("--target-node-id"));

  const runtime = await getExecutionPlatformRuntime(loadConfig());
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

  const missionLedgerArtifact = latestArtifact(
    artifacts,
    "execution_platform.mission_contract_ledger",
  );
  const missionLedger = metadataOf(missionLedgerArtifact);
  const packets = await packetsFromArtifacts(runtime, artifacts);
  const contextReplay = latestArtifact(
    artifacts,
    "execution_platform.context_scout_boundary_replay",
  );
  const contextToolLoop = latestArtifact(artifacts, "execution_platform.context_scout_tool_loop");
  const contextHandoff = latestArtifact(artifacts, "execution_platform.context_handoff_packet");
  const parallelContextSupply = latestArtifact(
    artifacts,
    "execution_platform.parallel_context_scout_boundary_replay",
  );
  const parallelContextSupplyMetadata = metadataOf(parallelContextSupply);
  const reconstructedContextSupplySummary = contextSupplySummaryFromContextHandoffArtifacts(
    artifacts,
    packets,
    sourceSnapshot,
  );
  const contextSupplySummary = acceptedParallelContextSupply(
    parallelContextSupplyMetadata,
    packets.length,
  )
    ? parallelContextSupplySummary(parallelContextSupplyMetadata)
    : reconstructedContextSupplySummary;
  const expectedContextSupplyPacketCount =
    typeof contextSupplySummary.packetCount === "number"
      ? contextSupplySummary.packetCount
      : packets.length;
  const contextStatus = metadataOf(contextToolLoop).sufficiencyStatus;
  const contextVerifiedCount = Array.isArray(metadataOf(contextToolLoop).verifiedFileRefs)
    ? metadataOf(contextToolLoop).verifiedFileRefs.length
    : 0;
  const isAfterParallelContext = boundary === "after-parallel-context";
  const isAfterContextSynthesis = boundary === "after-context-synthesis";
  const isAfterGraphSelection = boundary === "after-graph-selection";
  const isBeforeResourceMaterialization =
    boundary === "before-resource-materialization" ||
    boundary === "before-split-required-materialization";
  const isAfterResourceMaterialization =
    boundary === "after-resource-materialization" ||
    boundary === "after-split-required-materialization";
  const isSplitRequiredMaterializationBoundary =
    boundary === "before-split-required-materialization" ||
    boundary === "after-split-required-materialization";
  if (
    (isAfterContextSynthesis ||
      isAfterGraphSelection ||
      isBeforeResourceMaterialization ||
      isAfterResourceMaterialization) &&
    !graphIdFlag
  ) {
    throw new Error(`graph_id_required_for_boundary:${boundary}`);
  }
  const requiresAcceptedParallelContext =
    boundary === "after-context" || isAfterParallelContext || isAfterContextSynthesis;
  if (
    requiresAcceptedParallelContext &&
    !acceptedParallelContextSupply(contextSupplySummary, expectedContextSupplyPacketCount)
  ) {
    const summary = {
      artifactKind: "product_spec_boundary_replay_result",
      generatedAt: new Date().toISOString(),
      status: "needs_review",
      runtimeJobId,
      graphId,
      boundary,
      reasonCodes: ["accepted_parallel_context_supply_required_before_after_context_replay"],
      packetCount: expectedContextSupplyPacketCount,
      totalPacketCount: packets.length,
      parallelContextSupply: contextSupplySummary,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    };
    await writeJson("product-spec-boundary-replay-result.json", summary);
    await writeProofJson("proof.json", summary);
    process.stdout.write(
      `${JSON.stringify({ event: "product_spec_boundary_replay_result", ...summary })}\n`,
    );
    process.exitCode = 1;
    return;
  }
  const reconciledContextFrontierNodes = requiresAcceptedParallelContext
    ? await reconcileAcceptedContextFrontierNodes({
        runtime,
        graphId,
        snapshot: sourceSnapshot,
        contextSupplySummary,
      })
    : [];
  if (reconciledContextFrontierNodes.length > 0) {
    process.stdout.write(
      `${JSON.stringify({
        event: "product_spec_boundary_replay_progress",
        stage: "boundary_replay_context_frontier_reconciled",
        status: "completed",
        graphId,
        nodeIds: reconciledContextFrontierNodes.map((node) => node.nodeId),
        reasonCodes: ["boundary_replay_context_frontier_reconciled_from_accepted_handoffs"],
      })}\n`,
    );
    sourceSnapshot = await runtime.runtimeWorkGraphs.readGraphSnapshot(graphId);
    if (!sourceSnapshot) {
      throw new Error(`runtime_graph_snapshot_missing_after_context_reconciliation:${graphId}`);
    }
  }

  if (isAfterContextSynthesis || isAfterGraphSelection) {
    const hasAcceptedContextSynthesis = sourceSnapshot.nodes.some(
      (node) => node.nodeKind === "context_synthesis" && node.nodeStatus === "succeeded",
    );
    const hasAcceptedNodeScopedContext = hasAcceptedNodeScopedContextSupply(sourceSnapshot);
    const hasPlannedExecutableNode = sourceSnapshot.nodes.some(
      (node) => node.nodeKind !== "context_synthesis" && node.nodeStatus === "planned",
    );
    const reasonCodes = [];
    if (isAfterContextSynthesis && !hasAcceptedContextSynthesis) {
      reasonCodes.push(
        "accepted_context_synthesis_required_before_after_context_synthesis_diagnostic_replay",
      );
    }
    if (isAfterGraphSelection && !hasAcceptedNodeScopedContext) {
      reasonCodes.push("accepted_node_scoped_context_required_before_after_graph_selection_replay");
    }
    if (isAfterGraphSelection && !hasPlannedExecutableNode) {
      reasonCodes.push(
        "planned_executable_graph_nodes_required_before_after_graph_selection_replay",
      );
    }
    if (reasonCodes.length > 0) {
      const summary = {
        artifactKind: "product_spec_boundary_replay_result",
        generatedAt: new Date().toISOString(),
        status: "needs_review",
        runtimeJobId,
        graphId,
        boundary,
        reasonCodes,
        acceptedContextSynthesis: hasAcceptedContextSynthesis,
        acceptedNodeScopedContextSupply: hasAcceptedNodeScopedContext,
        plannedExecutableNodeCount: sourceSnapshot.nodes.filter(
          (node) => node.nodeKind !== "context_synthesis" && node.nodeStatus === "planned",
        ).length,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      };
      await writeJson("product-spec-boundary-replay-result.json", summary);
      await writeProofJson("proof.json", summary);
      process.stdout.write(
        `${JSON.stringify({ event: "product_spec_boundary_replay_result", ...summary })}\n`,
      );
      process.exitCode = 1;
      return;
    }
  }
  if (boundary === "after-context" && contextStatus !== "accepted") {
    const summary = {
      artifactKind: "product_spec_boundary_replay_result",
      generatedAt: new Date().toISOString(),
      status: "needs_review",
      runtimeJobId,
      graphId,
      boundary,
      reasonCodes: ["accepted_context_scout_required_before_after_context_replay"],
      contextStatus,
      contextVerifiedCount,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    };
    await writeJson("product-spec-boundary-replay-result.json", summary);
    await writeProofJson("proof.json", summary);
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

  const replayGraphId = isAfterParallelContext
    ? await createReplayGraphFromParallelContext({
        runtime,
        sourceGraphId: graphId,
        sourceSnapshot,
        runtimeJobId,
        workflowId: sourceSnapshot.graph.workflowId,
        parallelContextSupply: contextSupplySummary,
        packetCount: packets.length,
      })
    : graphId;
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
    contextSupplySummary,
  });
  for (const node of replayStartSnapshot.nodes) {
    if (node.nodeStatus === "succeeded") {
      orchestrator.noteNodeResult(node.nodeId, {
        status: "succeeded",
        outputArtifactRefs: node.outputArtifactRefs,
        reasonCodes: [`existing_node_status:${node.nodeStatus}`],
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
        objective,
        repoScopeRefs,
        validationCommandRefs,
        contextSupplySummary,
        orchestrator,
        boundary,
        persistWorkerEdits,
      })
    : stopExecutor;
  const contextSynthesisExecutor = createContextSynthesisReplayExecutor({
    runtime,
    runtimeJobId,
    workflowId: replayStartSnapshot.graph.workflowId,
    objective,
    packets,
    contextSupplySummary,
    boundary,
  });
  const executors = {
    "role:context_synthesis": contextSynthesisExecutor,
    "role:context_scout": stopExecutor,
    "role:test_engineer": stopExecutor,
    "role:reviewer": reviewerExecutor,
    "role:observability_scribe": stopExecutor,
    "role:implementation_engineer": implementationExecutor,
    "kind:context_scout": stopExecutor,
    "kind:context_synthesis": contextSynthesisExecutor,
    "kind:implementation": implementationExecutor,
    "kind:test_authoring": stopExecutor,
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
    requireModelAuthoredCommitmentWorkPacketsForComplexMission: true,
    roleCoverageProfile: plugin.schedulerOptions.roleCoverageProfile,
    entryNodePolicy: plugin.schedulerOptions.entryNodePolicy ?? null,
    capabilityRegistrySummary: plugin.schedulerOptions.capabilityRegistrySummary,
    capabilityManifest: plugin.schedulerOptions.capabilityManifest,
    orchestrator,
    executors,
    missionLedger,
    commitmentWorkPackets: packets,
    maxIterations,
    maxParallelNodeExecutions,
    beforeNodeExecution: async ({ node }) => {
      const materialized = nodeKindRequiresImplementationContext(node.nodeKind)
        ? await materializeReplayImplementationResources({
            runtime,
            runtimeJobId,
            graphId: replayGraphId,
            workflowId: replayStartSnapshot.graph.workflowId,
            node,
            objective,
            repoScopeRefs,
            validationCommandRefs,
            contextSupplySummary,
            boundary,
          })
        : null;
      if (materialized) {
        const readyPackets = materialized.readyMaterializedPackets.map(
          ({ taskPacket, materialized }) => ({
            nodeId: materialized.nodeExecutionPacket.nodeId,
            implementationTaskPacketRef: taskPacket.packetRef,
            nodeExecutionPacketRef: materialized.nodeExecutionPacket.packetRef,
            resourcePacketRef: materialized.codingResourcePacket.packetRef,
            nodeReadinessStateRef: materialized.readiness.state.stateRef,
            nodeReadinessStatus: materialized.readiness.state.readinessStatus,
            nodeReadinessPhase: materialized.readiness.state.phase,
            targetFileRefs: taskPacket.targetFileRefs.slice(0, 20),
            targetFileSnapshotRefs: taskPacket.targetFileSnapshots
              .map((snapshot) => snapshot.snapshotRef)
              .slice(0, 20),
          }),
        );
        await emitReplayState({
          runtime,
          runtimeJobId,
          event: "implementation_resource_materialization_completed",
          graphId: replayGraphId,
          boundary,
          phase: "resource_materialization",
          status:
            readyPackets.length > 0 &&
            readyPackets.length === materialized.materializedPackets.length
              ? "completed"
              : "needs_review",
          details: {
            nodeId: node.nodeId,
            implementationContextPacketRef:
              materialized.implementationContextCompile.packet.packetRef,
            implementationContextReadinessStatus:
              materialized.implementationContextCompile.packet.readinessStatus,
            implementationTaskPacketCount:
              materialized.implementationContextCompile.implementationTaskPackets.length,
            nodeExecutionPacketCount: materialized.materializedPackets.length,
            readyNodeExecutionPacketCount: readyPackets.length,
            readyPackets,
            blockerSummary: materialized.implementationContextCompile.blockerSummary,
            reasonCodes: materialized.implementationContextCompile.reasonCodes.slice(0, 30),
          },
        });
        if (
          materialized.materializedPackets.length > 1 &&
          materialized.readyMaterializedPackets.length > 0
        ) {
          const selected = readyPackets.map((packet) => ({
            nodeId: packet.nodeId,
            nodeKind: node.nodeKind,
            assignedRole: node.assignedRole ?? null,
            capabilityId:
              node.metadata && typeof node.metadata === "object"
                ? (node.metadata.capabilityId ?? null)
                : null,
            nodeExecutionPacketRef: packet.nodeExecutionPacketRef,
            nodeReadinessStateRef: packet.nodeReadinessStateRef,
            nodeReadinessStatus: packet.nodeReadinessStatus,
            targetFileRefs: packet.targetFileRefs,
          }));
          selectedBoundaryNode ??= selected[0] ?? null;
          selectedBoundaryNodes.push(...selected);
          return {
            status: "waiting_for_human",
            iterations: 0,
            addedNodeIds: selected.map((packet) => packet.nodeId),
            executedNodeIds: [],
            selectedNodeId: selected[0]?.nodeId ?? node.nodeId,
            reasonCodes: [
              boundarySelectedReasonCode(boundary),
              "boundary_replay_terminal_frontier_selected_without_worker_execution",
              "boundary_replay_materialized_file_resolved_implementation_task_nodes",
              "boundary_replay_stopped_before_worker_execution_with_ready_node_packets",
              `boundary_replay_target_node_kind:${node.nodeKind}`,
            ],
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
            rawToolLogStored: false,
          };
        }
      }
      if (boundaryStopsBeforeWorkerExecution(boundary, node, { executeWorkers })) {
        const selected = {
          nodeId: node.nodeId,
          nodeKind: node.nodeKind,
          assignedRole: node.assignedRole ?? null,
          capabilityId:
            node.metadata && typeof node.metadata === "object"
              ? (node.metadata.capabilityId ?? null)
              : null,
          implementationContextPacketRef:
            materialized?.implementationContextCompile.packet.packetRef ?? null,
          nodeExecutionPacketRef:
            materialized?.materializedPackets[0]?.materialized.nodeExecutionPacket.packetRef ??
            null,
          nodeReadinessStateRef:
            materialized?.materializedPackets[0]?.materialized.readiness.state.stateRef ?? null,
          nodeReadinessStatus:
            materialized?.materializedPackets[0]?.materialized.readiness.state.readinessStatus ??
            null,
        };
        selectedBoundaryNode ??= selected;
        selectedBoundaryNodes.push(selected);
        return {
          status:
            !materialized ||
            materialized.readyMaterializedPackets.length === materialized.materializedPackets.length
              ? "waiting_for_human"
              : "needs_review",
          iterations: 0,
          addedNodeIds: [],
          executedNodeIds: [],
          selectedNodeId: node.nodeId,
          reasonCodes: [
            boundarySelectedReasonCode(boundary),
            "boundary_replay_terminal_frontier_selected_without_worker_execution",
            "boundary_replay_stopped_before_worker_execution_without_mutating_node_success",
            `boundary_replay_target_node_kind:${node.nodeKind}`,
            ...(materialized
              ? [
                  "boundary_replay_resource_materialization_evaluated",
                  `boundary_replay_ready_node_execution_packet_count:${materialized.readyMaterializedPackets.length}`,
                  `boundary_replay_node_execution_packet_count:${materialized.materializedPackets.length}`,
                ]
              : []),
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
        (isAfterParallelContext || isAfterContextSynthesis || isAfterGraphSelection) &&
        progress.stage === "scheduler_tool" &&
        progress.status === "completed" &&
        (progress.schedulerToolId === "scheduler.approve_and_run_first_node" ||
          progress.schedulerToolId === "scheduler.select_next_node") &&
        typeof progress.nodeId === "string" &&
        progress.nodeId.trim()
      ) {
        const currentSnapshot = await runtime.runtimeWorkGraphs.readGraphSnapshot(replayGraphId);
        const targetNode = currentSnapshot?.nodes.find((node) => node.nodeId === progress.nodeId);
        if (targetNode && targetNode.nodeKind !== "context_synthesis") {
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
        boundary === "after-context" &&
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
    replayGraphCreated: isAfterParallelContext,
    maxIterations,
    executeWorkers,
    contextReplayRef: contextReplay?.uri ?? null,
    contextToolLoopRef: contextToolLoop?.uri ?? null,
    contextHandoffRef: contextHandoff?.uri ?? null,
    parallelContextSupplyRef: parallelContextSupply?.uri ?? null,
    parallelContextSupply: contextSupplySummary,
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
  if (isAfterResourceMaterialization && executeWorkers) {
    const inspection = await inspectAfterResourceMaterializationFrontier({
      runtime,
      artifacts: await runtime.runtimeJobs.listArtifacts(runtimeJobId),
      snapshot: replayStartSnapshot,
      runtimeJobId,
      graphId: replayGraphId,
      workflowId: replayStartSnapshot.graph.workflowId,
      maxParallelNodeExecutions,
      targetNodeIds,
    });
    selectedBoundaryNodes.push(
      ...inspection.inspections.map((inspectionNode) => ({
        nodeId: inspectionNode.nodeId,
        nodeKind: inspectionNode.nodeKind,
        executionIntent: inspectionNode.executionIntent,
        evidenceMode: inspectionNode.evidenceMode,
        nodeExecutionPacketRef: inspectionNode.nodeExecutionPacketRef,
        resourcePacketRef: inspectionNode.resourcePacketRef,
        implementationContextPacketRef: inspectionNode.implementationContextPacketRef,
        nodeReadinessStateRef: inspectionNode.nodeReadinessStateRef,
        nodeReadinessStatus: inspectionNode.nodeReadinessStatus,
        persistedNodeReadinessStatus: inspectionNode.persistedNodeReadinessStatus,
        recomputedReadinessDiffersFromPersisted:
          inspectionNode.recomputedReadinessDiffersFromPersisted,
        executable: inspectionNode.executable,
      })),
    );
    selectedBoundaryNode = selectedBoundaryNodes.find((node) => node.executable) ?? null;
    const selectedRuntimeNode = selectedBoundaryNode
      ? replayStartSnapshot.nodes.find((node) => node.nodeId === selectedBoundaryNode.nodeId)
      : null;
    const workerResult = selectedRuntimeNode
      ? await implementationExecutor.execute({ node: selectedRuntimeNode })
      : null;
    const status =
      workerResult?.status === "succeeded"
        ? "succeeded"
        : selectedRuntimeNode
          ? "needs_review"
          : "needs_review";
    await emitReplayState({
      runtime,
      runtimeJobId,
      event: "after_resource_materialization_worker_smoke_completed",
      graphId: replayGraphId,
      boundary,
      phase: "worker_execution",
      status,
      details: {
        activeNodeIds: selectedBoundaryNode ? [selectedBoundaryNode.nodeId] : [],
        readyNodeExecutionPacketCount: inspection.executableNodeCount,
        blockedNodeCount: inspection.blockedNodeCount,
        payloadRefs: selectedBoundaryNode
          ? [
              selectedBoundaryNode.nodeExecutionPacketRef,
              selectedBoundaryNode.resourcePacketRef,
              selectedBoundaryNode.implementationContextPacketRef,
              selectedBoundaryNode.nodeReadinessStateRef,
            ].filter(Boolean)
          : [],
        changedFileRefs: Array.isArray(workerResult?.changedFileRefs)
          ? workerResult.changedFileRefs.slice(0, 20)
          : [],
        validationRefs: Array.isArray(workerResult?.validationRefs)
          ? workerResult.validationRefs.slice(0, 20)
          : [],
        blockers:
          workerResult?.status === "succeeded"
            ? []
            : workerResult
              ? (workerResult.reasonCodes ?? [])
              : inspection.inspections.flatMap((entry) => entry.blockers ?? []).slice(0, 20),
        nextLegalTransition: status === "succeeded" ? "review_changed_files" : "needs_review",
        proofGateStatus: status,
      },
    });
    const finalSnapshot = await runtime.runtimeWorkGraphs.readGraphSnapshot(replayGraphId);
    const summary = {
      artifactKind: "product_spec_boundary_replay_result",
      generatedAt: new Date().toISOString(),
      status,
      runtimeJobId,
      sourceGraphId: graphId,
      graphId: replayGraphId,
      replayGraphCreated: false,
      boundary,
      maxParallelNodeExecutions,
      executeWorkers: true,
      schedulerResult: {
        status,
        iterations: 0,
        addedNodeIds: [],
        executedNodeIds: selectedBoundaryNode ? [selectedBoundaryNode.nodeId] : [],
        selectedNodeId: selectedBoundaryNode?.nodeId ?? null,
        reasonCodes: [
          "boundary_replay_after_resource_materialization_worker_smoke_direct_frontier",
          `boundary_replay_after_resource_materialization_inspected_node_count:${inspection.inspectedNodeCount}`,
          `boundary_replay_after_resource_materialization_executable_node_count:${inspection.executableNodeCount}`,
          ...(workerResult?.reasonCodes ?? []),
        ].slice(0, 80),
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      },
      selectedBoundaryNode,
      selectedBoundaryNodes,
      materializationInspection: inspection,
      workerSmokeResult: workerResult,
      beforeGraph: preflight.snapshot,
      afterGraph: finalSnapshot ? summarizeSnapshot(finalSnapshot) : null,
      sourceGraphUnchanged:
        finalSnapshot !== null
          ? finalSnapshot.nodes.length === replayStartSnapshot.nodes.length &&
            finalSnapshot.edges.length === replayStartSnapshot.edges.length
          : null,
      progressEventCount: progressEvents.length,
      latestProgressEvents: progressEvents.slice(-20),
      preflightArtifact,
      proofPreflightArtifact,
      routerRerun: false,
      missionLedgerRerun: false,
      commitmentPacketAuthorRerun: false,
      contextScoutRerun: false,
      resourceMaterializationRerun: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    };
    const resultArtifact = await writeJson("product-spec-boundary-replay-result.json", summary);
    const proofArtifact = await writeProofJson("proof.json", summary);
    await runtime.runtimeWorkGraphs.recordCheckpoint({
      graphId: replayGraphId,
      checkpointId: `${replayGraphId}:after-resource-materialization-worker-smoke`,
      checkpointKind: "after_resource_materialization_worker_smoke",
      stateSummary: `After resource materialization worker smoke ${status} for ${selectedBoundaryNode?.nodeId ?? "no-node"}.`,
      artifactRefs: [proofArtifact.path, resultArtifact.path].slice(0, 8),
    });
    await recordCanonicalBoundaryReplayCheckpoint({
      runtime,
      runtimeJobId,
      graphId: replayGraphId,
      workflowId: replayStartSnapshot.graph.workflowId,
      checkpointKind: "after_resource_materialization",
      acceptedArtifactRefs: [proofArtifact.path, resultArtifact.path],
      upstreamArtifactRefs: selectedBoundaryNode
        ? [
            selectedBoundaryNode.nodeExecutionPacketRef,
            selectedBoundaryNode.resourcePacketRef,
            selectedBoundaryNode.nodeReadinessStateRef,
          ].filter((ref) => typeof ref === "string" && ref.trim())
        : [],
      currentNodeIds: selectedBoundaryNode ? [selectedBoundaryNode.nodeId] : [],
      replayContinuationMode: status === "succeeded" ? "run_node" : "repair_boundary",
      replaySafetyStatus: "safe_to_replay",
      reasonCodes: ["after_resource_materialization_worker_smoke_checkpoint_recorded"],
    });
    await writeJson("product-spec-boundary-replay-artifact-index.json", {
      artifactKind: "product_spec_boundary_replay_artifact_index",
      generatedAt: new Date().toISOString(),
      artifacts: [preflightArtifact, resultArtifact, proofPreflightArtifact, proofArtifact],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    });
    await runtime.runtimeJobs.attachArtifact({
      jobId: runtimeJobId,
      artifactType: "execution_platform.product_spec_replay_proof_resource_materialization",
      storageKind: "metadata",
      uri: `runtime-job://${runtimeJobId}/product-spec-replay-proof-resource-materialization/worker-smoke/${boundary}/${Date.now()}`,
      contentType: "application/json",
      metadata: compactBoundaryReplayResultMetadata(summary, proofArtifact),
    });
    process.stdout.write(
      `${JSON.stringify({
        event: "product_spec_boundary_replay_result",
        status,
        runtimeJobId,
        sourceGraphId: graphId,
        graphId: replayGraphId,
        boundary,
        iterations: 0,
        addedNodeIds: [],
        executedNodeIds: selectedBoundaryNode ? [selectedBoundaryNode.nodeId] : [],
        reasonCodes: summary.schedulerResult.reasonCodes,
        inspectedNodeCount: inspection.inspectedNodeCount,
        executableNodeCount: inspection.executableNodeCount,
        blockedNodeCount: inspection.blockedNodeCount,
        artifactIndexPath:
          ".artifacts/execution-platform/product-spec-boundary-replay-artifact-index.json",
        proofArtifactPath:
          ".artifacts/execution-platform/product-spec-replay-proof-resource-materialization/proof.json",
      })}\n`,
    );
    if (status !== "succeeded") {
      process.exitCode = 1;
    }
    return;
  }
  if (isAfterResourceMaterialization && !executeWorkers) {
    const inspection = await inspectAfterResourceMaterializationFrontier({
      runtime,
      artifacts: await runtime.runtimeJobs.listArtifacts(runtimeJobId),
      snapshot: replayStartSnapshot,
      runtimeJobId,
      graphId: replayGraphId,
      workflowId: replayStartSnapshot.graph.workflowId,
      maxParallelNodeExecutions,
      targetNodeIds,
    });
    const status =
      inspection.inspectedNodeCount > 0 && inspection.blockedNodeCount === 0
        ? "succeeded"
        : "needs_review";
    selectedBoundaryNodes.push(
      ...inspection.inspections.map((inspectionNode) => ({
        nodeId: inspectionNode.nodeId,
        nodeKind: inspectionNode.nodeKind,
        nodeExecutionPacketRef: inspectionNode.nodeExecutionPacketRef,
        resourcePacketRef: inspectionNode.resourcePacketRef,
        nodeReadinessStateRef: inspectionNode.nodeReadinessStateRef,
        nodeReadinessStatus: inspectionNode.nodeReadinessStatus,
        executable: inspectionNode.executable,
      })),
    );
    selectedBoundaryNode = selectedBoundaryNodes[0] ?? null;
    await emitReplayState({
      runtime,
      runtimeJobId,
      event: "after_resource_materialization_boundary_inspected",
      graphId: replayGraphId,
      boundary,
      phase: "after_resource_materialization",
      status,
      details: {
        activeNodeIds: inspection.inspections.map((item) => item.nodeId),
        readyNodeExecutionPacketCount: inspection.executableNodeCount,
        blockedNodeCount: inspection.blockedNodeCount,
        payloadRefs: inspection.inspections.flatMap((item) => item.payloadRefs).slice(0, 80),
        blockers: inspection.inspections.flatMap((item) => item.blockers).slice(0, 40),
        nextLegalTransition: status === "succeeded" ? "execute_node" : "needs_review",
        proofGateStatus: status,
      },
    });
    const summary = {
      artifactKind: "product_spec_boundary_replay_result",
      generatedAt: new Date().toISOString(),
      status,
      runtimeJobId,
      sourceGraphId: graphId,
      graphId: replayGraphId,
      replayGraphCreated: false,
      boundary,
      maxParallelNodeExecutions,
      executeWorkers: false,
      schedulerResult: {
        status,
        iterations: 0,
        addedNodeIds: [],
        executedNodeIds: [],
        selectedNodeId: selectedBoundaryNode?.nodeId ?? null,
        reasonCodes: [
          "boundary_replay_after_resource_materialization_inspected_existing_frontier",
          `boundary_replay_after_resource_materialization_inspected_node_count:${inspection.inspectedNodeCount}`,
          `boundary_replay_after_resource_materialization_executable_node_count:${inspection.executableNodeCount}`,
          `boundary_replay_after_resource_materialization_blocked_node_count:${inspection.blockedNodeCount}`,
        ],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      },
      selectedBoundaryNode,
      selectedBoundaryNodes,
      materializationInspection: inspection,
      beforeGraph: preflight.snapshot,
      afterGraph: summarizeSnapshot(replayStartSnapshot),
      sourceGraphUnchanged: true,
      progressEventCount: progressEvents.length,
      latestProgressEvents: progressEvents.slice(-20),
      preflightArtifact,
      proofPreflightArtifact,
      routerRerun: false,
      missionLedgerRerun: false,
      commitmentPacketAuthorRerun: false,
      contextScoutRerun: false,
      resourceMaterializationRerun: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    };
    const resultArtifact = await writeJson("product-spec-boundary-replay-result.json", summary);
    const proofArtifact = await writeProofJson("proof.json", summary);
    await runtime.runtimeWorkGraphs.recordCheckpoint({
      graphId: replayGraphId,
      checkpointId: `${replayGraphId}:after-resource-materialization`,
      checkpointKind: "after_resource_materialization",
      stateSummary: `After resource materialization replay inspected ${inspection.inspectedNodeCount} node(s), ${inspection.executableNodeCount} executable.`,
      artifactRefs: [proofArtifact.path, resultArtifact.path].slice(0, 8),
    });
    await recordCanonicalBoundaryReplayCheckpoint({
      runtime,
      runtimeJobId,
      graphId: replayGraphId,
      workflowId: replayStartSnapshot.graph.workflowId,
      checkpointKind: "after_resource_materialization",
      acceptedArtifactRefs: [proofArtifact.path, resultArtifact.path],
      upstreamArtifactRefs: inspection.inspections.flatMap((item) =>
        [item.nodeExecutionPacketRef, item.resourcePacketRef, item.nodeReadinessStateRef].filter(
          (ref) => typeof ref === "string" && ref.trim(),
        ),
      ),
      currentNodeIds: inspection.inspections.map((item) => item.nodeId),
      replayContinuationMode: status === "succeeded" ? "run_node" : "repair_boundary",
      replaySafetyStatus: "safe_to_replay",
      reasonCodes: ["after_resource_materialization_inspection_checkpoint_recorded"],
    });
    await writeJson("product-spec-boundary-replay-artifact-index.json", {
      artifactKind: "product_spec_boundary_replay_artifact_index",
      generatedAt: new Date().toISOString(),
      artifacts: [preflightArtifact, resultArtifact, proofPreflightArtifact, proofArtifact],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    });
    await runtime.runtimeJobs.attachArtifact({
      jobId: runtimeJobId,
      artifactType: "execution_platform.product_spec_replay_proof_resource_materialization",
      storageKind: "metadata",
      uri: `runtime-job://${runtimeJobId}/product-spec-replay-proof-resource-materialization/proof/${boundary}/${Date.now()}`,
      contentType: "application/json",
      metadata: compactBoundaryReplayResultMetadata(summary, proofArtifact),
    });
    process.stdout.write(
      `${JSON.stringify({
        event: "product_spec_boundary_replay_result",
        status,
        runtimeJobId,
        sourceGraphId: graphId,
        graphId: replayGraphId,
        boundary,
        iterations: 0,
        addedNodeIds: [],
        executedNodeIds: [],
        reasonCodes: summary.schedulerResult.reasonCodes,
        inspectedNodeCount: inspection.inspectedNodeCount,
        executableNodeCount: inspection.executableNodeCount,
        blockedNodeCount: inspection.blockedNodeCount,
        artifactIndexPath:
          ".artifacts/execution-platform/product-spec-boundary-replay-artifact-index.json",
        proofArtifactPath:
          ".artifacts/execution-platform/product-spec-replay-proof-resource-materialization/proof.json",
      })}\n`,
    );
    if (status !== "succeeded") {
      process.exitCode = 1;
    }
    return;
  }

  if (isAfterGraphSelection || isBeforeResourceMaterialization) {
    const existingReadyMaterializedFrontier = replayStartSnapshot.nodes
      .filter((node) => {
        const metadata = jsonRecord(node.metadata);
        return (
          (targetNodeIds.size === 0 || targetNodeIds.has(node.nodeId)) &&
          node.nodeStatus === "planned" &&
          nodeKindRequiresImplementationContext(node.nodeKind) &&
          typeof metadata.nodeExecutionPacketRef === "string" &&
          typeof metadata.resourcePacketRef === "string" &&
          typeof metadata.nodeReadinessStateRef === "string" &&
          (metadata.nodeReadinessStatus === "ready" ||
            metadata.nodeReadinessStatus === "ready_with_limitations")
        );
      })
      .slice(0, maxParallelNodeExecutions);
    const existingReadyMaterializedFrontierInspection =
      existingReadyMaterializedFrontier.length > 0
        ? await inspectAfterResourceMaterializationFrontier({
            runtime,
            artifacts,
            snapshot: {
              ...replayStartSnapshot,
              nodes: existingReadyMaterializedFrontier,
            },
            runtimeJobId,
            graphId: replayGraphId,
            workflowId: replayStartSnapshot.graph.workflowId,
            maxParallelNodeExecutions,
            targetNodeIds,
          })
        : null;
    const plannedImplementationFrontier = replayStartSnapshot.nodes
      .filter((node) => {
        const metadata = jsonRecord(node.metadata);
        const restartableStatus = isBeforeResourceMaterialization
          ? ["planned", "needs_review", "failed"].includes(node.nodeStatus)
          : node.nodeStatus === "planned";
        return (
          restartableStatus &&
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
      const materialized = await materializeReplayImplementationResources({
        runtime,
        runtimeJobId,
        graphId: replayGraphId,
        workflowId: replayStartSnapshot.graph.workflowId,
        node,
        objective,
        repoScopeRefs,
        validationCommandRefs,
        contextSupplySummary,
        boundary,
      });
      if (!materialized) {
        continue;
      }
      const readyPackets = materialized.readyMaterializedPackets.map(
        ({ taskPacket, materialized }) => ({
          nodeId: materialized.nodeExecutionPacket.nodeId,
          implementationTaskPacketRef: taskPacket.packetRef,
          nodeExecutionPacketRef: materialized.nodeExecutionPacket.packetRef,
          resourcePacketRef: materialized.codingResourcePacket.packetRef,
          nodeReadinessStateRef: materialized.readiness.state.stateRef,
          nodeReadinessStatus: materialized.readiness.state.readinessStatus,
          nodeReadinessPhase: materialized.readiness.state.phase,
          targetFileRefs: taskPacket.targetFileRefs.slice(0, 20),
          targetFileSnapshotRefs: taskPacket.targetFileSnapshots
            .map((snapshot) => snapshot.snapshotRef)
            .slice(0, 20),
        }),
      );
      materializationResults.push({
        sourceNodeId: node.nodeId,
        sourceNodeKind: node.nodeKind,
        implementationContextPacketRef: materialized.implementationContextCompile.packet.packetRef,
        implementationContextReadinessStatus:
          materialized.implementationContextCompile.packet.readinessStatus,
        implementationContextRepairAction: materialized.implementationContextCompile.repairAction,
        blockerSummary: materialized.implementationContextCompile.blockerSummary,
        implementationTaskPacketCount:
          materialized.implementationContextCompile.implementationTaskPackets.length,
        nodeExecutionPacketCount: materialized.materializedPackets.length,
        readyNodeExecutionPacketCount: readyPackets.length,
        readyPackets,
        reasonCodes: materialized.implementationContextCompile.reasonCodes.slice(0, 40),
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      });
      selectedBoundaryNodes.push(
        ...readyPackets.map((packet) => ({
          nodeId: packet.nodeId,
          nodeKind: node.nodeKind,
          assignedRole: node.assignedRole ?? null,
          capabilityId:
            node.metadata && typeof node.metadata === "object"
              ? (node.metadata.capabilityId ?? null)
              : null,
          implementationContextPacketRef:
            materialized.implementationContextCompile.packet.packetRef,
          nodeExecutionPacketRef: packet.nodeExecutionPacketRef,
          nodeReadinessStateRef: packet.nodeReadinessStateRef,
          nodeReadinessStatus: packet.nodeReadinessStatus,
          targetFileRefs: packet.targetFileRefs,
        })),
      );
    }
    selectedBoundaryNode = selectedBoundaryNodes[0] ?? null;
    if (
      selectedBoundaryNodes.length === 0 &&
      existingReadyMaterializedFrontierInspection &&
      existingReadyMaterializedFrontierInspection.executableNodeCount > 0
    ) {
      selectedBoundaryNodes.push(
        ...existingReadyMaterializedFrontierInspection.inspections
          .filter((inspection) => inspection.executable)
          .map((inspection) => {
            const node = existingReadyMaterializedFrontier.find(
              (candidate) => candidate.nodeId === inspection.nodeId,
            );
            const metadata = jsonRecord(node?.metadata);
            return {
              nodeId: inspection.nodeId,
              nodeKind: node?.nodeKind ?? null,
              assignedRole: node?.assignedRole ?? null,
              capabilityId:
                typeof metadata.capabilityId === "string" ? metadata.capabilityId : null,
              implementationContextPacketRef: inspection.implementationContextPacketRef,
              implementationTaskPacketRef:
                typeof metadata.implementationTaskPacketRef === "string"
                  ? metadata.implementationTaskPacketRef
                  : null,
              nodeExecutionPacketRef: inspection.nodeExecutionPacketRef,
              resourcePacketRef: inspection.resourcePacketRef,
              nodeReadinessStateRef: inspection.nodeReadinessStateRef,
              nodeReadinessStatus: inspection.nodeReadinessStatus,
              targetFileRefs: metadataStringArray(metadata, "targetRefs").slice(0, 20),
            };
          }),
      );
      selectedBoundaryNode = selectedBoundaryNodes[0] ?? null;
    }
    const readyNodeExecutionPacketCount = materializationResults.reduce(
      (count, result) => count + result.readyNodeExecutionPacketCount,
      0,
    );
    const existingReadyNodeExecutionPacketCount =
      existingReadyMaterializedFrontierInspection?.executableNodeCount ?? 0;
    const existingReadyBlockedNodeCount =
      existingReadyMaterializedFrontierInspection?.blockedNodeCount ?? 0;
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
        (materializationResults.length > 0 || existingReadyNodeExecutionPacketCount > 0) &&
        readyNodeExecutionPacketCount + existingReadyNodeExecutionPacketCount > 0 &&
        blockedSourceNodeCount === preciseBlockedSourceNodeCount
          ? "succeeded"
          : "needs_review",
      iterations: 0,
      addedNodeIds: selectedBoundaryNodes.map((node) => node.nodeId),
      executedNodeIds: [],
      selectedNodeId: selectedBoundaryNode?.nodeId ?? null,
      reasonCodes: [
        isSplitRequiredMaterializationBoundary
          ? "boundary_replay_split_required_materialization_compiled_frontier"
          : isBeforeResourceMaterialization
            ? "boundary_replay_before_resource_materialization_compiled_frontier"
            : "boundary_replay_after_graph_selection_materialized_existing_frontier",
        `boundary_replay_planned_implementation_frontier_count:${plannedImplementationFrontier.length}`,
        `boundary_replay_existing_ready_materialized_frontier_count:${existingReadyNodeExecutionPacketCount}`,
        ...(existingReadyBlockedNodeCount > 0
          ? [
              `boundary_replay_existing_ready_materialized_frontier_blocked_count:${existingReadyBlockedNodeCount}`,
            ]
          : []),
        `boundary_replay_resource_materialization_result_count:${materializationResults.length}`,
        `boundary_replay_ready_node_execution_packet_count:${readyNodeExecutionPacketCount}`,
        ...(blockedSourceNodeCount > 0
          ? [`boundary_replay_blocked_source_node_count:${blockedSourceNodeCount}`]
          : []),
        ...(preciseBlockedSourceNodeCount > 0
          ? [`boundary_replay_precise_non_worker_blocker_count:${preciseBlockedSourceNodeCount}`]
          : []),
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
      event: isBeforeResourceMaterialization
        ? isSplitRequiredMaterializationBoundary
          ? "before_split_required_materialization_boundary_completed"
          : "before_resource_materialization_boundary_completed"
        : "after_graph_selection_resource_materialization_completed",
      graphId: replayGraphId,
      boundary,
      phase: "resource_materialization",
      status: schedulerResult.status,
      details: {
        activeNodeIds: [
          ...materializationResults.map((result) => result.sourceNodeId),
          ...(existingReadyMaterializedFrontierInspection?.inspections ?? []).map(
            (inspection) => inspection.nodeId,
          ),
        ].slice(0, 80),
        readyNodeExecutionPacketCount,
        existingReadyNodeExecutionPacketCount,
        existingReadyBlockedNodeCount,
        blockedSourceNodeCount,
        preciseBlockedSourceNodeCount,
        payloadRefs: selectedBoundaryNodes
          .flatMap((node) => [node.nodeExecutionPacketRef, node.resourcePacketRef])
          .filter(Boolean)
          .slice(0, 80),
        blockers: materializationResults
          .map((result) => result.blockerSummary)
          .concat(
            (existingReadyMaterializedFrontierInspection?.inspections ?? [])
              .filter((inspection) => !inspection.executable)
              .flatMap((inspection) => inspection.blockers ?? []),
          )
          .filter((value) => typeof value === "string" && value.trim())
          .slice(0, 40),
        nextLegalTransition:
          readyNodeExecutionPacketCount + existingReadyNodeExecutionPacketCount > 0
            ? "after_resource_materialization"
            : "needs_review",
        proofGateStatus: schedulerResult.status,
      },
    });
    const summary = {
      artifactKind: "product_spec_boundary_replay_result",
      generatedAt: new Date().toISOString(),
      status: schedulerResult.status,
      runtimeJobId,
      sourceGraphId: graphId,
      graphId: replayGraphId,
      replayGraphCreated: isAfterParallelContext,
      boundary,
      maxParallelNodeExecutions,
      executeWorkers: false,
      schedulerResult,
      selectedBoundaryNode,
      selectedBoundaryNodes,
      materializationResults,
      existingReadyMaterializedFrontierInspection,
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
    const resultArtifact = await writeJson("product-spec-boundary-replay-result.json", summary);
    const proofArtifact = await writeProofJson("proof.json", summary);
    const checkpointBoundaryName = isBeforeResourceMaterialization
      ? isSplitRequiredMaterializationBoundary
        ? "before-split-required-materialization"
        : "before-resource-materialization"
      : "after-graph-selection-resource-materialization";
    await runtime.runtimeWorkGraphs.recordCheckpoint({
      graphId: replayGraphId,
      checkpointId: `${replayGraphId}:${checkpointBoundaryName}`,
      checkpointKind: isBeforeResourceMaterialization
        ? isSplitRequiredMaterializationBoundary
          ? "before_split_required_materialization"
          : "before_resource_materialization"
        : "after_graph_selection_resource_materialization",
      stateSummary: `Resource materialization replay compiled ${materializationResults.length} source node(s), ${readyNodeExecutionPacketCount} ready packet(s).`,
      artifactRefs: [proofArtifact.path, resultArtifact.path].slice(0, 8),
    });
    await recordCanonicalBoundaryReplayCheckpoint({
      runtime,
      runtimeJobId,
      graphId: replayGraphId,
      workflowId: replayStartSnapshot.graph.workflowId,
      checkpointKind: isBeforeResourceMaterialization
        ? "before_resource_materialization"
        : "after_resource_materialization",
      acceptedArtifactRefs: [proofArtifact.path, resultArtifact.path],
      upstreamArtifactRefs: materializationResults.flatMap((item) =>
        [
          item?.implementationContextPacketRef,
          item?.nodeExecutionPacketRef,
          item?.resourcePacketRef,
          item?.nodeReadinessStateRef,
        ].filter((ref) => typeof ref === "string" && ref.trim()),
      ),
      currentNodeIds: materializationResults
        .map((item) => (typeof item?.nodeId === "string" ? item.nodeId : null))
        .filter((nodeId) => typeof nodeId === "string" && nodeId.trim()),
      replayContinuationMode: readyNodeExecutionPacketCount > 0 ? "run_node" : "repair_boundary",
      replaySafetyStatus: "safe_to_replay",
      reasonCodes: [
        isBeforeResourceMaterialization
          ? "before_resource_materialization_checkpoint_recorded"
          : "after_resource_materialization_checkpoint_recorded",
      ],
    });
    await writeJson("product-spec-boundary-replay-artifact-index.json", {
      artifactKind: "product_spec_boundary_replay_artifact_index",
      generatedAt: new Date().toISOString(),
      artifacts: [preflightArtifact, resultArtifact, proofPreflightArtifact, proofArtifact],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    });
    await runtime.runtimeJobs.attachArtifact({
      jobId: runtimeJobId,
      artifactType: "execution_platform.product_spec_replay_proof_resource_materialization",
      storageKind: "metadata",
      uri: `runtime-job://${runtimeJobId}/product-spec-replay-proof-resource-materialization/proof/${boundary}/${Date.now()}`,
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
          ".artifacts/execution-platform/product-spec-replay-proof-resource-materialization/proof.json",
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
  const sourceFinalSnapshot = isAfterParallelContext
    ? await runtime.runtimeWorkGraphs.readGraphSnapshot(graphId)
    : finalSnapshot;
  const summary = {
    artifactKind: "product_spec_boundary_replay_result",
    generatedAt: new Date().toISOString(),
    status: schedulerResult.status,
    runtimeJobId,
    sourceGraphId: graphId,
    graphId: replayGraphId,
    replayGraphCreated: isAfterParallelContext,
    boundary,
    maxParallelNodeExecutions,
    executeWorkers,
    schedulerResult,
    selectedBoundaryNode,
    selectedBoundaryNodes,
    beforeGraph: preflight.snapshot,
    afterGraph: finalSnapshot ? summarizeSnapshot(finalSnapshot) : null,
    sourceGraphUnchanged:
      isAfterParallelContext && sourceFinalSnapshot
        ? sourceFinalSnapshot.nodes.length === sourceSnapshot.nodes.length &&
          sourceFinalSnapshot.edges.length === sourceSnapshot.edges.length &&
          sourceFinalSnapshot.graph.graphStatus === sourceSnapshot.graph.graphStatus
        : null,
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
  const resultArtifact = await writeJson("product-spec-boundary-replay-result.json", summary);
  const proofArtifact = await writeProofJson("proof.json", summary);
  await writeJson("product-spec-boundary-replay-artifact-index.json", {
    artifactKind: "product_spec_boundary_replay_artifact_index",
    generatedAt: new Date().toISOString(),
    artifacts: [preflightArtifact, resultArtifact, proofPreflightArtifact, proofArtifact],
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
    artifactType: "execution_platform.product_spec_replay_proof_resource_materialization",
    storageKind: "metadata",
    uri: `runtime-job://${runtimeJobId}/product-spec-replay-proof-resource-materialization/proof/${boundary}/${Date.now()}`,
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
});
