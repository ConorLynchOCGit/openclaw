import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import type { RequirementMap } from "./requirement-map.ts";
import { RuntimeWorkGraphRepository } from "./runtime-work-graph-repository.ts";
import { RuntimeWorkGraphScheduler } from "./runtime-work-graph-scheduler.ts";

async function withSchedulerGraph<T>(
  work: (graphs: RuntimeWorkGraphRepository) => Promise<T>,
  workflowId = "agent_team.coding",
): Promise<T> {
  const database = await createExecutionPlatformPgMemTestDatabase();
  try {
    await applyExecutionPlatformMigrations(database.sql);
    const graphs = new RuntimeWorkGraphRepository(database.sql, {
      now: () => new Date("2026-05-14T00:00:00.000Z"),
    });
    await graphs.createGraph({
      graphId: "scheduler-graph",
      workflowId,
      orchestratorModelRef: "openai-codex/gpt-5.5",
      graphStatus: "running",
    });
    return await work(graphs);
  } finally {
    await database.close();
  }
}

describe("runtime work graph scheduler", () => {
  function graphPatchRequirementMap(): RequirementMap {
    return {
      artifactKind: "requirement_map",
      schemaVersion: "execution-platform.requirement-map.v2",
      mapId: "scheduler-runtime-graph-patch-map",
      mapRef: "runtime-job://scheduler-runtime-graph-patch/requirement-map",
      mapHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      sourcePromptBodyRef: "source-prompt://scheduler-runtime-graph-patch/body",
      sourcePromptHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      sourcePromptLength: 4096,
      requirements: [
        {
          requirementId: "req-impl-core",
          role: "runnable_work",
          text: "Implement the core scheduler graph patch persistence change.",
          sourceRefs: ["source-prompt://scheduler-runtime-graph-patch/req-impl-core"],
        },
        {
          requirementId: "req-validation",
          role: "validation",
          text: "Validate after implementation evidence exists.",
          sourceRefs: ["source-prompt://scheduler-runtime-graph-patch/req-validation"],
        },
        {
          requirementId: "req-review",
          role: "review",
          text: "Review completed implementation and validation evidence.",
          sourceRefs: ["source-prompt://scheduler-runtime-graph-patch/req-review"],
        },
        {
          requirementId: "req-closeout",
          role: "closeout",
          text: "Close out after review evidence is accepted.",
          sourceRefs: ["source-prompt://scheduler-runtime-graph-patch/req-closeout"],
        },
      ],
      coverage: {
        status: "complete",
        promptLength: 4096,
        windowCount: 2,
        coveredWindowCount: 2,
        candidateCount: 4,
        requirementCount: 4,
        retiredCandidateCount: 0,
        coverageHash: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      },
      reasonCodes: ["requirement_map_fixture"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    };
  }

  it("marks explicit no-loop admission stops as needs_review instead of failed", async () => {
    await withSchedulerGraph(async (graphs) => {
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        progressCheckpointIterations: 0,
        orchestrator: {
          async callSchedulerTool() {
            throw new Error("orchestrator_should_not_run_after_zero_iteration_budget");
          },
        },
        executors: {},
      });

      const result = await scheduler.run("scheduler-graph");
      const snapshot = await graphs.readGraphSnapshot("scheduler-graph");

      expect(result.status).toBe("max_iterations");
      expect(result.reasonCodes).toContain(
        "scheduler_progress_checkpoint_zero_no_iterations_requested",
      );
      expect(snapshot?.graph.graphStatus).toBe("needs_review");
    });
  });

  it("drains ready executable frontier nodes before global scheduler graph authoring", async () => {
    await withSchedulerGraph(async (graphs) => {
      await graphs.addNode({
        graphId: "scheduler-graph",
        nodeId: "implementation-worker-owned-context",
        nodeKind: "implementation",
        assignedRole: "implementation_engineer",
        nodeStatus: "planned",
        inputHandoffRefs: [],
        outputArtifactRefs: [],
        metadata: {
          capabilityId: "implementation_microtask",
          targetRefs: ["extensions/execution-platform/src/workflows/index.ts"],
          authorityScopeRefs: ["extensions/execution-platform/src/workflows/index.ts"],
          allowedFileRefs: ["extensions/execution-platform/src/workflows/index.ts"],
          commitmentIdsAdvanced: ["code-edit"],
          exactObjective: "Start implementation and request context inside the worker loop.",
          expectedOutput: "Changed-file evidence for the implementation commitment.",
          acceptanceCriteria: ["Worker starts and can request context inside the worker loop."],
          evidenceMode: ["changed_file_evidence"],
          sourcePromptExcerptRefs: ["source-prompt://worker-owned-context/body/0-900"],
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });
      let nativeNodeSessionInvoked = false;
      let legacyExecutorInvoked = false;
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        orchestrator: {
          async callSchedulerTool() {
            throw new Error("global_scheduler_should_not_run_before_ready_frontier");
          },
        },
        attachPayloadArtifact: async (artifact) => ({
          artifactRef: artifact.uri,
          reasonCodes: [`attached:${artifact.artifactType}`],
        }),
        nodeAgentSessionRunner: async ({ nodeExecutionSnapshot }) => {
          nativeNodeSessionInvoked = true;
          return {
            status: "succeeded",
            outputArtifactRefs: ["artifact://implementation-worker-owned-context"],
            reasonCodes: [
              "node_agent_session_invoked",
              `node_execution_snapshot_ref:${nodeExecutionSnapshot.snapshotRef}`,
            ],
            metadata: {
              nodeRunId: nodeExecutionSnapshot.nodeRunId,
              nodeAgentId: nodeExecutionSnapshot.agentId,
              nodeAgentSessionKey: nodeExecutionSnapshot.sessionKey,
              rawPromptStored: false,
              rawResponseStored: false,
            },
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
            workQueueLifecycleMutated: false,
          };
        },
        executors: {
          "role:implementation_engineer": {
            async execute() {
              legacyExecutorInvoked = true;
              throw new Error(
                "legacy_executor_should_not_run_when_native_node_agent_session_exists",
              );
            },
          },
        },
        progressCheckpointIterations: 1,
      });

      const result = await scheduler.run("scheduler-graph");
      const snapshot = await graphs.readGraphSnapshot("scheduler-graph");
      const executedNode = snapshot?.nodes.find(
        (node) => node.nodeId === "implementation-worker-owned-context",
      );
      const executedNodeMetadata = executedNode?.metadata as
        | { lastStatusReasonCodes?: unknown }
        | undefined;

      expect(nativeNodeSessionInvoked).toBe(true);
      expect(legacyExecutorInvoked).toBe(false);
      expect(result.executedNodeIds).toContain("implementation-worker-owned-context");
      expect(executedNodeMetadata?.lastStatusReasonCodes).toEqual(
        expect.arrayContaining(["node_agent_session_invoked"]),
      );
      expect(result.reasonCodes).not.toContain("resource_objective_focus_required");
      expect(result.reasonCodes).not.toContain("node_resource_demand_required");
      expect(result.reasonCodes).not.toContain(
        "node_local_node_resource_demand_required_before_execution",
      );
    });
  });

  it("remaps SchedulerGraphPatch seed ids to graph-scoped runtime ids before persistence", async () => {
    await withSchedulerGraph(async (graphs) => {
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        requirementMap: graphPatchRequirementMap(),
        closureRunMode: "proof",
        progressCheckpointIterations: 1,
        maxSchedulerToolTurns: 8,
        orchestrator: {
          async callSchedulerTool(input) {
            if (input.phase === "capability_selection_required") {
              return {
                toolId: "scheduler.add_capability_selection",
                input: {
                  workUnitId: "wu-impl-core",
                  selectedCapabilityId: "implementation_microtask",
                },
                modelRef: input.modelRef,
                providerPath: input.providerPath,
                providerToolName: "scheduler_add_capability_selection",
                latencyMs: 1,
                reasonCodes: ["fixture_capability_selected"],
                rawPromptStored: false,
                rawResponseStored: false,
                rawProviderLogStored: false,
              };
            }
            throw new Error(`unexpected_single_scheduler_phase:${input.phase}`);
          },
          async callSchedulerTools(input) {
            if (input.phase === "work_unit_coverage_required") {
              return [
                {
                  toolId: "scheduler.open_work_unit_from_requirement",
                  input: { requirementId: "req-impl-core" },
                  modelRef: input.modelRef,
                  providerPath: input.providerPath,
                  providerToolName: "scheduler_open_work_unit_from_requirement",
                  latencyMs: 1,
                  reasonCodes: ["fixture_work_unit_opened"],
                  rawPromptStored: false,
                  rawResponseStored: false,
                  rawProviderLogStored: false,
                },
              ];
            }
            if (input.phase === "node_contracts_required") {
              return [
                {
                  toolId: "scheduler.add_node_contract",
                  input: {
                    workUnitId: "wu-impl-core",
                    executionIntent: "source_edit",
                    objective: "Implement the core scheduler graph patch persistence change.",
                    expectedOutput: "Changed-file evidence and validation evidence.",
                    successCriteria: ["Runtime graph patch nodes persist with graph-scoped ids."],
                    requirementIds: ["req-impl-core"],
                    commitmentIds: ["req-impl-core"],
                  },
                  modelRef: input.modelRef,
                  providerPath: input.providerPath,
                  providerToolName: "scheduler_add_node_contract",
                  latencyMs: 1,
                  reasonCodes: ["fixture_contract_authored"],
                  rawPromptStored: false,
                  rawResponseStored: false,
                  rawProviderLogStored: false,
                },
              ];
            }
            if (input.phase === "dependency_ordering_required") {
              return [];
            }
            throw new Error(`unexpected_batch_scheduler_phase:${input.phase}`);
          },
        },
        executors: {
          "kind:implementation": {
            async execute() {
              throw new Error("not reached");
            },
          },
          "kind:validation": {
            async execute() {
              throw new Error("not reached");
            },
          },
          "kind:reviewer": {
            async execute() {
              throw new Error("not reached");
            },
          },
          "kind:closeout": {
            async execute() {
              throw new Error("not reached");
            },
          },
        },
      });

      const result = await scheduler.run("scheduler-graph");
      const snapshot = await graphs.readGraphSnapshot("scheduler-graph");
      const nodeIds = snapshot?.nodes.map((node) => node.nodeId).toSorted() ?? [];

      expect(result.addedNodeIds).toHaveLength(4);
      expect(nodeIds).toHaveLength(4);
      expect(nodeIds.some((nodeId) => nodeId.startsWith("seed-"))).toBe(false);
      expect(nodeIds.every((nodeId) => /^node-[a-f0-9]{24}$/u.test(nodeId))).toBe(true);
      expect(snapshot?.nodes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            metadata: expect.objectContaining({
              schedulerGraphPatchNodeSeedId: "seed-wu-impl-core",
              runtimeOwnedSchedulerGraphPatchNode: true,
            }),
          }),
          expect.objectContaining({
            metadata: expect.objectContaining({
              schedulerGraphPatchNodeSeedId: "seed-mission-validation",
              runtimeOwnedSchedulerGraphPatchNode: true,
            }),
          }),
        ]),
      );
      expect(snapshot?.edges.every((edge) => nodeIds.includes(edge.fromNodeId ?? ""))).toBe(true);
      expect(snapshot?.edges.every((edge) => nodeIds.includes(edge.toNodeId ?? ""))).toBe(true);
    });
  });
});
