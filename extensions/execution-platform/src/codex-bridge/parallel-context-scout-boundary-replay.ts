import { createHash } from "node:crypto";
import type {
  JsonValue,
  RuntimeJob,
  RuntimeJobArtifact,
  RuntimeJobRepository,
} from "../runtime-job-repository.ts";
import type { RuntimeToolKernel } from "../runtime-tool-call/runtime-tool-kernel.ts";
import {
  CommitmentWorkPacketSchema,
  type CommitmentWorkPacket,
} from "../workflows/mission-work-packets.ts";
import type { RuntimeWorkGraphRepository } from "../workflows/runtime-work-graph-repository.ts";
import type { TeamGraphNode, TeamRunGraph } from "../workflows/runtime-work-graph.ts";
import type { SourcePromptContextIndex } from "../workflows/source-prompt-context.ts";
import { resolveCodingTeamObjectiveScope } from "./coding-team-objective-scope.ts";
import {
  runContextScoutNodeExecutor,
  type ContextScoutNodeExecutorResult,
} from "./context-scout-node-executor.ts";
import type { AgentTeamModelClient } from "./live-agent-team-runner.ts";

export type ParallelContextScoutCommitmentResult = {
  commitmentId: string;
  nodeId: string;
  packetRef: string;
  status: "succeeded" | "needs_review" | "failed";
  contextHandoffPacketRef: string | null;
  contextScoutToolLoopRef: string | null;
  verifiedFileRefs: string[];
  rejectedRefs: string[];
  codeIntelligenceResultRefs: string[];
  codeIntelligenceRuntimeToolInvocationRefs: string[];
  codeIntelligenceSymbolRefs: string[];
  codeIntelligenceDiagnosticRefs: string[];
  codeIntelligenceRelatedTestRefs: string[];
  codeIntelligenceImpactRefs: string[];
  codeIntelligenceSemanticModes: string[];
  codeIntelligenceLimitations: string[];
  codeIntelligenceBackendIds: string[];
  codeIntelligenceBackendHealthRefs: string[];
  codeIntelligenceWorkspaceSnapshotRefs: string[];
  codeIntelligenceFallbackReasonCodes: string[];
  codeIntelligenceDiagnosticVersionRefs: string[];
  codeIntelligenceProjectConfigRefs: string[];
  codeIntelligenceBackendLatencyMs: number | null;
  codeIntelligenceResultCounts: Record<string, number>;
  implementationBlocked: boolean;
  reasonCodes: string[];
  missingInformation: string[];
  repairInstructions: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
};

export type ParallelContextScoutBoundaryReplayResult = {
  artifactKind: "parallel_context_scout_boundary_replay_result";
  status: "succeeded" | "needs_review" | "failed";
  sourceRuntimeJobId: string;
  graphId: string | null;
  packetCount: number;
  acceptedCount: number;
  acceptedWithLimitationsCount: number;
  needsReviewCount: number;
  failedCount: number;
  concurrency: number;
  synthesisBarrierNodeId: string | null;
  contextSupplyEdgeRefs: string[];
  synthesisReady: boolean;
  synthesisBlockedReasonCodes: string[];
  commitmentResults: ParallelContextScoutCommitmentResult[];
  aggregateContextSupplyRef: string | null;
  artifactRefs: string[];
  reasonCodes: string[];
  promptOrJobReplayUsed: false;
  runtimeJobCreated: false;
  routerRerun: false;
  missionLedgerRerun: false;
  commitmentPacketAuthorRerun: false;
  schedulerDecompositionRerun: false;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawDbRowsStored: false;
  workQueueLifecycleMutated: false;
};

export type ParallelContextScoutBoundaryReplayInput = {
  runtimeJobs: RuntimeJobRepository;
  runtimeWorkGraphs: RuntimeWorkGraphRepository;
  runtimeToolKernel?: RuntimeToolKernel | null;
  runtimeJobId: string;
  graphId?: string | null;
  repoRoot: string;
  roleModelClient?: AgentTeamModelClient | null;
  modelId?: string;
  modelCandidateId?: string;
  concurrency?: number;
  maxRuntimeMs?: number;
  onProgress?: (event: {
    stage: "commitment_start" | "commitment_result";
    runtimeJobId: string;
    graphId: string;
    commitmentId: string;
    nodeId: string;
    status?: "succeeded" | "needs_review" | "failed";
    verifiedFileRefCount?: number;
    implementationBlocked?: boolean;
    reasonCodes: string[];
  }) => void | Promise<void>;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringArray(value: unknown, max = 24): string[] {
  return Array.isArray(value)
    ? [
        ...new Set(
          value.filter(
            (item): item is string => typeof item === "string" && item.trim().length > 0,
          ),
        ),
      ].slice(0, max)
    : [];
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function latestArtifact(
  artifacts: RuntimeJobArtifact[],
  artifactType: string,
): RuntimeJobArtifact | null {
  return artifacts.findLast((artifact) => artifact.artifactType === artifactType) ?? null;
}

function findGraphId(
  artifacts: RuntimeJobArtifact[],
  explicitGraphId?: string | null,
): string | null {
  if (explicitGraphId?.trim()) {
    return explicitGraphId.trim();
  }
  return (
    artifacts
      .map((artifact) => stringValue(asRecord(artifact.metadata).graphId))
      .find((graphId): graphId is string => Boolean(graphId)) ?? null
  );
}

function commitmentPacketsFromValue(value: unknown): CommitmentWorkPacket[] {
  const raw = Array.isArray(value) ? value : [];
  return raw
    .map((item) => CommitmentWorkPacketSchema.safeParse(item))
    .filter((result): result is { success: true; data: CommitmentWorkPacket } => result.success)
    .map((result) => result.data);
}

function loadCommitmentPackets(artifacts: RuntimeJobArtifact[]): CommitmentWorkPacket[] {
  const packetArtifact = latestArtifact(artifacts, "execution_platform.commitment_work_packets");
  const packetMetadata = asRecord(packetArtifact?.metadata);
  const directPackets = commitmentPacketsFromValue(packetMetadata.commitmentWorkPackets);
  if (directPackets.length > 0) {
    return directPackets;
  }
  return artifacts
    .filter((artifact) => artifact.artifactType === "execution_platform.commitment_work_packet")
    .map((artifact) => {
      const metadata = asRecord(artifact.metadata);
      const parsed = CommitmentWorkPacketSchema.safeParse(metadata.commitmentWorkPacket);
      return parsed.success ? parsed.data : null;
    })
    .filter((packet): packet is CommitmentWorkPacket => Boolean(packet))
    .toSorted((left, right) => left.commitmentId.localeCompare(right.commitmentId));
}

function coerceSourcePromptIndex(
  artifact: RuntimeJobArtifact | null,
): SourcePromptContextIndex | null {
  if (!artifact) {
    return null;
  }
  const metadata = asRecord(artifact.metadata);
  return {
    artifactKind: "source_prompt_context_index",
    schemaVersion: "execution-platform.source-prompt-context-index.v1",
    promptHash: stringValue(metadata.promptHash) ?? "missing",
    promptLength: typeof metadata.promptLength === "number" ? metadata.promptLength : 0,
    resolutionStatus:
      metadata.resolutionStatus === "resolved" ||
      metadata.resolutionStatus === "unresolved" ||
      metadata.resolutionStatus === "unsupported" ||
      metadata.resolutionStatus === "not_present"
        ? metadata.resolutionStatus
        : "unresolved",
    reasonCodes: stringArray(metadata.reasonCodes, 24),
    sections: Array.isArray(metadata.sections)
      ? metadata.sections
          .map((section, index) => {
            const value = asRecord(section);
            return {
              sectionId: stringValue(value.sectionId) ?? `section-${index + 1}`,
              sectionRef: stringValue(value.sectionRef) ?? `source-prompt://missing/${index + 1}`,
              startOffset: typeof value.startOffset === "number" ? value.startOffset : 0,
              endOffset: typeof value.endOffset === "number" ? value.endOffset : 0,
              charLength: typeof value.charLength === "number" ? value.charLength : 0,
              heading: stringValue(value.heading),
              boundedSummary: stringValue(value.boundedSummary) ?? "Bounded source prompt section.",
              rawPromptStored: false as const,
            };
          })
          .slice(0, 80)
      : [],
    contextSnapshotRefs: [],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

function objectiveSummaryFor(input: { job: RuntimeJob; artifacts: RuntimeJobArtifact[] }): string {
  const missionLedgerArtifact = latestArtifact(
    input.artifacts,
    "execution_platform.mission_contract_ledger",
  );
  const missionMetadata = asRecord(missionLedgerArtifact?.metadata);
  return (
    stringValue(missionMetadata.ownerObjectiveSummary) ??
    stringValue(asRecord(input.job.payload).objective) ??
    "Parallel context scout boundary replay objective."
  );
}

function contextScoutNodeId(packet: CommitmentWorkPacket, index: number): string {
  return `context_scout-${packet.commitmentId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.:-]+/g, "-")
    .slice(0, 72)}-${digest({ packetRef: packet.packetRef, index }).slice(0, 8)}`;
}

async function getOrCreateContextScoutNode(input: {
  graphs: RuntimeWorkGraphRepository;
  graph: TeamRunGraph;
  existingNodes: TeamGraphNode[];
  runtimeJobId: string;
  packet: CommitmentWorkPacket;
  index: number;
}): Promise<TeamGraphNode> {
  const nodeId = contextScoutNodeId(input.packet, input.index);
  const existing = input.existingNodes.find((node) => node.nodeId === nodeId);
  if (existing) {
    return existing;
  }
  return input.graphs.addNode({
    nodeId,
    graphId: input.graph.graphId,
    nodeKind: "context_scout",
    assignedRole: "context_scout",
    modelOrWorkerRef: "worker.non-codex.context-scout",
    runtimeJobId: input.runtimeJobId,
    inputHandoffRefs: [input.packet.packetRef],
    nodeStatus: "planned",
    metadata: {
      capabilityId: "context_scout",
      commitmentIdsAdvanced: [input.packet.commitmentId],
      exactObjective: input.packet.contextScoutObjective,
      expectedOutput: input.packet.expectedContextScoutOutput.join(" "),
      acceptanceCriteria: input.packet.expectedContextScoutOutput,
      downstreamConsumer: "implementation_and_validation",
      targetRefs: input.packet.likelyRepoAreas,
      packetRef: input.packet.packetRef,
      parallelContextScoutBoundaryReplay: true,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    },
  });
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = Array.from<R | undefined>({ length: items.length });
  let cursor = 0;
  const workers = Array.from(
    { length: Math.max(1, Math.min(concurrency, items.length)) },
    async () => {
      for (;;) {
        const index = cursor;
        cursor += 1;
        if (index >= items.length) {
          return;
        }
        results[index] = await mapper(items[index]!, index);
      }
    },
  );
  await Promise.all(workers);
  return results as R[];
}

function commitmentResult(input: {
  packet: CommitmentWorkPacket;
  nodeId: string;
  executorResult: ContextScoutNodeExecutorResult | null;
  errorReasonCode?: string | null;
}): ParallelContextScoutCommitmentResult {
  const loopRun = input.executorResult?.contextScoutToolLoopRun;
  return {
    commitmentId: input.packet.commitmentId,
    nodeId: input.nodeId,
    packetRef: input.packet.packetRef,
    status: input.executorResult?.status ?? "failed",
    contextHandoffPacketRef: input.executorResult?.contextHandoffPacketRef ?? null,
    contextScoutToolLoopRef: input.executorResult?.contextScoutToolLoopRef ?? null,
    verifiedFileRefs: input.executorResult?.verifiedFileRefs ?? [],
    rejectedRefs: input.executorResult?.rejectedRefs ?? [],
    codeIntelligenceResultRefs: input.executorResult?.codeIntelligenceResultRefs ?? [],
    codeIntelligenceRuntimeToolInvocationRefs:
      input.executorResult?.codeIntelligenceRuntimeToolInvocationRefs ?? [],
    codeIntelligenceSymbolRefs: input.executorResult?.codeIntelligenceSymbolRefs ?? [],
    codeIntelligenceDiagnosticRefs: input.executorResult?.codeIntelligenceDiagnosticRefs ?? [],
    codeIntelligenceRelatedTestRefs: input.executorResult?.codeIntelligenceRelatedTestRefs ?? [],
    codeIntelligenceImpactRefs: input.executorResult?.codeIntelligenceImpactRefs ?? [],
    codeIntelligenceSemanticModes: input.executorResult?.codeIntelligenceSemanticModes ?? [],
    codeIntelligenceLimitations: input.executorResult?.codeIntelligenceLimitations ?? [],
    codeIntelligenceBackendIds: input.executorResult?.codeIntelligenceBackendIds ?? [],
    codeIntelligenceBackendHealthRefs:
      input.executorResult?.codeIntelligenceBackendHealthRefs ?? [],
    codeIntelligenceWorkspaceSnapshotRefs:
      input.executorResult?.codeIntelligenceWorkspaceSnapshotRefs ?? [],
    codeIntelligenceFallbackReasonCodes:
      input.executorResult?.codeIntelligenceFallbackReasonCodes ?? [],
    codeIntelligenceDiagnosticVersionRefs:
      input.executorResult?.codeIntelligenceDiagnosticVersionRefs ?? [],
    codeIntelligenceProjectConfigRefs:
      input.executorResult?.codeIntelligenceProjectConfigRefs ?? [],
    codeIntelligenceBackendLatencyMs:
      input.executorResult?.codeIntelligenceBackendLatencyMs ?? null,
    codeIntelligenceResultCounts: input.executorResult?.codeIntelligenceResultCounts ?? {},
    implementationBlocked: input.executorResult?.implementationBlocked ?? true,
    reasonCodes: [
      ...(input.executorResult?.reasonCodes ?? []),
      ...(input.errorReasonCode ? [input.errorReasonCode] : []),
    ].slice(0, 40),
    missingInformation: loopRun?.sufficiencyReview.missingInformation ?? [],
    repairInstructions: loopRun?.sufficiencyReview.repairInstructions ?? [],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

export function summarizeParallelContextScoutResults(input: {
  runtimeJobId: string;
  graphId: string | null;
  concurrency: number;
  commitmentResults: ParallelContextScoutCommitmentResult[];
  synthesisBarrierNodeId?: string | null;
  contextSupplyEdgeRefs?: string[];
  synthesisReady?: boolean;
  synthesisBlockedReasonCodes?: string[];
}): ParallelContextScoutBoundaryReplayResult {
  const acceptedCount = input.commitmentResults.filter(
    (result) => result.status === "succeeded",
  ).length;
  const acceptedWithLimitationsCount = input.commitmentResults.filter((result) =>
    result.reasonCodes.includes("context_scout_accepted_with_limitations"),
  ).length;
  const failedCount = input.commitmentResults.filter((result) => result.status === "failed").length;
  const needsReviewCount = input.commitmentResults.filter(
    (result) => result.status === "needs_review",
  ).length;
  const status =
    input.commitmentResults.length === 0 || failedCount > 0
      ? "failed"
      : needsReviewCount > 0
        ? "needs_review"
        : "succeeded";
  return {
    artifactKind: "parallel_context_scout_boundary_replay_result",
    status,
    sourceRuntimeJobId: input.runtimeJobId,
    graphId: input.graphId,
    packetCount: input.commitmentResults.length,
    acceptedCount,
    acceptedWithLimitationsCount,
    needsReviewCount,
    failedCount,
    concurrency: input.concurrency,
    synthesisBarrierNodeId: input.synthesisBarrierNodeId ?? null,
    contextSupplyEdgeRefs: input.contextSupplyEdgeRefs ?? [],
    synthesisReady: input.synthesisReady ?? false,
    synthesisBlockedReasonCodes: input.synthesisBlockedReasonCodes ?? [],
    commitmentResults: input.commitmentResults,
    aggregateContextSupplyRef: null,
    artifactRefs: [],
    reasonCodes: [
      status === "succeeded"
        ? "parallel_context_scout_boundary_replay_succeeded"
        : status === "needs_review"
          ? "parallel_context_scout_boundary_replay_needs_review"
          : "parallel_context_scout_boundary_replay_failed",
    ],
    promptOrJobReplayUsed: false,
    runtimeJobCreated: false,
    routerRerun: false,
    missionLedgerRerun: false,
    commitmentPacketAuthorRerun: false,
    schedulerDecompositionRerun: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawDbRowsStored: false,
    workQueueLifecycleMutated: false,
  };
}

export async function runParallelContextScoutBoundaryReplay(
  input: ParallelContextScoutBoundaryReplayInput,
): Promise<ParallelContextScoutBoundaryReplayResult> {
  const job = await input.runtimeJobs.getJob(input.runtimeJobId);
  if (!job) {
    return summarizeParallelContextScoutResults({
      runtimeJobId: input.runtimeJobId,
      graphId: input.graphId ?? null,
      concurrency: input.concurrency ?? 1,
      commitmentResults: [],
    });
  }
  const artifacts = await input.runtimeJobs.listArtifacts(job.jobId);
  const graphId = findGraphId(artifacts, input.graphId);
  const snapshot = graphId ? await input.runtimeWorkGraphs.readGraphSnapshot(graphId) : null;
  const packets = loadCommitmentPackets(artifacts);
  if (!graphId || !snapshot || packets.length === 0) {
    return {
      ...summarizeParallelContextScoutResults({
        runtimeJobId: job.jobId,
        graphId,
        concurrency: input.concurrency ?? 1,
        commitmentResults: [],
      }),
      reasonCodes: [
        !graphId
          ? "parallel_context_scout_graph_missing"
          : !snapshot
            ? "parallel_context_scout_graph_snapshot_missing"
            : "parallel_context_scout_commitment_packets_missing",
      ],
    };
  }

  const objectiveSummary = objectiveSummaryFor({ job, artifacts });
  const objectiveScope = resolveCodingTeamObjectiveScope({
    objectiveForModel: objectiveSummary,
    objectiveForEvidence: objectiveSummary,
    fallbackRepoScopePaths: [
      "extensions/execution-platform/src/",
      "src/gateway/",
      "scripts/",
      "docs/projects/execution-platform/",
    ],
    fallbackValidationCommands: [
      "pnpm test:file extensions/execution-platform/src/workflows/context-scout-tool-loop.test.ts",
    ],
  });
  const sourcePromptIndex = coerceSourcePromptIndex(
    latestArtifact(artifacts, "execution_platform.source_prompt_context_index"),
  );
  const concurrency = Math.max(1, Math.min(input.concurrency ?? 6, packets.length));
  const mutableNodes = [...snapshot.nodes];
  const commitmentResults = await mapWithConcurrency(
    packets,
    concurrency,
    async (packet, index) => {
      const node = await getOrCreateContextScoutNode({
        graphs: input.runtimeWorkGraphs,
        graph: snapshot.graph,
        existingNodes: mutableNodes,
        runtimeJobId: job.jobId,
        packet,
        index,
      });
      mutableNodes.push(node);
      await input.runtimeWorkGraphs.updateNodeStatus({
        nodeId: node.nodeId,
        nodeStatus: "running",
      });
      await input.onProgress?.({
        stage: "commitment_start",
        runtimeJobId: job.jobId,
        graphId,
        commitmentId: packet.commitmentId,
        nodeId: node.nodeId,
        reasonCodes: ["parallel_context_scout_commitment_started"],
      });
      try {
        const executorResult = await runContextScoutNodeExecutor({
          runtimeJobs: input.runtimeJobs,
          runtimeToolKernel: input.runtimeToolKernel,
          runtimeJob: job,
          sourceRuntimeJobId: job.jobId,
          graph: snapshot.graph,
          node,
          repoRoot: input.repoRoot,
          approvedRepoScopePaths: [
            ...new Set([...objectiveScope.approvedRepoScopePaths, ...packet.likelyRepoAreas]),
          ],
          validationCommandRefs: objectiveScope.approvedValidationCommands,
          objectiveSummary,
          commitmentWorkPackets: [packet],
          sourcePromptContextIndex: sourcePromptIndex,
          roleModelClient: input.roleModelClient,
          modelId: input.modelId,
          modelCandidateId: input.modelCandidateId,
          timeoutMs: input.maxRuntimeMs,
        });
        await input.runtimeWorkGraphs.updateNodeStatus({
          nodeId: node.nodeId,
          nodeStatus:
            executorResult.status === "succeeded"
              ? "succeeded"
              : executorResult.status === "needs_review"
                ? "needs_review"
                : "failed",
          outputArtifactRefs: executorResult.artifactRefs,
        });
        const result = commitmentResult({ packet, nodeId: node.nodeId, executorResult });
        await input.onProgress?.({
          stage: "commitment_result",
          runtimeJobId: job.jobId,
          graphId,
          commitmentId: packet.commitmentId,
          nodeId: node.nodeId,
          status: result.status,
          verifiedFileRefCount: result.verifiedFileRefs.length,
          implementationBlocked: result.implementationBlocked,
          reasonCodes: result.reasonCodes.slice(0, 12),
        });
        return result;
      } catch {
        await input.runtimeWorkGraphs.updateNodeStatus({
          nodeId: node.nodeId,
          nodeStatus: "failed",
        });
        const result = commitmentResult({
          packet,
          nodeId: node.nodeId,
          executorResult: null,
          errorReasonCode: "parallel_context_scout_executor_threw",
        });
        await input.onProgress?.({
          stage: "commitment_result",
          runtimeJobId: job.jobId,
          graphId,
          commitmentId: packet.commitmentId,
          nodeId: node.nodeId,
          status: result.status,
          verifiedFileRefCount: 0,
          implementationBlocked: true,
          reasonCodes: result.reasonCodes.slice(0, 12),
        });
        return result;
      }
    },
  );

  const aggregate = summarizeParallelContextScoutResults({
    runtimeJobId: job.jobId,
    graphId,
    concurrency,
    commitmentResults,
  });
  const aggregateRef = `runtime-job://${job.jobId}/parallel-context-scout-boundary-replay/${digest({
    graphId,
    commitmentResults: commitmentResults.map((result) => ({
      commitmentId: result.commitmentId,
      status: result.status,
      verifiedFileRefs: result.verifiedFileRefs,
    })),
  }).slice(0, 16)}`;
  await input.runtimeJobs.attachArtifact({
    jobId: job.jobId,
    artifactType: "execution_platform.parallel_context_scout_boundary_replay",
    storageKind: "metadata",
    uri: aggregateRef,
    contentType: "application/json",
    metadata: {
      ...aggregate,
      aggregateContextSupplyRef: aggregateRef,
      synthesisBarrierNodeId: null,
      contextSupplyEdgeRefs: [],
      synthesisReady: false,
      synthesisBlockedReasonCodes: [],
      schedulerFirstContextSupply: true,
      contextSynthesisDefaultDisabled: true,
    } as unknown as JsonValue,
  });
  return {
    ...aggregate,
    aggregateContextSupplyRef: aggregateRef,
    artifactRefs: [
      aggregateRef,
      ...commitmentResults.flatMap((result) => [
        ...(result.contextScoutToolLoopRef ? [result.contextScoutToolLoopRef] : []),
        ...(result.contextHandoffPacketRef ? [result.contextHandoffPacketRef] : []),
      ]),
    ].slice(0, 120),
  };
}
