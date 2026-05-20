import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import {
  BOUNDARY_REPLAY_CHECKPOINT_ARTIFACT_TYPE,
  BOUNDARY_REPLAY_CHECKPOINT_KINDS,
  BoundaryReplayService,
  buildBoundaryReplayCheckpoint,
  validateBoundaryReplayCheckpoint,
} from "./boundary-replay-checkpoints.ts";
import { createContextSnapshotRef } from "./context-snapshot.ts";
import { RuntimeWorkGraphRepository } from "./runtime-work-graph-repository.ts";

async function withReplayRuntime<T>(
  work: (input: {
    runtimeJobs: RuntimeJobRepository;
    graphs: RuntimeWorkGraphRepository;
  }) => Promise<T>,
): Promise<T> {
  const database = await createExecutionPlatformPgMemTestDatabase();
  try {
    await applyExecutionPlatformMigrations(database.sql);
    const runtimeJobs = new RuntimeJobRepository(database.sql, { claimStrategy: "basic" });
    const graphs = new RuntimeWorkGraphRepository(database.sql);
    await runtimeJobs.enqueueJob({
      jobId: "job-boundary-replay",
      jobType: "executor.agent_team",
      payload: { workflowId: "agent_team.coding" },
    });
    await graphs.createGraph({
      graphId: "graph-boundary-replay",
      parentWorkItemId: null,
      rootRuntimeJobId: "job-boundary-replay",
      workflowId: "agent_team.coding",
      orchestratorModelRef: "openai-codex/gpt-5.5",
      graphStatus: "running",
    });
    return await work({ runtimeJobs, graphs });
  } finally {
    await database.close();
  }
}

describe("boundary replay checkpoints", () => {
  it("builds and validates bounded checkpoint objects", () => {
    const checkpoint = buildBoundaryReplayCheckpoint({
      checkpointKind: "context_synthesis",
      workflowId: "agent_team.coding",
      runtimeJobId: "job-boundary-replay",
      graphId: "graph-boundary-replay",
      sourcePromptHash: "sha256:prompt",
      acceptedArtifactRefs: ["runtime-job://job/context-synthesis"],
      currentNodeIds: ["context_synthesis-node"],
      currentCommitmentIds: ["commitment-1"],
      replayContinuationMode: "continue_scheduler",
    });

    expect(validateBoundaryReplayCheckpoint(checkpoint)).toEqual({
      valid: true,
      reasonCodes: [],
    });
    expect(checkpoint.rawPromptStored).toBe(false);
    expect(checkpoint.workQueueLifecycleMutated).toBe(false);
  });

  it("rejects allowed replay checkpoints without accepted artifacts", () => {
    const checkpoint = buildBoundaryReplayCheckpoint({
      checkpointKind: "graph_compile",
      workflowId: "agent_team.coding",
      runtimeJobId: "job-boundary-replay",
      graphId: "graph-boundary-replay",
      acceptedArtifactRefs: [],
      replayStartPolicy: "allowed_from_checkpoint",
    });

    expect(validateBoundaryReplayCheckpoint(checkpoint)).toMatchObject({
      valid: false,
      reasonCodes: ["boundary_replay_checkpoint_accepted_artifacts_missing"],
    });
  });

  it("blocks allowed replay checkpoints with stale context snapshots", () => {
    const staleContext = createContextSnapshotRef({
      sourceRef: "runtime-job://job/context-synthesis/stale",
      sourceKind: "context_synthesis",
      sourcePromptHash: "sha256:old-prompt",
      freshnessStatus: "stale",
      refreshRequired: true,
      refreshAction: "rerun_context_synthesis",
      scopeSummary: "Stale synthesis checkpoint.",
    });
    const checkpoint = buildBoundaryReplayCheckpoint({
      checkpointKind: "context_synthesis",
      workflowId: "agent_team.coding",
      runtimeJobId: "job-boundary-replay",
      graphId: "graph-boundary-replay",
      sourcePromptHash: "sha256:prompt",
      acceptedArtifactRefs: ["runtime-job://job/context-synthesis/stale"],
      contextSnapshotRefs: [staleContext],
      replayStartPolicy: "allowed_from_checkpoint",
    });

    expect(validateBoundaryReplayCheckpoint(checkpoint)).toMatchObject({
      valid: false,
    });
    expect(validateBoundaryReplayCheckpoint(checkpoint).reasonCodes).toContain(
      "boundary_replay_checkpoint_context_freshness_invalid",
    );
    expect(checkpoint.staleContextSnapshotRefs).toContain(staleContext.snapshotRef);
  });

  it("records checkpoint artifacts, graph checkpoints, and replay plan readback", async () => {
    await withReplayRuntime(async ({ runtimeJobs, graphs }) => {
      const job = await runtimeJobs.getJob("job-boundary-replay");
      expect(job).not.toBeNull();
      const service = new BoundaryReplayService({ runtimeJobs, runtimeWorkGraphs: graphs });
      const requiredKinds = BOUNDARY_REPLAY_CHECKPOINT_KINDS.slice(
        0,
        BOUNDARY_REPLAY_CHECKPOINT_KINDS.indexOf("validation_repair") + 1,
      );
      let recorded: Awaited<ReturnType<BoundaryReplayService["recordCheckpoint"]>> | null = null;
      for (const checkpointKind of requiredKinds) {
        recorded = await service.recordCheckpoint({
          runtimeJob: job!,
          checkpoint: buildBoundaryReplayCheckpoint({
            checkpointKind,
            workflowId: "agent_team.coding",
            runtimeJobId: "job-boundary-replay",
            graphId: "graph-boundary-replay",
            sourcePromptHash: "sha256:prompt",
            sourcePayloadHash: "sha256:payload",
            acceptedArtifactRefs: [`runtime-job://job/${checkpointKind}`],
            currentNodeIds:
              checkpointKind === "validation_repair"
                ? ["validation-node"]
                : [`${checkpointKind}-node`],
            currentCommitmentIds: ["commitment-1"],
            openCommitmentIds: checkpointKind === "validation_repair" ? ["commitment-1"] : [],
            replayContinuationMode:
              checkpointKind === "validation_repair" ? "repair_boundary" : "continue_scheduler",
          }),
        });
      }
      expect(recorded).not.toBeNull();
      expect(recorded!.artifactRef).toContain("/boundary-replay/");

      const artifacts = await runtimeJobs.listArtifacts("job-boundary-replay");
      expect(artifacts.map((artifact) => artifact.artifactType)).toContain(
        BOUNDARY_REPLAY_CHECKPOINT_ARTIFACT_TYPE,
      );
      const snapshot = await graphs.readGraphSnapshot("graph-boundary-replay");
      expect(snapshot?.checkpoints.map((item) => item.checkpointKind)).toContain(
        "boundary_replay_validation_repair",
      );

      const plan = await service.buildReplayPlan({
        runtimeJobId: "job-boundary-replay",
        graphId: "graph-boundary-replay",
        workflowId: "agent_team.coding",
        requestedStartBoundary: "validation_repair",
        sourcePromptHash: "sha256:prompt",
        sourcePayloadHash: "sha256:payload",
        allowedNodeExecutors: ["kind:repair", "kind:validation"],
        allowedToolKernelFamilies: ["validation.run", "validation.review"],
      });

      expect(plan).toMatchObject({
        status: "accepted",
        exactContinuationAction:
          "Resume production scheduler at validation_repair and repair only the blocked boundary/branch before continuing.",
        exactContinuationMode: "repair_boundary",
        rawPromptStored: false,
      });
      expect(plan.latestAcceptedCheckpointRef).toContain("/validation_repair/");
      expect(plan.skippedUpstreamCheckpointKinds).toContain("router_payload");
      expect(plan.resumeFromArtifactRefs).toContain("runtime-job://job/validation_repair");
      const persistedPlan = await service.recordReplayPlan({ runtimeJob: job!, plan });
      expect(persistedPlan.artifactRef).toContain("/boundary-replay-plan/");
      const continuation = service.buildProductionContinuation({ plan });
      expect(continuation).toMatchObject({
        status: "accepted",
        runtimeEntryPoint: "GenericOrchestrationRuntime.runSchedulerGraph",
        schedulerEntryPoint: "RuntimeWorkGraphScheduler.run",
        continuationMode: "repair_boundary",
      });
      const persistedContinuation = await service.recordProductionContinuation({
        runtimeJob: job!,
        continuation,
      });
      expect(persistedContinuation.artifactRef).toContain("/boundary-replay-continuation/");
    });
  });

  it("rejects replay when the latest checkpoint for a required boundary is stale even if older accepted evidence exists", async () => {
    await withReplayRuntime(async ({ runtimeJobs, graphs }) => {
      const job = await runtimeJobs.getJob("job-boundary-replay");
      const service = new BoundaryReplayService({ runtimeJobs, runtimeWorkGraphs: graphs });
      for (const checkpointKind of ["router_payload", "mission_ledger"] as const) {
        await service.recordCheckpoint({
          runtimeJob: job!,
          checkpoint: buildBoundaryReplayCheckpoint({
            checkpointId: `${checkpointKind}-accepted`,
            checkpointKind,
            workflowId: "agent_team.coding",
            runtimeJobId: "job-boundary-replay",
            graphId: "graph-boundary-replay",
            sourcePromptHash: "sha256:prompt",
            sourcePayloadHash: "sha256:payload",
            acceptedArtifactRefs: [`runtime-job://job/${checkpointKind}/accepted`],
          }),
        });
      }
      await service.recordCheckpoint({
        runtimeJob: job!,
        checkpoint: buildBoundaryReplayCheckpoint({
          checkpointId: "mission-ledger-stale-latest",
          checkpointKind: "mission_ledger",
          workflowId: "agent_team.coding",
          runtimeJobId: "job-boundary-replay",
          graphId: "graph-boundary-replay",
          sourcePromptHash: "sha256:prompt",
          sourcePayloadHash: "sha256:payload",
          acceptedArtifactRefs: ["runtime-job://job/mission_ledger/stale"],
          replayFreshnessStatus: "stale",
        }),
      });

      const plan = await service.buildReplayPlan({
        runtimeJobId: "job-boundary-replay",
        graphId: "graph-boundary-replay",
        workflowId: "agent_team.coding",
        requestedStartBoundary: "mission_ledger",
        sourcePromptHash: "sha256:prompt",
        sourcePayloadHash: "sha256:payload",
      });

      expect(plan.status).toBe("needs_review");
      expect(plan.invalidReasonCodes).toContain(
        "mission_ledger:boundary_replay_checkpoint_freshness_not_fresh",
      );
      expect(plan.reasonCodes).toContain(
        "boundary_replay_upstream_checkpoint_missing:mission_ledger",
      );
    });
  });

  it("blocks replay when source prompt hash does not match", async () => {
    await withReplayRuntime(async ({ runtimeJobs, graphs }) => {
      const job = await runtimeJobs.getJob("job-boundary-replay");
      const service = new BoundaryReplayService({ runtimeJobs, runtimeWorkGraphs: graphs });
      await service.recordCheckpoint({
        runtimeJob: job!,
        checkpoint: buildBoundaryReplayCheckpoint({
          checkpointKind: "context_scout",
          workflowId: "agent_team.coding",
          runtimeJobId: "job-boundary-replay",
          graphId: "graph-boundary-replay",
          sourcePromptHash: "sha256:original",
          acceptedArtifactRefs: ["runtime-job://job/context-scout"],
        }),
      });

      const plan = await service.buildReplayPlan({
        runtimeJobId: "job-boundary-replay",
        graphId: "graph-boundary-replay",
        workflowId: "agent_team.coding",
        requestedStartBoundary: "context_scout",
        sourcePromptHash: "sha256:other",
      });

      expect(plan.status).toBe("needs_review");
      expect(plan.rejectedCheckpointRefs.length).toBe(1);
      expect(plan.stopConditions).toContain(
        "Stop if runtime job id, graph id, workflow id, source prompt hash, or payload hash mismatch.",
      );
    });
  });
});
