#!/usr/bin/env node
import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import {
  buildImplementationTaskPacket,
  buildAgentTeamCodingWorkflowPlugin,
  CodexDynamicJsonClient,
  CONTEXT_SYNTHESIS_ARTIFACT_TYPE,
  DEFAULT_DYNAMIC_ORCHESTRATOR_MODEL_REF,
  DEFAULT_DYNAMIC_ORCHESTRATOR_PROVIDER_PATH,
  ModelAgnosticFileEditWorkerAdapter,
  NonCodexToolUsingWorkerLoop,
  OpenRouterAgentTeamModelClient,
  buildContextSynthesisInputManifest,
  contextSynthesisGroupGuidanceArray,
  normalizeContextSynthesisArtifact,
  requireCanonicalWorkflowDefinition,
  RuntimeWorkGraphScheduler,
  runtimeNodeCapabilityManifestForModel,
  summarizeContextSynthesisForGraphCompile,
  summarizeContextSynthesisInputManifestForArtifact,
  summarizeContextSynthesisArtifact,
  validateContextSynthesisArtifact,
} from "../extensions/execution-platform/runtime-api.js";
import { loadConfig } from "../src/config/config.ts";
import { getExecutionPlatformRuntime } from "../src/gateway/execution-platform-http.ts";

const ARTIFACT_DIR = ".artifacts/execution-platform";
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
  return [
    "after-context",
    "after-parallel-context",
    "after-context-synthesis",
    "after-graph-selection",
  ].includes(boundary);
}

function boundaryStopsBeforeWorkerExecution(boundary, node, { executeWorkers = false } = {}) {
  if (executeWorkers && boundary === "after-graph-selection") {
    return false;
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
    return "boundary_replay_first_post_synthesis_executable_node_selected";
  }
  if (boundary === "after-context-synthesis") {
    return "boundary_replay_post_synthesis_graph_frontier_selected";
  }
  if (boundary === "after-graph-selection") {
    return "boundary_replay_accepted_graph_frontier_selected";
  }
  return "boundary_replay_first_executable_node_selected";
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

function packetsFromArtifacts(artifacts) {
  return artifacts
    .filter((artifact) => artifact.artifactType === "execution_platform.commitment_work_packet")
    .map((artifact) => metadataOf(artifact).commitmentWorkPacket)
    .filter((packet) => packet && typeof packet === "object" && !Array.isArray(packet))
    .toSorted((left, right) =>
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
      implementationBlocked: result?.implementationBlocked === true,
      reasonCodes: Array.isArray(result?.reasonCodes) ? result.reasonCodes.slice(0, 12) : [],
    })),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

function contextSupplySummaryFromContextHandoffArtifacts(artifacts, packets) {
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
  const commitmentResults = packets.slice(0, 80).map((packet, index) => {
    const handoff = handoffForPacket(packet);
    const handoffMetadata = metadataOf(handoff);
    const handoffRef = typeof handoff?.uri === "string" ? handoff.uri : null;
    const toolLoop = toolLoopForHandoff(handoffRef);
    const toolLoopMetadata = metadataOf(toolLoop);
    const relevantFileRefs = stringArray(
      handoffMetadata.relevantFileRefs ?? toolLoopMetadata.verifiedFileRefs,
    );
    const status = handoffRef ? "accepted" : "missing";
    return {
      commitmentId: packet.commitmentId ?? null,
      nodeId:
        typeof handoffMetadata.nodeId === "string"
          ? handoffMetadata.nodeId
          : `handoff-artifact-context-${index + 1}`,
      status,
      packetRef: packet.packetRef ?? null,
      contextHandoffPacketRef: handoffRef,
      contextScoutToolLoopRef: typeof toolLoop?.uri === "string" ? toolLoop.uri : null,
      verifiedFileRefs: relevantFileRefs.slice(0, 12),
      implementationBlocked: !handoffRef,
      reasonCodes: handoffRef
        ? ["context_supply_reconstructed_from_context_handoff_artifact"]
        : ["context_supply_handoff_artifact_missing"],
    };
  });
  const acceptedCount = commitmentResults.filter((result) => result.status === "accepted").length;
  const failedCount = commitmentResults.length - acceptedCount;
  return {
    aggregateContextSupplyRef: null,
    status:
      failedCount === 0 && commitmentResults.length === packets.length
        ? "succeeded"
        : "needs_review",
    packetCount: packets.length,
    acceptedCount,
    needsReviewCount: failedCount,
    failedCount: 0,
    commitmentResults,
    reconstructedFromContextHandoffArtifacts: true,
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
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    },
  });
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
    await runtime.runtimeWorkGraphs.addNode({
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
  }
  return replayGraphId;
}

function createBoundaryReplayImplementationExecutor({
  runtime,
  runtimeJobId,
  graphId,
  objective,
  repoScopeRefs,
  validationCommandRefs,
  contextSupplySummary,
  orchestrator,
  boundary,
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
        };
      } catch (error) {
        return {
          validationRef: `validation://boundary-replay/failed/${sha256(`${trimmed}:${error?.message ?? ""}`).slice(0, 16)}`,
          status: "failed",
          summary: `Validation failed in ${Date.now() - started}ms: ${String(error?.message ?? error).slice(0, 500)}`,
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
      const targetRefs = repoFileRefs(stringArray(metadata.targetRefs), 12);
      const allowedRefs = repoFileRefs([...targetRefs, ...repoScopeRefs], 80);
      const contextRefs = [
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
        },
      });
      const exactObjective =
        typeof metadata.exactObjective === "string" && metadata.exactObjective.trim()
          ? metadata.exactObjective
          : typeof metadata.expectedOutput === "string" && metadata.expectedOutput.trim()
            ? metadata.expectedOutput
            : objective.slice(0, 1_200);
      const taskPacket = buildImplementationTaskPacket({
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
          validationRefs: adapterResult.validationRefs.slice(0, 20),
          runtimeToolInvocationRefs: adapterResult.runtimeToolInvocationRefs.slice(0, 30),
          reasonCodes: adapterResult.reasonCodes.slice(0, 30),
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
        reasonCodes: adapterResult.reasonCodes.slice(0, 40),
        metadata: {
          workerResultRef: outputRef,
          outputArtifactRefCount: adapterResult.artifactRefs.length + 1,
          outputArtifactRefsTruncated:
            outputArtifactRefs.length < adapterResult.artifactRefs.length + 1,
          evidenceClaimRefs: evidenceClaimRefs.slice(0, 20),
          runtimeToolInvocationRefs: adapterResult.runtimeToolInvocationRefs.slice(0, 30),
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
          validationRefs: adapterResult.validationRefs.slice(0, 20),
          reasonCodes: adapterResult.reasonCodes.slice(0, 20),
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
            "When recentNodeResultSummaries contains a context_synthesis result, treat its contextSynthesis metadata as the authoritative handoff for downstream graph planning. Use the implementationGroups, dependencyMap, parallelismPlan, recommendedCapabilityIds, targetRefs, successCriteria, workerFitRationale, risks, and limitations to build the next implementation/validation/review/readback/closeout graph. Do not ignore this handoff and collapse back to one broad implementation node unless the synthesis itself says the work is unsplittable and you explain why cheaper/scoped workers are insufficient.",
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
  const executeWorkers = boolFlag("--execute-workers", false);
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
    const resettableNodes = sourceSnapshot.nodes.filter(
      (node) =>
        resetNodeIdSet.has(node.nodeId) &&
        ["running", "needs_review", "failed"].includes(node.nodeStatus),
    );
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
  const packets = packetsFromArtifacts(artifacts);
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
  );
  const contextSupplySummary = acceptedParallelContextSupply(
    parallelContextSupplyMetadata,
    packets.length,
  )
    ? parallelContextSupplySummary(parallelContextSupplyMetadata)
    : reconstructedContextSupplySummary;
  const contextStatus = metadataOf(contextToolLoop).sufficiencyStatus;
  const contextVerifiedCount = Array.isArray(metadataOf(contextToolLoop).verifiedFileRefs)
    ? metadataOf(contextToolLoop).verifiedFileRefs.length
    : 0;
  const isAfterParallelContext = boundary === "after-parallel-context";
  const isAfterContextSynthesis = boundary === "after-context-synthesis";
  const isAfterGraphSelection = boundary === "after-graph-selection";
  if ((isAfterContextSynthesis || isAfterGraphSelection) && !graphIdFlag) {
    throw new Error(`graph_id_required_for_boundary:${boundary}`);
  }
  const requiresAcceptedParallelContext =
    boundary === "after-context" || isAfterParallelContext || isAfterContextSynthesis;
  if (
    requiresAcceptedParallelContext &&
    !acceptedParallelContextSupply(contextSupplySummary, packets.length)
  ) {
    const summary = {
      artifactKind: "product_spec_boundary_replay_result",
      generatedAt: new Date().toISOString(),
      status: "needs_review",
      runtimeJobId,
      graphId,
      boundary,
      reasonCodes: ["accepted_parallel_context_supply_required_before_after_context_replay"],
      packetCount: packets.length,
      parallelContextSupply: contextSupplySummary,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    };
    await writeJson("product-spec-boundary-replay-result.json", summary);
    process.stdout.write(
      `${JSON.stringify({ event: "product_spec_boundary_replay_result", ...summary })}\n`,
    );
    process.exitCode = 1;
    return;
  }

  if (isAfterContextSynthesis || isAfterGraphSelection) {
    const hasAcceptedContextSynthesis = sourceSnapshot.nodes.some(
      (node) => node.nodeKind === "context_synthesis" && node.nodeStatus === "succeeded",
    );
    const hasPlannedExecutableNode = sourceSnapshot.nodes.some(
      (node) => node.nodeKind !== "context_synthesis" && node.nodeStatus === "planned",
    );
    const reasonCodes = [];
    if (!hasAcceptedContextSynthesis) {
      reasonCodes.push(
        `accepted_context_synthesis_required_before_${boundary.replaceAll("-", "_")}_replay`,
      );
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
        plannedExecutableNodeCount: sourceSnapshot.nodes.filter(
          (node) => node.nodeKind !== "context_synthesis" && node.nodeStatus === "planned",
        ).length,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      };
      await writeJson("product-spec-boundary-replay-result.json", summary);
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
    capabilityRegistrySummary: plugin.schedulerOptions.capabilityRegistrySummary,
    capabilityManifest: plugin.schedulerOptions.capabilityManifest,
    orchestrator,
    executors,
    missionLedger,
    commitmentWorkPackets: packets,
    maxIterations,
    maxParallelNodeExecutions,
    beforeNodeExecution: async ({ node }) => {
      if (boundaryStopsBeforeWorkerExecution(boundary, node, { executeWorkers })) {
        const selected = {
          nodeId: node.nodeId,
          nodeKind: node.nodeKind,
          assignedRole: node.assignedRole ?? null,
          capabilityId:
            node.metadata && typeof node.metadata === "object"
              ? (node.metadata.capabilityId ?? null)
              : null,
        };
        selectedBoundaryNode ??= selected;
        selectedBoundaryNodes.push(selected);
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
  await writeJson("product-spec-boundary-replay-artifact-index.json", {
    artifactKind: "product_spec_boundary_replay_artifact_index",
    generatedAt: new Date().toISOString(),
    artifacts: [preflightArtifact, resultArtifact],
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
