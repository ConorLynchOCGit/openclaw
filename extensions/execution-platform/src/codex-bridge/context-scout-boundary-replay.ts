import type {
  JsonValue,
  RuntimeJobArtifact,
  RuntimeJobRepository,
} from "../runtime-job-repository.ts";
import type { RuntimeToolKernel } from "../runtime-tool-call/runtime-tool-kernel.ts";
import {
  CommitmentWorkPacketSchema,
  type CommitmentWorkPacket,
} from "../workflows/mission-work-packets.ts";
import type { RuntimeWorkGraphRepository } from "../workflows/runtime-work-graph-repository.ts";
import type { TeamGraphNode } from "../workflows/runtime-work-graph.ts";
import type { SourcePromptContextIndex } from "../workflows/source-prompt-context.ts";
import { resolveCodingTeamObjectiveScope } from "./coding-team-objective-scope.ts";
import {
  runContextScoutNodeExecutor,
  type ContextScoutNodeExecutorResult,
} from "./context-scout-node-executor.ts";
import type { AgentTeamModelClient } from "./live-agent-team-runner.ts";

export type ContextScoutBoundaryReplayResult = {
  artifactKind: "context_scout_boundary_replay_result";
  status: "succeeded" | "needs_review" | "failed";
  sourceRuntimeJobId: string;
  graphId: string | null;
  nodeId: string | null;
  missionLedgerRef: string | null;
  commitmentWorkPacketRef: string | null;
  sourcePromptContextRef: string | null;
  contextScoutExecutorResult: ContextScoutNodeExecutorResult | null;
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

export type ContextScoutBoundaryReplayInput = {
  runtimeJobs: RuntimeJobRepository;
  runtimeWorkGraphs: RuntimeWorkGraphRepository;
  runtimeToolKernel?: RuntimeToolKernel | null;
  runtimeJobId: string;
  graphId?: string | null;
  nodeId?: string | null;
  repoRoot: string;
  roleModelClient?: AgentTeamModelClient | null;
  modelId?: string;
  modelCandidateId?: string;
  maxRuntimeMs?: number;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
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
    reasonCodes: Array.isArray(metadata.reasonCodes)
      ? metadata.reasonCodes.filter((item): item is string => typeof item === "string").slice(0, 24)
      : [],
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

function commitmentPacketsFromValue(value: unknown): CommitmentWorkPacket[] {
  const raw = Array.isArray(value) ? value : [];
  return raw
    .map((item) => CommitmentWorkPacketSchema.safeParse(item))
    .filter((result): result is { success: true; data: CommitmentWorkPacket } => result.success)
    .map((result) => result.data);
}

async function loadCommitmentPackets(input: {
  runtimeJobs: RuntimeJobRepository;
  artifacts: RuntimeJobArtifact[];
}): Promise<{
  artifact: RuntimeJobArtifact | null;
  packets: CommitmentWorkPacket[];
}> {
  const packetArtifact = latestArtifact(
    input.artifacts,
    "execution_platform.commitment_work_packets",
  );
  const packetMetadata = asRecord(packetArtifact?.metadata);
  const directPackets = commitmentPacketsFromValue(packetMetadata.commitmentWorkPackets);
  if (directPackets.length > 0) {
    return { artifact: packetArtifact, packets: directPackets };
  }
  const packetArtifactRows = input.artifacts.filter(
    (artifact) => artifact.artifactType === "execution_platform.commitment_work_packet",
  );
  const packetArtifacts = (
    await Promise.all(
      packetArtifactRows.map(async (artifact) => {
        const hydrated = await input.runtimeJobs.hydrateRuntimeArtifactByContract(artifact);
        const parsed = CommitmentWorkPacketSchema.safeParse(hydrated.body);
        return parsed.success ? parsed.data : null;
      }),
    )
  )
    .filter((packet): packet is CommitmentWorkPacket => Boolean(packet))
    .toSorted((left, right) => left.commitmentId.localeCompare(right.commitmentId));
  if (packetArtifacts.length > 0) {
    return {
      artifact:
        packetArtifact ??
        latestArtifact(input.artifacts, "execution_platform.commitment_work_packet"),
      packets: packetArtifacts,
    };
  }
  const progressPackets = input.artifacts
    .filter((artifact) => artifact.artifactType === "agent_team.scheduler_progress")
    .flatMap((artifact) => {
      const metadata = asRecord(artifact.metadata);
      return [
        commitmentPacketsFromValue(metadata.commitmentWorkPackets),
        commitmentPacketsFromValue(asRecord(metadata.packetAuthorFanout).commitmentWorkPackets),
        commitmentPacketsFromValue(asRecord(metadata.commitmentWorkPacketManifest).packets),
      ];
    })
    .findLast((packets) => packets.length > 0);
  return { artifact: packetArtifact, packets: progressPackets ?? [] };
}

function contextScoutNode(input: {
  nodes: TeamGraphNode[];
  nodeId?: string | null;
}): TeamGraphNode | null {
  if (input.nodeId?.trim()) {
    return input.nodes.find((node) => node.nodeId === input.nodeId?.trim()) ?? null;
  }
  return input.nodes.findLast((node) => node.nodeKind === "context_scout") ?? null;
}

function result(
  input: Omit<ContextScoutBoundaryReplayResult, "artifactKind">,
): ContextScoutBoundaryReplayResult {
  return {
    artifactKind: "context_scout_boundary_replay_result",
    ...input,
  };
}

function compactStringArray(value: string[], maxItems = 40): string[] {
  return [...new Set(value.filter((item) => item.trim().length > 0))]
    .map((item) => item.slice(0, 300))
    .slice(0, maxItems);
}

function compactContextScoutExecutorResultForArtifact(
  executorResult: ContextScoutNodeExecutorResult | null,
): JsonValue | null {
  if (!executorResult) {
    return null;
  }
  const sufficiencyReview = asRecord(executorResult.contextScoutToolLoopRun?.sufficiencyReview);
  return {
    status: executorResult.status,
    runtimeJobId: executorResult.runtimeJobId,
    graphId: executorResult.graphId,
    nodeId: executorResult.nodeId,
    roleId: executorResult.roleId,
    sourceRuntimeJobId: executorResult.sourceRuntimeJobId ?? null,
    contextHandoffPacketRef: executorResult.contextHandoffPacketRef,
    contextScoutToolLoopRef: executorResult.contextScoutToolLoopRef,
    verifiedFileRefs: compactStringArray(executorResult.verifiedFileRefs),
    rejectedRefs: compactStringArray(executorResult.rejectedRefs),
    runtimeToolInvocationRefs: compactStringArray(executorResult.runtimeToolInvocationRefs, 80),
    codeIntelligenceResultRefs: compactStringArray(executorResult.codeIntelligenceResultRefs, 80),
    codeIntelligenceRuntimeToolInvocationRefs: compactStringArray(
      executorResult.codeIntelligenceRuntimeToolInvocationRefs,
      80,
    ),
    codeIntelligenceSymbolRefs: compactStringArray(executorResult.codeIntelligenceSymbolRefs, 80),
    codeIntelligenceDiagnosticRefs: compactStringArray(
      executorResult.codeIntelligenceDiagnosticRefs,
      80,
    ),
    codeIntelligenceRelatedTestRefs: compactStringArray(
      executorResult.codeIntelligenceRelatedTestRefs,
      80,
    ),
    codeIntelligenceImpactRefs: compactStringArray(executorResult.codeIntelligenceImpactRefs, 80),
    codeIntelligenceSemanticModes: compactStringArray(
      executorResult.codeIntelligenceSemanticModes,
      8,
    ),
    codeIntelligenceLimitations: compactStringArray(executorResult.codeIntelligenceLimitations, 16),
    codeIntelligenceBackendIds: compactStringArray(executorResult.codeIntelligenceBackendIds, 8),
    codeIntelligenceBackendHealthRefs: compactStringArray(
      executorResult.codeIntelligenceBackendHealthRefs,
      24,
    ),
    codeIntelligenceWorkspaceSnapshotRefs: compactStringArray(
      executorResult.codeIntelligenceWorkspaceSnapshotRefs,
      24,
    ),
    codeIntelligenceFallbackReasonCodes: compactStringArray(
      executorResult.codeIntelligenceFallbackReasonCodes,
      24,
    ),
    codeIntelligenceDiagnosticVersionRefs: compactStringArray(
      executorResult.codeIntelligenceDiagnosticVersionRefs,
      24,
    ),
    codeIntelligenceProjectConfigRefs: compactStringArray(
      executorResult.codeIntelligenceProjectConfigRefs,
      24,
    ),
    codeIntelligenceBackendLatencyMs: executorResult.codeIntelligenceBackendLatencyMs,
    codeIntelligenceResultCounts: executorResult.codeIntelligenceResultCounts as JsonValue,
    contextScoutSufficiencyReview: {
      status: stringValue(sufficiencyReview.status),
      reviewerSummary: stringValue(sufficiencyReview.reviewerSummary)?.slice(0, 1_200) ?? null,
      missingInformation: compactStringArray(
        stringArrayValue(sufficiencyReview.missingInformation),
      ),
      repairInstructions: compactStringArray(
        stringArrayValue(sufficiencyReview.repairInstructions),
      ),
      sufficientForImplementation:
        typeof sufficiencyReview.sufficientForImplementation === "boolean"
          ? sufficiencyReview.sufficientForImplementation
          : null,
    },
    artifactRefs: compactStringArray(executorResult.artifactRefs, 40),
    reasonCodes: compactStringArray(executorResult.reasonCodes, 60),
    implementationBlocked: executorResult.implementationBlocked,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    workQueueLifecycleMutated: false,
    compactedForArtifactStorage: true,
  } satisfies JsonValue;
}

function stringArrayValue(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function compactReplayResultForArtifact(replayResult: ContextScoutBoundaryReplayResult): JsonValue {
  return {
    ...replayResult,
    contextScoutExecutorResult: compactContextScoutExecutorResultForArtifact(
      replayResult.contextScoutExecutorResult,
    ),
    artifactRefs: compactStringArray(replayResult.artifactRefs, 60),
    reasonCodes: compactStringArray(replayResult.reasonCodes, 60),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawDbRowsStored: false,
    compactedForArtifactStorage: true,
  } satisfies JsonValue;
}

export async function runContextScoutBoundaryReplay(
  input: ContextScoutBoundaryReplayInput,
): Promise<ContextScoutBoundaryReplayResult> {
  const job = await input.runtimeJobs.getJob(input.runtimeJobId);
  if (!job) {
    return result({
      status: "failed",
      sourceRuntimeJobId: input.runtimeJobId,
      graphId: input.graphId ?? null,
      nodeId: input.nodeId ?? null,
      missionLedgerRef: null,
      commitmentWorkPacketRef: null,
      sourcePromptContextRef: null,
      contextScoutExecutorResult: null,
      artifactRefs: [],
      reasonCodes: ["context_boundary_replay_source_job_missing"],
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
    });
  }
  const artifacts = await input.runtimeJobs.listArtifacts(job.jobId);
  const graphId = findGraphId(artifacts, input.graphId);
  if (!graphId) {
    return result({
      status: "failed",
      sourceRuntimeJobId: job.jobId,
      graphId: null,
      nodeId: input.nodeId ?? null,
      missionLedgerRef:
        latestArtifact(artifacts, "execution_platform.mission_contract_ledger")?.uri ?? null,
      commitmentWorkPacketRef:
        latestArtifact(artifacts, "execution_platform.commitment_work_packets")?.uri ?? null,
      sourcePromptContextRef:
        latestArtifact(artifacts, "execution_platform.source_prompt_context_index")?.uri ?? null,
      contextScoutExecutorResult: null,
      artifactRefs: [],
      reasonCodes: ["context_boundary_replay_graph_missing"],
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
    });
  }
  const snapshot = await input.runtimeWorkGraphs.readGraphSnapshot(graphId);
  const node = snapshot ? contextScoutNode({ nodes: snapshot.nodes, nodeId: input.nodeId }) : null;
  const missionLedgerArtifact = latestArtifact(
    artifacts,
    "execution_platform.mission_contract_ledger",
  );
  const sourcePromptArtifact = latestArtifact(
    artifacts,
    "execution_platform.source_prompt_context_index",
  );
  const packetLoad = await loadCommitmentPackets({
    runtimeJobs: input.runtimeJobs,
    artifacts,
  });
  const sourcePromptIndex = coerceSourcePromptIndex(sourcePromptArtifact);
  if (!snapshot || !node) {
    const replayResult = result({
      status: "failed",
      sourceRuntimeJobId: job.jobId,
      graphId,
      nodeId: input.nodeId ?? null,
      missionLedgerRef: missionLedgerArtifact?.uri ?? null,
      commitmentWorkPacketRef: packetLoad.artifact?.uri ?? null,
      sourcePromptContextRef: sourcePromptArtifact?.uri ?? null,
      contextScoutExecutorResult: null,
      artifactRefs: [],
      reasonCodes: [
        snapshot
          ? "context_boundary_replay_context_scout_node_missing"
          : "context_boundary_replay_graph_snapshot_missing",
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
    });
    return replayResult;
  }
  const missionMetadata = asRecord(missionLedgerArtifact?.metadata);
  const objectiveSummary =
    stringValue(missionMetadata.ownerObjectiveSummary) ??
    stringValue(asRecord(job.payload).objective) ??
    "Context boundary replay objective.";
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
  const executorResult =
    packetLoad.packets.length > 0
      ? await runContextScoutNodeExecutor({
          runtimeJobs: input.runtimeJobs,
          runtimeToolKernel: input.runtimeToolKernel,
          runtimeJob: job,
          sourceRuntimeJobId: job.jobId,
          graph: snapshot.graph,
          node,
          repoRoot: input.repoRoot,
          approvedRepoScopePaths: objectiveScope.approvedRepoScopePaths,
          validationCommandRefs: objectiveScope.approvedValidationCommands,
          objectiveSummary,
          commitmentWorkPackets: packetLoad.packets,
          sourcePromptContextIndex: sourcePromptIndex,
          roleModelClient: input.roleModelClient,
          modelId: input.modelId,
          modelCandidateId: input.modelCandidateId,
          timeoutMs: input.maxRuntimeMs,
        })
      : null;
  const replayResult = result({
    status: executorResult
      ? executorResult.status
      : packetLoad.packets.length === 0
        ? "needs_review"
        : "failed",
    sourceRuntimeJobId: job.jobId,
    graphId,
    nodeId: node.nodeId,
    missionLedgerRef: missionLedgerArtifact?.uri ?? null,
    commitmentWorkPacketRef: packetLoad.artifact?.uri ?? null,
    sourcePromptContextRef: sourcePromptArtifact?.uri ?? null,
    contextScoutExecutorResult: executorResult,
    artifactRefs: executorResult?.artifactRefs ?? [],
    reasonCodes: [
      executorResult
        ? "context_boundary_replay_executor_completed"
        : "context_boundary_replay_commitment_packets_missing",
      ...(executorResult?.reasonCodes ?? []),
    ].slice(0, 60),
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
  });
  const replayRef = `runtime-job://${job.jobId}/context-scout-boundary-replay/${node.nodeId}`;
  await input.runtimeJobs.attachArtifact({
    jobId: job.jobId,
    artifactType: "execution_platform.context_scout_boundary_replay",
    storageKind: "metadata",
    uri: replayRef,
    contentType: "application/json",
    metadata: compactReplayResultForArtifact(replayResult),
  });
  if (executorResult) {
    await input.runtimeWorkGraphs.updateNodeStatus({
      nodeId: node.nodeId,
      nodeStatus:
        executorResult.status === "succeeded"
          ? "succeeded"
          : executorResult.status === "needs_review"
            ? "needs_review"
            : "failed",
      outputArtifactRefs: [...executorResult.artifactRefs, replayRef].slice(0, 80),
      metadataPatch: {
        lastResultStatus: executorResult.status,
        lastStatusReasonCodes: replayResult.reasonCodes.slice(0, 60),
        contextScoutBoundaryReplayRef: replayRef,
        contextHandoffPacketRef: executorResult.contextHandoffPacketRef,
        contextScoutToolLoopRef: executorResult.contextScoutToolLoopRef,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      },
    });
  }
  return {
    ...replayResult,
    artifactRefs: [...replayResult.artifactRefs, replayRef],
  };
}
