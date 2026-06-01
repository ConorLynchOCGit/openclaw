import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { WorkQueueRepository } from "../work-queue/work-queue-repository.ts";
import { createContextSnapshotRef } from "./context-snapshot.ts";
import { RuntimeWorkGraphRepository } from "./runtime-work-graph-repository.ts";

async function withGraphRepository<T>(
  work: (input: {
    graphs: RuntimeWorkGraphRepository;
    runtimeJobs: RuntimeJobRepository;
    workQueue: WorkQueueRepository;
  }) => Promise<T>,
): Promise<T> {
  const database = await createExecutionPlatformPgMemTestDatabase();
  try {
    await applyExecutionPlatformMigrations(database.sql);
    const now = () => new Date("2026-05-10T00:00:00.000Z");
    const runtimeJobs = new RuntimeJobRepository(database.sql, { claimStrategy: "basic", now });
    const workQueue = new WorkQueueRepository(database.sql, runtimeJobs, { now });
    const graphs = new RuntimeWorkGraphRepository(database.sql, { now });
    return await work({ graphs, runtimeJobs, workQueue });
  } finally {
    await database.close();
  }
}

describe("runtime work graph repository", () => {
  it("creates graph tables and persists checkpoints", async () => {
    await withGraphRepository(async ({ graphs }) => {
      const graph = await graphs.createGraph({
        graphId: "graph-1",
        workflowId: "agent_team.coding",
        orchestratorModelRef: "openai-codex/gpt-5.5",
      });
      const ledger = await graphs.recordBudgetLedger({
        graphId: graph.graphId,
        ledgerId: "ledger-1",
        scopeKind: "graph",
        scopeRef: graph.graphId,
        wallTimeMs: 1_000,
        maxOutputTokens: 8_000,
      });
      const checkpoint = await graphs.recordCheckpoint({
        graphId: graph.graphId,
        checkpointId: "checkpoint-1",
        checkpointKind: "orchestrator_plan",
        stateSummary: "Plan accepted with bounded graph evidence.",
        budgetLedgerRef: ledger.ledgerId,
      });
      const snapshot = await graphs.readGraphSnapshot(graph.graphId);

      expect(checkpoint.rawPromptStored).toBe(false);
      expect(snapshot?.graph.checkpointRefs).toContain(
        "runtime-work-graph://checkpoint/checkpoint-1",
      );
      expect(snapshot?.budgetLedgers).toHaveLength(1);
    });
  });

  it("records checkpoints idempotently without duplicate graph refs", async () => {
    await withGraphRepository(async ({ graphs }) => {
      const graph = await graphs.createGraph({
        graphId: "graph-idempotent-checkpoint",
        workflowId: "agent_team.coding",
        orchestratorModelRef: "openai-codex/gpt-5.5",
      });
      await graphs.recordCheckpoint({
        graphId: graph.graphId,
        checkpointId: "boundary-replay-context-scout",
        checkpointKind: "boundary_replay_resource_scout",
        stateSummary: "Initial resource scout checkpoint.",
        artifactRefs: ["runtime-job://job/context-scout/a"],
      });
      const second = await graphs.recordCheckpoint({
        graphId: graph.graphId,
        checkpointId: "boundary-replay-context-scout",
        checkpointKind: "boundary_replay_resource_scout",
        stateSummary: "Updated resource scout checkpoint.",
        artifactRefs: ["runtime-job://job/context-scout/b"],
      });
      const snapshot = await graphs.readGraphSnapshot(graph.graphId);

      expect(second.stateSummary).toBe("Updated resource scout checkpoint.");
      expect(snapshot?.checkpoints).toHaveLength(1);
      expect(
        snapshot?.graph.checkpointRefs.filter(
          (ref) => ref === "runtime-work-graph://checkpoint/boundary-replay-context-scout",
        ),
      ).toHaveLength(1);
      expect(snapshot?.checkpoints[0]?.artifactRefs).toEqual(["runtime-job://job/context-scout/b"]);
    });
  });

  it("records repeated role invocations and handoff edges", async () => {
    await withGraphRepository(async ({ graphs }) => {
      await graphs.createGraph({
        graphId: "graph-repeat",
        workflowId: "agent_team.coding",
        orchestratorModelRef: "openai-codex/gpt-5.5",
      });
      const first = await graphs.addNode({
        graphId: "graph-repeat",
        nodeId: "work-intent-1",
        nodeKind: "work_intent",
        assignedRole: "planning_orchestrator",
        nodeStatus: "succeeded",
      });
      const second = await graphs.addNode({
        graphId: "graph-repeat",
        nodeId: "implementation-1",
        nodeKind: "implementation",
        assignedRole: "implementation_engineer",
        nodeStatus: "succeeded",
        inputHandoffRefs: ["runtime-work-graph://node/work-intent-1"],
      });
      await graphs.recordRoleInvocation({
        graphId: "graph-repeat",
        nodeId: first.nodeId,
        invocationId: "invoke-context-1",
        roleId: "planning_orchestrator",
        modelRef: "deepseek/deepseek-v4-flash",
        providerPath: "openrouter",
        transportKind: "live_model",
        outputHash: "hash-1",
        latencyMs: 10,
      });
      await graphs.recordRoleInvocation({
        graphId: "graph-repeat",
        nodeId: second.nodeId,
        invocationId: "invoke-context-2",
        roleId: "implementation_engineer",
        modelRef: "deepseek/deepseek-v4-flash",
        providerPath: "openrouter",
        transportKind: "live_model",
        outputHash: "hash-2",
        latencyMs: 12,
      });
      await graphs.addEdge({
        graphId: "graph-repeat",
        edgeId: "edge-repair-context",
        fromNodeId: first.nodeId,
        toNodeId: second.nodeId,
        edgeKind: "continuation",
        reasonCodes: ["more_context_needed"],
      });
      const snapshot = await graphs.readGraphSnapshot("graph-repeat");

      expect(snapshot?.roleInvocations.map((invocation) => invocation.invocationId)).toEqual([
        "invoke-context-1",
        "invoke-context-2",
      ]);
      expect(snapshot?.edges[0]).toMatchObject({ edgeKind: "continuation" });
    });
  });

  it("rejects raw storage metadata and preserves Work Queue lifecycle boundary", async () => {
    await withGraphRepository(async ({ graphs }) => {
      await expect(
        graphs.createGraph({
          graphId: "graph-raw",
          workflowId: "agent_team.coding",
          orchestratorModelRef: "openai-codex/gpt-5.5",
          metadata: { rawPromptStored: true },
        }),
      ).rejects.toThrow(/raw storage field/u);
    });
  });

  it("rejects graph node metadata that embeds resource bodies instead of bounded manifests", async () => {
    await withGraphRepository(async ({ graphs }) => {
      await graphs.createGraph({
        graphId: "graph-manifest-only-node-metadata",
        workflowId: "agent_team.coding",
        orchestratorModelRef: "openai-codex/gpt-5.5",
      });

      await expect(
        graphs.addNode({
          graphId: "graph-manifest-only-node-metadata",
          nodeId: "implementation-with-body",
          nodeKind: "implementation",
          assignedRole: "implementation_engineer",
          metadata: {
            nodeReadinessState: {
              artifactKind: "node_readiness_state",
              readinessStatus: "ready",
            },
            rawPromptStored: false,
            rawResponseStored: false,
          },
        }),
      ).rejects.toThrow(/metadata manifest violation/u);

      await expect(
        graphs.addNode({
          graphId: "graph-manifest-only-node-metadata",
          nodeId: "implementation-with-contract-body",
          nodeKind: "implementation",
          assignedRole: "implementation_engineer",
          metadata: {
            nodeExecutionContract: {
              contractKind: "node_execution_contract",
              schemaVersion: "execution-platform.node-execution-contract.v1",
              executionIntent: "source_edit",
              capabilityId: "implementation_microtask",
            },
            rawPromptStored: false,
            rawResponseStored: false,
          },
        }),
      ).rejects.toThrow(/metadata manifest violation/u);

      await expect(
        graphs.addNode({
          graphId: "graph-manifest-only-node-metadata",
          nodeId: "work-intent-with-requirement-body",
          nodeKind: "work_intent",
          assignedRole: "planning_orchestrator",
          metadata: {
            resourceRequirementPacket: {
              artifactKind: "resource_requirement_packet",
              resourceRequirementRef:
                "runtime-job://job/runtime-work-graph/graph/resource-requirement/node/abc",
              semanticQuestions: ["Which files should this consumer inspect?"],
            },
            rawPromptStored: false,
            rawResponseStored: false,
          },
        }),
      ).rejects.toThrow(/metadata manifest violation/u);

      const node = await graphs.addNode({
        graphId: "graph-manifest-only-node-metadata",
        nodeId: "implementation-with-manifest",
        nodeKind: "implementation",
        assignedRole: "implementation_engineer",
        metadata: {
          nodeReadinessStateRef:
            "runtime-work-graph://node-readiness-state/implementation-with-manifest/abc",
          nodeExecutionContractRef:
            "runtime-work-graph://node-execution-contract/implementation-with-manifest/abc",
          nodeExecutionContract: {
            contractRef:
              "runtime-work-graph://node-execution-contract/implementation-with-manifest/abc",
            contractVersion: "execution-platform.node-execution-contract.v1",
            contractHash: "sha256:contract",
            byteCount: 2048,
            boundedSummary: "source_edit implementation_microtask contract manifest",
            executionIntent: "source_edit",
            capabilityId: "implementation_microtask",
            executorKey: "kind:implementation",
            workerRef: "openrouter://moonshotai/kimi-k2.6",
            evidenceMode: ["changed_file_evidence"],
            domainResourcePacketKind: "coding_resource_packet",
            nodeExecutionPacketRequired: true,
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
            rawToolLogStored: false,
            rawCommandLogStored: false,
            rawDbRowsStored: false,
            secretsStored: false,
          },
          nodeExecutionPacketRef:
            "runtime-work-graph://node-execution-packet/implementation-with-manifest/abc",
          resourcePacketRef:
            "runtime-work-graph://coding-resource-packet/implementation-with-manifest/abc",
          resourceRequirement: {
            resourceRequirementRef:
              "runtime-job://job/runtime-work-graph/graph/resource-requirement/node/abc",
            resourceRequirementId: "abc",
            resourceRequirementHash: "sha256:req",
            schemaVersion: "execution-platform.resource-requirement-packet.v1",
            runtimeJobId: "job",
            workflowId: "agent_team.coding",
            graphId: "graph-manifest-only-node-metadata",
            consumerBranchId: "implementation-with-manifest",
            consumerNodeId: "implementation-with-manifest",
            workIntentRef: "runtime-work-graph://node/implementation-with-manifest",
            sourceCommitmentIds: ["C-1"],
            contextPurpose: "consumer_scoped_resource_handoff",
            semanticQuestionCount: 1,
            semanticQuestionSample: ["Which files should this consumer inspect?"],
            requiredResourceKinds: ["resource_handoff"],
            downstreamCapabilityId: "implementation_microtask",
            downstreamExecutionIntent: "source_edit",
            downstreamEvidenceMode: ["changed_file_evidence"],
            candidateRepoAreaRefCount: 1,
            knownTargetRefCount: 1,
            knownValidationNeedRefCount: 1,
            sourceContextBrokerRequestRef:
              "runtime-job://job/runtime-work-graph/graph/context-broker/request/abc",
            byteCount: 1024,
            reasonCodes: ["resource_requirement_packet_compiled"],
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
            rawToolLogStored: false,
          },
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });

      expect(node.metadata).toMatchObject({
        nodeReadinessStateRef:
          "runtime-work-graph://node-readiness-state/implementation-with-manifest/abc",
      });

      const summarized = await graphs.addNode({
        graphId: "graph-manifest-only-node-metadata",
        nodeId: "implementation-with-resource-summary",
        nodeKind: "implementation",
        assignedRole: "implementation_engineer",
        metadata: {
          implementationResourceMaterializationInputCounts: {
            targetFileSnapshotCount: 2,
            resolvedTargetFileRefCount: 2,
            validationCommandRefCount: 1,
          },
          implementationResourceMaterializationOutputCounts: {
            targetFileSnapshotCount: 2,
            implementationTaskPacketCount: 1,
          },
          implementationResourceMaterializationMaxBounds: {
            targetFileSnapshotMax: 120,
            validationCommandRefMax: 40,
          },
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });

      expect(summarized.metadata).toMatchObject({
        implementationResourceMaterializationInputCounts: {
          targetFileSnapshotCount: 2,
        },
      });
    });
  });

  it("accepts large arrays of bounded context snapshot refs in graph metadata", async () => {
    await withGraphRepository(async ({ graphs }) => {
      await graphs.createGraph({
        graphId: "graph-context-snapshot-ref-array",
        workflowId: "agent_team.coding",
        orchestratorModelRef: "openai-codex/gpt-5.5",
      });

      const node = await graphs.addNode({
        graphId: "graph-context-snapshot-ref-array",
        nodeId: "implementation-with-many-snapshot-refs",
        nodeKind: "implementation",
        assignedRole: "implementation_engineer",
        metadata: {
          providedContextSnapshotRefs: Array.from({ length: 24 }, (_, index) =>
            createContextSnapshotRef({
              sourceRef: `resource-handoff://large-graph/${index}`,
              sourceKind: "resource_scout_handoff",
              capturedAt: "2026-05-22T00:00:00.000Z",
              graphId: "graph-context-snapshot-ref-array",
              nodeId: "implementation-with-many-snapshot-refs",
              targetRefs: [`extensions/execution-platform/src/fixture-${index}.ts`],
              scopeSummary: "Bounded context snapshot ref, not embedded context body.",
              freshnessStatus: "fresh",
              refreshRequired: false,
              refreshAction: "none",
            }),
          ),
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });

      expect(
        Array.isArray((node.metadata as Record<string, unknown>).providedContextSnapshotRefs),
      ).toBe(true);
    });
  });

  it("stores artifact manifests as refs and hashes", async () => {
    await withGraphRepository(async ({ graphs }) => {
      await graphs.createGraph({
        graphId: "graph-manifest",
        workflowId: "agent_team.coding",
        orchestratorModelRef: "openai-codex/gpt-5.5",
      });
      const manifest = await graphs.recordArtifactManifest({
        graphId: "graph-manifest",
        manifestId: "manifest-1",
        artifactType: "validation_summary",
        storageRef: "artifact://validation-summary",
        contentHash: "sha256:abc",
        byteCount: 128,
        boundedSummary: "Validation summary ref, not raw logs.",
      });

      expect(manifest.rawContentStored).toBe(false);
      expect(manifest.storageRef).toBe("artifact://validation-summary");
    });
  });
});
