import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import {
  BOUNDARY_REPLAY_CHECKPOINT_ARTIFACT_TYPE,
  BOUNDARY_REPLAY_CHECKPOINT_KINDS,
  BOUNDARY_REPLAY_PRODUCTION_PROOF_BOUNDARY_IDS,
  BOUNDARY_REPLAY_REGISTRY_VERSION,
  BoundaryReplayService,
  boundaryReplayBoundaryIsDiagnosticOnly,
  boundaryReplayCheckpointKindForCliAlias,
  boundaryReplayCheckpointKindForProofBoundaryId,
  boundaryReplayDefinitionFor,
  boundaryReplayProofBoundaryIdForCheckpointKind,
  boundaryReplayRegistrySummary,
  buildBoundaryReplayCheckpoint,
  evaluateBoundaryReplayChildEpochEligibility,
  normalizeBoundaryReplayCheckpointArtifact,
  requiredBoundaryReplayCheckpointKindsFor,
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
  it("blocks worker execution before scheduling when node worker prompt text client is missing", async () => {
    const source = await readFile(
      path.join(process.cwd(), "scripts/execution-platform-run-product-spec-boundary-replay.mjs"),
      "utf8",
    );
    const preflightIndex = source.indexOf("const workerExecutionPreflight = {");
    const blockIndex = source.indexOf(
      "if (executeWorkers && !workerExecutionPreflight.promptTextModelClientPresent)",
    );
    const schedulerRunIndex = source.indexOf("schedulerResult = await scheduler.run(");

    expect(preflightIndex).toBeGreaterThanOrEqual(0);
    expect(blockIndex).toBeGreaterThan(preflightIndex);
    expect(schedulerRunIndex).toBeGreaterThan(blockIndex);
    expect(source).toContain("worker_execution_preflight_blocked");
    expect(source).toContain("node_worker_prompt_transport_missing");
    expect(source).toContain("process.exitCode = diagnosticExitZero ? 0 : 1");
    expect(source.slice(blockIndex, schedulerRunIndex)).toContain("return;");
  });

  it("exposes a workflow-agnostic registry for every checkpoint kind", () => {
    const summary = boundaryReplayRegistrySummary();
    expect(summary).toMatchObject({
      artifactKind: "boundary_replay_registry_summary",
      registryVersion: BOUNDARY_REPLAY_REGISTRY_VERSION,
      boundaryCount: BOUNDARY_REPLAY_CHECKPOINT_KINDS.length,
      rawPromptStored: false,
    });
    for (const checkpointKind of BOUNDARY_REPLAY_CHECKPOINT_KINDS) {
      const definition = boundaryReplayDefinitionFor(checkpointKind);
      expect(definition.workflowApplicability).toBe("workflow_agnostic");
      expect(definition.sourceCheckpointVersion).toBe(
        "execution-platform.boundary-replay-checkpoint.v1",
      );
      expect(definition.terminalLifecyclePolicy).toMatchObject({
        closeDbPools: true,
        closeProviderClients: true,
        emitTerminalJsonOnce: true,
      });
      expect(definition.resumeCommand.runtimeEntryPoint).toBe(
        "GenericOrchestrationRuntime.runSchedulerGraph",
      );
      expect(definition.resumeCommand.schedulerEntryPoint).toBe("RuntimeWorkGraphScheduler.run");
      expect(definition.readbackProjectionFields).toContain("boundaryKind");
      expect(definition.versionedNormalizers[0]?.normalizerId).toBe("metadata_checkpoint_v1");
      expect(definition.rawPromptStored).toBe(false);
    }
    expect(boundaryReplayBoundaryIsDiagnosticOnly("before_worker_invocation")).toBe(false);
    expect(boundaryReplayDefinitionFor("before_worker_invocation").productionPathEquivalence).toBe(
      "production_equivalent",
    );
    expect(boundaryReplayCheckpointKindForCliAlias("after-context")).toBeNull();
    expect(boundaryReplayCheckpointKindForCliAlias("after-parallel-context")).toBeNull();
    expect(boundaryReplayCheckpointKindForCliAlias("after-context-handoff")).toBeNull();
    expect(boundaryReplayCheckpointKindForCliAlias("after-resource-handoff")).toBeNull();
    expect(boundaryReplayCheckpointKindForCliAlias("after-context-synthesis")).toBeNull();
    expect(summary.productionProofBoundaryIds).toEqual([
      ...BOUNDARY_REPLAY_PRODUCTION_PROOF_BOUNDARY_IDS,
    ]);
    expect(boundaryReplayCheckpointKindForProofBoundaryId("before_worker_execution")).toBe(
      "before_worker_invocation",
    );
    expect(boundaryReplayProofBoundaryIdForCheckpointKind("before_worker_invocation")).toBe(
      "before_worker_execution",
    );
    expect(
      boundaryReplayDefinitionFor("before_worker_invocation").productionProofSequenceIndex,
    ).toBeGreaterThanOrEqual(0);
  });

  it("builds and validates bounded checkpoint objects", () => {
    const checkpoint = buildBoundaryReplayCheckpoint({
      checkpointKind: "before_worker_invocation",
      workflowId: "agent_team.coding",
      runtimeJobId: "job-boundary-replay",
      graphId: "graph-boundary-replay",
      sourcePromptHash: "sha256:prompt",
      acceptedArtifactRefs: ["runtime-job://job/node-agent-session/assignment"],
      currentNodeIds: ["implementation-node"],
      currentCommitmentIds: ["commitment-1"],
      replayContinuationMode: "continue_scheduler",
    });

    expect(validateBoundaryReplayCheckpoint(checkpoint)).toEqual({
      valid: true,
      reasonCodes: [],
    });
    expect(checkpoint.rawPromptStored).toBe(false);
    expect(checkpoint.workQueueLifecycleMutated).toBe(false);
    expect(checkpoint.productionPathEquivalence).toBe("production_equivalent");
    expect(checkpoint.boundaryEpoch).toMatch(/^boundary-epoch:/u);
    expect(checkpoint.terminalLifecyclePolicy.closeDbPools).toBe(true);
  });

  it("uses explicit boundary dependencies for granular replay instead of enum slice order", () => {
    expect(requiredBoundaryReplayCheckpointKindsFor("before_worker_invocation")).toEqual([
      "router_payload",
      "requirement_map",
      "work_intent_graph",
      "graph_compile",
      "node_selection",
      "before_worker_invocation",
    ]);
    expect(requiredBoundaryReplayCheckpointKindsFor("before_worker_invocation")).not.toContain(
      "worker_execution",
    );
    expect(requiredBoundaryReplayCheckpointKindsFor("before_graph_patch_write")).toEqual([
      "router_payload",
      "requirement_map",
      "work_intent_graph",
      "graph_compile",
      "before_graph_patch_write",
    ]);
    expect(requiredBoundaryReplayCheckpointKindsFor("before_worker_invocation")).not.toContain(
      "context_synthesis",
    );
  });

  it("normalizes checkpoint artifacts through versioned structural normalizers", async () => {
    await withReplayRuntime(async ({ runtimeJobs, graphs }) => {
      const job = await runtimeJobs.getJob("job-boundary-replay");
      const service = new BoundaryReplayService({ runtimeJobs, runtimeWorkGraphs: graphs });
      const recorded = await service.recordCheckpoint({
        runtimeJob: job!,
        checkpoint: buildBoundaryReplayCheckpoint({
          checkpointKind: "graph_compile",
          workflowId: "agent_team.coding",
          runtimeJobId: "job-boundary-replay",
          graphId: "graph-boundary-replay",
          acceptedArtifactRefs: ["runtime-job://job/graph"],
        }),
      });
      const artifact = (await runtimeJobs.listArtifacts("job-boundary-replay")).find(
        (candidate) => candidate.uri === recorded.artifactRef,
      );
      expect(artifact).toBeDefined();
      const normalized = normalizeBoundaryReplayCheckpointArtifact(artifact!);
      expect(normalized).toMatchObject({
        status: "accepted",
        registryVersion: BOUNDARY_REPLAY_REGISTRY_VERSION,
        missingFieldPaths: [],
        rawPromptStored: false,
      });
      expect(normalized.checkpoint?.checkpointKind).toBe("graph_compile");
    });
  });

  it("records registry-aware runtime checkpoints without script-local checkpoint construction", async () => {
    await withReplayRuntime(async ({ runtimeJobs, graphs }) => {
      const job = await runtimeJobs.getJob("job-boundary-replay");
      const service = new BoundaryReplayService({ runtimeJobs, runtimeWorkGraphs: graphs });
      const recorded = await service.recordRuntimeCheckpoint({
        runtimeJob: job!,
        graphId: "graph-boundary-replay",
        workflowId: "agent_team.coding",
        checkpointKind: "before_worker_invocation",
        acceptedArtifactRefs: ["runtime-job://job/resource-packet"],
        currentNodeIds: ["implementation-node"],
      });

      expect(recorded.checkpoint.replayContinuationMode).toBe("run_node");
      expect(recorded.checkpoint.reasonCodes).toContain(
        "boundary_replay_runtime_checkpoint_production_replayable",
      );
      expect(recorded.artifactRef).toContain("/before_worker_invocation/");
    });
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
      sourceRef: "runtime-job://job/node-agent-session/worker-prompt/stale",
      sourceKind: "node_agent_worker_prompt",
      sourcePromptHash: "sha256:old-prompt",
      freshnessStatus: "stale",
      refreshRequired: true,
      refreshAction: "request_excerpt",
      scopeSummary: "Stale node worker prompt checkpoint.",
    });
    const checkpoint = buildBoundaryReplayCheckpoint({
      checkpointKind: "before_worker_invocation",
      workflowId: "agent_team.coding",
      runtimeJobId: "job-boundary-replay",
      graphId: "graph-boundary-replay",
      sourcePromptHash: "sha256:prompt",
      acceptedArtifactRefs: ["runtime-job://job/node-agent-session/assignment/stale"],
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
      const requiredKinds = requiredBoundaryReplayCheckpointKindsFor("validation_repair");
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
              boundaryReplayDefinitionFor(checkpointKind).resumeCommand.defaultContinuationMode,
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

  it("accepts worker invocation replay when the explicit structural prerequisites exist", async () => {
    await withReplayRuntime(async ({ runtimeJobs, graphs }) => {
      const job = await runtimeJobs.getJob("job-boundary-replay");
      const service = new BoundaryReplayService({ runtimeJobs, runtimeWorkGraphs: graphs });
      for (const checkpointKind of requiredBoundaryReplayCheckpointKindsFor(
        "before_worker_invocation",
      )) {
        await service.recordCheckpoint({
          runtimeJob: job!,
          checkpoint: buildBoundaryReplayCheckpoint({
            checkpointKind,
            workflowId: "agent_team.coding",
            runtimeJobId: "job-boundary-replay",
            graphId: "graph-boundary-replay",
            sourcePromptHash: "sha256:prompt",
            sourcePayloadHash: "sha256:payload",
            acceptedArtifactRefs: [`runtime-job://job/${checkpointKind}`],
            currentNodeIds: ["implementation-node"],
            currentCommitmentIds: ["commitment-1"],
            replayContinuationMode:
              checkpointKind === "before_worker_invocation" ? "run_node" : "continue_scheduler",
          }),
        });
      }

      const plan = await service.buildReplayPlan({
        runtimeJobId: "job-boundary-replay",
        graphId: "graph-boundary-replay",
        workflowId: "agent_team.coding",
        requestedStartBoundary: "before_worker_invocation",
        sourcePromptHash: "sha256:prompt",
        sourcePayloadHash: "sha256:payload",
      });

      expect(plan.status).toBe("accepted");
      expect(plan.exactContinuationMode).toBe("run_node");
      expect(plan.productionPathEquivalence).toBe("production_equivalent");
      expect(plan.proofClosureAllowed).toBe(true);
      expect(plan.boundaryEpoch).toMatch(/^boundary-epoch:/u);
      expect(plan.requiredUpstreamCheckpointKinds).toEqual(
        requiredBoundaryReplayCheckpointKindsFor("before_worker_invocation"),
      );
      expect(plan.requiredUpstreamCheckpointKinds).not.toContain("validation_repair");
      expect(plan.exactContinuationAction).toContain(
        "run the recorded ready node(s): implementation-node",
      );
    });
  });

  it("does not let superseded invalid checkpoint attempts poison a clean replay plan", async () => {
    await withReplayRuntime(async ({ runtimeJobs, graphs }) => {
      const job = await runtimeJobs.getJob("job-boundary-replay");
      const service = new BoundaryReplayService({ runtimeJobs, runtimeWorkGraphs: graphs });
      await service.recordCheckpoint({
        runtimeJob: job!,
        checkpoint: buildBoundaryReplayCheckpoint({
          checkpointId: "before-worker-invocation-invalid-superseded",
          checkpointKind: "before_worker_invocation",
          workflowId: "agent_team.coding",
          runtimeJobId: "job-boundary-replay",
          graphId: "graph-boundary-replay",
          sourcePromptHash: "sha256:prompt",
          sourcePayloadHash: "sha256:payload",
          acceptedArtifactRefs: ["runtime-job://job/before_worker_invocation/invalid"],
          replayStartPolicy: "blocked_until_repair",
          replaySafetyStatus: "blocked",
          replayContinuationMode: "continue_scheduler",
        }),
      });
      for (const checkpointKind of requiredBoundaryReplayCheckpointKindsFor(
        "before_worker_invocation",
      )) {
        await service.recordCheckpoint({
          runtimeJob: job!,
          checkpoint: buildBoundaryReplayCheckpoint({
            checkpointKind,
            workflowId: "agent_team.coding",
            runtimeJobId: "job-boundary-replay",
            graphId: "graph-boundary-replay",
            sourcePromptHash: "sha256:prompt",
            sourcePayloadHash: "sha256:payload",
            acceptedArtifactRefs: [`runtime-job://job/${checkpointKind}`],
            currentNodeIds: ["implementation-node"],
            currentCommitmentIds: ["commitment-1"],
            replayContinuationMode:
              checkpointKind === "before_worker_invocation" ? "run_node" : "continue_scheduler",
          }),
        });
      }

      const plan = await service.buildReplayPlan({
        runtimeJobId: "job-boundary-replay",
        graphId: "graph-boundary-replay",
        workflowId: "agent_team.coding",
        requestedStartBoundary: "before_worker_invocation",
        sourcePromptHash: "sha256:prompt",
        sourcePayloadHash: "sha256:payload",
      });

      expect(plan.status).toBe("accepted");
      expect(plan.proofClosureAllowed).toBe(true);
      expect(plan.invalidReasonCodes).toEqual([]);
      expect(plan.rejectedCheckpointRefs).toHaveLength(1);
      expect(plan.reasonCodes).not.toContain(
        "boundary_replay_invalid_latest_checkpoint_blocks_proof_closure",
      );
    });
  });

  it("rejects replay when the latest checkpoint for a required boundary is stale even if older accepted evidence exists", async () => {
    await withReplayRuntime(async ({ runtimeJobs, graphs }) => {
      const job = await runtimeJobs.getJob("job-boundary-replay");
      const service = new BoundaryReplayService({ runtimeJobs, runtimeWorkGraphs: graphs });
      for (const checkpointKind of ["router_payload", "requirement_map"] as const) {
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
          checkpointId: "requirement-map-stale-latest",
          checkpointKind: "requirement_map",
          workflowId: "agent_team.coding",
          runtimeJobId: "job-boundary-replay",
          graphId: "graph-boundary-replay",
          sourcePromptHash: "sha256:prompt",
          sourcePayloadHash: "sha256:payload",
          acceptedArtifactRefs: ["runtime-job://job/requirement_map/stale"],
          replayFreshnessStatus: "stale",
        }),
      });

      const plan = await service.buildReplayPlan({
        runtimeJobId: "job-boundary-replay",
        graphId: "graph-boundary-replay",
        workflowId: "agent_team.coding",
        requestedStartBoundary: "requirement_map",
        sourcePromptHash: "sha256:prompt",
        sourcePayloadHash: "sha256:payload",
      });

      expect(plan.status).toBe("needs_review");
      expect(plan.proofClosureAllowed).toBe(false);
      expect(plan.invalidReasonCodes).toContain(
        "requirement_map:boundary_replay_checkpoint_freshness_not_fresh",
      );
      expect(plan.reasonCodes).toContain(
        "boundary_replay_invalid_latest_checkpoint_blocks_proof_closure",
      );
      expect(plan.reasonCodes).toContain(
        "boundary_replay_upstream_checkpoint_missing:requirement_map",
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
          checkpointKind: "before_worker_invocation",
          workflowId: "agent_team.coding",
          runtimeJobId: "job-boundary-replay",
          graphId: "graph-boundary-replay",
          sourcePromptHash: "sha256:original",
          acceptedArtifactRefs: ["runtime-job://job/node-agent-session/assignment"],
        }),
      });

      const plan = await service.buildReplayPlan({
        runtimeJobId: "job-boundary-replay",
        graphId: "graph-boundary-replay",
        workflowId: "agent_team.coding",
        requestedStartBoundary: "before_worker_invocation",
        sourcePromptHash: "sha256:other",
      });

      expect(plan.status).toBe("needs_review");
      expect(plan.rejectedCheckpointRefs.length).toBe(1);
      expect(plan.stopConditions).toContain(
        "Stop if runtime job id, graph id, workflow id, source prompt hash, or payload hash mismatch.",
      );
    });
  });

  it("supersedes stale boundary children by epoch without deleting historical nodes", async () => {
    await withReplayRuntime(async ({ graphs, runtimeJobs }) => {
      await graphs.addNode({
        graphId: "graph-boundary-replay",
        nodeId: "child-old",
        nodeKind: "implementation",
        assignedRole: "implementation_engineer",
        nodeStatus: "planned",
        metadata: {
          replayParentNodeId: "parent-a",
          boundaryEpoch: "boundary-epoch:old",
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });
      await graphs.addNode({
        graphId: "graph-boundary-replay",
        nodeId: "child-current",
        nodeKind: "implementation",
        assignedRole: "implementation_engineer",
        nodeStatus: "planned",
        metadata: {
          replayParentNodeId: "parent-a",
          boundaryEpoch: "boundary-epoch:current",
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });
      await graphs.addNode({
        graphId: "graph-boundary-replay",
        nodeId: "child-missing-epoch",
        nodeKind: "implementation",
        assignedRole: "implementation_engineer",
        nodeStatus: "planned",
        metadata: {
          replayParentNodeId: "parent-a",
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });
      const service = new BoundaryReplayService({ runtimeJobs, runtimeWorkGraphs: graphs });
      const result = await service.supersedeStaleBoundaryChildren({
        graphId: "graph-boundary-replay",
        currentBoundaryEpoch: "boundary-epoch:current",
        parentNodeIds: ["parent-a"],
        currentChildNodeIds: ["child-current"],
      });
      const snapshot = await graphs.readGraphSnapshot("graph-boundary-replay");
      const oldChild = snapshot?.nodes.find((node) => node.nodeId === "child-old");
      const currentChild = snapshot?.nodes.find((node) => node.nodeId === "child-current");
      const missingEpochChild = snapshot?.nodes.find(
        (node) => node.nodeId === "child-missing-epoch",
      );

      expect(result.supersededChildNodeIds).toEqual(["child-old", "child-missing-epoch"]);
      expect(oldChild?.nodeStatus).toBe("skipped");
      expect((oldChild?.metadata as Record<string, unknown>).boundaryReplayChildSuperseded).toBe(
        true,
      );
      expect(missingEpochChild?.nodeStatus).toBe("skipped");
      expect(currentChild?.nodeStatus).toBe("planned");
      expect((snapshot?.graph.metadata as Record<string, unknown>).currentBoundaryEpoch).toBe(
        "boundary-epoch:current",
      );
    });
  });

  it("evaluates boundary child epoch eligibility structurally without lexical semantics", () => {
    expect(
      evaluateBoundaryReplayChildEpochEligibility({
        nodeMetadata: {
          title: "Product/Spec implementation looking phrase",
          boundaryEpoch: "boundary-epoch:old",
          rawPromptStored: false,
          rawResponseStored: false,
        },
        graphMetadata: {
          currentBoundaryEpoch: "boundary-epoch:current",
        },
      }),
    ).toMatchObject({
      eligible: false,
      reasonCodes: ["boundary_replay_child_epoch_mismatch"],
    });

    expect(
      evaluateBoundaryReplayChildEpochEligibility({
        nodeMetadata: {
          replayParentNodeId: "parent-a",
          rawPromptStored: false,
          rawResponseStored: false,
        },
        graphMetadata: {
          currentBoundaryEpoch: "boundary-epoch:current",
        },
      }),
    ).toMatchObject({
      eligible: false,
      reasonCodes: ["boundary_replay_child_epoch_missing"],
    });

    expect(
      evaluateBoundaryReplayChildEpochEligibility({
        nodeMetadata: {
          title: "context_synthesis implementation Product/Spec lexical trap",
          boundaryEpoch: "boundary-epoch:current",
          rawPromptStored: false,
          rawResponseStored: false,
        },
        graphMetadata: {
          currentBoundaryEpoch: "boundary-epoch:current",
        },
      }).eligible,
    ).toBe(true);
  });
});
