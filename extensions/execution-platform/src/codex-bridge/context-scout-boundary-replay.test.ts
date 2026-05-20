import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { RuntimeToolKernel } from "../runtime-tool-call/runtime-tool-kernel.ts";
import { RuntimeToolRegistry } from "../runtime-tool-call/runtime-tool-registry.ts";
import { RuntimeToolTraceRepository } from "../runtime-tool-call/runtime-tool-trace-repository.ts";
import {
  buildContextScoutToolLoopRun,
  buildContextScoutVerifiedFileRefs,
} from "../workflows/context-scout-tool-loop.ts";
import { buildContextHandoffPacket } from "../workflows/mission-work-packets.ts";
import { RuntimeWorkGraphRepository } from "../workflows/runtime-work-graph-repository.ts";
import { registerSchedulerRuntimeTools } from "../workflows/scheduler-runtime-tools.ts";
import { runContextScoutBoundaryReplay } from "./context-scout-boundary-replay.ts";
import { discoverContextScoutRepoCandidateFileRefs } from "./context-scout-node-executor.ts";

function acceptedPacket(input: {
  packetId: string;
  packetRef: string;
  missionId: string;
  commitmentId: string;
  fileRef: string;
}) {
  return {
    packetKind: "commitment_work_packet" as const,
    schemaVersion: "execution-platform.commitment-work-packet.v1" as const,
    authoringSource: "model_authored" as const,
    qualityStatus: "accepted" as const,
    packetId: input.packetId,
    packetRef: input.packetRef,
    missionId: input.missionId,
    commitmentId: input.commitmentId,
    commitmentText: "Harden context scout replay.",
    commitmentMeaning: "Make replay exact at the context boundary.",
    ownerIntentSummary: "Boundary replay should not rerun prompt phases.",
    whyItMatters: "Avoid expensive prompt replay.",
    workerObjective: "Replay context scout only.",
    contextScoutObjective: "Inspect context scout files.",
    implementationObjective: "No implementation in this test.",
    validationObjective: "Focused replay test.",
    reviewObjective: "Review bounded evidence.",
    expectedEvidenceDescriptions: ["Context handoff packet"],
    expectedEvidenceKinds: ["context_handoff" as const],
    acceptanceCriteria: ["Handoff has verified refs"],
    remainingWork: ["Replay context boundary"],
    relevantConstraints: ["No raw storage"],
    explicitNonGoals: ["No prompt replay"],
    likelyRepoAreas: [input.fileRef],
    requiredContextQuestions: ["Which context scout files matter?"],
    allowedContextRequestHints: ["Use bounded repo index"],
    expectedContextScoutOutput: ["Verified files"],
    expectedImplementationOutput: ["Not applicable"],
    expectedValidationOutput: ["Focused test passes"],
    expectedReviewReadbackOutput: ["Bounded result"],
    requiredEvidenceClaimDescriptions: ["Context handoff"],
    stopIfMissing: ["verified refs"],
    packetQualityReviewRefs: [],
    uncertaintiesAndRisks: [],
    downstreamConsumer: "implementation_and_validation" as const,
    rawFileContentStored: false as const,
    rawPromptStored: false as const,
    rawResponseStored: false as const,
    rawProviderLogStored: false as const,
    rawToolLogStored: false as const,
    rawDbRowsStored: false as const,
  };
}

async function withReplayRepositories<T>(
  work: (input: {
    runtimeJobs: RuntimeJobRepository;
    graphs: RuntimeWorkGraphRepository;
    kernel: RuntimeToolKernel;
  }) => Promise<T>,
): Promise<T> {
  const database = await createExecutionPlatformPgMemTestDatabase();
  try {
    await applyExecutionPlatformMigrations(database.sql);
    const runtimeJobs = new RuntimeJobRepository(database.sql, {
      claimStrategy: "basic",
      now: () => new Date("2026-05-18T00:00:00.000Z"),
    });
    const graphs = new RuntimeWorkGraphRepository(database.sql, {
      now: () => new Date("2026-05-18T00:00:00.000Z"),
    });
    const registry = new RuntimeToolRegistry();
    registerSchedulerRuntimeTools({ registry });
    const kernel = new RuntimeToolKernel({
      registry,
      traces: new RuntimeToolTraceRepository(database.sql),
    });
    return await work({ runtimeJobs, graphs, kernel });
  } finally {
    await database.close();
  }
}

describe("context scout boundary replay", () => {
  it("uses bounded same-model retry for transient context scout no-content before failing the scout", async () => {
    const source = await readFile(
      path.join(
        process.cwd(),
        "extensions/execution-platform/src/codex-bridge/context-scout-node-executor.ts",
      ),
      "utf8",
    );

    expect(source).toContain("OPENCLAW_CONTEXT_SCOUT_MODEL_MAX_ATTEMPTS");
    expect(source).toContain("OPENCLAW_CONTEXT_SCOUT_MODEL_CALL_TIMEOUT_MS");
    expect(source).toContain("maxAttempts");
    expect(source).toContain("perAttemptTimeoutMs");
  });

  it("discovers structurally related files when packet target dirs do not exist yet", async () => {
    const candidates = await discoverContextScoutRepoCandidateFileRefs({
      repoRoot: process.cwd(),
      targetRefs: [
        "extensions/execution-platform/src/workflows/product-spec-planning/",
        "extensions/execution-platform/src/work-queue/product-spec-planning/",
      ],
      allowedFileRefs: [
        "extensions/execution-platform/src/workflows/",
        "extensions/execution-platform/src/work-queue/",
      ],
      maxFiles: 20,
    });

    expect(candidates.slice(0, 8)).toEqual(
      expect.arrayContaining([
        "extensions/execution-platform/src/workflows/product-spec-planning-workflow.ts",
        "extensions/execution-platform/src/work-queue/product-spec-planning-worker-contract.ts",
      ]),
    );
  });

  it("refuses to run without a prior graph and does not create a runtime job", async () => {
    await withReplayRepositories(async ({ runtimeJobs, graphs, kernel }) => {
      const job = await runtimeJobs.enqueueJob({
        jobId: "job-no-graph",
        jobType: "executor.agent_team",
        payload: { workflowId: "agent_team.coding", rawPromptStored: false },
      });

      const result = await runContextScoutBoundaryReplay({
        runtimeJobs,
        runtimeWorkGraphs: graphs,
        runtimeToolKernel: kernel,
        runtimeJobId: job.jobId,
        repoRoot: process.cwd(),
      });
      const jobs = await runtimeJobs.listRecentJobs({ limit: 10 });

      expect(result).toMatchObject({
        status: "failed",
        runtimeJobCreated: false,
        promptOrJobReplayUsed: false,
        routerRerun: false,
        missionLedgerRerun: false,
        commitmentPacketAuthorRerun: false,
        schedulerDecompositionRerun: false,
      });
      expect(result.reasonCodes).toContain("context_boundary_replay_graph_missing");
      expect(jobs.map((item) => item.jobId)).toEqual(["job-no-graph"]);
    });
  });

  it("refuses to run without a context scout node", async () => {
    await withReplayRepositories(async ({ runtimeJobs, graphs, kernel }) => {
      const job = await runtimeJobs.enqueueJob({
        jobId: "job-no-context-node",
        jobType: "executor.agent_team",
        payload: { workflowId: "agent_team.coding", rawPromptStored: false },
      });
      await graphs.createGraph({
        graphId: "graph-no-context-node",
        rootRuntimeJobId: job.jobId,
        workflowId: "agent_team.coding",
        orchestratorModelRef: "openai-codex/gpt-5.5",
      });
      await runtimeJobs.attachArtifact({
        jobId: job.jobId,
        artifactType: "agent_team.scheduler_progress",
        storageKind: "metadata",
        uri: "runtime-job://job-no-context-node/progress/graph",
        metadata: { graphId: "graph-no-context-node", rawPromptStored: false },
      });

      const result = await runContextScoutBoundaryReplay({
        runtimeJobs,
        runtimeWorkGraphs: graphs,
        runtimeToolKernel: kernel,
        runtimeJobId: job.jobId,
        repoRoot: process.cwd(),
      });

      expect(result.status).toBe("failed");
      expect(result.reasonCodes).toContain("context_boundary_replay_context_scout_node_missing");
    });
  });

  it("replays from persisted context scout boundary refs without rerunning upstream phases", async () => {
    await withReplayRepositories(async ({ runtimeJobs, graphs, kernel }) => {
      const fileRef = "extensions/execution-platform/src/workflows/context-scout-tool-loop.ts";
      const job = await runtimeJobs.enqueueJob({
        jobId: "job-context-boundary",
        jobType: "executor.agent_team",
        payload: { workflowId: "agent_team.coding", rawPromptStored: false },
      });
      const graph = await graphs.createGraph({
        graphId: "graph-context-boundary",
        rootRuntimeJobId: job.jobId,
        workflowId: "agent_team.coding",
        orchestratorModelRef: "openai-codex/gpt-5.5",
      });
      await graphs.addNode({
        graphId: graph.graphId,
        nodeId: "context-node",
        nodeKind: "context_scout",
        assignedRole: "context_scout",
        metadata: {
          commitmentIdsAdvanced: ["commitment-1"],
          targetRefs: [fileRef],
          exactObjective: "Inspect the context scout tool-loop implementation.",
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });
      await runtimeJobs.attachArtifact({
        jobId: job.jobId,
        artifactType: "agent_team.scheduler_progress",
        storageKind: "metadata",
        uri: "runtime-job://job-context-boundary/progress/graph",
        metadata: { graphId: graph.graphId, rawPromptStored: false },
      });
      await runtimeJobs.attachArtifact({
        jobId: job.jobId,
        artifactType: "execution_platform.mission_contract_ledger",
        storageKind: "metadata",
        uri: "runtime-job://job-context-boundary/mission-ledger",
        metadata: {
          missionId: "mission-1",
          ownerObjectiveSummary: "Harden context scout boundary replay.",
          graphId: graph.graphId,
          rawPromptStored: false,
        },
      });
      await runtimeJobs.attachArtifact({
        jobId: job.jobId,
        artifactType: "execution_platform.source_prompt_context_index",
        storageKind: "metadata",
        uri: "runtime-job://job-context-boundary/source-prompt-index",
        metadata: {
          artifactKind: "source_prompt_context_index",
          promptHash: "hash",
          promptLength: 100,
          resolutionStatus: "resolved",
          reasonCodes: ["resolved"],
          sections: [],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        },
      });
      const handoff = buildContextHandoffPacket({
        sourceNodeId: "context-node",
        targetCommitmentIds: ["commitment-1"],
        relevantFileRefs: [fileRef],
        handoffSummaryForImplementation:
          "Use the context scout tool loop for boundary replay verification.",
      });
      const verifiedFileRefs = buildContextScoutVerifiedFileRefs({
        runtimeJobId: job.jobId,
        nodeId: "context-node",
        fileRefs: [fileRef],
      });
      const packetRun = buildContextScoutToolLoopRun({
        runtimeJobId: job.jobId,
        graphId: graph.graphId,
        nodeId: "context-node",
        roleId: "context_scout",
        modelRef: "deepseek/deepseek-v4-pro",
        targetCommitmentIds: ["commitment-1"],
        commitmentWorkPacketRefs: ["packet://commitment-1"],
        requestedContextQuestions: ["Which context scout files matter?"],
        candidateFileRefs: [fileRef],
        verifiedFileRefs,
        contextHandoffPacketRef: "runtime-job://job-context-boundary/context-handoff/context-node",
        contextHandoffPacket: handoff,
        modelAuthoredSummary:
          "The context scout tool-loop file is enough for the bounded replay handoff.",
      });
      await runtimeJobs.attachArtifact({
        jobId: job.jobId,
        artifactType: "execution_platform.commitment_work_packets",
        storageKind: "metadata",
        uri: "runtime-job://job-context-boundary/commitment-work-packets",
        metadata: {
          commitmentWorkPackets: [
            acceptedPacket({
              packetId: "packet-1",
              packetRef: "packet://commitment-1",
              missionId: "mission-1",
              commitmentId: "commitment-1",
              fileRef,
            }),
          ],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        },
      });

      const result = await runContextScoutBoundaryReplay({
        runtimeJobs,
        runtimeWorkGraphs: graphs,
        runtimeToolKernel: kernel,
        runtimeJobId: job.jobId,
        repoRoot: process.cwd(),
        roleModelClient: {
          async callRole() {
            return {
              status: "succeeded",
              responseText: JSON.stringify({
                relevantFiles: [{ path: fileRef, whyRelevant: "Defines context scout loop." }],
                recommendedEditPoints: [
                  {
                    path: fileRef,
                    symbolOrRegion: "buildContextScoutToolLoopRun",
                    reason: "Replay uses this evidence contract.",
                  },
                ],
                existingPatterns: ["bounded refs only"],
                risks: ["do not replay prompt phases"],
                validationSuggestions: [
                  "pnpm test:file context-scout-boundary-replay.test.ts",
                  "Verify replay result reports no router, Mission Ledger, packet-author, or scheduler rerun.",
                ],
                handoffSummaryForImplementation:
                  "Context scout replay can proceed from verified tool-loop evidence. The downstream implementation worker should use the existing context scout tool-loop contract, keep packet and handoff refs bounded, and preserve the replay invariant that prompt routing, Mission Ledger, packet authoring, and scheduler decomposition are not rerun from this boundary.",
                confidence: 0.9,
                limitations: [],
              }),
              responseHash: "sha256:model-context",
            };
          },
        },
      });
      const jobs = await runtimeJobs.listRecentJobs({ limit: 10 });

      expect(result.status).toBe("succeeded");
      expect(result.contextScoutExecutorResult?.contextHandoffPacketRef).toContain(
        "runtime-job://job-context-boundary/context-handoff/",
      );
      expect(result.contextScoutExecutorResult?.implementationBlocked).toBe(false);
      expect(result.runtimeJobCreated).toBe(false);
      expect(result.routerRerun).toBe(false);
      expect(result.missionLedgerRerun).toBe(false);
      expect(result.commitmentPacketAuthorRerun).toBe(false);
      expect(result.schedulerDecompositionRerun).toBe(false);
      expect(jobs.map((item) => item.jobId)).toEqual(["job-context-boundary"]);
      expect(packetRun.rawPromptStored).toBe(false);
    });
  });

  it("reconstructs packets from per-packet artifacts without rerunning earlier boundaries", async () => {
    await withReplayRepositories(async ({ runtimeJobs, graphs, kernel }) => {
      const job = await runtimeJobs.enqueueJob({
        jobId: "job-context-boundary-chunked",
        jobType: "executor.agent_team",
        payload: { workflowId: "agent_team.coding", rawPromptStored: false },
      });
      const graph = await graphs.createGraph({
        graphId: "graph-context-boundary-chunked",
        rootRuntimeJobId: job.jobId,
        workflowId: "agent_team.coding",
        orchestratorModelRef: "openai-codex/gpt-5.5",
      });
      const fileRef =
        "extensions/execution-platform/src/codex-bridge/context-scout-boundary-replay.ts";
      await graphs.addNode({
        graphId: graph.graphId,
        nodeId: "context-node",
        nodeKind: "context_scout",
        assignedRole: "context_scout",
        nodeStatus: "planned",
        metadata: {
          commitmentIdsAdvanced: ["commitment-1"],
          targetRefs: [fileRef],
          exactObjective: "Replay context scout from chunked packet artifacts.",
          nodeSummary: "Replay context scout from chunked packet artifacts.",
        },
      });
      await runtimeJobs.attachArtifact({
        jobId: job.jobId,
        artifactType: "agent_team.scheduler_progress",
        storageKind: "metadata",
        uri: "runtime-job://job-context-boundary-chunked/progress/graph",
        metadata: { graphId: graph.graphId, rawPromptStored: false },
      });
      await runtimeJobs.attachArtifact({
        jobId: job.jobId,
        artifactType: "execution_platform.mission_contract_ledger",
        storageKind: "metadata",
        uri: "runtime-job://job-context-boundary-chunked/mission-ledger",
        metadata: {
          missionId: "mission-1",
          ownerObjectiveSummary: "Harden context scout boundary replay.",
          graphId: graph.graphId,
          rawPromptStored: false,
        },
      });
      await runtimeJobs.attachArtifact({
        jobId: job.jobId,
        artifactType: "execution_platform.source_prompt_context_index",
        storageKind: "metadata",
        uri: "runtime-job://job-context-boundary-chunked/source-prompt/context-index/hash",
        metadata: {
          promptHash: "hash",
          promptLength: 2000,
          resolutionStatus: "resolved",
          sections: [],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        },
      });
      await runtimeJobs.attachArtifact({
        jobId: job.jobId,
        artifactType: "execution_platform.commitment_work_packets",
        storageKind: "metadata",
        uri: "runtime-job://job-context-boundary-chunked/commitment-work-packets",
        metadata: {
          packetCount: 1,
          packetArtifactRefs: [
            "runtime-job://job-context-boundary-chunked/commitment-work-packets/commitment-1",
          ],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        },
      });
      await runtimeJobs.attachArtifact({
        jobId: job.jobId,
        artifactType: "execution_platform.commitment_work_packet",
        storageKind: "metadata",
        uri: "runtime-job://job-context-boundary-chunked/commitment-work-packets/commitment-1",
        metadata: {
          commitmentWorkPacket: acceptedPacket({
            packetId: "packet-1",
            packetRef: "packet://commitment-1",
            missionId: "mission-1",
            commitmentId: "commitment-1",
            fileRef,
          }),
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        },
      });

      const result = await runContextScoutBoundaryReplay({
        runtimeJobs,
        runtimeWorkGraphs: graphs,
        runtimeToolKernel: kernel,
        runtimeJobId: job.jobId,
        repoRoot: process.cwd(),
        roleModelClient: {
          async callRole() {
            return {
              status: "succeeded",
              responseText: JSON.stringify({
                relevantFiles: [{ path: fileRef, whyRelevant: "Defines replay loading." }],
                recommendedEditPoints: [],
                existingPatterns: [
                  "Chunked packet artifacts can reconstruct the accepted packet manifest without rerunning upstream prompt phases.",
                ],
                risks: [
                  "A weak handoff here would cause downstream workers to guess whether replay state came from manifest or per-packet artifacts.",
                ],
                validationSuggestions: [
                  "pnpm test:file context-scout-boundary-replay.test.ts",
                  "Assert commitmentPacketAuthorRerun remains false and packet refs are preserved.",
                ],
                handoffSummaryForImplementation:
                  "Chunked packets were reconstructed from per-packet artifacts. The downstream implementation worker should consume the recovered packet refs, preserve the no-rerun replay guarantee, and use the context scout handoff as the implementation boundary evidence for this commitment.",
                confidence: 0.9,
                limitations: [],
              }),
              responseHash: "sha256:model-context",
            };
          },
        },
      });

      expect(result.status).toBe("succeeded");
      expect(result.commitmentPacketAuthorRerun).toBe(false);
      expect(
        result.contextScoutExecutorResult?.contextScoutToolLoopRun?.commitmentWorkPacketRefs,
      ).toEqual(["packet://commitment-1"]);
    });
  });

  it("creates handoff from normalized scout output when raw response omits exact summary key", async () => {
    await withReplayRepositories(async ({ runtimeJobs, graphs, kernel }) => {
      const job = await runtimeJobs.enqueueJob({
        jobId: "job-context-boundary-summary-alias",
        jobType: "executor.agent_team",
        payload: { workflowId: "agent_team.coding", rawPromptStored: false },
      });
      const graph = await graphs.createGraph({
        graphId: "graph-context-boundary-summary-alias",
        rootRuntimeJobId: job.jobId,
        workflowId: "agent_team.coding",
        orchestratorModelRef: "openai-codex/gpt-5.5",
      });
      const fileRef =
        "extensions/execution-platform/src/codex-bridge/context-scout-node-executor.ts";
      await graphs.addNode({
        graphId: graph.graphId,
        nodeId: "context-node",
        nodeKind: "context_scout",
        assignedRole: "context_scout",
        nodeStatus: "planned",
        metadata: {
          commitmentIdsAdvanced: ["commitment-1"],
          targetRefs: [fileRef],
          exactObjective: "Replay context scout summary alias handling.",
        },
      });
      await runtimeJobs.attachArtifact({
        jobId: job.jobId,
        artifactType: "agent_team.scheduler_progress",
        storageKind: "metadata",
        uri: "runtime-job://job-context-boundary-summary-alias/progress/graph",
        metadata: { graphId: graph.graphId, rawPromptStored: false },
      });
      await runtimeJobs.attachArtifact({
        jobId: job.jobId,
        artifactType: "execution_platform.commitment_work_packets",
        storageKind: "metadata",
        uri: "runtime-job://job-context-boundary-summary-alias/commitment-work-packets",
        metadata: {
          commitmentWorkPackets: [
            acceptedPacket({
              packetId: "packet-1",
              packetRef: "packet://commitment-1",
              missionId: "mission-1",
              commitmentId: "commitment-1",
              fileRef,
            }),
          ],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        },
      });

      const result = await runContextScoutBoundaryReplay({
        runtimeJobs,
        runtimeWorkGraphs: graphs,
        runtimeToolKernel: kernel,
        runtimeJobId: job.jobId,
        repoRoot: process.cwd(),
        roleModelClient: {
          async callRole() {
            return {
              status: "succeeded",
              responseText: JSON.stringify({
                relevantFiles: [{ path: fileRef, whyRelevant: "Executor builds handoff packets." }],
                recommendedEditPoints: [
                  {
                    path: fileRef,
                    symbolOrRegion: "runContextScoutNodeExecutor",
                    reason: "Summary alias handling lives near handoff creation.",
                  },
                ],
                existingPatterns: ["normalized context output can provide the handoff summary"],
                risks: [],
                validationSuggestions: ["pnpm test:file context-scout-boundary-replay.test.ts"],
                confidence: 0.9,
                limitations: [],
              }),
              responseHash: "sha256:model-context",
            };
          },
        },
      });

      expect(result.status).toBe("succeeded");
      expect(result.contextScoutExecutorResult?.contextHandoffPacketRef).toContain(
        "runtime-job://job-context-boundary-summary-alias/context-handoff/",
      );
      expect(result.contextScoutExecutorResult?.implementationBlocked).toBe(false);
    });
  });
});
